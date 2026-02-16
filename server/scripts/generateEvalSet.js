import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { exportCorpus } from '../services/vectorStoreAdapter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env') });

function normalize(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function compact(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function extractFaultCodes(text) {
  const raw = String(text || '');
  const out = new Set();
  for (const m of raw.matchAll(/\b(?:falha|erro|fault|code|c[oó]digo)?\s*[:#-]?\s*([A-Z]?\s*-?\s*\d{3,4})\b/gi)) {
    const token = String(m[1] || '').replace(/\s+/g, '').toUpperCase();
    if (token.length >= 3 && token.length <= 8) out.add(token);
  }
  return Array.from(out).slice(0, 3);
}

function extractConnectorTokens(text) {
  const raw = String(text || '').toUpperCase();
  return Array.from(new Set(raw.match(/\b(?:CN|J|P)\s*-?\s*\d{1,3}\b/g) || []))
    .map(t => t.replace(/\s+/g, ''))
    .slice(0, 3);
}

function extractVoltageTokens(text) {
  const raw = String(text || '');
  return Array.from(new Set(raw.match(/\b\d{1,4}(?:[\.,]\d{1,2})?\s*(?:VAC|VDC|V)\b/gi) || []))
    .map(v => v.replace(/\s+/g, ' '))
    .slice(0, 2);
}

function buildExpectedSnippets(content) {
  const lines = String(content || '')
    .split('\n')
    .map(l => compact(l))
    .filter(l => l.length > 20 && l.length < 220);

  const candidates = [];
  for (const line of lines) {
    if (/\b(falha|erro|fault|code|vac|vdc|cn\d|conector|pinagem|jumper|bypass)\b/i.test(line)) {
      candidates.push(line);
    }
    if (candidates.length >= 3) break;
  }

  if (candidates.length === 0 && lines.length) {
    candidates.push(lines[0].slice(0, 180));
  }

  return candidates.slice(0, 3);
}

function buildQuestionCandidates(doc) {
  const content = String(doc?.content || '');
  const title = String(doc?.metadata?.title || doc?.metadata?.source || 'documento técnico').trim();
  const faultCodes = extractFaultCodes(content);
  const connectors = extractConnectorTokens(content);
  const voltages = extractVoltageTokens(content);

  const questions = [];

  for (const code of faultCodes) {
    questions.push(`Qual o significado da falha ${code}?`);
    questions.push(`Como diagnosticar o erro ${code} nesse equipamento?`);
  }

  for (const cn of connectors) {
    questions.push(`Qual é a pinagem do ${cn}?`);
    questions.push(`No ${cn}, quais sinais devem ser medidos?`);
  }

  for (const v of voltages) {
    questions.push(`Qual tensão esperada (${v}) nesse circuito?`);
  }

  if (questions.length === 0) {
    questions.push(`Quais pontos críticos de diagnóstico aparecem no documento ${title}?`);
    questions.push(`Resuma os procedimentos técnicos mais importantes de ${title}.`);
  }

  return Array.from(new Set(questions)).slice(0, 4);
}

function makeEvalEntry(doc, question, idx) {
  const expectedContains = buildExpectedSnippets(doc.content);
  return {
    id: `eval_${idx}`,
    question,
    expectedContains,
    expectedSource: doc?.metadata?.source || null,
    brandName: doc?.metadata?.brandName || null,
    metadata: {
      chunkType: doc?.metadata?.chunkType || null,
      page: doc?.metadata?.page || null,
      title: doc?.metadata?.title || null,
      faultCode: doc?.metadata?.faultCode || null,
    }
  };
}

async function main() {
  const args = process.argv.slice(2);
  const countArg = Number(args.find(a => a.startsWith('--count='))?.split('=')[1] || 150);
  const targetCount = Math.max(20, Math.min(500, Number.isFinite(countArg) ? countArg : 150));
  const brandArg = args.find(a => a.startsWith('--brand='))?.split('=')[1] || null;

  const outDir = path.join(__dirname, '..', 'data', 'eval');
  const outFile = path.join(outDir, 'eval_set.auto.json');

  const corpus = await exportCorpus(20000, brandArg);
  if (!corpus || corpus.length === 0) {
    console.log('Nenhum chunk no corpus para gerar avaliação.');
    process.exit(1);
  }

  const prioritized = [...corpus].sort((a, b) => {
    const ta = String(a?.metadata?.chunkType || '');
    const tb = String(b?.metadata?.chunkType || '');
    if (ta === 'fault_code' && tb !== 'fault_code') return -1;
    if (tb === 'fault_code' && ta !== 'fault_code') return 1;
    return 0;
  });

  const entries = [];
  let idx = 1;

  for (const doc of prioritized) {
    const qs = buildQuestionCandidates(doc);
    for (const q of qs) {
      entries.push(makeEvalEntry(doc, q, idx++));
      if (entries.length >= targetCount) break;
    }
    if (entries.length >= targetCount) break;
  }

  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify({
    generatedAt: new Date().toISOString(),
    total: entries.length,
    brandFilter: brandArg,
    entries
  }, null, 2), 'utf-8');

  console.log(`✅ Eval set gerado: ${outFile}`);
  console.log(`📊 Total de casos: ${entries.length}`);
}

main().catch(err => {
  console.error('Erro ao gerar eval set:', err);
  process.exit(1);
});
