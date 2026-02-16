import React from 'react';
import { Cpu, Menu, X } from 'lucide-react';

interface HeaderProps {
  currentView?: 'landing' | 'app';
  onNavigateHome?: () => void;
  onNavigateApp?: () => void;
  onLogin?: () => void;
}

const Header: React.FC<HeaderProps> = ({ currentView = 'landing', onNavigateHome, onNavigateApp, onLogin }) => {
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);

  return (
    <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <div className="flex items-center cursor-pointer" onClick={onNavigateHome}>
            <div className="bg-blue-600 p-2 rounded-lg mr-2">
              <Cpu className="h-6 w-6 text-white" />
            </div>
            <span className="text-xl font-bold text-slate-900 tracking-tight">Elevex</span>
          </div>

          {/* Desktop Nav */}
          <nav className="hidden md:flex space-x-8 items-center">
            {currentView === 'landing' && (
              <>
                <a href="#features" className="text-slate-600 hover:text-blue-600 font-medium transition-colors">O que é</a>
                <a href="#audience" className="text-slate-600 hover:text-blue-600 font-medium transition-colors">Para quem</a>
                <a href="#pricing" className="text-slate-600 hover:text-blue-600 font-medium transition-colors">Planos</a>
                <a href="#faq" className="text-slate-600 hover:text-blue-600 font-medium transition-colors">FAQ</a>
              </>
            )}
            {currentView === 'landing' ? (
              <>
                <button
                  onClick={onLogin}
                  className="px-5 py-2 rounded-full font-semibold transition-all border-2 border-blue-600 text-blue-600 hover:bg-blue-50"
                >
                  Entrar
                </button>
                <button
                  onClick={onNavigateApp}
                  className="px-5 py-2 rounded-full font-semibold transition-all shadow-md hover:shadow-lg bg-blue-600 text-white hover:bg-blue-700"
                >
                  Criar Conta
                </button>
              </>
            ) : (
              <button
                onClick={onNavigateHome}
                className="px-5 py-2 rounded-full font-semibold transition-all shadow-md hover:shadow-lg bg-slate-100 text-slate-700 hover:bg-slate-200"
              >
                Voltar ao Início
              </button>
            )}
          </nav>

          {/* Mobile Menu Button */}
          <div className="md:hidden flex items-center">
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="text-slate-600 hover:text-blue-600 focus:outline-none"
            >
              {isMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {isMenuOpen && (
        <div className="md:hidden bg-white border-b border-slate-200">
          <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3">
             {currentView === 'landing' && (
              <>
                <a onClick={() => setIsMenuOpen(false)} href="#features" className="block px-3 py-2 text-base font-medium text-slate-600 hover:text-blue-600 hover:bg-slate-50 rounded-md">O que é</a>
                <a onClick={() => setIsMenuOpen(false)} href="#audience" className="block px-3 py-2 text-base font-medium text-slate-600 hover:text-blue-600 hover:bg-slate-50 rounded-md">Para quem</a>
                <a onClick={() => setIsMenuOpen(false)} href="#pricing" className="block px-3 py-2 text-base font-medium text-slate-600 hover:text-blue-600 hover:bg-slate-50 rounded-md">Planos</a>
              </>
             )}
            {currentView === 'landing' ? (
              <>
                <button
                  onClick={() => {
                    onLogin?.();
                    setIsMenuOpen(false);
                  }}
                  className="w-full text-left block px-3 py-2 text-base font-bold text-blue-600 hover:bg-blue-50 rounded-md"
                >
                  Entrar
                </button>
                <button
                  onClick={() => {
                    onNavigateApp?.();
                    setIsMenuOpen(false);
                  }}
                  className="w-full text-left block px-3 py-2 text-base font-bold text-blue-600 hover:bg-blue-50 rounded-md"
                >
                  Criar Conta
                </button>
              </>
            ) : (
              <button
                onClick={() => {
                  onNavigateHome?.();
                  setIsMenuOpen(false);
                }}
                className="w-full text-left block px-3 py-2 text-base font-bold text-blue-600 hover:bg-blue-50 rounded-md"
              >
                Voltar ao Início
              </button>
            )}
          </div>
        </div>
      )}
    </header>
  );
};

export default Header;