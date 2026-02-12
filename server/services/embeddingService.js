/**
 * Serviço de Embeddings
 * Gera vetores semânticos usando Google Gemini (gemini-embedding-001)
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Modelo de embedding atual do Google (fev 2026)
const embeddingModel = genAI.getGenerativeModel({ model: 'gemini-embedding-001' });

// --- LRU Cache para embeddings de queries ---
const embeddingCache = new Map();
const EMBEDDING_CACHE_MAX = 100;

/**
 * Gera embedding para um texto (com cache LRU)
 */
export async function generateEmbedding(text) {
  // Cache key: primeiros 300 chars normalizados
  const cacheKey = text.trim().toLowerCase().substring(0, 300);
  
  if (embeddingCache.has(cacheKey)) {
    console.log('📦 Embedding do cache');
    return embeddingCache.get(cacheKey);
  }
  
  try {
    const result = await embeddingModel.embedContent(text);
    const embedding = result.embedding.values;
    
    // LRU eviction
    if (embeddingCache.size >= EMBEDDING_CACHE_MAX) {
      const firstKey = embeddingCache.keys().next().value;
      embeddingCache.delete(firstKey);
    }
    embeddingCache.set(cacheKey, embedding);
    
    return embedding;
  } catch (error) {
    console.error('Erro ao gerar embedding:', error);
    throw error;
  }
}

/**
 * Gera embeddings para múltiplos textos em batch
 * Usa batches de 50 textos com a API Gemini (rápido e eficiente)
 */
export async function generateEmbeddings(texts, onProgress) {
  const embeddings = new Array(texts.length).fill(null);

  const batchSize = Math.max(1, parseInt(process.env.EMBED_BATCH_SIZE || '32', 10));
  const concurrency = Math.max(1, parseInt(process.env.EMBED_CONCURRENCY || '8', 10));
  const batchDelayMs = Math.max(0, parseInt(process.env.EMBED_BATCH_DELAY_MS || '150', 10));
  const requestDelayMs = Math.max(0, parseInt(process.env.EMBED_REQUEST_DELAY_MS || '0', 10));

  // Preferir batch real se o SDK suportar (muito mais rápido e estável)
  const hasBatch = typeof embeddingModel.batchEmbedContents === 'function';

  if (hasBatch) {
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      try {
        const resp = await embeddingModel.batchEmbedContents({
          requests: batch.map((t) => ({ content: { parts: [{ text: t }] } })),
        });
        const values = resp?.embeddings?.map(e => e.values) || [];
        for (let j = 0; j < batch.length; j++) {
          embeddings[i + j] = values[j] || null;
        }
      } catch (error) {
        console.error(`Erro no batch ${i}-${i + batch.length - 1}:`, error.message);
        // fallback: tenta individualmente com concorrência
        for (let j = 0; j < batch.length; j++) {
          try {
            embeddings[i + j] = await generateEmbedding(batch[j]);
          } catch {
            embeddings[i + j] = null;
          }
        }
      }

      if (onProgress) {
        onProgress({
          current: Math.min(i + batch.length, texts.length),
          total: texts.length,
          percentage: Math.round((Math.min(i + batch.length, texts.length) / texts.length) * 100)
        });
      }

      if (i + batchSize < texts.length && batchDelayMs > 0) {
        await new Promise(resolve => setTimeout(resolve, batchDelayMs));
      }
    }

    return embeddings;
  }

  // Fallback: concorrência controlada sem "sleep por item" (mais rápido e previsível)
  let nextIndex = 0;
  let done = 0;

  async function worker() {
    while (true) {
      const i = nextIndex++;
      if (i >= texts.length) return;
      try {
        if (requestDelayMs > 0) await new Promise(r => setTimeout(r, requestDelayMs));
        embeddings[i] = await generateEmbedding(texts[i]);
      } catch (error) {
        console.error(`Erro no texto ${i}:`, error.message);
        embeddings[i] = null;
      }
      done++;
      if (onProgress) {
        onProgress({
          current: done,
          total: texts.length,
          percentage: Math.round((done / texts.length) * 100)
        });
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, texts.length) }, () => worker());
  await Promise.all(workers);
  return embeddings;
}

/**
 * Calcula similaridade de cosseno entre dois vetores
 */
export function cosineSimilarity(vecA, vecB) {
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

export default {
  generateEmbedding,
  generateEmbeddings,
  cosineSimilarity
};
