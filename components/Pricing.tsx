import React from 'react';
import { Check } from 'lucide-react';

export interface Plan {
  id: string;
  name: string;
  price: number;
  period: string;
  features: string[];
  queries: string;
  devices: string;
  popular?: boolean;
}

export const PLANS: Plan[] = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    period: 'mês',
    queries: '1 consulta a cada 24h',
    devices: '1 dispositivo',
    features: ['1 consulta a cada 24h', '1 dispositivo', 'Acesso básico'],
    popular: false
  },
  {
    id: 'iniciante',
    name: 'Iniciante',
    price: 9.99,
    period: 'mês',
    queries: '5 consultas a cada 24h',
    devices: '1 dispositivo',
    features: ['5 consultas a cada 24h', '1 dispositivo', 'Histórico de 7 dias'],
    popular: false
  },
  {
    id: 'profissional',
    name: 'Profissional',
    price: 19.99,
    period: 'mês',
    queries: 'Consultas ilimitadas',
    devices: '1 dispositivo',
    features: ['Consultas ilimitadas', '1 dispositivo', 'Suporte prioritário', 'Histórico completo'],
    popular: true
  },
  {
    id: 'empresa',
    name: 'Empresa',
    price: 99.99,
    period: 'mês',
    queries: 'Consultas ilimitadas',
    devices: 'Até 5 dispositivos',
    features: ['Consultas ilimitadas', 'Até 5 dispositivos', 'Logins simultâneos', 'Dashboard de gestão'],
    popular: false
  }
];

interface PricingProps {
  onSelectPlan: (plan: Plan) => void;
}

const Pricing: React.FC<PricingProps> = ({ onSelectPlan }) => {
  return (
    <div id='pricing' className='py-24 bg-white relative'>
      <div className='max-w-7xl mx-auto px-4 sm:px-6 lg:px-8'>
        <div className='text-center mb-16'>
          <h2 className='text-3xl font-extrabold text-slate-900'>Planos e Preços</h2>
          <p className='mt-4 text-xl text-slate-500'>Escolha o plano ideal para suas necessidades</p>
        </div>

        <div className='grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-8'>
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={`relative flex flex-col p-8 rounded-2xl border-2 transition-all ${plan.popular ? 'border-blue-600 shadow-xl shadow-blue-50 bg-white scale-[1.03]' : 'border-slate-200 bg-white hover:shadow-lg'}`}
            >
              {plan.popular && (
                <div className='absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-blue-600 text-white px-4 py-1 rounded-full text-sm font-bold uppercase tracking-wide'>
                  Mais Popular
                </div>
              )}

              <div className='mb-6'>
                <h3 className='text-lg font-semibold text-slate-900'>{plan.name}</h3>
                <div className='mt-4 flex items-baseline'>
                  <span className='text-4xl font-extrabold text-slate-900'>
                    {plan.price === 0 ? 'R$ 0' : `R$ ${plan.price.toFixed(2)}`}
                  </span>
                  <span className='ml-1 text-xl font-medium text-slate-500'>/{plan.period}</span>
                </div>
              </div>

              <ul className='flex-1 space-y-4 mb-8'>
                {plan.features.map((feature, idx) => (
                  <li key={idx} className='flex items-start'>
                    <Check className={`flex-shrink-0 h-5 w-5 ${plan.popular ? 'text-blue-600' : 'text-green-500'}`} />
                    <span className='ml-3 text-slate-600 text-sm'>{feature}</span>
                  </li>
                ))}
              </ul>

              <button
                onClick={() => onSelectPlan(plan)}
                className={`w-full py-3 px-4 rounded-full font-bold transition-all ${plan.popular ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-200' : 'bg-slate-100 text-slate-800 hover:bg-slate-200'}`}
              >
                {plan.id === 'free'
                  ? 'Começar Grátis'
                  : plan.id === 'iniciante'
                    ? 'Assinar Iniciante'
                    : plan.id === 'profissional'
                      ? 'Assinar Profissional'
                      : 'Assinar Empresa'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Pricing;
