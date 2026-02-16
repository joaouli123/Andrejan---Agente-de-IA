import { RAG_SERVER_URL, ragHeaders } from './ragApi';

// ═══ TIPOS ═══

export type MercadoPagoPaymentStatus = 'approved' | 'pending' | 'rejected';

export type MercadoPagoPreferenceResponse = {
  preferenceId: string;
  initPoint: string;
  sandboxInitPoint?: string;
};

export type VerifyPaymentResponse = {
  status: MercadoPagoPaymentStatus;
  paymentId: string;
  externalReference?: string | null;
};

export type CardPaymentResult = {
  status: MercadoPagoPaymentStatus;
  paymentId: string;
  statusDetail: string;
  externalReference?: string;
};

export type PixPaymentResult = {
  status: string;
  paymentId: string;
  qrCode: string;
  qrCodeBase64: string;
  ticketUrl: string;
  expirationDate: string;
  externalReference?: string;
};

export type PayerData = {
  email: string;
  first_name?: string;
  last_name?: string;
  identification?: { type: string; number: string };
};

// ═══ CHECKOUT TRANSPARENTE — Cartão ═══

export const processCardPayment = async (input: {
  token: string;
  payment_method_id: string;
  installments: number;
  transaction_amount: number;
  description: string;
  planId: string;
  userId?: string;
  payer: PayerData;
}): Promise<CardPaymentResult> => {
  let response: Response;
  try {
    response = await fetch(`${RAG_SERVER_URL}/api/payments/process-card`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...ragHeaders() },
      body: JSON.stringify(input),
    });
  } catch {
    throw new Error('Erro de conexão. Verifique sua internet e tente novamente.');
  }

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload?.error || 'Falha ao processar pagamento com cartão.');
  }

  return payload as CardPaymentResult;
};

// ═══ CHECKOUT TRANSPARENTE — PIX ═══

export const processPixPayment = async (input: {
  transaction_amount: number;
  description: string;
  planId: string;
  userId?: string;
  payer: PayerData;
}): Promise<PixPaymentResult> => {
  let response: Response;
  try {
    response = await fetch(`${RAG_SERVER_URL}/api/payments/process-pix`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...ragHeaders() },
      body: JSON.stringify(input),
    });
  } catch {
    throw new Error('Erro de conexão. Verifique sua internet e tente novamente.');
  }

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload?.error || 'Falha ao gerar pagamento PIX.');
  }

  return payload as PixPaymentResult;
};

// ═══ VERIFICAÇÃO DE PAGAMENTO ═══

export const verifyMercadoPagoPayment = async (paymentId: string): Promise<VerifyPaymentResponse> => {
  let response: Response;
  try {
    response = await fetch(`${RAG_SERVER_URL}/api/payments/verify?paymentId=${encodeURIComponent(paymentId)}`, {
      method: 'GET',
      headers: { ...ragHeaders() },
    });
  } catch {
    return { status: 'pending', paymentId, externalReference: null };
  }

  if (!response.ok) {
    return { status: 'pending', paymentId, externalReference: null };
  }

  return (await response.json()) as VerifyPaymentResponse;
};

// ═══ BUSCAR PUBLIC KEY DO MP ═══

export const fetchMPPublicKey = async (): Promise<string | null> => {
  try {
    const response = await fetch(`${RAG_SERVER_URL}/api/payments/public-key`);
    if (!response.ok) return null;
    const data = await response.json();
    return data.publicKey || null;
  } catch {
    return null;
  }
};

// ═══ LEGACY: Criar preferência (Checkout Pro — mantido para compatibilidade) ═══

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
      headers: { 'Content-Type': 'application/json', ...ragHeaders() },
      body: JSON.stringify(input),
    });
  } catch {
    throw new Error('Erro de conexão com o servidor.');
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload?.error || `Erro ${response.status}`);
  }

  return (await response.json()) as MercadoPagoPreferenceResponse;
};
