import { GoogleGenAI, GenerateContentResponse } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const getDiagnostic = async (
  query: string,
  history: { role: 'user' | 'model'; parts: { text: string }[] }[] = [],
  customSystemInstruction?: string
): Promise<string> => {
  try {
    const defaultInstruction = `
      Você é a Elevex, uma inteligência artificial especialista em manutenção de elevadores e transporte vertical.
      Sua missão é ajudar técnicos a diagnosticar falhas de forma segura.
      Priorize a segurança.
      Seja direto e técnico.
    `;

    const chat = ai.chats.create({
      model: 'gemini-3-flash-preview',
      config: {
        systemInstruction: customSystemInstruction || defaultInstruction,
        temperature: 0.4,
      },
      history: history.map(h => ({
        role: h.role,
        parts: h.parts
      }))
    });

    const response: GenerateContentResponse = await chat.sendMessage({ message: query });
    return response.text || "Não foi possível gerar um diagnóstico no momento.";

  } catch (error) {
    console.error("Erro ao consultar Gemini:", error);
    return "Desculpe, ocorreu um erro ao processar seu diagnóstico. Verifique sua conexão e tente novamente.";
  }
};