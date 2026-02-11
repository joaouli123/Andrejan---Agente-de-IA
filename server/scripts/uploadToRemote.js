/**
 * Script para enviar vectors.json local para servidor remoto (Railway)
 * Lê o arquivo em streaming e envia em lotes via /api/import-data
 * 
 * Uso:
 *   node scripts/uploadToRemote.js https://elevex.uxcodedev.com.br [ADMIN_API_KEY]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createReadStream } from 'fs';
import JSONStream from 'JSONStream';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const VECTORS_FILE = path.join(__dirname, '..', 'data', 'vectors.json');
const APPEND_FILE = path.join(__dirname, '..', 'data', 'vectors_append.ndjson');

const SERVER_URL = process.argv[2];
const ADMIN_KEY = process.argv[3] || '';
const BATCH_SIZE = 200; // documentos por lote
const DELAY_MS = 500;   // pausa entre lotes para não sobrecarregar

if (!SERVER_URL) {
  console.error('❌ Uso: node scripts/uploadToRemote.js <URL_DO_SERVIDOR> [ADMIN_API_KEY]');
  console.error('   Exemplo: node scripts/uploadToRemote.js https://elevex.uxcodedev.com.br');
  process.exit(1);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function sendBatch(batch, batchNum) {
  const ndjson = batch.map(doc => JSON.stringify(doc)).join('\n');
  
  const headers = { 'Content-Type': 'text/plain' };
  if (ADMIN_KEY) headers['x-api-key'] = ADMIN_KEY;
  
  const res = await fetch(`${SERVER_URL}/api/import-data`, {
    method: 'POST',
    headers,
    body: ndjson
  });
  
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  
  return await res.json();
}

async function main() {
  console.log('\n🚀 Elevex Data Upload Tool');
  console.log(`   Servidor: ${SERVER_URL}`);
  console.log(`   Arquivo: ${VECTORS_FILE}`);
  
  // Verificar se o arquivo existe
  if (!fs.existsSync(VECTORS_FILE)) {
    console.error(`❌ Arquivo não encontrado: ${VECTORS_FILE}`);
    process.exit(1);
  }
  
  const fileSize = (fs.statSync(VECTORS_FILE).size / 1024 / 1024).toFixed(0);
  console.log(`   Tamanho: ${fileSize} MB\n`);
  
  // Verificar saúde do servidor
  try {
    const healthRes = await fetch(`${SERVER_URL}/api/health`);
    const health = await healthRes.json();
    console.log(`✅ Servidor online: ${health.status}`);
  } catch (e) {
    console.error(`❌ Servidor inacessível: ${e.message}`);
    process.exit(1);
  }
  
  // Carregar dados via streaming
  console.log('\n📖 Lendo vectors.json via streaming...');
  
  const loadArray = (key) => {
    return new Promise((resolve, reject) => {
      const stream = createReadStream(VECTORS_FILE);
      const parser = JSONStream.parse(`${key}.*`);
      const items = [];
      
      parser.on('data', (item) => items.push(item));
      parser.on('end', () => resolve(items));
      parser.on('error', reject);
      stream.on('error', reject);
      
      stream.pipe(parser);
    });
  };
  
  console.log('   📖 Carregando IDs...');
  const ids = await loadArray('ids');
  
  console.log('   📖 Carregando documentos...');
  const documents = await loadArray('documents');
  
  console.log('   📖 Carregando metadados...');
  const metadatas = await loadArray('metadatas');
  
  console.log('   📖 Carregando embeddings...');
  const embeddings = await loadArray('embeddings');
  
  const total = ids.length;
  console.log(`\n📊 Total: ${total} documentos`);
  
  // Carregar também dados do append file (se existir)
  let appendDocs = [];
  if (fs.existsSync(APPEND_FILE)) {
    const content = fs.readFileSync(APPEND_FILE, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim());
    for (const line of lines) {
      try {
        appendDocs.push(JSON.parse(line));
      } catch {}
    }
    console.log(`📥 + ${appendDocs.length} documentos do append file`);
  }
  
  // Enviar em lotes
  const totalBatches = Math.ceil(total / BATCH_SIZE);
  console.log(`\n📤 Enviando em ${totalBatches} lotes de ${BATCH_SIZE}...\n`);
  
  let sent = 0;
  let errors = 0;
  const startTime = Date.now();
  
  for (let i = 0; i < total; i += BATCH_SIZE) {
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const end = Math.min(i + BATCH_SIZE, total);
    
    const batch = [];
    for (let j = i; j < end; j++) {
      batch.push({
        id: ids[j],
        document: documents[j],
        metadata: metadatas[j],
        embedding: embeddings[j]
      });
    }
    
    try {
      const result = await sendBatch(batch, batchNum);
      sent += result.imported;
      errors += result.errors;
      
      const pct = ((batchNum / totalBatches) * 100).toFixed(1);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      const eta = batchNum > 0 ? ((elapsed / batchNum) * (totalBatches - batchNum)).toFixed(0) : '?';
      
      process.stdout.write(`\r   📤 Lote ${batchNum}/${totalBatches} (${pct}%) | ${sent} enviados | ${elapsed}s decorridos | ETA: ${eta}s   `);
      
      if (i + BATCH_SIZE < total) {
        await sleep(DELAY_MS);
      }
    } catch (e) {
      console.error(`\n   ❌ Erro no lote ${batchNum}: ${e.message}`);
      errors += batch.length;
      // Continua tentando os próximos lotes
      await sleep(2000);
    }
  }
  
  // Enviar dados do append file
  if (appendDocs.length > 0) {
    console.log(`\n\n📤 Enviando ${appendDocs.length} documentos do append...`);
    for (let i = 0; i < appendDocs.length; i += BATCH_SIZE) {
      const batch = appendDocs.slice(i, i + BATCH_SIZE);
      try {
        const result = await sendBatch(batch);
        sent += result.imported;
      } catch (e) {
        console.error(`   ❌ Erro no append batch: ${e.message}`);
      }
    }
  }
  
  // Compactar no servidor (merge append → vectors.json)
  console.log('\n\n🗃️  Compactando no servidor...');
  try {
    const headers = {};
    if (ADMIN_KEY) headers['x-api-key'] = ADMIN_KEY;
    const compactRes = await fetch(`${SERVER_URL}/api/compact`, {
      method: 'POST',
      headers
    });
    const compactResult = await compactRes.json();
    console.log(`   ✅ ${compactResult.message}`);
  } catch (e) {
    console.warn(`   ⚠️ Compactação falhou: ${e.message} (dados ainda estão no append file)`);
  }
  
  const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n🎉 Upload concluído!`);
  console.log(`   ✅ ${sent} documentos enviados em ${totalElapsed}s`);
  if (errors > 0) console.log(`   ⚠️ ${errors} erros`);
  
  // Verificar stats no servidor
  try {
    const headers = {};
    if (ADMIN_KEY) headers['x-api-key'] = ADMIN_KEY;
    const statsRes = await fetch(`${SERVER_URL}/api/stats`, { headers });
    const stats = await statsRes.json();
    console.log(`   📊 Total no servidor: ${stats.totalDocuments} documentos`);
  } catch {}
}

main().catch(e => {
  console.error('\n❌ Erro fatal:', e.message);
  process.exit(1);
});
