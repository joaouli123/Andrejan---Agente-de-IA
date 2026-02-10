/**
 * Serviço do Banco de Vetores
 * Implementação simples em memória com persistência em arquivo JSON
 * (Alternativa ao ChromaDB para facilitar setup)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const DATA_FILE = path.join(__dirname, '..', 'data', 'vectors.json');

// Store em memória
let vectorStore = {
  documents: [],
  embeddings: [],
  metadatas: [],
  ids: []
};

/**
 * Carrega dados do arquivo
 */
function loadFromFile() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = fs.readFileSync(DATA_FILE, 'utf-8');
      vectorStore = JSON.parse(data);
      console.log(`📦 Carregados ${vectorStore.documents.length} documentos do arquivo`);
    }
  } catch (error) {
    console.error('Erro ao carregar dados:', error);
  }
}

/**
 * Salva dados no arquivo
 */
function saveToFile() {
  try {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(vectorStore, null, 2));
  } catch (error) {
    console.error('Erro ao salvar dados:', error);
  }
}

/**
 * Inicializa o banco de vetores
 */
export async function initializeChroma() {
  loadFromFile();
  console.log(`📦 Vector store inicializado com ${vectorStore.documents.length} documentos`);
  return vectorStore;
}

/**
 * Calcula similaridade de cosseno
 */
function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Adiciona documentos ao banco de vetores
 */
export async function addDocuments(chunks, embeddings) {
  for (let i = 0; i < chunks.length; i++) {
    vectorStore.ids.push(chunks[i].id);
    vectorStore.documents.push(chunks[i].content);
    vectorStore.metadatas.push(chunks[i].metadata);
    vectorStore.embeddings.push(embeddings[i]);
  }
  
  saveToFile();
  console.log(`✅ Adicionados ${chunks.length} documentos ao banco de vetores`);
  return true;
}

/**
 * Busca documentos similares a uma query
 * @param {number[]} queryEmbedding - Embedding da query
 * @param {number} topK - Quantidade de resultados
 * @param {string} [brandFilter] - Nome da marca para filtrar documentos (match parcial, case-insensitive)
 */
export async function searchSimilar(queryEmbedding, topK = 5, brandFilter = null) {
  if (vectorStore.embeddings.length === 0) {
    return [];
  }

  // Determina quais índices considerar (filtro por marca)
  let candidateIndices;
  if (brandFilter) {
    const filterLower = brandFilter.toLowerCase();
    candidateIndices = [];
    for (let i = 0; i < vectorStore.metadatas.length; i++) {
      const meta = vectorStore.metadatas[i];
      const source = (meta?.source || '').toLowerCase();
      const brand = (meta?.brandName || '').toLowerCase();
      if (source.includes(filterLower) || brand.includes(filterLower)) {
        candidateIndices.push(i);
      }
    }
    console.log(`🔍 Brand filter '${brandFilter}': ${candidateIndices.length}/${vectorStore.embeddings.length} docs match`);
    
    // Se nenhum doc corresponde ao filtro, busca em todos (fallback)
    if (candidateIndices.length === 0) {
      console.log(`⚠️ Nenhum doc encontrado para brand '${brandFilter}', buscando em todos`);
      candidateIndices = vectorStore.embeddings.map((_, i) => i);
    }
  } else {
    candidateIndices = vectorStore.embeddings.map((_, i) => i);
  }

  // Calcula similaridade apenas nos candidatos
  const similarities = candidateIndices.map(idx => ({
    index: idx,
    similarity: cosineSimilarity(queryEmbedding, vectorStore.embeddings[idx])
  }));

  // Ordena por similaridade (maior primeiro)
  similarities.sort((a, b) => b.similarity - a.similarity);

  // Retorna os top K
  const topResults = similarities.slice(0, topK);

  return topResults.map(item => ({
    content: vectorStore.documents[item.index],
    metadata: vectorStore.metadatas[item.index],
    similarity: item.similarity,
    distance: 1 - item.similarity
  }));
}

/**
 * Retorna estatísticas do banco de vetores
 */
export async function getStats() {
  return {
    totalDocuments: vectorStore.documents.length,
    collectionName: 'elevex_documents'
  };
}

/**
 * Limpa toda a coleção
 */
export async function clearCollection() {
  vectorStore = {
    documents: [],
    embeddings: [],
    metadatas: [],
    ids: []
  };
  saveToFile();
  console.log('🗑️ Banco de vetores limpo');
}

export default {
  initializeChroma,
  addDocuments,
  searchSimilar,
  getStats,
  clearCollection
};
