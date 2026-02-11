/**
 * Verifica quais PDFs da pasta foram indexados no vectors.json
 * Usa streaming para lidar com arquivos grandes (>1GB)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const VECTORS_FILE = path.join(__dirname, '..', 'data', 'vectors.json');
const PDF_DIR = path.join(__dirname, '..', 'data', 'pdfs');

async function main() {
  console.log('📊 Verificando PDFs indexados...\n');

  // 1. Extrair sources do vectors.json via streaming (regex line-by-line)
  const sources = new Set();
  const stream = fs.createReadStream(VECTORS_FILE, { encoding: 'utf-8', highWaterMark: 64 * 1024 });
  
  let buffer = '';
  const sourceRegex = /"source"\s*:\s*"([^"]+)"/g;

  await new Promise((resolve, reject) => {
    stream.on('data', (chunk) => {
      buffer += chunk;
      let match;
      while ((match = sourceRegex.exec(buffer)) !== null) {
        sources.add(match[1]);
      }
      // Keep last 1000 chars to handle matches split across chunks
      if (buffer.length > 2000) {
        buffer = buffer.slice(-1000);
        sourceRegex.lastIndex = 0;
      }
    });
    stream.on('end', resolve);
    stream.on('error', reject);
  });

  console.log(`✅ Sources indexadas no vector store: ${sources.size}`);
  const sortedSources = [...sources].sort();
  sortedSources.forEach((s, i) => console.log(`  ${i+1}. ${s}`));

  // 2. Listar PDFs na pasta
  const pdfs = fs.readdirSync(PDF_DIR).filter(f => f.toLowerCase().endsWith('.pdf'));
  const cleanPdfs = [...new Set(pdfs.map(f => f.replace(/^\d+-\d+-/, '')))].sort();
  
  console.log(`\n📁 PDFs únicos na pasta: ${cleanPdfs.length}`);

  // 3. Comparar: quais PDFs não estão indexados?
  const notIndexed = cleanPdfs.filter(p => {
    // Comparação case-insensitive e também com prefixo "otis "
    const pLower = p.toLowerCase();
    for (const s of sources) {
      if (s.toLowerCase() === pLower) return false;
      // Também checa se a source tem prefixo diferente
      const sClean = s.replace(/^\d+-\d+-/, '').toLowerCase();
      if (sClean === pLower) return false;
    }
    return true;
  });

  // 4. Quais sources estão no vector store mas não têm PDF na pasta?
  const extraSources = sortedSources.filter(s => {
    const sLower = s.toLowerCase();
    const sClean = s.replace(/^\d+-\d+-/, '').toLowerCase();
    return !cleanPdfs.some(p => p.toLowerCase() === sLower || p.toLowerCase() === sClean);
  });

  console.log(`\n${'='.repeat(60)}`);
  console.log(`📊 RESULTADO:`);
  console.log(`   PDFs na pasta:     ${cleanPdfs.length}`);
  console.log(`   Sources indexadas: ${sources.size}`);
  console.log(`   PDFs NÃO indexados: ${notIndexed.length}`);
  console.log(`   Sources extras (sem PDF na pasta): ${extraSources.length}`);
  console.log(`${'='.repeat(60)}`);

  if (notIndexed.length > 0) {
    console.log(`\n❌ PDFs FALTANDO NO ÍNDICE (precisam ser processados):`);
    notIndexed.forEach((n, i) => console.log(`  ${i+1}. ${n}`));
  } else {
    console.log(`\n🎉 TODOS os PDFs da pasta estão indexados!`);
  }

  if (extraSources.length > 0) {
    console.log(`\n📦 Sources no índice sem PDF correspondente na pasta:`);
    extraSources.forEach((s, i) => console.log(`  ${i+1}. ${s}`));
  }
}

main().catch(err => {
  console.error('Erro:', err.message);
  process.exit(1);
});
