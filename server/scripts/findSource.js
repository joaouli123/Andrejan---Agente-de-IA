import { createReadStream } from 'fs';
import JSONStream from 'JSONStream';

const sources = new Set();
const stream = createReadStream('data/vectors.json');
const parser = JSONStream.parse('metadatas.*');

parser.on('data', (m) => {
  if (m && m.source) sources.add(m.source);
});

parser.on('end', () => {
  const arr = [...sources].sort();
  console.log('Total unique sources:', arr.length);
  
  // Search for ELETEM
  const eletem = arr.filter(s => s.toLowerCase().includes('eletem'));
  console.log('\nELETEM matches:', eletem.length);
  eletem.forEach(s => console.log('  ', s));
  
  // Search for TÉCNICO / TECNICO
  const tecnico = arr.filter(s => s.toLowerCase().includes('cnico'));
  console.log('\nTÉCNICO matches:', tecnico.length);
  tecnico.forEach(s => console.log('  ', s));
  
  // Search for CME
  const cme = arr.filter(s => s.toLowerCase().includes('cme'));
  console.log('\nCME matches:', cme.length);
  cme.forEach(s => console.log('  ', s));

  // Test hasSource logic
  const testName = 'ELETEM MANUAL TÉCNICO CME 101 CAVF.pdf';
  const nameLower = testName.toLowerCase();
  console.log('\n--- Testing hasSource logic ---');
  console.log('Looking for:', testName);
  console.log('nameLower:', nameLower);
  
  const match = arr.find(source => {
    const src = source.toLowerCase();
    const result = src === nameLower || src.includes(nameLower) || nameLower.includes(src);
    if (src.includes('eletem') || src.includes('cme')) {
      console.log(`  Comparing with: "${source}"`);
      console.log(`    src.toLowerCase() = "${src}"`);
      console.log(`    src === nameLower: ${src === nameLower}`);
      console.log(`    src.includes(nameLower): ${src.includes(nameLower)}`);
      console.log(`    nameLower.includes(src): ${nameLower.includes(src)}`);
      console.log(`    RESULT: ${result}`);
    }
    return result;
  });
  
  console.log('\nMatch found:', match || 'NONE');
});

stream.pipe(parser);
