import React, { useState } from 'react';
import { ShieldCheck, Lock, CreditCard, ArrowLeft, Check, Cpu, Zap, Clock, Users } from 'lucide-react';
import { Plan } from './Pricing';
import { createMercadoPagoPreference } from '../services/paymentApi';
import * as Storage from '../services/storage';

interface CheckoutProps {
  plan: Plan;
  onBack: () => void;
  initialUserData?: {
    name: string;
    email: string;
  };
}

const Checkout: React.FC<CheckoutProps> = ({ plan, onBack, initialUserData }) => {
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [formData, setFormData] = useState({
    name: initialUserData?.name || '',
    email: initialUserData?.email || '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setLoading(true);
    try {
      const currentUser = Storage.getUserProfile();
      const pref = await createMercadoPagoPreference({
        planId: plan.id,
        payerName: formData.name,
        payerEmail: formData.email,
        userId: currentUser?.id,
      });

      const checkoutUrl = pref.initPoint || pref.sandboxInitPoint;
      if (!checkoutUrl) throw new Error('URL de checkout não retornada pelo Mercado Pago');

      window.location.href = checkoutUrl;
    } catch (error: any) {
      setErrorMessage(error?.message || 'Não foi possível iniciar o pagamento agora.');
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  return (
    <div className='min-h-screen bg-slate-900 relative overflow-hidden'>
      {/* Background glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-blue-600/10 rounded-full blur-[120px]"></div>
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-cyan-600/5 rounded-full blur-[100px]"></div>
      </div>

      {/* Header */}
      <header className="relative z-10 border-b border-white/10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <div className="bg-blue-600 p-2 rounded-lg mr-2">
                <Cpu className="h-5 w-5 text-white" />
              </div>
              <span className="text-lg font-bold text-white tracking-tight">Elevex</span>
            </div>
            <button 
              onClick={onBack} 
              className="text-slate-400 hover:text-white text-sm font-medium flex items-center gap-1.5 transition-colors"
            >
              <ArrowLeft size={16} /> Voltar
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16">
        {/* Steps indicator */}
        <div className="flex items-center justify-center mb-12">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center">
                <Check className="w-4 h-4 text-white" />
              </div>
              <span className="text-sm font-medium text-blue-400 hidden sm:inline">Plano</span>
            </div>
            <div className="w-12 h-px bg-blue-600"></div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center">
                <Check className="w-4 h-4 text-white" />
              </div>
              <span className="text-sm font-medium text-blue-400 hidden sm:inline">Cadastro</span>
            </div>
            <div className="w-12 h-px bg-blue-600"></div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center">
                <span className="text-sm font-bold text-slate-900">3</span>
              </div>
              <span className="text-sm font-bold text-white hidden sm:inline">Pagamento</span>
            </div>
          </div>
        </div>

        <div className="lg:grid lg:grid-cols-5 lg:gap-12">
          {/* LEFT: Plan summary card (2 cols) */}
          <div className="lg:col-span-2 mb-8 lg:mb-0">
            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6 lg:sticky lg:top-24">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
                  <Zap className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-white font-bold text-lg">Plano {plan.name}</h3>
                  <p className="text-slate-400 text-sm">Assinatura mensal</p>
                </div>
              </div>

              <ul className="space-y-3 mb-6">
                {plan.features.map((feature, idx) => (
                  <li key={idx} className="flex items-center gap-2.5">
                    <div className="w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
                      <Check className="w-3 h-3 text-green-400" />
                    </div>
                    <span className="text-slate-300 text-sm">{feature}</span>
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

              {/* Trust badges */}
              <div className="mt-6 space-y-3 pt-5 border-t border-white/10">
                <div className="flex items-center gap-2 text-sm text-slate-400">
                  <ShieldCheck className="w-4 h-4 text-green-400" />
                  <span>Garantia de 7 dias</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-400">
                  <Lock className="w-4 h-4 text-slate-500" />
                  <span>Pagamento 100% seguro</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-400">
                  <Clock className="w-4 h-4 text-slate-500" />
                  <span>Cancele quando quiser</span>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT: Payment form (3 cols) */}
          <div className="lg:col-span-3">
            <form onSubmit={handleSubmit}>
              <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
                {/* Form header */}
                <div className="px-8 py-6 bg-slate-50 border-b border-slate-200">
                  <h2 className="text-xl font-bold text-slate-900">Finalizar assinatura</h2>
                  <p className="text-slate-500 text-sm mt-1">Preencha seus dados para continuar</p>
                </div>

                <div className="p-8 space-y-6">
                  {/* Name */}
                  <div>
                    <label htmlFor='name' className="block text-sm font-semibold text-slate-700 mb-2">
                      Nome completo
                    </label>
                    <input
                      type='text'
                      name='name'
                      id='name'
                      required
                      value={formData.name}
                      onChange={handleChange}
                      readOnly={!!initialUserData?.name}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:bg-white transition-all"
                      placeholder='Seu nome completo'
                    />
                  </div>

                  {/* Email */}
                  <div>
                    <label htmlFor='email' className="block text-sm font-semibold text-slate-700 mb-2">
                      Email
                    </label>
                    <input
                      type='email'
                      name='email'
                      id='email'
                      required
                      value={formData.email}
                      onChange={handleChange}
                      readOnly={!!initialUserData?.email}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:bg-white transition-all"
                      placeholder='seu@email.com'
                    />
                  </div>

                  {/* Payment info */}
                  <div className="rounded-xl bg-blue-50 border border-blue-100 p-5">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <CreditCard className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <h4 className="font-semibold text-slate-900 text-sm">Checkout Seguro</h4>
                        <p className="text-sm text-slate-600 mt-1">
                          Você será redirecionado para o Mercado Pago para concluir o pagamento com total segurança.
                        </p>
                        <div className="flex flex-wrap gap-2 mt-3">
                          {['Cartão de Crédito', 'PIX', 'Boleto'].map((method) => (
                            <span key={method} className="inline-flex items-center px-2.5 py-1 rounded-md bg-white border border-slate-200 text-xs font-medium text-slate-600">
                              {method}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Submit */}
                <div className="px-8 pb-8">
                  {errorMessage && (
                    <div className="mb-4 rounded-xl bg-red-50 border border-red-200 p-4 flex items-start gap-3">
                      <div className="w-5 h-5 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-red-600 text-xs font-bold">!</span>
                      </div>
                      <p className="text-sm text-red-700">{errorMessage}</p>
                    </div>
                  )}
                  <button
                    type='submit'
                    disabled={loading}
                    className="w-full py-4 px-6 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-bold text-base rounded-xl transition-all shadow-lg shadow-blue-600/25 hover:shadow-xl hover:shadow-blue-600/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {loading ? (
                      <span className="flex items-center gap-2">
                        <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Redirecionando para Mercado Pago...
                      </span>
                    ) : (
                      <>
                        <Lock className="w-4 h-4" />
                        Pagar R$ {plan.price.toFixed(2)} com Mercado Pago
                      </>
                    )}
                  </button>
                  <p className="text-center text-xs text-slate-400 mt-4">
                    Ao clicar, você concorda com os Termos de Serviço e Política de Privacidade
                  </p>
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/10 py-6 mt-auto">
        <div className="max-w-6xl mx-auto px-4 text-center">
          <p className="text-slate-500 text-sm">
            &copy; {new Date().getFullYear()} Elevex Tecnologia Ltda. Todos os direitos reservados.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Checkout;
