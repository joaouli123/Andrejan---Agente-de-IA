/**
 * Serviço do Banco de Vetores
 * Implementação simples em memória com persistência em arquivo JSON
 * (Alternativa ao ChromaDB para facilitar setup)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createReadStream } from 'fs';
import JSONStream from 'JSONStream';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const DATA_FILE = path.join(__dirname, '..', 'data', 'vectors.json');
const APPEND_FILE = path.join(__dirname, '..', 'data', 'vectors_append.ndjson');

// Store em memória
let vectorStore = {
  documents: [],
  embeddings: [],
  metadatas: [],
  ids: []
};

// Status de carregamento
let _isLoading = false;
let _loadingProgress = '';

export function isLoading() { return _isLoading; }
export function getLoadingProgress() { return _loadingProgress; }

/**
 * Carrega dados do arquivo usando streaming JSON para suportar arquivos >500MB
 */
async function loadFromFile() {
  try {
    if (!fs.existsSync(DATA_FILE)) return;
    
    const fileSize = fs.statSync(DATA_FILE).size;
    const sizeMB = (fileSize / 1024 / 1024).toFixed(0);
    console.log(`📦 Carregando vector store (${sizeMB} MB) via streaming...`);
    
    const startTime = Date.now();
    
    _isLoading = true;
    _loadingProgress = 'Iniciando carregamento...';
    
    // Reset store
    vectorStore = { documents: [], embeddings: [], metadatas: [], ids: [] };
    
    // Parse each array separately using JSONStream
    const loadArray = (key) => {
      return new Promise((resolve, reject) => {
        const stream = createReadStream(DATA_FILE);
        const parser = JSONStream.parse(`${key}.*`);
        const items = [];
        
        parser.on('data', (item) => items.push(item));
        parser.on('end', () => resolve(items));
        parser.on('error', reject);
        stream.on('error', reject);
        
        stream.pipe(parser);
      });
    };
    
    // Load metadatas first (smallest, needed for brand filtering)
    _loadingProgress = 'Carregando metadados...';
    console.log(`   📖 Loading metadatas...`);
    vectorStore.metadatas = await loadArray('metadatas');
    
    _loadingProgress = `Carregando documentos (${vectorStore.metadatas.length} itens)...`;
    console.log(`   📖 Loading documents (${vectorStore.metadatas.length} items)...`);
    vectorStore.documents = await loadArray('documents');
    
    _loadingProgress = 'Carregando IDs...';
    console.log(`   📖 Loading ids...`);
    vectorStore.ids = await loadArray('ids');
    
    _loadingProgress = 'Carregando embeddings (etapa mais demorada)...';
    console.log(`   📖 Loading embeddings (this takes a moment)...`);
    vectorStore.embeddings = await loadArray('embeddings');
    
    _isLoading = false;
    _loadingProgress = '';
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`📦 Carregados ${vectorStore.documents.length} documentos em ${elapsed}s`);

    // Carrega documentos pendentes do NDJSON append (se houver)
    await loadAppendFile();

  } catch (error) {
    console.error('Erro ao carregar dados:', error.message);
    _isLoading = false;
    _loadingProgress = '';
    vectorStore = { documents: [], embeddings: [], metadatas: [], ids: [] };
  }
}

/**
 * Carrega documentos pendentes do arquivo NDJSON append
 */
async function loadAppendFile() {
  try {
    if (!fs.existsSync(APPEND_FILE)) return;
    const content = fs.readFileSync(APPEND_FILE, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim());
    if (lines.length === 0) return;
    
    console.log(`📥 Carregando ${lines.length} documentos pendentes do append...`);
    let loaded = 0;
    for (const line of lines) {
      try {
        const doc = JSON.parse(line);
        vectorStore.ids.push(doc.id);
        vectorStore.documents.push(doc.document);
        vectorStore.metadatas.push(doc.metadata);
        vectorStore.embeddings.push(doc.embedding);
        loaded++;
      } catch (e) {
        console.warn('   ⚠️ Linha inválida no append, ignorando');
      }
    }
    console.log(`   ✅ ${loaded} documentos adicionados do append`);
  } catch (error) {
    console.error('Erro ao carregar append file:', error.message);
  }
}

/**
 * Append incremental ao NDJSON (rápido! sem reescrita do JSON principal)
 */
function appendToNDJSON(chunks, embeddings) {
  try {
    const dir = path.dirname(APPEND_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    
    const lines = chunks.map((chunk, i) => JSON.stringify({
      id: chunk.id,
      document: chunk.content,
      metadata: chunk.metadata,
      embedding: embeddings[i]
    }));
    fs.appendFileSync(APPEND_FILE, lines.join('\n') + '\n');
  } catch (error) {
    console.error('Erro ao fazer append:', error.message);
    // Fallback: reescreve tudo
    saveToFile();
  }
}

/**
 * Compacta: merge tudo em vectors.json e limpa append
 */
export function compactStore() {
  console.log('🗃️  Compactando vector store...');
  saveToFile();
  if (fs.existsSync(APPEND_FILE)) {
    fs.unlinkSync(APPEND_FILE);
    console.log('   🗑️  Append file removido');
  }
  console.log(`   ✅ Compactado: ${vectorStore.documents.length} documentos em vectors.json`);
}

/**
 * Salva dados no arquivo usando streaming para evitar limite de string do V8
 */
function saveToFile() {
  try {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    // Streaming write para arquivos grandes (>200MB)
    const fd = fs.openSync(DATA_FILE, 'w');
    fs.writeSync(fd, '{"documents":[');
    for (let i = 0; i < vectorStore.documents.length; i++) {
      if (i > 0) fs.writeSync(fd, ',');
      fs.writeSync(fd, JSON.stringify(vectorStore.documents[i]));
    }
    fs.writeSync(fd, '],"embeddings":[');
    for (let i = 0; i < vectorStore.embeddings.length; i++) {
      if (i > 0) fs.writeSync(fd, ',');
      fs.writeSync(fd, JSON.stringify(vectorStore.embeddings[i]));
    }
    fs.writeSync(fd, '],"metadatas":[');
    for (let i = 0; i < vectorStore.metadatas.length; i++) {
      if (i > 0) fs.writeSync(fd, ',');
      fs.writeSync(fd, JSON.stringify(vectorStore.metadatas[i]));
    }
    fs.writeSync(fd, '],"ids":[');
    for (let i = 0; i < vectorStore.ids.length; i++) {
      if (i > 0) fs.writeSync(fd, ',');
      fs.writeSync(fd, JSON.stringify(vectorStore.ids[i]));
    }
    fs.writeSync(fd, ']}');
    fs.closeSync(fd);
  } catch (error) {
    console.error('Erro ao salvar dados:', error);
  }
}

/**
 * Inicializa o banco de vetores
 */
export async function initializeChroma() {
  await loadFromFile();
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
 * Adiciona documentos ao banco de vetores (append incremental)
 */
export async function addDocuments(chunks, embeddings) {
  for (let i = 0; i < chunks.length; i++) {
    vectorStore.ids.push(chunks[i].id);
    vectorStore.documents.push(chunks[i].content);
    vectorStore.metadatas.push(chunks[i].metadata);
    vectorStore.embeddings.push(embeddings[i]);
  }
  
  // Append incremental (muito mais rápido que reescrever tudo)
  appendToNDJSON(chunks, embeddings);
  
  // Auto-compact quando o append fica grande (>1000 docs pendentes)
  try {
    if (fs.existsSync(APPEND_FILE)) {
      const lines = fs.readFileSync(APPEND_FILE, 'utf-8').split('\n').filter(l => l.trim());
      if (lines.length > 1000) {
        console.log('📦 Auto-compactando (>1000 docs no append)...');
        compactStore();
      }
    }
  } catch {}
  
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

function tokenizeForLexical(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 2);
}

function bm25Score(queryTokens, docTokens, docFreqMap, totalDocs, avgDocLen, k1 = 1.5, b = 0.75) {
  if (!queryTokens.length || !docTokens.length) return 0;

  const tf = new Map();
  for (const t of docTokens) tf.set(t, (tf.get(t) || 0) + 1);

  const uniqueQuery = Array.from(new Set(queryTokens));
  let score = 0;
  const docLen = docTokens.length;

  for (const term of uniqueQuery) {
    const freq = tf.get(term) || 0;
    if (!freq) continue;

    const df = docFreqMap.get(term) || 0;
    const idf = Math.log(1 + (totalDocs - df + 0.5) / (df + 0.5));
    const denom = freq + k1 * (1 - b + b * (docLen / Math.max(1, avgDocLen)));
    score += idf * ((freq * (k1 + 1)) / Math.max(1e-9, denom));
  }

  return score;
}

/**
 * Busca lexical (BM25) para recuperação híbrida com o vetor.
 */
export async function searchLexical(query, topK = 10, brandFilter = null) {
  const queryTokens = tokenizeForLexical(query);
  if (queryTokens.length === 0 || vectorStore.documents.length === 0) return [];

  const candidates = [];
  const filterLower = (brandFilter || '').toLowerCase();

  for (let i = 0; i < vectorStore.documents.length; i++) {
    const meta = vectorStore.metadatas[i] || {};
    if (filterLower) {
      const source = String(meta?.source || '').toLowerCase();
      const brand = String(meta?.brandName || '').toLowerCase();
      if (!source.includes(filterLower) && !brand.includes(filterLower)) continue;
    }

    const content = vectorStore.documents[i] || '';
    const docTokens = tokenizeForLexical(content);
    if (!docTokens.length) continue;

    candidates.push({ index: i, content, metadata: meta, docTokens });
  }

  if (!candidates.length) return [];

  const totalDocs = candidates.length;
  const avgDocLen = candidates.reduce((sum, c) => sum + c.docTokens.length, 0) / totalDocs;
  const dfMap = new Map();

  for (const c of candidates) {
    const seen = new Set(c.docTokens);
    for (const term of seen) dfMap.set(term, (dfMap.get(term) || 0) + 1);
  }

  const scored = candidates.map(c => {
    const score = bm25Score(queryTokens, c.docTokens, dfMap, totalDocs, avgDocLen);
    return {
      content: c.content,
      metadata: c.metadata,
      similarity: score,
      distance: Math.max(0, 1 - score),
    };
  });

  return scored
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);
}

/**
 * Exporta corpus indexado para avaliação/diagnóstico.
 */
export async function exportCorpus(limit = 5000, brandFilter = null) {
  const out = [];
  const max = Math.max(1, Number(limit) || 5000);
  const filterLower = (brandFilter || '').toLowerCase();

  for (let i = 0; i < vectorStore.documents.length; i++) {
    const meta = vectorStore.metadatas[i] || {};
    if (filterLower) {
      const source = String(meta?.source || '').toLowerCase();
      const brand = String(meta?.brandName || '').toLowerCase();
      if (!source.includes(filterLower) && !brand.includes(filterLower)) continue;
    }

    out.push({
      id: vectorStore.ids[i],
      content: vectorStore.documents[i],
      metadata: meta,
    });

    if (out.length >= max) break;
  }

  return out;
}

/**
 * Normaliza string para comparação robusta
 * Remove TODOS os caracteres não-ASCII para lidar com encoding corrompido
 * (ex: É armazenado como Ã por dupla codificação UTF-8/Latin-1)
 */
function normalizeStr(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/[^a-z0-9 .-]/g, '') // mantém apenas ASCII: letras, números, espaço, ponto, hífen
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Verifica se um source (nome de arquivo) já existe no banco de vetores
 * Usa normalização para lidar com encoding corrompido (É vs Ã)
 */
export function hasSource(sourceName) {
  if (!sourceName) return false;
  const nameNorm = normalizeStr(sourceName);
  if (!nameNorm) return false;
  return vectorStore.metadatas.some(m => {
    const srcNorm = normalizeStr(m?.source || '');
    return srcNorm === nameNorm || srcNorm.includes(nameNorm) || nameNorm.includes(srcNorm);
  });
}

/**
 * Retorna lista de sources únicos (nomes de arquivos já indexados)
 */
export function getIndexedSources() {
  const sources = new Set();
  vectorStore.metadatas.forEach(m => {
    if (m?.source) sources.add(m.source);
  });
  return [...sources];
}

/**
 * Remove documentos do banco por source (nome de arquivo original).
 * Útil para reindexar apenas uma marca/modelo sem limpar tudo.
 */
export function removeSources(sourceNames) {
  if (!Array.isArray(sourceNames) || sourceNames.length === 0) {
    return { removed: 0, remaining: vectorStore.documents.length };
  }

  const targets = sourceNames
    .filter(Boolean)
    .map(s => normalizeStr(s))
    .filter(Boolean);

  if (targets.length === 0) {
    return { removed: 0, remaining: vectorStore.documents.length };
  }

  const keep = [];
  let removed = 0;

  for (let i = 0; i < vectorStore.metadatas.length; i++) {
    const srcNorm = normalizeStr(vectorStore.metadatas[i]?.source || '');
    const shouldRemove = targets.some(t => srcNorm === t || srcNorm.includes(t) || t.includes(srcNorm));
    if (shouldRemove) {
      removed++;
    } else {
      keep.push(i);
    }
  }

  if (removed > 0) {
    vectorStore = {
      ids: keep.map(i => vectorStore.ids[i]),
      documents: keep.map(i => vectorStore.documents[i]),
      metadatas: keep.map(i => vectorStore.metadatas[i]),
      embeddings: keep.map(i => vectorStore.embeddings[i]),
    };

    // Reescreve o JSON principal e zera o append para evitar inconsistência
    saveToFile();
    if (fs.existsSync(APPEND_FILE)) {
      try { fs.unlinkSync(APPEND_FILE); } catch {}
    }
  }

  return { removed, remaining: vectorStore.documents.length };
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
  // Limpa o append file também
  if (fs.existsSync(APPEND_FILE)) {
    try { fs.unlinkSync(APPEND_FILE); } catch {}
  }
  console.log('🗑️ Banco de vetores limpo');
}

export default {
  initializeChroma,
  addDocuments,
  searchSimilar,
  searchLexical,
  exportCorpus,
  getStats,
  clearCollection,
  hasSource,
  getIndexedSources,
  removeSources,
  isLoading,
  getLoadingProgress,
  compactStore
};
