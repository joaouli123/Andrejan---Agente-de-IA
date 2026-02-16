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
  const response = await fetch(`${RAG_SERVER_URL}/api/payments/create-preference`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...ragHeaders(),
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload?.error || 'Falha ao criar checkout do Mercado Pago');
  }

  return (await response.json()) as MercadoPagoPreferenceResponse;
};

export const verifyMercadoPagoPayment = async (paymentId: string) => {
  const response = await fetch(`${RAG_SERVER_URL}/api/payments/verify?paymentId=${encodeURIComponent(paymentId)}`, {
    method: 'GET',
    headers: {
      ...ragHeaders(),
    },
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload?.error || 'Falha ao verificar pagamento');
  }

  return (await response.json()) as VerifyPaymentResponse;
};
