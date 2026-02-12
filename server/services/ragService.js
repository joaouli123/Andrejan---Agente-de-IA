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

// Modelo leve para reescrita de queries (multi-query retrieval)
const queryRewriter = genAI.getGenerativeModel({ 
  model: 'gemini-2.0-flash',
  generationConfig: {
    temperature: 0.3,
    maxOutputTokens: 512
  }
});

// --- Cache de respostas com TTL ---
const responseCache = new Map();
const RESPONSE_CACHE_TTL = 5 * 60 * 1000; // 5 minutos
const RESPONSE_CACHE_MAX = 50;

/**
 * Corrige encoding corrompido (UTF-8 decodificado como Latin-1)
 * Ex: "TÃCNICO" → "TÉCNICO", "RÃPIDA" → "RÁPIDA", "versÃ£o" → "versão"
 */
function fixEncoding(str) {
  if (!str) return str;
  try {
    // Tenta decodificar dupla codificação UTF-8/Latin-1
    const bytes = new Uint8Array([...str].map(c => c.charCodeAt(0)));
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    // Se decodificou com sucesso e é diferente do original, usa o decodificado
    if (decoded !== str && decoded.length < str.length) return decoded;
  } catch (e) {
    // Não é dupla codificação, tenta mapeamento manual dos padrões mais comuns
  }
  
  // Fallback: substituição manual dos padrões mais comuns de corrupção
  const replacements = {
    'Ã©': 'é', 'Ã¡': 'á', 'Ã£': 'ã', 'Ã§': 'ç', 'Ãµ': 'õ',
    'Ã³': 'ó', 'Ãº': 'ú', 'Ã­': 'í', 'Ã¢': 'â', 'Ãª': 'ê',
    'Ã´': 'ô', 'Ã¼': 'ü', 'Ã': 'À',
    'Ã\u0089': 'É', 'Ã\u0081': 'Á', 'Ã\u0083': 'Ã', 'Ã\u0087': 'Ç', 
    'Ã\u0095': 'Õ', 'Ã\u0093': 'Ó', 'Ã\u009A': 'Ú', 'Ã\u008D': 'Í',
    'Ã\u0082': 'Â', 'Ã\u008A': 'Ê', 'Ã\u0094': 'Ô',
    // Padrões com Ã seguido de caractere especial
    'Ã‰': 'É', 'Ã\u0080': 'À', 'Ãƒ': 'Ã', 'Ã‡': 'Ç',
    'Ã•': 'Õ', 'Ã"': 'Ó', 'Ãš': 'Ú', 'Ã"': 'Ô',
    'ÃŠ': 'Ê', 'Ã‚': 'Â', 'Ãœ': 'Ü',
  };
  
  let result = str;
  for (const [from, to] of Object.entries(replacements)) {
    result = result.replaceAll(from, to);
  }
  return result;
}

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
  const MIN_SIMILARITY = 0.55; // Mais permissivo para capturar mais info relevante

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
    // ═══ MULTI-QUERY RETRIEVAL ═══
    // Em vez de buscar com uma query só, gera variações para encontrar mais documentos relevantes
    console.log('🔍 Gerando queries de busca...');
    
    // Query original enriquecida com contexto da conversa
    let enrichedQuery = question;
    if (hasHistory) {
      const recentContext = conversationHistory
        .slice(-6)
        .filter(m => m.role === 'user')
        .map(m => m.parts[0]?.text || '')
        .join(' ');
      enrichedQuery = `${recentContext} ${question}`.substring(0, 500);
    }
    
    // Gera 2 variações da pergunta para busca mais ampla
    let searchQueries = [enrichedQuery];
    try {
      const rewritePrompt = `Você é um assistente de busca técnica de elevadores. Dado a pergunta abaixo, gere EXATAMENTE 2 reformulações diferentes da mesma pergunta usando termos técnicos alternativos. Retorne APENAS as reformulações, uma por linha, sem numeração.

Pergunta: "${question}"${hasHistory ? `\nContexto da conversa: ${enrichedQuery.substring(0, 200)}` : ''}

Reformulações:`;
      
      const rewriteResult = await queryRewriter.generateContent(rewritePrompt);
      const alternatives = rewriteResult.response.text()
        .split('\n')
        .map(l => l.trim())
        .filter(l => l.length > 5 && l.length < 300)
        .slice(0, 2);
      
      if (alternatives.length > 0) {
        searchQueries.push(...alternatives);
        console.log(`📝 Multi-query: ${searchQueries.length} variações de busca`);
      }
    } catch (e) {
      console.log('⚠️ Reescrita de query falhou, usando query original');
    }
    
    // ═══ BUSCA PARALELA COM TODAS AS QUERIES ═══
    console.log(`📚 Buscando documentos...${brandFilter ? ` (filtro: ${brandFilter})` : ''}`);
    
    const allResults = new Map(); // id -> {doc, maxSimilarity}
    
    for (const query of searchQueries) {
      const queryEmb = await generateEmbedding(query);
      const docs = await searchSimilar(queryEmb, topK * 2, brandFilter); // Busca mais docs por query
      
      for (const doc of docs) {
        const docId = doc.metadata?.chunkIndex + '_' + (doc.metadata?.source || '');
        const existing = allResults.get(docId);
        if (!existing || doc.similarity > existing.similarity) {
          allResults.set(docId, doc);
        }
      }
    }
    
    // Converte para array e ordena por similaridade
    const mergedDocs = Array.from(allResults.values())
      .sort((a, b) => b.similarity - a.similarity);
    
    // ═══ FILTRA POR SIMILARIDADE MÍNIMA ═══
    const relevantDocs = mergedDocs.filter(doc => doc.similarity >= MIN_SIMILARITY);
    
    console.log(`📊 ${mergedDocs.length} docs únicos encontrados, ${relevantDocs.length} acima do threshold (${MIN_SIMILARITY * 100}%)`);
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
    
    // ═══ SELECIONA OS MELHORES DOCUMENTOS (diversidade de fontes) ═══
    // Garante que documentos de diferentes fontes apareçam (não só do mesmo PDF)
    const MAX_CONTEXT_DOCS = 15; // Mais contexto = respostas mais completas
    const selectedDocs = [];
    const sourceCounts = {};
    const MAX_PER_SOURCE = 8; // Máximo de chunks de um mesmo PDF
    
    for (const doc of relevantDocs) {
      if (selectedDocs.length >= MAX_CONTEXT_DOCS) break;
      const source = doc.metadata?.source || 'unknown';
      sourceCounts[source] = (sourceCounts[source] || 0) + 1;
      if (sourceCounts[source] <= MAX_PER_SOURCE) {
        selectedDocs.push(doc);
      }
    }
    
    // 4. Identifica quais fontes (PDFs) foram encontradas
    const sourcesFound = [...new Set(selectedDocs.map(d => d.metadata?.source || 'Desconhecido'))];
    const sourcesList = sourcesFound.map(s => {
      const clean = s.replace(/^\d+-\d+-/, '').replace(/\.pdf$/i, '');
      return fixEncoding(clean);
    }).join(', ');
    
    // 5. Monta o contexto - inclui a fonte de cada trecho
    const context = selectedDocs.map((doc, i) => {
      const sourceName = fixEncoding((doc.metadata?.source || 'Desconhecido').replace(/^\d+-\d+-/, '').replace(/\.pdf$/i, ''));
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
${conversationBlock ? `Este é o histórico da conversa até agora. LEMBRE de TUDO que o técnico já disse (modelo, placa, erro, sintomas). 

⚠️ REGRA CRÍTICA DE MEMÓRIA: NUNCA, JAMAIS pergunte algo que o técnico JÁ respondeu no histórico. Se ele já disse o modelo, NÃO pergunte o modelo de novo. Se ele já disse a placa, NÃO pergunte a placa de novo. Repetir perguntas é o PIOR erro que você pode cometer — mostra que você não presta atenção.

--- HISTÓRICO ---
${conversationBlock}
--- FIM DO HISTÓRICO ---

ANTES de responder, analise o histórico e extraia TODAS as variáveis já informadas:
- Marca: (verifique se foi mencionada)
- Modelo: (verifique se foi mencionado — ex: GEN2, Regen, LVA, 3300)
- Placa controladora: (verifique se foi mencionada — ex: LCB2, LCBII, PCC)
- Código de erro: (verifique se foi mencionado)
- Sintomas: (verifique o que foi descrito)
- Andar/localização: (verifique se foi mencionado)

USE todas essas informações na sua resposta. Se alguma variável IMPORTANTE ainda falta (e ela muda a resposta), aí sim pergunte — mas APENAS as que faltam.` : 'Primeira mensagem da conversa. Ainda não tem contexto. Se precisar de mais info, pergunte de forma natural.'}

═══════════════════════════════════════════
🚫 REGRA DE OURO — SÓ FALE O QUE SABE
═══════════════════════════════════════════
ISTO É INEGOCIÁVEL. Você é extremamente restrito:
- Responda EXCLUSIVAMENTE com base na BASE DE CONHECIMENTO abaixo. NADA de fora.
- Se a informação NÃO está nos documentos, diga com naturalidade: "Isso não tá nos manuais que tenho aqui. Melhor conferir no manual físico do equipamento."
- NUNCA, EM HIPÓTESE ALGUMA, invente códigos, pinos, tensões, nomes de placa ou procedimentos.
- NUNCA adapte info de uma marca/modelo pra outra — cada fabricante é um mundo.
- Se é sobre marca/modelo que não tem nos docs: "Não tenho material sobre [marca/modelo]. Os manuais que tenho são de: ${sourcesList}."
- Prefira dizer "não sei" do que chutar. O chute errado pode causar acidente.

REGRA CRÍTICA — NÃO SUGIRA O QUE NÃO CONHECE:
- NUNCA cite nomes de marcas, modelos, placas ou equipamentos como EXEMPLO a não ser que eles apareçam EXPLICITAMENTE na BASE DE CONHECIMENTO abaixo.
- Os manuais disponíveis na base são: ${sourcesList}. SÓ mencione marcas/modelos que constam nesses manuais.
- Se precisar pedir o modelo ao técnico, pergunte de forma ABERTA: "Qual o modelo do elevador?" — SEM dar exemplos que você não pode atender.

═══════════════════════════════════════════
🛡️ SEGURANÇA PRIMEIRO
═══════════════════════════════════════════
Antes de orientar sobre jumper, bypass, medição elétrica, reset de placas/inversores:
- Verifique NO HISTÓRICO se o técnico JÁ informou modelo e placa.
- Se JÁ informou → use essa info e responda diretamente. NÃO pergunte de novo.
- Se NÃO informou nenhum dos dois → pergunte de forma natural APENAS o que falta:
  - Se falta modelo: "Qual o modelo do elevador?"
  - Se falta placa: "Qual placa controladora?"
  - Se faltam os dois: "Me fala o modelo do elevador e a placa, que os pontos mudam bastante."
- NÃO dê exemplos de modelos/placas que NÃO estão na base de conhecimento.
- NUNCA repita a mesma pergunta que já fez ou que o técnico já respondeu.

NUNCA dê jumper genérico. Isso é perigoso.

═══════════════════════════════════════════
❓ PERGUNTAS DE ESCLARECIMENTO — SEJA PROATIVO MAS NÃO REPETITIVO
═══════════════════════════════════════════
Quando a pergunta do técnico for VAGA ou INCOMPLETA, NÃO tente adivinhar — PERGUNTE.

REGRA FUNDAMENTAL: Antes de perguntar qualquer coisa, RELEIA o histórico. Se a informação já foi dada, USE-A em vez de perguntar. Só pergunte o que REALMENTE falta.

Situações em que DEVE perguntar (se a info não está no histórico):
- "Elevador parado" → Parado onde? Tem erro no display? Qual marca/modelo?
- "Porta não funciona" → Não abre? Não fecha? Abre e volta? Qual andar?
- "Tá dando erro" → Qual código? O que aparece no display?
- "Preciso jumpear" → Jumpear o quê? Qual modelo? (só pergunte o que falta)

Quando for perguntar:
✅ Perguntas ABERTAS sem exemplos inventados: "Qual o modelo do elevador?" / "Qual placa tá usando?"
✅ Se a info já existe no histórico, use: "Entendi, você mencionou [X]. E qual a placa?"
❌ NÃO dê exemplos de modelos/marcas/placas que NÃO existem na base de conhecimento
❌ NÃO repita pergunta que o técnico já respondeu
❌ NÃO faça assim (robótico): "Por favor, informe: 1) Modelo 2) Placa 3) Código de erro"

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
      sources: selectedDocs.map(doc => ({
        source: doc.metadata?.source || 'Desconhecido',
        title: doc.metadata?.title || '',
        excerpt: doc.content.substring(0, 200) + '...',
        similarity: Math.round(doc.similarity * 100)
      })),
      searchTime: endTime - startTime,
      documentsFound: selectedDocs.length
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
