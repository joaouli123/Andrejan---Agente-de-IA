
import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  History, 
  CreditCard, 
  User, 
  LogOut, 
  Menu, 
  X,
  Zap,
  Bot,
  Users,
  TrendingUp,
  PieChart,
  BarChart3,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { ChatSession, UserProfile } from '../types';
import * as Storage from '../services/storage';
import ChatSessionView from './ChatSession';
import AgentBuilder from './AgentBuilder';
import { 
  AgentsGrid, 
  HistoryView, 
  FinancialView, 
  ProfileView, 
  AdminOverview, 
  AdminUsers, 
  AdminFinance, 
  UsageView 
} from './DashboardViews';

interface DashboardProps {
  onLogout: () => void;
}

type View = 'agents' | 'chat' | 'history' | 'financial' | 'usage' | 'builder' | 'profile' | 'admin' | 'admin_users' | 'admin_finance';

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

  const loadSessions = () => {
      setSessions(Storage.getSessions());
  };

  useEffect(() => {
    if (user) {
        loadSessions();
    }
  }, [currentView, activeSessionId, user]);

  const handleStartChat = (agentId: string) => {
    try {
        const newSession = Storage.createNewSession(agentId);
        // Refresh sessions immediately so the new one appears in the list
        setSessions(Storage.getSessions());
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
        ${isCollapsed ? 'md:w-20' : 'md:w-72'}
      `}>
        {/* Toggle Button (Desktop Only) */}
        <button 
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="hidden md:flex absolute -right-3 top-20 bg-blue-600 text-white rounded-full p-1 border border-slate-900 shadow-sm hover:bg-blue-700 z-50"
        >
            {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>

        <div className={`h-24 flex items-center ${isCollapsed ? 'justify-center px-0' : 'px-8'} border-b border-slate-800/50 flex-shrink-0 transition-all`}>
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
          <SidebarItem view="history" icon={History} label="Histórico" />
          
          {user.isAdmin && (
             <SidebarItem view="builder" icon={Bot} label="Criar Agentes" />
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
                 <SidebarItem view="admin_users" icon={Users} label="Base de Usuários" />
                 <SidebarItem view="admin_finance" icon={TrendingUp} label="Receita & Planos" />
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
                <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-blue-600 to-cyan-500 flex items-center justify-center text-sm font-bold text-white shadow-lg border-2 border-slate-800">
                {user.name.charAt(0)}
                </div>
                <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 border-2 border-slate-900 rounded-full"></div>
            </div>
            {!isCollapsed && (
                <div className="overflow-hidden flex-1">
                <p className="text-sm font-semibold truncate text-white">{user.name}</p>
                <div className="flex items-center mt-0.5">
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30 uppercase tracking-wide">
                        {user.plan}
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

          {currentView === 'history' && (
            <HistoryView 
              sessions={sessions} 
              onSelectSession={handleOpenSession}
              onDeleteSession={handleDeleteSession}
            />
          )}

          {currentView === 'builder' && user.isAdmin && (
             <AgentBuilder user={user} onAgentCreated={() => console.log('created')} />
          )}

          {currentView === 'financial' && <FinancialView user={user} />}
          {currentView === 'usage' && <UsageView user={user} />}
          {currentView === 'profile' && <ProfileView user={user} />}

          {/* Separate Admin Views */}
          {currentView === 'admin' && user.isAdmin && <AdminOverview />}
          {currentView === 'admin_users' && user.isAdmin && <AdminUsers />}
          {currentView === 'admin_finance' && user.isAdmin && <AdminFinance />}
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
