/**
 * Adapter de Vector Store.
 *
 * - Default: usa o store local (vectors.json + ndjson append)
 * - Se QDRANT_URL estiver configurado: usa Qdrant
 */

import * as local from './vectorStore.js';

const QDRANT_URL = (process.env.QDRANT_URL || '').trim();
const QDRANT_API_KEY = (process.env.QDRANT_API_KEY || '').trim();
const QDRANT_COLLECTION = (process.env.QDRANT_COLLECTION || 'elevex_documents').trim();
const VECTOR_SIZE = Math.max(1, parseInt(process.env.QDRANT_VECTOR_SIZE || '3072', 10));
const QDRANT_CORPUS_CACHE_TTL_MS = Math.max(1000, parseInt(process.env.QDRANT_CORPUS_CACHE_TTL_MS || '30000', 10));

const qdrantCorpusCache = new Map();

function isQdrantEnabled() {
  return Boolean(QDRANT_URL);
}

function qdrantHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (QDRANT_API_KEY) headers['api-key'] = QDRANT_API_KEY;
  return headers;
}

function joinUrl(base, path) {
  return base.replace(/\/+$/, '') + '/' + path.replace(/^\/+/, '');
}

function getCorpusCacheKey(limit, brandFilter) {
  return `${brandFilter || '*'}::${limit}`;
}

function invalidateQdrantCorpusCache() {
  qdrantCorpusCache.clear();
}

async function qdrantFetch(path, init) {
  const url = joinUrl(QDRANT_URL, path);
  const res = await fetch(url, init);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Qdrant ${res.status}: ${text || res.statusText}`);
  }
  return res;
}

async function ensureQdrantCollection() {
  // GET collection (se não existir, cria)
  try {
    const res = await qdrantFetch(`/collections/${encodeURIComponent(QDRANT_COLLECTION)}`, {
      method: 'GET',
      headers: qdrantHeaders(),
    });

    const data = await res.json().catch(() => ({}));
    const result = data?.result || {};
    const vectorsConfig = result?.config?.params?.vectors;
    const pointsCount = Number(result?.points_count || 0);

    let currentSize = null;
    if (typeof vectorsConfig?.size === 'number') {
      currentSize = vectorsConfig.size;
    } else if (vectorsConfig && typeof vectorsConfig === 'object') {
      const first = Object.values(vectorsConfig)[0];
      if (first && typeof first.size === 'number') currentSize = first.size;
    }

    if (currentSize && currentSize !== VECTOR_SIZE) {
      if (pointsCount > 0) {
        throw new Error(
          `Qdrant collection '${QDRANT_COLLECTION}' com dimensão ${currentSize}, mas servidor espera ${VECTOR_SIZE}. ` +
          `Ajuste QDRANT_VECTOR_SIZE para ${currentSize} ou recrie a coleção.`
        );
      }

      // Coleção vazia com dimensão errada: recria automaticamente
      await qdrantFetch(`/collections/${encodeURIComponent(QDRANT_COLLECTION)}`, {
        method: 'DELETE',
        headers: qdrantHeaders(),
      });

      await qdrantFetch(`/collections/${encodeURIComponent(QDRANT_COLLECTION)}`, {
        method: 'PUT',
        headers: qdrantHeaders(),
        body: JSON.stringify({
          vectors: {
            size: VECTOR_SIZE,
            distance: 'Cosine',
          },
        }),
      });
    }
  } catch (e) {
    if (String(e?.message || '').includes('com dimensão')) throw e;
    // Create
    await qdrantFetch(`/collections/${encodeURIComponent(QDRANT_COLLECTION)}`, {
      method: 'PUT',
      headers: qdrantHeaders(),
      body: JSON.stringify({
        vectors: {
          size: VECTOR_SIZE,
          distance: 'Cosine',
        },
      }),
    });
  }
}

function payloadFromChunk(chunk) {
  return {
    content: chunk.content,
    metadata: chunk.metadata || {},
    source: chunk.metadata?.source || null,
    brandName: chunk.metadata?.brandName || null,
    modelId: chunk.metadata?.model_id || chunk.metadata?.modelId || null,
  };
}

export async function initializeChroma() {
  if (!isQdrantEnabled()) return local.initializeChroma();
  await ensureQdrantCollection();
  return { qdrant: true, collection: QDRANT_COLLECTION };
}

export function isLoading() {
  return isQdrantEnabled() ? false : local.isLoading();
}

export function getLoadingProgress() {
  return isQdrantEnabled() ? '' : local.getLoadingProgress();
}

export async function getStats() {
  if (!isQdrantEnabled()) return local.getStats();
  await ensureQdrantCollection();
  const res = await qdrantFetch(`/collections/${encodeURIComponent(QDRANT_COLLECTION)}`, {
    method: 'GET',
    headers: qdrantHeaders(),
  });
  const data = await res.json();
  const total = data?.result?.points_count ?? 0;
  return { totalDocuments: total, collectionName: QDRANT_COLLECTION };
}

export async function clearCollection() {
  if (!isQdrantEnabled()) return local.clearCollection();

  // Delete and recreate
  try {
    await qdrantFetch(`/collections/${encodeURIComponent(QDRANT_COLLECTION)}`, {
      method: 'DELETE',
      headers: qdrantHeaders(),
    });
  } catch {}

  await ensureQdrantCollection();
  invalidateQdrantCorpusCache();
}

export function compactStore() {
  if (!isQdrantEnabled()) return local.compactStore();
  // no-op
}

export async function addDocuments(chunks, embeddings) {
  if (!isQdrantEnabled()) return local.addDocuments(chunks, embeddings);
  await ensureQdrantCollection();

  const batchSize = Math.max(1, parseInt(process.env.QDRANT_UPSERT_BATCH || '128', 10));

  for (let i = 0; i < chunks.length; i += batchSize) {
    const batchChunks = chunks.slice(i, i + batchSize);
    const batchVectors = embeddings.slice(i, i + batchSize);

    const points = batchChunks.map((chunk, idx) => ({
      id: chunk.id,
      vector: batchVectors[idx],
      payload: payloadFromChunk(chunk),
    }));

    await qdrantFetch(`/collections/${encodeURIComponent(QDRANT_COLLECTION)}/points?wait=true`, {
      method: 'PUT',
      headers: qdrantHeaders(),
      body: JSON.stringify({ points }),
    });
  }

  invalidateQdrantCorpusCache();

  return true;
}

function normalizeStr(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/[^a-z0-9 .-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
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

  let score = 0;
  const docLen = docTokens.length;
  for (const term of Array.from(new Set(queryTokens))) {
    const freq = tf.get(term) || 0;
    if (!freq) continue;
    const df = docFreqMap.get(term) || 0;
    const idf = Math.log(1 + (totalDocs - df + 0.5) / (df + 0.5));
    const denom = freq + k1 * (1 - b + b * (docLen / Math.max(1, avgDocLen)));
    score += idf * ((freq * (k1 + 1)) / Math.max(1e-9, denom));
  }
  return score;
}

async function collectQdrantCorpus(limit = 5000, brandFilter = null) {
  const cacheKey = getCorpusCacheKey(limit, brandFilter);
  const cached = qdrantCorpusCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp) < QDRANT_CORPUS_CACHE_TTL_MS) {
    return cached.docs;
  }

  const docs = [];
  const max = Math.max(1, Number(limit) || 5000);
  const filterLower = (brandFilter || '').toLowerCase();
  let next = null;

  for (let iter = 0; iter < 200; iter++) {
    const remaining = max - docs.length;
    if (remaining <= 0) break;

    const res = await qdrantFetch(`/collections/${encodeURIComponent(QDRANT_COLLECTION)}/points/scroll`, {
      method: 'POST',
      headers: qdrantHeaders(),
      body: JSON.stringify({
        limit: Math.min(256, remaining),
        offset: next,
        with_payload: true,
        with_vector: false,
      }),
    });

    const data = await res.json();
    const points = data?.result?.points || [];

    for (const p of points) {
      const payload = p?.payload || {};
      const source = String(payload?.source || '').toLowerCase();
      const brand = String(payload?.brandName || '').toLowerCase();
      if (filterLower && !source.includes(filterLower) && !brand.includes(filterLower)) continue;

      docs.push({
        id: p?.id,
        content: payload?.content || '',
        metadata: payload?.metadata || {},
      });
      if (docs.length >= max) break;
    }

    next = data?.result?.next_page_offset || null;
    if (!next || points.length === 0 || docs.length >= max) break;
  }

  qdrantCorpusCache.set(cacheKey, { docs, timestamp: Date.now() });
  return docs;
}

export async function hasSource(sourceName) {
  if (!isQdrantEnabled()) return local.hasSource(sourceName);
  if (!sourceName) return false;

  // Tenta match exato por source
  const res = await qdrantFetch(`/collections/${encodeURIComponent(QDRANT_COLLECTION)}/points/scroll`, {
    method: 'POST',
    headers: qdrantHeaders(),
    body: JSON.stringify({
      limit: 1,
      with_payload: false,
      filter: {
        must: [{ key: 'source', match: { value: sourceName } }],
      },
    }),
  });

  const data = await res.json();
  if ((data?.result?.points || []).length > 0) return true;

  // Fallback: tenta match por normalização (para nomes levemente diferentes)
  const norm = normalizeStr(sourceName);
  if (!norm) return false;

  const res2 = await qdrantFetch(`/collections/${encodeURIComponent(QDRANT_COLLECTION)}/points/scroll`, {
    method: 'POST',
    headers: qdrantHeaders(),
    body: JSON.stringify({
      limit: 50,
      with_payload: ['source'],
      with_vector: false,
    }),
  });
  const data2 = await res2.json();
  const points = data2?.result?.points || [];
  return points.some(p => normalizeStr(p?.payload?.source || '') === norm);
}

export async function getIndexedSources() {
  if (!isQdrantEnabled()) return local.getIndexedSources();

  // Coleta um conjunto de sources via scroll. Para bases muito grandes isso é caro;
  // aqui é usado principalmente para UI/debug.
  const sources = new Set();
  let next = null;

  for (let iter = 0; iter < 50; iter++) {
    const res = await qdrantFetch(`/collections/${encodeURIComponent(QDRANT_COLLECTION)}/points/scroll`, {
      method: 'POST',
      headers: qdrantHeaders(),
      body: JSON.stringify({
        limit: 256,
        offset: next,
        with_payload: ['source'],
        with_vector: false,
      }),
    });

    const data = await res.json();
    const points = data?.result?.points || [];
    for (const p of points) {
      if (p?.payload?.source) sources.add(p.payload.source);
    }

    next = data?.result?.next_page_offset || null;
    if (!next || points.length === 0) break;
  }

  return [...sources];
}

export async function removeSources(sourceNames) {
  if (!isQdrantEnabled()) return local.removeSources(sourceNames);

  const names = (Array.isArray(sourceNames) ? sourceNames : []).filter(Boolean);
  if (names.length === 0) return { removed: 0, remaining: 0 };

  const before = await getStats();
  const should = names.map(n => ({ key: 'source', match: { value: n } }));

  await qdrantFetch(`/collections/${encodeURIComponent(QDRANT_COLLECTION)}/points/delete?wait=true`, {
    method: 'POST',
    headers: qdrantHeaders(),
    body: JSON.stringify({
      filter: { should },
    }),
  });

  const after = await getStats();
  const removed = Math.max(0, (before.totalDocuments || 0) - (after.totalDocuments || 0));
  if (removed > 0) invalidateQdrantCorpusCache();
  return { removed, remaining: after.totalDocuments || 0 };
}

export async function searchSimilar(queryEmbedding, topK = 5, brandFilter = null) {
  if (!isQdrantEnabled()) return local.searchSimilar(queryEmbedding, topK, brandFilter);

  await ensureQdrantCollection();

  // Busca mais e filtra client-side para manter o mesmo comportamento do store local
  const fetchK = Math.max(topK * 5, 25);

  const res = await qdrantFetch(`/collections/${encodeURIComponent(QDRANT_COLLECTION)}/points/search`, {
    method: 'POST',
    headers: qdrantHeaders(),
    body: JSON.stringify({
      vector: queryEmbedding,
      limit: fetchK,
      with_payload: true,
      with_vector: false,
    }),
  });

  const data = await res.json();
  let results = (data?.result || []).map(r => ({
    content: r?.payload?.content || '',
    metadata: r?.payload?.metadata || {},
    similarity: r?.score || 0,
    distance: 1 - (r?.score || 0),
    _payload: r?.payload || {},
  }));

  if (brandFilter) {
    const filterLower = brandFilter.toLowerCase();
    results = results.filter(r => {
      const src = (r._payload?.source || '').toLowerCase();
      const brand = (r._payload?.brandName || '').toLowerCase();
      return src.includes(filterLower) || brand.includes(filterLower);
    });
  }

  return results.slice(0, topK);
}

export async function searchLexical(query, topK = 10, brandFilter = null) {
  if (!isQdrantEnabled()) return local.searchLexical(query, topK, brandFilter);

  await ensureQdrantCollection();
  const corpus = await collectQdrantCorpus(Math.max(4000, topK * 200), brandFilter);
  const queryTokens = tokenizeForLexical(query);
  if (queryTokens.length === 0 || corpus.length === 0) return [];

  const candidates = corpus
    .map(d => ({ ...d, docTokens: tokenizeForLexical(d.content || '') }))
    .filter(d => d.docTokens.length > 0);
  if (!candidates.length) return [];

  const totalDocs = candidates.length;
  const avgDocLen = candidates.reduce((sum, d) => sum + d.docTokens.length, 0) / totalDocs;
  const dfMap = new Map();
  for (const d of candidates) {
    for (const term of new Set(d.docTokens)) {
      dfMap.set(term, (dfMap.get(term) || 0) + 1);
    }
  }

  const scored = candidates.map(d => {
    const score = bm25Score(queryTokens, d.docTokens, dfMap, totalDocs, avgDocLen);
    return {
      content: d.content,
      metadata: d.metadata,
      similarity: score,
      distance: Math.max(0, 1 - score),
    };
  });

  return scored.sort((a, b) => b.similarity - a.similarity).slice(0, topK);
}

export async function exportCorpus(limit = 5000, brandFilter = null) {
  if (!isQdrantEnabled()) return local.exportCorpus(limit, brandFilter);
  await ensureQdrantCollection();
  return await collectQdrantCorpus(limit, brandFilter);
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
  isLoading,
  getLoadingProgress,
  compactStore,
  removeSources,
};
