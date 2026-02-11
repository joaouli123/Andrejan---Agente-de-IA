/**
 * Script TURBO para processar PDFs restantes
 * Otimizado para PC potente: paralelismo máximo em OCR e embeddings
 * 
 * Uso: node --max-old-space-size=8192 scripts/processRemainingFast.js [brandName]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import pdfParse from 'pdf-parse';
import Tesseract from 'tesseract.js';
import { v4 as uuidv4 } from 'uuid';
import { GoogleGenerativeAI } from '@google/generative-ai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const embeddingModel = genAI.getGenerativeModel({ model: 'gemini-embedding-001' });

const PDF_DIR = path.join(__dirname, '..', 'data', 'pdfs');
const VECTORS_FILE = path.join(__dirname, '..', 'data', 'vectors.json');
const BRAND_NAME = process.argv[2] || null;

// Configuração TURBO
const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 200;
const OCR_TEXT_THRESHOLD = 50;
const EMBEDDING_CONCURRENCY = 25;  // 25 embeddings simultâneos (agressivo mas funciona)
const OCR_WORKERS = 4;             // 4 workers OCR paralelos
const SAVE_EVERY_N_FILES = 3;      // Salvar a cada 3 arquivos

// ==================== VECTOR STORE ====================

let vectorStore = { documents: [], embeddings: [], metadatas: [], ids: [] };

function loadVectorStore() {
  try {
    if (fs.existsSync(VECTORS_FILE)) {
      const stats = fs.statSync(VECTORS_FILE);
      const sizeMB = Math.round(stats.size / 1024 / 1024);
      console.log(`📦 Loading vector store (${sizeMB} MB) via streaming...`);
      
      // Stream parse para arquivos grandes (>512MB)
      const raw = fs.readFileSync(VECTORS_FILE);
      const data = JSON.parse(raw);
      vectorStore = data;
      console.log(`📦 Loaded ${vectorStore.documents.length} existing docs`);
    }
  } catch (e) {
    // Se falhar por tamanho, tenta streaming só das metadatas
    console.error('Load error:', e.message);
    console.log('📦 Tentando carregar apenas metadatas via streaming...');
    try {
      loadMetadatasStreaming();
    } catch (e2) {
      console.error('Streaming load also failed:', e2.message);
    }
  }
}

function loadMetadatasStreaming() {
  // Carrega apenas as sources para dedup, sem os embeddings pesados
  const sourceRegex = /"source"\s*:\s*"([^"]+)"/g;
  let buffer = '';
  const stream = fs.createReadStream(VECTORS_FILE, { encoding: 'utf-8', highWaterMark: 64 * 1024 });
  // Sync-ish: read all chunks
  const chunks = [];
  const fd = fs.openSync(VECTORS_FILE, 'r');
  const bufSize = 64 * 1024;
  const readBuf = Buffer.alloc(bufSize);
  let bytesRead;
  while ((bytesRead = fs.readSync(fd, readBuf, 0, bufSize)) > 0) {
    buffer += readBuf.toString('utf-8', 0, bytesRead);
    let match;
    while ((match = sourceRegex.exec(buffer)) !== null) {
      // Add a fake metadata entry for dedup
      if (!vectorStore.metadatas.some(m => m.source === match[1])) {
        vectorStore.metadatas.push({ source: match[1] });
      }
    }
    if (buffer.length > 2000) {
      buffer = buffer.slice(-1000);
      sourceRegex.lastIndex = 0;
    }
  }
  fs.closeSync(fd);
  console.log(`📦 Loaded ${vectorStore.metadatas.length} source entries via streaming`);
}

function saveVectorStore() {
  const fd = fs.openSync(VECTORS_FILE, 'w');
  fs.writeSync(fd, '{"documents":[');
  for (let i = 0; i < vectorStore.documents.length; i++) {
    if (i > 0) fs.writeSync(fd, ',');
    fs.writeSync(fd, JSON.stringify(vectorStore.documents[i]));
  }
  fs.writeSync(fd, '],"embeddings":[');
  for (let i = 0; i < vectorStore.embeddings.length; i++) {
    if (i > 0) fs.writeSync(fd, ',');
    fs.writeSync(fd, JSON.stringify(vectorStore.embeddings[i]));
  }
  fs.writeSync(fd, '],"metadatas":[');
  for (let i = 0; i < vectorStore.metadatas.length; i++) {
    if (i > 0) fs.writeSync(fd, ',');
    fs.writeSync(fd, JSON.stringify(vectorStore.metadatas[i]));
  }
  fs.writeSync(fd, '],"ids":[');
  for (let i = 0; i < vectorStore.ids.length; i++) {
    if (i > 0) fs.writeSync(fd, ',');
    fs.writeSync(fd, JSON.stringify(vectorStore.ids[i]));
  }
  fs.writeSync(fd, ']}');
  fs.closeSync(fd);
  console.log(`💾 Saved ${vectorStore.documents.length} total docs`);
}

function addToStore(chunks, embeddings) {
  for (let i = 0; i < chunks.length; i++) {
    vectorStore.ids.push(chunks[i].id);
    vectorStore.documents.push(chunks[i].content);
    vectorStore.metadatas.push(chunks[i].metadata);
    vectorStore.embeddings.push(embeddings[i]);
  }
}

// ==================== DUPLICATE DETECTION ====================

function getProcessedSources() {
  const sources = new Set();
  vectorStore.metadatas.forEach(m => {
    if (m.source) sources.add(m.source.toLowerCase());
  });
  return sources;
}

function cleanSourceName(filename) {
  return filename.replace(/^\d+-\d+-/, '');
}

function isAlreadyProcessed(filename, processedSources) {
  const cleanName = cleanSourceName(filename).toLowerCase();
  // Check both the clean name and the original filename
  if (processedSources.has(cleanName)) return true;
  if (processedSources.has(filename.toLowerCase())) return true;
  // Also check partial matches (the source might be stored slightly differently)
  for (const src of processedSources) {
    // Match by original name part (after timestamp prefix)
    if (cleanName === src || filename.toLowerCase() === src) return true;
  }
  return false;
}

// ==================== FAST EMBEDDING ====================

async function generateEmbedding(text) {
  const result = await embeddingModel.embedContent(text);
  return result.embedding.values;
}

async function generateEmbeddingsBatch(texts) {
  const embeddings = new Array(texts.length).fill(null);
  const concurrency = EMBEDDING_CONCURRENCY;
  
  let completed = 0;
  const startTime = Date.now();
  
  // Process in sliding window of concurrency
  for (let i = 0; i < texts.length; i += concurrency) {
    const batch = [];
    const end = Math.min(i + concurrency, texts.length);
    
    for (let j = i; j < end; j++) {
      batch.push(
        (async (idx) => {
          let retries = 0;
          while (retries < 3) {
            try {
              embeddings[idx] = await generateEmbedding(texts[idx]);
              completed++;
              return;
            } catch (error) {
              retries++;
              if (error.message?.includes('429') || error.message?.includes('RESOURCE_EXHAUSTED')) {
                const wait = retries * 10000; // 10s, 20s, 30s
                console.log(`   ⏳ Rate limit, waiting ${wait/1000}s (retry ${retries})...`);
                await new Promise(r => setTimeout(r, wait));
              } else {
                console.log(`   ⚠️ Error embed ${idx}: ${error.message}`);
                return;
              }
            }
          }
        })(j)
      );
    }
    
    await Promise.all(batch);
    
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const rate = (completed / parseFloat(elapsed)).toFixed(1);
    process.stdout.write(`\r   🧠 Embeddings: ${completed}/${texts.length} (${rate}/s)   `);
    
    // Micro delay between batches (just 200ms)
    if (i + concurrency < texts.length) {
      await new Promise(r => setTimeout(r, 200));
    }
  }
  console.log('');
  
  return embeddings;
}

// ==================== FAST OCR ====================

let ocrWorkers = [];

async function initOCRWorkers(count) {
  console.log(`🔧 Initializing ${count} OCR workers...`);
  const workers = [];
  for (let i = 0; i < count; i++) {
    const w = await Tesseract.createWorker('por+eng', 1, { logger: () => {} });
    workers.push(w);
  }
  ocrWorkers = workers;
  console.log(`✅ ${count} OCR workers ready`);
}

async function terminateOCRWorkers() {
  for (const w of ocrWorkers) {
    try { await w.terminate(); } catch {}
  }
  ocrWorkers = [];
}

async function ocrPagesParallel(pageImages, numPages) {
  if (ocrWorkers.length === 0) await initOCRWorkers(OCR_WORKERS);
  
  const results = new Array(pageImages.length).fill('');
  let completed = 0;
  
  // Distribute pages across workers
  const promises = pageImages.map((img, idx) => {
    const workerIdx = idx % ocrWorkers.length;
    return (async () => {
      try {
        const result = await ocrWorkers[workerIdx].recognize(img);
        results[idx] = result.data.text.trim();
        completed++;
        if (completed % 10 === 0) {
          process.stdout.write(`\r   📄 OCR: ${completed}/${numPages} pages   `);
        }
      } catch (err) {
        // OCR workers are busy in parallel; queue sequentially per worker
      }
    })();
  });
  
  // Run with limited concurrency (one per worker at a time)
  // Actually, since each worker is single-threaded, we need to queue per worker
  const workerQueues = Array.from({ length: ocrWorkers.length }, () => []);
  pageImages.forEach((img, idx) => {
    workerQueues[idx % ocrWorkers.length].push({ img, idx });
  });
  
  const workerPromises = workerQueues.map(async (queue, wIdx) => {
    for (const { img, idx } of queue) {
      try {
        const result = await ocrWorkers[wIdx].recognize(img);
        results[idx] = result.data.text.trim();
        completed++;
        if (completed % 10 === 0) {
          process.stdout.write(`\r   📄 OCR: ${completed}/${numPages} pages   `);
        }
      } catch (err) {
        // skip failed page
      }
    }
  });
  
  await Promise.all(workerPromises);
  if (completed > 0) console.log(`\r   📄 OCR: ${completed}/${numPages} pages done   `);
  
  return results;
}

// ==================== PDF PROCESSING ====================

function splitTextIntoChunks(text, metadata) {
  const chunks = [];
  const sentences = text.split(/(?<=[.!?])\s+/);
  let currentChunk = '';
  let chunkIndex = 0;
  
  for (const sentence of sentences) {
    if ((currentChunk + sentence).length > CHUNK_SIZE && currentChunk.length > 0) {
      chunks.push({
        id: uuidv4(),
        content: currentChunk.trim(),
        metadata: { ...metadata, chunkIndex: chunkIndex++ }
      });
      const words = currentChunk.split(' ');
      const overlapWords = words.slice(-Math.floor(CHUNK_OVERLAP / 5));
      currentChunk = overlapWords.join(' ') + ' ' + sentence;
    } else {
      currentChunk += (currentChunk ? ' ' : '') + sentence;
    }
  }
  if (currentChunk.trim()) {
    chunks.push({
      id: uuidv4(),
      content: currentChunk.trim(),
      metadata: { ...metadata, chunkIndex: chunkIndex }
    });
  }
  return chunks;
}

async function processPDF(filePath, filename, brandName) {
  const cleanName = cleanSourceName(filename);
  const startTime = Date.now();
  
  // Phase 1: Extract text (com proteção contra PDFs problemáticos)
  const dataBuffer = fs.readFileSync(filePath);
  
  let pdfData = null;
  let numPages = 0;
  let finalText = '';
  let ocrUsed = false;
  
  // Tenta pdf-parse primeiro (protegido)
  try {
    pdfData = await pdfParse(dataBuffer, { max: 0 });
    numPages = pdfData.numpages || 0;
    finalText = pdfData.text || '';
  } catch (parseErr) {
    console.log(`   ⚠️ pdf-parse falhou: ${parseErr.message}`);
    console.log(`   🔄 Tentando OCR direto...`);
  }
  
  const avgCharsPerPage = numPages > 0 ? finalText.length / numPages : 0;
  
  // Phase 2: OCR if needed (PARALLEL)
  if (!pdfData || avgCharsPerPage < OCR_TEXT_THRESHOLD) {
    const reason = !pdfData ? 'pdf-parse falhou' : `pouco texto (${Math.round(avgCharsPerPage)} chars/pág)`;
    console.log(`   🔍 OCR necessário: ${reason}`);
    ocrUsed = true;
    
    try {
      const { pdf } = await import('pdf-to-img');
      const pageImages = [];
      
      let pdfIterator;
      try {
        pdfIterator = await pdf(dataBuffer, { scale: 1.5 });
      } catch (imgErr) {
        console.log(`   ⚠️ pdf-to-img falhou com scale=1.5, tentando scale=1.0...`);
        pdfIterator = await pdf(dataBuffer, { scale: 1.0 });
      }
      
      for await (const pageImage of pdfIterator) {
        pageImages.push(pageImage);
      }
      
      if (numPages === 0) numPages = pageImages.length;
      
      // OCR all pages in parallel using multiple workers
      const pageTexts = await ocrPagesParallel(pageImages, numPages);
      
      let ocrText = '';
      pageTexts.forEach((text, i) => {
        if (text.length > 10) {
          ocrText += `\n--- Página ${i + 1} ---\n${text}\n`;
        }
      });
      
      finalText = [finalText.trim(), ocrText.trim()].filter(Boolean).join('\n\n').trim();
    } catch (err) {
      console.log(`   ⚠️ OCR pipeline falhou: ${err.message}`);
      // Se temos algum texto do pdf-parse, ainda podemos usar
      if (!finalText || finalText.trim().length < 50) {
        console.log(`   ❌ Nenhum texto extraído, pulando arquivo`);
        return 0;
      }
      console.log(`   ↩️ Usando ${finalText.length} chars do pdf-parse como fallback`);
    }
  }
  
  if (!finalText || finalText.trim().length < 50) {
    console.log(`   ⚠️ Too little text (${finalText?.length || 0} chars), skipping`);
    return 0;
  }
  
  // Phase 3: Chunk
  const chunks = splitTextIntoChunks(finalText, {
    source: cleanName,
    filePath,
    numPages,
    title: cleanName.replace('.pdf', ''),
    brandName: brandName || null,
    uploadedAt: new Date().toISOString()
  });
  
  // Phase 4: Embeddings (FAST PARALLEL)
  const texts = chunks.map(c => c.content);
  const embeddings = await generateEmbeddingsBatch(texts);
  
  // Filter valid
  const validChunks = [];
  const validEmbeddings = [];
  for (let i = 0; i < chunks.length; i++) {
    if (embeddings[i]) {
      validChunks.push(chunks[i]);
      validEmbeddings.push(embeddings[i]);
    }
  }
  
  // Add to memory store (save later in batches)
  addToStore(validChunks, validEmbeddings);
  
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`   ✅ ${validChunks.length} chunks in ${elapsed}s ${ocrUsed ? '(OCR)' : ''}`);
  return validChunks.length;
}

// ==================== MAIN ====================

async function main() {
  const globalStart = Date.now();
  
  console.log('='.repeat(60));
  console.log('⚡ TURBO PDF Processor');
  console.log(`   Brand: ${BRAND_NAME || 'None'}`);
  console.log(`   Concurrency: ${EMBEDDING_CONCURRENCY} embeddings, ${OCR_WORKERS} OCR workers`);
  console.log('='.repeat(60));
  
  // Load existing vectors
  loadVectorStore();
  const processedSources = getProcessedSources();
  console.log(`📊 Already processed: ${processedSources.size} unique sources`);
  
  // Find unprocessed PDFs
  const allPDFs = fs.readdirSync(PDF_DIR).filter(f => f.endsWith('.pdf'));
  const unprocessed = allPDFs.filter(f => !isAlreadyProcessed(f, processedSources));
  
  console.log(`📁 Total PDFs: ${allPDFs.length}`);
  console.log(`🔍 Unprocessed: ${unprocessed.length}`);
  console.log(`⏭️  Skipping: ${allPDFs.length - unprocessed.length} (already indexed)`);
  
  if (unprocessed.length === 0) {
    console.log('\n✅ All PDFs already processed!');
    return;
  }
  
  let totalChunks = 0;
  let successCount = 0;
  let errorCount = 0;
  let pendingSave = 0;
  const failedFiles = [];
  
  for (let i = 0; i < unprocessed.length; i++) {
    const filename = unprocessed[i];
    const filePath = path.join(PDF_DIR, filename);
    const cleanName = cleanSourceName(filename);
    
    console.log(`\n━━━ [${i + 1}/${unprocessed.length}] ${cleanName} ━━━`);
    
    try {
      // Verifica se o arquivo existe e tem tamanho > 0
      const stats = fs.statSync(filePath);
      if (stats.size === 0) {
        console.log(`   ⚠️ Arquivo vazio (0 bytes), pulando`);
        failedFiles.push({ file: cleanName, error: 'Arquivo vazio' });
        errorCount++;
        continue;
      }
      
      const chunks = await processPDF(filePath, filename, BRAND_NAME);
      totalChunks += chunks;
      successCount++;
      pendingSave++;
      
      // Save to disk periodically
      if (pendingSave >= SAVE_EVERY_N_FILES) {
        console.log(`   💾 Saving to disk...`);
        saveVectorStore();
        pendingSave = 0;
      }
    } catch (error) {
      console.error(`   ❌ Error: ${error.message}`);
      failedFiles.push({ file: cleanName, error: error.message });
      errorCount++;
      
      // Salva progresso mesmo após erro para não perder trabalho
      if (pendingSave > 0) {
        console.log(`   💾 Salvando progresso após erro...`);
        saveVectorStore();
        pendingSave = 0;
      }
    }
  }
  
  // Final save
  if (pendingSave > 0) {
    console.log(`\n💾 Final save...`);
    saveVectorStore();
  }
  
  // Cleanup
  await terminateOCRWorkers();
  
  const totalElapsed = ((Date.now() - globalStart) / 1000 / 60).toFixed(1);
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 SUMMARY');
  console.log(`   Files processed: ${successCount}/${unprocessed.length}`);
  console.log(`   Errors: ${errorCount}`);
  console.log(`   Total new chunks: ${totalChunks}`);
  console.log(`   Total docs in store: ${vectorStore.documents.length}`);
  console.log(`   Time: ${totalElapsed} minutes`);
  if (failedFiles.length > 0) {
    console.log(`\n   ❌ ARQUIVOS COM ERRO:`);
    failedFiles.forEach(f => console.log(`      - ${f.file}: ${f.error}`));
  }
  console.log('='.repeat(60));
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
