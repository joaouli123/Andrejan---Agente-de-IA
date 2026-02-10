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
import { initializeChroma, getStats, clearCollection, addDocuments } from './services/vectorStore.js';
import { extractTextFromPDF, extractTextWithOCR, splitTextIntoChunks, terminateOCR } from './services/pdfExtractor.js';
import { generateEmbeddings } from './services/embeddingService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3002;
const PDF_DIR = process.env.PDF_PATH || path.join(__dirname, 'data', 'pdfs');

// Middleware
app.use(cors());
app.use(express.json());

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
  res.json({ status: 'ok', service: 'Elevex RAG API' });
});

/**
 * Estatísticas do banco de vetores
 */
app.get('/api/stats', async (req, res) => {
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
app.get('/api/documents', (req, res) => {
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
 * Upload de novo PDF (responde imediatamente, processa em background)
 */
app.post('/api/upload', upload.single('pdf'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Nenhum arquivo enviado' });
  }

  const taskId = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
  const filePath = req.file.path;
  const originalName = req.file.originalname;
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
    const extracted = await extractTextWithOCR(filePath, (progress) => {
      if (progress.phase === 'ocr_start') {
        task.message = '🔍 PDF com imagens detectado, iniciando OCR...';
      } else if (progress.phase === 'ocr') {
        task.message = `🔤 ${progress.message}`;
      }
    });
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
app.get('/api/upload/status/:taskId', (req, res) => {
  const task = processingTasks.get(req.params.taskId);
  if (!task) {
    return res.json({ status: 'not_found', message: 'Tarefa não encontrada (pode ter expirado)' });
  }
  res.json(task);
});

/**
 * Busca RAG - Endpoint principal
 */
app.post('/api/query', async (req, res) => {
  const { question, systemInstruction, topK = 5, brandFilter = null } = req.body;
  
  if (!question) {
    return res.status(400).json({ error: 'Pergunta é obrigatória' });
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
app.post('/api/search', async (req, res) => {
  const { query, topK = 10 } = req.body;
  
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
app.delete('/api/clear', async (req, res) => {
  try {
    await clearCollection();
    res.json({ success: true, message: 'Banco de vetores limpo' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== INICIALIZAÇÃO ====================

async function startServer() {
  try {
    console.log('\n🚀 Iniciando Elevex RAG Server...\n');
    
    // Inicializa ChromaDB
    await initializeChroma();
    
    // Inicia servidor
    app.listen(PORT, () => {
      console.log(`\n✅ Servidor rodando em http://localhost:${PORT}`);
      console.log(`📚 Diretório de PDFs: ${PDF_DIR}`);
      console.log('\nEndpoints disponíveis:');
      console.log('  GET  /api/health    - Health check');
      console.log('  GET  /api/stats     - Estatísticas');
      console.log('  GET  /api/documents - Lista PDFs');
      console.log('  POST /api/upload    - Upload PDF');
      console.log('  POST /api/query     - Busca RAG');
      console.log('  POST /api/search    - Busca simples');
      console.log('');
    });
  } catch (error) {
    console.error('❌ Erro ao iniciar servidor:', error);
    process.exit(1);
  }
}

startServer();
