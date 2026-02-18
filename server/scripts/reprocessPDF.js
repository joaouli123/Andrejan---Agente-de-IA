/**
 * Script para reprocessar PDFs que falharam ou tiveram OCR ruim.
 * Usa o pipeline melhorado (sharp + PSM 3 + scale 2.5).
 *
 * Uso:
 *   node scripts/reprocessPDF.js                     # reprocessa todos em data/pdfs/
 *   node scripts/reprocessPDF.js "Mag completo"      # reprocessa arquivo específico (match parcial)
 *   node scripts/reprocessPDF.js --dry-run            # mostra o que faria sem salvar
 */

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
dotenv.config();

import { extractTextWithOCR, splitTextIntoChunks, terminateOCR } from '../services/pdfExtractor.js';
import { generateEmbeddings } from '../services/embeddingService.js';
import { initializeChroma, addDocuments, hasSource, removeSources, getStats } from '../services/vectorStoreAdapter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PDF_DIR = path.join(__dirname, '..', 'data', 'pdfs');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const filterArg = args.find(a => !a.startsWith('--'));

function getOriginalName(diskFilename) {
  // Disk format: timestamp-random-OriginalName.pdf
  const match = diskFilename.match(/^\d+-\d+-(.+)$/);
  return match ? match[1] : diskFilename;
}

async function reprocessFile(filePath) {
  const diskName = path.basename(filePath);
  const originalName = getOriginalName(diskName);
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📄 ${originalName}`);
  console.log(`   Arquivo: ${diskName}`);
  console.log(`${'='.repeat(60)}`);

  // 1. Extrair texto (com OCR melhorado)
  console.log('\n🔍 Fase 1: Extração de texto + OCR...');
  const startTime = Date.now();

  const extracted = await extractTextWithOCR(filePath, (progress) => {
    if (progress.phase === 'ocr') {
      process.stdout.write(`\r   🔤 ${progress.message}       `);
    }
  });
  process.stdout.write('\n');

  const extractTime = Math.round((Date.now() - startTime) / 1000);
  console.log(`   ✅ Extração em ${extractTime}s: ${extracted.numPages} páginas, ${extracted.text.length} chars`);
  if (extracted.ocrUsed) {
    const partialNote = extracted.ocrPartial ? ' (PARCIAL - timeout)' : '';
    console.log(`   🔤 OCR${partialNote}: +${extracted.ocrChars} chars de ${extracted.ocrPagesProcessed || '?'} páginas`);
  }

  if (!extracted.text || extracted.text.trim().length < 30) {
    console.error(`   ❌ Texto insuficiente (${extracted.text?.length || 0} chars). PDF pode estar corrompido.`);
    return { success: false, file: originalName, reason: 'texto insuficiente' };
  }

  // 2. Dividir em chunks
  console.log('\n📦 Fase 2: Gerando chunks...');
  const chunks = splitTextIntoChunks(extracted.text, {
    source: originalName,
    filePath: filePath,
    numPages: extracted.numPages,
    title: extracted.info?.Title || originalName.replace('.pdf', ''),
    uploadedAt: new Date().toISOString(),
    reprocessed: true,
    ocrUsed: extracted.ocrUsed || false,
  });

  console.log(`   ✅ ${chunks.length} chunks gerados`);

  if (chunks.length === 0) {
    console.error('   ❌ Nenhum chunk gerado.');
    return { success: false, file: originalName, reason: 'sem chunks' };
  }

  if (dryRun) {
    console.log('\n   🔍 [DRY RUN] Amostra dos primeiros 3 chunks:');
    for (const c of chunks.slice(0, 3)) {
      console.log(`   ---`);
      console.log(`   ${c.content.slice(0, 200)}...`);
    }
    return { success: true, file: originalName, chunks: chunks.length, dryRun: true };
  }

  // 3. Gerar embeddings
  console.log('\n🧠 Fase 3: Gerando embeddings...');
  const texts = chunks.map(c => c.content);
  const embeddings = await generateEmbeddings(texts, (progress) => {
    process.stdout.write(`\r   ⏳ ${progress.percentage}% (${progress.current}/${progress.total})   `);
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

  console.log(`   ✅ ${validChunks.length}/${chunks.length} embeddings gerados`);

  if (validChunks.length === 0) {
    console.error('   ❌ Nenhum embedding válido.');
    return { success: false, file: originalName, reason: 'sem embeddings' };
  }

  // 4. Remover dados antigos do mesmo source (se existir)
  const alreadyExists = await hasSource(originalName);
  if (alreadyExists) {
    console.log(`\n🗑️  Removendo dados antigos de "${originalName}"...`);
    await removeSources([originalName]);
    console.log('   ✅ Dados antigos removidos');
  }

  // 5. Salvar no vector store
  console.log('\n💾 Fase 4: Salvando no banco de vetores...');
  await addDocuments(validChunks, validEmbeddings);

  const elapsed = Math.round((Date.now() - startTime) / 1000);
  console.log(`\n✅ CONCLUÍDO: ${originalName}`);
  console.log(`   ${extracted.numPages} páginas → ${validChunks.length} chunks em ${elapsed}s`);

  return { success: true, file: originalName, chunks: validChunks.length, elapsed };
}

async function main() {
  console.log('🔄 Reprocessador de PDFs (OCR melhorado)');
  console.log(`   Diretório: ${PDF_DIR}`);
  if (dryRun) console.log('   ⚠️  MODO DRY-RUN: não vai salvar nada');
  if (filterArg) console.log(`   🔎 Filtro: "${filterArg}"`);

  // Inicializa o vector store
  await initializeChroma();
  const statsBefore = await getStats();
  console.log(`\n📊 Vector store atual: ${statsBefore.totalDocuments} docs de ${statsBefore.uniqueSources?.length || '?'} fontes`);

  // Lista PDFs
  const allFiles = fs.readdirSync(PDF_DIR)
    .filter(f => f.toLowerCase().endsWith('.pdf'));

  const filesToProcess = filterArg
    ? allFiles.filter(f => f.toLowerCase().includes(filterArg.toLowerCase()))
    : allFiles;

  if (filesToProcess.length === 0) {
    console.log('\n❌ Nenhum PDF encontrado para processar.');
    process.exit(1);
  }

  console.log(`\n📁 ${filesToProcess.length} PDF(s) para processar:`);
  for (const f of filesToProcess) {
    console.log(`   - ${getOriginalName(f)}`);
  }

  const results = [];
  for (const file of filesToProcess) {
    try {
      const result = await reprocessFile(path.join(PDF_DIR, file));
      results.push(result);
    } catch (err) {
      console.error(`\n❌ Erro processando ${file}: ${err.message}`);
      results.push({ success: false, file: getOriginalName(file), reason: err.message });
    }
  }

  // Libera workers Tesseract
  await terminateOCR();

  // Resumo
  const statsAfter = dryRun ? statsBefore : await getStats();
  console.log(`\n${'='.repeat(60)}`);
  console.log('📊 RESUMO');
  console.log(`${'='.repeat(60)}`);
  for (const r of results) {
    const icon = r.success ? '✅' : '❌';
    const detail = r.success
      ? `${r.chunks} chunks${r.dryRun ? ' (dry-run)' : ` em ${r.elapsed}s`}`
      : r.reason;
    console.log(`   ${icon} ${r.file}: ${detail}`);
  }
  if (!dryRun) {
    console.log(`\n   Vector store: ${statsBefore.totalDocuments} → ${statsAfter.totalDocuments} docs`);
  }
  console.log('');
}

main().catch(err => {
  console.error('❌ Erro fatal:', err);
  process.exit(1);
});
