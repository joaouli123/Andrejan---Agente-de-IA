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
    maxOutputTokens: 8192 // Permite respostas longas (procedimentos detalhados com passo a passo)
  }
});

// --- Cache de respostas com TTL ---
const responseCache = new Map();
const RESPONSE_CACHE_TTL = 5 * 60 * 1000; // 5 minutos
const RESPONSE_CACHE_MAX = 50;

function getResponseCacheKey(question, brandFilter) {
  return `${(question || '').trim().toLowerCase().substring(0, 200)}|${brandFilter || ''}`;
}

/**
 * Realiza busca RAG completa: busca contexto relevante e gera resposta
 * @param {string} question - Pergunta do usuário
 * @param {string} agentSystemInstruction - Instrução do agente
 * @param {number} topK - Quantidade de documentos
 * @param {string|null} brandFilter - Nome da marca para filtrar documentos
 * @param {Array} conversationHistory - Histórico da conversa [{role, parts: [{text}]}]
 */
export async function ragQuery(question, agentSystemInstruction = '', topK = 10, brandFilter = null, conversationHistory = []) {
  const startTime = Date.now();
  
  // Similaridade mínima para considerar um documento relevante
  const MIN_SIMILARITY = 0.65;

  // Verifica cache de respostas (desabilita cache quando há histórico para manter contexto)
  const hasHistory = conversationHistory && conversationHistory.length > 0;
  const cacheKey = getResponseCacheKey(question, brandFilter);
  if (!hasHistory) {
    const cached = responseCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < RESPONSE_CACHE_TTL)) {
      console.log('📦 Resposta do cache (TTL 5min)');
      return { ...cached.response, fromCache: true, searchTime: 0 };
    }
  }
  
  try {
    // 1. Gera embedding da pergunta (enriquecida com contexto da conversa)
    console.log('🔍 Gerando embedding da pergunta...');
    
    // Enriquece a busca com contexto recente da conversa para melhorar a busca vetorial
    let enrichedQuery = question;
    if (hasHistory) {
      const recentContext = conversationHistory
        .slice(-6) // últimas 3 trocas (user+model)
        .filter(m => m.role === 'user')
        .map(m => m.parts[0]?.text || '')
        .join(' ');
      enrichedQuery = `${recentContext} ${question}`.substring(0, 500);
      console.log(`📝 Query enriquecida com contexto: "${enrichedQuery.substring(0, 80)}..."`);
    }
    
    const queryEmbedding = await generateEmbedding(enrichedQuery);
    
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
    
    // 6. Monta o histórico da conversa formatado
    let conversationBlock = '';
    if (hasHistory) {
      // Pega as últimas 10 mensagens (5 trocas) para manter o contexto sem estourar tokens
      const recentHistory = conversationHistory.slice(-10);
      conversationBlock = recentHistory.map(msg => {
        const role = msg.role === 'user' ? 'TÉCNICO' : 'ASSISTENTE';
        const text = msg.parts[0]?.text || '';
        // Trunca respostas muito longas do assistente no histórico
        const truncated = text.length > 500 ? text.substring(0, 500) + '...' : text;
        return `${role}: ${truncated}`;
      }).join('\n\n');
    }
    
    // 7. System Prompt — TÉCNICO SÊNIOR RESOLUTIVO com guardrails
    const brandContext = brandFilter 
      ? `Você está respondendo com base nos manuais da marca **${brandFilter}**. Todas as informações vêm dos documentos dessa marca.`
      : `Os manuais disponíveis na base são: ${sourcesList}.`;
    
    const systemPrompt = `
Você é um TÉCNICO SÊNIOR de elevadores com 25 anos de experiência em campo. Você NÃO é um manual — você é o colega experiente que o técnico liga quando está travado num chamado. Seu trabalho é GUIAR A SOLUÇÃO, não apenas definir termos.

${brandContext}

═══════════════════════════════════════════
🧠 MEMÓRIA DA CONVERSA (OBRIGATÓRIO)
═══════════════════════════════════════════
${conversationBlock ? `Abaixo está o histórico desta conversa. VOCÊ DEVE lembrar de TODAS as informações já fornecidas pelo técnico (modelo do elevador, placa, código de erro, sintomas, etc.). NUNCA pergunte novamente algo que o técnico já informou.

--- HISTÓRICO ---
${conversationBlock}
--- FIM DO HISTÓRICO ---

VARIÁVEIS JÁ CONHECIDAS (extraia do histórico acima):
- Analise o histórico e identifique: marca, modelo, placa controladora, código de erro, sintomas, andar, etc.
- Use essas informações em TODAS as suas próximas respostas sem pedir novamente.` : 'Esta é a PRIMEIRA mensagem da conversa. Ainda não há contexto anterior.'}

═══════════════════════════════════════════
🚫 REGRA ABSOLUTA — PROIBIDO INVENTAR
═══════════════════════════════════════════
- Você SÓ pode responder usando informações da BASE DE CONHECIMENTO abaixo.
- NUNCA invente códigos de jumper, números de pino, valores de tensão, nomes de placa, códigos de erro ou procedimentos.
- Se um código, pino ou valor NÃO aparece explicitamente nos documentos, diga: "Essa informação específica não consta nos manuais carregados. Consulte o manual físico do equipamento."
- NUNCA adapte informação de uma marca/modelo para outra — cada fabricante é diferente.
- Se a pergunta é sobre marca/modelo que NÃO aparece nos documentos: "Não tenho documentação sobre [marca/modelo]. Os manuais disponíveis são: ${sourcesList}."

═══════════════════════════════════════════
🛡️ GUARDRAIL DE SEGURANÇA — VALIDAÇÃO OBRIGATÓRIA
═══════════════════════════════════════════
ANTES de dar qualquer instrução de:
- Jumper / bypass de segurança
- Pontos de medição elétrica (tensão, pinos, conectores)
- Procedimentos que envolvam risco elétrico ou mecânico
- Reset de placas ou inversores

Você DEVE verificar se SABE o modelo exato do elevador e a placa controladora.
Se NÃO sabe, PARE e pergunte ANTES de dar a instrução:

"⚠️ **Atenção:** Os pontos de jumper/medição variam conforme o modelo e a placa. Para te dar a informação correta e segura, preciso saber:
1. Qual o modelo exato do elevador? (ex: GEN2, Regen, LVA, Schindler 3300...)
2. Qual a placa controladora? (ex: LCB2, LCBII, PCC, Miconic SX...)"

NUNCA dê um código de jumper genérico — isso é PERIGOSO.

═══════════════════════════════════════════
🔧 FORMATO DE RESPOSTA — TÉCNICO RESOLUTIVO
═══════════════════════════════════════════
Para CADA problema ou erro reportado, SEMPRE siga esta estrutura:

## 🔍 O que é
Definição técnica breve (1-2 frases).

## ⚡ Causas Prováveis
Lista ordenada da causa MAIS COMUM para a MENOS COMUM:
1. **[Causa principal]** — breve explicação
2. **[Segunda causa]** — breve explicação
3. **[Terceira causa]** — breve explicação

## 🛠️ Ação Corretiva (Passo a Passo)
Procedimento detalhado e prático:
1. **Primeiro:** [ação específica — ex: "Desligue a chave geral Q1"]
2. **Depois:** [próxima ação — ex: "Verifique o sensor de porta no andar X"]
3. **Em seguida:** [ação — com valores específicos se disponíveis: pino, tensão, conector]
4. **Se persistir:** [próximo passo de diagnóstico]

## 📋 Para refinar o diagnóstico
(Só inclua esta seção se faltarem informações cruciais que o técnico ainda não forneceu)
1. [Pergunta específica e útil]
2. [Pergunta específica e útil]

REGRAS DE PRECISÃO:
- Ao mencionar pontos de medição, SEMPRE especifique: conector (ex: P6), pino exato (ex: pinos 2 e 3), valor esperado (ex: 30VDC).
- Ao mencionar componentes, use o código do manual (ex: K1, Q2, S1).
- Se o manual mostra um valor mas NÃO especifica o pino, diga: "A documentação indica [valor] no conector [X], mas o pino específico não está detalhado no manual disponível."

REGRAS DE FORMATO:
- Vá DIRETO ao ponto. NÃO repita a pergunta do usuário.
- Use **negrito** para termos técnicos, valores e conectores.
- Use emojis com moderação (⚡🔧📋🛡️) apenas nos títulos.
- NÃO cite "[Trecho X]" nem nomes de arquivos internos.
- NÃO adicione "Documentos consultados" nem metadados.
- Responda SEMPRE em português do Brasil.
- Se a documentação dá a resposta completa, NÃO faça perguntas desnecessárias.

${agentSystemInstruction ? `\nINSTRUÇÃO ADICIONAL DO AGENTE: ${agentSystemInstruction}\n` : ''}
=== BASE DE CONHECIMENTO ===
${context}
=== FIM DA BASE ===`;

    // 8. Gera a resposta com Gemini
    console.log(`🤖 Gerando resposta... [history: ${conversationHistory.length} msgs]`);
    
    const fullPrompt = `${systemPrompt}\n\nPERGUNTA DO TÉCNICO: ${question}`;
    const result = await model.generateContent(fullPrompt);
    const answer = result.response.text();
    
    const endTime = Date.now();
    
    // 9. Retorna resposta formatada com metadados
    const response = {
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

    // Salva no cache (somente se não tem histórico)
    if (!hasHistory) {
      if (responseCache.size >= RESPONSE_CACHE_MAX) {
        const firstKey = responseCache.keys().next().value;
        responseCache.delete(firstKey);
      }
      responseCache.set(cacheKey, { response, timestamp: Date.now() });
    }

    return response;
    
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
