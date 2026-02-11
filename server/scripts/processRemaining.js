/**
 * Script para processar PDFs restantes que não foram indexados.
 * Processa um por vez com delays adequados para evitar rate limiting.
 * 
 * Uso: node scripts/processRemaining.js [brandName]
 * Exemplo: node scripts/processRemaining.js Otis
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

import { extractTextWithOCR, splitTextIntoChunks } from '../services/pdfExtractor.js';
import { generateEmbedding } from '../services/embeddingService.js';
import { initializeChroma, addDocuments } from '../services/vectorStore.js';

const PDF_DIR = path.join(__dirname, '..', 'data', 'pdfs');
const VECTORS_FILE = path.join(__dirname, '..', 'data', 'vectors.json');

// Brand to filter/tag - from CLI arg
const BRAND_NAME = process.argv[2] || null;

async function getProcessedSources() {
  try {
    if (!fs.existsSync(VECTORS_FILE)) return new Set();
    
    // Streaming: arquivo pode ter >1GB, readFileSync crasharia
    const sources = new Set();
    const sourceRegex = /"source"\s*:\s*"([^"]+)"/g;
    
    return new Promise((resolve) => {
      let buffer = '';
      const stream = fs.createReadStream(VECTORS_FILE, { encoding: 'utf-8', highWaterMark: 64 * 1024 });
      stream.on('data', (chunk) => {
        buffer += chunk;
        let match;
        while ((match = sourceRegex.exec(buffer)) !== null) {
          sources.add(match[1]);
        }
        if (buffer.length > 2000) {
          buffer = buffer.slice(-1000);
          sourceRegex.lastIndex = 0;
        }
      });
      stream.on('end', () => resolve(sources));
      stream.on('error', () => resolve(sources));
    });
  } catch {
    return new Set();
  }
}

function cleanSourceName(filename) {
  // Remove timestamp prefix: 1770749479314-928002278-ELETEM... -> ELETEM...
  return filename.replace(/^\d+-\d+-/, '');
}

async function generateEmbeddingsSequential(texts, onProgress) {
  const embeddings = [];
  for (let i = 0; i < texts.length; i++) {
    try {
      const emb = await generateEmbedding(texts[i]);
      embeddings.push(emb);
    } catch (error) {
      if (error.message && error.message.includes('429')) {
        console.log(`   ⏳ Rate limit hit at chunk ${i+1}, waiting 30s...`);
        await new Promise(r => setTimeout(r, 30000));
        try {
          const emb = await generateEmbedding(texts[i]);
          embeddings.push(emb);
        } catch (err2) {
          console.log(`   ⚠️ Failed chunk ${i+1} after retry: ${err2.message}`);
          embeddings.push(null);
        }
      } else {
        console.log(`   ⚠️ Error chunk ${i+1}: ${error.message}`);
        embeddings.push(null);
      }
    }
    
    // Delay between embeddings to avoid rate limiting
    await new Promise(r => setTimeout(r, 100));
    
    if (onProgress && (i + 1) % 10 === 0) {
      onProgress({ current: i + 1, total: texts.length });
    }
  }
  return embeddings;
}

async function processPDF(filePath, filename, brandName) {
  const cleanName = cleanSourceName(filename);
  console.log(`\n📄 Processing: ${cleanName}`);
  
  // Phase 1: Extract text
  console.log('   📖 Extracting text...');
  const extracted = await extractTextWithOCR(filePath, (progress) => {
    if (progress.phase === 'ocr_start') {
      console.log('   🔍 OCR detected, processing images...');
    }
  });
  
  if (!extracted.text || extracted.text.trim().length < 50) {
    console.log(`   ⚠️ Too little text (${extracted.text?.length || 0} chars), skipping`);
    return 0;
  }
  
  console.log(`   📊 ${extracted.numPages} pages, ${extracted.text.length} chars`);
  
  // Phase 2: Split into chunks
  const chunks = splitTextIntoChunks(extracted.text, {
    source: cleanName,
    filePath: filePath,
    numPages: extracted.numPages,
    title: cleanName.replace('.pdf', ''),
    brandName: brandName || null,
    uploadedAt: new Date().toISOString()
  });
  
  console.log(`   🔪 ${chunks.length} chunks`);
  
  // Phase 3: Generate embeddings (sequential to avoid rate limits)
  console.log(`   🧠 Generating embeddings...`);
  const texts = chunks.map(c => c.content);
  const embeddings = await generateEmbeddingsSequential(texts, (p) => {
    process.stdout.write(`\r   🧠 Embeddings: ${p.current}/${p.total}   `);
  });
  console.log('');
  
  // Filter valid
  const validChunks = [];
  const validEmbeddings = [];
  for (let i = 0; i < chunks.length; i++) {
    if (embeddings[i]) {
      validChunks.push(chunks[i]);
      validEmbeddings.push(embeddings[i]);
    }
  }
  
  // Phase 4: Save to vector store
  console.log(`   💾 Saving ${validChunks.length} chunks...`);
  await addDocuments(validChunks, validEmbeddings);
  
  console.log(`   ✅ Done! ${validChunks.length} chunks indexed`);
  return validChunks.length;
}

async function main() {
  console.log('='.repeat(60));
  console.log('📂 Processing Remaining PDFs');
  console.log(`   Brand: ${BRAND_NAME || 'None (all)'}`);
  console.log('='.repeat(60));
  
  // Get already processed sources (streaming - handles 1GB+ files)
  console.log('📖 Reading indexed sources...');
  const processed = await getProcessedSources();
  console.log(`\n📊 Already processed: ${processed.size} unique sources`);
  
  // Initialize vector store (for addDocuments)
  await initializeChroma();
  
  // Get all PDFs in directory
  const allPDFs = fs.readdirSync(PDF_DIR).filter(f => f.endsWith('.pdf'));
  console.log(`📁 Total PDFs in folder: ${allPDFs.length}`);
  
  // Find unprocessed PDFs
  const unprocessed = allPDFs.filter(f => {
    const cleanName = cleanSourceName(f);
    const cleanLower = cleanName.toLowerCase();
    // Check both exact and case-insensitive, both with and without prefix
    for (const src of processed) {
      const srcClean = src.replace(/^\d+-\d+-/, '').toLowerCase();
      if (srcClean === cleanLower || src.toLowerCase() === cleanLower || src.toLowerCase() === f.toLowerCase()) {
        return false;
      }
    }
    return true;
  });
  
  // If brand filter, optionally filter further
  console.log(`\n🔍 Unprocessed PDFs: ${unprocessed.length}`);
  
  if (unprocessed.length === 0) {
    console.log('\n✅ All PDFs already processed!');
    return;
  }
  
  let totalChunks = 0;
  let successCount = 0;
  let errorCount = 0;
  
  for (let i = 0; i < unprocessed.length; i++) {
    const filename = unprocessed[i];
    const filePath = path.join(PDF_DIR, filename);
    
    console.log(`\n━━━ [${i+1}/${unprocessed.length}] ━━━`);
    
    try {
      const chunks = await processPDF(filePath, filename, BRAND_NAME);
      totalChunks += chunks;
      successCount++;
    } catch (error) {
      console.error(`   ❌ Error: ${error.message}`);
      errorCount++;
    }
    
    // Delay between files to avoid rate limits
    if (i < unprocessed.length - 1) {
      console.log('   ⏳ Waiting 2s before next file...');
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 SUMMARY');
  console.log(`   Files processed: ${successCount}/${unprocessed.length}`);
  console.log(`   Errors: ${errorCount}`);
  console.log(`   Total new chunks: ${totalChunks}`);
  console.log(`   Brand: ${BRAND_NAME || 'None'}`);
  console.log('='.repeat(60));
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
