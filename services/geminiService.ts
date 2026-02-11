import { RAG_SERVER_URL, ragHeaders } from './ragApi';

// URL do servidor RAG (centralizada em ragApi.ts)

// Interface para resposta do RAG
interface RAGResponse {
  answer: string;
  sources: Array<{
    source: string;
    title: string;
    excerpt: string;
    similarity: number;
  }>;
  searchTime: number;
  documentsFound: number;
}

/**
 * Consulta o servidor RAG para buscar informações nos documentos
 */
export const queryRAG = async (
  question: string,
  systemInstruction?: string,
  brandFilter?: string,
  conversationHistory?: { role: string; parts: { text: string }[] }[]
): Promise<RAGResponse | null> => {
  try {
    const response = await fetch(`${RAG_SERVER_URL}/api/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...ragHeaders() },
      body: JSON.stringify({
        question,
        systemInstruction,
        topK: 10,
        brandFilter: brandFilter || null,
        conversationHistory: conversationHistory || []
      })
    });

    if (!response.ok) {
      console.warn('RAG server não disponível, usando modo direto');
      return null;
    }

    return await response.json();
  } catch (error) {
    console.warn('Erro ao consultar RAG:', error);
    return null;
  }
};

/**
 * Verifica se o servidor RAG está disponível e retorna status de carregamento
 */
export const isRAGAvailable = async (): Promise<boolean> => {
  try {
    const response = await fetch(`${RAG_SERVER_URL}/api/health`);
    return response.ok;
  } catch {
    return false;
  }
};

export const getRAGStatus = async (): Promise<{ available: boolean; loading: boolean; progress?: string }> => {
  try {
    const response = await fetch(`${RAG_SERVER_URL}/api/health`);
    if (!response.ok) return { available: false, loading: false };
    const data = await response.json();
    return { available: true, loading: !!data.loading, progress: data.loadingProgress };
  } catch {
    return { available: false, loading: false };
  }
};

/**
 * Obtém estatísticas do banco de conhecimento
 */
export const getRAGStats = async (): Promise<{ totalDocuments: number } | null> => {
  try {
    const response = await fetch(`${RAG_SERVER_URL}/api/stats`, {
      headers: { ...ragHeaders() }
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
};

export const getDiagnostic = async (
  query: string,
  history: { role: 'user' | 'model'; parts: { text: string }[] }[] = [],
  customSystemInstruction?: string,
  useRAG: boolean = true,
  brandFilter?: string
): Promise<string> => {
  try {
    const systemInstruction = customSystemInstruction || '';

    // SEMPRE usa RAG - só responde com base nos documentos
    if (useRAG) {
      const ragResponse = await queryRAG(query, systemInstruction, brandFilter, history);
      
      if (ragResponse && ragResponse.answer) {
        return ragResponse.answer;
      }
      
      // Se RAG não encontrou nada, retorna mensagem padrão (NÃO usa Gemini direto!)
      return "❌ Não encontrei informações relevantes na base de conhecimento para responder sua pergunta.\n\nPor favor:\n- Verifique se os documentos corretos foram carregados\n- Tente reformular sua pergunta com termos mais específicos";
    }

    // Fallback SEM RAG (só para casos especiais - desabilitado por padrão)
    return "⚠️ O sistema está configurado para responder apenas com base na documentação. Por favor, carregue os manuais técnicos na Base de Conhecimento.";

  } catch (error) {
    console.error("Erro ao consultar:", error);
    return "Desculpe, ocorreu um erro ao processar sua pergunta. Verifique se o servidor RAG está rodando.";
  }
};