/**
 * Serviço RAG (Retrieval-Augmented Generation)
 * Combina busca semântica com geração de resposta via Gemini
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { generateEmbedding } from './embeddingService.js';
import { searchSimilar, searchLexical, getIndexedSources } from './vectorStoreAdapter.js';
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
const RESPONSE_CACHE_VERSION = '2026-02-12-10';

const ENABLE_CROSS_RERANKER = /^(1|true|yes)$/i.test(String(process.env.RAG_ENABLE_CROSS_RERANKER || '').trim());
const CROSS_RERANKER_CANDIDATES = Math.max(5, parseInt(process.env.RAG_CROSS_RERANKER_CANDIDATES || '18', 10));
const CROSS_RERANKER_KEEP = Math.max(5, parseInt(process.env.RAG_CROSS_RERANKER_KEEP || '12', 10));
const TELEMETRY_BUFFER_MAX = Math.max(50, parseInt(process.env.RAG_TELEMETRY_BUFFER_MAX || '400', 10));
const telemetryBuffer = [];

function pushRagTelemetry(entry) {
  if (!entry || typeof entry !== 'object') return;
  telemetryBuffer.push({ ...entry, at: new Date().toISOString() });
  if (telemetryBuffer.length > TELEMETRY_BUFFER_MAX) {
    telemetryBuffer.splice(0, telemetryBuffer.length - TELEMETRY_BUFFER_MAX);
  }
}

export function getRecentRagTelemetry(limit = 100) {
  const capped = Math.max(1, Math.min(500, Number(limit) || 100));
  return telemetryBuffer.slice(-capped).reverse();
}

export function clearRagTelemetry() {
  telemetryBuffer.length = 0;
}

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
  'YOUNG', 'QUADRO DE COMANDO YOUNG',
];

const INTENT = {
  safetyChain: 'safety_chain',
  general: 'general',
};

const SAFETY_CHAIN_KEYWORDS = [
  'série',
  'segurança',
  'segurancas',
  'cadeia',
  'cadeia de segur',
  'safety',
  'trinco',
  'preliminar',
  'contato',
  'contatos',
  'circuito de segur',
  'serie de porta',
  'serie de portas',
  'serie de segur',
  'serie de seguranca',
  'serie de segurancas',
];

const DOOR_BUS_KEYWORDS = [
  'can',
  'bus',
  'c_l',
  'c_h',
  'can high',
  'can low',
  'comunica',
  'link',
  'protocolo',
  'barramento',
];

const PINOUT_KEYWORDS = [
  'cn',
  'conector',
  'pino',
  'pinagem',
  'borne',
  'bornes',
  'terminal',
  'tabela',
  'esquema',
  'diagrama',
];

// Observação: para LED/piscadas, palavras genéricas (status/fault/led) geram falso-positivo.
// A validação de evidência usa tabela/legenda e/ou padrão explícito de piscadas.
const STATUS_INDICATOR_KEYWORDS = [
  'pisca',
  'piscando',
  'piscadas',
  'blink',
  'tabela',
  'legenda',
  'codigo',
];

const BRAND_CANONICAL_MAP = [
  { canonical: 'Orona', aliases: ['orona', 'arca'] },
  { canonical: 'Otis', aliases: ['otis'] },
  { canonical: 'Schindler', aliases: ['schindler'] },
  { canonical: 'Sectron', aliases: ['sectron'] },
  { canonical: 'Thyssen', aliases: ['thyssen', 'tk', 'tke'] },
  { canonical: 'Atlas', aliases: ['atlas'] },
];

function detectBrandsInText(text) {
  const normalized = normalizeText(text || '');
  if (!normalized) return [];

  const found = new Set();
  for (const brand of BRAND_CANONICAL_MAP) {
    if (brand.aliases.some(alias => normalized.includes(normalizeText(alias)))) {
      found.add(brand.canonical);
    }
  }
  return [...found];
}

function normalizeText(s) {
  return (s || '')
    .toString()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function classifyIntent(question) {
  const q = normalizeText(question);
  if (SAFETY_CHAIN_KEYWORDS.some(k => q.includes(k))) return INTENT.safetyChain;
  return INTENT.general;
}

function isPinoutQuery(question) {
  const q = normalizeText(question);
  if (/\bcn\d{1,2}\b/.test(q)) return true;
  if (PINOUT_KEYWORDS.some(k => q.includes(k))) return true;
  return false;
}

function isDiagnosticWorkflowQuery(question) {
  const q = normalizeText(question);
  if (!q) return false;

  // Heurística: quando o técnico quer PROCEDIMENTO de isolamento/validação (não pinagem)
  const workflowSignals = [
    'como isolar',
    'isolar',
    'diagnostic',
    'diagnostico',
    'falha de parada',
    'parada incorreta',
    'sem movimento',
    'chamado',
    'sinais minimos',
    'sinal minimo',
    'antes de liberar',
    'liberar',
    'sensor',
    'sensores',
    'cabeamento',
    'fiacao',
    'chicote',
    'logica',
    'placa',
    'eme',
    'emergencia',
    'manual',
    'man',
    'cadeia',
    'cadeia de segur',
    'seguranca',
    'ort 15',
  ];

  if (!workflowSignals.some(s => q.includes(s))) return false;

  // Se a pergunta explicitamente pede conector/pino/tabela, não é só workflow.
  if (isPinoutQuery(question)) return false;

  return true;
}

function isIntermittentSafetyChainQuery(question) {
  const q = normalizeText(question);
  if (!q) return false;
  const hasIntermittent = q.includes('intermit') || q.includes('as vezes') || q.includes('vibra') || q.includes('balanca') || q.includes('mau contato');
  const hasSafety = SAFETY_CHAIN_KEYWORDS.some(k => q.includes(normalizeText(k))) || q.includes('eme') || q.includes('emerg');
  if (!hasIntermittent || !hasSafety) return false;
  if (isPinoutQuery(question)) return false;
  return true;
}

function buildIntermittentSafetyChainAnswer(question) {
  const mentionsNoise = /ru[ií]do|ripple|oscila|flutua/i.test(question || '');
  return `Para “série/cadeia de segurança” abrindo intermitente, a estratégia é provar se a abertura é real (contato/cabo) ou se é instabilidade elétrica (queda de tensão/ruído) que o circuito interpreta como abertura.

1) Prove o comportamento (sem trocar placa)
- Faça teste de vibração: com o elevador parado e seguro, mexa/pressione conectores e chicotes por trechos; observe se o sintoma aparece. Se aparece ao tocar um ponto, é forte indicativo de mau contato/cabo.
- Faça inspeção visual focada: oxidação, folga, emenda, cabo esmagado, dobra perto de dobradiça/correia, terminal mal crimpado.

2) Teste queda de tensão sob carga (mais útil que continuidade)
- Medir continuidade “parado” pode passar e falhar sob carga/vibração.
- Meça a tensão do circuito de segurança no ponto de entrada (referência/COM do circuito) e veja se há quedas rápidas quando o sintoma ocorre.
- Se o multímetro tiver MIN/MAX, ative e provoque a falha; isso captura quedas curtas.

3) Separe “cabo/sensor” de “entrada/lógica”
- Se você consegue reproduzir a falha mexendo no chicote/sensor e a tensão/estado cai antes de chegar na placa, é cabeamento/sensor.
- Se no ponto de entrada o sinal parece estável, mas o diagnóstico acusa abertura, suspeite de referência/COM do circuito, entrada sensível, ou falha intermitente interna.

4) Ruído/instabilidade (quando não há mau contato óbvio)
${mentionsNoise ? '- Se há ruído/ripple, verifique aterramento, retorno comum e fontes (24V) com carga; variações rápidas podem simular abertura.' : '- Verifique aterramento/retorno comum e fonte de 24V sob carga; variações rápidas podem simular abertura.'}

Se você me disser onde a série é lida (placa principal vs módulo/operador) e qual evento exato no diagnóstico aparece quando “abre”, eu adapto o passo a passo para o seu cenário sem precisar de pinagem.`;
}

function isBusVsSafetyDisambiguationQuery(question) {
  const q = normalizeText(question);
  if (!q) return false;

  const hasBus = DOOR_BUS_KEYWORDS.some(k => q.includes(normalizeText(k)));
  const hasSafety = SAFETY_CHAIN_KEYWORDS.some(k => q.includes(normalizeText(k))) || q.includes('eme') || q.includes('emerg');
  // Perguntas do tipo: "CAN H/L tem a ver com série?" ou "quando é BUS e quando é contato em série?"
  return hasBus && (hasSafety || q.includes('serie') || q.includes('segur'));
}

function buildBusVsSafetyAnswer() {
  return `BUS/CAN (C_L/C_H) e “série/cadeia de segurança” são coisas diferentes:

- BUS/CAN: comunicação de dados entre módulos, como o operador de porta. Mesmo com tensões presentes no barramento, isso não confirma cadeia de segurança.
- Série/cadeia de segurança: circuito de permissivas (contatos em série). O que importa é o estado (aberto/fechado) e se a controladora reconhece “segurança OK”.

Como diferenciar na prática:
- Se o sintoma é “sem comunicação”, mensagens de link/barramento e comportamento intermitente de dados, é BUS.
- Se o sintoma é “segurança aberta”, EME, intertravamento/porta, ou bloqueio total de movimento por permissiva, é cadeia de segurança.

Se você informar onde está medindo (placa principal vs operador/módulo) e qual mensagem/estado aparece no diagnóstico, eu digo exatamente qual lado atacar primeiro (BUS ou série), sem precisar de pinagem.`;
}

function stripConnectorLikeTokens(text) {
  if (!text) return text;
  // Remove menções de conectores/pinos típicos quando não há evidência (C1, J5, CN1, P35 etc.)
  return String(text)
    .replace(/\bCN\s*\d{1,3}\b/gi, '')
    .replace(/\bJ\s*\d{1,3}\b/gi, '')
    .replace(/\bP\s*\d{1,3}\b/gi, '')
    .replace(/\bC\s*\d{1,3}\b/gi, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function normalizeCompact(s) {
  return normalizeText(s || '').replace(/[^a-z0-9]+/g, '');
}

function extractVoltageTokens(text) {
  const raw = String(text || '');
  const matches = raw.match(/\b\d{1,4}(?:[\.,]\d{1,2})?\s*(?:vdc|vac|vcc|v)\b/gi) || [];
  return Array.from(new Set(matches.map(m => m.replace(',', '.').toLowerCase().replace(/\s+/g, ''))));
}

function extractFaultCodeTokens(text) {
  const raw = String(text || '');
  const tokens = [];

  // fault 29, fault29
  for (const m of raw.match(/\bfault\s*\d{1,4}\b/gi) || []) tokens.push(m);

  // erro 597, código 597, codigo 597
  for (const m of raw.match(/\b(?:erro|c[oó]digo)\s*\d{1,4}\b/gi) || []) tokens.push(m);

  // E123, E-123
  for (const m of raw.match(/\bE\s*-?\s*\d{2,4}\b/g) || []) tokens.push(m);

  return Array.from(new Set(tokens.map(t => t.toLowerCase().replace(/\s+/g, ''))));
}

function containsRiskyActionLanguage(text) {
  return /\b(jumper|bypass|pontear|ponte|desativar\s+seguran|anular\s+seguran|burlar\s+seguran)\b/i.test(text || '');
}

function containsBlinkInterpretation(text) {
  return /\b(pisca|piscando|blink|4x\/s|\d+\s*x\s*a\s*cada\s*\d+\s*(s|seg|segundos))\b/i.test(text || '');
}

function isCriticalLiteralQuestion(question) {
  return /\b(tens[aã]o|vac|vdc|conector|pinagem|pino|borne|fault|erro|falha|c[oó]digo|jump(er)?|bypass|ponte(ar)?)\b/i.test(question || '');
}

function hasLiteralCriticalEvidence(question, docs) {
  const text = (docs || []).map(d => `${d?.metadata?.title || ''} ${d?.content || ''}`).join('\n').toLowerCase();
  if (!text) return false;

  const checks = [];
  if (/\b(tens[aã]o|vac|vdc)\b/i.test(question || '')) {
    checks.push(/\b\d{1,4}(?:[\.,]\d{1,2})?\s*(vac|vdc|v)\b/i.test(text));
  }
  if (/\b(conector|pinagem|pino|borne)\b/i.test(question || '')) {
    checks.push(/\b(cn\s*\d{1,3}|j\s*\d{1,3}|p\s*\d{1,3}|conector|pinagem|borne)\b/i.test(text));
  }
  if (/\b(erro|falha|fault|c[oó]digo)\b/i.test(question || '')) {
    checks.push(/\b(falha|erro|fault|code|\d{3,4})\b/i.test(text));
  }
  if (/\b(jump(er)?|bypass|ponte(ar)?)\b/i.test(question || '')) {
    checks.push(/\b(jumper|bypass|ponte|pontear)\b/i.test(text));
  }

  if (checks.length === 0) return true;
  return checks.every(Boolean);
}

function buildUnsafeUngroundedReply(sessionState, missingItems) {
  const modelLine = sessionState?.model ? `Modelo: ${sessionState.model}.` : '';
  const items = (missingItems || []).slice(0, 4).join(', ');
  return `Para segurança, eu não vou afirmar detalhes específicos sem evidência explícita no banco de conhecimento.

Não encontrei no contexto recuperado suporte literal para: ${items}.${modelLine ? `\n${modelLine}` : ''}

Envie uma destas opções para eu responder com precisão:
- página/foto do manual onde aparece a tabela/legenda/procedimento correspondente
- ou copie e cole o trecho exato do manual/diagrama
- e confirme o nome do módulo/placa envolvido (como está escrito na placa) e o código/mensagem no display (se houver)`;
}

function buildDiagnosticWorkflowAnswer(question) {
  // Resposta procedural genérica e segura (sem inventar pinagem/pinos).
  // Mantém aplicável mesmo quando o RAG não traz evidência específica.
  const mentionsSD = /\b(s\s*\/\s*d)\b/i.test(question || '') || /\bliberar\b/i.test(question || '');
  const sdLine = mentionsSD
    ? '\n\nAntes de liberar S/D: confirme que TODAS as permissivas estão OK (segurança/EME/MAN/porta/intertravamentos). Se qualquer permissiva estiver aberta, liberar S/D pode só mascarar a causa.'
    : '';

  return `Pelo que você descreveu, dá para isolar a causa (sensor vs cabeamento vs lógica da placa) com um fluxo de medição/validação — sem precisar de pinagem exata no início.

1) Confirme as permissivas mínimas (sem “chutar” bypass)
- Alimentação(ões) do circuito de entradas estáveis (ex.: 24V do campo e referência/COM).
- Cadeia de segurança “fechada/OK” no diagnóstico/LEDs.
- Emergência (EME) em condição normal.
- Manual/inspeção (MAN/INS), se existir, no modo que permite movimento.
- Intertravamentos básicos (porta fechada/interlock/limites) conforme o sistema.

2) Isole SENSOR vs CABEAMENTO
- Teste o sensor no ponto do próprio sensor (ele troca mesmo? contato abre/fecha? nível muda?).
- Teste continuidade/queda de tensão no cabo/chicote até a controladora (oxidação, emenda, curto, mau contato).

3) Isole CABEAMENTO vs ENTRADA DA PLACA
- Verifique se o estado que você vê no sensor chega “igual” na entrada da placa (sem precisar saber o pino, mas no borne/conector do circuito correspondente).
  - Muda no sensor e NÃO muda no lado da placa → cabeamento/conector.
  - Muda no lado da placa e a placa NÃO reconhece no diagnóstico → entrada/condicionamento da placa ou referência (COM/0V) faltando.

4) Isole LÓGICA (quando entradas estão OK mas não libera movimento)
- Se as entradas aparecem corretas no diagnóstico e mesmo assim não há movimento, procure:
  - falha latente/memorizada de segurança;
  - permissiva faltando (uma única entrada aberta bloqueia tudo);
  - sequência/temporização (ex.: ordem de CS/CD/LFS/LFD, ou requisito de “porta fechada” antes de habilitar);
  - modo MAN/INS ativo sem perceber.

Se você quiser que eu seja específico da ORT 15 (nomes de sinais no diagnóstico/onde costuma aparecer cada permissiva), me diga o que você está vendo no display/LEDs/diagnóstico de entradas e quais sensores (CS/CD/LFS/LFD) estão “ativos” agora.${sdLine}`;
}

function docText(doc) {
  const title = doc?.metadata?.title || '';
  const content = doc?.content || '';
  return normalizeText(`${title} ${content}`);
}

function countHits(text, keywords) {
  let hits = 0;
  for (const kw of keywords) {
    if (text.includes(kw)) hits += 1;
  }
  return hits;
}

function isStatusIndicatorQuery(question) {
  const q = normalizeText(question);
  if (!q) return false;

  // Indícios fortes: padrão de piscadas, indicador/LED, frequência, fault
  const strongPatterns = [
    'indicador de status',
    'led',
    'pisca',
    'piscando',
    '4x/s',
    '10 segundos',
    'fault',
  ];

  if (strongPatterns.some(p => q.includes(normalizeText(p)))) return true;
  if (/\b\d+\s*x\s*\/\s*s\b/i.test(question || '')) return true;
  if (/\b\d+\s*x\s*a\s*cada\s*\d+\s*(s|seg|segundos)\b/i.test(question || '')) return true;

  return false;
}

function docsHaveBlinkLegendEvidence(docs, question) {
  if (!docs || docs.length === 0) return false;

  const rawQuestion = String(question || '');
  const qHasPerSecond = /(\d+)\s*x\s*\/\s*s/i.test(rawQuestion);
  const qHasEvery = /(\d+)\s*x\s*a\s*cada\s*(\d+)\s*(s|seg|segundos)/i.test(rawQuestion);

  const blinkPatternRegexes = [];
  if (qHasPerSecond) {
    const m = rawQuestion.match(/(\d+)\s*x\s*\/\s*s/i);
    const n = m ? m[1] : null;
    if (n) blinkPatternRegexes.push(new RegExp(`\\b${n}\\s*x\\s*\\/\\s*s\\b`, 'i'));
  }
  if (qHasEvery) {
    const m = rawQuestion.match(/(\d+)\s*x\s*a\s*cada\s*(\d+)\s*(s|seg|segundos)/i);
    const n = m ? m[1] : null;
    const s = m ? m[2] : null;
    if (n && s) blinkPatternRegexes.push(new RegExp(`\\b${n}\\s*x\\s*a\\s*cada\\s*${s}\\s*(s|seg|segundos)\\b`, 'i'));
  }

  return docs.some(d => {
    const raw = `${d?.metadata?.title || ''} ${d?.content || ''}`;
    const norm = normalizeText(raw);

    // Caso 1: existe o MESMO padrão de piscadas explicitamente no texto recuperado
    if (blinkPatternRegexes.length && blinkPatternRegexes.some(rx => rx.test(raw) || rx.test(norm))) return true;

    // Caso 2: há sinais claros de legenda/tabela de piscadas (sem depender de palavras genéricas)
    const hasTable = /\b(tabela|legenda)\b/i.test(raw) || /\b(tabela|legenda)\b/i.test(norm);
    const hasBlinkWord = /\b(pisca|piscando|piscadas|blink)\b/i.test(raw) || /\b(pisca|piscando|piscadas|blink)\b/i.test(norm);
    const hasNumericPattern = /\b\d+\s*x\s*(\/\s*s|a\s*cada)\b/i.test(raw) || /\b\d+\s*x\s*(\/\s*s|a\s*cada)\b/i.test(norm);

    return hasTable && hasBlinkWord && hasNumericPattern;
  });
}

function buildStatusIndicatorClarification(sessionState) {
  const modelLine = sessionState?.model ? `Modelo: ${sessionState.model}.` : '';
  return `Eu não tenho, no banco de conhecimento, a legenda/tabela que mapeia esse padrão de piscadas do indicador de status (${modelLine}). Sem essa legenda, eu não posso afirmar a causa com segurança.

Para eu interpretar corretamente:
- Em qual módulo/placa está esse indicador de status (nome escrito na placa/módulo)?
- Você consegue enviar uma foto do LED e da legenda (ou a página do manual onde aparece a tabela de piscadas)?
- Confirme se aparece alguma mensagem no terminal/display além de “fault”.`;
}

function rerankAndFilterDocs(docs, intent, pinoutQuery = false) {
  if (!docs || docs.length === 0) return docs;

  if (intent !== INTENT.safetyChain && !pinoutQuery) return docs;

  // Para perguntas de série/segurança: prioriza termos de segurança e evita docs de comunicação/CAN.
  // Para pinagem (CN/pinos): prioriza trechos que contenham CN/conector/pino/tabela/diagrama.
  const scored = docs.map(d => {
    const t = docText(d);
    const safetyHits = countHits(t, SAFETY_CHAIN_KEYWORDS);
    const busHits = countHits(t, DOOR_BUS_KEYWORDS);
    const pinHits = pinoutQuery ? countHits(t, PINOUT_KEYWORDS) : 0;
    const penalty = busHits >= 2 ? 2 : busHits; // penaliza forte CAN/C_L/C_H

    let score = (d.similarity || 0);
    if (intent === INTENT.safetyChain) score += safetyHits * 0.06 - penalty * 0.08;
    if (pinoutQuery) score += pinHits * 0.035;

    return { doc: d, score, safetyHits, busHits, pinHits };
  });

  // Filtra fora docs que parecem puramente CAN/bus (muitos termos de BUS e zero termos de segurança)
  const filtered = scored
    .filter(s => {
      if (intent === INTENT.safetyChain) {
        return !(s.busHits >= 2 && s.safetyHits === 0);
      }
      return true;
    })
    .sort((a, b) => b.score - a.score)
    .map(s => s.doc);

  return filtered.length ? filtered : docs;
}

function extractSessionState(question, conversationHistory, brandFilter, signals) {
  const allText = [
    ...(conversationHistory || []).map(m => m?.parts?.[0]?.text || ''),
    question || '',
  ]
    .filter(Boolean)
    .join(' ');

  const upper = allText.toUpperCase();
  const brand = brandFilter || (/(\bORONA\b|\bOTIS\b)/i.exec(allText)?.[1] || null);

  // Heurísticas leves para modelo (somente quando o texto já traz explicitamente)
  // Orona: "Arca II" etc.
  const arcaMatch = /\b(ORONA\s+)?ARCA\s*(I{1,3}|IV|V|VI|\d+)\b/i.exec(allText);
  const oronaModel = arcaMatch ? `Arca ${arcaMatch[2].toUpperCase()}` : null;

  // Otis: detectar "Gen2" quando explícito (não inventa outros modelos)
  const gen2Match = /\bGEN\s*2\b/i.exec(allText);
  const otisModel = gen2Match ? 'Gen2' : null;

  const model = oronaModel || otisModel;

  const board = (signals?.boardTokens?.length || 0) ? signals.boardTokens.join(', ') : null;
  const error = (signals?.errorTokens?.length || 0) ? signals.errorTokens[0] : null;

  // Conector citado (CN1 etc.)
  const connector = (upper.match(/\bCN\d{1,2}\b/g) || [])[0] || null;

  return { brand, model, board, error, connector };
}

function isOtisBrand(brand) {
  return normalizeText(brand || '') === 'otis';
}

function isGenericOtisQuestion(question) {
  const q = normalizeText(question);
  if (!q) return false;

  // Não aplicar quando a pergunta já é de fluxo/procedimento ou específica
  if (isPinoutQuery(question)) return false;
  if (isDiagnosticWorkflowQuery(question)) return false;
  if (isBusVsSafetyDisambiguationQuery(question)) return false;
  if (isIntermittentSafetyChainQuery(question)) return false;
  if (classifyIntent(question) === INTENT.safetyChain) return false;

  const genericSignals = [
    'parado',
    'sem movimento',
    'nao anda',
    'nao sai do lugar',
    'falha',
    'porta',
    'o que fazer',
    'como resolver',
    'nao funciona',
  ];

  if (!genericSignals.some(s => q.includes(s))) return false;

  // Perguntas curtas e sem detalhes tendem a exigir modelo/código
  if (q.length > 140) return false;

  // Se a própria frase já traz bastante detalhe, não precisa bloquear
  const hasDetail = /(fecha.*reabre|reabre|nivelamento|nivelar|intermit|ru[ií]do|cortina|trinco|contato|borda|sensor|limitador|forca)/i.test(question || '');
  if (hasDetail) return false;

  return true;
}

function buildOtisGenericGateQuestions(sessionState, signals) {
  const hasError = (signals?.errorTokens?.length || 0) > 0 || Boolean(sessionState?.error);
  const questions = ['Qual é o modelo do elevador Otis?'];
  if (!hasError) questions.push('Qual código/mensagem aparece no display/terminal (se houver)?');
  questions.push('Ele está parado em qual andar e com a porta em qual estado (aberta/fechada/reabrindo)?');
  return questions.slice(0, 3);
}

function extractStrictFaultCodes(text) {
  if (!text) return [];
  const raw = String(text);
  const out = new Set();

  for (const m of raw.matchAll(/\b(?:falha|erro|fault|code|c[oó]digo)\s*[:#-]?\s*([A-Z]?\s*-?\s*\d{2,4})\b/gi)) {
    const code = String(m[1] || '').replace(/\s+/g, '').toUpperCase();
    if (code.length >= 2 && code.length <= 8) out.add(code);
  }

  // Se a pergunta for curta e focada em código, aceita número isolado (ex.: "falha 303", "303?")
  const shortText = raw.length <= 120;
  const hasErrorIntent = /\b(falha|erro|fault|code|c[oó]digo)\b/i.test(raw);
  if (shortText || hasErrorIntent) {
    for (const m of raw.matchAll(/\b(\d{3,4})\b/g)) {
      out.add(m[1]);
    }
  }

  return Array.from(out).slice(0, 8);
}

function normalizeFaultToken(token) {
  return String(token || '').replace(/\s+/g, '').toUpperCase();
}

function isFaultCodeQuery(question, signals) {
  const hasFaultToken = (signals?.faultCodes?.length || 0) > 0;
  if (hasFaultToken) return true;
  return /\b(falha|erro|fault|code|c[oó]digo)\b/i.test(question || '');
}

function docMentionsAnyFaultCode(doc, faultCodes) {
  if (!doc || !faultCodes || faultCodes.length === 0) return false;
  const text = `${doc?.metadata?.title || ''} ${doc?.content || ''}`.toUpperCase();
  return faultCodes.some(code => {
    const c = normalizeFaultToken(code);
    if (!c) return false;
    const digits = c.replace(/[^0-9]/g, '');
    const patterns = [c, digits].filter(Boolean);
    return patterns.some(p => new RegExp(`(^|[^0-9A-Z])${p}([^0-9A-Z]|$)`, 'i').test(text));
  });
}

function rerankDocsForFaultCodes(docs, faultCodes) {
  if (!docs || docs.length === 0 || !faultCodes || faultCodes.length === 0) return docs;

  const scored = docs.map(d => {
    const raw = `${d?.metadata?.title || ''} ${d?.content || ''}`.toUpperCase();
    const title = String(d?.metadata?.title || '').toUpperCase();
    const metaFault = normalizeFaultToken(d?.metadata?.faultCode || '');
    const chunkType = String(d?.metadata?.chunkType || '');

    let codeHits = 0;
    let titleHits = 0;
    let metadataHits = 0;

    for (const token of faultCodes) {
      const c = normalizeFaultToken(token);
      const digits = c.replace(/[^0-9]/g, '');
      const patterns = [c, digits].filter(Boolean);

       if (metaFault && patterns.some(p => p && (metaFault === p || metaFault.includes(p) || p.includes(metaFault)))) {
        metadataHits += 1;
      }

      for (const p of patterns) {
        const rx = new RegExp(`(^|[^0-9A-Z])${p}([^0-9A-Z]|$)`, 'i');
        if (rx.test(raw)) codeHits += 1;
        if (rx.test(title)) titleHits += 1;
      }
    }

    const chunkTypeBonus = chunkType === 'fault_code' ? 0.16 : chunkType === 'page_window' ? 0.06 : 0;
    const score = (d.similarity || 0) + (codeHits * 0.18) + (titleHits * 0.08) + (metadataHits * 0.22) + chunkTypeBonus;
    return { doc: d, score };
  });

  return scored.sort((a, b) => b.score - a.score).map(s => s.doc);
}

function buildFaultCodeQueries(baseQuestion, faultCodes, sessionState) {
  if (!faultCodes || faultCodes.length === 0) return [];

  const extras = new Set();
  const brand = sessionState?.brand ? String(sessionState.brand) : '';
  const model = sessionState?.model ? String(sessionState.model) : '';

  for (const token of faultCodes.slice(0, 4)) {
    const normalized = normalizeFaultToken(token);
    const digits = normalized.replace(/[^0-9]/g, '');
    const mainCode = digits || normalized;
    if (!mainCode) continue;

    extras.add(`falha ${mainCode}`);
    extras.add(`erro ${mainCode}`);
    extras.add(`fault ${mainCode}`);
    extras.add(`código ${mainCode}`);
    extras.add(`${mainCode} vac under`);

    if (brand) extras.add(`${brand} falha ${mainCode}`);
    if (brand && model) extras.add(`${brand} ${model} falha ${mainCode}`);
  }

  // Mantém consulta original como referência sem modificar semântica
  extras.add(String(baseQuestion || '').trim());

  return Array.from(extras)
    .map(s => s.trim())
    .filter(s => s.length > 4 && s.length < 260)
    .slice(0, 8);
}

const SEARCH_STOPWORDS = new Set([
  'de', 'da', 'do', 'das', 'dos', 'a', 'o', 'as', 'os', 'e', 'ou', 'com', 'sem', 'para', 'por', 'no', 'na', 'nos', 'nas',
  'um', 'uma', 'uns', 'umas', 'que', 'como', 'qual', 'quais', 'quando', 'onde', 'porque', 'pra', 'está', 'esta', 'estao',
  'isso', 'essa', 'esse', 'ele', 'ela', 'eles', 'elas', 'tem', 'têm', 'ser', 'foi', 'sao', 'são', 'mais', 'menos', 'sobre',
  'manual', 'pagina', 'página', 'favor', 'ajuda', 'preciso', 'quero', 'pode'
]);

function extractTechnicalKeywords(question, conversationHistory, signals) {
  const history = (conversationHistory || [])
    .filter(m => m?.role === 'user')
    .slice(-6)
    .map(m => m?.parts?.[0]?.text || '')
    .join(' ');

  const text = `${question || ''} ${history}`;
  const normalized = normalizeText(text);
  const words = normalized.match(/[a-z0-9]{3,}/g) || [];

  const base = Array.from(new Set(words.filter(w => !SEARCH_STOPWORDS.has(w))));

  const intentTokens = [];
  if (isPinoutQuery(question)) intentTokens.push('pinagem', 'conector', 'diagrama', 'tabela');
  if (classifyIntent(question) === INTENT.safetyChain) intentTokens.push('seguranca', 'cadeia', 'serie');
  if (isStatusIndicatorQuery(question)) intentTokens.push('led', 'blink', 'legenda');
  if ((signals?.faultCodes?.length || 0) > 0) intentTokens.push('falha', 'erro', 'fault');

  const merged = Array.from(new Set([...intentTokens, ...base]));
  return merged.slice(0, 20);
}

function buildSupplementalQueries(question, technicalKeywords, sessionState, signals) {
  const q = String(question || '').trim();
  const extras = new Set();

  const strongTerms = (technicalKeywords || []).slice(0, 10);
  const board = sessionState?.board ? String(sessionState.board) : '';
  const model = sessionState?.model ? String(sessionState.model) : '';
  const brand = sessionState?.brand ? String(sessionState.brand) : '';
  const connector = sessionState?.connector ? String(sessionState.connector) : '';
  const fault = (signals?.faultCodes?.[0] || signals?.errorTokens?.[0] || '').toString();

  if (strongTerms.length >= 2) {
    extras.add(`${strongTerms[0]} ${strongTerms[1]}`);
    extras.add(`${strongTerms.slice(0, 3).join(' ')}`);
  }

  if (board) extras.add(`${board} ${q}`);
  if (model && brand) extras.add(`${brand} ${model} ${q}`);
  if (connector) extras.add(`${connector} pinagem tabela diagrama`);
  if (fault) extras.add(`falha ${fault} ${board || model || ''}`.trim());

  if (isStatusIndicatorQuery(question)) {
    extras.add(`${q} tabela legenda indicador`);
  }

  if (isPinoutQuery(question)) {
    extras.add(`${q} conector pinos tabela`);
  }

  extras.add(q);

  return Array.from(extras)
    .map(s => s.replace(/\s+/g, ' ').trim())
    .filter(s => s.length > 5 && s.length < 300)
    .slice(0, 8);
}

function rerankDocsByLexicalCoverage(docs, technicalKeywords) {
  if (!docs || docs.length === 0) return docs;
  const kws = (technicalKeywords || []).filter(Boolean).slice(0, 14);
  if (kws.length === 0) return docs;

  const scored = docs.map(doc => {
    const text = normalizeText(`${doc?.metadata?.title || ''} ${doc?.content || ''}`);
    const chunkType = String(doc?.metadata?.chunkType || '');
    let hits = 0;
    for (const kw of kws) {
      if (text.includes(normalizeText(kw))) hits += 1;
    }

    const lexicalBonus = Math.min(0.25, hits * 0.02);
    const typeBonus = chunkType === 'fault_code' ? 0.05 : chunkType === 'page_window' ? 0.03 : 0;
    const score = (doc.similarity || 0) + lexicalBonus + typeBonus;
    return { doc, score };
  });

  return scored.sort((a, b) => b.score - a.score).map(s => s.doc);
}

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

  const faultCodes = extractStrictFaultCodes(texts);

  return {
    boardTokens,
    errorTokens,
    faultCodes,
  };
}

function buildClarifyingQuestions(question, hasHistory, signals) {
  const needsHardwareSpecific = /tens[aã]o|alimenta|jumper|bypass|med(i|iç)[aã]o|medir|conector|pino|pinagem|reset|drive|inversor/i.test(question);
  const hasBoard = (signals?.boardTokens?.length || 0) > 0;

  const questions = [];
  if (!hasHistory) {
    questions.push('Qual a marca e o modelo do elevador (como está na etiqueta/documentação técnica do equipamento)?');
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

function extractConnectorTokens(text) {
  if (!text) return [];
  return Array.from(
    new Set(
      (String(text).toUpperCase().match(/\b(?:CN|J|P)\s*-?\s*\d{1,3}\b/g) || [])
        .map(s => s.replace(/\s+/g, ''))
    )
  );
}

function buildDocKey(doc) {
  const source = doc?.metadata?.source || '';
  const chunk = doc?.metadata?.chunkIndex ?? '';
  const page = doc?.metadata?.page ?? '';
  const prefix = String(doc?.content || '').slice(0, 120);
  return `${source}::${chunk}::${page}::${prefix}`;
}

function normalizeForDedup(text) {
  return normalizeText(text || '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenSet(text) {
  const normalized = normalizeForDedup(text);
  if (!normalized) return new Set();
  return new Set(normalized.split(' ').filter(t => t.length >= 3));
}

function jaccardSimilarity(setA, setB) {
  if (!setA?.size || !setB?.size) return 0;
  let intersection = 0;
  for (const t of setA) {
    if (setB.has(t)) intersection += 1;
  }
  const union = setA.size + setB.size - intersection;
  return union <= 0 ? 0 : intersection / union;
}

function diversifyDocs(docs, maxDocs = 25, maxPerSource = 8, nearDuplicateThreshold = 0.88) {
  if (!Array.isArray(docs) || docs.length === 0) return [];

  const selected = [];
  const sourceCounts = new Map();

  for (const doc of docs) {
    if (selected.length >= maxDocs) break;

    const source = doc?.metadata?.source || 'unknown';
    const currentBySource = sourceCounts.get(source) || 0;
    if (currentBySource >= maxPerSource) continue;

    const content = `${doc?.metadata?.title || ''} ${doc?.content || ''}`;
    const currentTokens = tokenSet(content);
    if (currentTokens.size === 0) continue;

    let isNearDuplicate = false;
    for (const chosen of selected) {
      const score = jaccardSimilarity(currentTokens, chosen._tokenSet);
      if (score >= nearDuplicateThreshold) {
        isNearDuplicate = true;
        break;
      }
    }
    if (isNearDuplicate) continue;

    sourceCounts.set(source, currentBySource + 1);
    selected.push({ ...doc, _tokenSet: currentTokens });
  }

  return selected.map(({ _tokenSet, ...doc }) => doc);
}

async function rerankDocsWithCrossModel(question, docs, sessionState) {
  if (!ENABLE_CROSS_RERANKER) return { docs, applied: false, reason: 'disabled' };
  if (!Array.isArray(docs) || docs.length < 3) return { docs, applied: false, reason: 'insufficient_docs' };

  const candidates = docs.slice(0, CROSS_RERANKER_CANDIDATES);
  const payload = candidates.map((d, idx) => ({
    id: idx + 1,
    title: String(d?.metadata?.title || '').slice(0, 180),
    source: String(d?.metadata?.source || '').slice(0, 120),
    similarity: Number(d?.similarity || 0).toFixed(4),
    excerpt: String(d?.content || '').replace(/\s+/g, ' ').slice(0, 700),
  }));

  const prompt = `Você é um reranker técnico para RAG de manutenção.

Objetivo: ordenar os trechos por utilidade para responder à pergunta do técnico com precisão factual.

Regra de saída: retorne APENAS JSON válido no formato:
{"ordered":[id1,id2,...]}

Critérios de ordenação (maior prioridade primeiro):
1) evidência literal para responder a pergunta;
2) aderência ao modelo/placa/erro informado;
3) maior especificidade técnica (evitar genéricos);
4) menor risco de confusão de contexto.

Pergunta: ${String(question || '').slice(0, 500)}
Contexto de sessão: marca=${sessionState?.brand || 'n/a'}, modelo=${sessionState?.model || 'n/a'}, placa=${sessionState?.board || 'n/a'}, erro=${sessionState?.error || 'n/a'}

Candidatos:
${JSON.stringify(payload)}`;

  try {
    const result = await queryRewriter.generateContent(prompt);
    const text = String(result?.response?.text?.() || '').trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { docs, applied: false, reason: 'no_json' };

    const parsed = JSON.parse(jsonMatch[0]);
    const orderedIds = Array.isArray(parsed?.ordered) ? parsed.ordered : [];
    if (orderedIds.length === 0) return { docs, applied: false, reason: 'empty_order' };

    const reordered = [];
    const seen = new Set();
    for (const rawId of orderedIds) {
      const idx = Number(rawId) - 1;
      if (!Number.isInteger(idx) || idx < 0 || idx >= candidates.length) continue;
      if (seen.has(idx)) continue;
      seen.add(idx);
      reordered.push(candidates[idx]);
    }

    for (let i = 0; i < candidates.length; i++) {
      if (!seen.has(i)) reordered.push(candidates[i]);
    }

    const keep = Math.max(5, CROSS_RERANKER_KEEP);
    const head = reordered.slice(0, keep);
    const tail = docs.slice(candidates.length);
    return { docs: [...head, ...tail], applied: true, reason: null };
  } catch {
    return { docs, applied: false, reason: 'exception' };
  }
}

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function buildHybridDocs(resultMap) {
  const rows = Array.from(resultMap.values());
  if (!rows.length) return [];

  const maxLex = rows.reduce((max, r) => Math.max(max, r.lexicalRaw || 0), 0) || 1;

  return rows
    .map(r => {
      const semantic = clamp01(r.semantic || 0);
      const lexical = clamp01((r.lexicalRaw || 0) / maxLex);
      const chunkType = String(r.doc?.metadata?.chunkType || '');
      const chunkBonus = chunkType === 'fault_code' ? 0.07 : chunkType === 'page_window' ? 0.03 : 0;
      const hybrid = clamp01((semantic * 0.68) + (lexical * 0.32) + chunkBonus);

      return {
        ...r.doc,
        similarity: hybrid,
        semanticSimilarity: semantic,
        lexicalSimilarity: lexical,
      };
    })
    .sort((a, b) => b.similarity - a.similarity);
}

function hasStrongEvidence(question, docs, faultCodes, pinoutQuery) {
  const top = docs?.[0]?.similarity || 0;
  const hasFaultEvidence = !faultCodes?.length || docs.some(d => docMentionsAnyFaultCode(d, faultCodes));
  const hasPinEvidence = !pinoutQuery || docs.some(d => countHits(docText(d), PINOUT_KEYWORDS) > 0);

  if (faultCodes?.length) {
    return hasFaultEvidence && top >= 0.42;
  }

  if (pinoutQuery) {
    return hasPinEvidence && top >= 0.5;
  }

  return top >= 0.58 && docs.length >= 4;
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
  let telemetryOutcome = 'started';
  let telemetryBlockedReason = null;
  let telemetryDocsSelected = 0;
  let telemetryThreshold = null;
  let retrievalTrace = [];
  let rerankerApplied = false;
  let rerankerReason = null;
  
  // Similaridade mínima para considerar um documento relevante
  const MIN_SIMILARITY = 0.55; // Mais permissivo para capturar mais info relevante

  // Blindagem por marca: nunca mistura fabricantes quando houver ambiguidade
  const historyText = (conversationHistory || [])
    .map(m => m?.parts?.[0]?.text || '')
    .filter(Boolean)
    .join(' ');

  const explicitBrands = detectBrandsInText(`${question || ''} ${historyText}`);
  const configuredBrandFilter = (brandFilter || '').toString().trim();
  let effectiveBrandFilter = configuredBrandFilter;

  if (!effectiveBrandFilter) {
    if (explicitBrands.length === 1) {
      effectiveBrandFilter = explicitBrands[0];
    } else if (explicitBrands.length > 1) {
      return {
        answer: `Pra não misturar marcas diferentes no seu banco de conhecimento, preciso confirmar a marca antes de responder:\n- Qual marca é esse equipamento (Orona, Otis, Schindler, Sectron, etc.)?`,
        sources: [],
        searchTime: Date.now() - startTime,
      };
    }
  }

  if (!effectiveBrandFilter) {
    const indexedRaw = await Promise.resolve(getIndexedSources?.() || []);
    const indexed = Array.isArray(indexedRaw) ? indexedRaw : [];
    const indexedBrands = detectBrandsInText(indexed.join(' '));

    if (indexedBrands.length === 1) {
      effectiveBrandFilter = indexedBrands[0];
    } else if (indexedBrands.length > 1) {
      return {
        answer: `Pra te responder com precisão e sem misturar fabricante, me confirma só a marca do equipamento.`,
        sources: [],
        searchTime: Date.now() - startTime,
      };
    }
  }

  // Verifica cache de respostas (desabilita cache quando há histórico para manter contexto)
  const hasHistory = conversationHistory && conversationHistory.length > 0;
  const cacheKey = getResponseCacheKey(question, effectiveBrandFilter);
  if (!hasHistory) {
    const cached = responseCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < RESPONSE_CACHE_TTL)) {
      console.log('📦 Resposta do cache (TTL 5min)');
      pushRagTelemetry({
        outcome: 'cache_hit',
        questionPreview: String(question || '').slice(0, 200),
        brandFilter: effectiveBrandFilter || null,
        hasHistory,
        latencyMs: 0,
        topK,
      });
      return { ...cached.response, fromCache: true, searchTime: 0 };
    }
  }
  
  try {
    const intent = classifyIntent(question);
    const pinoutQuery = isPinoutQuery(question);

    // ═══ MULTI-QUERY RETRIEVAL ═══
    // Em vez de buscar com uma query só, gera variações para encontrar mais documentos relevantes
    console.log('🔍 Gerando queries de busca...');
    
    const signals = extractSearchSignals(question, conversationHistory);
    const sessionState = extractSessionState(question, conversationHistory, effectiveBrandFilter, signals);
    const technicalKeywords = extractTechnicalKeywords(question, conversationHistory, signals);
    const faultCodes = (signals?.faultCodes?.length ? signals.faultCodes : signals.errorTokens || []).slice(0, 8);
    const faultCodeQuery = isFaultCodeQuery(question, signals);

    // Otis: para perguntas genéricas, exija modelo/código antes de responder.
    // Evita checklist genérico quando há muito conteúdo e o modelo muda o diagnóstico.
    const otisHasModel = Boolean(sessionState?.model);
    const otisHasBoard = (signals?.boardTokens?.length || 0) > 0 || Boolean(sessionState?.board);
    const otisHasError = (signals?.errorTokens?.length || 0) > 0 || Boolean(sessionState?.error);
    if (isOtisBrand(effectiveBrandFilter) && !otisHasModel && !otisHasBoard && !otisHasError && isGenericOtisQuestion(question)) {
      const qs = buildOtisGenericGateQuestions(sessionState, signals);
      telemetryOutcome = 'abstained';
      telemetryBlockedReason = 'otis_generic_gate_missing_model_or_error';
      return {
        answer: `Para eu responder com precisão no padrão Otis (sem generalização), preciso destas informações:
${qs.map(q => `- ${q}`).join('\n')}`,
        sources: [],
        searchTime: Date.now() - startTime,
      };
    }

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
    const intentSuffix = intent === INTENT.safetyChain
      ? 'serie de seguranca serie de portas circuito de seguranca cadeia de seguranca' // ajuda recall sem inventar entidade
      : '';
    const pinoutSuffix = pinoutQuery ? 'conector pino pinagem cn tabela diagrama' : '';
    const stateSuffixParts = [
      sessionState?.brand,
      sessionState?.model,
      sessionState?.board,
      sessionState?.connector,
    ].filter(Boolean);
    const stateSuffix = stateSuffixParts.length ? stateSuffixParts.join(' ') : '';

    const signalSuffix = [...(signals.boardTokens || []), ...(signals.errorTokens || []), intentSuffix, pinoutSuffix, stateSuffix]
      .filter(Boolean)
      .join(' ');
    if (signalSuffix) enrichedQuery = `${enrichedQuery} ${signalSuffix}`;
    enrichedQuery = enrichedQuery.substring(0, 700);
    
    // Gera variações da pergunta para busca mais ampla
    let searchQueries = [enrichedQuery];

    // Para perguntas de código/falha, injeta buscas específicas para aumentar recall.
    const codeQueries = buildFaultCodeQueries(question, faultCodes, sessionState);
    if (codeQueries.length) {
      searchQueries.push(...codeQueries);
    }

    // Busca suplementar por cobertura lexical/técnica (melhora casos além de códigos).
    const supplementalQueries = buildSupplementalQueries(question, technicalKeywords, sessionState, signals);
    if (supplementalQueries.length) {
      searchQueries.push(...supplementalQueries);
    }

    // Dedup inicial
    searchQueries = Array.from(new Set(searchQueries.map(q => String(q || '').trim()).filter(Boolean))).slice(0, 10);
    try {
      const rewritePrompt = `Você é um assistente de BUSCA (não de resposta) para banco de conhecimento técnico.

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
        searchQueries = Array.from(new Set(searchQueries.map(q => String(q || '').trim()).filter(Boolean))).slice(0, 12);
        console.log(`📝 Multi-query: ${searchQueries.length} variações de busca`);
      }
    } catch (e) {
      console.log('⚠️ Reescrita de query falhou, usando query original');
    }
    
    // ═══ BUSCA HÍBRIDA ITERATIVA (VETOR + BM25) ═══
    console.log(`📚 Buscando documentos...${effectiveBrandFilter ? ` (filtro: ${effectiveBrandFilter})` : ''}`);

    retrievalTrace = [];
    const perQueryTopK = faultCodeQuery ? topK * 4 : topK * 3;

    const expandedQueries = Array.from(new Set([
      ...searchQueries,
      ...buildSupplementalQueries(enrichedQuery, technicalKeywords, sessionState, signals),
      ...buildFaultCodeQueries(question, faultCodes, sessionState),
    ].map(q => String(q || '').trim()).filter(Boolean)));

    const iterativePlans = [
      { name: 'primary_hybrid', queries: searchQueries.slice(0, 10) },
      { name: 'expanded_hybrid', queries: expandedQueries.slice(0, 14) },
      { name: 'focused_retry', queries: Array.from(new Set([
        question,
        ...faultCodes.map(c => `falha ${c}`),
        technicalKeywords.slice(0, 8).join(' '),
      ])).filter(Boolean).slice(0, 8) },
    ];

    let mergedDocs = [];

    for (const plan of iterativePlans) {
      const roundMap = new Map();
      const planQueries = plan.queries.filter(q => String(q || '').trim().length > 3);

      for (const query of planQueries) {
        const queryEmb = await generateEmbedding(query);
        const semanticDocs = await searchSimilar(queryEmb, perQueryTopK, effectiveBrandFilter);
        const lexicalDocs = await searchLexical(query, perQueryTopK, effectiveBrandFilter);

        for (const doc of semanticDocs) {
          const key = buildDocKey(doc);
          const existing = roundMap.get(key) || { doc, semantic: 0, lexicalRaw: 0 };
          existing.semantic = Math.max(existing.semantic || 0, doc.similarity || 0);
          existing.doc = existing.doc || doc;
          roundMap.set(key, existing);
        }

        for (const doc of lexicalDocs) {
          const key = buildDocKey(doc);
          const existing = roundMap.get(key) || { doc, semantic: 0, lexicalRaw: 0 };
          existing.lexicalRaw = Math.max(existing.lexicalRaw || 0, doc.similarity || 0);
          existing.doc = existing.doc || doc;
          roundMap.set(key, existing);
        }
      }

      const roundDocs = buildHybridDocs(roundMap);

      const mergedMap = new Map();
      for (const doc of [...mergedDocs, ...roundDocs]) {
        const key = buildDocKey(doc);
        const existing = mergedMap.get(key);
        if (!existing || (doc.similarity || 0) > (existing.similarity || 0)) {
          mergedMap.set(key, doc);
        }
      }
      mergedDocs = Array.from(mergedMap.values()).sort((a, b) => (b.similarity || 0) - (a.similarity || 0));

      const strong = hasStrongEvidence(question, mergedDocs.slice(0, Math.max(topK * 2, 15)), faultCodes, pinoutQuery);
      retrievalTrace.push({
        round: plan.name,
        queriesTried: planQueries.length,
        docsAfterRound: mergedDocs.length,
        topSimilarity: mergedDocs[0]?.similarity || 0,
        strongEvidence: strong,
      });

      if (strong) break;
    }

    mergedDocs = rerankDocsByLexicalCoverage(mergedDocs, technicalKeywords);

    if (faultCodeQuery && faultCodes.length) {
      mergedDocs = rerankDocsForFaultCodes(mergedDocs, faultCodes);
    }

    mergedDocs = diversifyDocs(mergedDocs, Math.max(topK * 6, 40), 12, 0.9);
    
    // ═══ FILTRA POR SIMILARIDADE MÍNIMA ═══
    const dynamicMinSimilarity = faultCodeQuery ? 0.40 : 0.48;
    telemetryThreshold = dynamicMinSimilarity;
    let relevantDocs = mergedDocs.filter(doc => doc.similarity >= dynamicMinSimilarity);

    if (faultCodeQuery && faultCodes.length) {
      const codeMatchedDocs = mergedDocs.filter(doc => docMentionsAnyFaultCode(doc, faultCodes));
      if (codeMatchedDocs.length) {
        const merged = [];
        const seen = new Set();
        for (const doc of [...codeMatchedDocs, ...relevantDocs]) {
          const key = `${doc?.metadata?.source || ''}::${doc?.metadata?.chunkIndex ?? ''}::${doc?.metadata?.title || ''}`;
          if (seen.has(key)) continue;
          seen.add(key);
          merged.push(doc);
        }
        relevantDocs = merged;
      }
    }

    // ═══ DESAMBIGUAÇÃO (SÉRIE/SEGURANÇA vs. CAN/BUS) ═══
    relevantDocs = rerankAndFilterDocs(relevantDocs, intent, pinoutQuery);

    const reranked = await rerankDocsWithCrossModel(question, relevantDocs, sessionState);
    relevantDocs = reranked.docs;
    rerankerApplied = reranked.applied;
    rerankerReason = reranked.reason;

    relevantDocs = diversifyDocs(relevantDocs, Math.max(topK * 4, 24), 10, 0.88);
    
    console.log(`📊 ${mergedDocs.length} docs únicos encontrados, ${relevantDocs.length} acima do threshold (${dynamicMinSimilarity * 100}%)`);
    if (retrievalTrace.length) {
      const compactTrace = retrievalTrace.map(t => `${t.round}:${t.docsAfterRound}:${Math.round((t.topSimilarity || 0) * 100)}%:${t.strongEvidence ? 'ok' : 'weak'}`).join(' | ');
      console.log(`🧭 Iterative trace: ${compactTrace}`);
    }
    const topSim = relevantDocs.length > 0 ? relevantDocs[0].similarity : 0;
    if (relevantDocs.length > 0) {
      console.log(`   Top sim: ${Math.round(topSim * 100)}%, Bottom sim: ${Math.round(relevantDocs[relevantDocs.length - 1].similarity * 100)}%`);
    }

    // Se não achou nada relevante, NÃO chuta: faz perguntas para melhorar a busca
    if (relevantDocs.length === 0) {
      // Para perguntas de diagnóstico/procedimento, ainda dá para orientar com segurança
      // mesmo sem evidência do RAG (sem inventar pinagem/conectores).
      if (isBusVsSafetyDisambiguationQuery(question)) {
        telemetryOutcome = 'abstained';
        telemetryBlockedReason = 'no_relevant_docs_bus_vs_safety';
        return {
          answer: `${buildBusVsSafetyAnswer()}\n\nObs.: não encontrei trechos específicos no banco de conhecimento para “cravar” conectores/pinos neste momento.`,
          sources: [],
          searchTime: Date.now() - startTime
        };
      }

      if (isIntermittentSafetyChainQuery(question)) {
        telemetryOutcome = 'abstained';
        telemetryBlockedReason = 'no_relevant_docs_intermittent_safety';
        return {
          answer: `${buildIntermittentSafetyChainAnswer(question)}\n\nObs.: não encontrei trechos específicos no banco de conhecimento para “cravar” conectores/pinos neste momento.`,
          sources: [],
          searchTime: Date.now() - startTime
        };
      }

      if (isDiagnosticWorkflowQuery(question)) {
        telemetryOutcome = 'abstained';
        telemetryBlockedReason = 'no_relevant_docs_diagnostic_workflow';
        return {
          answer: `${buildDiagnosticWorkflowAnswer(question)}\n\nObs.: não encontrei trechos específicos dessa placa no banco de conhecimento para “cravar” pinos/conectores. Se você precisar de pinagem, me passe a página do diagrama/tabela no PDF.`,
          sources: [],
          searchTime: Date.now() - startTime
        };
      }

      const indexedRaw = await Promise.resolve(getIndexedSources?.() || []);
      const indexed = (Array.isArray(indexedRaw) ? indexedRaw : [])
        .map(s => fixEncoding((s || '').replace(/^\d+-\d+-/, '').replace(/\.pdf$/i, '')))
        .filter(Boolean);
      const sourcesText = indexed.length ? `Fontes disponíveis no banco de conhecimento: ${indexed.slice(0, 20).join(', ')}.` : 'Nenhuma fonte parece estar indexada no banco de conhecimento no momento.';

      const questions = buildClarifyingQuestions(question, hasHistory, signals);
      const qBlock = questions.map(q => `- ${q}`).join('\n');
      const brandMsg = effectiveBrandFilter
        ? `Não encontrei trechos relevantes dentro do filtro de marca selecionado.`
        : `Não encontrei trechos relevantes na base para essa pergunta.`;

      telemetryOutcome = 'abstained';
      telemetryBlockedReason = 'no_relevant_docs_need_clarification';

      return {
        answer: `${brandMsg}\n\nPra eu achar certinho no seu banco de conhecimento, me responde rapidinho:\n${qBlock}\n\n${sourcesText}`,
        sources: [],
        searchTime: Date.now() - startTime
      };
    }
    
    // Se a intenção é série/segurança, exige pelo menos algum indício de termos de segurança no contexto.
    if (intent === INTENT.safetyChain) {
      const hasSafetyEvidence = relevantDocs.some(d => countHits(docText(d), SAFETY_CHAIN_KEYWORDS) > 0);
      if (!hasSafetyEvidence) {
        // Se o técnico está pedindo “procedimento de isolamento” (sensor vs cabo vs lógica),
        // não bloqueia com perguntas de pinagem. Responde o fluxo seguro e só pede detalhes se ele quiser pinagem.
        if (isBusVsSafetyDisambiguationQuery(question)) {
          telemetryOutcome = 'abstained';
          telemetryBlockedReason = 'safety_without_evidence_bus_vs_safety';
          return {
            answer: `${buildBusVsSafetyAnswer()}\n\nObs.: quando você pedir conector/pino/tabela, preciso do PDF/página exata para não chutar.`,
            sources: [],
            searchTime: Date.now() - startTime,
          };
        }

        if (isIntermittentSafetyChainQuery(question)) {
          telemetryOutcome = 'abstained';
          telemetryBlockedReason = 'safety_without_evidence_intermittent';
          return {
            answer: `${buildIntermittentSafetyChainAnswer(question)}\n\nObs.: quando você pedir conector/pino/tabela, preciso do PDF/página exata para não chutar.`,
            sources: [],
            searchTime: Date.now() - startTime,
          };
        }

        if (isDiagnosticWorkflowQuery(question)) {
          telemetryOutcome = 'abstained';
          telemetryBlockedReason = 'safety_without_evidence_diagnostic';
          return {
            answer: `${buildDiagnosticWorkflowAnswer(question)}\n\nObs.: quando você pedir conector/pino/tabela, aí sim preciso do PDF/página exata pra não chutar.`,
            sources: [],
            searchTime: Date.now() - startTime,
          };
        }

        const questions = [
          'Qual é o nome exato da placa/módulo onde entra a série (como está escrito na placa/diagrama)?',
          'Você está medindo a série na placa principal ou no operador de porta?',
          'Tem algum código/mensagem no terminal? Se sim, qual?',
        ].slice(0, 3);

        telemetryOutcome = 'abstained';
        telemetryBlockedReason = 'safety_without_evidence';

        return {
          answer: `Entendi. Pela base que eu puxei aqui, não apareceu nenhum trecho claro de "série/segurança" — e isso é perigoso confundir com comunicação de porta (BUS/CAN).

Para eu te passar conector e pinos corretos (sem chute), confirme por favor:
${questions.map(q => `- ${q}`).join('\n')}`,
          sources: [],
          searchTime: Date.now() - startTime,
        };
      }
    }

    // Se é pergunta de pinagem (CN/pinos) e não há nenhum indício de CN/conector/pino no contexto, peça a página/trecho do diagrama.
    if (pinoutQuery) {
      const hasPinoutEvidence = relevantDocs.some(d => countHits(docText(d), PINOUT_KEYWORDS) > 0);
      if (!hasPinoutEvidence) {
        telemetryOutcome = 'abstained';
        telemetryBlockedReason = 'pinout_without_evidence';
        const connectorHint = sessionState?.connector ? ` (${sessionState.connector})` : '';
        return {
          answer: `Entendi — você quer pinagem física${connectorHint}. Eu só consigo te dar "pino X do conector" se isso estiver explícito no diagrama/tabela do banco de conhecimento.

Aqui não apareceu nenhum trecho claro de pinagem/tabela na busca.

Para eu confirmar os pinos sem chute, me envie uma destas coisas:
- O número da página do PDF onde aparece o conector (CN) e a tabela de pinagem
- Ou copia/cola o trecho do diagrama/tabela (mesmo que venha meio bagunçado)
- Ou descreve exatamente o que está escrito do lado do conector (ex.: CN1: 1-?, 2-? etc.)`,
          sources: [],
          searchTime: Date.now() - startTime,
        };
      }
    }

    // Se a pergunta é sobre indicador/LED/padrão de piscadas, só responda significado se houver legenda/tabela explícita na base.
    if (isStatusIndicatorQuery(question)) {
      const hasIndicatorEvidence = docsHaveBlinkLegendEvidence(relevantDocs, question);
      if (!hasIndicatorEvidence) {
        telemetryOutcome = 'abstained';
        telemetryBlockedReason = 'indicator_without_legend';
        return {
          answer: buildStatusIndicatorClarification(sessionState),
          sources: [],
          searchTime: Date.now() - startTime,
        };
      }
    }

    // ═══ SELECIONA OS MELHORES DOCUMENTOS (diversidade de fontes) ═══
    // Garante que documentos de diferentes fontes apareçam (não só do mesmo PDF)
    const MAX_CONTEXT_DOCS = 15; // Mais contexto = respostas mais completas
    const selectedDocs = diversifyDocs(relevantDocs, MAX_CONTEXT_DOCS, 8, 0.9);
    telemetryDocsSelected = selectedDocs.length;

    if (isCriticalLiteralQuestion(question) && !hasLiteralCriticalEvidence(question, selectedDocs)) {
      telemetryOutcome = 'abstained';
      telemetryBlockedReason = 'literal_evidence_missing';
      return {
        answer: `Para manter segurança e precisão, eu não posso cravar esse detalhe sem evidência literal no contexto recuperado.

Me envie um destes itens para eu responder com exatidão:
- página exata do manual/diagrama onde aparece o ponto (conector/pino/tensão/código)
- foto/recorte da tabela/legenda correspondente
- ou o trecho textual literal do documento`,
        sources: selectedDocs.slice(0, 5).map(doc => ({
          source: doc.metadata?.source || 'Desconhecido',
          title: doc.metadata?.title || '',
          excerpt: doc.content.substring(0, 180) + '...',
          similarity: Math.round((doc.similarity || 0) * 100)
        })),
        searchTime: Date.now() - startTime,
        documentsFound: selectedDocs.length,
        telemetry: {
          strategy: 'hybrid_bm25_vector_iterative',
          rounds: typeof retrievalTrace !== 'undefined' ? retrievalTrace : [],
          blockedByLiteralEvidence: true,
          rerankerApplied,
        }
      };
    }

    // Se a pergunta exige orientação elétrica/jumper e ainda não temos sinais mínimos (modelo/placa),
    // só pergunta quando REALMENTE faltar evidência. Evita bloquear perguntas já específicas (ex.: J9/CN1/P35).
    const needsHardwareSpecific = /tens[aã]o|alimenta|jumper|bypass|med(i|iç)[aã]o|medir|conector|pino|pinagem|reset|drive|inversor/i.test(question);
    const hasBoard = (signals.boardTokens || []).length > 0;

    const questionConnectorTokens = extractConnectorTokens(question);
    const docsHaveConnectorTokens = relevantDocs.some(d => extractConnectorTokens(`${d?.metadata?.title || ''} ${d?.content || ''}`).length > 0);
    const pinoutHasEvidence = pinoutQuery && (docsHaveConnectorTokens || questionConnectorTokens.length > 0);
    const hasConnectorEvidence = docsHaveConnectorTokens || questionConnectorTokens.length > 0;

    if (needsHardwareSpecific && !hasBoard && !pinoutHasEvidence) {
      telemetryOutcome = 'abstained';
      telemetryBlockedReason = 'hardware_specific_missing_board';
      const singleQuestion = hasHistory
        ? 'Qual a placa exata (nome escrito na placa/diagnóstico) para eu te passar o ponto sem risco?'
        : 'Qual o modelo + nome da placa para eu te passar o ponto sem risco?';
      return {
        answer: `Certo — antes de eu te passar ponto/conector/pino sem risco de chute, confirme só 1 coisa:\n- ${singleQuestion}`,
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
      ? `Você está respondendo com base no banco de conhecimento da marca **${brandFilter}**. Todas as informações vêm dos documentos dessa marca.`
      : `As fontes disponíveis no banco de conhecimento são: ${sourcesList}.`;
    
    const systemPrompt = `
  Você é um técnico sênior de manutenção de elevadores, focado em diagnóstico e orientação de campo. Você escreve em português do Brasil com linguagem técnica, direta e objetiva.

  Tom e linguagem (INEGOCIÁVEL):
  - Proibido usar gírias/coloquialismos como: "e aí", "cara", "blz/beleza", "bronca", "parada", "tá" no lugar de "está".
  - Não use floreios. Vá direto ao ponto.
  - Pode ser cordial, mas sempre profissional.
  - Quando NÃO souber por falta de evidência, diga isso claramente e peça apenas o mínimo que falta.

  Regra crítica de evidência (conectores/pinos):
  - NUNCA cite conector/pino/identificador (ex.: C1, J5, CN1, J*, P*) a menos que ele apareça explicitamente na BASE DE CONHECIMENTO abaixo.
  - Se não estiver explícito, não especule. Ofereça procedimento de diagnóstico genérico e peça a página/tabela/trecho do diagrama quando necessário.

  Regra crítica de evidência (LED/piscadas/status):
  - NUNCA interprete padrão de piscadas (ex.: "4x/s", "1x a cada 10s") sem a tabela/legenda explícita na BASE.
  - Se a legenda não estiver presente, peça a página/foto do manual e o nome do módulo/placa do indicador.

  Evite frases robóticas do tipo "Com base na documentação disponível...". Use linguagem natural, porém técnica.

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
- Placa: (verifique se foi mencionada — na base aparecem como LCBII, LCB, MCSS, MCP, MCB, RBI, GMUX, PLA6001, DCB, PIB etc.)
- Código de erro: (verifique se foi mencionado)
- Sintomas: (verifique o que foi descrito)
- Andar/localização: (verifique se foi mencionado)

USE todas essas informações na sua resposta. Se alguma variável IMPORTANTE ainda falta (e ela muda a resposta), aí sim pergunte — mas APENAS as que faltam.` : 'Primeira mensagem da conversa. Ainda não tem contexto. Se precisar de mais info, pergunte de forma natural.'}

═══════════════════════════════════════════
📌 ESTADO DO ATENDIMENTO (EXTRAÍDO)
═══════════════════════════════════════════
Trate isso como "variáveis da sessão". Use SEMPRE e NÃO esqueça depois de 2-3 mensagens.
- Marca: ${sessionState?.brand || 'não informado'}
- Modelo: ${sessionState?.model || 'não informado'}
- Placa (nome que aparece): ${sessionState?.board || 'não informado'}
- Conector citado: ${sessionState?.connector || 'não informado'}
- Código/erro: ${sessionState?.error || 'não informado'}

═══════════════════════════════════════════
🚫 REGRA DE OURO — SÓ FALE O QUE SABE
═══════════════════════════════════════════
ISTO É INEGOCIÁVEL. Você é extremamente restrito:
- Responda EXCLUSIVAMENTE com base na BASE DE CONHECIMENTO abaixo. NADA de fora.
- Se a informação NÃO está nos documentos, diga com naturalidade: "Isso não está no meu banco de conhecimento. Melhor conferir a documentação física do equipamento."
- NUNCA, EM HIPÓTESE ALGUMA, invente códigos, pinos, tensões, nomes de placa ou procedimentos.
- NUNCA adapte info de uma marca/modelo pra outra — cada fabricante é um mundo.
- Se é sobre marca/modelo que não tem nos docs: "Não tenho material sobre [marca/modelo] no meu banco de conhecimento. As fontes que tenho aqui são: ${sourcesList}."
- Prefira dizer "não sei" do que chutar. O chute errado pode causar acidente.

REGRA CRÍTICA — NÃO SUGIRA O QUE NÃO CONHECE:
- NUNCA, JAMAIS, EM NENHUMA CIRCUNSTÂNCIA cite nomes de marcas, modelos, placas ou equipamentos como EXEMPLO entre parênteses ou de qualquer forma.
- As fontes disponíveis no banco de conhecimento são: ${sourcesList}. SÓ mencione marcas/modelos que constam nessas fontes E SOMENTE quando estiver respondendo sobre eles, NUNCA como sugestão/exemplo.
- Se precisar pedir o modelo ao técnico, pergunte APENAS: "Qual o modelo do elevador?" — PONTO FINAL. Sem "ex:", sem "como por exemplo", sem lista entre parênteses.
- É TERMINANTEMENTE PROIBIDO escrever qualquer coisa do tipo "(ex: ...)" ou qualquer lista/sugestão entre parênteses.
- Se o técnico mencionar uma marca/modelo que NÃO está no seu banco de conhecimento, diga APENAS que não tem material sobre aquilo e liste as fontes que tem. NÃO pergunte mais nada — deixe o técnico decidir o que quer saber.

REGRA DE TERMINOLOGIA — USE OS MESMOS TERMOS DA BASE:
- Use EXCLUSIVAMENTE a terminologia que aparece nos documentos. NÃO invente termos.
- Na base as placas são chamadas pelos nomes específicos: LCBII, LCB, MCSS, MCP, MCB, RBI, GMUX, PLA6001, DCB, PIB, etc. Use ESSES nomes quando se referir a elas.
- O termo genérico na base é "placa de controle" ou simplesmente "placa", NUNCA "placa controladora".
- Para perguntar ao técnico qual placa ele usa, diga apenas: "Qual a placa?" ou "Qual placa está usando?" — termos simples e naturais.
- Se o técnico disser o nome de uma placa, use O MESMO NOME que ele usou na resposta.

═══════════════════════════════════════════
🛡️ SEGURANÇA PRIMEIRO
═══════════════════════════════════════════
REGRA DE DESAMBIGUAÇÃO (GRAVE):
- "Série de portas/seguranças" é circuito de segurança.
- "C_L/C_H/BUS/CAN" é comunicação/dados do operador/módulo.
- NUNCA confunda as duas coisas. Se a pergunta for sobre SÉRIE/SEGURANÇA, não responda com C_L/C_H/BUS/CAN.

Antes de orientar sobre jumper, bypass, medição elétrica, reset de placas/inversores:
- Verifique NO HISTÓRICO se o técnico JÁ informou modelo e placa.
- Se JÁ informou → use essa info e responda diretamente. NÃO pergunte de novo.
- Se NÃO informou nenhum dos dois → pergunte de forma natural APENAS o que falta:
  - Se falta modelo: "Qual o modelo do elevador?"
  - Se falta placa: "Qual a placa?" ou "Qual placa está usando?"
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
- "Está dando erro" → Qual código? O que aparece no display?
- "Preciso jumpear" → Jumpear o quê? Qual modelo? (só pergunte o que falta)

Quando for perguntar:
✅ CERTO: "Qual o modelo do elevador?" — pergunta limpa, sem sugestão
✅ CERTO: "Qual placa está usando?" — direto ao ponto
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
- NÃO faça checklist óbvio do tipo "verifique se a porta está fechada" a menos que a documentação técnica indique esse passo como parte do diagnóstico daquele erro.
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

**O que está acontecendo:** Explicação rápida (1-2 frases)

**Hipóteses (com base no banco de conhecimento)** (do mais provável pro menos provável):
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
- Pontos de medição: SEMPRE diga conector, pino e valor usando EXATAMENTE a identificação que aparece na documentação técnica
- Componentes: use código da documentação técnica (K1, Q2, S1)
- Se a documentação técnica tem o valor mas não o pino: "A documentação técnica indica [valor] no conector [X], mas o pino específico não está detalhado — melhor conferir no esquema elétrico"

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
    // - Normaliza terminologia para bater com o banco de conhecimento
    answer = answer
      .replace(/\(\s*ex\s*:\s*[^)]+\)/gi, '')
      .replace(/\bex\s*:\s*[^\n]+/gi, '')
      .replace(/placa\s+controladora/gi, 'placa')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    // Se a resposta veio com conectores/pinos mas não existe evidência no contexto/pergunta, remove.
    if (!hasConnectorEvidence) {
      answer = stripConnectorLikeTokens(answer);
    }

    // Validação de ancoragem (segurança): bloqueia afirmações arriscadas sem evidência literal no contexto recuperado.
    // Isso evita "chutes" de tensão, códigos, significados de piscadas e instruções de bypass/jumper.
    const compactContext = normalizeCompact(context);
    const missingEvidence = [];

    const voltTokens = extractVoltageTokens(answer);
    if (voltTokens.length) {
      const ok = voltTokens.every(v => compactContext.includes(normalizeCompact(v)));
      if (!ok) missingEvidence.push(`tensão(s) ${voltTokens.join(', ')}`);
    }

    const codeTokens = extractFaultCodeTokens(answer);
    if (codeTokens.length) {
      const ok = codeTokens.every(c => compactContext.includes(normalizeCompact(c)));
      if (!ok) missingEvidence.push(`código(s) ${codeTokens.join(', ')}`);
    }

    if (containsRiskyActionLanguage(answer)) {
      // Só permite bypass/jumper se os termos existirem no contexto
      const riskyOk = compactContext.includes('jumper') || compactContext.includes('bypass') || compactContext.includes('pontear') || compactContext.includes('ponte');
      if (!riskyOk) missingEvidence.push('instrução de jumper/bypass/ponte');
    }

    if (containsBlinkInterpretation(answer) && isStatusIndicatorQuery(question)) {
      // Interpretação de piscadas/LED exige tabela/legenda no contexto
      const indicatorOk = docsHaveBlinkLegendEvidence(selectedDocs, question);
      if (!indicatorOk) missingEvidence.push('interpretação de padrão de piscadas/LED');
    }

    if (missingEvidence.length) {
      answer = buildUnsafeUngroundedReply(sessionState, missingEvidence);
    }

    // Linha de defesa contra confusão Série/Segurança vs. BUS/CAN
    if (intent === INTENT.safetyChain) {
      const hasBusTokens = /\b(c_l|c_h|can|bus|barramento)\b/i.test(answer);
      if (hasBusTokens) {
        answer = buildBusVsSafetyAnswer();
      }
    }

    // Fallback UX para pinagem: se o técnico pediu pino/CN e a resposta não trouxe pinagem física, orientar o próximo passo sem chutar.
    if (pinoutQuery) {
      const hasPinNums = /\b(pinos?|pin)\s*\d+/i.test(answer) || /\bCN\d{1,2}\s*[-.:]?\s*\d+\b/i.test(answer);
      const mentionsPointsP = /\bP\d{1,3}\b/.test(answer);
      const indicatesNotFound = /n[aã]o\s+(consta|tem|encontrei|aparece|est[aá])\b/i.test(answer);

      if (!hasPinNums && (mentionsPointsP || indicatesNotFound)) {
        answer += `\n\nSe você conseguir, me diga a página do diagrama/tabela do ${sessionState?.connector || 'CN'} (ou cola o trecho da tabela). Aí eu consigo traduzir: "P35/P36" → "pino X do CN" com precisão.`;
      }
    }
    
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
      documentsFound: selectedDocs.length,
      telemetry: {
        strategy: 'hybrid_bm25_vector_iterative',
        rounds: typeof retrievalTrace !== 'undefined' ? retrievalTrace : [],
        threshold: dynamicMinSimilarity,
        rerankerApplied,
        rerankerReason,
      }
    };

    telemetryOutcome = 'answered';
    telemetryDocsSelected = selectedDocs.length;

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
    telemetryOutcome = 'error';
    telemetryBlockedReason = error?.message || 'unknown_error';
    console.error('Erro no RAG:', error);
    throw error;
  } finally {
    pushRagTelemetry({
      outcome: telemetryOutcome,
      blockedReason: telemetryBlockedReason,
      questionPreview: String(question || '').slice(0, 200),
      brandFilter: effectiveBrandFilter || null,
      hasHistory: Boolean(hasHistory),
      topK,
      selectedDocs: telemetryDocsSelected,
      threshold: telemetryThreshold,
      rerankerApplied,
      rerankerReason,
      rounds: Array.isArray(retrievalTrace) ? retrievalTrace.slice(0, 6) : [],
      latencyMs: Date.now() - startTime,
    });
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
  hasKnowledgeAbout,
  getRecentRagTelemetry,
  clearRagTelemetry,
};
