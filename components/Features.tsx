import React from 'react';
import { Database, Zap, Search, ShieldCheck, Wrench, Layers } from 'lucide-react';

const Features: React.FC = () => {
  return (
    <div id="features" className="py-24 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Main Value Prop */}
        <div className="text-center max-w-3xl mx-auto mb-20">
          <h2 className="text-base font-semibold text-blue-600 tracking-wide uppercase">Tecnologia</h2>
          <p className="mt-2 text-3xl font-extrabold text-slate-900 sm:text-4xl">
            Transforme Defeitos Complexos em{' '}
            <span className="text-blue-600">Soluções Simples</span>
          </p>
          <p className="mt-4 text-xl text-slate-500">
            A Elevex não é apenas um app; é a ferramenta definitiva para o setor de transporte vertical. Reunimos em um só lugar um banco de dados construído sobre mais de 20 anos de experiência de campo.
          </p>
        </div>

        {/* Feature Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
          <div className="bg-slate-50 rounded-2xl p-8 border border-slate-100 hover:shadow-xl transition-shadow">
            <div className="w-14 h-14 bg-blue-100 rounded-xl flex items-center justify-center mb-6">
              <Database className="w-7 h-7 text-blue-600" />
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-3">Cruza Dados</h3>
            <p className="text-slate-600 leading-relaxed">
              Nossa tecnologia cruza dados de diferentes marcas, modelos e nacionalidades para entregar o suporte exato que você precisa.
            </p>
          </div>

          <div className="bg-slate-50 rounded-2xl p-8 border border-slate-100 hover:shadow-xl transition-shadow">
             <div className="w-14 h-14 bg-amber-100 rounded-xl flex items-center justify-center mb-6">
              <Search className="w-7 h-7 text-amber-600" />
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-3">Diagnóstico Preciso</h3>
            <p className="text-slate-600 leading-relaxed">
              Identifique códigos de falha obscuros rapidamente. A Elevex decifra manuais complexos em segundos.
            </p>
          </div>

          <div className="bg-slate-50 rounded-2xl p-8 border border-slate-100 hover:shadow-xl transition-shadow">
             <div className="w-14 h-14 bg-green-100 rounded-xl flex items-center justify-center mb-6">
              <Wrench className="w-7 h-7 text-green-600" />
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-3">Guia de Reparo</h3>
            <p className="text-slate-600 leading-relaxed">
              Não apenas dizemos o problema, guiamos o reparo. Passos lógicos para resolver falhas de alta complexidade.
            </p>
          </div>
        </div>

        {/* Problem / Solution Section */}
        <div className="mt-24 lg:grid lg:grid-cols-2 lg:gap-16 items-center bg-slate-900 rounded-3xl overflow-hidden shadow-2xl">
          <div className="p-10 lg:p-16">
            <h3 className="text-2xl font-bold text-white mb-6">Por Que Escolher a Elevex?</h3>
            <blockquote className="text-slate-300 italic mb-10 border-l-4 border-amber-500 pl-4">
              "A Elevex nasceu da união entre técnicos, engenheiros e donos de conservadoras que sentiam na pele a escassez de mão de obra qualificada."
            </blockquote>
            
            <div className="space-y-8">
              <div>
                <div className="flex items-center mb-3">
                  <div className="p-2 bg-red-500/20 rounded-lg mr-3">
                    <Layers className="w-5 h-5 text-red-500" />
                  </div>
                  <h4 className="text-xl font-semibold text-white">O Problema</h4>
                </div>
                <p className="text-slate-400 pl-14">
                  Novas placas e inversores surgem todos os dias. Isso gera dependência de terceirizados caros e aumenta o tempo de elevador parado.
                </p>
              </div>

              <div>
                <div className="flex items-center mb-3">
                   <div className="p-2 bg-green-500/20 rounded-lg mr-3">
                    <ShieldCheck className="w-5 h-5 text-green-500" />
                  </div>
                  <h4 className="text-xl font-semibold text-white">A Solução</h4>
                </div>
                <p className="text-slate-400 pl-14">
                  Uma central de inteligência na palma da mão. Democratizamos o conhecimento para que sua empresa tenha autonomia e segurança.
                </p>
              </div>
            </div>
          </div>
          <div className="bg-slate-800 h-full min-h-[400px] relative flex items-center justify-center overflow-hidden">
            <img 
              src="https://images.unsplash.com/photo-1677442136019-21780ecad995?w=800&h=800&fit=crop&q=80" 
              alt="Inteligência Artificial e Tecnologia" 
              className="w-full h-full object-cover opacity-40 mix-blend-overlay"
            />
            {/* AI circuit overlay */}
            <div className="absolute inset-0 flex items-center justify-center">
              <svg viewBox="0 0 200 200" className="w-48 h-48 text-blue-400 opacity-30">
                <circle cx="100" cy="100" r="60" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="8 4"/>
                <circle cx="100" cy="100" r="40" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="4 6"/>
                <circle cx="100" cy="100" r="6" fill="currentColor" opacity="0.8"/>
                <line x1="100" y1="40" x2="100" y2="20" stroke="currentColor" strokeWidth="1.5"/>
                <circle cx="100" cy="16" r="4" fill="currentColor" opacity="0.6"/>
                <line x1="100" y1="160" x2="100" y2="180" stroke="currentColor" strokeWidth="1.5"/>
                <circle cx="100" cy="184" r="4" fill="currentColor" opacity="0.6"/>
                <line x1="40" y1="100" x2="20" y2="100" stroke="currentColor" strokeWidth="1.5"/>
                <circle cx="16" cy="100" r="4" fill="currentColor" opacity="0.6"/>
                <line x1="160" y1="100" x2="180" y2="100" stroke="currentColor" strokeWidth="1.5"/>
                <circle cx="184" cy="100" r="4" fill="currentColor" opacity="0.6"/>
                <line x1="58" y1="58" x2="40" y2="40" stroke="currentColor" strokeWidth="1"/>
                <circle cx="36" cy="36" r="3" fill="currentColor" opacity="0.5"/>
                <line x1="142" y1="58" x2="160" y2="40" stroke="currentColor" strokeWidth="1"/>
                <circle cx="164" cy="36" r="3" fill="currentColor" opacity="0.5"/>
                <line x1="58" y1="142" x2="40" y2="160" stroke="currentColor" strokeWidth="1"/>
                <circle cx="36" cy="164" r="3" fill="currentColor" opacity="0.5"/>
                <line x1="142" y1="142" x2="160" y2="160" stroke="currentColor" strokeWidth="1"/>
                <circle cx="164" cy="164" r="3" fill="currentColor" opacity="0.5"/>
              </svg>
            </div>
            <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/40 to-transparent"></div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default Features;