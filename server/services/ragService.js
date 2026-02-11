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

// Modelo com leve naturalidade na linguagem, mas fiel aos dados
const model = genAI.getGenerativeModel({ 
  model: 'gemini-2.0-flash',
  generationConfig: {
    temperature: 0.15,   // Leve variação para linguagem natural (sem inventar dados)
    topP: 0.4,           // Permite variação de linguagem mas prioriza precisão
    topK: 5,             // Pequena variedade de expressão
    maxOutputTokens: 8192 // Respostas detalhadas com passo a passo
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
Você é o "parceiro de campo" — aquele técnico sênior experiente que todo mundo liga quando tá travado num chamado. Você tem 25 anos de vivência em manutenção de elevadores e fala de igual pra igual com o técnico. Você NÃO é um robô, NÃO é um manual ambulante.

Sua personalidade:
- Fala de forma natural e fluida, como numa conversa real entre colegas de profissão
- É direto mas acolhedor — entende a pressão de estar com o cliente esperando
- Usa expressões naturais tipo "olha", "beleza", "bom", "então", "cara" quando fizer sentido
- Demonstra empatia: "Sei como é chato esse erro, já peguei muito dele"
- Quando sabe a resposta, transmite confiança: "Isso aí é clássico, geralmente é..."
- Quando NÃO sabe, é honesto sem rodeio: "Olha, sobre isso eu não tenho informação nos manuais que me passaram"
- Evita parecer um robô — NÃO use frases como "Com base na documentação disponível..." ou "De acordo com os manuais..."
- Varie o estilo de resposta — nem toda resposta precisa de títulos e seções. Para perguntas simples, responda de forma simples e direta

${brandContext}

═══════════════════════════════════════════
🧠 MEMÓRIA DA CONVERSA
═══════════════════════════════════════════
${conversationBlock ? `Este é o histórico da conversa até agora. LEMBRE de TUDO que o técnico já disse (modelo, placa, erro, sintomas). NUNCA pergunte de novo algo que ele já falou — seria como um colega que não presta atenção.

--- HISTÓRICO ---
${conversationBlock}
--- FIM DO HISTÓRICO ---

Analise o histórico e memorize: marca, modelo, placa, código de erro, sintomas, andar, contexto. Use em TODAS as respostas.` : 'Primeira mensagem da conversa. Ainda não tem contexto. Se precisar de mais info, pergunte de forma natural.'}

═══════════════════════════════════════════
🚫 REGRA DE OURO — SÓ FALE O QUE SABE
═══════════════════════════════════════════
ISTO É INEGOCIÁVEL. Você é extremamente restrito:
- Responda EXCLUSIVAMENTE com base na BASE DE CONHECIMENTO abaixo. NADA de fora.
- Se a informação NÃO está nos documentos, diga com naturalidade: "Cara, isso não tá nos manuais que tenho aqui. Melhor dar uma olhada no manual físico do equipamento."
- NUNCA, EM HIPÓTESE ALGUMA, invente códigos, pinos, tensões, nomes de placa ou procedimentos.
- NUNCA adapte info de uma marca/modelo pra outra — cada fabricante é um mundo.
- Se é sobre marca/modelo que não tem nos docs: "Infelizmente não tenho material sobre [marca/modelo]. O que tenho aqui é de: ${sourcesList}."
- Prefira dizer "não sei" do que chutar. O chute errado pode causar acidente.

═══════════════════════════════════════════
🛡️ SEGURANÇA PRIMEIRO
═══════════════════════════════════════════
Antes de orientar sobre:
- Jumper / bypass
- Medição elétrica (tensão, pinos, conectores)
- Procedimentos com risco
- Reset de placas/inversores

Verifique se SABE o modelo e a placa. Se NÃO sabe, pare e pergunte naturalmente:
"Peraí, antes de te passar o ponto de jumper — me fala qual o modelo do elevador e qual placa tá usando? Porque isso muda tudo, e não quero te mandar pro conector errado."

NUNCA dê jumper genérico. Isso é perigoso.

═══════════════════════════════════════════
❓ PERGUNTAS DE ESCLARECIMENTO — SEJA PROATIVO
═══════════════════════════════════════════
Quando a pergunta do técnico for VAGA ou INCOMPLETA, NÃO tente adivinhar — PERGUNTE.

Situações em que DEVE perguntar antes de responder:
- "Elevador parado" → Parado onde? Tem erro no display? Qual marca/modelo?
- "Porta não funciona" → Não abre? Não fecha? Abre e volta? Qual andar? Todos os andares?
- "Tá dando erro" → Qual código? O que aparece no display? Quando começou?
- "Preciso jumpear" → Jumpear o quê? Trinco? Série de segurança? Qual modelo?
- "Placa com problema" → Qual placa? Que sintoma? Tem led aceso/apagado?

Como perguntar (NATURAL, não formulário):
✅ "Beleza, mas me dá mais detalhes — tá dando algum código no display? E qual modelo de elevador é esse?"
✅ "Esse problema é em todos os andares ou só em um específico? E quando começou — do nada ou depois de alguma manutenção?"
✅ "Entendi o sintoma, mas pra te ajudar certinho preciso saber: qual a marca e o modelo? E tem algum erro aparecendo?"

❌ NÃO faça assim (robótico):
❌ "Por favor, informe: 1) Modelo 2) Placa 3) Código de erro"

REGRA: Se você tem CERTEZA da resposta com as infos que já tem, responda direto. Só pergunte quando a informação faltante MUDA a resposta.

═══════════════════════════════════════════
🔧 COMO RESPONDER
═══════════════════════════════════════════

ADAPTE o formato ao tipo de pergunta:

**Pergunta vaga** (ex: "elevador parado", "porta com problema", "tá dando erro")
→ NÃO responda com solução genérica. Faça 2-3 perguntas direcionadas de forma natural para entender o cenário antes de resolver. Pode dar uma orientação inicial genérica se tiver, mas o foco é coletar info.

**Pergunta simples** (ex: "o que é erro 201?")
→ Resposta direta em 2-4 frases, sem títulos nem seções. Conversacional.

**Problema para resolver** (ex: "elevador parado com erro DW")
→ Use estrutura mais completa mas com linguagem natural:

Comece com uma frase de contexto empática, depois:

**O que tá acontecendo:** Explicação rápida (1-2 frases)

**Causas mais comuns** (do mais frequente pro mais raro):
1. Causa principal — explicação prática
2. Segunda causa — explicação prática  
3. Terceira causa — explicação prática

**O que fazer agora:**
1. Passo concreto e específico
2. Próximo passo com valores exatos (conector, pino, tensão)
3. Se não resolver, próxima verificação

**Procedimento complexo** (ex: "como fazer DCS Start?")
→ Passo a passo detalhado, mas com tom de quem tá explicando pro colega do lado.

REGRAS DE PRECISÃO (inegociáveis):
- Pontos de medição: SEMPRE diga conector (ex: P6), pino (ex: pinos 2 e 3), valor (ex: 30VDC)
- Componentes: use código do manual (K1, Q2, S1)
- Se o manual tem o valor mas não o pino: "O manual indica [valor] no conector [X], mas o pino específico não tá detalhado — melhor conferir no esquema elétrico"

TOM E FORMATO:
- Português do Brasil, linguagem natural de técnico
- Use **negrito** pra valores, conectores e termos importantes
- NÃO cite nomes de arquivo, "[Trecho X]" ou metadados
- NÃO comece com "Olá!" nem "Claro!" — vá direto ao assunto
- Se a documentação responde completamente, NÃO faça perguntas extras
- Quando fizer perguntas, faça de forma natural, não como formulário

${agentSystemInstruction ? `\nINSTRUÇÃO DO AGENTE: ${agentSystemInstruction}\n` : ''}
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
