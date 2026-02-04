import React from 'react';
import { ArrowRight, Activity, Database, Smartphone } from 'lucide-react';

interface HeroProps {
  onCtaClick: () => void;
}

const Hero: React.FC<HeroProps> = ({ onCtaClick }) => {
  return (
    <section className="relative overflow-hidden bg-slate-900 pt-16 pb-20 lg:pt-24 lg:pb-28">
      {/* Background decoration */}
      <div className="absolute inset-0 opacity-20">
        <svg className="h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
           <defs>
             <pattern id="grid" width="4" height="4" patternUnits="userSpaceOnUse">
               <path d="M 4 0 L 0 0 0 4" fill="none" stroke="currentColor" strokeWidth="0.5" className="text-slate-500" />
             </pattern>
           </defs>
           <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
      </div>
      
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center lg:text-left">
        <div className="lg:grid lg:grid-cols-2 lg:gap-16 items-center">
          
          <div className="mb-12 lg:mb-0 animate-fade-in">
            <div className="inline-flex items-center px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm font-semibold mb-6">
              <Activity className="w-4 h-4 mr-2" />
              Inteligência Artificial para Transporte Vertical
            </div>
            
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white tracking-tight leading-tight mb-6">
              A Inteligência que Faltava na <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-amber-400">Casa de Máquinas</span>
            </h1>
            
            <p className="text-lg sm:text-xl text-slate-300 mb-8 leading-relaxed max-w-2xl mx-auto lg:mx-0">
              Resolva falhas de elevadores de qualquer marca ou modelo em minutos. 
              De defeitos simples a problemas complexos: a Elevex é a parceira técnica que cabe no seu bolso.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
              <button 
                onClick={onCtaClick}
                className="inline-flex items-center justify-center px-8 py-4 border border-transparent text-base font-bold rounded-lg text-white bg-blue-600 hover:bg-blue-700 transition-all shadow-lg hover:shadow-blue-500/30 transform hover:-translate-y-1"
              >
                Começar Agora
                <ArrowRight className="ml-2 h-5 w-5" />
              </button>
              <a 
                href="#pricing"
                className="inline-flex items-center justify-center px-8 py-4 border border-slate-700 text-base font-medium rounded-lg text-slate-300 bg-slate-800 hover:bg-slate-700 transition-all"
              >
                Ver Planos
              </a>
            </div>
            
            <div className="mt-10 flex items-center justify-center lg:justify-start space-x-6 text-sm text-slate-400">
               <div className="flex items-center"><Database className="w-4 h-4 mr-1.5" /> +20 anos de dados</div>
               <div className="flex items-center"><Smartphone className="w-4 h-4 mr-1.5" /> App Mobile & Web</div>
            </div>
          </div>

          <div className="relative lg:h-full flex items-center justify-center">
             <div className="relative w-full max-w-md aspect-[3/4] rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 shadow-2xl p-4 overflow-hidden transform rotate-2 hover:rotate-0 transition-transform duration-500">
                {/* Abstract UI representation of the App */}
                <div className="absolute top-0 left-0 right-0 h-14 bg-slate-800 border-b border-slate-700 flex items-center px-4">
                  <div className="w-3 h-3 rounded-full bg-red-500 mr-2"></div>
                  <div className="w-3 h-3 rounded-full bg-yellow-500 mr-2"></div>
                  <div className="w-3 h-3 rounded-full bg-green-500"></div>
                </div>
                <div className="mt-14 space-y-4">
                  <div className="bg-slate-700/50 p-4 rounded-lg border border-slate-600/50">
                    <div className="h-2 w-1/3 bg-blue-500 rounded mb-2"></div>
                    <div className="h-2 w-2/3 bg-slate-600 rounded"></div>
                  </div>
                  <div className="flex justify-end">
                     <div className="bg-blue-600/20 p-4 rounded-lg rounded-tr-none border border-blue-500/30 max-w-[80%]">
                       <p className="text-blue-200 text-xs font-mono">Erro 404: Falha no inversor de frequência. Verifique a tensão de entrada e os parâmetros de desaceleração.</p>
                     </div>
                  </div>
                  <div className="bg-slate-700/50 p-4 rounded-lg border border-slate-600/50">
                     <div className="flex items-center space-x-3">
                       <div className="w-8 h-8 rounded bg-amber-500/20 flex items-center justify-center text-amber-500"><Activity size={16}/></div>
                       <div className="space-y-1 w-full">
                         <div className="h-2 w-full bg-slate-600 rounded"></div>
                         <div className="h-2 w-5/6 bg-slate-600 rounded"></div>
                       </div>
                     </div>
                  </div>
                </div>
                {/* Glow effect */}
                <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-blue-500 blur-[80px] opacity-40"></div>
             </div>
          </div>

        </div>
      </div>
    </section>
  );
};

export default Hero;