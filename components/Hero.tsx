import React from 'react';
import { ArrowRight, Zap } from 'lucide-react';

interface HeroProps {
  onCtaClick: () => void;
  onViewPlans: () => void;
}

const Hero: React.FC<HeroProps> = ({ onCtaClick, onViewPlans }) => {
  return (
    <section className="relative bg-white pt-24 pb-20 lg:pt-32 lg:pb-28 overflow-hidden">
      {/* Subtle background glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-gradient-to-b from-blue-50/80 to-transparent rounded-full blur-3xl"></div>
      </div>

      <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        {/* Badge */}
        <div className="inline-flex items-center px-4 py-2 rounded-full bg-slate-50 border border-slate-200 text-slate-600 text-sm font-medium mb-8">
          <Zap className="w-4 h-4 mr-2 text-blue-500" />
          Inteligência Técnica Instantânea
        </div>

        {/* Title */}
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-slate-900 tracking-tight leading-[1.15] mb-6">
          A Inteligência que Faltava na{' '}
          <br className="hidden sm:block" />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-500 to-blue-600">
            Casa de Máquinas
          </span>
        </h1>

        {/* Subtitle */}
        <p className="text-lg sm:text-xl text-slate-500 mb-10 leading-relaxed max-w-2xl mx-auto">
          Resolva falhas de elevadores de qualquer marca ou modelo em minutos.
          De defeitos simples a problemas complexos: a Elevex é a parceira técnica que cabe no seu bolso.
        </p>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <button
            onClick={onCtaClick}
            className="inline-flex items-center justify-center px-8 py-4 text-base font-bold rounded-full text-white bg-blue-600 hover:bg-blue-700 transition-all shadow-lg hover:shadow-blue-500/25 transform hover:-translate-y-0.5"
          >
            Começar Agora
            <ArrowRight className="ml-2 h-5 w-5" />
          </button>
          <button
            onClick={onViewPlans}
            className="inline-flex items-center justify-center px-8 py-4 text-base font-medium rounded-full text-slate-700 bg-white border-2 border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-all"
          >
            Ver Planos
          </button>
        </div>
      </div>
    </section>
  );
};

export default Hero;