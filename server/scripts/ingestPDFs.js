/**
 * Script de Ingestão de PDFs
 * Processa todos os PDFs da pasta e adiciona ao banco de vetores
 */

import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { processDirectory } from '../services/pdfExtractor.js';
import { generateEmbeddings } from '../services/embeddingService.js';
import { initializeChroma, addDocuments, getStats, clearCollection } from '../services/vectorStore.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const PDF_DIR = process.env.PDF_PATH || path.join(__dirname, '..', 'data', 'pdfs');

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('           🚀 ELEVEX - INGESTÃO DE DOCUMENTOS              ');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  const startTime = Date.now();
  
  try {
    // 1. Inicializa o banco de vetores
    console.log('📦 Inicializando banco de vetores...');
    await initializeChroma();
    
    // Pergunta se deve limpar a coleção existente
    const args = process.argv.slice(2);
    if (args.includes('--clear')) {
      console.log('🗑️ Limpando coleção existente...');
      await clearCollection();
    }
    
    // 2. Processa os PDFs
    console.log(`\n📂 Diretório de PDFs: ${PDF_DIR}\n`);
    const chunks = await processDirectory(PDF_DIR, (progress) => {
      // Callback de progresso
    });
    
    if (chunks.length === 0) {
      console.log('\n⚠️ Nenhum PDF encontrado para processar!');
      console.log(`   Coloque seus arquivos PDF em: ${PDF_DIR}`);
      return;
    }
    
    // 3. Gera embeddings
    console.log('\n🧠 Gerando embeddings (isso pode demorar)...\n');
    const texts = chunks.map(c => c.content);
    const embeddings = await generateEmbeddings(texts, (progress) => {
      process.stdout.write(`\r   Progresso: ${progress.percentage}% (${progress.current}/${progress.total})`);
    });
    
    // Filtra chunks que falharam
    const validChunks = [];
    const validEmbeddings = [];
    for (let i = 0; i < chunks.length; i++) {
      if (embeddings[i]) {
        validChunks.push(chunks[i]);
        validEmbeddings.push(embeddings[i]);
      }
    }
    
    console.log(`\n\n✅ Embeddings gerados: ${validEmbeddings.length}/${chunks.length}`);
    
    // 4. Adiciona ao banco de vetores
    console.log('\n💾 Salvando no banco de vetores...');
    await addDocuments(validChunks, validEmbeddings);
    
    // 5. Mostra estatísticas finais
    const stats = await getStats();
    const endTime = Date.now();
    const duration = Math.round((endTime - startTime) / 1000);
    
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('                    ✨ CONCLUÍDO!                          ');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`   📄 Documentos processados: ${validChunks.length}`);
    console.log(`   📦 Total no banco: ${stats.totalDocuments}`);
    console.log(`   ⏱️ Tempo total: ${duration} segundos`);
    console.log('═══════════════════════════════════════════════════════════\n');
    
  } catch (error) {
    console.error('\n❌ Erro durante a ingestão:', error);
    process.exit(1);
  }
}

main();
