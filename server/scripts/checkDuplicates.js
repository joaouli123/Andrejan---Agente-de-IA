import { createReadStream } from 'fs';
import JSONStream from 'JSONStream';

const sources = {};
const stream = createReadStream('data/vectors.json');
const parser = JSONStream.parse('metadatas.*');

let sampleShown = false;
parser.on('data', (m) => {
  if (!sampleShown) {
    console.log('Sample metadata:', JSON.stringify(m));
    sampleShown = true;
  }
  const src = m.source || m.fileName || m.file || m.name || JSON.stringify(m);
  if (!sources[src]) sources[src] = { count: 0, brand: m.brandName || m.brand || 'NONE' };
  sources[src].count++;
});

parser.on('end', () => {
  const entries = Object.entries(sources);
  console.log('Total unique sources:', entries.length);
  
  // Group by brand
  const byBrand = {};
  entries.forEach(([name, info]) => {
    if (!byBrand[info.brand]) byBrand[info.brand] = [];
    byBrand[info.brand].push({ name, chunks: info.count });
  });
  
  Object.entries(byBrand).forEach(([brand, files]) => {
    console.log(`\n--- ${brand} (${files.length} arquivos) ---`);
  });
  
  // Check for duplicate-looking names in Otis
  const otisFiles = (byBrand['Otis'] || []).map(f => f.name).sort();
  console.log(`\nOtis files total: ${otisFiles.length}`);
  
  // Find duplicates by cleaned name (remove multer timestamp prefix)
  const cleaned = {};
  otisFiles.forEach(name => {
    // Remove timestamp prefix like 1739106789959-123456789-
    const clean = name.replace(/^\d+-\d+-/, '');
    if (!cleaned[clean]) cleaned[clean] = [];
    cleaned[clean].push(name);
  });
  
  const dupes = Object.entries(cleaned).filter(([k, v]) => v.length > 1);
  const unique = Object.keys(cleaned).length;
  console.log(`Unique original names: ${unique}`);
  console.log(`Duplicated names: ${dupes.length}`);
  
  if (dupes.length > 0) {
    console.log('\n=== DUPLICADOS ===');
    dupes.forEach(([clean, names]) => {
      console.log(`\n  DUPE: ${clean} (${names.length}x)`);
      names.forEach(n => console.log(`    -> ${n}`));
    });
  }
  
  // Also show total chunks per brand
  console.log('\n=== CHUNKS POR MARCA ===');
  Object.entries(byBrand).forEach(([brand, files]) => {
    const totalChunks = files.reduce((s, f) => s + f.chunks, 0);
    console.log(`  ${brand}: ${files.length} arquivos, ${totalChunks} chunks`);
  });
});

stream.pipe(parser);
