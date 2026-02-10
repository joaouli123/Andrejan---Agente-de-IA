
import React, { useState, useEffect } from 'react';
import { Zap, ShieldCheck, User, Lock, ArrowRight, Cpu, ArrowLeft } from 'lucide-react';
import * as Storage from '../services/storage';

interface AuthProps {
  onLoginSuccess: () => void;
  onBack: () => void;
}

const Auth: React.FC<AuthProps> = ({ onLoginSuccess, onBack }) => {
  const [role, setRole] = useState<'user' | 'admin'>('user');
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Auto-fill demo credentials
  useEffect(() => {
    if (role === 'admin') {
      setEmail('admin@elevex.com');
      setPassword('admin123');
    } else {
      setEmail('carlos@tecnico.com');
      setPassword('123456');
    }
  }, [role]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    // Simulating API Call
    setTimeout(() => {
        Storage.login(role);
        setIsLoading(false);
        onLoginSuccess();
    }, 800);
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0">
          <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/20 rounded-full blur-[100px]"></div>
          <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-cyan-500/10 rounded-full blur-[100px]"></div>
      </div>

      {/* Header */}
      <header className="relative z-10 border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center cursor-pointer" onClick={onBack}>
              <div className="bg-blue-600 p-2 rounded-lg mr-2">
                <Cpu className="h-5 w-5 text-white" />
              </div>
              <span className="text-lg font-bold text-white tracking-tight">Elevex</span>
            </div>
            <button 
              onClick={onBack} 
              className="text-slate-400 hover:text-white text-sm font-medium flex items-center gap-1.5 transition-colors"
            >
              <ArrowLeft size={16} /> Voltar
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center p-4 relative z-10">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden animate-fade-in">
        <div className="p-8 text-center bg-slate-50 border-b border-slate-100">
             <div className="flex justify-center mb-4">
                 <div className="bg-gradient-to-tr from-blue-600 to-cyan-500 p-3 rounded-2xl shadow-lg">
                    <Zap className="h-8 w-8 text-white" fill="currentColor" />
                 </div>
             </div>
             <h2 className="text-2xl font-bold text-slate-900">Bem-vindo ao Elevex</h2>
             <p className="text-slate-500 mt-2 text-sm">Acesse sua central de inteligência técnica</p>
        </div>

        {/* Role Toggles */}
        <div className="flex border-b border-slate-100">
            <button 
                onClick={() => setRole('user')}
                className={`flex-1 py-4 text-sm font-semibold flex items-center justify-center gap-2 transition-colors relative ${role === 'user' ? 'text-blue-600 bg-white' : 'text-slate-400 bg-slate-50 hover:bg-slate-100'}`}
            >
                <User size={18} />
                Técnico
                {role === 'user' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600"></div>}
            </button>
            <button 
                onClick={() => setRole('admin')}
                className={`flex-1 py-4 text-sm font-semibold flex items-center justify-center gap-2 transition-colors relative ${role === 'admin' ? 'text-blue-600 bg-white' : 'text-slate-400 bg-slate-50 hover:bg-slate-100'}`}
            >
                <ShieldCheck size={18} />
                Administrador
                {role === 'admin' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600"></div>}
            </button>
        </div>

        <div className="p-8">
            <form onSubmit={handleLogin} className="space-y-5">
                <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Email Corporativo</label>
                    <div className="relative">
                        <User className="absolute left-3 top-3.5 text-slate-400" size={18} />
                        <input 
                            type="email" 
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-slate-800"
                            placeholder={role === 'admin' ? 'admin@elevex.com' : 'tecnico@empresa.com'}
                        />
                    </div>
                </div>

                <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Senha</label>
                    <div className="relative">
                        <Lock className="absolute left-3 top-3.5 text-slate-400" size={18} />
                        <input 
                            type="password" 
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-slate-800"
                            placeholder="••••••••"
                        />
                    </div>
                </div>

                <div className="pt-2">
                    <button 
                        type="submit" 
                        disabled={isLoading}
                        className={`w-full py-4 rounded-xl font-bold text-white flex items-center justify-center gap-2 transition-all transform hover:scale-[1.02] active:scale-[0.98] ${role === 'admin' ? 'bg-slate-900 hover:bg-slate-800' : 'bg-blue-600 hover:bg-blue-700'}`}
                    >
                        {isLoading ? (
                            <span className="animate-pulse">Acessando...</span>
                        ) : (
                            <>Entrar no Sistema <ArrowRight size={18} /></>
                        )}
                    </button>
                </div>
            </form>

            <div className="mt-6 text-center">
                <button onClick={onBack} className="text-sm text-slate-400 hover:text-slate-600 underline">
                    Voltar para a página inicial
                </button>
            </div>
        </div>
        
        {/* Footer info for Demo */}
        <div className="bg-slate-50 p-3 text-center border-t border-slate-100">
            <p className="text-xs text-slate-400">
                <span className="font-bold">Dica:</span> Use qualquer email/senha para testar o acesso {role === 'user' ? 'Técnico' : 'Admin'}.
            </p>
        </div>
      </div>
      </div>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/10 py-6 mt-auto">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <p className="text-slate-500 text-sm">
            &copy; {new Date().getFullYear()} Elevex Tecnologia Ltda. Todos os direitos reservados.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Auth;
