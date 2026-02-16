
import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  CreditCard, 
  User, 
  LogOut, 
  Menu, 
  X,
  Zap,
  Users,
  PieChart,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Database,
  Bot
} from 'lucide-react';
import { ChatSession, UserProfile } from '../types';
import * as Storage from '../services/storage';
import ChatSessionView from './ChatSession';
import { 
  AgentsGrid, 
  FinancialView, 
  ProfileView, 
  AdminOverview, 
  AdminUsers, 
  UsageView 
} from './DashboardViews';
import AdminDashboard from './admin/AdminDashboard';
import AgentBuilder from './AgentBuilder';

interface DashboardProps {
  onLogout: () => void;
}

type View = 'agents' | 'chat' | 'financial' | 'usage' | 'profile' | 'admin' | 'admin_brands_models' | 'admin_users' | 'agent_builder';

const Dashboard: React.FC<DashboardProps> = ({ onLogout }) => {
  const [currentView, setCurrentView] = useState<View>('agents');
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false); 
  
  const [user, setUser] = useState<UserProfile | null>(null);
  const [sessions, setSessions] = useState<ChatSession[]>([]);

  useEffect(() => {
    const profile = Storage.getUserProfile();
    if (profile) {
        setUser(profile);
    } else {
        onLogout();
    }
  }, [onLogout]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const profile = Storage.getUserProfile();
      if (profile) setUser(profile);
    }, 2000);
    return () => window.clearInterval(timer);
  }, []);

    const loadSessions = async () => {
      await Storage.syncChatsFromDatabase();
      setSessions(Storage.getSessions());
    };

  useEffect(() => {
    if (user) {
        void loadSessions();
    }
  }, [user]);

  const handleStartChat = (agentId: string) => {
    try {
        const newSession = Storage.createNewSession(agentId);
        // Refresh sessions immediately so the new one appears in the list
        void loadSessions();
        setActiveSessionId(newSession.id);
        setCurrentView('chat');
        setIsSidebarOpen(false);
    } catch (e) {
        console.error("Error creating session", e);
        onLogout();
    }
  };

  const handleOpenSession = (sessionId: string) => {
    setActiveSessionId(sessionId);
    setCurrentView('chat');
    setIsSidebarOpen(false);
  };

  const handleDeleteSession = (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    Storage.deleteSession(sessionId);
    setSessions(prev => prev.filter(s => s.id !== sessionId));
    if (activeSessionId === sessionId) {
      setCurrentView('agents');
      setActiveSessionId(null);
    }
  };

  const handleNav = (view: View) => {
    setCurrentView(view);
    if (view !== 'chat') setActiveSessionId(null);
    setIsSidebarOpen(false);
  };

  const SidebarItem = ({ view, icon: Icon, label, onClick, isAction = false }: { view?: View, icon: any, label: string, onClick?: () => void, isAction?: boolean }) => {
    const active = currentView === view && !isAction;
    return (
      <button
        onClick={onClick || (() => view && handleNav(view))}
        className={`w-full flex items-center ${isCollapsed ? 'justify-center px-2' : 'space-x-3 px-4'} py-3.5 rounded-xl transition-all duration-200 group relative overflow-hidden ${
          active 
            ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/50' 
            : isAction 
              ? 'text-red-300 hover:bg-red-500/10 hover:text-red-200'
              : 'text-slate-400 hover:bg-white/5 hover:text-white'
        }`}
        title={isCollapsed ? label : undefined}
      >
        <Icon size={20} className={`flex-shrink-0 ${active ? 'text-white' : ''}`} />
        {!isCollapsed && <span className="font-medium relative z-10 truncate">{label}</span>}
        {active && <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-100%] animate-[shimmer_2s_infinite]"></div>}
      </button>
    );
  };

  const SidebarSection = ({ title }: { title: string }) => {
      if (isCollapsed) return <div className="h-px bg-slate-800/50 my-4 mx-4"></div>;
      return <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4 px-4 mt-6 pt-2 border-t border-slate-800/50">{title}</div>;
  };

  if (!user) return null;

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden text-slate-900 font-sans">
      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar - BLUE THEME */}
      <aside className={`
        fixed md:relative z-50 h-full bg-slate-900 flex flex-col transition-all duration-300 ease-in-out border-r border-slate-800 shadow-2xl
        ${isSidebarOpen ? 'translate-x-0 w-72' : '-translate-x-full md:translate-x-0'}
        ${isCollapsed ? 'md:w-20' : 'md:w-64 lg:w-72'}
      `}>
        {/* Toggle Button (Desktop Only) */}
        <button 
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="hidden md:flex absolute -right-3 top-20 bg-blue-600 text-white rounded-full p-1 border border-slate-900 shadow-sm hover:bg-blue-700 z-50"
        >
            {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>

        <div className={`h-16 sm:h-24 flex items-center ${isCollapsed ? 'justify-center px-0' : 'px-4 sm:px-8'} border-b border-slate-800/50 flex-shrink-0 transition-all`}>
          <div className="bg-gradient-to-tr from-blue-500 to-cyan-400 p-2.5 rounded-xl shadow-[0_0_15px_rgba(59,130,246,0.5)] flex-shrink-0">
            <Zap className="h-6 w-6 text-white" fill="currentColor" />
          </div>
          {!isCollapsed && (
              <div className="ml-3 overflow-hidden">
                <span className="text-2xl font-bold tracking-tight text-white block leading-none">Elevex</span>
                <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-[0.3em] ml-0.5">Intelligence</span>
              </div>
          )}
          <button 
            className="md:hidden ml-auto text-slate-400 hover:text-white"
            onClick={() => setIsSidebarOpen(false)}
          >
            <X size={24} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-6 space-y-2 custom-scrollbar">
          {!isCollapsed && <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4 px-4">Principal</div>}
          <SidebarItem view="agents" icon={LayoutDashboard} label="Dashboard" />
          {user.isAdmin && (
            <SidebarItem view="agent_builder" icon={Bot} label="Criar Agentes" />
          )}

          <SidebarSection title="Minha Conta" />
          <SidebarItem view="financial" icon={CreditCard} label="Minha Assinatura" />
          <SidebarItem view="usage" icon={BarChart3} label="Meu Consumo" />
          <SidebarItem view="profile" icon={User} label="Meu Perfil" />

          {/* Admin Expanded Links */}
          {user.isAdmin && (
              <>
                 <SidebarSection title="Administração" />
                 <SidebarItem view="admin" icon={PieChart} label="Visão Geral" />
                 <SidebarItem view="admin_brands_models" icon={Database} label="Marcas & Agentes" />
                 <SidebarItem view="admin_users" icon={Users} label="Usuários & Planos" />
              </>
          )}
          
          <div className="pt-6 mt-6 border-t border-slate-800/50">
             <SidebarItem 
               icon={LogOut} 
               label="Sair do Sistema" 
               onClick={onLogout} 
               isAction={true}
             />
          </div>
        </nav>

        <div className={`p-4 bg-slate-950/30 border-t border-slate-800 mt-auto transition-all ${isCollapsed ? 'flex justify-center' : ''}`}>
          <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'space-x-3'} p-2 rounded-xl transition-colors hover:bg-white/5 cursor-pointer`}>
            <div className="relative flex-shrink-0">
                <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-blue-600 to-cyan-500 flex items-center justify-center text-sm font-bold text-white shadow-lg border-2 border-slate-800 overflow-hidden">
                  {user.avatar ? (
                    <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" />
                  ) : (
                    user.name.charAt(0)
                  )}
                </div>
                <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 border-2 border-slate-900 rounded-full"></div>
            </div>
            {!isCollapsed && (
                <div className="overflow-hidden flex-1">
                <p className="text-sm font-semibold truncate text-white">{user.name}</p>
                <div className="flex items-center mt-0.5">
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30 uppercase tracking-wide">
                        {user.creditsLimit === 'Infinity' ? 'ILIMITADO' : `${user.creditsUsed} / ${user.creditsLimit} CONSULTAS`}
                    </span>
                </div>
                </div>
            )}
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col h-full overflow-hidden relative w-full bg-slate-50">
        <header className="h-16 md:hidden bg-slate-900 border-b border-slate-800 flex items-center justify-between px-4 z-10 flex-shrink-0">
          <button onClick={() => setIsSidebarOpen(true)} className="text-slate-400 hover:text-white">
            <Menu size={24} />
          </button>
          <span className="font-bold text-white">Elevex</span>
          <div className="w-6" />
        </header>

        <div className="flex-1 overflow-hidden relative">
          {currentView === 'agents' && <AgentsGrid user={user} onSelectAgent={handleStartChat} />}

          {currentView === 'agent_builder' && user.isAdmin && (
            <AgentBuilder user={user} onAgentCreated={() => handleNav('agents')} />
          )}
          
          {currentView === 'chat' && activeSessionId && (
            <ChatSessionView 
              sessionId={activeSessionId} 
              onBack={() => setCurrentView('agents')}
              allSessions={sessions}
              onSelectSession={handleOpenSession}
              onCreateSession={handleStartChat}
              onSessionUpdate={loadSessions}
            />
          )}

          {currentView === 'financial' && <FinancialView user={user} />}
          {currentView === 'usage' && <UsageView user={user} />}
          {currentView === 'profile' && <ProfileView user={user} />}

          {/* Admin Views */}
          {currentView === 'admin' && user.isAdmin && <AdminOverview />}
          {currentView === 'admin_brands_models' && user.isAdmin && (
            <div className="h-full overflow-y-auto bg-slate-50">
              <AdminDashboard />
            </div>
          )}
          {currentView === 'admin_users' && user.isAdmin && <AdminUsers />}
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
