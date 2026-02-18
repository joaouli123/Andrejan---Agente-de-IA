/**
 * Serviço de Extração de PDFs
 * Extrai texto via pdf-parse + OCR (Tesseract) para páginas com imagens/scans
 */

import fs from 'fs';
import path from 'path';
import pdfParse from 'pdf-parse';
import Tesseract from 'tesseract.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const visionModel = genAI.getGenerativeModel({
  model: 'gemini-2.5-flash',
  generationConfig: {
    temperature: 0.1,
    topP: 0.9,
    maxOutputTokens: 8192
  }
});

function normalizeMarkdownOutput(text) {
  const raw = String(text || '').trim();
  if (!raw) return '';
  return raw
    .replace(/^```(?:markdown|md)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

async function renderPdfPagesAsImages(dataBuffer, scale = 2.0) {
  const images = [];

  // Tentativa 1: pdf-img-convert (quando disponível/compatível no runtime)
  try {
    const pdfImgConvertModule = await import('pdf-img-convert');
    const convertFn =
      pdfImgConvertModule?.default ||
      pdfImgConvertModule?.convert ||
      pdfImgConvertModule?.pdf2img ||
      null;

    if (typeof convertFn === 'function') {
      const converted = await convertFn(dataBuffer, { scale });
      if (Array.isArray(converted) && converted.length > 0) {
        for (const pageImg of converted) {
          if (Buffer.isBuffer(pageImg)) images.push(pageImg);
          else if (typeof pageImg === 'string') images.push(Buffer.from(pageImg, 'base64'));
        }
      }
    }
  } catch {
    // fallback para pdf-to-img abaixo
  }

  if (images.length > 0) return images;

  // Tentativa 2 (fallback): pdf-to-img, já está estável no projeto
  const { pdf } = await import('pdf-to-img');
  const iterator = await pdf(dataBuffer, { scale });
  for await (const pageImage of iterator) {
    images.push(pageImage);
  }

  return images;
}

// Sharp para pré-processamento de imagem (melhora OCR de scans)
let _sharp = null;
let _sharpChecked = false;

async function getSharp() {
  if (!_sharpChecked) {
    _sharpChecked = true;
    try {
      _sharp = (await import('sharp')).default;
      console.log('   ✅ Sharp carregado — pré-processamento de imagem ativo');
    } catch {
      console.warn('   ⚠️ sharp não instalado (npm i sharp) — OCR sem pré-processamento');
    }
  }
  return _sharp;
}

/**
 * Pré-processa imagem para melhorar qualidade do OCR em documentos escaneados.
 * - Grayscale: remove cor, foca em contraste texto/fundo
 * - Normalize: estica contraste para range completo (melhora scans desbotados)
 * - Sharpen: realça bordas do texto
 */
async function preprocessForOCR(imageBuffer) {
  const sharpLib = await getSharp();
  if (!sharpLib) return imageBuffer;

  try {
    return await sharpLib(imageBuffer)
      .grayscale()
      .normalize()
      .sharpen({ sigma: 1.5 })
      .png()
      .toBuffer();
  } catch (err) {
    console.warn('   ⚠️ Pré-processamento falhou, usando imagem original:', err.message);
    return imageBuffer;
  }
}

/**
 * Limpa texto OCR removendo artefatos comuns de documentos escaneados.
 */
function cleanOCRText(text) {
  if (!text) return '';
  return text
    // Remove linhas que são apenas caracteres especiais isolados (ruído OCR)
    .replace(/^\s*[^a-zA-Z0-9À-ÿ\s]{1,3}\s*$/gm, '')
    // Colapsa 4+ linhas em branco para 2
    .replace(/\n{4,}/g, '\n\n')
    // Remove espaçamento excessivo dentro de linhas
    .replace(/[ \t]{4,}/g, '  ')
    .trim();
}

// Tamanho máximo de cada chunk (em caracteres)
const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 200;
const TECH_CHUNK_SIZE = 1200;
const TECH_CHUNK_OVERLAP = 220;

// Limiar: se uma página tem menos de X chars de texto, provavelmente é scan/imagem
const OCR_TEXT_THRESHOLD = 50;

// Limiar por página: mesmo PDFs "bons" podem ter páginas de diagramas/tabelas como imagem
const OCR_TEXT_THRESHOLD_PER_PAGE = 120;

function getOcrPageTimeoutMs() {
  const env = parseInt(process.env.OCR_PAGE_TIMEOUT_MS || '', 10);
  if (Number.isFinite(env) && env >= 5000) return env;
  return 60000; // 60s por página — PDFs grandes podem ter páginas complexas
}

// Pool de workers do Tesseract (CPU-bound) para usar vários cores
let tesseractWorkers = null;

function getOcrWorkerCount() {
  const env = parseInt(process.env.OCR_WORKERS || '', 10);
  if (Number.isFinite(env) && env > 0) return Math.min(env, 8);
  // 4 workers paralelos — necessário para PDFs de 500-1000 páginas em tempo razoável
  return 4;
}

async function getTesseractWorkers() {
  if (!tesseractWorkers) {
    const count = getOcrWorkerCount();
    console.log(`   🔤 Iniciando Tesseract OCR (pool ${count} workers)...`);
    tesseractWorkers = await Promise.all(
      Array.from({ length: count }, () =>
        Tesseract.createWorker('por+eng', 1, {
          logger: () => {},
        })
      )
    );
  }
  return tesseractWorkers;
}

/**
 * Tenta pdfParse com proteção contra crashes
 */
async function safePdfParse(dataBuffer) {
  try {
    const data = await pdfParse(dataBuffer, {
      // Opções defensivas para PDFs problemáticos
      max: 0, // sem limite de páginas
    });
    return data;
  } catch (error) {
    console.warn(`   ⚠️ pdf-parse falhou: ${error.message}`);
    return null;
  }
}

/**
 * Extrai texto com pdf-parse separando por páginas.
 * Isso permite OCR seletivo somente nas páginas que são imagens (pinagem/diagramas).
 */
async function safePdfParseByPage(dataBuffer) {
  try {
    const pages = [];
    const data = await pdfParse(dataBuffer, {
      max: 0,
      pagerender: async (pageData) => {
        try {
          const textContent = await pageData.getTextContent({ normalizeWhitespace: true });
          const items = (textContent.items || [])
            .map((item) => {
              const text = (item?.str || '').trim();
              const transform = item?.transform || [];
              const x = Number.isFinite(transform[4]) ? transform[4] : 0;
              const y = Number.isFinite(transform[5]) ? transform[5] : 0;
              return { text, x, y };
            })
            .filter(item => item.text.length > 0);

          const byY = new Map();
          for (const item of items) {
            const lineKey = Math.round(item.y / 2) * 2;
            if (!byY.has(lineKey)) byY.set(lineKey, []);
            byY.get(lineKey).push(item);
          }

          const sortedLineKeys = Array.from(byY.keys()).sort((a, b) => b - a);
          const lines = [];
          for (const key of sortedLineKeys) {
            const lineItems = byY.get(key).sort((a, b) => a.x - b.x);
            const line = lineItems.map(it => it.text).join(' ').replace(/\s+/g, ' ').trim();
            if (line) lines.push(line);
          }

          const pageText = lines.join('\n').trim();
          pages.push(pageText);
          return pageText;
        } catch {
          pages.push('');
          return '';
        }
      },
    });

    const combined = pages
      .map((t, idx) => (t && t.trim() ? `--- Página ${idx + 1} ---\n${t.trim()}` : `--- Página ${idx + 1} ---`))
      .join('\n\n');

    return {
      text: combined.trim(),
      numpages: data.numpages || pages.length,
      info: data.info || {},
      metadata: data.metadata || {},
      pages,
    };
  } catch (error) {
    console.warn(`   ⚠️ pdf-parse (por página) falhou: ${error.message}`);
    return null;
  }
}

function normalizeExtractedText(text) {
  return String(text || '')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\u00A0/g, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function splitIntoPageBlocks(text) {
  const normalized = normalizeExtractedText(text);
  const markerRegex = /---\s*P[aá]gina\s*(\d+)(?:\s*\(OCR\))?\s*---/gi;
  const matches = [...normalized.matchAll(markerRegex)];

  if (!matches.length) {
    return [{ page: null, content: normalized }];
  }

  const blocks = [];
  for (let i = 0; i < matches.length; i++) {
    const current = matches[i];
    const next = matches[i + 1];
    const start = current.index + current[0].length;
    const end = next ? next.index : normalized.length;
    const page = Number.parseInt(current[1], 10);
    const content = normalized.slice(start, end).trim();
    if (content) blocks.push({ page: Number.isFinite(page) ? page : null, content });
  }
  return blocks;
}

function extractFaultCodeFromLine(line) {
  if (!line) return null;
  const raw = String(line).trim();

  const patterns = [
    /^\s*(\d{3,4})\s+[A-Za-zÀ-ÿ]/,
    /^\s*(?:falha|erro|fault|code|c[oó]digo)\s*[:#-]?\s*([A-Z]?\s*-?\s*\d{2,4})\b/i,
    /^\s*([A-Z]\s*-?\s*\d{2,4})\b/i,
  ];

  for (const rx of patterns) {
    const m = raw.match(rx);
    if (m && m[1]) return String(m[1]).replace(/\s+/g, '').toUpperCase();
  }

  return null;
}

function splitLongTextWithOverlap(text, size = TECH_CHUNK_SIZE, overlap = TECH_CHUNK_OVERLAP) {
  const source = normalizeExtractedText(text);
  if (!source) return [];
  if (source.length <= size) return [source];

  const out = [];
  let cursor = 0;
  while (cursor < source.length) {
    let end = Math.min(source.length, cursor + size);
    if (end < source.length) {
      const lastBreak = Math.max(
        source.lastIndexOf('\n\n', end),
        source.lastIndexOf('\n', end),
        source.lastIndexOf('. ', end)
      );
      if (lastBreak > cursor + 250) end = lastBreak;
    }

    const piece = source.slice(cursor, end).trim();
    if (piece) out.push(piece);

    if (end >= source.length) break;
    cursor = Math.max(0, end - overlap);
  }

  return out;
}

function createSpecializedFaultChunks(pageText, baseMetadata, nextChunkIndexRef) {
  const lines = normalizeExtractedText(pageText).split('\n').map(l => l.trim()).filter(Boolean);
  if (!lines.length) return [];

  const chunks = [];
  const seen = new Set();

  for (let i = 0; i < lines.length; i++) {
    const code = extractFaultCodeFromLine(lines[i]);
    if (!code) continue;

    const start = Math.max(0, i - 2);
    const end = Math.min(lines.length, i + 4);
    const windowText = lines.slice(start, end).join('\n').trim();
    if (!windowText || windowText.length < 18) continue;

    const signature = `${code}::${windowText.slice(0, 220)}`;
    if (seen.has(signature)) continue;
    seen.add(signature);

    const content = `CÓDIGO ${code}\n${windowText}`;
    chunks.push({
      id: uuidv4(),
      content,
      metadata: {
        ...baseMetadata,
        faultCode: code,
        chunkType: 'fault_code',
        chunkIndex: nextChunkIndexRef.value++
      }
    });
  }

  return chunks;
}

/**
 * Extrai texto de um arquivo PDF (texto puro via pdf-parse)
 */
export async function extractTextFromPDF(filePath) {
  try {
    const dataBuffer = fs.readFileSync(filePath);
    const data = await safePdfParse(dataBuffer);
    
    if (!data) {
      return { text: '', numPages: 0, info: {}, metadata: {} };
    }
    
    return {
      text: data.text,
      numPages: data.numpages,
      info: data.info || {},
      metadata: data.metadata || {}
    };
  } catch (error) {
    console.error(`Erro ao extrair texto de ${filePath}:`, error);
    return { text: '', numPages: 0, info: {}, metadata: {} };
  }
}

/**
 * Extrai texto de um PDF usando OCR nas páginas que têm pouco texto
 * Combina pdf-parse (texto) + Tesseract (OCR para imagens/scans)
 * 
 * Robusto: se pdf-parse falhar, tenta OCR puro.
 * Se OCR falhar, usa o que conseguiu do pdf-parse.
 */
export async function extractTextWithOCR(filePath, onProgress) {
  let dataBuffer;
  try {
    dataBuffer = fs.readFileSync(filePath);
  } catch (readErr) {
    console.error(`   ❌ Não foi possível ler o arquivo: ${readErr.message}`);
    throw new Error(`Arquivo não encontrado ou sem permissão: ${readErr.message}`);
  }

  if (!dataBuffer || dataBuffer.length === 0) {
    throw new Error('Arquivo PDF vazio (0 bytes)');
  }

  // 1. Tenta extrair texto com pdf-parse por página (melhor para tabelas/diagramas)
  const pdfDataByPage = await safePdfParseByPage(dataBuffer);
  const pdfData = pdfDataByPage || await safePdfParse(dataBuffer);
  
  let parsedText = '';
  let numPages = 0;
  let info = {};
  let metadata = {};

  const parsedPages = pdfDataByPage?.pages || null;

  if (pdfData) {
    parsedText = pdfData.text || '';
    numPages = pdfData.numpages || 0;
    info = pdfData.info || {};
    metadata = pdfData.metadata || {};
  }
  
  // 2. Verifica se o texto é suficiente
  const avgCharsPerPage = numPages > 0 ? parsedText.length / numPages : 0;
  const hasGoodText = parsedText.trim().length > 200 && avgCharsPerPage >= OCR_TEXT_THRESHOLD;

  // Define páginas candidatas a OCR (diagramas/tabelas em imagem)
  // Se não temos parsedPages, fica vazio e o fluxo cai no OCR completo.
  const pagesToOCR = new Set();
  if (parsedPages && parsedPages.length) {
    for (let i = 0; i < parsedPages.length; i++) {
      const t = (parsedPages[i] || '').trim();
      if (t.length < OCR_TEXT_THRESHOLD_PER_PAGE) {
        pagesToOCR.add(i + 1);
      }
    }
  }

  // Se o texto geral está bom, ainda assim fazemos OCR seletivo nas páginas fracas.
  if (hasGoodText && pagesToOCR.size === 0) {
    if (onProgress) onProgress({ phase: 'text', message: `Texto extraído normalmente (${parsedText.length} chars)` });
    return {
      text: parsedText,
      numPages,
      info,
      metadata,
      ocrUsed: false
    };
  }
  
  // 3. PDF sem texto suficiente OU páginas fracas detectadas — OCR multimodal com Gemini
  const reason = !pdfData
    ? 'pdf-parse falhou completamente'
    : (hasGoodText ? `páginas com pouco texto detectadas (${pagesToOCR.size})` : `pouco texto (${Math.round(avgCharsPerPage)} chars/pág)`);
  console.log(`   🔍 ${reason} — ativando OCR multimodal (Gemini 2.5 Flash)...`);
  if (onProgress) onProgress({ phase: 'ocr_start', message: 'Iniciando transcrição multimodal com Gemini...' });

  let ocrText = '';
  let ocrPages = 0;
  let ocrPartialResult = false;
  let ocrPagesTotal = 0;

  const envOcrTimeout = Number.parseInt(process.env.OCR_GLOBAL_TIMEOUT_MS || '', 10);
  const globalOcrTimeoutMs = (Number.isFinite(envOcrTimeout) && envOcrTimeout >= 1800000) ? envOcrTimeout : 1800000;
  const ocrStartTime = Date.now();

  try {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY não configurada para OCR multimodal');
    }

    // Requisito: renderização com scale 2.0 para nitidez
    const pageImages = await renderPdfPagesAsImages(dataBuffer, 2.0);
    if (!pageImages.length) {
      throw new Error('Nenhuma página convertida para imagem');
    }

    const totalPages = numPages > 0 ? numPages : pageImages.length;
    const indicesToProcess = [];
    for (let i = 0; i < pageImages.length; i++) {
      const page = i + 1;
      if (pagesToOCR.size > 0 && !pagesToOCR.has(page)) continue;
      indicesToProcess.push(i);
    }

    const markdownPrompt = [
      'Você é um extrator OCR técnico para manuais de elevadores.',
      'Transcreva EXATAMENTE o conteúdo da imagem para Markdown.',
      'Regras obrigatórias:',
      '1) Saída SOMENTE em Markdown, sem explicações.',
      '2) Preserve tabelas usando sintaxe Markdown de tabela (| coluna | coluna |).',
      '3) Preserve códigos técnicos, pinagem, labels, números e unidades.',
      '4) Mantenha a ordem visual da página.',
      '5) Não invente texto que não aparece na imagem.',
      '6) Se a página estiver ilegível ou vazia, retorne exatamente: [PAGINA_ILEGIVEL]'
    ].join('\n');

    for (let idx = 0; idx < indicesToProcess.length; idx++) {
      const pageIndex = indicesToProcess[idx];
      const pageNum = pageIndex + 1;

      if (Date.now() - ocrStartTime > globalOcrTimeoutMs) {
        console.log(`   ⏱️ OCR timeout global (${Math.round(globalOcrTimeoutMs / 1000)}s) na página ${pageNum}/${totalPages}. Salvando parcial...`);
        ocrPartialResult = true;
        break;
      }

      if (onProgress) {
        const progressPct = Math.round(((idx + 1) / Math.max(1, indicesToProcess.length)) * 100);
        onProgress({
          phase: 'ocr',
          message: `Gemini OCR página ${pageNum}/${totalPages}${pagesToOCR.size > 0 ? ' (seletivo)' : ''}...`,
          progress: progressPct
        });
      }

      try {
        const imageBase64 = pageImages[pageIndex].toString('base64');
        const result = await visionModel.generateContent([
          { text: markdownPrompt },
          {
            inlineData: {
              mimeType: 'image/png',
              data: imageBase64
            }
          }
        ]);

        const pageMarkdown = normalizeMarkdownOutput(result?.response?.text?.() || '');
        if (pageMarkdown && pageMarkdown !== '[PAGINA_ILEGIVEL]') {
          ocrText += `\n--- Página ${pageNum} (OCR) ---\n${pageMarkdown}\n`;
          ocrPages++;
        }
      } catch (pageErr) {
        console.warn(`   ⚠️ Gemini OCR falhou na página ${pageNum}: ${pageErr.message}`);
      }

      if ((idx + 1) % 10 === 0 || (idx + 1) === indicesToProcess.length) {
        console.log(`   📄 Gemini OCR: ${idx + 1}/${indicesToProcess.length} páginas processadas (${ocrPages} com texto)`);
      }
    }

    ocrPagesTotal = indicesToProcess.length;
    if (numPages === 0) numPages = totalPages;
    console.log(`   ${ocrPartialResult ? '⏱️' : '✅'} Gemini OCR ${ocrPartialResult ? 'parcial' : 'concluído'}: ${ocrPages}/${ocrPagesTotal} páginas com texto, ${ocrText.length} chars`);
  } catch (ocrError) {
    console.error('   ❌ Erro no OCR multimodal (Gemini):', ocrError.message);
    if (parsedText.trim().length > 0) {
      console.log(`   ↩️ Fallback: usando ${parsedText.length} chars do pdf-parse`);
    }
  }
  
  // 4. Combina texto disponível
  const combinedText = normalizeExtractedText([parsedText.trim(), ocrText.trim()].filter(Boolean).join('\n\n'));
  
  if (!combinedText || combinedText.length < 20) {
    throw new Error(`Não foi possível extrair texto do PDF (${combinedText.length} chars). Arquivo pode estar corrompido ou protegido.`);
  }
  
  return {
    text: combinedText,
    numPages: numPages || 1,
    info,
    metadata,
    ocrUsed: ocrText.length > 0,
    ocrChars: ocrText.length,
    ocrPartial: ocrPartialResult,
    ocrPagesProcessed: ocrPagesTotal
  };
}

/**
 * Divide texto em seções lógicas baseado em headers/marcadores
 */
function splitIntoSections(text) {
  // Padrões de seção comuns em manuais técnicos
  const sectionPattern = /\n(?=(?:\d+\.\d*\s+[A-ZÀ-Ü]|[A-ZÀ-Ü][A-ZÀ-Ü\s]{4,}\n|#{1,3}\s|--- Página \d+|CAPÍTULO|SEÇÃO|PARTE\s+\d))/gi;
  
  const sections = text.split(sectionPattern).filter(s => s.trim());
  
  // Se não encontrou seções, retorna o texto inteiro como uma seção
  if (sections.length <= 1) return [text];
  
  return sections;
}

/**
 * Divide o texto em chunks menores com overlap (respeitando seções)
 */
export function splitTextIntoChunks(text, metadata = {}) {
  const chunks = [];
  const normalizedText = normalizeExtractedText(text);
  const pages = splitIntoPageBlocks(normalizedText);
  const dedupe = new Set();
  const nextChunkIndexRef = { value: 0 };

  const pushChunk = (content, extraMeta = {}) => {
    const clean = normalizeExtractedText(content);
    if (!clean || clean.length < 25) return;

    const key = clean.toLowerCase().replace(/\s+/g, ' ').slice(0, 240);
    if (dedupe.has(key)) return;
    dedupe.add(key);

    chunks.push({
      id: uuidv4(),
      content: clean,
      metadata: {
        ...metadata,
        ...extraMeta,
        chunkIndex: nextChunkIndexRef.value++
      }
    });
  };

  for (const pageBlock of pages) {
    const pageMeta = pageBlock.page ? { page: pageBlock.page } : {};

    const specializedFaultChunks = createSpecializedFaultChunks(pageBlock.content, { ...metadata, ...pageMeta }, nextChunkIndexRef);
    for (const chunk of specializedFaultChunks) {
      const key = normalizeExtractedText(chunk.content).toLowerCase().replace(/\s+/g, ' ').slice(0, 240);
      if (!dedupe.has(key)) {
        dedupe.add(key);
        chunks.push(chunk);
      }
    }

    const sections = splitIntoSections(pageBlock.content);
    for (const section of sections) {
      const pieces = splitLongTextWithOverlap(section, CHUNK_SIZE, CHUNK_OVERLAP);
      for (const piece of pieces) {
        pushChunk(piece, { ...pageMeta, chunkType: 'semantic' });
      }
    }

    const lineAwarePieces = splitLongTextWithOverlap(pageBlock.content, TECH_CHUNK_SIZE, TECH_CHUNK_OVERLAP);
    for (const piece of lineAwarePieces) {
      pushChunk(piece, { ...pageMeta, chunkType: 'page_window' });
    }
  }

  if (chunks.length === 0 && normalizedText) {
    const fallbackPieces = splitLongTextWithOverlap(normalizedText, CHUNK_SIZE, CHUNK_OVERLAP);
    for (const piece of fallbackPieces) {
      pushChunk(piece, { chunkType: 'fallback' });
    }
  }

  return chunks;
}

/**
 * Processa um diretório inteiro de PDFs (com OCR automático)
 */
export async function processDirectory(dirPath, onProgress) {
  const listPdfFilesRecursive = (dir) => {
    const out = [];
    if (!fs.existsSync(dir)) return out;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) out.push(...listPdfFilesRecursive(full));
      else if (ent.isFile() && ent.name.toLowerCase().endsWith('.pdf')) out.push(full);
    }
    return out;
  };

  const filePaths = listPdfFilesRecursive(dirPath);
  const files = filePaths.map(p => ({
    fullPath: p,
    name: path.basename(p),
    relativePath: path.relative(dirPath, p)
  }));
  const allChunks = [];
  
  console.log(`\n📁 Encontrados ${files.length} arquivos PDF para processar\n`);
  
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const filePath = file.fullPath;
    
    console.log(`📄 [${i + 1}/${files.length}] Processando: ${file.relativePath}`);
    
    try {
      // Usa extração com OCR automático
      const extracted = await extractTextWithOCR(filePath, (progress) => {
        if (progress.phase === 'ocr') {
          process.stdout.write(`\r   🔤 ${progress.message}`);
        }
      });
      
      if (extracted.ocrUsed) {
        console.log(`\n   🔤 OCR utilizado: +${extracted.ocrChars} chars extraídos de imagens`);
      }
      
      const chunks = splitTextIntoChunks(extracted.text, {
        source: file.name,
        filePath: filePath,
        numPages: extracted.numPages,
        title: extracted.info?.Title || file.name.replace('.pdf', ''),
        ocrUsed: extracted.ocrUsed || false
      });
      
      allChunks.push(...chunks);
      
      console.log(`   ✅ Extraído: ${chunks.length} chunks de ${extracted.numPages} páginas`);
      
      if (onProgress) {
        onProgress({
          current: i + 1,
          total: files.length,
          file: file.relativePath,
          chunks: chunks.length
        });
      }
    } catch (error) {
      console.error(`   ❌ Erro ao processar ${file.relativePath}:`, error.message);
    }
  }
  
  // Libera recursos do OCR (pool)
  await terminateOCR();
  
  console.log(`\n✨ Total: ${allChunks.length} chunks de ${files.length} arquivos\n`);
  
  return allChunks;
}

/**
 * Libera recursos do Tesseract
 */
export async function terminateOCR() {
  if (tesseractWorkers && Array.isArray(tesseractWorkers)) {
    const workers = tesseractWorkers;
    tesseractWorkers = null; // Clear reference FIRST to prevent re-use
    await Promise.allSettled(workers.map(w => {
      try { return w.terminate(); } catch { return Promise.resolve(); }
    }));
  }
}

/**
 * Estima páginas processadas a partir do tamanho dos chunks
 */
export function estimatePages(chunks) {
  // Aproximadamente 3000 caracteres por página
  const totalChars = chunks.reduce((sum, c) => sum + c.content.length, 0);
  return Math.ceil(totalChars / 3000);
}

export default {
  extractTextFromPDF,
  extractTextWithOCR,
  splitTextIntoChunks,
  processDirectory,
  estimatePages,
  terminateOCR
};
