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

// Cache do worker do Tesseract para reutilização
let tesseractWorker = null;

async function getTesseractWorker() {
  if (!tesseractWorker) {
    console.log('   🔤 Iniciando Tesseract OCR (primeira vez)...');
    tesseractWorker = await Tesseract.createWorker('por+eng', 1, {
      logger: () => {} // silencioso
    });
  }
  return tesseractWorker;
}

/**
 * Extrai texto de um arquivo PDF (texto puro via pdf-parse)
 */
export async function extractTextFromPDF(filePath) {
  try {
    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdfParse(dataBuffer);
    
    return {
      text: data.text,
      numPages: data.numpages,
      info: data.info,
      metadata: data.metadata
    };
  } catch (error) {
    console.error(`Erro ao extrair texto de ${filePath}:`, error);
    throw error;
  }
}

/**
 * Extrai texto de um PDF usando OCR nas páginas que têm pouco texto
 * Combina pdf-parse (texto) + Tesseract (OCR para imagens/scans)
 */
export async function extractTextWithOCR(filePath, onProgress) {
  const dataBuffer = fs.readFileSync(filePath);
  
  // 1. Tenta extrair texto normalmente primeiro
  const pdfData = await pdfParse(dataBuffer);
  const numPages = pdfData.numpages;
  
  // 2. Verifica se o PDF tem texto suficiente ou se parece ser scan
  const avgCharsPerPage = pdfData.text.length / numPages;
  const needsOCR = avgCharsPerPage < OCR_TEXT_THRESHOLD;
  
  if (!needsOCR && pdfData.text.trim().length > 200) {
    // Texto suficiente, não precisa OCR
    if (onProgress) onProgress({ phase: 'text', message: `Texto extraído normalmente (${pdfData.text.length} chars)` });
    return {
      text: pdfData.text,
      numPages,
      info: pdfData.info,
      metadata: pdfData.metadata,
      ocrUsed: false
    };
  }
  
  // 3. PDF parece ser scan/imagem - usar OCR
  console.log(`   🔍 PDF com pouco texto (${Math.round(avgCharsPerPage)} chars/pág) - ativando OCR...`);
  if (onProgress) onProgress({ phase: 'ocr_start', message: 'PDF com imagens detectado, iniciando OCR...' });
  
  let ocrText = '';
  
  try {
    // Importa pdf-to-img dinamicamente
    const { pdf } = await import('pdf-to-img');
    const worker = await getTesseractWorker();
    
    let pageNum = 0;
    
    // Converte cada página para imagem e faz OCR
    for await (const pageImage of await pdf(dataBuffer, { scale: 2.0 })) {
      pageNum++;
      
      if (onProgress) {
        onProgress({ 
          phase: 'ocr', 
          message: `OCR página ${pageNum}/${numPages}...`,
          progress: Math.round((pageNum / numPages) * 100)
        });
      }
      
      try {
        // pageImage é um Buffer PNG
        const result = await worker.recognize(pageImage);
        const pageText = result.data.text.trim();
        
        if (pageText.length > 10) {
          ocrText += `\n--- Página ${pageNum} ---\n${pageText}\n`;
        }
        
        if (pageNum % 10 === 0) {
          console.log(`   📄 OCR: ${pageNum}/${numPages} páginas processadas`);
        }
      } catch (ocrErr) {
        console.warn(`   ⚠️ OCR falhou na página ${pageNum}:`, ocrErr.message);
      }
    }
    
    console.log(`   ✅ OCR concluído: ${numPages} páginas, ${ocrText.length} chars extraídos`);
    
  } catch (ocrError) {
    console.error('   ❌ Erro no OCR pipeline:', ocrError.message);
    // Fallback: usa o texto que conseguiu extrair normalmente
    if (pdfData.text.trim().length > 0) {
      console.log('   ↩️ Usando texto parcial do pdf-parse como fallback');
      ocrText = pdfData.text;
    }
  }
  
  // Combina: texto do pdf-parse + texto do OCR
  const combinedText = (pdfData.text.trim() + '\n\n' + ocrText.trim()).trim();
  
  return {
    text: combinedText,
    numPages,
    info: pdfData.info,
    metadata: pdfData.metadata,
    ocrUsed: true,
    ocrChars: ocrText.length
  };
}

/**
 * Divide o texto em chunks menores com overlap
 */
export function splitTextIntoChunks(text, metadata = {}) {
  const chunks = [];
  const sentences = text.split(/(?<=[.!?])\s+/);
  
  let currentChunk = '';
  let chunkIndex = 0;
  
  for (const sentence of sentences) {
    if ((currentChunk + sentence).length > CHUNK_SIZE && currentChunk.length > 0) {
      chunks.push({
        id: uuidv4(),
        content: currentChunk.trim(),
        metadata: {
          ...metadata,
          chunkIndex: chunkIndex++
        }
      });
      
      // Mantém overlap pegando as últimas palavras
      const words = currentChunk.split(' ');
      const overlapWords = words.slice(-Math.floor(CHUNK_OVERLAP / 5));
      currentChunk = overlapWords.join(' ') + ' ' + sentence;
    } else {
      currentChunk += (currentChunk ? ' ' : '') + sentence;
    }
  }
  
  // Adiciona o último chunk
  if (currentChunk.trim()) {
    chunks.push({
      id: uuidv4(),
      content: currentChunk.trim(),
      metadata: {
        ...metadata,
        chunkIndex: chunkIndex
      }
    });
  }
  
  return chunks;
}

/**
 * Processa um diretório inteiro de PDFs (com OCR automático)
 */
export async function processDirectory(dirPath, onProgress) {
  const files = fs.readdirSync(dirPath).filter(f => f.toLowerCase().endsWith('.pdf'));
  const allChunks = [];
  
  console.log(`\n📁 Encontrados ${files.length} arquivos PDF para processar\n`);
  
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const filePath = path.join(dirPath, file);
    
    console.log(`📄 [${i + 1}/${files.length}] Processando: ${file}`);
    
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
        source: file,
        filePath: filePath,
        numPages: extracted.numPages,
        title: extracted.info?.Title || file.replace('.pdf', ''),
        ocrUsed: extracted.ocrUsed || false
      });
      
      allChunks.push(...chunks);
      
      console.log(`   ✅ Extraído: ${chunks.length} chunks de ${extracted.numPages} páginas`);
      
      if (onProgress) {
        onProgress({
          current: i + 1,
          total: files.length,
          file: file,
          chunks: chunks.length
        });
      }
    } catch (error) {
      console.error(`   ❌ Erro ao processar ${file}:`, error.message);
    }
  }
  
  // Libera worker do Tesseract se foi usado
  if (tesseractWorker) {
    await tesseractWorker.terminate();
    tesseractWorker = null;
  }
  
  console.log(`\n✨ Total: ${allChunks.length} chunks de ${files.length} arquivos\n`);
  
  return allChunks;
}

/**
 * Libera recursos do Tesseract
 */
export async function terminateOCR() {
  if (tesseractWorker) {
    await tesseractWorker.terminate();
    tesseractWorker = null;
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
