/**
 * Reindexa PDFs já existentes no disco por filtro regex (sem limpar tudo).
 * Ex:
 *   node scripts/reindexByRegex.js --include "orona|arca" --brandName Orona
 */

import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

import { initializeChroma, removeSources, addDocuments, compactStore } from '../services/vectorStore.js';
import { extractTextWithOCR, splitTextIntoChunks } from '../services/pdfExtractor.js';
import { generateEmbeddings } from '../services/embeddingService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const PDF_DIR = process.env.PDF_PATH || path.join(__dirname, '..', 'data', 'pdfs');

function listPdfFilesRecursive(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) results.push(...listPdfFilesRecursive(full));
    else if (ent.isFile() && ent.name.toLowerCase().endsWith('.pdf')) results.push(full);
  }
  return results;
}

function getArg(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  return process.argv[idx + 1] ?? null;
}

function getOriginalNameFromDiskFilename(filename) {
  return filename.replace(/^\d+-\d+-/, '');
}

async function main() {
  const includeRegex = (getArg('--include') || '').trim();
  const brandName = (getArg('--brandName') || null);

  if (!includeRegex) {
    console.error('Uso: node scripts/reindexByRegex.js --include "regex" [--brandName "Orona"]');
    process.exit(1);
  }

  const pattern = new RegExp(includeRegex, 'i');
  const diskFiles = listPdfFilesRecursive(PDF_DIR);
  const matched = diskFiles.filter(p => pattern.test(path.basename(p)) || pattern.test(path.relative(PDF_DIR, p)));

  console.log(`🔎 PDFs encontrados: ${diskFiles.length}`);
  console.log(`✅ PDFs filtrados (${includeRegex}): ${matched.length}`);

  if (matched.length === 0) return;

  console.log('📦 Carregando vector store...');
  await initializeChroma();

  const sources = matched.map(p => getOriginalNameFromDiskFilename(path.basename(p)));
  console.log('🧹 Removendo chunks antigos das fontes filtradas...');
  const removal = removeSources(sources);
  console.log(`   Removidos: ${removal.removed} | Restantes: ${removal.remaining}`);

  let totalChunks = 0;

  for (const fullPath of matched) {
    const diskName = path.basename(fullPath);
    const originalName = getOriginalNameFromDiskFilename(diskName);
    console.log(`\n📄 Reindexando: ${originalName}`);

    const extracted = await extractTextWithOCR(fullPath, (progress) => {
      if (progress.phase === 'ocr') {
        process.stdout.write(`\r   🔤 ${progress.message}`);
      }
    });
    process.stdout.write('\n');

    const chunks = splitTextIntoChunks(extracted.text, {
      source: originalName,
      filePath: fullPath,
      numPages: extracted.numPages,
      title: extracted.info?.Title || originalName.replace('.pdf', ''),
      brandName,
      reindexedAt: new Date().toISOString(),
      ocrUsed: extracted.ocrUsed || false,
    });

    console.log(`   🧩 Chunks: ${chunks.length} | OCR: ${extracted.ocrUsed ? 'sim' : 'não'}`);

    const texts = chunks.map(c => c.content);
    const embeddings = await generateEmbeddings(texts, (p) => {
      process.stdout.write(`\r   🧠 Embeddings: ${p.percentage}% (${p.current}/${p.total})`);
    });
    process.stdout.write('\n');

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
    console.log(`   ✅ Indexados: ${validChunks.length}`);
  }

  // Compacta no final pra manter o store consistente e rápido
  compactStore();

  console.log(`\n✨ Concluído. PDFs: ${matched.length} | Chunks adicionados: ${totalChunks}`);
}

main().catch(err => {
  console.error('❌ Erro:', err);
  process.exit(1);
});
