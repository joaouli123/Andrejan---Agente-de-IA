
import React, { useState, useEffect } from 'react';
import { ChatSession, UserProfile, Agent } from '../types';
import * as Icons from 'lucide-react';
import { 
    Trash2, MessageSquare, Clock, ArrowRight, Shield, CreditCard, 
    Download, Zap, CheckCircle2, Edit2, Archive, MoreVertical, 
    X, Check, AlertCircle, Users, TrendingUp, DollarSign, Activity, Calendar,
    PieChart, BrainCircuit, Rocket, ChevronDown, ChevronRight, Upload, MapPin, Lock, User
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
            className="bg-white rounded-2xl p-5 sm:p-8 border border-slate-200 shadow-sm hover:shadow-xl hover:border-blue-300 cursor-pointer transition-all duration-300 group relative overflow-hidden min-h-[180px] sm:h-64 flex flex-col"
        >
            <div className="absolute -right-6 -top-6 text-blue-50 group-hover:text-blue-100/80 transition-colors duration-500 opacity-80 hidden sm:block">
                <IconComponent size={140} className="opacity-100" />
            </div>

            <div className="flex items-start justify-between mb-3 sm:mb-4 relative z-10">
                <div className={`p-3 sm:p-4 rounded-xl shadow-sm transition-colors ${
                    isPrimary 
                    ? 'bg-blue-600 text-white shadow-blue-200' 
                    : agent.isCustom 
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-500 group-hover:bg-blue-600 group-hover:text-white'
                }`}>
                    <IconComponent size={24} />
                </div>
                {agent.isCustom && (
                    <span className="bg-slate-100 text-slate-500 text-[10px] font-bold px-2 py-1 rounded-full uppercase">Especialista</span>
                )}
            </div>
            
            <div className="relative z-10 flex-1">
                <h3 className="text-lg sm:text-xl font-bold text-slate-900 mb-1 group-hover:text-blue-700 transition-colors">{agent.name}</h3>
                <p className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 sm:mb-3">{agent.role}</p>
                {agent.brandName && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 mb-2 rounded-full text-[10px] font-bold bg-blue-50 text-blue-600 border border-blue-200">
                        📚 {agent.brandName}
                    </span>
                )}
                <p className="text-slate-600 leading-relaxed pr-8 text-xs sm:text-sm line-clamp-2 sm:line-clamp-3">{agent.description}</p>
            </div>

            <div className="absolute bottom-5 right-5 sm:bottom-8 sm:right-8 z-10">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-all shadow-sm">
                    <ArrowRight size={16} />
                </div>
            </div>
        </div>
    );
};

// --- AGENTS GRID ---
export const AgentsGrid: React.FC<{ user: UserProfile, onSelectAgent: (id: string) => void }> = ({ user, onSelectAgent }) => {
  const [agents, setAgents] = useState<Agent[]>(Storage.getAgents());

  useEffect(() => {
      const syncAgents = async () => {
        await Storage.syncAgentsFromDatabase();
        setAgents(Storage.getAgents());
      };
      syncAgents();
  }, []);

  const customAgents = agents.filter(a => a.isCustom || true); // Todos os agentes são tratados igualmente

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6 lg:p-12 custom-scrollbar bg-slate-50">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6 sm:mb-10 animate-fade-in">
          <h1 className="text-xl sm:text-3xl font-extrabold text-slate-900 flex items-center gap-2 sm:gap-3">
             <span className="p-2 bg-blue-100 text-blue-600 rounded-xl">
                <Zap className="fill-current w-6 h-6" />
             </span>
             Bem vindo, {user.name.split(' ')[0]}
          </h1>
          <p className="text-slate-500 mt-1 sm:mt-2 text-sm sm:text-lg max-w-2xl">Central de Diagnóstico: Selecione o módulo especializado para iniciar o atendimento.</p>
        </div>

        {/* Agentes */}
        {customAgents.length > 0 ? (
          <div className="mb-8">
            <h3 className="text-xs sm:text-sm font-bold text-slate-400 uppercase tracking-wider mb-3 sm:mb-4 flex items-center">
                <Zap className="w-4 h-4 mr-2" /> Assistentes Técnicos
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6 lg:gap-8">
                {customAgents.map(agent => <AgentCard key={agent.id} agent={agent} onSelect={onSelectAgent} />)}
            </div>
          </div>
        ) : (
          <div className="mb-8 text-center py-16">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-slate-100 rounded-2xl mb-4">
              <Rocket className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="text-lg font-semibold text-slate-600 mb-2">Nenhum agente criado ainda</h3>
            <p className="text-slate-400 text-sm">Crie seus agentes personalizados no painel de administração.</p>
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
      const load = async () => {
       const allSessions = Storage.getSessions(true);
       setLocalSessions(allSessions.filter(s => showArchived ? s.isArchived : !s.isArchived));
       await Storage.syncAgentsFromDatabase();
       setAgents(Storage.getAgents());
      };
      load();
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
    <div className="h-full overflow-y-auto p-4 sm:p-6 lg:p-12 bg-slate-50">
      <div className="max-w-4xl mx-auto">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 sm:mb-8 gap-4">
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
  const [showCancelModal, setShowCancelModal] = useState(false);

  const planPrice = user.plan === 'Profissional' ? 'R$ 19,99' : user.plan === 'Iniciante' ? 'R$ 9,99' : user.plan === 'Empresa' ? 'R$ 99,99' : 'Grátis';
  const planPriceNum = user.plan === 'Profissional' ? 19.99 : user.plan === 'Iniciante' ? 9.99 : user.plan === 'Empresa' ? 99.99 : 0;

  // Mock payment history
  const paymentHistory = [
    { id: 1, date: '10/02/2026', amount: planPriceNum, method: 'Cartão •••• 4521', status: 'paid' as const, invoice: 'INV-2026-02' },
    { id: 2, date: '10/01/2026', amount: planPriceNum, method: 'Cartão •••• 4521', status: 'paid' as const, invoice: 'INV-2026-01' },
    { id: 3, date: '10/12/2025', amount: planPriceNum, method: 'Cartão •••• 4521', status: 'paid' as const, invoice: 'INV-2025-12' },
    { id: 4, date: '10/11/2025', amount: planPriceNum, method: 'PIX', status: 'paid' as const, invoice: 'INV-2025-11' },
    { id: 5, date: '10/10/2025', amount: planPriceNum, method: 'PIX', status: 'paid' as const, invoice: 'INV-2025-10' },
    { id: 6, date: '10/09/2025', amount: planPriceNum, method: 'Cartão •••• 4521', status: 'paid' as const, invoice: 'INV-2025-09' },
  ];

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6 lg:p-12 bg-slate-50">
      <div className="max-w-4xl mx-auto pb-12">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 mb-6 sm:mb-8 flex items-center gap-2">
            <CreditCard className="text-slate-900"/> Detalhes da Minha Assinatura
        </h1>

        {/* Plan + Value Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 mb-6 sm:mb-8">
          <div className="bg-gradient-to-br from-slate-900 to-blue-900 p-4 sm:p-6 rounded-2xl shadow-xl relative overflow-hidden group text-white">
             <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/20 rounded-full blur-3xl -mr-10 -mt-10"></div>
            <div className="relative z-10 flex justify-between items-start">
                 <h3 className="text-xs font-bold text-blue-200 uppercase tracking-wider">Plano Atual</h3>
                 <Zap className="text-yellow-400 fill-current" size={20} />
            </div>
            <div className="mt-4 relative z-10">
              <span className="text-2xl sm:text-3xl font-bold text-white tracking-tight">{user.plan}</span>
            </div>
            <div className="mt-6 flex items-center relative z-10">
                <div className="flex items-center px-3 py-1 rounded-full bg-white/10 border border-white/20 backdrop-blur-sm">
                    <CheckCircle2 size={14} className="text-green-400 mr-2" />
                    <span className="text-xs font-semibold text-white">Ativo • Renovação Automática</span>
                </div>
            </div>
          </div>
          <div className="bg-white p-4 sm:p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-center">
            <div className="flex items-center justify-between mb-4">
                 <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Valor Mensal</h3>
            </div>
            <div className="flex items-baseline mb-2">
                <span className="text-2xl sm:text-4xl font-bold text-slate-900">{planPrice}</span>
                {planPriceNum > 0 && <span className="text-slate-400 text-sm ml-1">/mês</span>}
            </div>
             <p className="text-sm text-slate-500 flex items-center">
                <Clock size={16} className="mr-2 text-slate-400" />
                Próxima cobrança: 10/03/2026
            </p>
            <button className="mt-4 w-full py-2.5 border border-slate-200 rounded-lg text-sm font-medium hover:bg-slate-50 text-slate-600 transition-colors">
                Alterar Plano
            </button>
          </div>
        </div>

        {/* Payment History Table */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm mb-6 sm:mb-8 overflow-hidden">
          <div className="px-4 sm:px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
            <h3 className="font-bold text-slate-800 text-sm sm:text-base flex items-center gap-2">
              <DollarSign size={16} className="text-green-600" /> Histórico de Pagamentos
            </h3>
            <button className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1 px-3 py-1.5 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors">
              <Download size={14} /> Exportar
            </button>
          </div>

          {/* Desktop Table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100">
              <thead className="bg-slate-50/50">
                <tr>
                  <th className="px-6 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Data</th>
                  <th className="px-6 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Fatura</th>
                  <th className="px-6 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Forma de Pagamento</th>
                  <th className="px-6 py-3 text-right text-[10px] font-bold text-slate-400 uppercase tracking-wider">Valor</th>
                  <th className="px-6 py-3 text-center text-[10px] font-bold text-slate-400 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paymentHistory.map(p => (
                  <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-3.5 whitespace-nowrap text-sm text-slate-700 font-medium">{p.date}</td>
                    <td className="px-6 py-3.5 whitespace-nowrap text-sm text-slate-500 font-mono text-xs">{p.invoice}</td>
                    <td className="px-6 py-3.5 whitespace-nowrap text-sm text-slate-600 flex items-center gap-2">
                      <CreditCard size={14} className="text-slate-400" />
                      {p.method}
                    </td>
                    <td className="px-6 py-3.5 whitespace-nowrap text-sm font-semibold text-slate-900 text-right">
                      R$ {p.amount.toFixed(2).replace('.', ',')}
                    </td>
                    <td className="px-6 py-3.5 whitespace-nowrap text-center">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-green-100 text-green-700">
                        <CheckCircle2 size={10} /> Pago
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Card List */}
          <div className="sm:hidden divide-y divide-slate-100">
            {paymentHistory.map(p => (
              <div key={p.id} className="p-4 flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-semibold text-slate-800">{p.date}</span>
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-green-100 text-green-700">
                      <CheckCircle2 size={8} /> Pago
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 flex items-center gap-1">
                    <CreditCard size={10} /> {p.method}
                  </p>
                </div>
                <span className="text-sm font-bold text-slate-900 ml-3">R$ {p.amount.toFixed(2).replace('.', ',')}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Cancel Subscription - Discrete */}
        <div className="border-t border-slate-200 pt-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-sm">
            <p className="text-slate-400 text-xs">Precisa de ajuda? Entre em contato com nosso suporte.</p>
            <button 
              onClick={() => setShowCancelModal(true)}
              className="text-xs text-slate-400 hover:text-red-500 transition-colors underline underline-offset-2"
            >
              Cancelar assinatura
            </button>
          </div>
        </div>

        {/* Cancel Modal */}
        {showCancelModal && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowCancelModal(false)}>
            <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 sm:p-8" onClick={e => e.stopPropagation()}>
              <div className="text-center mb-6">
                <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <AlertCircle size={28} className="text-red-500" />
                </div>
                <h2 className="text-xl font-bold text-slate-900 mb-2">Cancelar Assinatura?</h2>
                <p className="text-sm text-slate-500 leading-relaxed">
                  Ao cancelar, você perderá acesso aos recursos do plano <strong className="text-slate-700">{user.plan}</strong> ao final do período atual (10/03/2026).
                </p>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-6">
                <p className="text-xs text-amber-800 flex items-start gap-2">
                  <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
                  Seu histórico de conversas e dados serão mantidos por 30 dias após o cancelamento.
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => setShowCancelModal(false)}
                  className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors"
                >
                  Manter Assinatura
                </button>
                <button
                  onClick={() => { alert('Assinatura cancelada. Você terá acesso até 10/03/2026.'); setShowCancelModal(false); }}
                  className="w-full py-3 text-red-500 text-sm font-medium hover:bg-red-50 rounded-xl transition-colors"
                >
                  Confirmar Cancelamento
                </button>
              </div>
            </div>
          </div>
        )}
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
        <div className="h-full overflow-y-auto p-4 sm:p-6 lg:p-12 bg-slate-50">
             <div className="max-w-4xl mx-auto">
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900 mb-6 sm:mb-8 flex items-center gap-2">
                    <Activity className="text-slate-900"/> Meu Consumo
                </h1>
                 <div className="bg-white p-4 sm:p-8 rounded-2xl border border-slate-200 shadow-sm mb-6 sm:mb-8">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 sm:mb-6 gap-3">
                        <div>
                            <h3 className="text-base sm:text-lg font-bold text-slate-900">Créditos de Consulta</h3>
                            <p className="text-slate-500 text-xs sm:text-sm">Quantas vezes você usou a IA este mês.</p>
                        </div>
                        <div className="text-left sm:text-right">
                             <span className="text-2xl sm:text-4xl font-bold text-blue-600">{user.creditsUsed}</span>
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
  const [isEditing, setIsEditing] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState(user.avatar || '');
  
  const [formData, setFormData] = useState({
    name: user.name,
    email: user.email,
    phone: user.phone || '',
    cpf: user.cpf || '',
    company: user.company,
    street: user.address?.street || '',
    number: user.address?.number || '',
    complement: user.address?.complement || '',
    neighborhood: user.address?.neighborhood || '',
    city: user.address?.city || '',
    state: user.address?.state || '',
    zipCode: user.address?.zipCode || ''
  });

  const [passwords, setPasswords] = useState({
    current: '',
    new: '',
    confirm: ''
  });

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setAvatarPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = () => {
    const updates: Partial<UserProfile> = {
      name: formData.name,
      email: formData.email,
      phone: formData.phone,
      cpf: formData.cpf,
      company: formData.company,
      avatar: avatarPreview,
      address: {
        street: formData.street,
        number: formData.number,
        complement: formData.complement,
        neighborhood: formData.neighborhood,
        city: formData.city,
        state: formData.state,
        zipCode: formData.zipCode
      }
    };
    
    Storage.updateUserProfile(updates);
    alert('Perfil atualizado com sucesso!');
    setIsEditing(false);
    window.location.reload();
  };

  const handlePasswordChange = () => {
    if (passwords.new !== passwords.confirm) {
      alert('As senhas não coincidem!');
      return;
    }
    if (passwords.new.length < 6) {
      alert('A senha deve ter no mínimo 6 caracteres!');
      return;
    }
    alert('Senha alterada com sucesso!');
    setShowPasswordModal(false);
    setPasswords({ current: '', new: '', confirm: '' });
  };

  const inputClass = "w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all disabled:bg-slate-50 disabled:text-slate-500";

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6 lg:p-12 bg-slate-50">
      <div className="max-w-3xl mx-auto pb-12">
        
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <User size={22} className="text-slate-900" /> Meu Perfil
          </h1>
          <div className="flex gap-2">
            {!isEditing ? (
              <>
                <button 
                  onClick={() => setIsEditing(true)}
                  className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors font-medium"
                >
                  <Edit2 size={14} /> Editar
                </button>
                <button 
                  onClick={() => setShowPasswordModal(true)}
                  className="flex items-center gap-1.5 px-4 py-2 bg-slate-100 text-slate-700 text-sm rounded-lg hover:bg-slate-200 transition-colors font-medium"
                >
                  <Lock size={14} /> Senha
                </button>
              </>
            ) : (
              <>
                <button 
                  onClick={handleSave}
                  className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition-colors font-medium"
                >
                  <Check size={14} /> Salvar
                </button>
                <button 
                  onClick={() => setIsEditing(false)}
                  className="flex items-center gap-1.5 px-4 py-2 bg-slate-100 text-slate-700 text-sm rounded-lg hover:bg-slate-200 transition-colors font-medium"
                >
                  <X size={14} /> Cancelar
                </button>
              </>
            )}
          </div>
        </div>

        {/* Avatar + Info Card */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-4 flex items-center gap-4">
          <div className="relative flex-shrink-0">
            <div className="w-14 h-14 rounded-xl overflow-hidden shadow-sm">
              {avatarPreview ? (
                <img src={avatarPreview} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-blue-600 to-cyan-500 flex items-center justify-center text-xl font-bold text-white">
                  {user.name.charAt(0)}
                </div>
              )}
            </div>
            {isEditing && (
              <label className="absolute -bottom-1 -right-1 w-7 h-7 bg-blue-600 rounded-full flex items-center justify-center cursor-pointer hover:bg-blue-700 transition-colors shadow border-2 border-white">
                <Upload className="text-white" size={12} />
                <input type="file" accept="image/*" onChange={handleAvatarChange} className="hidden" />
              </label>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-base font-bold text-slate-900 truncate">{user.name}</p>
            <p className="text-xs text-slate-500 truncate">{user.email}</p>
          </div>
          <div className="flex-shrink-0">
            <span className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider bg-blue-50 text-blue-600 border border-blue-200 rounded-full">
              {user.plan}
            </span>
          </div>
        </div>

        {/* Dados Pessoais */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm mb-4">
          <h2 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-1.5">
            <User size={14} className="text-blue-600" /> Dados Pessoais
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Nome Completo</label>
              <input type="text" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} disabled={!isEditing} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Email</label>
              <input type="email" value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} disabled={!isEditing} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Telefone</label>
              <input type="tel" value={formData.phone} onChange={(e) => setFormData({...formData, phone: e.target.value})} disabled={!isEditing} placeholder="(00) 00000-0000" className={inputClass} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">CPF</label>
              <input type="text" value={formData.cpf} onChange={(e) => setFormData({...formData, cpf: e.target.value})} disabled={!isEditing} placeholder="000.000.000-00" className={inputClass} />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-500 mb-1">Empresa</label>
              <input type="text" value={formData.company} onChange={(e) => setFormData({...formData, company: e.target.value})} disabled={!isEditing} className={inputClass} />
            </div>
          </div>
        </div>

        {/* Endereço */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <h2 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-1.5">
            <MapPin size={14} className="text-blue-600" /> Endereço
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">CEP</label>
              <input type="text" value={formData.zipCode} onChange={(e) => setFormData({...formData, zipCode: e.target.value})} disabled={!isEditing} placeholder="00000-000" className={inputClass} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Cidade</label>
              <input type="text" value={formData.city} onChange={(e) => setFormData({...formData, city: e.target.value})} disabled={!isEditing} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Estado</label>
              <select value={formData.state} onChange={(e) => setFormData({...formData, state: e.target.value})} disabled={!isEditing} className={inputClass}>
                <option value="">UF</option>
                <option value="SP">SP</option><option value="RJ">RJ</option><option value="MG">MG</option>
                <option value="ES">ES</option><option value="PR">PR</option><option value="SC">SC</option>
                <option value="RS">RS</option><option value="BA">BA</option><option value="PE">PE</option>
                <option value="CE">CE</option><option value="GO">GO</option><option value="DF">DF</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-500 mb-1">Rua/Avenida</label>
              <input type="text" value={formData.street} onChange={(e) => setFormData({...formData, street: e.target.value})} disabled={!isEditing} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Número</label>
              <input type="text" value={formData.number} onChange={(e) => setFormData({...formData, number: e.target.value})} disabled={!isEditing} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Complemento</label>
              <input type="text" value={formData.complement} onChange={(e) => setFormData({...formData, complement: e.target.value})} disabled={!isEditing} placeholder="Apto, Sala..." className={inputClass} />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs font-medium text-slate-500 mb-1">Bairro</label>
              <input type="text" value={formData.neighborhood} onChange={(e) => setFormData({...formData, neighborhood: e.target.value})} disabled={!isEditing} className={inputClass} />
            </div>
          </div>
        </div>

        {/* Modal de Troca de Senha */}
        {showPasswordModal && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowPasswordModal(false)}>
            <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-6" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <Lock size={18} className="text-blue-600" /> Alterar Senha
                </h2>
                <button onClick={() => setShowPasswordModal(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Senha Atual</label>
                  <input type="password" value={passwords.current} onChange={(e) => setPasswords({...passwords, current: e.target.value})} className={inputClass} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Nova Senha</label>
                  <input type="password" value={passwords.new} onChange={(e) => setPasswords({...passwords, new: e.target.value})} className={inputClass} />
                  <p className="text-[10px] text-slate-400 mt-0.5">Mínimo de 6 caracteres</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Confirmar</label>
                  <input type="password" value={passwords.confirm} onChange={(e) => setPasswords({...passwords, confirm: e.target.value})} className={inputClass} />
                </div>
              </div>
              <div className="flex gap-2 mt-5">
                <button onClick={handlePasswordChange} className="flex-1 bg-blue-600 text-white py-2.5 rounded-lg hover:bg-blue-700 transition-colors text-sm font-semibold">
                  Alterar
                </button>
                <button onClick={() => setShowPasswordModal(false)} className="flex-1 bg-slate-100 text-slate-700 py-2.5 rounded-lg hover:bg-slate-200 transition-colors text-sm font-semibold">
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// --- ADMIN COMPONENTS ---

export const AdminOverview: React.FC = () => {
    const [metrics, setMetrics] = useState({ totalUsers: 0, activeUsers: 0, mrr: '0.00', churnRate: '0%' });
    const [period, setPeriod] = useState<'7d' | '30d' | '90d' | '1y'>('30d');
    const [loading, setLoading] = useState(false);
    
    useEffect(() => {
        loadMetrics();
    }, [period]);

    const loadMetrics = () => {
        setLoading(true);
        setTimeout(() => {
            setMetrics(Storage.getFinancialMetrics());
            setLoading(false);
        }, 300);
    };

    return (
        <div className="h-full overflow-y-auto p-6 lg:p-12 bg-slate-50">
            <div className="max-w-7xl mx-auto">
                
                {/* Header with Filters */}
                <div className="mb-6 sm:mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Visão Geral do Sistema</h1>
                        <p className="text-slate-500 mt-1 text-sm sm:text-base">Métricas chave de performance e saúde do negócio.</p>
                    </div>
                    <div className="flex items-center gap-2 bg-white p-1 rounded-lg border border-slate-200 shadow-sm">
                        <button 
                            onClick={() => setPeriod('7d')}
                            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${period === '7d' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                        >
                            7 dias
                        </button>
                        <button 
                            onClick={() => setPeriod('30d')}
                            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${period === '30d' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                        >
                            30 dias
                        </button>
                        <button 
                            onClick={() => setPeriod('90d')}
                            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${period === '90d' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                        >
                            90 dias
                        </button>
                        <button 
                            onClick={() => setPeriod('1y')}
                            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${period === '1y' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                        >
                            1 ano
                        </button>
                    </div>
                </div>

                {/* Metrics Cards */}
                <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6 mb-6 sm:mb-10">
                    <div className="bg-white p-4 sm:p-6 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex items-center justify-between mb-2 sm:mb-4">
                            <h3 className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider">MRR (Mensal)</h3>
                            <DollarSign className="text-green-500 bg-green-50 p-1 sm:p-1.5 rounded-lg w-6 h-6 sm:w-8 sm:h-8" />
                        </div>
                        <p className="text-xl sm:text-3xl font-bold text-slate-900">R$ {metrics.mrr}</p>
                        <span className="text-[10px] sm:text-xs text-green-600 font-medium flex items-center mt-1 sm:mt-2">
                             <TrendingUp size={12} className="mr-1" /> +12% vs período anterior
                        </span>
                    </div>

                    <div className="bg-white p-4 sm:p-6 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex items-center justify-between mb-2 sm:mb-4">
                            <h3 className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider">Usuários Ativos</h3>
                            <Users className="text-blue-500 bg-blue-50 p-1 sm:p-1.5 rounded-lg w-6 h-6 sm:w-8 sm:h-8" />
                        </div>
                        <p className="text-xl sm:text-3xl font-bold text-slate-900">{metrics.activeUsers} <span className="text-slate-400 text-sm sm:text-lg font-normal">/ {metrics.totalUsers}</span></p>
                        <span className="text-xs text-slate-500 mt-2 block">{((metrics.activeUsers / metrics.totalUsers) * 100).toFixed(0)}% de engajamento</span>
                    </div>

                    <div className="bg-white p-4 sm:p-6 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                         <div className="flex items-center justify-between mb-2 sm:mb-4">
                            <h3 className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider">Churn Rate</h3>
                            <Activity className="text-amber-500 bg-amber-50 p-1 sm:p-1.5 rounded-lg w-6 h-6 sm:w-8 sm:h-8" />
                        </div>
                        <p className="text-xl sm:text-3xl font-bold text-slate-900">{metrics.churnRate}</p>
                        <span className="text-xs text-slate-500 mt-2 block">Meta: &lt;5%</span>
                    </div>

                    <div className="bg-white p-4 sm:p-6 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                         <div className="flex items-center justify-between mb-2 sm:mb-4">
                            <h3 className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider">Consultas IA</h3>
                            <Zap className="text-purple-500 bg-purple-50 p-1 sm:p-1.5 rounded-lg w-6 h-6 sm:w-8 sm:h-8" />
                        </div>
                        <p className="text-xl sm:text-3xl font-bold text-slate-900">12.4k</p>
                        <span className="text-[10px] sm:text-xs text-purple-600 font-medium flex items-center mt-1 sm:mt-2">
                             <TrendingUp size={12} className="mr-1" /> +28% vs período anterior
                        </span>
                    </div>
                </div>

                {/* Charts Area */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-10">
                    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                        <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                            <PieChart size={18} className="text-blue-600" /> Distribuição por Plano
                        </h3>
                        <div className="space-y-3">
                            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                                <div className="flex items-center gap-3">
                                    <div className="w-3 h-3 bg-blue-600 rounded"></div>
                                    <span className="text-sm font-medium text-slate-700">Empresa</span>
                                </div>
                                <span className="text-sm font-bold text-slate-900">45%</span>
                            </div>
                            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                                <div className="flex items-center gap-3">
                                    <div className="w-3 h-3 bg-emerald-500 rounded"></div>
                                    <span className="text-sm font-medium text-slate-700">Profissional</span>
                                </div>
                                <span className="text-sm font-bold text-slate-900">30%</span>
                            </div>
                            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                                <div className="flex items-center gap-3">
                                    <div className="w-3 h-3 bg-amber-500 rounded"></div>
                                    <span className="text-sm font-medium text-slate-700">Iniciante</span>
                                </div>
                                <span className="text-sm font-bold text-slate-900">20%</span>
                            </div>
                            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                                <div className="flex items-center gap-3">
                                    <div className="w-3 h-3 bg-slate-400 rounded"></div>
                                    <span className="text-sm font-medium text-slate-700">Free</span>
                                </div>
                                <span className="text-sm font-bold text-slate-900">5%</span>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                        <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                            <Activity size={18} className="text-blue-600" /> Top 5 Agentes Mais Usados
                        </h3>
                        <div className="space-y-3">
                            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                              <span className="text-sm font-medium text-slate-700">Eng. de Segurança</span>
                                <span className="text-sm font-bold text-slate-900">8.2k consultas</span>
                            </div>
                            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                              <span className="text-sm font-medium text-slate-700">Mentor Técnico</span>
                                <span className="text-sm font-bold text-slate-900">3.1k consultas</span>
                            </div>
                            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                              <span className="text-sm font-medium text-slate-700">Especialista Schindler</span>
                                <span className="text-sm font-bold text-slate-900">1.8k consultas</span>
                            </div>
                            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                              <span className="text-sm font-medium text-slate-700">Especialista Otis</span>
                                <span className="text-sm font-bold text-slate-900">950 consultas</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Quick Actions */}
                <div className="bg-gradient-to-r from-blue-600 to-cyan-500 p-6 rounded-xl text-white">
                    <h3 className="font-bold text-lg mb-2">Sistema em Crescimento 🚀</h3>
                    <p className="text-blue-50 text-sm mb-4">O sistema está performando {period === '30d' ? '12%' : '18%'} acima da meta para o período selecionado.</p>
                    <div className="flex gap-3">
                        <button className="bg-white text-blue-600 px-4 py-2 rounded-lg font-medium text-sm hover:bg-blue-50 transition-colors">
                            Ver Relatório Completo
                        </button>
                        <button className="bg-blue-700 text-white px-4 py-2 rounded-lg font-medium text-sm hover:bg-blue-800 transition-colors">
                            Exportar Dados
                        </button>
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
            <div className="max-w-7xl mx-auto">
                <div className="mb-6 sm:mb-10 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
                    <div>
                        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Usuários & Planos</h1>
                        <p className="text-slate-500 mt-1 text-sm sm:text-base">Gerencie acessos, assinaturas e permissões dos clientes.</p>
                    </div>
                    <button className="bg-blue-600 text-white px-4 sm:px-6 py-2.5 sm:py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors shadow-sm flex items-center gap-2 text-sm sm:text-base w-fit">
                        <Users size={18} /> Novo Usuário
                    </button>
                </div>

                {/* Summary Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-6 mb-6 sm:mb-8">
                    <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
                        <p className="text-xs font-bold text-slate-400 uppercase mb-1">Total de Usuários</p>
                        <p className="text-2xl font-bold text-slate-900">{users.length}</p>
                    </div>
                    <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
                        <p className="text-xs font-bold text-slate-400 uppercase mb-1">Plano Empresa</p>
                        <p className="text-2xl font-bold text-blue-600">{users.filter(u => u.plan === 'Empresa').length}</p>
                    </div>
                    <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
                        <p className="text-xs font-bold text-slate-400 uppercase mb-1">Plano Profissional</p>
                        <p className="text-2xl font-bold text-emerald-600">{users.filter(u => u.plan === 'Profissional').length}</p>
                    </div>
                    <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
                        <p className="text-xs font-bold text-slate-400 uppercase mb-1">Inativos</p>
                        <p className="text-2xl font-bold text-red-600">{users.filter(u => u.status === 'inactive').length}</p>
                    </div>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 bg-slate-50/50">
                        <h3 className="font-bold text-slate-800">Todos os Usuários</h3>
                        <div className="flex gap-2">
                            <input 
                                type="search" 
                                placeholder="Buscar usuário..." 
                                className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                            />
                            <button className="text-sm text-blue-600 hover:text-blue-800 font-medium flex items-center transition-colors px-3 py-1.5 bg-blue-50 rounded-lg hover:bg-blue-100">
                                <Download size={16} className="mr-1" /> Exportar
                            </button>
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-slate-100">
                            <thead className="bg-slate-50/50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Usuário / Empresa</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Plano</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Consumo</th>
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
                                        <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white font-bold text-sm mr-3 shadow-sm">
                                            {u.name.charAt(0)}
                                        </div>
                                        <div>
                                            <div className="text-sm font-semibold text-slate-900">{u.name}</div>
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
                                    <div className="flex items-center gap-2">
                                        <div className="flex-1 bg-slate-100 rounded-full h-2 w-20">
                                            <div 
                                                className={`h-2 rounded-full ${
                                                    u.creditsLimit === 'Infinity' ? 'bg-green-500' :
                                                    (u.creditsUsed / Number(u.creditsLimit)) > 0.8 ? 'bg-red-500' :
                                                    (u.creditsUsed / Number(u.creditsLimit)) > 0.5 ? 'bg-amber-500' :
                                                    'bg-blue-500'
                                                }`}
                                                style={{ 
                                                    width: u.creditsLimit === 'Infinity' ? '100%' : `${(u.creditsUsed / Number(u.creditsLimit)) * 100}%` 
                                                }}
                                            />
                                        </div>
                                        <span className="text-xs text-slate-600 font-medium whitespace-nowrap">
                                            {u.creditsLimit === 'Infinity' ? 'Ilimitado' : `${u.creditsUsed}/${u.creditsLimit}`}
                                        </span>
                                    </div>
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
