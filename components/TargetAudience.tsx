import React from 'react';
import { Briefcase, Award, TrendingUp, DollarSign, Clock, Lock, ShieldCheck } from 'lucide-react';

const TargetAudience: React.FC = () => {
  return (
    <div id="audience" className="py-24 bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-extrabold text-slate-900">Para Quem é a Elevex?</h2>
          <p className="mt-4 text-xl text-slate-500">Soluções personalizadas para cada perfil do setor</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          
          {/* Owners */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 hover:shadow-lg transition-all duration-300 transform hover:-translate-y-1">
            <div className="flex items-center justify-center w-12 h-12 bg-blue-100 text-blue-600 rounded-lg mb-6">
              <Briefcase className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-4">Donos de Empresas</h3>
            <ul className="space-y-4">
              <li className="flex items-start">
                <DollarSign className="w-5 h-5 text-green-500 mt-1 mr-2 flex-shrink-0" />
                <div>
                  <span className="font-semibold text-slate-800 block">Redução de Custos</span>
                  <span className="text-sm text-slate-500">Corte gastos com terceirização especializada.</span>
                </div>
              </li>
              <li className="flex items-start">
                <Clock className="w-5 h-5 text-blue-500 mt-1 mr-2 flex-shrink-0" />
                <div>
                  <span className="font-semibold text-slate-800 block">Eficiência</span>
                  <span className="text-sm text-slate-500">Diminua o tempo de atendimento dos chamados.</span>
                </div>
              </li>
              <li className="flex items-start">
                <Lock className="w-5 h-5 text-amber-500 mt-1 mr-2 flex-shrink-0" />
                <div>
                  <span className="font-semibold text-slate-800 block">Autonomia</span>
                  <span className="text-sm text-slate-500">Capacite sua equipe interna.</span>
                </div>
              </li>
            </ul>
          </div>

          {/* Experienced Techs */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 hover:shadow-lg transition-all duration-300 transform hover:-translate-y-1">
             <div className="flex items-center justify-center w-12 h-12 bg-amber-100 text-amber-600 rounded-lg mb-6">
              <Award className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-4">Técnicos Experientes</h3>
             <ul className="space-y-4">
              <li className="flex items-start">
                <TrendingUp className="w-5 h-5 text-blue-500 mt-1 mr-2 flex-shrink-0" />
                <div>
                  <span className="font-semibold text-slate-800 block">Atualização</span>
                  <span className="text-sm text-slate-500">Suporte para marcas novas e modelos importados.</span>
                </div>
              </li>
              <li className="flex items-start">
                <Clock className="w-5 h-5 text-green-500 mt-1 mr-2 flex-shrink-0" />
                <div>
                  <span className="font-semibold text-slate-800 block">Agilidade</span>
                  <span className="text-sm text-slate-500">Diagnostique falhas raras rapidamente.</span>
                </div>
              </li>
               <li className="flex items-start">
                <Award className="w-5 h-5 text-amber-500 mt-1 mr-2 flex-shrink-0" />
                <div>
                  <span className="font-semibold text-slate-800 block">Especialize-se</span>
                  <span className="text-sm text-slate-500">Torne-se a referência técnica da sua região.</span>
                </div>
              </li>
            </ul>
          </div>

          {/* Beginners */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 hover:shadow-lg transition-all duration-300 transform hover:-translate-y-1">
             <div className="flex items-center justify-center w-12 h-12 bg-green-100 text-green-600 rounded-lg mb-6">
              <TrendingUp className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-4">Técnicos Iniciantes</h3>
             <ul className="space-y-4">
              <li className="flex items-start">
                <TrendingUp className="w-5 h-5 text-amber-500 mt-1 mr-2 flex-shrink-0" />
                <div>
                  <span className="font-semibold text-slate-800 block">Acelerador</span>
                  <span className="text-sm text-slate-500">Funciona como um mentor digital no bolso.</span>
                </div>
              </li>
               <li className="flex items-start">
                <ShieldCheck className="w-5 h-5 text-blue-500 mt-1 mr-2 flex-shrink-0" />
                <div>
                  <span className="font-semibold text-slate-800 block">Segurança</span>
                  <span className="text-sm text-slate-500">Tenha confiança para atender chamados.</span>
                </div>
              </li>
               <li className="flex items-start">
                <DollarSign className="w-5 h-5 text-green-500 mt-1 mr-2 flex-shrink-0" />
                <div>
                  <span className="font-semibold text-slate-800 block">Reconhecimento</span>
                  <span className="text-sm text-slate-500">Aumente taxa de sucesso e conquiste melhores salários.</span>
                </div>
              </li>
            </ul>
          </div>

        </div>
      </div>
    </div>
  );
};

export default TargetAudience;