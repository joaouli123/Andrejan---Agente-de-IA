/**
 * Serviço RAG (Retrieval-Augmented Generation)
 * Combina busca semântica com geração de resposta via Gemini
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { generateEmbedding } from './embeddingService.js';
import { searchSimilar, getIndexedSources } from './vectorStore.js';
import dotenv from 'dotenv';

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Modelo com leve naturalidade na linguagem, mas fiel aos dados
const model = genAI.getGenerativeModel({ 
  model: 'gemini-2.5-flash',
  generationConfig: {
    temperature: 0.15,   // Leve variação para linguagem natural (sem inventar dados)
    topP: 0.4,           // Permite variação de linguagem mas prioriza precisão
    topK: 5,             // Pequena variedade de expressão
    maxOutputTokens: 8192 // Respostas detalhadas com passo a passo
  }
});

// Modelo leve para reescrita de queries (multi-query retrieval)
const queryRewriter = genAI.getGenerativeModel({ 
  model: 'gemini-2.5-flash',
  generationConfig: {
    temperature: 0.3,
    maxOutputTokens: 512
  }
});

// --- Cache de respostas com TTL ---
const responseCache = new Map();
const RESPONSE_CACHE_TTL = 5 * 60 * 1000; // 5 minutos
const RESPONSE_CACHE_MAX = 50;
// Bump this when changing prompts/guardrails to avoid serving stale cached answers
const RESPONSE_CACHE_VERSION = '2026-02-11';

/**
 * Corrige encoding corrompido (UTF-8 decodificado como Latin-1)
 * Ex: "TÃCNICO" → "TÉCNICO", "RÃPIDA" → "RÁPIDA", "versÃ£o" → "versão"
 */
function fixEncoding(str) {
  if (!str) return str;

  const original = String(str);

  const scoreGarbage = (s) => {
    const text = String(s);
    const matches = text.match(/[ÃÂ\uFFFD\u0080-\u009F]/g);
    return matches ? matches.length : 0;
  };

  // 1) Melhor tentativa (Node): reinterpreta Latin-1 -> UTF-8
  // Isso corrige: "TÃ‰CNICO" -> "TÉCNICO", "NOÃ‡Ã•ES" -> "NOÇÕES"
  try {
    const candidate = Buffer.from(original, 'latin1').toString('utf8');
    if (candidate && candidate !== original && scoreGarbage(candidate) < scoreGarbage(original)) {
      return candidate;
    }
  } catch {
    // segue fallback
  }

  // 2) Fallback determinístico: substituições ordenadas (não usar mapeamento genérico "Ã" -> ...)
  const replacements = [
    ['Ã\u0089', 'É'],
    ['Ã\u0081', 'Á'],
    ['Ã\u008D', 'Í'],
    ['Ã\u0093', 'Ó'],
    ['Ã\u0095', 'Õ'],
    ['Ã\u009A', 'Ú'],
    ['Ã\u0087', 'Ç'],
    ['Ã\u0083', 'Ã'],
    ['Ã\u0082', 'Â'],
    ['Ã\u008A', 'Ê'],
    ['Ã\u0094', 'Ô'],
    ['Ã‰', 'É'],
    ['ÃÁ', 'Á'],
    ['ÃÍ', 'Í'],
    ['Ã“', 'Ó'],
    ['Ã•', 'Õ'],
    ['Ãš', 'Ú'],
    ['Ã‡', 'Ç'],
    ['Ãƒ', 'Ã'],
    ['Ã‚', 'Â'],
    ['ÃŠ', 'Ê'],
    ['Ã”', 'Ô'],
    ['Ã©', 'é'],
    ['Ã¡', 'á'],
    ['Ã£', 'ã'],
    ['Ã§', 'ç'],
    ['Ãµ', 'õ'],
    ['Ã³', 'ó'],
    ['Ãº', 'ú'],
    ['Ã­', 'í'],
    ['Ã¢', 'â'],
    ['Ãª', 'ê'],
    ['Ã´', 'ô'],
    ['Ã¼', 'ü'],
    // "Â" sobrando (comum em dupla decodificação)
    ['Â', ''],
  ];

  let result = original;
  for (const [from, to] of replacements) {
    result = result.split(from).join(to);
  }
  return result;
}

function getResponseCacheKey(question, brandFilter) {
  return `${RESPONSE_CACHE_VERSION}|${(question || '').trim().toLowerCase().substring(0, 200)}|${brandFilter || ''}`;
}

const BOARD_TOKENS = [
  'LCBII', 'LCB', 'MCSS', 'MCP', 'MCB', 'RBI', 'GMUX', 'PLA6001', 'DCB', 'PIB',
  'GCIOB', 'MCP100', 'PLA6001', 'URM', 'CAVF', 'GDCB',
];

function extractSearchSignals(question, conversationHistory) {
  const texts = [
    question,
    ...(conversationHistory || [])
      .filter(m => m?.role === 'user')
      .slice(-12)
      .map(m => m?.parts?.[0]?.text || ''),
  ]
    .filter(Boolean)
    .join(' ');

  const upper = texts.toUpperCase();
  const boardTokens = BOARD_TOKENS.filter(t => upper.includes(t));

  const errorTokens = Array.from(
    new Set(
      (texts.match(/\b([A-Z]{1,4}\s?-?\s?\d{1,4}|E\s?\d{2,4}|\d{2,4})\b/g) || [])
        .map(s => s.replace(/\s+/g, '').toUpperCase())
        .filter(s => s.length >= 2 && s.length <= 8)
    )
  ).slice(0, 6);

  return {
    boardTokens,
    errorTokens,
  };
}

function buildClarifyingQuestions(question, hasHistory, signals) {
  const needsHardwareSpecific = /tens[aã]o|alimenta|jumper|bypass|med(i|iç)[aã]o|medir|conector|pino|pinagem|reset|drive|inversor/i.test(question);
  const hasBoard = (signals?.boardTokens?.length || 0) > 0;

  const questions = [];
  if (!hasHistory) {
    questions.push('Qual a marca e o modelo do elevador (como está na etiqueta/manual do equipamento)?');
  } else {
    questions.push('Qual é o modelo do elevador (exatamente como aparece no equipamento)?');
  }
  if (!hasBoard) {
    questions.push('Qual o nome da placa/módulo (o que está escrito nela ou no display/diagnóstico)?');
  }
  questions.push('Qual o código/mensagem de erro e em que ponto aparece (display, placa, drive)?');

  if (needsHardwareSpecific) {
    questions.push('Você quer a alimentação de qual conjunto exatamente (placa, drive, fonte, comando de porta)?');
  }

  // Mantém no máximo 3 perguntas para não virar formulário
  return questions.slice(0, 3);
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
    
    const signals = extractSearchSignals(question, conversationHistory);

    // Query original enriquecida com contexto + sinais (placa/erro) para melhorar recall
    let enrichedQuery = question;
    if (hasHistory) {
      const recentContext = conversationHistory
        .slice(-10)
        .filter(m => m.role === 'user')
        .map(m => m.parts[0]?.text || '')
        .join(' ');
      enrichedQuery = `${recentContext} ${question}`;
    }
    const signalSuffix = [...(signals.boardTokens || []), ...(signals.errorTokens || [])].join(' ');
    if (signalSuffix) enrichedQuery = `${enrichedQuery} ${signalSuffix}`;
    enrichedQuery = enrichedQuery.substring(0, 700);
    
    // Gera 2 variações da pergunta para busca mais ampla
    let searchQueries = [enrichedQuery];
    try {
      const rewritePrompt = `Você é um assistente de BUSCA (não de resposta) para manuais técnicos.

    Tarefa: gere EXATAMENTE 2 reformulações da pergunta para melhorar a recuperação em um banco vetorial.

    Regras INEGOCIÁVEIS:
    - NÃO invente marcas, modelos, placas, códigos ou nomes.
    - Se existirem tokens na pergunta/contexto (ex: nomes de placas tipo LCBII/MCSS/MCP, ou códigos/erros), mantenha-os IGUAIS.
    - Pode trocar sinônimos e variar a ordem das palavras, mas sem adicionar entidades novas.
    - Retorne APENAS as 2 linhas de reformulação (uma por linha), sem numeração e sem texto extra.

    Pergunta: "${question}"${hasHistory ? `\nContexto (resumo): ${enrichedQuery.substring(0, 220)}` : ''}

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
    const topSim = relevantDocs.length > 0 ? relevantDocs[0].similarity : 0;
    if (relevantDocs.length > 0) {
      console.log(`   Top sim: ${Math.round(topSim * 100)}%, Bottom sim: ${Math.round(relevantDocs[relevantDocs.length - 1].similarity * 100)}%`);
    }

    // Se não achou nada relevante, NÃO chuta: faz perguntas para melhorar a busca
    if (relevantDocs.length === 0) {
      const indexed = (getIndexedSources?.() || []).map(s => fixEncoding((s || '').replace(/^\d+-\d+-/, '').replace(/\.pdf$/i, ''))).filter(Boolean);
      const sourcesText = indexed.length ? `Manuais disponíveis aqui: ${indexed.slice(0, 20).join(', ')}.` : 'Nenhum manual parece estar indexado no momento.';

      const questions = buildClarifyingQuestions(question, hasHistory, signals);
      const qBlock = questions.map(q => `- ${q}`).join('\n');
      const brandMsg = brandFilter
        ? `Não encontrei trechos relevantes dentro do filtro de marca selecionado.`
        : `Não encontrei trechos relevantes na base para essa pergunta.`;

      return {
        answer: `${brandMsg}\n\nPra eu achar certinho nos manuais, me responde rapidinho:\n${qBlock}\n\n${sourcesText}`,
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

    // Se a pergunta exige orientação elétrica/jumper e ainda não temos sinais mínimos (modelo/placa), pergunta antes de orientar.
    // Isso evita respostas perigosas mesmo quando existe algum contexto parecido.
    const needsHardwareSpecific = /tens[aã]o|alimenta|jumper|bypass|med(i|iç)[aã]o|medir|conector|pino|pinagem|reset|drive|inversor/i.test(question);
    const hasBoard = (signals.boardTokens || []).length > 0;
    if (needsHardwareSpecific && !hasBoard) {
      const questions = buildClarifyingQuestions(question, hasHistory, signals);
      const qBlock = questions.map(q => `- ${q}`).join('\n');
      return {
        answer: `Beleza — pra eu te falar ponto de alimentação/conector/pino sem risco de chutar, preciso de 2-3 detalhes:\n${qBlock}`,
        sources: [],
        searchTime: Date.now() - startTime
      };
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
- Modelo: (verifique se foi mencionado)
- Placa: (verifique se foi mencionada — nos manuais aparecem como LCBII, LCB, MCSS, MCP, MCB, RBI, GMUX, PLA6001, DCB, PIB etc.)
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
- NUNCA, JAMAIS, EM NENHUMA CIRCUNSTÂNCIA cite nomes de marcas, modelos, placas ou equipamentos como EXEMPLO entre parênteses ou de qualquer forma.
- Os manuais disponíveis na base são: ${sourcesList}. SÓ mencione marcas/modelos que constam nesses manuais E SOMENTE quando estiver respondendo sobre eles, NUNCA como sugestão/exemplo.
- Se precisar pedir o modelo ao técnico, pergunte APENAS: "Qual o modelo do elevador?" — PONTO FINAL. Sem "ex:", sem "como por exemplo", sem lista entre parênteses.
- É TERMINANTEMENTE PROIBIDO escrever qualquer coisa do tipo "(ex: ...)" ou qualquer lista/sugestão entre parênteses.
- Se o técnico mencionar uma marca/modelo que NÃO está nos seus manuais, diga APENAS que não tem material sobre aquilo e liste os manuais que tem. NÃO pergunte mais nada — deixe o técnico decidir o que quer saber.

REGRA DE TERMINOLOGIA — USE OS MESMOS TERMOS DOS MANUAIS:
- Use EXCLUSIVAMENTE a terminologia que aparece nos documentos. NÃO invente termos.
- Nos manuais as placas são chamadas pelos nomes específicos: LCBII, LCB, MCSS, MCP, MCB, RBI, GMUX, PLA6001, DCB, PIB, etc. Use ESSES nomes quando se referir a elas.
- O termo genérico nos manuais é "placa de controle" ou simplesmente "placa", NUNCA "placa controladora".
- Para perguntar ao técnico qual placa ele usa, diga apenas: "Qual a placa?" ou "Qual placa tá usando?" — termos simples e naturais.
- Se o técnico disser o nome de uma placa, use O MESMO NOME que ele usou na resposta.

═══════════════════════════════════════════
🛡️ SEGURANÇA PRIMEIRO
═══════════════════════════════════════════
Antes de orientar sobre jumper, bypass, medição elétrica, reset de placas/inversores:
- Verifique NO HISTÓRICO se o técnico JÁ informou modelo e placa.
- Se JÁ informou → use essa info e responda diretamente. NÃO pergunte de novo.
- Se NÃO informou nenhum dos dois → pergunte de forma natural APENAS o que falta:
  - Se falta modelo: "Qual o modelo do elevador?"
  - Se falta placa: "Qual a placa?" ou "Qual placa tá usando?"
  - Se faltam os dois: "Me fala o modelo do elevador e a placa, que os pontos mudam bastante."
- PROIBIDO colocar "(ex: ...)" ou qualquer lista de sugestão junto das perguntas.
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
✅ CERTO: "Qual o modelo do elevador?" — pergunta limpa, sem sugestão
✅ CERTO: "Qual placa tá usando?" — direto ao ponto
✅ CERTO: "Entendi, você mencionou [X]. E qual a placa?" — usa contexto do histórico

REGRA: Se você tem CERTEZA da resposta com as infos que já tem, responda direto. Só pergunte quando a informação faltante MUDA a resposta.

═══════════════════════════════════════════
🔧 COMO RESPONDER
═══════════════════════════════════════════

ADAPTE o formato ao tipo de pergunta:

═══════════════════════════════════════════
🧱 SEM ENCHEÇÃO — RESPOSTA DE TÉCNICO
═══════════════════════════════════════════
Isso aqui NÃO é Wikipedia. Regras:
- NÃO faça checklist óbvio do tipo "verifique se a porta está fechada" a menos que o MANUAL indique esse passo como parte do diagnóstico daquele erro.
- Cada causa/ação que você citar precisa ter algum gancho no conteúdo da base (termo, componente, conector, sintoma, sequência). Se não tiver, NÃO invente.
- Se a pergunta pede **tensão/conector/pino** e a base não dá esse ponto com clareza, você NÃO responde genérico — você pede o dado que falta.
- Seja direto: no máximo 3 hipóteses e 3 ações. Se precisar de mais, é porque falta informação.

**Pergunta vaga**
→ NÃO responda com solução genérica. Faça 2-3 perguntas curtas e técnicas para destravar o diagnóstico.
Se o que o técnico pediu depende de placa/variante/versão (conectores mudam), diga isso explicitamente: "Isso muda conforme a placa/versão. Me fala o modelo e o nome da placa que eu te passo o ponto certinho pelo diagrama."

**Pergunta simples**
→ Resposta direta em 2-4 frases, sem títulos nem seções. Conversacional.

**Problema para resolver**
→ Use estrutura mais completa mas com linguagem natural. Mas atenção: se faltar uma variável que MUDA a resposta (modelo/placa/variante/código), PARE e PERGUNTE antes.

Comece com uma frase de contexto empática, depois:

**O que tá acontecendo:** Explicação rápida (1-2 frases)

**Hipóteses (com base no manual)** (do mais provável pro menos provável):
1. Causa principal — explicação prática
2. Segunda causa — explicação prática  
3. Terceira causa — explicação prática

**O que fazer agora:**
1. Passo concreto e específico
2. Próximo passo com valores exatos (conector, pino, tensão) **somente se isso estiver explícito na base**
3. Se não resolver, próxima verificação

**Procedimento complexo**
→ Passo a passo detalhado, mas com tom de quem tá explicando pro colega do lado.

REGRAS DE PRECISÃO (inegociáveis):
- Pontos de medição: SEMPRE diga conector, pino e valor usando EXATAMENTE a identificação que aparece no manual
- Componentes: use código do manual (K1, Q2, S1)
- Se o manual tem o valor mas não o pino: "O manual indica [valor] no conector [X], mas o pino específico não tá detalhado — melhor conferir no esquema elétrico"

REGRA ANTI-GENERICIDADE:
- Se você só consegue responder com frases genéricas ("verifique alimentação", "verifique porta", "confira cabos"), isso significa que falta dado. Faça 1-3 perguntas diretas para puxar o dado que falta.

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
    let answer = result.response.text();

    // Sanitização de saída (última linha de defesa):
    // - Remove exemplos/sugestões no formato "(ex: ...)" ou "ex: ..." que podem induzir erro
    // - Normaliza terminologia para bater com os manuais
    answer = answer
      .replace(/\(\s*ex\s*:\s*[^)]+\)/gi, '')
      .replace(/\bex\s*:\s*[^\n]+/gi, '')
      .replace(/placa\s+controladora/gi, 'placa')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    
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
