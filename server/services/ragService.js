/**
 * Serviço RAG (Retrieval-Augmented Generation)
 * Combina busca semântica com geração de resposta via Gemini
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { generateEmbedding } from './embeddingService.js';
import { searchSimilar } from './vectorStore.js';
import dotenv from 'dotenv';

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Modelo configurado para respostas diretas e precisas (temperatura 0 = sem criatividade)
const model = genAI.getGenerativeModel({ 
  model: 'gemini-2.0-flash',
  generationConfig: {
    temperature: 0,      // Zero criatividade - respostas determinísticas
    topP: 0.1,           // Foco nas respostas mais prováveis
    topK: 1,             // Sempre escolhe a melhor resposta
    maxOutputTokens: 2048
  }
});

/**
 * Realiza busca RAG completa: busca contexto relevante e gera resposta
 * @param {string} question - Pergunta do usuário
 * @param {string} agentSystemInstruction - Instrução do agente
 * @param {number} topK - Quantidade de documentos
 * @param {string|null} brandFilter - Nome da marca para filtrar documentos
 */
export async function ragQuery(question, agentSystemInstruction = '', topK = 10, brandFilter = null) {
  const startTime = Date.now();
  
  // Similaridade mínima para considerar um documento relevante
  const MIN_SIMILARITY = 0.60;
  
  try {
    // 1. Gera embedding da pergunta
    console.log('🔍 Gerando embedding da pergunta...');
    const queryEmbedding = await generateEmbedding(question);
    
    // 2. Busca documentos similares (com filtro de marca se disponível)
    console.log(`📚 Buscando documentos relevantes...${brandFilter ? ` (filtro: ${brandFilter})` : ' (sem filtro de marca)'}`);
    const allDocs = await searchSimilar(queryEmbedding, topK, brandFilter);
    
    // 3. Filtra documentos com similaridade mínima
    const relevantDocs = allDocs.filter(doc => doc.similarity >= MIN_SIMILARITY);
    
    console.log(`📊 ${allDocs.length} docs encontrados, ${relevantDocs.length} acima do threshold (${MIN_SIMILARITY * 100}%)`);
    if (relevantDocs.length > 0) {
      console.log(`   Top sim: ${Math.round(relevantDocs[0].similarity * 100)}%, Bottom sim: ${Math.round(relevantDocs[relevantDocs.length - 1].similarity * 100)}%`);
    }
    
    if (relevantDocs.length === 0) {
      const brandMsg = brandFilter 
        ? `Não encontrei informações sobre "${brandFilter}" na base de conhecimento.\n\nVerifique se os manuais dessa marca foram carregados no sistema.`
        : 'Não encontrei informações relevantes na base de conhecimento para essa pergunta.';
      return {
        answer: `❌ ${brandMsg}\n\nTente:\n* Reformular sua pergunta com termos mais específicos\n* Verificar se os documentos corretos estão na Base de Conhecimento`,
        sources: [],
        searchTime: Date.now() - startTime
      };
    }
    
    // 4. Identifica quais fontes (PDFs) foram encontradas
    const sourcesFound = [...new Set(relevantDocs.map(d => d.metadata?.source || 'Desconhecido'))];
    const sourcesList = sourcesFound.map(s => {
      const clean = s.replace(/^\d+-\d+-/, '').replace(/\.pdf$/i, '');
      return clean;
    }).join(', ');
    
    // 5. Monta o contexto - inclui a fonte de cada trecho
    const context = relevantDocs.map((doc, i) => {
      const sourceName = (doc.metadata?.source || 'Desconhecido').replace(/^\d+-\d+-/, '').replace(/\.pdf$/i, '');
      return `[FONTE: ${sourceName}]\n${doc.content}`;
    }).join('\n\n---\n\n');
    
    // 6. Prompt conversacional com foco em precisão e perguntas de esclarecimento
    const brandContext = brandFilter 
      ? `Você está respondendo com base nos manuais da marca **${brandFilter}**. Todas as informações vêm dos documentos dessa marca.`
      : `Os manuais disponíveis na base são: ${sourcesList}.`;
    
    const systemPrompt = `
Você é um assistente técnico especializado em elevadores.

${brandContext}

REGRA FUNDAMENTAL — PROIBIDO INVENTAR:
- Você SÓ pode responder usando as informações que estão na BASE DE CONHECIMENTO abaixo.
- Se a pergunta é sobre uma MARCA ou MODELO que NÃO aparece nos documentos, diga claramente:
  "Não tenho documentação sobre [marca/modelo] na base. Os manuais disponíveis são: ${sourcesList}."
- NUNCA adapte informação de uma marca/modelo para outra. Cada fabricante tem procedimentos diferentes.
- Se a informação exata não está nos documentos, diga "essa informação específica não consta nos manuais carregados".
- NÃO invente códigos de erro, números de página, nomes de placa, valores de tensão ou procedimentos.

REGRA DE PERGUNTAS DE ESCLARECIMENTO:
- ANTES de dar uma resposta genérica, avalie se falta informação crucial para ser mais preciso.
- Se a pergunta do usuário é vaga (ex: "porta não funciona", "elevador parado"), faça 2-3 perguntas direcionadas no FINAL da resposta.
- Perguntas úteis incluem: código de erro exibido no display, modelo exato do elevador, placa controladora (LCB, LCBII, PCC, etc.), andar onde ocorre o problema, se o problema é intermitente ou constante.
- Formate as perguntas assim:
  
  ---
  📋 **Para refinar o diagnóstico, me informe:**
  1. Qual código de erro aparece no display?
  2. Qual o modelo exato do elevador?
  3. O problema acontece em todos os andares ou só em um?

REGRAS DE IDENTIFICAÇÃO:
- Cada trecho da base tem uma tag [FONTE: nome]. Use isso para saber de qual manual veio a informação.
- Mencione de qual manual/marca veio a informação quando relevante.

REGRAS DE FORMATO:
- Vá DIRETO ao ponto. NÃO repita a pergunta do usuário.
- Use títulos com ## para separar seções
- Use listas com * para itens
- Parágrafos curtos (2-3 frases no máximo)
- Use **negrito** para termos técnicos, valores e conectores
- Pode usar emojis com moderação (⚡🔧📋) no início de títulos/seções
- NÃO cite "[Trecho X]" nem nomes de arquivos internos
- NÃO adicione "Documentos consultados" nem metadados
- Responda em português do Brasil
- Fale como um colega técnico experiente: direto, claro e útil

${agentSystemInstruction ? `INSTRUÇÃO ADICIONAL DO AGENTE: ${agentSystemInstruction}\n\n` : ''}
=== BASE DE CONHECIMENTO ===
${context}
=== FIM DA BASE ===`;

    // 7. Gera a resposta com Gemini
    console.log('🤖 Gerando resposta...');
    
    const fullPrompt = `${systemPrompt}\n\nPERGUNTA: ${question}`;
    const result = await model.generateContent(fullPrompt);
    const answer = result.response.text();
    
    const endTime = Date.now();
    
    // 6. Retorna resposta formatada com metadados
    return {
      answer,
      sources: relevantDocs.map(doc => ({
        source: doc.metadata?.source || 'Desconhecido',
        title: doc.metadata?.title || '',
        excerpt: doc.content.substring(0, 200) + '...',
        similarity: Math.round(doc.similarity * 100)
      })),
      searchTime: endTime - startTime,
      documentsFound: relevantDocs.length
    };
    
  } catch (error) {
    console.error('Erro no RAG:', error);
    throw error;
  }
}

/**
 * Busca simples sem geração (apenas retorna documentos relevantes)
 */
export async function searchOnly(question, topK = 10, brandFilter = null) {
  const queryEmbedding = await generateEmbedding(question);
  return await searchSimilar(queryEmbedding, topK, brandFilter);
}

/**
 * Verifica se a base de conhecimento tem informações sobre um tópico
 */
export async function hasKnowledgeAbout(topic) {
  const results = await searchOnly(topic, 3);
  const avgSimilarity = results.reduce((sum, r) => sum + r.similarity, 0) / results.length;
  return avgSimilarity > 0.5; // Threshold de 50% de similaridade
}

export default {
  ragQuery,
  searchOnly,
  hasKnowledgeAbout
};
