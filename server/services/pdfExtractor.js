/**
 * Serviço de Extração de PDFs
 * Extrai texto via pdf-parse + OCR (Tesseract) para páginas com imagens/scans
 */

import fs from 'fs';
import path from 'path';
import pdfParse from 'pdf-parse';
import Tesseract from 'tesseract.js';
import { v4 as uuidv4 } from 'uuid';

// Tamanho máximo de cada chunk (em caracteres)
const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 200;

// Limiar: se uma página tem menos de X chars de texto, provavelmente é scan/imagem
const OCR_TEXT_THRESHOLD = 50;

// Limiar por página: mesmo PDFs "bons" podem ter páginas de diagramas/tabelas como imagem
const OCR_TEXT_THRESHOLD_PER_PAGE = 120;

// Pool de workers do Tesseract (CPU-bound) para usar vários cores
let tesseractWorkers = null;

function getOcrWorkerCount() {
  const env = parseInt(process.env.OCR_WORKERS || '', 10);
  if (Number.isFinite(env) && env > 0) return Math.min(env, 8);
  // Default conservador (i9 aguenta mais, mas OCR consome RAM)
  return 2;
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
          const strings = textContent.items.map((item) => item.str);
          const pageText = strings.join(' ').replace(/\s+/g, ' ').trim();
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
  
  // 3. PDF sem texto suficiente OU páginas fracas detectadas — tentar OCR
  const reason = !pdfData
    ? 'pdf-parse falhou completamente'
    : (hasGoodText ? `páginas com pouco texto detectadas (${pagesToOCR.size})` : `pouco texto (${Math.round(avgCharsPerPage)} chars/pág)`);
  console.log(`   🔍 ${reason} — ativando OCR...`);
  if (onProgress) onProgress({ phase: 'ocr_start', message: 'PDF com imagens detectado, iniciando OCR...' });
  
  let ocrText = '';
  let ocrPages = 0;
  
  try {
    const { pdf } = await import('pdf-to-img');
    const workers = await getTesseractWorkers();

    // Melhor para tabelas/diagramas: preserva espaços e usa segmentação mais "blocada"
    for (const w of workers) {
      try {
        await w.setParameters({
          preserve_interword_spaces: '1',
          tessedit_pageseg_mode: '6',
        });
      } catch {
        // ignora se não suportar
      }
    }
    
    let pageNum = 0;
    let pdfIterator;
    
    const pdfScale = Number.parseFloat(process.env.PDF_IMG_SCALE || '2.0');
    const safeScale = Number.isFinite(pdfScale) ? Math.min(Math.max(pdfScale, 1.0), 3.0) : 2.0;

    try {
      pdfIterator = await pdf(dataBuffer, { scale: safeScale });
    } catch (pdfImgErr) {
      // Tentar com escala menor se a escala 2.0 falhar
      console.log(`   ⚠️ pdf-to-img falhou com scale=${safeScale}: ${pdfImgErr.message}`);
      console.log(`   🔄 Tentando com scale=1.0...`);
      try {
        pdfIterator = await pdf(dataBuffer, { scale: 1.0 });
      } catch (pdfImgErr2) {
        throw new Error(`pdf-to-img não conseguiu processar: ${pdfImgErr2.message}`);
      }
    }

    const ocrResultsByPage = new Map();
    const maxPending = Math.max(1, parseInt(process.env.OCR_MAX_PENDING || '', 10) || (workers.length * 2));
    const pending = [];
    let nextWorker = 0;

    const runRecognize = async (w, pageNumLocal, pageImage) => {
      try {
        const result = await w.recognize(pageImage);
        const pageText = result.data.text.trim();
        if (pageText.length > 10) {
          ocrResultsByPage.set(pageNumLocal, pageText);
        }
      } catch (err) {
        console.warn(`   ⚠️ OCR falhou na página ${pageNumLocal}: ${err.message}`);
      }
    };

    for await (const pageImage of pdfIterator) {
      pageNum++;

      // OCR seletivo: se temos lista de páginas, só reconhece nelas
      if (pagesToOCR.size > 0 && !pagesToOCR.has(pageNum)) {
        continue;
      }
      
      if (onProgress) {
        onProgress({ 
          phase: 'ocr', 
          message: `OCR página ${pageNum}/${numPages || '?'}${pagesToOCR.size > 0 ? ' (seletivo)' : ''}...`,
          progress: numPages > 0 ? Math.round((pageNum / numPages) * 100) : 0
        });
      }
      
      const w = workers[nextWorker++ % workers.length];
      const p = runRecognize(w, pageNum, pageImage);
      pending.push(p);
      if (pending.length >= maxPending) {
        // Mantém o pipeline andando sem estourar memória
        await pending.shift();
      }

      if (pageNum % 10 === 0) {
        console.log(`   📄 OCR: ${pageNum}/${numPages || '?'} páginas processadas`);
      }
    }

    // Espera terminar o que ficou pendente
    await Promise.allSettled(pending);

    // Monta o OCR na ordem das páginas
    const pagesSorted = [...ocrResultsByPage.keys()].sort((a, b) => a - b);
    for (const pNum of pagesSorted) {
      const txt = ocrResultsByPage.get(pNum);
      if (txt && txt.length > 10) {
        ocrText += `\n--- Página ${pNum} (OCR) ---\n${txt}\n`;
        ocrPages++;
      }
    }
    
    // Se pdf-parse não detectou páginas, usa o que o OCR contou
    if (numPages === 0) numPages = pageNum;
    
    console.log(`   ✅ OCR concluído: ${ocrPages}/${pageNum} páginas com texto, ${ocrText.length} chars`);
    
  } catch (ocrError) {
    console.error('   ❌ Erro no OCR pipeline:', ocrError.message);
    // Se temos algum texto do pdf-parse, usamos como fallback
    if (parsedText.trim().length > 0) {
      console.log(`   ↩️ Fallback: usando ${parsedText.length} chars do pdf-parse`);
    }
  }
  
  // 4. Combina texto disponível
  const combinedText = [parsedText.trim(), ocrText.trim()].filter(Boolean).join('\n\n').trim();
  
  if (!combinedText || combinedText.length < 20) {
    throw new Error(`Não foi possível extrair texto do PDF (${combinedText.length} chars). Arquivo pode estar corrompido ou protegido.`);
  }
  
  return {
    text: combinedText,
    numPages: numPages || 1,
    info,
    metadata,
    ocrUsed: ocrText.length > 0,
    ocrChars: ocrText.length
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
  let chunkIndex = 0;
  
  // 1. Divide em seções lógicas primeiro
  const sections = splitIntoSections(text);
  
  for (const section of sections) {
    // 2. Se a seção cabe em um chunk, mantém inteira
    if (section.length <= CHUNK_SIZE) {
      if (section.trim()) {
        chunks.push({
          id: uuidv4(),
          content: section.trim(),
          metadata: { ...metadata, chunkIndex: chunkIndex++ }
        });
      }
      continue;
    }
    
    // 3. Seção grande: divide por sentenças com overlap
    const sentences = section.split(/(?<=[.!?])\s+/);
    let currentChunk = '';
    
    for (const sentence of sentences) {
      if ((currentChunk + sentence).length > CHUNK_SIZE && currentChunk.length > 0) {
        chunks.push({
          id: uuidv4(),
          content: currentChunk.trim(),
          metadata: { ...metadata, chunkIndex: chunkIndex++ }
        });
        
        // Overlap: mantém os últimos CHUNK_OVERLAP caracteres
        const overlapStart = Math.max(0, currentChunk.length - CHUNK_OVERLAP);
        currentChunk = currentChunk.substring(overlapStart) + ' ' + sentence;
      } else {
        currentChunk += (currentChunk ? ' ' : '') + sentence;
      }
    }
    
    // Adiciona o último chunk da seção
    if (currentChunk.trim()) {
      chunks.push({
        id: uuidv4(),
        content: currentChunk.trim(),
        metadata: { ...metadata, chunkIndex: chunkIndex++ }
      });
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
    await Promise.allSettled(tesseractWorkers.map(w => w.terminate()));
    tesseractWorkers = null;
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
