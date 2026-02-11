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

import { ragQuery, searchOnly } from './services/ragService.js';
import { initializeChroma, getStats, clearCollection, addDocuments, hasSource, getIndexedSources, isLoading, getLoadingProgress } from './services/vectorStore.js';
import { extractTextFromPDF, extractTextWithOCR, splitTextIntoChunks, terminateOCR } from './services/pdfExtractor.js';
import { generateEmbeddings } from './services/embeddingService.js';
import rateLimit from 'express-rate-limit';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3002;
const PDF_DIR = process.env.PDF_PATH || path.join(__dirname, 'data', 'pdfs');

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
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB max
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
 * Lista PDFs disponíveis
 */
app.get('/api/documents', authMiddleware, (req, res) => {
  try {
    const files = fs.readdirSync(PDF_DIR)
      .filter(f => f.toLowerCase().endsWith('.pdf'))
      .map(f => ({
        name: f,
        path: path.join(PDF_DIR, f),
        size: fs.statSync(path.join(PDF_DIR, f)).size,
        uploadedAt: fs.statSync(path.join(PDF_DIR, f)).mtime
      }));
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
    const files = fs.readdirSync(PDF_DIR);
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
 * Verifica quais arquivos já estão indexados (para skip de duplicatas)
 * Verifica tanto no vector store quanto no disco
 */
app.post('/api/check-duplicates', adminMiddleware, (req, res) => {
  try {
    const { fileNames } = req.body;
    if (!fileNames || !Array.isArray(fileNames)) {
      return res.status(400).json({ error: 'fileNames deve ser um array' });
    }
    const loading = isLoading();
    const results = fileNames.map(name => {
      // Verifica no vector store (se já carregou) OU no disco como fallback
      const inVectorStore = !loading && hasSource(name);
      const onDisk = fileExistsOnDisk(name);
      return {
        name,
        exists: inVectorStore || onDisk
      };
    });
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
  const alreadyInVectorStore = !isLoading() && hasSource(originalName);
  const alreadyOnDisk = fileExistsOnDisk(originalName, uploadedFilename);
  if (alreadyInVectorStore || alreadyOnDisk) {
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
    progress: 0,
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
    task.message = 'Extraindo texto do PDF...';
    
    let extracted;
    try {
      extracted = await extractTextWithOCR(filePath, (progress) => {
        if (progress.phase === 'ocr_start') {
          task.message = '🔍 PDF com imagens detectado, iniciando OCR...';
        } else if (progress.phase === 'ocr') {
          task.message = `🔤 ${progress.message}`;
        }
      });
    } catch (extractErr) {
      console.error(`   ❌ [${taskId}] Extração falhou: ${extractErr.message}`);
      task.status = 'error';
      task.message = `Erro na extração: ${extractErr.message}. O PDF pode estar corrompido ou protegido.`;
      setTimeout(() => processingTasks.delete(taskId), 5 * 60 * 1000);
      return;
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
      console.log(`   🔤 [${taskId}] OCR utilizado: +${extracted.ocrChars} chars`);
    }
    
    // Fase 2: Dividir em chunks
    const chunks = splitTextIntoChunks(extracted.text, {
      source: originalName,
      filePath: filePath,
      numPages: extracted.numPages,
      title: extracted.info?.Title || originalName.replace('.pdf', ''),
      brandName: brandName || null,
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
  const { question, systemInstruction, topK = 5, brandFilter = null } = req.body;
  
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
    console.log(`\n🔍 Query: "${question.substring(0, 50)}..."${brandFilter ? ` [brand: ${brandFilter}]` : ''}`);    
    const result = await ragQuery(question, systemInstruction, topK, brandFilter);
    
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
  app.use(express.static(distPath));
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
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }

    // Inicia servidor IMEDIATAMENTE (antes de carregar vetores)
    const server = app.listen(PORT, () => {
      console.log(`\n✅ Servidor rodando em http://localhost:${PORT}`);
      console.log(`📚 Diretório de PDFs: ${PDF_DIR}`);
      console.log('⏳ Carregando base de vetores em background...\n');
    });

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
