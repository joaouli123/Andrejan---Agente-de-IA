/**
 * Script de Re-Ingestão com Metadados de Marca
 * 
 * Detecta automaticamente a marca do equipamento a partir do:
 *   1. Nome da pasta pai (ex: pdfs/Otis/Gen2/arquivo.pdf → brand=Otis, model=Gen2)
 *   2. Nome do arquivo (ex: "Orona arca II diagramas.pdf" → brand=Orona)
 *   3. Conteúdo do PDF (primeiras páginas, busca por nomes de marca)
 *
 * Uso:
 *   node scripts/reindexWithBrands.js                  # Reprocessa tudo
 *   node scripts/reindexWithBrands.js --dry-run        # Apenas mostra o que faria
 *   node scripts/reindexWithBrands.js --clear           # Limpa tudo antes de reindexar
 *   node scripts/reindexWithBrands.js --brand Otis      # Força brand para todos os PDFs
 */

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { extractTextWithOCR, splitTextIntoChunks } from '../services/pdfExtractor.js';
import { generateEmbeddings } from '../services/embeddingService.js';
import { initializeChroma, addDocuments, getStats, clearCollection, removeSources } from '../services/vectorStoreAdapter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const PDF_DIR = process.env.PDF_PATH || path.join(__dirname, '..', 'data', 'pdfs');

// ═══ Mapa de marcas canônicas ═══
const BRAND_RULES = [
  {
    canonical: 'Otis',
    filePatterns: [/\botis\b/i, /\bgen\s*2\b/i, /\bgecb\b/i, /\blcb\s*i{0,2}\b/i, /\bmcss\b/i, /\bmcp\b/i, /\bmcb\b/i, /\brbi\b/i, /\bgmux\b/i],
    contentPatterns: [/\bOTIS\b/, /\bGEN\s*2\b/i, /\bGECB\b/i, /\bLCBII\b/i, /\bMCSS\b/i],
  },
  {
    canonical: 'Orona',
    filePatterns: [/\borona\b/i, /\barca\b/i],
    contentPatterns: [/\bORONA\b/i, /\bARCA\b/i],
  },
  {
    canonical: 'Schindler',
    filePatterns: [/\bschindler\b/i, /\b(3300|5500|7000)\b/],
    contentPatterns: [/\bSCHINDLER\b/i],
  },
  {
    canonical: 'Sectron',
    filePatterns: [/\bsectron\b/i, /\badv[\s-]*\d+/i],
    contentPatterns: [/\bSECTRON\b/i, /\bADV[\s-]*\d+/i],
  },
  {
    canonical: 'ThyssenKrupp',
    filePatterns: [/\bthyssen\b/i, /\btke?\b/i],
    contentPatterns: [/\bTHYSSEN/i, /\bTKE\b/i],
  },
  {
    canonical: 'Atlas',
    filePatterns: [/\batlas\b/i],
    contentPatterns: [/\bATLAS\b/i],
  },
];

function detectBrandFromFilename(filename) {
  const name = String(filename || '');
  for (const rule of BRAND_RULES) {
    if (rule.filePatterns.some(p => p.test(name))) {
      return rule.canonical;
    }
  }
  return null;
}

function detectBrandFromFolderPath(relativePath) {
  // Se o arquivo está em pdfs/Otis/Gen2/arquivo.pdf, a pasta pai é "Otis"
  const parts = relativePath.split(/[\\/]/);
  // parts: ["Otis", "Gen2", "arquivo.pdf"] ou ["arquivo.pdf"]
  for (const part of parts) {
    const brand = detectBrandFromFilename(part);
    if (brand) return brand;
  }
  return null;
}

function detectBrandFromContent(text) {
  const preview = String(text || '').slice(0, 5000); // Primeiras ~2 páginas
  for (const rule of BRAND_RULES) {
    if (rule.contentPatterns.some(p => p.test(preview))) {
      return rule.canonical;
    }
  }
  return null;
}

function detectModelFromPath(relativePath, brand) {
  const parts = relativePath.split(/[\\/]/);
  // Se temos pdfs/Otis/Gen2/arquivo.pdf → model = Gen2
  // Se temos pdfs/Orona arca II.pdf → model from filename
  
  // Tenta extrair modelo da pasta (segundo nível)
  if (parts.length >= 3) {
    const possibleModel = parts[parts.length - 2]; // pasta antes do arquivo
    // Verifica se não é a marca
    if (!BRAND_RULES.some(r => r.canonical.toLowerCase() === possibleModel.toLowerCase())) {
      return possibleModel;
    }
  }
  
  // Tenta extrair modelo do filename
  const filename = parts[parts.length - 1].replace(/\.pdf$/i, '').replace(/^\d+-\d+-/, '');
  
  // Padrões comuns: "Arca II", "Gen2", "ADV-210"
  const modelPatterns = [
    /\b(arca\s*(?:I{1,3}|IV|V|VI|\d+))/i,
    /\b(gen\s*\d+)/i,
    /\b(adv[\s-]*\d+[a-z]*)/i,
    /\b(mag\s+gen\d+[a-z-]*)/i,
    /\b(\d{4,5}[a-z]*)\s/i,
  ];
  
  for (const pat of modelPatterns) {
    const m = filename.match(pat);
    if (m) return m[1].trim();
  }
  
  return null;
}

function getOriginalNameFromDiskFilename(filename) {
  return filename.replace(/^\d+-\d+-/, '');
}

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

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('     🏷️  ELEVEX - RE-INGESTÃO COM METADADOS DE MARCA      ');
  console.log('═══════════════════════════════════════════════════════════\n');

  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const clearFirst = args.includes('--clear');
  const forceBrandIdx = args.indexOf('--brand');
  const forceBrand = forceBrandIdx >= 0 ? args[forceBrandIdx + 1] : null;

  if (dryRun) console.log('ℹ️  Modo DRY-RUN: não altera o banco de vetores\n');
  if (forceBrand) console.log(`ℹ️  Forçando marca: ${forceBrand}\n`);

  const startTime = Date.now();

  // 1. Inicializa
  console.log('📦 Inicializando banco de vetores...');
  await initializeChroma();

  if (clearFirst && !dryRun) {
    console.log('🗑️  Limpando coleção existente...');
    await clearCollection();
  }

  // 2. Lista todos os PDFs
  const filePaths = listPdfFilesRecursive(PDF_DIR);
  const files = filePaths.map(p => ({
    fullPath: p,
    name: path.basename(p),
    originalName: getOriginalNameFromDiskFilename(path.basename(p)),
    relativePath: path.relative(PDF_DIR, p),
  }));

  console.log(`\n📁 Encontrados ${files.length} PDFs em ${PDF_DIR}\n`);

  if (files.length === 0) {
    console.log('⚠️  Nenhum PDF encontrado! Organize os PDFs em:');
    console.log(`   ${PDF_DIR}/NomeDaMarca/NomeDoModelo/arquivo.pdf`);
    console.log(`   ${PDF_DIR}/NomeDaMarca/arquivo.pdf`);
    console.log(`   ou simplesmente ${PDF_DIR}/arquivo.pdf (detecta pelo nome)\n`);
    return;
  }

  // 3. Fase de detecção (dry-run mostra mas não processa)
  const plan = [];

  for (const file of files) {
    const brand = forceBrand
      || detectBrandFromFolderPath(file.relativePath)
      || detectBrandFromFilename(file.originalName)
      || null;
    const model = detectModelFromPath(file.relativePath, brand);

    plan.push({
      ...file,
      detectedBrand: brand,
      detectedModel: model,
      needsContentDetection: !brand,
    });
  }

  // Mostra plano
  console.log('┌─────────────────────────────────────────────────────────┐');
  console.log('│  PLANO DE INGESTÃO                                     │');
  console.log('├─────────────────────────────────────────────────────────┤');
  for (const item of plan) {
    const brandLabel = item.detectedBrand || '❓ (detectar pelo conteúdo)';
    const modelLabel = item.detectedModel || '-';
    console.log(`│ 📄 ${item.originalName.slice(0, 50).padEnd(50)} │`);
    console.log(`│    Marca: ${brandLabel.padEnd(20)} Modelo: ${modelLabel.padEnd(15)}│`);
  }
  console.log('└─────────────────────────────────────────────────────────┘\n');

  if (dryRun) {
    console.log('🏁 Dry-run finalizado. Use sem --dry-run para executar.\n');
    return;
  }

  // 4. Remove chunks antigos
  const sourcesToRemove = plan.map(p => p.originalName);
  console.log(`🧹 Removendo chunks antigos de ${sourcesToRemove.length} fontes...`);
  const removal = await removeSources(sourcesToRemove);
  console.log(`   Removidos: ${removal.removed} chunks\n`);

  // 5. Processa cada PDF
  let totalChunks = 0;
  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < plan.length; i++) {
    const item = plan[i];
    console.log(`\n📄 [${i + 1}/${plan.length}] ${item.originalName}`);

    try {
      // Extrai texto
      const extracted = await extractTextWithOCR(item.fullPath, (progress) => {
        if (progress.phase === 'ocr') {
          process.stdout.write(`\r   🔤 ${progress.message}`);
        }
      });

      if (extracted.ocrUsed) {
        console.log(`\n   🔤 OCR: +${extracted.ocrChars} chars de imagens`);
      }

      // Detecta marca pelo conteúdo se não detectou pelo nome/pasta
      let brand = item.detectedBrand;
      if (!brand) {
        brand = detectBrandFromContent(extracted.text);
        if (brand) {
          console.log(`   🏷️  Marca detectada pelo conteúdo: ${brand}`);
        } else {
          console.log('   ⚠️  Marca NÃO detectada — chunks serão indexados sem filtro de marca');
        }
      } else {
        console.log(`   🏷️  Marca: ${brand}`);
      }

      const model = item.detectedModel;
      if (model) console.log(`   📋 Modelo: ${model}`);

      // Cria chunks com metadados
      const chunks = splitTextIntoChunks(extracted.text, {
        source: item.originalName,
        filePath: item.fullPath,
        numPages: extracted.numPages,
        title: extracted.info?.Title || item.originalName.replace('.pdf', ''),
        brandName: brand || null,
        model_id: model || null,
        ocrUsed: extracted.ocrUsed || false,
        reindexedAt: new Date().toISOString(),
      });

      if (chunks.length === 0) {
        console.log('   ⚠️  Nenhum chunk gerado');
        continue;
      }

      // Gera embeddings
      const texts = chunks.map(c => c.content);
      const embeddings = await generateEmbeddings(texts, (progress) => {
        process.stdout.write(`\r   🧠 Embeddings: ${progress.percentage}% (${progress.current}/${progress.total})`);
      });

      // Filtra falhas
      const validChunks = [];
      const validEmbeddings = [];
      for (let j = 0; j < chunks.length; j++) {
        if (embeddings[j]) {
          validChunks.push(chunks[j]);
          validEmbeddings.push(embeddings[j]);
        }
      }

      console.log(`\n   💾 Salvando ${validChunks.length} chunks...`);
      await addDocuments(validChunks, validEmbeddings);
      totalChunks += validChunks.length;
      successCount++;
      console.log(`   ✅ OK (${validChunks.length} chunks de ${extracted.numPages} páginas)`);

    } catch (err) {
      errorCount++;
      console.error(`   ❌ Erro: ${err.message}`);
    }
  }

  // 6. Resultado final
  const stats = await getStats();
  const duration = Math.round((Date.now() - startTime) / 1000);

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('                    ✨ CONCLUÍDO!                          ');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`   ✅ PDFs processados: ${successCount}/${plan.length}`);
  if (errorCount > 0) console.log(`   ❌ Erros: ${errorCount}`);
  console.log(`   📄 Chunks adicionados: ${totalChunks}`);
  console.log(`   📦 Total no banco: ${stats.totalDocuments}`);
  console.log(`   ⏱️  Tempo: ${duration}s`);
  console.log('═══════════════════════════════════════════════════════════\n');
}

main().catch(err => {
  console.error('❌ Erro fatal:', err);
  process.exit(1);
});
