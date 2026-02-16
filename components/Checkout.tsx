import React, { useState, useEffect, useRef } from 'react';
import { ShieldCheck, Lock, CreditCard, ArrowLeft, Check, Cpu, Zap, Clock, Copy, CheckCircle, AlertTriangle, Smartphone, Timer, Eye, EyeOff } from 'lucide-react';
import { Plan } from './Pricing';
import { processCardPayment, processPixPayment, verifyMercadoPagoPayment, fetchMPPublicKey } from '../services/paymentApi';
import * as Storage from '../services/storage';

/* ── Global type for MercadoPago SDK ── */
declare global {
  interface Window {
    MercadoPago: any;
  }
}

/* ── Helpers ── */

function detectCardBrand(cardNumber: string) {
  const n = cardNumber.replace(/\s/g, '');
  if (/^4/.test(n)) return { id: 'visa', label: 'Visa', color: '#1a1f71' };
  if (/^5[1-5]/.test(n) || /^2[2-7]/.test(n)) return { id: 'master', label: 'Mastercard', color: '#eb001b' };
  if (/^3[47]/.test(n)) return { id: 'amex', label: 'Amex', color: '#006fcf' };
  if (/^636368|^438935|^504175|^451416|^636297|^5067|^4576|^4011/.test(n)) return { id: 'elo', label: 'Elo', color: '#000' };
  if (/^606282|^384[1][0-6]0/.test(n)) return { id: 'hipercard', label: 'Hipercard', color: '#822124' };
  return null;
}

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

  // Form
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

  const inputCls = "w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:bg-white transition-all text-[15px]";
  const labelCls = "block text-sm font-semibold text-slate-700 mb-1.5";

  return (
    <div className="min-h-screen bg-slate-900 relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-blue-600/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-cyan-600/5 rounded-full blur-[100px]" />
      </div>

      {/* Header */}
      <header className="relative z-10 border-b border-white/10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex justify-between items-center h-16">
          <div className="flex items-center">
            <div className="bg-blue-600 p-2 rounded-lg mr-2"><Cpu className="h-5 w-5 text-white" /></div>
            <span className="text-lg font-bold text-white tracking-tight">Elevex</span>
          </div>
          <button onClick={onBack} className="text-slate-400 hover:text-white text-sm font-medium flex items-center gap-1.5 transition-colors">
            <ArrowLeft size={16} /> Voltar
          </button>
        </div>
      </header>

      {/* Steps */}
      <div className="relative z-10 flex items-center justify-center mt-8 mb-6">
        <div className="flex items-center gap-3">
          {[{ label: 'Plano', done: true }, { label: 'Cadastro', done: true }, { label: 'Pagamento', done: false }].map((s, i) => (
            <React.Fragment key={i}>
              {i > 0 && <div className={`w-10 h-px ${s.done || i <= 2 ? 'bg-blue-600' : 'bg-white/20'}`} />}
              <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${s.done ? 'bg-blue-600' : 'bg-white'}`}>
                  {s.done ? <Check className="w-4 h-4 text-white" /> : <span className="text-sm font-bold text-slate-900">{i + 1}</span>}
                </div>
                <span className={`text-sm font-medium hidden sm:inline ${s.done ? 'text-blue-400' : 'text-white font-bold'}`}>{s.label}</span>
              </div>
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Main content */}
      <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
        <div className="lg:grid lg:grid-cols-5 lg:gap-10">
          {/* ─── LEFT: Payment form (3 cols) ─── */}
          <div className="lg:col-span-3 mb-8 lg:mb-0">
            <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
              {/* Form header */}
              <div className="px-6 sm:px-8 py-5 bg-gradient-to-r from-slate-50 to-white border-b border-slate-100">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">Assinar Plano {plan.name}</h2>
                    <p className="text-slate-500 text-sm mt-0.5">Preencha seus dados para concluir</p>
                  </div>
                  <div className="flex items-center gap-1.5 text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
                    <Timer size={14} />
                    <span className="text-sm font-bold font-mono">{mins}:{secs}</span>
                  </div>
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
                      <div className="animate-pulse w-2 h-2 rounded-full bg-yellow-500" />
                      Aguardando confirmação do pagamento...
                    </div>
                  </div>
                </div>
              ) : (
                /* Normal form view */
                <form onSubmit={tab === 'card' ? handleCardPay : handlePixPay}>
                  <div className="p-6 sm:p-8 space-y-5">
                    {/* Personal info */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className={labelCls}>Nome completo</label>
                        <input name="name" value={f.name} onChange={handleInput} required placeholder="Seu nome completo" className={inputCls} readOnly={!!initialUserData?.name} />
                      </div>
                      <div>
                        <label className={labelCls}>Email</label>
                        <input name="email" type="email" value={f.email} onChange={handleInput} required placeholder="seu@email.com" className={inputCls} readOnly={!!initialUserData?.email} />
                      </div>
                    </div>
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
                        className={`flex-1 flex items-center justify-center gap-2 py-3.5 text-sm font-bold transition-all ${tab === 'card' ? 'bg-blue-600 text-white shadow-inner' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}
                      >
                        <CreditCard size={18} /> Cartão
                      </button>
                      <button
                        type="button"
                        onClick={() => setTab('pix')}
                        className={`flex-1 flex items-center justify-center gap-2 py-3.5 text-sm font-bold transition-all border-l border-slate-200 ${tab === 'pix' ? 'bg-blue-600 text-white shadow-inner' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}
                      >
                        <Smartphone size={16} /> PIX
                      </button>
                    </div>

                    {/* Card fields */}
                    {tab === 'card' && (
                      <div className="space-y-4">
                        <div>
                          <label className={labelCls}>Número do cartão</label>
                          <div className="relative">
                            <input name="cardNumber" value={f.cardNumber} onChange={handleInput} required placeholder="0000 0000 0000 0000" className={`${inputCls} pr-14`} inputMode="numeric" autoComplete="cc-number" />
                            {cardBrand && (
                              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold px-2 py-1 rounded bg-slate-100 border border-slate-200" style={{ color: cardBrand.color }}>
                                {cardBrand.label}
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
                      <div className="rounded-xl bg-cyan-50 border border-cyan-200 p-5">
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 rounded-lg bg-cyan-600 flex items-center justify-center flex-shrink-0">
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
                      className="w-full py-4 px-6 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-bold text-base rounded-xl transition-all shadow-lg shadow-blue-600/25 hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {loading ? (
                        <span className="flex items-center gap-2">
                          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>
                          Processando pagamento...
                        </span>
                      ) : tab === 'card' ? (
                        <><Lock size={16} /> Assinar por R$ {plan.price.toFixed(2)}/mês</>
                      ) : (
                        <><Smartphone size={16} /> Gerar PIX — R$ {plan.price.toFixed(2)}</>
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
            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6 lg:sticky lg:top-24">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
                  <Zap className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-white font-bold text-lg">Plano {plan.name}</h3>
                  <p className="text-slate-400 text-sm">Assinatura mensal</p>
                </div>
              </div>

              <ul className="space-y-2.5 mb-5">
                {plan.features.map((ft, i) => (
                  <li key={i} className="flex items-center gap-2.5">
                    <div className="w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
                      <Check className="w-3 h-3 text-green-400" />
                    </div>
                    <span className="text-slate-300 text-sm">{ft}</span>
                  </li>
                ))}
              </ul>

              <div className="border-t border-white/10 pt-5">
                <div className="flex items-baseline justify-between">
                  <span className="text-slate-400 text-sm">Total mensal</span>
                  <div>
                    <span className="text-3xl font-extrabold text-white">R$ {plan.price.toFixed(2)}</span>
                    <span className="text-slate-400 text-sm ml-1">/{plan.period}</span>
                  </div>
                </div>
              </div>

              <div className="mt-5 space-y-2.5 pt-5 border-t border-white/10">
                <div className="flex items-center gap-2 text-sm text-slate-400">
                  <ShieldCheck className="w-4 h-4 text-green-400" />
                  <span>Pagamento seguro</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-400">
                  <Lock className="w-4 h-4 text-slate-500" />
                  <span>Dados protegidos</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-400">
                  <ShieldCheck className="w-4 h-4 text-blue-400" />
                  <span>Garantia de 7 dias</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-400">
                  <Clock className="w-4 h-4 text-slate-500" />
                  <span>Cancele quando quiser</span>
                </div>
              </div>

              <div className="mt-5 pt-5 border-t border-white/10">
                <div className="flex items-center justify-center gap-2 text-sm">
                  <Timer size={14} className="text-amber-400" />
                  <span className="text-slate-400">Finalize em</span>
                  <span className="font-bold font-mono text-amber-400">{mins}:{secs}</span>
                </div>
              </div>

              <div className="mt-5 pt-5 border-t border-white/10">
                <p className="text-xs text-slate-500 text-center mb-3">Aceitamos</p>
                <div className="flex flex-wrap justify-center gap-2">
                  {['Visa', 'Mastercard', 'Elo', 'Amex', 'PIX'].map(m => (
                    <span key={m} className="text-[10px] font-semibold text-slate-400 bg-white/5 border border-white/10 rounded-md px-2 py-1">{m}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/10 py-6">
        <div className="max-w-6xl mx-auto px-4 text-center">
          <p className="text-slate-500 text-sm">&copy; {new Date().getFullYear()} Elevex Tecnologia Ltda. Todos os direitos reservados.</p>
        </div>
      </footer>

      {/* Success Overlay */}
      {showSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
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
