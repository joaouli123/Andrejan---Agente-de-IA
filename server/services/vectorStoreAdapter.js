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
const VECTOR_SIZE = 768;

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
    await qdrantFetch(`/collections/${encodeURIComponent(QDRANT_COLLECTION)}`, {
      method: 'GET',
      headers: qdrantHeaders(),
    });
  } catch (e) {
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

export default {
  initializeChroma,
  addDocuments,
  searchSimilar,
  getStats,
  clearCollection,
  hasSource,
  getIndexedSources,
  isLoading,
  getLoadingProgress,
  compactStore,
  removeSources,
};
