import { RAG_SERVER_URL, ragHeaders } from './ragApi';

export type MercadoPagoPreferenceResponse = {
  preferenceId: string;
  initPoint: string;
  sandboxInitPoint?: string;
};

export type MercadoPagoPaymentStatus = 'approved' | 'pending' | 'rejected';

export type VerifyPaymentResponse = {
  status: MercadoPagoPaymentStatus;
  paymentId: string;
  externalReference?: string | null;
};

export const createMercadoPagoPreference = async (input: {
  planId: string;
  payerName: string;
  payerEmail: string;
  userId?: string;
}) => {
  let response: Response;
  try {
    response = await fetch(`${RAG_SERVER_URL}/api/payments/create-preference`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...ragHeaders(),
      },
      body: JSON.stringify(input),
    });
  } catch (networkError: any) {
    throw new Error('Erro de conexão com o servidor. Verifique sua internet e tente novamente.');
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    if (response.status === 401) {
      throw new Error('Erro de autenticação com o servidor. Recarregue a página e tente novamente.');
    }
    if (response.status === 502) {
      throw new Error(payload?.error || 'O Mercado Pago não respondeu corretamente. Tente novamente em instantes.');
    }
    throw new Error(payload?.error || `Erro ${response.status}: Falha ao criar checkout do Mercado Pago`);
  }

  return (await response.json()) as MercadoPagoPreferenceResponse;
};

export const verifyMercadoPagoPayment = async (paymentId: string) => {
  let response: Response;
  try {
    response = await fetch(`${RAG_SERVER_URL}/api/payments/verify?paymentId=${encodeURIComponent(paymentId)}`, {
      method: 'GET',
      headers: {
        ...ragHeaders(),
      },
    });
  } catch {
    // Se falhar na verificação, retorna status baseado na URL (não bloqueia o fluxo)
    return { status: 'pending' as MercadoPagoPaymentStatus, paymentId, externalReference: null };
  }

  if (!response.ok) {
    // Não lança erro — verificação é "best-effort"
    return { status: 'pending' as MercadoPagoPaymentStatus, paymentId, externalReference: null };
  }

  return (await response.json()) as VerifyPaymentResponse;
};
