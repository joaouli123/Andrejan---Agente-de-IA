import React from 'react';
import { Cpu, Facebook, Instagram, Linkedin, Twitter } from 'lucide-react';

interface FooterProps {
  onNavigateHome: () => void;
}

const Footer: React.FC<FooterProps> = ({ onNavigateHome }) => {
  return (
    <footer className="bg-slate-900 border-t border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          
          <div className="col-span-1 md:col-span-1">
            <div className="flex items-center cursor-pointer mb-4" onClick={onNavigateHome}>
               <div className="bg-blue-600 p-1.5 rounded mr-2">
                  <Cpu className="h-5 w-5 text-white" />
               </div>
               <span className="text-xl font-bold text-white tracking-tight">Elevex</span>
            </div>
            <p className="text-slate-400 text-sm leading-relaxed">
              A inteligência que faltava na casa de máquinas. Tecnologia para otimizar o transporte vertical.
            </p>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-200 tracking-wider uppercase mb-4">Produto</h3>
            <ul className="space-y-3">
              <li><a href="#features" className="text-slate-400 hover:text-white transition-colors text-sm">Funcionalidades</a></li>
              <li><a href="#pricing" className="text-slate-400 hover:text-white transition-colors text-sm">Planos</a></li>
              <li><a href="#faq" className="text-slate-400 hover:text-white transition-colors text-sm">FAQ</a></li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-200 tracking-wider uppercase mb-4">Legal</h3>
            <ul className="space-y-3">
              <li><a href="#" className="text-slate-400 hover:text-white transition-colors text-sm">Termos de Uso</a></li>
              <li><a href="#" className="text-slate-400 hover:text-white transition-colors text-sm">Privacidade</a></li>
              <li><a href="#" className="text-slate-400 hover:text-white transition-colors text-sm">Contato</a></li>
            </ul>
          </div>

          <div>
             <h3 className="text-sm font-semibold text-slate-200 tracking-wider uppercase mb-4">Social</h3>
             <div className="flex space-x-4">
               <a href="#" className="text-slate-400 hover:text-white transition-colors"><Instagram className="w-5 h-5"/></a>
               <a href="#" className="text-slate-400 hover:text-white transition-colors"><Linkedin className="w-5 h-5"/></a>
               <a href="#" className="text-slate-400 hover:text-white transition-colors"><Twitter className="w-5 h-5"/></a>
               <a href="#" className="text-slate-400 hover:text-white transition-colors"><Facebook className="w-5 h-5"/></a>
             </div>
          </div>

        </div>
        
        <div className="mt-12 pt-8 border-t border-slate-800 text-center">
          <p className="text-slate-500 text-sm">
            &copy; {new Date().getFullYear()} Elevex Tecnologia Ltda. Todos os direitos reservados.
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;