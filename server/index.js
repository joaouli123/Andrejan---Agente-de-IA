/**
 * Servidor Express - API RAG
 * Endpoints para busca semântica e upload de documentos
 */

import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

import { ragQuery, searchOnly, getRecentRagTelemetry, clearRagTelemetry } from './services/ragService.js';
import { initializeChroma, getStats, clearCollection, addDocuments, hasSource, getIndexedSources, isLoading, getLoadingProgress, compactStore, removeSources } from './services/vectorStoreAdapter.js';
import { extractTextFromPDF, extractTextWithOCR, splitTextIntoChunks, terminateOCR } from './services/pdfExtractor.js';
import { generateEmbeddings } from './services/embeddingService.js';
import rateLimit from 'express-rate-limit';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

// Prevent server from crashing on unhandled errors (e.g. Tesseract worker postMessage after terminate)
process.on('uncaughtException', (err) => {
  console.error('⚠️ Uncaught Exception (servidor mantido ativo):', err.message);
});
process.on('unhandledRejection', (reason) => {
  console.error('⚠️ Unhandled Rejection (servidor mantido ativo):', reason);
});

const app = express();
const PORT = process.env.PORT || 3002;
const PDF_DIR = process.env.PDF_PATH || path.join(__dirname, 'data', 'pdfs');
const FRONTEND_BASE_URL = (process.env.FRONTEND_BASE_URL || 'https://elevex.uxcodedev.com.br').replace(/\/+$/, '');
const MP_ACCESS_TOKEN = (process.env.MERCADO_PAGO_ACCESS_TOKEN || '').trim();

const SUBSCRIPTION_PLANS = {
  free: { id: 'free', title: 'Plano Free', price: 0, planName: 'Free' },
  iniciante: { id: 'iniciante', title: 'Plano Iniciante', price: 9.99, planName: 'Iniciante' },
  profissional: { id: 'profissional', title: 'Plano Profissional', price: 19.99, planName: 'Profissional' },
  empresa: { id: 'empresa', title: 'Plano Empresa', price: 99.99, planName: 'Empresa' },
};

function listPdfFilesRecursive(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      results.push(...listPdfFilesRecursive(full));
    } else if (ent.isFile() && ent.name.toLowerCase().endsWith('.pdf')) {
      results.push(full);
    }
  }
  return results;
}

function getOriginalNameFromDiskFilename(filename) {
  // Multer salva como "timestamp-random-originalname.pdf"
  return filename.replace(/^\d+-\d+-/, '');
}

// ═══ AUTO-DETECÇÃO DE MARCA A PARTIR DO NOME DO ARQUIVO ═══
const BRAND_FILE_RULES = [
  { canonical: 'Otis',       patterns: [/\botis\b/i, /\bgen\s*2\b/i, /\bgecb\b/i, /\blcb\s*i{0,2}\b/i, /\bmcss\b/i] },
  { canonical: 'Orona',      patterns: [/\borona\b/i, /\barca\b/i] },
  { canonical: 'Schindler',  patterns: [/\bschindler\b/i, /\b(3300|5500|7000)\b/] },
  { canonical: 'Sectron',    patterns: [/\bsectron\b/i, /\badv[\s-]*\d+/i] },
  { canonical: 'Thyssen',    patterns: [/\bthyssen\b/i, /\btke?\b/i] },
  { canonical: 'Atlas',      patterns: [/\batlas\b/i] },
];

function detectBrandFromFilename(filename) {
  const name = String(filename || '');
  for (const rule of BRAND_FILE_RULES) {
    if (rule.patterns.some(p => p.test(name))) return rule.canonical;
  }
  return null;
}

function detectBrandFromFolderPath(fullPath, baseDir) {
  const rel = path.relative(baseDir, fullPath);
  const parts = rel.split(/[\\/]/);
  for (const part of parts) {
    const brand = detectBrandFromFilename(part);
    if (brand) return brand;
  }
  return null;
}

function autoBrandForFile(fullPath, baseDir, explicitBrand) {
  if (explicitBrand) return explicitBrand;
  const fromFolder = detectBrandFromFolderPath(fullPath, baseDir);
  if (fromFolder) return fromFolder;
  const originalName = getOriginalNameFromDiskFilename(path.basename(fullPath));
  return detectBrandFromFilename(originalName);
}

// --- SEGURANÇA ---

// CORS restrito a origens permitidas
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://localhost:5173,https://elevex.uxcodedev.com.br').split(',');
app.use(cors({
  origin: (origin, callback) => {
    // Permite requests sem origin (Postman, curl, server-to-server)
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Bloqueado pelo CORS'));
    }
  },
  credentials: true
}));
app.use(express.json({ limit: '1mb' }));

// API Key middleware
const SERVER_API_KEY = process.env.API_KEY || '';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';

function authMiddleware(req, res, next) {
  if (!SERVER_API_KEY) return next();
  const key = req.headers['x-api-key'] || (req.headers.authorization || '').replace('Bearer ', '');
  if (key === SERVER_API_KEY || key === ADMIN_API_KEY) {
    next();
  } else {
    res.status(401).json({ error: 'API key inválida' });
  }
}

function adminMiddleware(req, res, next) {
  if (!ADMIN_API_KEY) return next();
  const key = req.headers['x-api-key'] || (req.headers.authorization || '').replace('Bearer ', '');
  if (key === ADMIN_API_KEY) {
    next();
  } else {
    res.status(403).json({ error: 'Acesso administrativo necessário' });
  }
}

// Rate limiting
const queryLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Muitas requisições. Tente novamente em 1 minuto.' },
  standardHeaders: true,
  legacyHeaders: false
});

const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: { error: 'Muitos uploads. Aguarde 1 minuto.' },
  standardHeaders: true,
  legacyHeaders: false
});

// Configuração do Multer para upload de arquivos
// PDFs são salvos na raiz de PDF_DIR. A marca é detectada automaticamente
// durante o processamento (autoBrandForFile) e salva como metadado nos chunks.
// Para organizar em pastas: POST /api/organize-pdfs ou node scripts/setupFolders.js
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!fs.existsSync(PDF_DIR)) {
      fs.mkdirSync(PDF_DIR, { recursive: true });
    }
    cb(null, PDF_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Apenas arquivos PDF são permitidos!'), false);
    }
  },
  limits: { fileSize: 500 * 1024 * 1024 } // 500MB max — suporta PDFs de até 1000 páginas
});

// ==================== ROTAS ====================

// Mapa de tarefas de processamento em background
const processingTasks = new Map();

/**
 * Health check
 */
app.get('/api/health', (req, res) => {
  const loading = isLoading();
  res.json({ 
    status: loading ? 'loading' : 'ok', 
    service: 'Elevex RAG API',
    loading,
    loadingProgress: loading ? getLoadingProgress() : undefined
  });
});

/**
 * Estatísticas do banco de vetores
 */
app.get('/api/stats', authMiddleware, async (req, res) => {
  try {
    const stats = await getStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Diagnóstico de metadados de marca nos documentos indexados
 * Mostra quantos chunks de cada marca existem e se têm brandName definido
 */
app.get('/api/brand-diagnosis', adminMiddleware, async (req, res) => {
  try {
    const sources = await getIndexedSources();
    const brandMap = {};
    let withBrand = 0;
    let withoutBrand = 0;

    for (const source of sources) {
      const detected = detectBrandFromFilename(source) || detectBrandFromFilename(getOriginalNameFromDiskFilename(source));
      const label = detected || '(sem marca)';
      if (!brandMap[label]) brandMap[label] = [];
      brandMap[label].push(source);
    }

    const stats = await getStats();

    res.json({
      totalDocuments: stats.totalDocuments,
      totalSources: sources.length,
      brandBreakdown: Object.fromEntries(
        Object.entries(brandMap).map(([brand, srcs]) => [brand, { count: srcs.length, sources: srcs }])
      ),
      tip: 'Para re-indexar com metadados de marca: POST /api/reindex ou execute scripts/reindexWithBrands.js',
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Organiza PDFs soltos na raiz de /pdfs/ em subpastas por marca.
 * PDFs em pdfs/Orona_arca.pdf → pdfs/Orona/Orona_arca.pdf
 * POST body: { dryRun?: boolean }
 */
app.post('/api/organize-pdfs', adminMiddleware, async (req, res) => {
  try {
    const dryRun = Boolean(req.body?.dryRun);
    const brands = ['Otis', 'Orona', 'Schindler', 'Sectron', 'ThyssenKrupp', 'Atlas'];

    // Cria pastas
    if (!dryRun) {
      for (const brand of brands) {
        const dir = path.join(PDF_DIR, brand);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      }
      const unknownDir = path.join(PDF_DIR, '_sem_marca');
      if (!fs.existsSync(unknownDir)) fs.mkdirSync(unknownDir, { recursive: true });
    }

    // Lista PDFs soltos na raiz
    const rootFiles = fs.existsSync(PDF_DIR)
      ? fs.readdirSync(PDF_DIR, { withFileTypes: true })
          .filter(e => e.isFile() && e.name.toLowerCase().endsWith('.pdf'))
          .map(e => e.name)
      : [];

    const moves = [];
    for (const filename of rootFiles) {
      const brand = detectBrandFromFilename(filename)
        || detectBrandFromFilename(getOriginalNameFromDiskFilename(filename));
      const targetDir = brand || '_sem_marca';
      
      if (!dryRun) {
        const src = path.join(PDF_DIR, filename);
        const dst = path.join(PDF_DIR, targetDir, filename);
        if (!fs.existsSync(dst)) {
          fs.renameSync(src, dst);
        }
      }
      moves.push({ file: filename, brand: brand || null, target: targetDir });
    }

    // Conta por pasta
    const folderCounts = {};
    for (const brand of [...brands, '_sem_marca']) {
      const dir = path.join(PDF_DIR, brand);
      if (fs.existsSync(dir)) {
        folderCounts[brand] = listPdfFilesRecursive(dir).length;
      }
    }

    res.json({
      success: true,
      dryRun,
      movedCount: moves.length,
      moves,
      folderCounts,
      nextStep: 'POST /api/reindex para re-indexar com metadados de marca',
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Diagnóstico de configuração de pagamentos (público, sem auth)
 */
app.get('/api/payments/config-check', (req, res) => {
  res.json({
    mercadoPagoConfigured: !!MP_ACCESS_TOKEN,
    frontendBaseUrl: FRONTEND_BASE_URL,
    plans: Object.keys(SUBSCRIPTION_PLANS),
  });
});

/**
 * Cria preferência de checkout Mercado Pago
 * Não exige authMiddleware — o próprio endpoint valida apenas dados do pagador.
 * Isso permite que novos usuários (sem API key no frontend) consigam pagar.
 */
app.post('/api/payments/create-preference', async (req, res) => {
  try {
    if (!MP_ACCESS_TOKEN) {
      console.error('[MP] MERCADO_PAGO_ACCESS_TOKEN não configurado no .env do servidor');
      return res.status(500).json({ error: 'Mercado Pago não configurado no servidor. Configure MERCADO_PAGO_ACCESS_TOKEN no .env.' });
    }

    const { planId, payerName, payerEmail, userId } = req.body || {};
    const normalizedPlanId = String(planId || '').toLowerCase();
    const plan = SUBSCRIPTION_PLANS[normalizedPlanId];

    if (!plan || !plan.price) {
      console.warn(`[MP] Plano inválido recebido: "${planId}"`);
      return res.status(400).json({ error: `Plano inválido: "${planId}". Planos válidos: ${Object.keys(SUBSCRIPTION_PLANS).filter(k => SUBSCRIPTION_PLANS[k].price > 0).join(', ')}` });
    }

    if (!payerName || !payerEmail) {
      return res.status(400).json({ error: 'Nome e email do pagador são obrigatórios' });
    }

    const externalReference = `${String(userId || 'anon')}|${plan.id}|${Date.now()}`;

    const payload = {
      items: [
        {
          id: plan.id,
          title: plan.title,
          description: `Assinatura mensal — ${plan.planName}`,
          quantity: 1,
          unit_price: Number(plan.price),
          currency_id: 'BRL',
        },
      ],
      payer: {
        name: String(payerName).split(' ')[0].slice(0, 120),
        surname: String(payerName).split(' ').slice(1).join(' ').slice(0, 120) || '',
        email: String(payerEmail).trim().slice(0, 180),
      },
      external_reference: externalReference,
      back_urls: {
        success: `${FRONTEND_BASE_URL}/confirmacao?payment_status=approved`,
        pending: `${FRONTEND_BASE_URL}/confirmacao?payment_status=pending`,
        failure: `${FRONTEND_BASE_URL}/confirmacao?payment_status=rejected`,
      },
      auto_return: 'approved',
      statement_descriptor: 'ELEVEX',
      metadata: {
        plan_id: plan.id,
        plan_name: plan.planName,
        user_id: String(userId || ''),
      },
    };

    console.log(`[MP] Criando preferência: plano=${plan.id}, email=${payerEmail}, ref=${externalReference}`);

    const response = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
      },
      body: JSON.stringify(payload),
    });

    const rawText = await response.text();
    let data;
    try {
      data = JSON.parse(rawText);
    } catch {
      console.error(`[MP] Resposta não-JSON do Mercado Pago (HTTP ${response.status}):`, rawText.slice(0, 500));
      return res.status(502).json({ error: 'Resposta inválida do Mercado Pago. Verifique o Access Token.' });
    }

    if (!response.ok) {
      console.error(`[MP] Erro HTTP ${response.status} do Mercado Pago:`, JSON.stringify(data, null, 2));
      const mpError = data?.message || data?.error || data?.cause?.[0]?.description || 'Falha ao criar checkout';
      return res.status(502).json({ error: `Mercado Pago: ${mpError}` });
    }

    console.log(`[MP] Preferência criada com sucesso: id=${data.id}`);

    return res.json({
      preferenceId: data.id,
      initPoint: data.init_point,
      sandboxInitPoint: data.sandbox_init_point,
    });
  } catch (error) {
    console.error('[MP] Exceção ao criar preferência:', error);
    return res.status(500).json({ error: error.message || 'Erro interno ao criar preferência de pagamento' });
  }
});

/**
 * Verifica status de pagamento no Mercado Pago
 * Sem authMiddleware — precisa funcionar no redirect de volta do MP
 */
app.get('/api/payments/verify', async (req, res) => {
  try {
    if (!MP_ACCESS_TOKEN) {
      return res.status(500).json({ error: 'Mercado Pago não configurado no servidor' });
    }

    const paymentId = String(req.query.paymentId || '').trim();
    if (!paymentId) {
      return res.status(400).json({ error: 'paymentId é obrigatório' });
    }

    console.log(`[MP] Verificando pagamento: ${paymentId}`);

    const response = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
      },
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error(`[MP] Erro ao verificar pagamento ${paymentId}:`, JSON.stringify(data));
      return res.status(502).json({ error: data?.message || data?.error || 'Falha ao verificar pagamento' });
    }

    const status = String(data?.status || '').toLowerCase();
    const normalizedStatus = status === 'approved' ? 'approved' : status === 'pending' || status === 'in_process' ? 'pending' : 'rejected';

    console.log(`[MP] Pagamento ${paymentId}: status=${normalizedStatus}`);

    return res.json({
      status: normalizedStatus,
      paymentId,
      externalReference: data?.external_reference || null,
    });
  } catch (error) {
    console.error(`[MP] Exceção ao verificar pagamento:`, error);
    return res.status(500).json({ error: error.message || 'Erro ao verificar pagamento' });
  }
});

// ═══════════════════════════════════════════════════════════════
// ═══  CHECKOUT TRANSPARENTE — Pagamento inline (sem redirect) ═══
// ═══════════════════════════════════════════════════════════════

/**
 * Processar pagamento com cartão (Checkout Transparente)
 * Recebe token do cartão (criado pelo SDK JS no frontend) e cria o pagamento.
 */
app.post('/api/payments/process-card', async (req, res) => {
  try {
    if (!MP_ACCESS_TOKEN) {
      return res.status(500).json({ error: 'Mercado Pago não configurado no servidor' });
    }

    const { token, payment_method_id, installments, transaction_amount, description, payer, planId, userId } = req.body;

    if (!token || !payment_method_id || !transaction_amount || !payer?.email) {
      return res.status(400).json({ error: 'Dados do pagamento incompletos (token, payment_method_id, amount, email)' });
    }

    const normalizedPlanId = String(planId || '').toLowerCase();
    const plan = SUBSCRIPTION_PLANS[normalizedPlanId];
    const externalReference = `${String(userId || 'anon')}|${normalizedPlanId}|${Date.now()}`;

    const payload = {
      transaction_amount: Number(transaction_amount),
      token,
      description: description || `Assinatura ${plan?.planName || normalizedPlanId} — Elevex`,
      installments: Number(installments) || 1,
      payment_method_id,
      statement_descriptor: 'ELEVEX',
      external_reference: externalReference,
      payer: {
        email: String(payer.email).trim(),
        first_name: String(payer.first_name || '').slice(0, 120),
        last_name: String(payer.last_name || '').slice(0, 120),
        identification: payer.identification || undefined,
      },
      metadata: {
        plan_id: normalizedPlanId,
        plan_name: plan?.planName || '',
        user_id: String(userId || ''),
      },
    };

    console.log(`[MP] Checkout Transparente - Cartão: plan=${normalizedPlanId}, email=${payer.email}`);

    const response = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
        'X-Idempotency-Key': `card-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.error(`[MP] Erro ao processar cartão (HTTP ${response.status}):`, JSON.stringify(data));
      const mpError = data?.message || data?.cause?.[0]?.description || 'Falha ao processar pagamento';
      return res.status(402).json({
        error: mpError,
        status: data?.status || 'rejected',
        status_detail: data?.status_detail || 'cc_rejected_other_reason',
      });
    }

    const status = String(data.status || '').toLowerCase();
    const normalizedStatus = status === 'approved' ? 'approved' :
                              status === 'pending' || status === 'in_process' ? 'pending' : 'rejected';

    console.log(`[MP] Pagamento cartão: id=${data.id}, status=${normalizedStatus}, detail=${data.status_detail}`);

    return res.json({
      status: normalizedStatus,
      paymentId: String(data.id),
      statusDetail: data.status_detail || '',
      externalReference: data.external_reference,
    });
  } catch (error) {
    console.error('[MP] Exceção ao processar cartão:', error);
    return res.status(500).json({ error: error.message || 'Erro interno ao processar cartão' });
  }
});

/**
 * Processar pagamento PIX (Checkout Transparente)
 * Cria pagamento PIX e retorna QR Code para o comprador.
 */
app.post('/api/payments/process-pix', async (req, res) => {
  try {
    if (!MP_ACCESS_TOKEN) {
      return res.status(500).json({ error: 'Mercado Pago não configurado no servidor' });
    }

    const { transaction_amount, description, payer, planId, userId } = req.body;

    if (!transaction_amount || !payer?.email) {
      return res.status(400).json({ error: 'Dados do pagamento incompletos (amount, email)' });
    }

    const normalizedPlanId = String(planId || '').toLowerCase();
    const plan = SUBSCRIPTION_PLANS[normalizedPlanId];
    const externalReference = `${String(userId || 'anon')}|${normalizedPlanId}|${Date.now()}`;

    const payload = {
      transaction_amount: Number(transaction_amount),
      description: description || `Assinatura ${plan?.planName || normalizedPlanId} — Elevex`,
      payment_method_id: 'pix',
      statement_descriptor: 'ELEVEX',
      external_reference: externalReference,
      payer: {
        email: String(payer.email).trim(),
        first_name: String(payer.first_name || '').slice(0, 120),
        last_name: String(payer.last_name || '').slice(0, 120),
        identification: payer.identification || undefined,
      },
      metadata: {
        plan_id: normalizedPlanId,
        plan_name: plan?.planName || '',
        user_id: String(userId || ''),
      },
    };

    console.log(`[MP] Checkout Transparente - PIX: plan=${normalizedPlanId}, email=${payer.email}`);

    const response = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
        'X-Idempotency-Key': `pix-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.error(`[MP] Erro ao processar PIX (HTTP ${response.status}):`, JSON.stringify(data));
      const mpError = data?.message || data?.cause?.[0]?.description || 'Falha ao gerar PIX';
      return res.status(502).json({ error: mpError });
    }

    const pixTxData = data.point_of_interaction?.transaction_data || {};

    console.log(`[MP] PIX gerado: id=${data.id}, status=${data.status}`);

    return res.json({
      status: data.status,
      paymentId: String(data.id),
      qrCode: pixTxData.qr_code || '',
      qrCodeBase64: pixTxData.qr_code_base64 || '',
      ticketUrl: pixTxData.ticket_url || '',
      expirationDate: data.date_of_expiration || '',
      externalReference: data.external_reference,
    });
  } catch (error) {
    console.error('[MP] Exceção ao processar PIX:', error);
    return res.status(500).json({ error: error.message || 'Erro interno ao gerar PIX' });
  }
});

/**
 * Consultar parcelas disponíveis para um cartão (Checkout Transparente)
 */
app.get('/api/payments/installments', async (req, res) => {
  try {
    if (!MP_ACCESS_TOKEN) {
      return res.status(500).json({ error: 'Mercado Pago não configurado' });
    }

    const { bin, amount } = req.query;
    if (!bin || !amount) {
      return res.status(400).json({ error: 'bin e amount são obrigatórios' });
    }

    const response = await fetch(
      `https://api.mercadopago.com/v1/payment_methods/installments?bin=${encodeURIComponent(bin)}&amount=${encodeURIComponent(amount)}`,
      { headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` } }
    );

    const data = await response.json().catch(() => []);
    return res.json(data);
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Erro ao buscar parcelas' });
  }
});

/**
 * Retorna a Public Key do MP para o frontend inicializar o SDK
 */
app.get('/api/payments/public-key', (req, res) => {
  const publicKey = (process.env.MERCADO_PAGO_PUBLIC_KEY || '').trim();
  if (!publicKey) {
    return res.status(500).json({ error: 'MERCADO_PAGO_PUBLIC_KEY não configurada no servidor' });
  }
  return res.json({ publicKey });
});

/**
 * Telemetria recente do RAG (admin)
 */
app.get('/api/telemetry/rag', adminMiddleware, (req, res) => {
  try {
    const limit = Math.max(1, Math.min(500, parseInt(req.query.limit || '100', 10)));
    const entries = getRecentRagTelemetry(limit);
    res.json({ count: entries.length, entries });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Limpa telemetria em memória do RAG (admin)
 */
app.delete('/api/telemetry/rag', adminMiddleware, (req, res) => {
  try {
    clearRagTelemetry();
    res.json({ success: true, message: 'Telemetria RAG limpa' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Lista PDFs disponíveis
 */
app.get('/api/documents', authMiddleware, (req, res) => {
  try {
    const diskFiles = listPdfFilesRecursive(PDF_DIR);
    const files = diskFiles.map(fullPath => {
      const relPath = path.relative(PDF_DIR, fullPath);
      const diskName = path.basename(fullPath);
      const originalName = getOriginalNameFromDiskFilename(diskName);
      return {
        name: diskName,
        originalName,
        relativePath: relPath,
        path: fullPath,
        size: fs.statSync(fullPath).size,
        uploadedAt: fs.statSync(fullPath).mtime
      };
    });
    res.json(files);
  } catch (error) {
    res.json([]);
  }
});

/**
 * Verifica se um arquivo existe no disco (por nome original, ignora prefixo timestamp do multer)
 */
function fileExistsOnDisk(originalName, excludeFilename = null) {
  try {
    if (!fs.existsSync(PDF_DIR)) return false;
    const normalizedName = originalName.toLowerCase().replace(/[^a-z0-9.-]/g, '');
    const files = listPdfFilesRecursive(PDF_DIR).map(p => path.basename(p));
    return files.some(f => {
      // Ignorar o próprio arquivo recém-salvo pelo multer
      if (excludeFilename && f === excludeFilename) return false;
      // Multer salva como "timestamp-random-originalname.pdf"
      const fLower = f.toLowerCase().replace(/[^a-z0-9.-]/g, '');
      return fLower === normalizedName || fLower.endsWith(normalizedName);
    });
  } catch { return false; }
}

/**
 * Reindexa PDFs já existentes no disco (sem precisar reupload)
 * Body: { includeRegex?: string, brandName?: string, dryRun?: boolean }
 */
app.post('/api/reindex', adminMiddleware, async (req, res) => {
  try {
    if (isLoading()) {
      return res.status(409).json({ error: `Vector store ainda carregando (${getLoadingProgress()})` });
    }

    const includeRegex = (req.body?.includeRegex || '').toString().trim();
    const brandName = (req.body?.brandName || null);
    const dryRun = Boolean(req.body?.dryRun);

    const pattern = includeRegex ? new RegExp(includeRegex, 'i') : null;
    const diskFiles = listPdfFilesRecursive(PDF_DIR);
    const matched = pattern
      ? diskFiles.filter(p => pattern.test(path.basename(p)) || pattern.test(path.relative(PDF_DIR, p)))
      : diskFiles;

    if (matched.length === 0) {
      return res.json({ success: true, matched: 0, message: 'Nenhum PDF correspondeu ao filtro.' });
    }

    const sourcesToReindex = matched.map(p => getOriginalNameFromDiskFilename(path.basename(p)));

    if (dryRun) {
      return res.json({
        success: true,
        dryRun: true,
        matched: matched.length,
        sources: sourcesToReindex,
      });
    }

    console.log(`🔁 Reindex: ${matched.length} PDFs (regex=${includeRegex || 'ALL'})`);

    // 1) Remove chunks antigos dessas fontes
    const removal = await removeSources(sourcesToReindex);
    console.log(`🧹 Removidos ${removal.removed} chunks antigos; restantes ${removal.remaining}`);

    // 2) Reprocessa PDFs e adiciona novamente
    let totalChunks = 0;
    for (const fullPath of matched) {
      const diskName = path.basename(fullPath);
      const originalName = getOriginalNameFromDiskFilename(diskName);

      console.log(`📄 Reindexando: ${originalName}`);
      const extracted = await extractTextWithOCR(fullPath);
      
      // Auto-detecção de marca: usa brandName explícito OU detecta pelo nome/pasta
      const effectiveBrand = autoBrandForFile(fullPath, PDF_DIR, brandName);
      if (effectiveBrand) console.log(`   🏷️  Marca: ${effectiveBrand}`);
      
      const chunks = splitTextIntoChunks(extracted.text, {
        source: originalName,
        filePath: fullPath,
        numPages: extracted.numPages,
        title: extracted.info?.Title || originalName.replace('.pdf', ''),
        brandName: effectiveBrand,
        reindexedAt: new Date().toISOString(),
        ocrUsed: extracted.ocrUsed || false,
      });

      const texts = chunks.map(c => c.content);
      const embeddings = await generateEmbeddings(texts);

      const validChunks = [];
      const validEmbeddings = [];
      for (let i = 0; i < chunks.length; i++) {
        if (embeddings[i]) {
          validChunks.push(chunks[i]);
          validEmbeddings.push(embeddings[i]);
        }
      }

      await addDocuments(validChunks, validEmbeddings);
      totalChunks += validChunks.length;
    }

    return res.json({
      success: true,
      matched: matched.length,
      removedChunks: removal.removed,
      addedChunks: totalChunks,
    });
  } catch (e) {
    console.error('Erro no reindex:', e);
    return res.status(500).json({ error: e.message });
  }
});

/**
 * Verifica quais arquivos já estão indexados (para skip de duplicatas)
 * Verifica tanto no vector store quanto no disco
 */
app.post('/api/check-duplicates', adminMiddleware, async (req, res) => {
  try {
    const { fileNames } = req.body;
    if (!fileNames || !Array.isArray(fileNames)) {
      return res.status(400).json({ error: 'fileNames deve ser um array' });
    }
    const loading = isLoading();
    const results = await Promise.all(fileNames.map(async (name) => {
      // Fonte de verdade: vector store.
      // Não usar disco para "já indexado", pois pode haver PDFs antigos após reset do índice.
      const inVectorStore = !loading ? await hasSource(name) : false;
      return {
        name,
        exists: inVectorStore,
        inVectorStore,
      };
    }));
    const duplicates = results.filter(r => r.exists).map(r => r.name);
    const newFiles = results.filter(r => !r.exists).map(r => r.name);
    res.json({ duplicates, newFiles, total: fileNames.length, loading });
  } catch (error) {
    console.error('Erro ao verificar duplicatas:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Upload de novo PDF (responde imediatamente, processa em background)
 */
app.post('/api/upload', adminMiddleware, uploadLimiter, upload.single('pdf'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Nenhum arquivo enviado' });
  }

  const originalName = req.file.originalname;

  // Verificação server-side: se o arquivo já foi indexado, pula
  // Exclui o arquivo recém-salvo pelo multer para não dar falso positivo
  const uploadedFilename = path.basename(req.file.path);
  const alreadyInVectorStore = !isLoading() ? await hasSource(originalName) : false;
  if (alreadyInVectorStore) {
    // Remove o arquivo enviado pois já existe
    try { fs.unlinkSync(req.file.path); } catch {}
    console.log(`⏭️ Arquivo já indexado, ignorado: ${originalName}`);
    return res.json({ 
      success: true, 
      skipped: true, 
      message: `Arquivo "${originalName}" já está indexado. Upload ignorado.`
    });
  }

  const taskId = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
  const filePath = req.file.path;
  const brandName = req.body.brandName || null;

  // Cria tarefa
  processingTasks.set(taskId, {
    status: 'extracting',
    filename: originalName,
    message: 'Extraindo texto do PDF...',
    progress: 5,
    pages: 0,
    chunks: 0,
    startedAt: Date.now()
  });

  // Responde IMEDIATAMENTE com o taskId
  res.json({ 
    success: true, 
    taskId,
    message: 'Upload recebido, processando em background...'
  });

  // Processa em background (não bloqueia a resposta HTTP)
  processUploadInBackground(taskId, filePath, originalName, brandName);
});

/**
 * Processa PDF em background
 */
async function processUploadInBackground(taskId, filePath, originalName, brandName = null) {
  const task = processingTasks.get(taskId);
  try {
    console.log(`📄 [${taskId}] Processando: ${originalName}`);
    
    // Fase 1: Extrair texto (com OCR automático para scans/imagens)
    task.status = 'extracting';
    task.message = 'Extraindo texto do PDF (OCR em imagens/circuitos pode demorar)...';
    task.progress = 10;
    
    let extracted;
    try {
      // Safety net — OCR interno tem seu próprio timeout de 30min com resultados parciais
      // Este timeout externo é apenas proteção final contra travamentos
      // Mínimo 45min — env vars antigas com 180s causavam falha em PDFs grandes
      const envTimeout = Number.parseInt(process.env.UPLOAD_EXTRACT_TIMEOUT_MS || '', 10);
      const extractTimeoutMs = (Number.isFinite(envTimeout) && envTimeout >= 2700000) ? envTimeout : 2700000; // 45min mínimo

      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`Timeout na extração após ${Math.round(extractTimeoutMs / 1000)}s`)), extractTimeoutMs);
      });

      extracted = await Promise.race([extractTextWithOCR(filePath, (progress) => {
        if (progress.phase === 'ocr_start') {
          task.message = '🔍 PDF com imagens detectado, iniciando OCR...';
          task.progress = 15;
        } else if (progress.phase === 'ocr') {
          task.message = `🔤 ${progress.message}`;
          const p = Number.isFinite(progress.progress) ? Number(progress.progress) : 0;
          task.progress = Math.max(15, Math.min(70, Math.round(15 + (p * 0.55))));
        } else if (progress.phase === 'text') {
          task.message = progress.message || 'Texto extraído normalmente';
          task.progress = 35;
        }
      }), timeoutPromise]);
    } catch (extractErr) {
      console.error(`   ❌ [${taskId}] Extração OCR falhou/timeout: ${extractErr.message}`);
      task.message = 'OCR falhou. Tentando extração sem OCR...';
      task.progress = 20;

      // Tenta fallback resiliente sem OCR
      try {
        await terminateOCR();
        const fallback = await extractTextFromPDF(filePath);
        extracted = {
          text: fallback.text || '',
          numPages: fallback.numPages || 0,
          info: fallback.info || {},
          metadata: fallback.metadata || {},
          ocrUsed: false,
          ocrChars: 0
        };

        if (!extracted.text || extracted.text.trim().length < 30) {
          throw new Error('fallback sem OCR também retornou pouco texto (PDF provavelmente é de imagem)');
        }

        task.message = 'Prosseguindo com texto extraído do PDF (sem OCR).';
        task.progress = 40;
      } catch (fallbackErr) {
        task.status = 'error';
        task.message = `Erro na extração: ${extractErr.message}. Fallback: ${fallbackErr.message}`;
        setTimeout(() => processingTasks.delete(taskId), 5 * 60 * 1000);
        return;
      }
    }
    
    if (!extracted.text || extracted.text.trim().length < 30) {
      task.status = 'error';
      task.message = `PDF sem conteúdo legível (${extracted.text?.length || 0} chars). Pode ser um PDF de imagem sem OCR ou arquivo corrompido.`;
      console.warn(`   ⚠️ [${taskId}] ${originalName}: texto insuficiente (${extracted.text?.length || 0} chars)`);
      setTimeout(() => processingTasks.delete(taskId), 5 * 60 * 1000);
      return;
    }
    
    task.pages = extracted.numPages;
    if (extracted.ocrUsed) {
      const partialNote = extracted.ocrPartial ? ' (parcial — timeout atingido)' : '';
      console.log(`   🔤 [${taskId}] OCR utilizado${partialNote}: +${extracted.ocrChars} chars de ${extracted.ocrPagesProcessed || '?'}/${extracted.numPages} páginas`);
      if (extracted.ocrPartial) {
        task.message = `OCR parcial: ${extracted.ocrPagesProcessed}/${extracted.numPages} páginas processadas (timeout). Prosseguindo com texto disponível...`;
      }
    }
    
    // Fase 2: Dividir em chunks
    const chunks = splitTextIntoChunks(extracted.text, {
      source: originalName,
      filePath: filePath,
      numPages: extracted.numPages,
      title: extracted.info?.Title || originalName.replace('.pdf', ''),
      brandName: autoBrandForFile(filePath, PDF_DIR, brandName),
      uploadedAt: new Date().toISOString()
    });
    
    if (chunks.length === 0) {
      task.status = 'error';
      task.message = 'Nenhum chunk gerado a partir do texto extraído.';
      setTimeout(() => processingTasks.delete(taskId), 5 * 60 * 1000);
      return;
    }
    
    task.chunks = chunks.length;
    task.status = 'embedding';
    task.progress = 72;
    task.message = `Gerando embeddings para ${chunks.length} chunks...`;
    
    // Fase 3: Gerar embeddings (a parte demorada)
    const texts = chunks.map(c => c.content);
    const embeddings = await generateEmbeddings(texts, (progress) => {
      task.progress = progress.percentage;
      task.message = `Gerando embeddings... ${progress.percentage}% (${progress.current}/${progress.total})`;
    });
    
    // Filtra válidos
    const validChunks = [];
    const validEmbeddings = [];
    for (let i = 0; i < chunks.length; i++) {
      if (embeddings[i]) {
        validChunks.push(chunks[i]);
        validEmbeddings.push(embeddings[i]);
      }
    }
    
    if (validChunks.length === 0) {
      task.status = 'error';
      task.message = 'Nenhum embedding gerado. Possível erro na API do Gemini.';
      setTimeout(() => processingTasks.delete(taskId), 5 * 60 * 1000);
      return;
    }
    
    // Fase 4: Salvar no banco de vetores
    task.status = 'saving';
    task.progress = 95;
    task.message = 'Salvando no banco de vetores...';
    await addDocuments(validChunks, validEmbeddings);
    
    // Concluído
    const elapsed = Math.round((Date.now() - task.startedAt) / 1000);
    task.status = 'done';
    task.progress = 100;
    task.message = `Concluído em ${elapsed}s! ${task.pages} páginas → ${validChunks.length} chunks indexados`;
    
    console.log(`✅ [${taskId}] ${originalName}: ${validChunks.length} chunks em ${elapsed}s`);
    
    // Limpa tarefa da memória após 5 min
    setTimeout(() => processingTasks.delete(taskId), 5 * 60 * 1000);
    
  } catch (error) {
    console.error(`❌ [${taskId}] Erro:`, error.message);
    task.status = 'error';
    task.message = `Erro: ${error.message}`;
    // Mantém o erro visível por 5 min
    setTimeout(() => processingTasks.delete(taskId), 5 * 60 * 1000);
  }
}

/**
 * Consultar status de processamento de upload
 */
app.get('/api/upload/status/:taskId', adminMiddleware, (req, res) => {
  const task = processingTasks.get(req.params.taskId);
  if (!task) {
    return res.json({ status: 'not_found', message: 'Tarefa não encontrada (pode ter expirado)' });
  }
  res.json(task);
});

/**
 * Busca RAG - Endpoint principal
 */
app.post('/api/query', authMiddleware, queryLimiter, async (req, res) => {
  const { question, systemInstruction, topK = 5, brandFilter = null, conversationHistory = [] } = req.body;
  
  if (!question) {
    return res.status(400).json({ error: 'Pergunta é obrigatória' });
  }

  // Validação de input
  if (typeof question !== 'string' || question.length > 2000) {
    return res.status(400).json({ error: 'Pergunta deve ser texto com no máximo 2000 caracteres' });
  }

  // Se ainda está carregando, retorna mensagem amigável
  if (isLoading()) {
    return res.json({
      answer: `⏳ A base de conhecimento está sendo carregada em segundo plano (${getLoadingProgress()}). Aguarde alguns instantes e tente novamente.`,
      sources: [],
      searchTime: 0
    });
  }
  
  try {
    console.log(`\n🔍 Query: "${question.substring(0, 50)}..."${brandFilter ? ` [brand: ${brandFilter}]` : ''} [history: ${conversationHistory.length} msgs]`);    
    const result = await ragQuery(question, systemInstruction, topK, brandFilter, conversationHistory);
    
    console.log(`✅ Resposta gerada em ${result.searchTime}ms`);
    
    res.json(result);
  } catch (error) {
    console.error('Erro na query:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Busca simples (sem geração)
 */
app.post('/api/search', authMiddleware, async (req, res) => {
  const { query, topK = 10 } = req.body;

  if (isLoading()) {
    return res.status(503).json({ error: 'Base de conhecimento carregando...', loading: true, progress: getLoadingProgress() });
  }
  
  if (!query) {
    return res.status(400).json({ error: 'Query é obrigatória' });
  }
  
  try {
    const results = await searchOnly(query, topK);
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Limpa banco de vetores (admin only)
 */
app.delete('/api/clear', adminMiddleware, async (req, res) => {
  try {
    await clearCollection();
    res.json({ success: true, message: 'Banco de vetores limpo' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Limpa tudo (vetor + PDFs em disco) (admin only)
 */
app.delete('/api/clear-all', adminMiddleware, async (req, res) => {
  try {
    await clearCollection();

    let removedFiles = 0;
    if (fs.existsSync(PDF_DIR)) {
      const files = listPdfFilesRecursive(PDF_DIR);
      for (const filePath of files) {
        try {
          fs.unlinkSync(filePath);
          removedFiles += 1;
        } catch {}
      }
    }

    // Limpa registros de source_files no Supabase via REST API
    let supabaseCleared = false;
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
    if (supabaseUrl && supabaseKey) {
      try {
        const sbRes = await fetch(`${supabaseUrl}/rest/v1/source_files?id=gt.0`, {
          method: 'DELETE',
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal',
          },
        });
        supabaseCleared = sbRes.ok;
        if (!sbRes.ok) console.warn('⚠️ Não foi possível limpar source_files no Supabase:', sbRes.status);
      } catch (e) {
        console.warn('⚠️ Erro ao limpar source_files no Supabase:', e.message);
      }
    }

    res.json({
      success: true,
      message: `Base vetorial e PDFs em disco limpos${supabaseCleared ? ' + registros Supabase' : ''}`,
      removedFiles,
      supabaseCleared,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Importação em massa de dados (NDJSON streaming)
 * Recebe chunks de documentos+embeddings e salva no vector store
 * Usado para transferir vectors.json local para servidor remoto (Railway)
 */
app.post('/api/import-data', adminMiddleware, express.text({ limit: '100mb', type: '*/*' }), async (req, res) => {
  try {
    const body = typeof req.body === 'string' ? req.body : '';
    const lines = body.split('\n').filter(l => l.trim());
    
    if (lines.length === 0) {
      return res.status(400).json({ error: 'Nenhum dado recebido' });
    }

    let imported = 0;
    let errors = 0;
    const chunks = [];
    const embeddings = [];

    for (const line of lines) {
      try {
        const doc = JSON.parse(line);
        if (!doc.id || !doc.document || !doc.embedding || !doc.metadata) {
          errors++;
          continue;
        }
        chunks.push({
          id: doc.id,
          content: doc.document,
          metadata: doc.metadata
        });
        embeddings.push(doc.embedding);
        imported++;
      } catch (e) {
        errors++;
      }
    }

    if (chunks.length > 0) {
      await addDocuments(chunks, embeddings);
    }

    console.log(`📥 Importados ${imported} documentos (${errors} erros)`);
    res.json({ 
      success: true, 
      imported, 
      errors, 
      totalInStore: (await getStats()).totalDocuments 
    });
  } catch (error) {
    console.error('Erro na importação:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Compactar vector store (merge NDJSON → vectors.json)
 */
app.post('/api/compact', adminMiddleware, (req, res) => {
  try {
    compactStore();
    res.json({ success: true, message: 'Vector store compactado' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== INICIALIZAÇÃO ====================

// Validação de variáveis de ambiente
function validateEnv() {
  const required = ['GEMINI_API_KEY'];
  const missing = required.filter(key => !process.env[key]);
  if (missing.length > 0) {
    console.error(`\n❌ Variáveis de ambiente obrigatórias não encontradas: ${missing.join(', ')}`);
    console.error('   Crie um arquivo .env no diretório server/ baseado no .env.example\n');
    process.exit(1);
  }
  if (!process.env.API_KEY) {
    console.warn('⚠️  API_KEY não definida — API sem proteção de autenticação');
  }
  if (!process.env.ADMIN_API_KEY) {
    console.warn('⚠️  ADMIN_API_KEY não definida — rotas admin sem proteção');
  }
}

// --- SERVIR FRONTEND ESTÁTICO (produção) ---
const distPath = path.join(__dirname, '..', 'dist');
if (fs.existsSync(distPath)) {
  console.log('📦 Servindo frontend estático de:', distPath);
  app.use(express.static(distPath, {
    etag: true,
    lastModified: true,
    setHeaders: (res, filePath) => {
      // Evita ficar preso em um index.html antigo (HTML aponta para bundle antigo)
      if (filePath.endsWith(`${path.sep}index.html`)) {
        res.setHeader('Cache-Control', 'no-store');
        return;
      }

      // Assets do Vite são versionados por hash no nome do arquivo
      if (filePath.includes(`${path.sep}assets${path.sep}`)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        return;
      }

      // Default conservador
      res.setHeader('Cache-Control', 'public, max-age=0');
    }
  }));
}

async function startServer() {
  try {
    validateEnv();
    console.log('\n🚀 Iniciando Elevex RAG Server...\n');
    
    // SPA fallback — qualquer rota não-API retorna o index.html
    if (fs.existsSync(distPath)) {
      app.get('*', (req, res, next) => {
        // Não interceptar rotas de API
        if (req.path.startsWith('/api/')) return next();
        // SPA fallback: nunca cachear HTML
        res.setHeader('Cache-Control', 'no-store');
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }

    // Inicia servidor IMEDIATAMENTE (antes de carregar vetores)
    const server = app.listen(PORT, () => {
      console.log(`\n✅ Servidor rodando em http://localhost:${PORT}`);
      console.log(`📚 Diretório de PDFs: ${PDF_DIR}`);
      console.log('⏳ Carregando base de vetores em background...\n');
    });

    // Timeouts do servidor — suportar uploads de PDFs grandes (até 1000 páginas)
    server.timeout = 0; // sem timeout no socket (o processamento é async)
    server.keepAliveTimeout = 120000; // 2min keep-alive
    server.headersTimeout = 125000; // um pouco maior que keepAlive

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`\n❌ Porta ${PORT} já está em uso!`);
        console.error('   Feche o outro processo ou use: taskkill /PID <PID> /F');
        console.error('   Para descobrir: netstat -ano | findstr ":' + PORT + '"');
      } else {
        console.error('❌ Erro no servidor:', err.message);
      }
      process.exit(1);
    });
    
    // Carrega vetores em background (não bloqueia o servidor)
    initializeChroma().then(() => {
      console.log('\n🎉 Base de vetores carregada! Sistema 100% operacional.\n');
    }).catch(err => {
      console.error('❌ Erro ao carregar vetores:', err.message);
    });
    
  } catch (error) {
    console.error('❌ Erro ao iniciar servidor:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('\n🔄 Recebido SIGTERM, encerrando graciosamente...');
  try { await terminateOCR(); } catch {}
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('\n🔄 Recebido SIGINT, encerrando graciosamente...');
  try { await terminateOCR(); } catch {}
  process.exit(0);
});

startServer();
