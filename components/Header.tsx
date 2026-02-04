import React from 'react';
import { Cpu, Menu, X } from 'lucide-react';

interface HeaderProps {
  currentView: 'landing' | 'app';
  onNavigateHome: () => void;
  onNavigateApp: () => void;
}

const Header: React.FC<HeaderProps> = ({ currentView, onNavigateHome, onNavigateApp }) => {
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
                <a href="#features" className="text-slate-600 hover:text-blue-600 font-medium transition-colors">Tecnologia</a>
                <a href="#audience" className="text-slate-600 hover:text-blue-600 font-medium transition-colors">Para Quem</a>
                <a href="#pricing" className="text-slate-600 hover:text-blue-600 font-medium transition-colors">Planos</a>
                <a href="#faq" className="text-slate-600 hover:text-blue-600 font-medium transition-colors">FAQ</a>
              </>
            )}
            <button
              onClick={currentView === 'app' ? onNavigateHome : onNavigateApp}
              className={`px-5 py-2 rounded-full font-semibold transition-all shadow-md hover:shadow-lg ${
                currentView === 'app'
                  ? 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              {currentView === 'app' ? 'Voltar ao Início' : 'Começar Agora'}
            </button>
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
                <a onClick={() => setIsMenuOpen(false)} href="#features" className="block px-3 py-2 text-base font-medium text-slate-600 hover:text-blue-600 hover:bg-slate-50 rounded-md">Tecnologia</a>
                <a onClick={() => setIsMenuOpen(false)} href="#audience" className="block px-3 py-2 text-base font-medium text-slate-600 hover:text-blue-600 hover:bg-slate-50 rounded-md">Para Quem</a>
                <a onClick={() => setIsMenuOpen(false)} href="#pricing" className="block px-3 py-2 text-base font-medium text-slate-600 hover:text-blue-600 hover:bg-slate-50 rounded-md">Planos</a>
              </>
             )}
            <button
              onClick={() => {
                if (currentView === 'app') {
                  onNavigateHome();
                } else {
                  onNavigateApp();
                }
                setIsMenuOpen(false);
              }}
              className="w-full text-left block px-3 py-2 text-base font-bold text-blue-600 hover:bg-blue-50 rounded-md"
            >
              {currentView === 'app' ? 'Voltar ao Início' : 'Acessar App'}
            </button>
          </div>
        </div>
      )}
    </header>
  );
};

export default Header;