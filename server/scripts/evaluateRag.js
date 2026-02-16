import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { ragQuery } from '../services/ragService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env') });

function normalize(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function includesAnyExpected(answer, expectedContains) {
  const a = normalize(answer);
  return (expectedContains || []).some(s => {
    const token = normalize(s).replace(/\s+/g, ' ').trim();
    if (!token || token.length < 8) return false;
    return a.includes(token.slice(0, Math.min(token.length, 80)));
  });
}

function isAbstention(answer) {
  const a = normalize(answer);
  return /nao encontrei|nao posso cravar|sem evidencia|nao posso afirmar|envie a pagina|nao consta/.test(a);
}

async function main() {
  const args = process.argv.slice(2);
  const fileArg = args.find(a => a.startsWith('--file='))?.split('=')[1]
    || path.join(__dirname, '..', 'data', 'eval', 'eval_set.auto.json');
  const limitArg = Number(args.find(a => a.startsWith('--limit='))?.split('=')[1] || 100);
  const limit = Math.max(10, Math.min(1000, Number.isFinite(limitArg) ? limitArg : 100));

  const raw = fs.readFileSync(fileArg, 'utf-8');
  const data = JSON.parse(raw);
  const entries = (data.entries || []).slice(0, limit);

  let correct = 0;
  let abstain = 0;
  let withSource = 0;
  let sourceHit = 0;

  const details = [];

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const res = await ragQuery(e.question, '', 10, e.brandName || null, []);
    const answer = res?.answer || '';
    const ok = includesAnyExpected(answer, e.expectedContains || []);
    const abst = isAbstention(answer);

    if (ok) correct += 1;
    if (abst) abstain += 1;

    const topSources = (res?.sources || []).map(s => String(s.source || ''));
    if (e.expectedSource) {
      withSource += 1;
      if (topSources.some(s => s === e.expectedSource)) sourceHit += 1;
    }

    details.push({
      id: e.id,
      question: e.question,
      ok,
      abstain: abst,
      expectedSource: e.expectedSource || null,
      topSources: topSources.slice(0, 3),
      telemetry: res?.telemetry || null,
    });

    if ((i + 1) % 20 === 0) {
      console.log(`... ${i + 1}/${entries.length}`);
    }
  }

  const precision = entries.length ? correct / entries.length : 0;
  const abstentionRate = entries.length ? abstain / entries.length : 0;
  const recallAtK = withSource ? sourceHit / withSource : 0;

  const report = {
    generatedAt: new Date().toISOString(),
    total: entries.length,
    metrics: {
      precision,
      abstentionRate,
      recallAtK,
      correct,
      abstain,
      sourceHit,
      withSource,
    },
    details,
  };

  const outDir = path.join(__dirname, '..', 'data', 'eval');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, 'eval_report.auto.json');
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2), 'utf-8');

  console.log('✅ Avaliação concluída');
  console.log(`📄 Relatório: ${outFile}`);
  console.log(`🎯 precision=${(precision * 100).toFixed(1)}% | recall@k=${(recallAtK * 100).toFixed(1)}% | abstention=${(abstentionRate * 100).toFixed(1)}%`);
}

main().catch(err => {
  console.error('Erro na avaliação RAG:', err);
  process.exit(1);
});
