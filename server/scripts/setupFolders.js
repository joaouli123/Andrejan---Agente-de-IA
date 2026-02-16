#!/usr/bin/env node
/**
 * Setup de pasta por marca para o sistema de "prateleiras com cadeado".
 *
 * O que faz:
 *   1. Cria a estrutura /pdfs/Marca/ para cada marca conhecida
 *   2. Move PDFs soltos (raiz de /pdfs/) para a pasta da marca detectada
 *   3. Mostra relatório do que foi movido
 *
 * Uso:
 *   node scripts/setupFolders.js                 # Cria pastas + move PDFs
 *   node scripts/setupFolders.js --dry-run       # Apenas mostra o que faria
 *   node scripts/setupFolders.js --list          # Lista PDFs e suas marcas detectadas
 *
 * Depois de rodar este script, faça:
 *   node scripts/reindexWithBrands.js --clear
 */

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const PDF_DIR = process.env.PDF_PATH || path.join(__dirname, '..', 'data', 'pdfs');

// ═══ Marcas e padrões de detecção ═══
const BRANDS = [
  { name: 'Otis',        patterns: [/\botis\b/i, /\bgen\s*2\b/i, /\bgecb\b/i, /\blcb\s*i{0,2}\b/i, /\bmcss\b/i, /\bmcp\b/i, /\bgmux\b/i] },
  { name: 'Orona',       patterns: [/\borona\b/i, /\barca\b/i] },
  { name: 'Schindler',   patterns: [/\bschindler\b/i, /\b(3300|5500|7000)\b/] },
  { name: 'Sectron',     patterns: [/\bsectron\b/i, /\badv[\s-]*\d+/i] },
  { name: 'ThyssenKrupp', patterns: [/\bthyssen\b/i, /\btke?\b/i] },
  { name: 'Atlas',       patterns: [/\batlas\b/i] },
];

function detectBrand(filename) {
  const clean = filename.replace(/^\d+-\d+-/, ''); // remove multer prefix
  for (const brand of BRANDS) {
    if (brand.patterns.some(p => p.test(clean))) return brand.name;
  }
  return null;
}

function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('     📂 ELEVEX - SETUP DE PASTAS POR MARCA               ');
  console.log('═══════════════════════════════════════════════════════════\n');

  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const listOnly = args.includes('--list');

  if (dryRun) console.log('ℹ️  Modo DRY-RUN: não move nada\n');

  // 1. Cria pastas de marca
  console.log(`📁 Diretório base: ${PDF_DIR}\n`);
  
  if (!fs.existsSync(PDF_DIR)) {
    fs.mkdirSync(PDF_DIR, { recursive: true });
    console.log('   Criado diretório base\n');
  }

  for (const brand of BRANDS) {
    const brandDir = path.join(PDF_DIR, brand.name);
    if (!fs.existsSync(brandDir)) {
      if (!dryRun && !listOnly) {
        fs.mkdirSync(brandDir, { recursive: true });
        console.log(`   ✅ Criada pasta: ${brand.name}/`);
      } else {
        console.log(`   📂 Criaria pasta: ${brand.name}/`);
      }
    } else {
      console.log(`   ✓  Já existe: ${brand.name}/`);
    }
  }

  // Pasta para não-detectados
  const unknownDir = path.join(PDF_DIR, '_sem_marca');
  if (!fs.existsSync(unknownDir) && !dryRun && !listOnly) {
    fs.mkdirSync(unknownDir, { recursive: true });
  }

  // 2. Lista PDFs soltos na raiz
  const rootFiles = fs.readdirSync(PDF_DIR, { withFileTypes: true })
    .filter(e => e.isFile() && e.name.toLowerCase().endsWith('.pdf'))
    .map(e => e.name);

  console.log(`\n📄 PDFs na raiz: ${rootFiles.length}\n`);

  if (rootFiles.length === 0) {
    console.log('   Nenhum PDF solto na raiz. Tudo organizado! ✨\n');
    showSummary();
    return;
  }

  // 3. Classifica e move
  const moved = { total: 0, byBrand: {} };

  for (const filename of rootFiles) {
    const brand = detectBrand(filename);
    const cleanName = filename.replace(/^\d+-\d+-/, '');
    const targetDir = brand ? path.join(PDF_DIR, brand) : unknownDir;
    const targetLabel = brand || '_sem_marca';

    console.log(`   📄 ${cleanName}`);
    console.log(`      → ${targetLabel}/`);

    if (!listOnly && !dryRun) {
      const src = path.join(PDF_DIR, filename);
      const dst = path.join(targetDir, filename);
      
      if (fs.existsSync(dst)) {
        console.log(`      ⚠️  Já existe no destino, pulando`);
        continue;
      }

      fs.renameSync(src, dst);
      console.log(`      ✅ Movido!`);
    }

    moved.total++;
    moved.byBrand[targetLabel] = (moved.byBrand[targetLabel] || 0) + 1;
  }

  // 4. Resumo
  console.log('\n───────────────────────────────────────────────────────────');
  console.log(`   ${dryRun || listOnly ? 'Moveria' : 'Movidos'}: ${moved.total} PDFs`);
  for (const [brand, count] of Object.entries(moved.byBrand)) {
    console.log(`     ${brand}: ${count}`);
  }
  console.log('───────────────────────────────────────────────────────────\n');

  showSummary();
}

function showSummary() {
  console.log('📊 Estrutura atual:');
  
  if (!fs.existsSync(PDF_DIR)) {
    console.log('   (diretório não existe)\n');
    return;
  }

  const entries = fs.readdirSync(PDF_DIR, { withFileTypes: true });
  
  for (const ent of entries) {
    if (ent.isDirectory()) {
      const dirPath = path.join(PDF_DIR, ent.name);
      const pdfs = countPdfsRecursive(dirPath);
      const icon = pdfs > 0 ? '📂' : '📁';
      console.log(`   ${icon} ${ent.name}/ (${pdfs} PDFs)`);
    } else if (ent.isFile() && ent.name.toLowerCase().endsWith('.pdf')) {
      console.log(`   📄 ${ent.name} (raiz - não organizado)`);
    }
  }
  
  console.log('\n💡 Próximo passo: node scripts/reindexWithBrands.js --clear');
  console.log('   Isso re-indexa tudo com os metadados de marca.\n');
}

function countPdfsRecursive(dir) {
  let count = 0;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const ent of entries) {
    if (ent.isDirectory()) {
      count += countPdfsRecursive(path.join(dir, ent.name));
    } else if (ent.isFile() && ent.name.toLowerCase().endsWith('.pdf')) {
      count++;
    }
  }
  return count;
}

main();
