import React, { useState, useEffect, useRef } from 'react';
import { ShieldCheck, Lock, CreditCard, ArrowLeft, Check, Cpu, Zap, Clock, Copy, CheckCircle, AlertTriangle, Smartphone, Eye, EyeOff } from 'lucide-react';
import { Plan } from './Pricing';
import { processCardPayment, processPixPayment, verifyMercadoPagoPayment, fetchMPPublicKey } from '../services/paymentApi';
import * as Storage from '../services/storage';

/* ── Global type for MercadoPago SDK ── */
declare global {
  interface Window {
    MercadoPago: any;
  }
}

/* ── Payment Brand SVG Icons (official colors) ── */

const MastercardIcon = () => (
  <svg viewBox="0 0 48 30" className="h-7 w-auto">
    <circle cx="18" cy="15" r="10" fill="#EB001B" />
    <circle cx="30" cy="15" r="10" fill="#F79E1B" />
    <path d="M24 7.5a10 10 0 0 0-3.73 7.5A10 10 0 0 0 24 22.5a10 10 0 0 0 3.73-7.5A10 10 0 0 0 24 7.5z" fill="#FF5F00" />
  </svg>
);

const VisaIcon = () => (
  <svg viewBox="0 0 48 16" className="h-6 w-auto" fill="#1A1F71">
    <path d="M19.4 0.5L12.5 15.5H8.2L4.8 3.6C4.6 2.8 4.4 2.5 3.8 2.2C2.8 1.7 1.2 1.2 0 0.9L0.1 0.5H6.9C7.8 0.5 8.5 1 8.7 2.1L10.3 10.6L14.5 0.5H19.4ZM34 10.7C34 6.6 28.2 6.4 28.3 4.5C28.3 3.9 28.8 3.3 30 3.1C30.6 3 32.2 3 34 3.8L34.7 0.9C33.7 0.5 32.5 0.2 31 0.2C26.4 0.2 23.2 2.6 23.2 6C23.2 8.4 25.3 9.8 26.9 10.6C28.6 11.5 29.1 12 29.1 12.8C29.1 14 27.7 14.4 26.4 14.4C24.4 14.5 23.2 13.9 22.3 13.5L21.5 16.5C22.5 17 24.2 17.3 26 17.4C30.9 17.4 34 15 34 11.4V10.7ZM44.2 15.5H48L44.7 0.5H41.2C40.4 0.5 39.8 0.9 39.5 1.7L32.6 15.5H37.5L38.4 13H44.4L44.2 15.5ZM39.8 9.6L42.3 3L43.7 9.6H39.8ZM27.6 0.5L23.7 15.5H19L22.9 0.5H27.6Z"/>
  </svg>
);

const AmexIcon = () => (
  <svg viewBox="0 0 48 30" className="h-7 w-auto">
    <rect width="48" height="30" rx="4" fill="#016FD0" />
    <text x="24" y="19" textAnchor="middle" fontFamily="Arial, sans-serif" fontSize="10" fontWeight="bold" fill="white" letterSpacing="0.5">AMEX</text>
  </svg>
);

const PixIcon = () => (
  <svg viewBox="0 0 24 24" className="h-7 w-auto" fill="none">
    <path d="M13.74 18.28l3.54-3.54a1.78 1.78 0 0 0 0-2.5l-3.54-3.54a2.47 2.47 0 0 0-3.48 0l-3.54 3.54a1.78 1.78 0 0 0 0 2.5l3.54 3.54a2.47 2.47 0 0 0 3.48 0z" fill="#32BCAD" />
    <path d="M17.28 5.72l-3.54 3.54 1.74 1.74 3.54-3.54a1.78 1.78 0 0 0 0-2.5l-.24-.24a1.78 1.78 0 0 0-1.5 1z" fill="#32BCAD" />
    <path d="M6.72 18.28l3.54-3.54-1.74-1.74-3.54 3.54a1.78 1.78 0 0 0 0 2.5l.24.24a1.78 1.78 0 0 0 1.5-1z" fill="#32BCAD" />
  </svg>
);

const EloIcon = () => (
  <svg viewBox="0 0 40 16" className="h-5 w-auto" fill="#231F20">
    <text x="0" y="13" fontFamily="Arial, sans-serif" fontSize="14" fontWeight="bold" letterSpacing="-0.5">elo</text>
  </svg>
);

/* ── Helpers ── */

function detectCardBrand(cardNumber: string) {
  const n = cardNumber.replace(/\s/g, '');
  if (/^4/.test(n)) return { id: 'visa', label: 'Visa' };
  if (/^5[1-5]/.test(n) || /^2[2-7]/.test(n)) return { id: 'master', label: 'Mastercard' };
  if (/^3[47]/.test(n)) return { id: 'amex', label: 'Amex' };
  if (/^636368|^438935|^504175|^451416|^636297|^5067|^4576|^4011/.test(n)) return { id: 'elo', label: 'Elo' };
  if (/^606282|^384[1][0-6]0/.test(n)) return { id: 'hipercard', label: 'Hipercard' };
  return null;
}

const BrandIconMap: Record<string, React.FC> = {
  visa: VisaIcon,
  master: MastercardIcon,
  elo: EloIcon,
  amex: AmexIcon,
};

function formatCardNumber(v: string) {
  return v.replace(/\D/g, '').slice(0, 16).replace(/(\d{4})(?=\d)/g, '$1 ');
}

function formatCPF(v: string) {
  const n = v.replace(/\D/g, '').slice(0, 11);
  if (n.length <= 3) return n;
  if (n.length <= 6) return `${n.slice(0, 3)}.${n.slice(3)}`;
  if (n.length <= 9) return `${n.slice(0, 3)}.${n.slice(3, 6)}.${n.slice(6)}`;
  return `${n.slice(0, 3)}.${n.slice(3, 6)}.${n.slice(6, 9)}-${n.slice(9)}`;
}

function formatPhone(v: string) {
  const n = v.replace(/\D/g, '').slice(0, 11);
  if (n.length <= 2) return n;
  if (n.length <= 7) return `(${n.slice(0, 2)}) ${n.slice(2)}`;
  if (n.length <= 10) return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`;
  return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`;
}

function formatExpiry(v: string) {
  const n = v.replace(/\D/g, '').slice(0, 4);
  if (n.length <= 2) return n;
  return `${n.slice(0, 2)}/${n.slice(2)}`;
}

function getCardRejectionMessage(detail: string): string {
  const m: Record<string, string> = {
    cc_rejected_bad_filled_card_number: 'Número do cartão incorreto.',
    cc_rejected_bad_filled_date: 'Data de validade incorreta.',
    cc_rejected_bad_filled_other: 'Verifique os dados do cartão.',
    cc_rejected_bad_filled_security_code: 'CVV incorreto.',
    cc_rejected_blacklist: 'Pagamento não autorizado.',
    cc_rejected_call_for_authorize: 'Ligue para a operadora do cartão para autorizar.',
    cc_rejected_card_disabled: 'Cartão desabilitado. Ative-o na operadora.',
    cc_rejected_duplicated_payment: 'Pagamento duplicado. Tente mais tarde.',
    cc_rejected_high_risk: 'Pagamento recusado por segurança.',
    cc_rejected_insufficient_amount: 'Saldo insuficiente.',
    cc_rejected_invalid_installments: 'Parcelamento inválido.',
    cc_rejected_max_attempts: 'Limite de tentativas atingido. Tente mais tarde.',
    cc_rejected_other_reason: 'Pagamento não autorizado. Tente outro cartão.',
  };
  return m[detail] || 'Pagamento não autorizado. Verifique os dados ou tente outro cartão.';
}

/* ── Types ── */

interface CheckoutProps {
  plan: Plan;
  onBack: () => void;
  onPaymentComplete: (status: 'approved' | 'pending' | 'rejected', paymentId?: string) => void;
  initialUserData?: { name: string; email: string };
}

type PaymentTab = 'card' | 'pix';

const Checkout: React.FC<CheckoutProps> = ({ plan, onBack, onPaymentComplete, initialUserData }) => {
  /* ── State ── */
  const [tab, setTab] = useState<PaymentTab>('card');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [mpReady, setMpReady] = useState(false);
  const [showCvv, setShowCvv] = useState(false);
  const mpRef = useRef<any>(null);

  // Timer (15 min)
  const [timeLeft, setTimeLeft] = useState(15 * 60);

  // Form — auto-fill from registration data
  const hasUserData = !!(initialUserData?.name && initialUserData?.email);
  const [f, setF] = useState({
    name: initialUserData?.name || '',
    email: initialUserData?.email || '',
    cpf: '',
    phone: '',
    cardNumber: '',
    cardholderName: '',
    cardExpiry: '',
    cardCvv: '',
  });

  // PIX
  const [pixData, setPixData] = useState<{
    qrCode: string;
    qrCodeBase64: string;
    paymentId: string;
  } | null>(null);
  const [pixCopied, setPixCopied] = useState(false);
  const pixPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Success overlay
  const [showSuccess, setShowSuccess] = useState(false);
  const [successPaymentId, setSuccessPaymentId] = useState('');

  /* ── Initialize MP SDK ── */
  useEffect(() => {
    const initMP = async () => {
      let publicKey = (typeof process !== 'undefined' && process.env?.MP_PUBLIC_KEY) || '';
      if (!publicKey) {
        const fetched = await fetchMPPublicKey();
        if (fetched) publicKey = fetched;
      }
      if (publicKey && window.MercadoPago) {
        try {
          mpRef.current = new window.MercadoPago(publicKey, { locale: 'pt-BR' });
          setMpReady(true);
        } catch (e) {
          console.error('[Checkout] MP SDK init error:', e);
        }
      }
    };
    initMP();
  }, []);

  /* ── Countdown ── */
  useEffect(() => {
    if (timeLeft <= 0) return;
    const id = setInterval(() => setTimeLeft(t => Math.max(0, t - 1)), 1000);
    return () => clearInterval(id);
  }, [timeLeft]);

  /* ── Cleanup PIX polling ── */
  useEffect(() => {
    return () => { if (pixPollRef.current) clearInterval(pixPollRef.current); };
  }, []);

  const mins = Math.floor(timeLeft / 60).toString().padStart(2, '0');
  const secs = (timeLeft % 60).toString().padStart(2, '0');

  /* ── Form handlers ── */
  const set = (name: string, value: string) => setF(prev => ({ ...prev, [name]: value }));

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    switch (name) {
      case 'cardNumber': return set(name, formatCardNumber(value));
      case 'cpf': return set(name, formatCPF(value));
      case 'phone': return set(name, formatPhone(value));
      case 'cardExpiry': return set(name, formatExpiry(value));
      case 'cardCvv': return set(name, value.replace(/\D/g, '').slice(0, 4));
      default: return set(name, value);
    }
  };

  const cardBrand = detectCardBrand(f.cardNumber);
  const CardBrandSvg = cardBrand ? BrandIconMap[cardBrand.id] : null;
  const isPersonalValid = f.name.trim().length >= 3 && /\S+@\S+\.\S+/.test(f.email) && f.cpf.replace(/\D/g, '').length === 11;
  const isCardValid = isPersonalValid && f.cardNumber.replace(/\s/g, '').length >= 15 && f.cardholderName.trim().length >= 3 && /^\d{2}\/\d{2}$/.test(f.cardExpiry) && f.cardCvv.length >= 3;

  /* ── Card payment ── */
  const handleCardPay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isCardValid) return;
    setError('');
    setLoading(true);

    try {
      const cardNum = f.cardNumber.replace(/\s/g, '');
      const [expM, expY] = f.cardExpiry.split('/');
      const cpf = f.cpf.replace(/\D/g, '');

      let pmId = cardBrand?.id || 'visa';
      if (mpRef.current) {
        try {
          const pmResult = await mpRef.current.getPaymentMethods({ bin: cardNum.substring(0, 6) });
          if (pmResult?.results?.[0]?.id) pmId = pmResult.results[0].id;
        } catch {}
      }

      let tokenId: string;
      if (mpRef.current) {
        const tokenResult = await mpRef.current.createCardToken({
          cardNumber: cardNum,
          cardholderName: f.cardholderName || f.name,
          cardExpirationMonth: expM,
          cardExpirationYear: expY.length === 2 ? `20${expY}` : expY,
          securityCode: f.cardCvv,
          identificationType: 'CPF',
          identificationNumber: cpf,
        });
        if (!tokenResult?.id) throw new Error('Não foi possível tokenizar o cartão. Verifique os dados.');
        tokenId = tokenResult.id;
      } else {
        throw new Error('SDK do Mercado Pago não carregado. Recarregue a página.');
      }

      const nameParts = f.name.split(' ');
      const result = await processCardPayment({
        token: tokenId,
        payment_method_id: pmId,
        installments: 1,
        transaction_amount: plan.price,
        description: `Assinatura ${plan.name} — Elevex`,
        planId: plan.id,
        userId: Storage.getUserProfile()?.id,
        payer: {
          email: f.email,
          first_name: nameParts[0] || '',
          last_name: nameParts.slice(1).join(' ') || '',
          identification: { type: 'CPF', number: cpf },
        },
      });

      if (result.status === 'approved') {
        setSuccessPaymentId(result.paymentId);
        setShowSuccess(true);
        setTimeout(() => onPaymentComplete('approved', result.paymentId), 2500);
      } else if (result.status === 'pending') {
        onPaymentComplete('pending', result.paymentId);
      } else {
        throw new Error(getCardRejectionMessage(result.statusDetail));
      }
    } catch (err: any) {
      console.error('[Checkout] Card error:', err);
      setError(err?.message || 'Erro ao processar pagamento.');
      setLoading(false);
    }
  };

  /* ── PIX payment ── */
  const handlePixPay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isPersonalValid) return;
    setError('');
    setLoading(true);

    try {
      const nameParts = f.name.split(' ');
      const cpf = f.cpf.replace(/\D/g, '');

      const result = await processPixPayment({
        transaction_amount: plan.price,
        description: `Assinatura ${plan.name} — Elevex`,
        planId: plan.id,
        userId: Storage.getUserProfile()?.id,
        payer: {
          email: f.email,
          first_name: nameParts[0] || '',
          last_name: nameParts.slice(1).join(' ') || '',
          identification: { type: 'CPF', number: cpf },
        },
      });

      setPixData({
        qrCode: result.qrCode,
        qrCodeBase64: result.qrCodeBase64,
        paymentId: result.paymentId,
      });
      setLoading(false);

      pixPollRef.current = setInterval(async () => {
        try {
          const v = await verifyMercadoPagoPayment(result.paymentId);
          if (v.status === 'approved') {
            if (pixPollRef.current) clearInterval(pixPollRef.current);
            setSuccessPaymentId(result.paymentId);
            setShowSuccess(true);
            setTimeout(() => onPaymentComplete('approved', result.paymentId), 2500);
          }
        } catch {}
      }, 5000);
    } catch (err: any) {
      console.error('[Checkout] PIX error:', err);
      setError(err?.message || 'Erro ao gerar PIX.');
      setLoading(false);
    }
  };

  const copyPix = () => {
    if (pixData?.qrCode) {
      navigator.clipboard.writeText(pixData.qrCode);
      setPixCopied(true);
      setTimeout(() => setPixCopied(false), 3000);
    }
  };

  /* ════════════════════════ RENDER ════════════════════════ */

  const inputCls = "w-full px-4 py-3.5 bg-white border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-[15px]";
  const labelCls = "block text-sm font-semibold text-slate-600 mb-1.5";

  return (
    <div className="min-h-screen bg-slate-50 relative">

      {/* Header — white */}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex justify-between items-center h-16">
          <div className="flex items-center">
            <div className="bg-blue-600 p-2 rounded-lg mr-2"><Cpu className="h-5 w-5 text-white" /></div>
            <span className="text-lg font-bold text-slate-900 tracking-tight">Elevex</span>
          </div>
          <button onClick={onBack} className="text-slate-500 hover:text-slate-900 text-sm font-medium flex items-center gap-1.5 transition-colors">
            <ArrowLeft size={16} /> Voltar
          </button>
        </div>
      </header>

      {/* Steps */}
      <div className="flex items-center justify-center mt-8 mb-8">
        <div className="flex items-center gap-3">
          {[{ label: 'Plano', done: true }, { label: 'Cadastro', done: true }, { label: 'Pagamento', done: false }].map((s, i) => (
            <React.Fragment key={i}>
              {i > 0 && <div className={`w-10 h-px ${s.done ? 'bg-blue-600' : 'bg-slate-300'}`} />}
              <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${s.done ? 'bg-blue-600' : 'bg-blue-600'}`}>
                  {s.done ? <Check className="w-4 h-4 text-white" /> : <span className="text-sm font-bold text-white">{i + 1}</span>}
                </div>
                <span className={`text-sm font-medium hidden sm:inline ${s.done ? 'text-blue-600' : 'text-slate-900 font-bold'}`}>{s.label}</span>
              </div>
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
        <div className="lg:grid lg:grid-cols-5 lg:gap-10">
          {/* ─── LEFT: Payment form (3 cols) ─── */}
          <div className="lg:col-span-3 mb-8 lg:mb-0">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              {/* Form header */}
              <div className="px-6 sm:px-8 py-5 border-b border-slate-100">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Assinar Plano {plan.name}</h2>
                  <p className="text-slate-500 text-sm mt-0.5">Preencha seus dados para concluir</p>
                </div>
              </div>

              {/* PIX QR Code View */}
              {pixData ? (
                <div className="p-6 sm:p-8">
                  <div className="text-center">
                    <div className="inline-flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-2 mb-6">
                      <Smartphone size={18} className="text-green-600" />
                      <span className="text-green-700 font-semibold text-sm">QR Code PIX gerado com sucesso</span>
                    </div>

                    {pixData.qrCodeBase64 && (
                      <div className="flex justify-center mb-6">
                        <div className="bg-white p-4 rounded-2xl border-2 border-slate-200 shadow-lg">
                          <img src={`data:image/png;base64,${pixData.qrCodeBase64}`} alt="QR Code PIX" className="w-56 h-56" />
                        </div>
                      </div>
                    )}

                    <p className="text-slate-600 text-sm mb-4">Escaneie o QR Code com o app do seu banco ou copie o código abaixo:</p>

                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-6">
                      <p className="text-xs text-slate-500 mb-2 font-medium">Código PIX (copia e cola)</p>
                      <div className="flex items-center gap-2">
                        <input readOnly value={pixData.qrCode} className="flex-1 text-xs font-mono bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-700 truncate" />
                        <button
                          onClick={copyPix}
                          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${pixCopied ? 'bg-green-600 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}
                        >
                          {pixCopied ? <><CheckCircle size={14} /> Copiado!</> : <><Copy size={14} /> Copiar</>}
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-center gap-2 text-slate-500 text-sm">
                      <div className="animate-pulse w-2 h-2 rounded-full bg-blue-500" />
                      Aguardando confirmação do pagamento...
                    </div>
                  </div>
                </div>
              ) : (
                /* Normal form view */
                <form onSubmit={tab === 'card' ? handleCardPay : handlePixPay}>
                  <div className="p-6 sm:p-8 space-y-5">

                    {/* User info from registration (read-only summary) */}
                    {hasUserData && (
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Dados do cadastro</span>
                          <Check className="w-4 h-4 text-green-500" />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div>
                            <p className="text-xs text-slate-400">Nome</p>
                            <p className="text-sm font-medium text-slate-900">{f.name}</p>
                          </div>
                          <div>
                            <p className="text-xs text-slate-400">Email</p>
                            <p className="text-sm font-medium text-slate-900">{f.email}</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Show name/email only if NOT from registration */}
                    {!hasUserData && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className={labelCls}>Nome completo</label>
                          <input name="name" value={f.name} onChange={handleInput} required placeholder="Seu nome completo" className={inputCls} />
                        </div>
                        <div>
                          <label className={labelCls}>Email</label>
                          <input name="email" type="email" value={f.email} onChange={handleInput} required placeholder="seu@email.com" className={inputCls} />
                        </div>
                      </div>
                    )}

                    {/* CPF + Phone */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className={labelCls}>CPF</label>
                        <input name="cpf" value={f.cpf} onChange={handleInput} required placeholder="000.000.000-00" className={inputCls} inputMode="numeric" />
                      </div>
                      <div>
                        <label className={labelCls}>Telefone</label>
                        <input name="phone" value={f.phone} onChange={handleInput} placeholder="(00) 00000-0000" className={inputCls} inputMode="numeric" />
                      </div>
                    </div>

                    {/* Separator */}
                    <div className="relative py-1">
                      <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200" /></div>
                      <div className="relative flex justify-center">
                        <span className="bg-white px-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Método de pagamento</span>
                      </div>
                    </div>

                    {/* Payment method tabs */}
                    <div className="flex rounded-xl border border-slate-200 overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setTab('card')}
                        className={`flex-1 flex items-center justify-center gap-2 py-3.5 text-sm font-bold transition-all ${tab === 'card' ? 'bg-blue-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
                      >
                        <CreditCard size={18} /> Cartão
                      </button>
                      <button
                        type="button"
                        onClick={() => setTab('pix')}
                        className={`flex-1 flex items-center justify-center gap-2 py-3.5 text-sm font-bold transition-all border-l border-slate-200 ${tab === 'pix' ? 'bg-blue-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
                      >
                        <span className="text-current"><PixIcon /></span> PIX
                      </button>
                    </div>

                    {/* Card fields */}
                    {tab === 'card' && (
                      <div className="space-y-4">
                        <div>
                          <label className={labelCls}>Número do cartão</label>
                          <div className="relative">
                            <input name="cardNumber" value={f.cardNumber} onChange={handleInput} required placeholder="0000 0000 0000 0000" className={`${inputCls} pr-16`} inputMode="numeric" autoComplete="cc-number" />
                            {CardBrandSvg && (
                              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500">
                                <CardBrandSvg />
                              </span>
                            )}
                          </div>
                        </div>

                        <div>
                          <label className={labelCls}>Nome no cartão</label>
                          <input name="cardholderName" value={f.cardholderName} onChange={handleInput} required placeholder="Como está impresso no cartão" className={inputCls} autoComplete="cc-name" />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className={labelCls}>Validade</label>
                            <input name="cardExpiry" value={f.cardExpiry} onChange={handleInput} required placeholder="MM/AA" className={inputCls} inputMode="numeric" autoComplete="cc-exp" />
                          </div>
                          <div>
                            <label className={labelCls}>CVV</label>
                            <div className="relative">
                              <input
                                name="cardCvv"
                                type={showCvv ? 'text' : 'password'}
                                value={f.cardCvv}
                                onChange={handleInput}
                                required
                                placeholder="•••"
                                className={`${inputCls} pr-10`}
                                inputMode="numeric"
                                autoComplete="cc-csc"
                              />
                              <button type="button" onClick={() => setShowCvv(!showCvv)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                                {showCvv ? <EyeOff size={16} /> : <Eye size={16} />}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* PIX info */}
                    {tab === 'pix' && (
                      <div className="rounded-xl bg-blue-50 border border-blue-200 p-5">
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0">
                            <Smartphone className="w-5 h-5 text-white" />
                          </div>
                          <div>
                            <h4 className="font-semibold text-slate-900 text-sm">Pagamento instantâneo</h4>
                            <p className="text-sm text-slate-600 mt-1">
                              Ao clicar em "Gerar PIX", você receberá um QR Code e um código para copiar e colar no app do seu banco. A confirmação é automática.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Error message */}
                  {error && (
                    <div className="mx-6 sm:mx-8 mb-4 rounded-xl bg-red-50 border border-red-200 p-4 flex items-start gap-3">
                      <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                      <p className="text-sm text-red-700">{error}</p>
                    </div>
                  )}

                  {/* Submit button */}
                  <div className="px-6 sm:px-8 pb-6 sm:pb-8">
                    <button
                      type="submit"
                      disabled={loading || (tab === 'card' ? !isCardValid : !isPersonalValid) || (!mpReady && tab === 'card')}
                      className="w-full py-4 px-6 bg-blue-600 hover:bg-blue-700 text-white font-bold text-base rounded-xl transition-all shadow-lg shadow-blue-600/20 hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {loading ? (
                        <span className="flex items-center gap-2">
                          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>
                          Processando pagamento...
                        </span>
                      ) : tab === 'card' ? (
                        <><Lock size={16} /> Assinar por R$ {plan.price.toFixed(2)}/mês</>
                      ) : (
                        <><span className="text-white"><PixIcon /></span> Gerar PIX — R$ {plan.price.toFixed(2)}</>
                      )}
                    </button>

                    <p className="text-center text-xs text-slate-400 mt-3">
                      Ao clicar, você concorda com os Termos de Serviço e Política de Privacidade
                    </p>
                  </div>
                </form>
              )}
            </div>
          </div>

          {/* ─── RIGHT: Order summary (2 cols) ─── */}
          <div className="lg:col-span-2">
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 lg:sticky lg:top-24">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center">
                  <Zap className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-slate-900 font-bold text-lg">Plano {plan.name}</h3>
                  <p className="text-slate-500 text-sm">Assinatura mensal</p>
                </div>
              </div>

              <ul className="space-y-2.5 mb-5">
                {plan.features.map((ft, i) => (
                  <li key={i} className="flex items-center gap-2.5">
                    <div className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                      <Check className="w-3 h-3 text-green-600" />
                    </div>
                    <span className="text-slate-600 text-sm">{ft}</span>
                  </li>
                ))}
              </ul>

              <div className="border-t border-slate-200 pt-5">
                <div className="flex items-baseline justify-between">
                  <span className="text-slate-500 text-sm">Total mensal</span>
                  <div>
                    <span className="text-3xl font-extrabold text-slate-900">R$ {plan.price.toFixed(2)}</span>
                    <span className="text-slate-400 text-sm ml-1">/{plan.period}</span>
                  </div>
                </div>
              </div>

              <div className="mt-5 pt-5 border-t border-slate-200">
                <p className="text-xs text-slate-400 mb-3">Formas de pagamento</p>
                <div className="flex flex-wrap items-center gap-4">
                  <span title="Mastercard"><MastercardIcon /></span>
                  <span title="Visa"><VisaIcon /></span>
                  <span title="Amex"><AmexIcon /></span>
                  <span title="PIX"><PixIcon /></span>
                </div>
              </div>

              <div className="mt-5 space-y-2.5 pt-5 border-t border-slate-200">
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <ShieldCheck className="w-4 h-4 text-slate-400" />
                  <span>Pagamento seguro</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Lock className="w-4 h-4 text-slate-400" />
                  <span>Dados protegidos</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <ShieldCheck className="w-4 h-4 text-slate-400" />
                  <span>Garantia de 7 dias</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Clock className="w-4 h-4 text-slate-400" />
                  <span>Cancele quando quiser</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-slate-200 py-6 bg-white">
        <div className="max-w-6xl mx-auto px-4 text-center">
          <p className="text-slate-400 text-sm">&copy; {new Date().getFullYear()} Elevex Tecnologia Ltda. Todos os direitos reservados.</p>
        </div>
      </footer>

      {/* Success Overlay */}
      {showSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl p-10 max-w-sm w-full mx-4 text-center shadow-2xl">
            <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-5">
              <CheckCircle size={44} className="text-green-600" />
            </div>
            <h3 className="text-2xl font-bold text-slate-900 mb-2">Pagamento Aprovado!</h3>
            <p className="text-slate-600 mb-4">Sua assinatura do Plano {plan.name} já está ativa.</p>
            <p className="text-xs text-slate-400">ID: {successPaymentId}</p>
            <p className="text-sm text-slate-500 mt-3">Redirecionando...</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default Checkout;
