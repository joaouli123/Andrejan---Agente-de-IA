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
  const embeddings = [];
  const batchSize = 50; // gemini-embedding-001 suporta batches maiores
  
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    
    const batchPromises = batch.map(async (text, idx) => {
      try {
        // Rate limiting mínimo - 50ms entre requisições
        await new Promise(resolve => setTimeout(resolve, idx * 50));
        return await generateEmbedding(text);
      } catch (error) {
        console.error(`Erro no texto ${i + idx}:`, error.message);
        return null;
      }
    });
    
    const batchResults = await Promise.all(batchPromises);
    embeddings.push(...batchResults);
    
    if (onProgress) {
      onProgress({
        current: Math.min(i + batchSize, texts.length),
        total: texts.length,
        percentage: Math.round((Math.min(i + batchSize, texts.length) / texts.length) * 100)
      });
    }
    
    // Delay menor entre batches
    if (i + batchSize < texts.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
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
