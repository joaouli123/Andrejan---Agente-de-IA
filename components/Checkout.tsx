import React, { useState } from 'react';
import { ShieldCheck, Lock, CreditCard, ArrowLeft } from 'lucide-react';
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
    <div className='min-h-screen bg-slate-50 pt-24 pb-12'>
      <div className='max-w-7xl mx-auto px-4 sm:px-6 lg:px-8'>
        <button 
          onClick={onBack}
          className='flex items-center text-slate-600 hover:text-slate-900 mb-8 transition-colors'
        >
          <ArrowLeft className='h-4 w-4 mr-2' />
          Voltar para planos
        </button>

        <div className='lg:grid lg:grid-cols-2 lg:gap-x-12 xl:gap-x-16'>
          {/* Order summary - Now Order 1 (Left) */}
          <div className='mt-10 lg:mt-0 order-1 lg:order-1 mb-8 lg:mb-0'>
            <h2 className='text-lg font-medium text-slate-900'>Resumo do pedido</h2>

            <div className='mt-4 bg-white border border-slate-200 rounded-lg shadow-sm'>
              <div className='p-6 border-b border-slate-200'>
                <div className='flex items-center justify-between'>
                  <h3 className='text-sm font-medium text-slate-900'>Plano {plan.name}</h3>
                  <p className='text-sm font-medium text-slate-900'>R$ {plan.price.toFixed(2)}</p>
                </div>
                <p className='mt-1 text-sm text-slate-500'>Faturamento {plan.period}</p>
              </div>
              
              <div className='px-6 py-4 bg-slate-50 rounded-b-lg flex items-center justify-between'>
                <span className='text-base font-medium text-slate-900'>Total hoje</span>
                <span className='text-2xl font-bold text-slate-900'>R$ {plan.price.toFixed(2)}</span>
              </div>
            </div>

            <div className='mt-6 text-sm text-slate-500'>
              <div className='flex items-center mb-2'>
                <ShieldCheck className='h-5 w-5 text-green-500 mr-2' />
                <span>Garantia de 7 dias ou seu dinheiro de volta</span>
              </div>
              <div className='flex items-center'>
                <Lock className='h-5 w-5 text-slate-400 mr-2' />
                <span>Pagamento 100% seguro e criptografado</span>
              </div>
            </div>
          </div>

          {/* Payment form - Now Order 2 (Right) */}
          <div className='order-2 lg:order-2'>
            <form onSubmit={handleSubmit} className='mt-4'>
              <div className='bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden'>
                <div className='p-6 space-y-6'>
                  <div>
                    <h3 className='text-lg font-medium text-slate-900 mb-4'>Informações de Contato</h3>
                    <div className='grid grid-cols-1 gap-6'>
                      <div>
                        <label htmlFor='name' className='block text-sm font-medium text-slate-700'>
                          Nome completo
                        </label>
                        <div className='mt-1'>
                          <input
                            type='text'
                            name='name'
                            id='name'
                            required
                            value={formData.name}
                            onChange={handleChange}
                            className='block w-full border-slate-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm p-3 border'
                            placeholder='Seu nome completo'
                            readOnly={!!initialUserData?.name} // Make readonly if coming from registration
                          />
                        </div>
                      </div>

                      <div>
                        <label htmlFor='email' className='block text-sm font-medium text-slate-700'>
                          Email
                        </label>
                        <div className='mt-1'>
                          <input
                            type='email'
                            name='email'
                            id='email'
                            required
                            value={formData.email}
                            onChange={handleChange}
                            className='block w-full border-slate-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm p-3 border'
                            placeholder='seu@email.com'
                            readOnly={!!initialUserData?.email}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className='border-t border-slate-200 pt-6'>
                    <h3 className='text-lg font-medium text-slate-900 mb-2'>Pagamento</h3>
                    <p className='text-sm text-slate-600'>Você será redirecionado para o checkout seguro do Mercado Pago para concluir a assinatura.</p>
                    <div className='mt-4 flex items-center gap-2 text-sm text-slate-500'>
                      <CreditCard className='h-4 w-4' />
                      Cartão, PIX e outros métodos disponíveis no checkout.
                    </div>
                  </div>
                </div>
                
                <div className='px-6 py-4 bg-slate-50 border-t border-slate-200'>
                  {errorMessage && (
                    <div className='mb-3 rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700'>
                      {errorMessage}
                    </div>
                  )}
                  <button
                    type='submit'
                    disabled={loading}
                    className='w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed'
                  >
                    {loading ? 'Redirecionando...' : 'Pagar com Mercado Pago'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Checkout;
