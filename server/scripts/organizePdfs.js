/**
 * Organiza PDFs em subpastas por Marca/Modelo (safe + dry-run por padrão).
 *
 * Uso:
 *   node scripts/organizePdfs.js --dry-run
 *   node scripts/organizePdfs.js --apply
 *
 * Variáveis:
 *   PDF_DIR: diretório raiz (default: server/data/pdfs)
 */

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const PDF_DIR = process.env.PDF_PATH || path.join(__dirname, '..', 'data', 'pdfs');

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function listPdfFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      out.push(...listPdfFiles(full));
    } else if (ent.isFile() && ent.name.toLowerCase().endsWith('.pdf')) {
      out.push(full);
    }
  }
  return out;
}

function getOriginalNameFromDiskFilename(filename) {
  return filename.replace(/^\d+-\d+-/, '');
}

function sanitizeFolderName(name) {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9 _.-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 80) || 'Unknown';
}

function detectBrand(originalName) {
  const n = originalName.toLowerCase();
  if (/(^|\b)orona(\b|$)/i.test(originalName) || /arca\s*i{1,3}/i.test(originalName)) return 'Orona';
  if (/(^|\b)otis(\b|$)/i.test(originalName) || /gen2|lcb|mcss|gdc|urm|adv\s*210|ovf|vw2|lva/i.test(n)) return 'Otis';
  if (/schindler|miconic|bx/i.test(n)) return 'Schindler';
  if (/thyssen|tk\b|tke/i.test(n)) return 'Thyssenkrupp';
  if (/atlas/i.test(n)) return 'Atlas';
  return '_Unsorted';
}

function detectModel(brand, originalName) {
  const n = originalName.toLowerCase();
  if (brand === 'Orona') {
    const m = /arca\s*(i{1,3}|iv|v|vi|\d+)/i.exec(originalName);
    if (m) return `Arca ${m[1].toUpperCase()}`;
    return 'Geral';
  }
  if (brand === 'Otis') {
    if (/gen\s*2|gen2/i.test(n)) return 'Gen2';
    if (/lva/i.test(n)) return 'LVA';
    if (/lcb\s*ii|lcbii/i.test(n)) return 'LCBII';
    if (/adv\s*210/i.test(n)) return 'ADV 210';
    if (/ovf\s*10|ovf10/i.test(n)) return 'OVF10';
    if (/ovf\s*20|ovf20/i.test(n)) return 'OVF20';
    return 'Geral';
  }
  if (brand === 'Schindler') {
    if (/miconic\s*bx|\bbx\b/i.test(n)) return 'Miconic BX';
    if (/miconic\s*lx|\blx\b/i.test(n)) return 'Miconic LX';
    if (/3300/i.test(n)) return '3300';
    return 'Geral';
  }
  return 'Geral';
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function uniqueDestPath(destPath) {
  if (!fs.existsSync(destPath)) return destPath;
  const dir = path.dirname(destPath);
  const base = path.basename(destPath, '.pdf');
  let i = 2;
  while (true) {
    const candidate = path.join(dir, `${base} (${i}).pdf`);
    if (!fs.existsSync(candidate)) return candidate;
    i++;
  }
}

async function main() {
  const apply = hasFlag('--apply');
  const dryRun = !apply;

  const files = listPdfFiles(PDF_DIR);
  console.log(`📂 PDF_DIR: ${PDF_DIR}`);
  console.log(`📄 PDFs encontrados: ${files.length}`);
  console.log(dryRun ? '🧪 DRY-RUN (não move nada)' : '🚚 APPLY (vai mover arquivos)');

  let moved = 0;
  for (const fullPath of files) {
    const diskName = path.basename(fullPath);
    const originalName = getOriginalNameFromDiskFilename(diskName);

    const brand = sanitizeFolderName(detectBrand(originalName));
    const model = sanitizeFolderName(detectModel(brand, originalName));

    // Não mexe em arquivos já organizados corretamente
    const rel = path.relative(PDF_DIR, fullPath);
    const parts = rel.split(path.sep);
    const already = parts.length >= 3 && parts[0] === brand && parts[1] === model;
    if (already) continue;

    const destDir = path.join(PDF_DIR, brand, model);
    ensureDir(destDir);

    const destPathRaw = path.join(destDir, diskName);
    const destPath = uniqueDestPath(destPathRaw);

    console.log(`- ${rel}  ->  ${path.relative(PDF_DIR, destPath)}`);

    if (!dryRun) {
      fs.renameSync(fullPath, destPath);
      moved++;
    }
  }

  console.log(dryRun ? '\n✅ DRY-RUN concluído.' : `\n✅ Concluído. Arquivos movidos: ${moved}`);
  console.log('Obs: o backend já suporta subpastas (listagem/duplicatas/ingest/reindex).');
}

main().catch((e) => {
  console.error('❌ Erro:', e);
  process.exit(1);
});
