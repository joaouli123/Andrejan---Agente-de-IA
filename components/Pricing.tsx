import React from 'react';
import { Check } from 'lucide-react';

interface PricingProps {
  onSelectPlan: () => void;
}

const Pricing: React.FC<PricingProps> = ({ onSelectPlan }) => {
  const plans = [
    {
      name: 'Free',
      price: 'R$ 0',
      period: '/mês',
      features: ['1 consulta a cada 24h', '1 dispositivo', 'Acesso básico'],
      cta: 'Começar Grátis',
      highlight: false,
      color: 'slate'
    },
    {
      name: 'Iniciante',
      price: 'R$ 9,99',
      period: '/mês',
      features: ['5 consultas a cada 24h', '1 dispositivo', 'Histórico de 7 dias'],
      cta: 'Assinar Iniciante',
      highlight: false,
      color: 'blue'
    },
    {
      name: 'Profissional',
      price: 'R$ 19,99',
      period: '/mês',
      features: ['Consultas ilimitadas', '1 dispositivo', 'Suporte prioritário', 'Histórico completo'],
      cta: 'Assinar Profissional',
      highlight: true,
      color: 'amber'
    },
    {
      name: 'Empresa',
      price: 'R$ 99,99',
      period: '/mês',
      features: ['Consultas ilimitadas', 'Até 5 dispositivos', 'Logins simultâneos', 'Dashboard de gestão'],
      cta: 'Assinar Empresa',
      highlight: false,
      color: 'slate'
    },
  ];

  return (
    <div id="pricing" className="py-24 bg-white relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-extrabold text-slate-900">Planos e Preços</h2>
          <p className="mt-4 text-xl text-slate-500">Escolha o plano ideal para suas necessidades</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-8">
          {plans.map((plan, index) => (
            <div 
              key={index} 
              className={`relative flex flex-col p-8 rounded-2xl border ${
                plan.highlight 
                  ? 'border-blue-500 shadow-2xl scale-105 z-10 bg-white' 
                  : 'border-slate-200 shadow-sm bg-slate-50 hover:shadow-lg transition-shadow'
              }`}
            >
              {plan.highlight && (
                <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-blue-600 text-white px-4 py-1 rounded-full text-sm font-bold uppercase tracking-wide">
                  Mais Popular
                </div>
              )}

              <div className="mb-6">
                <h3 className={`text-lg font-semibold text-${plan.color === 'amber' ? 'slate-900' : 'slate-900'}`}>{plan.name}</h3>
                <div className="mt-4 flex items-baseline">
                  <span className="text-4xl font-extrabold text-slate-900">{plan.price}</span>
                  <span className="ml-1 text-xl font-medium text-slate-500">{plan.period}</span>
                </div>
              </div>

              <ul className="flex-1 space-y-4 mb-8">
                {plan.features.map((feature, idx) => (
                  <li key={idx} className="flex items-start">
                    <Check className={`flex-shrink-0 h-5 w-5 ${plan.highlight ? 'text-blue-600' : 'text-slate-400'}`} />
                    <span className="ml-3 text-slate-600 text-sm">{feature}</span>
                  </li>
                ))}
              </ul>

              <button
                onClick={onSelectPlan}
                className={`w-full py-3 px-4 rounded-lg font-bold transition-colors ${
                  plan.highlight
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50'
                }`}
              >
                {plan.cta}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Pricing;