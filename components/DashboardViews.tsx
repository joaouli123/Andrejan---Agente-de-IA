
import React, { useState, useEffect } from 'react';
import { DEFAULT_AGENTS, ChatSession, UserProfile, Agent } from '../types';
import * as Icons from 'lucide-react';
import { 
    Trash2, MessageSquare, Clock, ArrowRight, Shield, CreditCard, 
    Download, Zap, CheckCircle2, Edit2, Archive, MoreVertical, 
    X, Check, AlertCircle, Users, TrendingUp, DollarSign, Activity, Calendar,
    PieChart, BrainCircuit, Rocket, ChevronDown, ChevronRight
} from 'lucide-react';
import * as Storage from '../services/storage';

// --- AGENT CARD COMPONENT ---
interface AgentCardProps {
    agent: Agent;
    onSelect: (id: string) => void;
}

const AgentCard: React.FC<AgentCardProps> = ({ agent, onSelect }) => {
    // @ts-ignore
    const IconComponent = Icons[agent.icon] || Icons.HelpCircle;
    const isPrimary = agent.id === 'general-tech';

    return (
        <div 
            onClick={() => onSelect(agent.id)}
            className="bg-white rounded-2xl p-8 border border-slate-200 shadow-sm hover:shadow-xl hover:border-blue-300 cursor-pointer transition-all duration-300 group relative overflow-hidden h-64 flex flex-col"
        >
            <div className="absolute -right-6 -top-6 text-blue-50 group-hover:text-blue-100/80 transition-colors duration-500 opacity-80">
                <IconComponent size={140} className="opacity-100" />
            </div>

            <div className="flex items-start justify-between mb-4 relative z-10">
                <div className={`p-4 rounded-xl shadow-sm transition-colors ${
                    isPrimary 
                    ? 'bg-blue-600 text-white shadow-blue-200' 
                    : agent.isCustom 
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-500 group-hover:bg-blue-600 group-hover:text-white'
                }`}>
                    <IconComponent size={28} />
                </div>
                {agent.isCustom && (
                    <span className="bg-slate-100 text-slate-500 text-[10px] font-bold px-2 py-1 rounded-full uppercase">Especialista</span>
                )}
            </div>
            
            <div className="relative z-10 flex-1">
                <h3 className="text-xl font-bold text-slate-900 mb-1 group-hover:text-blue-700 transition-colors">{agent.name}</h3>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">{agent.role}</p>
                <p className="text-slate-600 leading-relaxed pr-8 text-sm line-clamp-3">{agent.description}</p>
            </div>

            <div className="absolute bottom-8 right-8 z-10">
                <div className="w-10 h-10 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-all shadow-sm">
                    <ArrowRight size={18} />
                </div>
            </div>
        </div>
    );
};

// --- AGENTS GRID ---
export const AgentsGrid: React.FC<{ user: UserProfile, onSelectAgent: (id: string) => void }> = ({ user, onSelectAgent }) => {
  const [agents, setAgents] = useState<Agent[]>([]);

  useEffect(() => {
      setAgents(Storage.getAgents());
  }, []);

  const systemAgents = agents.filter(a => !a.isCustom);
  const customAgents = agents.filter(a => a.isCustom);

  return (
    <div className="h-full overflow-y-auto p-6 lg:p-12 custom-scrollbar bg-slate-50">
      <div className="max-w-6xl mx-auto">
        <div className="mb-10 animate-fade-in">
          <h1 className="text-3xl font-extrabold text-slate-900 flex items-center gap-3">
             <span className="p-2 bg-blue-100 text-blue-600 rounded-xl">
                <Zap className="fill-current w-6 h-6" />
             </span>
             Bem vindo, {user.name.split(' ')[0]}
          </h1>
          <p className="text-slate-500 mt-2 text-lg max-w-2xl">Central de Diagnóstico: Selecione o módulo especializado para iniciar o atendimento.</p>
        </div>

        {/* System Agents */}
        <div className="mb-12">
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center">
                <BrainCircuit className="w-4 h-4 mr-2" /> Módulos Nativos do Sistema
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
                {systemAgents.map(agent => <AgentCard key={agent.id} agent={agent} onSelect={onSelectAgent} />)}
            </div>
        </div>

        {/* Custom Agents (Created by Admin) */}
        {customAgents.length > 0 && (
            <div className="mb-12">
                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center">
                    <Rocket className="w-4 h-4 mr-2" /> Especialistas da Empresa
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
                    {customAgents.map(agent => <AgentCard key={agent.id} agent={agent} onSelect={onSelectAgent} />)}
                </div>
            </div>
        )}
      </div>
    </div>
  );
};

// --- HISTORY VIEW ---
export const HistoryView: React.FC<{ 
  sessions: ChatSession[], 
  onSelectSession: (id: string) => void,
  onDeleteSession: (id: string, e: React.MouseEvent) => void 
}> = ({ sessions, onSelectSession, onDeleteSession }) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [localSessions, setLocalSessions] = useState(sessions);
  
  // Collapse state for agent groups
  const [collapsedGroups, setCollapsedGroups] = useState<{[key: string]: boolean}>({});

  useEffect(() => {
     const allSessions = Storage.getSessions(true);
     setLocalSessions(allSessions.filter(s => showArchived ? s.isArchived : !s.isArchived));
     setAgents(Storage.getAgents());
  }, [sessions, showArchived]);

  const toggleGroup = (agentId: string) => {
      setCollapsedGroups(prev => ({...prev, [agentId]: !prev[agentId]}));
  };

  const handleRename = (e: React.FormEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (editTitle.trim()) {
      Storage.renameSession(id, editTitle);
      setEditingId(null);
      const allSessions = Storage.getSessions(true);
      setLocalSessions(allSessions.filter(s => showArchived ? s.isArchived : !s.isArchived));
    }
  };

  const startRename = (e: React.MouseEvent, session: ChatSession) => {
    e.stopPropagation();
    setEditTitle(session.title);
    setEditingId(session.id);
    setActiveMenuId(null);
  };

  const handleArchive = (e: React.MouseEvent, id: string, archive: boolean) => {
    e.stopPropagation();
    Storage.archiveSession(id, archive);
    setActiveMenuId(null);
    const allSessions = Storage.getSessions(true);
    setLocalSessions(allSessions.filter(s => showArchived ? s.isArchived : !s.isArchived));
  };

  // Group sessions by agent
  const groupedSessions = localSessions.reduce((acc, session) => {
      if (!acc[session.agentId]) {
          acc[session.agentId] = [];
      }
      acc[session.agentId].push(session);
      return acc;
  }, {} as {[key: string]: ChatSession[]});

  return (
    <div className="h-full overflow-y-auto p-6 lg:p-12 bg-slate-50">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-8">
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
                <span className="p-1.5 bg-white border border-slate-200 rounded-lg shadow-sm"><Clock className="text-slate-600" size={24} /></span>
                {showArchived ? 'Histórico Arquivado' : 'Histórico de Diagnósticos'}
            </h1>
            <button 
                onClick={() => setShowArchived(!showArchived)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${showArchived ? 'bg-blue-100 text-blue-700' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
            >
                <Archive size={16} />
                {showArchived ? 'Ver Ativos' : 'Ver Arquivados'}
            </button>
        </div>
        
        {localSessions.length === 0 ? (
          <div className="text-center py-24 bg-white rounded-2xl border border-slate-200 border-dashed">
            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                {showArchived ? <Archive className="h-8 w-8 text-slate-300" /> : <MessageSquare className="h-8 w-8 text-slate-300" />}
            </div>
            <h3 className="text-lg font-semibold text-slate-900">{showArchived ? 'Nenhum item arquivado' : 'Nenhum histórico encontrado'}</h3>
            <p className="text-slate-500 max-w-sm mx-auto mt-2">
                {showArchived ? 'Você ainda não arquivou nenhuma conversa.' : 'Inicie uma conversa com um dos agentes para que seus diagnósticos fiquem salvos aqui.'}
            </p>
          </div>
        ) : (
          <div className="space-y-6 pb-20">
             {/* Iterate through known agents to maintain order/metadata, then unknown ones if any */}
             {[...agents, {id: 'unknown', name: 'Outros', icon: 'HelpCircle'}].map(agent => {
                 const sessionsForAgent = groupedSessions[agent.id] || (agent.id === 'unknown' ? Object.keys(groupedSessions).filter(k => !agents.find(a => a.id === k)).flatMap(k => groupedSessions[k]) : []);
                 if (!sessionsForAgent || sessionsForAgent.length === 0) return null;

                 // @ts-ignore
                 const AgentIcon = Icons[agent.icon] || Icons.HelpCircle;
                 const isCollapsed = collapsedGroups[agent.id];

                 return (
                     <div key={agent.id} className="animate-fade-in">
                         <div 
                            onClick={() => toggleGroup(agent.id)}
                            className="flex items-center gap-3 mb-3 cursor-pointer select-none group"
                         >
                             <div className={`p-1.5 rounded-lg ${agent.id === 'unknown' ? 'bg-slate-100' : 'bg-white border border-slate-200'} text-slate-500 group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors`}>
                                 {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                             </div>
                             <div className="flex items-center gap-2">
                                <AgentIcon size={18} className="text-slate-400" />
                                <h3 className="font-bold text-slate-700 text-sm uppercase tracking-wide">{agent.name}</h3>
                                <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-medium">{sessionsForAgent.length}</span>
                             </div>
                         </div>
                         
                         {!isCollapsed && (
                             <div className="space-y-3 pl-2 border-l-2 border-slate-100 ml-4">
                                {sessionsForAgent.map(session => (
                                    <div 
                                    key={session.id}
                                    onClick={() => onSelectSession(session.id)}
                                    className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-blue-300 cursor-pointer transition-all flex justify-between items-center group/item relative ml-4"
                                    >
                                    <div className="flex-1 min-w-0">
                                        {editingId === session.id ? (
                                            <form onSubmit={(e) => handleRename(e, session.id)} className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                                                <input 
                                                    autoFocus
                                                    type="text" 
                                                    value={editTitle} 
                                                    onChange={e => setEditTitle(e.target.value)}
                                                    className="border border-blue-400 rounded px-2 py-1 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-200"
                                                />
                                                <button type="submit" className="text-green-600 hover:bg-green-50 p-1 rounded"><Check size={16}/></button>
                                                <button type="button" onClick={() => setEditingId(null)} className="text-red-500 hover:bg-red-50 p-1 rounded"><X size={16}/></button>
                                            </form>
                                        ) : (
                                            <>
                                                <h4 className="font-semibold text-slate-900 truncate group-hover/item:text-blue-700 transition-colors text-sm">{session.title}</h4>
                                                <p className="text-xs text-slate-500 truncate mt-0.5">{session.preview}</p>
                                                <div className="flex items-center mt-1.5 text-[10px] text-slate-400 font-medium">
                                                    {new Date(session.lastMessageAt).toLocaleString()}
                                                </div>
                                            </>
                                        )}
                                    </div>
                                    
                                    <div className="relative ml-2" onClick={e => e.stopPropagation()}>
                                        <button 
                                            onClick={() => setActiveMenuId(activeMenuId === session.id ? null : session.id)}
                                            className="p-1.5 text-slate-300 hover:text-slate-600 hover:bg-slate-50 rounded-lg transition-all opacity-0 group-hover/item:opacity-100"
                                        >
                                            <MoreVertical size={16} />
                                        </button>
                                        
                                        {activeMenuId === session.id && (
                                            <div className="absolute right-0 top-full mt-1 w-40 bg-white rounded-lg shadow-xl border border-slate-100 z-20 py-1 animate-fade-in">
                                                <button onClick={(e) => startRename(e, session)} className="w-full text-left px-4 py-2 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2">
                                                    <Edit2 size={12} /> Renomear
                                                </button>
                                                <button onClick={(e) => handleArchive(e, session.id, !session.isArchived)} className="w-full text-left px-4 py-2 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2">
                                                    <Archive size={12} /> {session.isArchived ? 'Desarquivar' : 'Arquivar'}
                                                </button>
                                                <div className="h-px bg-slate-100 my-1"></div>
                                                <button onClick={(e) => onDeleteSession(session.id, e)} className="w-full text-left px-4 py-2 text-xs text-red-600 hover:bg-red-50 flex items-center gap-2">
                                                    <Trash2 size={12} /> Excluir
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                    {activeMenuId === session.id && (
                                        <div className="fixed inset-0 z-10" onClick={(e) => { e.stopPropagation(); setActiveMenuId(null); }}></div>
                                    )}
                                    </div>
                                ))}
                             </div>
                         )}
                     </div>
                 )
             })}
          </div>
        )}
      </div>
    </div>
  );
};

// --- FINANCIAL VIEW (User Perspective) ---
export const FinancialView: React.FC<{ user: UserProfile }> = ({ user }) => {
  return (
    <div className="h-full overflow-y-auto p-6 lg:p-12 bg-slate-50">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-slate-900 mb-8 flex items-center gap-2">
            <CreditCard className="text-slate-900"/> Detalhes da Minha Assinatura
        </h1>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="bg-gradient-to-br from-slate-900 to-blue-900 p-6 rounded-2xl shadow-xl relative overflow-hidden group text-white">
             <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/20 rounded-full blur-3xl -mr-10 -mt-10"></div>
            <div className="relative z-10 flex justify-between items-start">
                 <h3 className="text-xs font-bold text-blue-200 uppercase tracking-wider">Plano Atual</h3>
                 <Zap className="text-yellow-400 fill-current" size={20} />
            </div>
            <div className="mt-4 relative z-10">
              <span className="text-3xl font-bold text-white tracking-tight">{user.plan}</span>
            </div>
            <div className="mt-6 flex items-center relative z-10">
                <div className="flex items-center px-3 py-1 rounded-full bg-white/10 border border-white/20 backdrop-blur-sm">
                    <CheckCircle2 size={14} className="text-green-400 mr-2" />
                    <span className="text-xs font-semibold text-white">Ativo • Renovação Automática</span>
                </div>
            </div>
          </div>
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-center">
            <div className="flex items-center justify-between mb-4">
                 <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Valor Mensal</h3>
            </div>
            <div className="flex items-baseline mb-2">
                <span className="text-4xl font-bold text-slate-900">
                    {user.plan === 'Profissional' ? 'R$ 19,99' : user.plan === 'Iniciante' ? 'R$ 9,99' : user.plan === 'Empresa' ? 'R$ 99,99' : 'Grátis'}
                </span>
            </div>
             <p className="text-sm text-slate-500 flex items-center">
                <Clock size={16} className="mr-2 text-slate-400" />
                Vencimento da próxima fatura: 15/06/2024
            </p>
            <button className="mt-4 w-full py-2 border border-slate-200 rounded-lg text-sm font-medium hover:bg-slate-50 text-slate-600">
                Alterar Plano
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// --- USAGE VIEW (User Perspective) ---
export const UsageView: React.FC<{ user: UserProfile }> = ({ user }) => {
    const usagePercentage = typeof user.creditsLimit === 'number' 
    ? (user.creditsUsed / user.creditsLimit) * 100 
    : 15;

    return (
        <div className="h-full overflow-y-auto p-6 lg:p-12 bg-slate-50">
             <div className="max-w-4xl mx-auto">
                <h1 className="text-2xl font-bold text-slate-900 mb-8 flex items-center gap-2">
                    <Activity className="text-slate-900"/> Meu Consumo
                </h1>
                 <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm mb-8">
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <h3 className="text-lg font-bold text-slate-900">Créditos de Consulta</h3>
                            <p className="text-slate-500 text-sm">Quantas vezes você usou a IA este mês.</p>
                        </div>
                        <div className="text-right">
                             <span className="text-4xl font-bold text-blue-600">{user.creditsUsed}</span>
                             <span className="text-slate-400 text-lg"> / {user.creditsLimit === 'Infinity' ? '∞' : user.creditsLimit}</span>
                        </div>
                    </div>
                    
                    {/* Visual Progress Bar */}
                    <div className="w-full bg-slate-100 rounded-full h-6 overflow-hidden mb-2 relative">
                        <div 
                            className={`h-6 rounded-full transition-all duration-1000 ${
                                usagePercentage > 90 ? 'bg-red-500' : 'bg-gradient-to-r from-blue-600 to-cyan-400'
                            }`} 
                            style={{ width: `${Math.min(usagePercentage, 100)}%` }}
                        ></div>
                        <div className="absolute inset-0 flex items-center justify-center text-xs font-bold text-slate-600 drop-shadow-md">
                            {user.creditsLimit !== 'Infinity' ? `${Math.round(usagePercentage)}% Usado` : 'Uso Ilimitado'}
                        </div>
                    </div>
                    <p className="text-xs text-slate-400 text-right mt-2">
                        {user.creditsLimit !== 'Infinity' 
                         ? `${(user.creditsLimit as number) - user.creditsUsed} créditos restantes.`
                         : 'Você tem acesso livre.'
                        }
                    </p>
                 </div>

                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                     <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                         <h3 className="font-bold text-slate-800 mb-4 flex items-center"><Zap size={18} className="mr-2 text-amber-500"/> Detalhes Técnicos</h3>
                         <div className="space-y-3">
                             <div className="flex justify-between text-sm">
                                 <span className="text-slate-500">Tokens de entrada:</span>
                                 <span className="font-mono">{user.tokenUsage.currentMonth.toLocaleString()}</span>
                             </div>
                             <div className="flex justify-between text-sm">
                                 <span className="text-slate-500">Chats ativos:</span>
                                 <span className="font-mono">12</span>
                             </div>
                         </div>
                     </div>
                      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                         <h3 className="font-bold text-slate-800 mb-4 flex items-center"><TrendingUp size={18} className="mr-2 text-green-500"/> Sua Economia</h3>
                         <div className="text-3xl font-bold text-slate-700 mb-1">R$ 450,00</div>
                         <p className="text-xs text-slate-400">Estimativa baseada no custo médio de visitas técnicas evitadas.</p>
                     </div>
                 </div>
             </div>
        </div>
    );
}

// --- PROFILE VIEW ---
export const ProfileView: React.FC<{ user: UserProfile }> = ({ user }) => {
  return (
    <div className="h-full overflow-y-auto p-6 lg:p-12 bg-slate-50">
      <div className="max-w-3xl mx-auto bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Profile Header ... */}
        <div className="h-32 bg-slate-900 relative">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-900 to-slate-900 opacity-90"></div>
          <div className="absolute -bottom-12 left-8">
            <div className="w-24 h-24 rounded-full bg-white p-1.5 shadow-md">
              <div className="w-full h-full rounded-full bg-gradient-to-br from-blue-600 to-cyan-500 flex items-center justify-center text-3xl font-bold text-white">
                {user.name.charAt(0)}
              </div>
            </div>
          </div>
        </div>
        <div className="pt-16 pb-8 px-8">
            <div className="flex justify-between items-start mb-8">
                <div>
                <h1 className="text-2xl font-bold text-slate-900">{user.name}</h1>
                <p className="text-slate-500">{user.company}</p>
                </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-5">
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider border-b border-slate-100 pb-2">Informações Pessoais</h3>
                <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase">Email</label>
                    <div className="mt-1 text-slate-700 font-medium">{user.email}</div>
                </div>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};

// --- ADMIN COMPONENTS ---

export const AdminOverview: React.FC = () => {
    const [metrics, setMetrics] = useState({ totalUsers: 0, activeUsers: 0, mrr: '0.00', churnRate: '0%' });
    
    useEffect(() => {
        setMetrics(Storage.getFinancialMetrics());
    }, []);

    return (
        <div className="h-full overflow-y-auto p-6 lg:p-12 bg-slate-50">
            <div className="max-w-6xl mx-auto">
                <div className="mb-10">
                    <h1 className="text-3xl font-bold text-slate-900">Visão Geral do Sistema</h1>
                    <p className="text-slate-500 mt-1">Métricas chave de performance e saúde do negócio.</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10">
                    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">MRR (Mensal)</h3>
                            <DollarSign className="text-green-500 bg-green-50 p-1.5 rounded-lg w-8 h-8" />
                        </div>
                        <p className="text-3xl font-bold text-slate-900">R$ {metrics.mrr}</p>
                        <span className="text-xs text-green-600 font-medium flex items-center mt-2">
                             <TrendingUp size={12} className="mr-1" /> +12% vs mês anterior
                        </span>
                    </div>
                    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Usuários Ativos</h3>
                            <Users className="text-blue-500 bg-blue-50 p-1.5 rounded-lg w-8 h-8" />
                        </div>
                        <p className="text-3xl font-bold text-slate-900">{metrics.activeUsers} <span className="text-slate-400 text-lg font-normal">/ {metrics.totalUsers}</span></p>
                    </div>
                    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                         <div className="flex items-center justify-between mb-4">
                            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Churn Rate</h3>
                            <Activity className="text-red-500 bg-red-50 p-1.5 rounded-lg w-8 h-8" />
                        </div>
                        <p className="text-3xl font-bold text-slate-900">{metrics.churnRate}</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export const AdminUsers: React.FC = () => {
    const [users, setUsers] = useState<UserProfile[]>([]);
    
    useEffect(() => {
        setUsers(Storage.getAdminUsers());
    }, []);

    const handleToggleStatus = (userId: string, currentStatus: string) => {
        const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
        const updatedUsers = Storage.toggleUserStatus(userId, newStatus);
        setUsers(updatedUsers);
    };

    return (
        <div className="h-full overflow-y-auto p-6 lg:p-12 bg-slate-50">
            <div className="max-w-6xl mx-auto">
                <div className="mb-10">
                    <h1 className="text-3xl font-bold text-slate-900">Base de Usuários</h1>
                    <p className="text-slate-500 mt-1">Gerencie acessos e planos dos clientes.</p>
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                        <h3 className="font-bold text-slate-800">Todos os Usuários</h3>
                        <button className="text-sm text-blue-600 hover:text-blue-800 font-medium flex items-center transition-colors">
                            <Download size={16} className="mr-1" /> Exportar CSV
                        </button>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-slate-100">
                            <thead className="bg-slate-50/50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Usuário / Empresa</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Plano</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Membro Desde</th>
                                <th className="px-6 py-3 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Ações</th>
                            </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                            {users.map((u) => (
                                <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="flex items-center">
                                        <div className="h-8 w-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 font-bold text-xs mr-3">
                                            {u.name.charAt(0)}
                                        </div>
                                        <div>
                                            <div className="text-sm font-medium text-slate-900">{u.name}</div>
                                            <div className="text-xs text-slate-500">{u.email}</div>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full border ${
                                        u.plan === 'Empresa' ? 'bg-purple-100 text-purple-700 border-purple-200' :
                                        u.plan === 'Profissional' ? 'bg-blue-100 text-blue-700 border-blue-200' :
                                        'bg-slate-100 text-slate-600 border-slate-200'
                                    }`}>
                                        {u.plan}
                                    </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                        u.status === 'active' ? 'bg-green-100 text-green-700' : 
                                        u.status === 'overdue' ? 'bg-red-100 text-red-700' :
                                        'bg-slate-100 text-slate-500'
                                    }`}>
                                        {u.status === 'active' ? 'Ativo' : u.status === 'overdue' ? 'Em Atraso' : 'Inativo'}
                                    </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                                    {new Date(u.joinedAt).toLocaleDateString()}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                    {u.id !== 'u_123' && (
                                        <button 
                                            onClick={() => handleToggleStatus(u.id, u.status)}
                                            className={`text-xs font-bold px-3 py-1.5 rounded-md transition-colors ${
                                                u.status === 'active' 
                                                ? 'text-red-600 bg-red-50 hover:bg-red-100' 
                                                : 'text-green-600 bg-green-50 hover:bg-green-100'
                                            }`}
                                        >
                                            {u.status === 'active' ? 'Desativar' : 'Ativar'}
                                        </button>
                                    )}
                                </td>
                                </tr>
                            ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
};

export const AdminFinance: React.FC = () => {
    return (
        <div className="h-full overflow-y-auto p-6 lg:p-12 bg-slate-50">
            <div className="max-w-6xl mx-auto">
                 <div className="mb-10">
                    <h1 className="text-3xl font-bold text-slate-900">Financeiro & Planos</h1>
                    <p className="text-slate-500 mt-1">Controle de receita e configuração de planos.</p>
                </div>
                
                <div className="bg-white p-12 rounded-2xl border border-slate-200 border-dashed text-center">
                    <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                        <PieChart className="h-8 w-8 text-slate-300" />
                    </div>
                    <h3 className="text-lg font-bold text-slate-900">Relatórios Detalhados</h3>
                    <p className="text-slate-500 mt-2 max-w-sm mx-auto">
                        A integração com o gateway de pagamento (Stripe/Pagar.me) será exibida aqui com gráficos de receita recorrente.
                    </p>
                </div>
            </div>
        </div>
    );
};
