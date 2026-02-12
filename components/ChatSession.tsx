
import React, { useState, useRef, useEffect } from 'react';
import { 
  Send, Loader2, ArrowLeft, MoreVertical, Zap, Shield, 
  Plus, MessageSquare, Edit2, Check, X as XIcon, Trash2, Sidebar as SidebarIcon,
  Download, Eraser
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { getDiagnostic } from '../services/geminiService';
import { ChatSession, Message, Agent } from '../types';
import * as Storage from '../services/storage';

interface ChatSessionProps {
  sessionId: string;
  onBack: () => void;
  allSessions: ChatSession[];
  onSelectSession: (id: string) => void;
  onCreateSession: (agentId: string) => void;
  onSessionUpdate: () => void;
}

const ChatSessionView: React.FC<ChatSessionProps> = ({ 
  sessionId, 
  onBack, 
  allSessions, 
  onSelectSession, 
  onCreateSession,
  onSessionUpdate
}) => {
  const [session, setSession] = useState<ChatSession | undefined>(undefined);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const agents = Storage.getAgents();
  
  // Sidebar State
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const [tempTitle, setTempTitle] = useState('');

  // Header Menu State
  const [isHeaderMenuOpen, setIsHeaderMenuOpen] = useState(false);

  // Load session on sessionId change
  useEffect(() => {
    const loaded = Storage.getSession(sessionId);
    if (loaded) {
      setSession(loaded);
    }
    setIsHeaderMenuOpen(false); // Close menu on session change
  }, [sessionId, allSessions]); 

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [session?.messages]);

  const handleSend = async () => {
    if (!input.trim() || !session) return;

    const agent = agents.find(a => a.id === session.agentId) || agents[0];

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      text: input,
      timestamp: new Date().toISOString()
    };

    const updatedSession = {
      ...session,
      messages: [...session.messages, userMessage],
      lastMessageAt: new Date().toISOString(),
      preview: input.substring(0, 50) + (input.length > 50 ? '...' : '')
    };

    setSession(updatedSession);
    Storage.saveSession(updatedSession);
    onSessionUpdate(); 
    setInput('');
    setIsLoading(true);

    const history = updatedSession.messages.map(m => ({
      role: m.role,
      parts: [{ text: m.text }]
    }));

    const responseText = await getDiagnostic(
      userMessage.text, 
      history, 
      agent.systemInstruction,
      true,
      agent.brandName
    );

    const modelMessage: Message = {
      id: (Date.now() + 1).toString(),
      role: 'model',
      text: responseText,
      timestamp: new Date().toISOString()
    };

    const finalSession = {
      ...updatedSession,
      messages: [...updatedSession.messages, modelMessage],
      lastMessageAt: new Date().toISOString(),
      title: updatedSession.messages.length === 1 ? input.substring(0, 30) : updatedSession.title
    };

    setSession(finalSession);
    Storage.saveSession(finalSession);
    onSessionUpdate();
    setIsLoading(false);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // --- SIDEBAR ACTIONS ---
  const startRenaming = (e: React.MouseEvent, s: ChatSession) => {
      e.stopPropagation();
      e.preventDefault();
      setEditingTitleId(s.id);
      setTempTitle(s.title);
  };

  const saveTitle = (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      e.preventDefault();
      if(tempTitle.trim()) {
          Storage.renameSession(id, tempTitle);
          onSessionUpdate();
      }
      setEditingTitleId(null);
  };

  const cancelRenaming = (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      setEditingTitleId(null);
  };

  const deleteSession = (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      e.preventDefault();
      if(confirm('Excluir esta conversa?')) {
        Storage.deleteSession(id);
        onSessionUpdate();
        if(id === sessionId) {
          // Instead of going to dashboard, switch to another session
          const remaining = allSessions.filter(s => s.id !== id && s.agentId === session?.agentId && !s.isArchived);
          if (remaining.length > 0) {
            onSelectSession(remaining[0].id);
          } else {
            onBack();
          }
        }
      }
  };

  // --- HEADER ACTIONS ---
  const handleExportChat = () => {
    if (!session) return;
    const content = session.messages.map(m => {
        const role = m.role === 'user' ? 'TÉCNICO' : 'ELEVEX';
        const time = new Date(m.timestamp).toLocaleString();
        return `[${time}] ${role}:\n${m.text}\n-------------------`;
    }).join('\n\n');

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `diagnostico-elevex-${session.id}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setIsHeaderMenuOpen(false);
  };

  const handleClearChat = () => {
      if (!session) return;
      if (confirm('Deseja limpar todas as mensagens desta conversa?')) {
          const clearedSession = { ...session, messages: [], preview: 'Conversa limpa' };
          setSession(clearedSession);
          Storage.saveSession(clearedSession);
          onSessionUpdate();
          setIsHeaderMenuOpen(false);
      }
  };

  const handleDeleteCurrentChat = () => {
      if (!session) return;
      if (confirm('Tem certeza que deseja excluir este diagnóstico permanentemente?')) {
          Storage.deleteSession(session.id);
          onSessionUpdate();
          onBack();
      }
  };


  if (!session) return <div className="p-10 text-center flex flex-col items-center justify-center h-full"><Loader2 className="animate-spin mb-2 text-voltz-primary" />Carregando...</div>;

  const agent = agents.find(a => a.id === session.agentId) || agents[0];
  const agentSessions = allSessions.filter(s => s.agentId === session.agentId && !s.isArchived).sort((a,b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());

  return (
    <div className="flex h-full bg-slate-50 relative overflow-hidden">
      
      {/* INTERNAL HISTORY SIDEBAR */}
      {/* Overlay for mobile */}
      {isHistoryOpen && (
        <div 
          className="fixed inset-0 bg-black/30 backdrop-blur-sm z-20 md:hidden"
          onClick={() => setIsHistoryOpen(false)}
        />
      )}
      <div className={`
          flex-shrink-0 bg-white border-r border-slate-200 transition-all duration-300 flex flex-col
          ${isHistoryOpen ? 'w-72 sm:w-80 translate-x-0' : 'w-0 -translate-x-full opacity-0 overflow-hidden'} 
          absolute md:relative h-full z-30 shadow-lg md:shadow-none
      `}>
          <div className="p-3 sm:p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
             <div className="flex items-center gap-2 overflow-hidden">
                <div className="p-1.5 bg-slate-200 rounded-lg">
                    <SidebarIcon size={16} className="text-slate-600" />
                </div>
                <span className="font-bold text-slate-700 text-sm truncate">{agent.name}</span>
             </div>
             <div className="flex items-center gap-1">
               <button onClick={() => onCreateSession(agent.id)} className="p-2 hover:bg-blue-100 text-blue-600 rounded-lg transition-colors" title="Novo Chat">
                   <Plus size={18} />
               </button>
               <button onClick={() => setIsHistoryOpen(false)} className="p-2 hover:bg-slate-100 text-slate-400 rounded-lg transition-colors md:hidden" title="Fechar">
                   <XIcon size={18} />
               </button>
             </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
              {agentSessions.map(s => (
                  <div 
                    key={s.id}
                    onClick={() => {
                        onSelectSession(s.id);
                        // Close sidebar on mobile after selecting
                        if (window.innerWidth < 768) setIsHistoryOpen(false);
                    }}
                    className={`
                        group relative p-3 rounded-xl mb-1 cursor-pointer transition-all border
                        ${s.id === sessionId 
                            ? 'bg-blue-50 border-blue-200 shadow-sm' 
                            : 'bg-transparent border-transparent hover:bg-slate-100 hover:border-slate-200'}
                    `}
                  >
                      {editingTitleId === s.id ? (
                           <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                               <input 
                                   autoFocus
                                   value={tempTitle}
                                   onChange={e => setTempTitle(e.target.value)}
                                   onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') saveTitle(e as any, s.id); if (e.key === 'Escape') { setEditingTitleId(null); } }}
                                   onClick={e => e.stopPropagation()}
                                   className="w-full text-xs p-1.5 border border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
                               />
                               <button onClick={(e) => saveTitle(e, s.id)} className="text-green-600 p-1.5 hover:bg-green-100 rounded-lg"><Check size={14}/></button>
                               <button onClick={cancelRenaming} className="text-red-500 p-1.5 hover:bg-red-100 rounded-lg"><XIcon size={14}/></button>
                           </div>
                      ) : (
                        <div className="flex justify-between items-start">
                             <div className="flex-1 min-w-0 pr-6">
                                <h4 className={`text-sm font-medium truncate ${s.id === sessionId ? 'text-blue-900' : 'text-slate-700'}`}>{s.title}</h4>
                                <p className="text-xs text-slate-400 truncate mt-0.5">{new Date(s.lastMessageAt).toLocaleDateString()}</p>
                             </div>
                             
                             {/* Hover Actions */}
                             <div className="absolute right-1 top-1 hidden group-hover:flex bg-white rounded-lg shadow-md border border-slate-200 overflow-hidden" onClick={e => e.stopPropagation()}>
                                 <button onClick={(e) => startRenaming(e, s)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors" title="Renomear"><Edit2 size={14} /></button>
                                 <button onClick={(e) => deleteSession(e, s.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors" title="Excluir"><Trash2 size={14} /></button>
                             </div>
                        </div>
                      )}
                  </div>
              ))}
          </div>
      </div>

      {/* MAIN CHAT AREA */}
      <div className="flex-1 flex flex-col h-full relative min-w-0">
        
        {/* Chat Header */}
        <div className="bg-white/90 backdrop-blur-md border-b border-slate-200 px-4 sm:px-6 py-4 flex items-center justify-between shadow-sm flex-shrink-0 z-20 relative">
            <div className="flex items-center gap-3">
                <button 
                    onClick={() => setIsHistoryOpen(!isHistoryOpen)} 
                    className={`p-2 rounded-lg transition-colors ${isHistoryOpen ? 'bg-blue-50 text-blue-600' : 'text-slate-500 hover:bg-slate-100'}`}
                >
                    <SidebarIcon size={20} />
                </button>
                <div className="h-6 w-px bg-slate-200 mx-1 hidden sm:block"></div>
                <button onClick={onBack} className="p-2 rounded-full hover:bg-slate-100 text-slate-500 hover:text-slate-900 transition-colors md:hidden">
                    <ArrowLeft size={20} />
                </button>
                <button onClick={onBack} className="hidden md:flex items-center gap-2 text-slate-500 hover:text-slate-900 text-sm font-medium transition-colors">
                    <ArrowLeft size={16} /> Voltar
                </button>
                
                <div className="ml-2">
                    <h2 className="font-bold text-slate-900 text-base sm:text-lg tracking-tight flex items-center gap-2">
                        {agent.name}
                        <div className="w-2 h-2 rounded-full bg-voltz-accent animate-pulse"></div>
                    </h2>
                </div>
            </div>
            
            <div className="relative">
                <button 
                    onClick={() => setIsHeaderMenuOpen(!isHeaderMenuOpen)}
                    className={`p-2 rounded-full transition-colors ${isHeaderMenuOpen ? 'bg-slate-100 text-slate-900' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-900'}`}
                >
                    <MoreVertical size={20} />
                </button>

                {isHeaderMenuOpen && (
                    <>
                        <div className="fixed inset-0 z-10" onClick={() => setIsHeaderMenuOpen(false)}></div>
                        <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl shadow-2xl border border-slate-100 z-20 py-2 animate-fade-in origin-top-right">
                             <div className="px-4 py-2 border-b border-slate-50 mb-1">
                                 <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Ações do Chat</span>
                             </div>
                             <button onClick={handleExportChat} className="w-full text-left px-4 py-3 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-3 transition-colors">
                                 <Download size={16} className="text-blue-500" /> Exportar Diagnóstico
                             </button>
                             <button onClick={handleClearChat} className="w-full text-left px-4 py-3 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-3 transition-colors">
                                 <Eraser size={16} className="text-amber-500" /> Limpar Mensagens
                             </button>
                             <div className="h-px bg-slate-100 my-1"></div>
                             <button onClick={handleDeleteCurrentChat} className="w-full text-left px-4 py-3 text-sm text-red-600 hover:bg-red-50 flex items-center gap-3 transition-colors font-medium">
                                 <Trash2 size={16} /> Excluir Diagnóstico
                             </button>
                        </div>
                    </>
                )}
            </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-8 z-10 custom-scrollbar bg-slate-50">
            {session.messages.length === 0 && (
            <div className="text-center py-10 sm:py-20 opacity-80 flex flex-col items-center animate-fade-in">
                <div className="w-16 h-16 sm:w-20 sm:h-20 bg-white rounded-full border border-slate-200 flex items-center justify-center mb-4 sm:mb-6 text-voltz-primary shadow-sm">
                    <Zap size={32} fill="currentColor" className="text-voltz-light stroke-voltz-accent sm:w-10 sm:h-10" />
                </div>
                <p className="text-slate-500 text-base sm:text-lg">Inicie o diagn&oacute;stico com <span className="text-slate-900 font-bold">{agent.name}</span>.</p>
                <p className="text-slate-400 text-xs sm:text-sm mt-2 max-w-sm px-4">O hist&oacute;rico de conversas deste especialista est&aacute; dispon&iacute;vel no menu lateral.</p>
            </div>
            )}
            
            {session.messages.map((message) => (
            <div
                key={message.id}
                className={`flex w-full ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
                <div
                className={`flex max-w-[95%] sm:max-w-[80%] lg:max-w-[70%] ${
                    message.role === 'user' ? 'flex-row-reverse' : 'flex-row'
                }`}
                >
                <div
                    className={`relative px-6 py-4 rounded-2xl shadow-sm text-sm sm:text-base leading-relaxed overflow-hidden border ${
                    message.role === 'user'
                        ? 'bg-gradient-to-br from-voltz-accent to-blue-600 text-white rounded-tr-sm border-transparent'
                        : 'bg-white text-slate-700 rounded-tl-sm border-slate-200'
                    }`}
                >
                    {message.role === 'model' ? (
                        <div className="markdown-body text-slate-700 space-y-4">
                            <ReactMarkdown 
                                components={{
                                    h1: ({node, ...props}) => <h1 className="text-xl font-bold text-slate-900 mt-6 mb-3 pb-2 border-b border-slate-200 first:mt-0" {...props} />,
                                    h2: ({node, ...props}) => <h2 className="text-base font-bold text-slate-900 mt-5 mb-2 first:mt-0 flex items-center gap-1.5" {...props} />,
                                    h3: ({node, ...props}) => <h3 className="text-sm font-bold text-slate-800 mt-4 mb-2 first:mt-0 uppercase tracking-wide" {...props} />,
                                    p: ({node, ...props}) => <p className="mb-4 last:mb-0 leading-7 text-slate-600" {...props} />,
                                    ul: ({node, ...props}) => <ul className="mb-4 ml-1 space-y-2 list-none" {...props} />,
                                    ol: ({node, ...props}) => <ol className="mb-4 ml-1 space-y-2 list-decimal list-inside" {...props} />,
                                    li: ({node, children, ...props}) => (
                                      <li className="flex items-center gap-2.5 leading-7 text-slate-600" {...props}>
                                        <span className="text-blue-500 leading-none flex-shrink-0">•</span>
                                        <span>{children}</span>
                                      </li>
                                    ),
                                    strong: ({node, ...props}) => <strong className="text-slate-900 font-semibold bg-blue-50/60 px-1 rounded" {...props} />,
                                    em: ({node, ...props}) => <em className="text-slate-500 italic" {...props} />,
                                    code: ({node, ...props}) => <code className="bg-slate-100 text-blue-700 px-1.5 py-0.5 rounded font-mono text-xs border border-slate-200" {...props} />,
                                    hr: ({node, ...props}) => <hr className="my-5 border-slate-200" {...props} />,
                                    blockquote: ({node, ...props}) => <blockquote className="border-l-4 border-blue-400 bg-blue-50/50 pl-4 py-3 my-4 rounded-r-lg text-slate-600" {...props} />,
                                    a: ({node, ...props}) => <a className="text-blue-600 underline hover:text-blue-800" target="_blank" rel="noreferrer" {...props} />,
                                    table: ({node, ...props}) => <div className="overflow-x-auto my-4"><table className="min-w-full text-sm border border-slate-200 rounded-lg overflow-hidden" {...props} /></div>,
                                    thead: ({node, ...props}) => <thead className="bg-slate-100" {...props} />,
                                    th: ({node, ...props}) => <th className="px-3 py-2.5 text-left font-bold text-slate-800 border-b border-slate-200" {...props} />,
                                    td: ({node, ...props}) => <td className="px-3 py-2.5 border-b border-slate-100" {...props} />,
                                }}
                            >
                                {message.text}
                            </ReactMarkdown>
                        </div>
                    ) : (
                        <p className="whitespace-pre-wrap">{message.text}</p>
                    )}
                    <div className={`text-[10px] mt-2 text-right font-medium tracking-wide ${message.role === 'user' ? 'text-blue-100' : 'text-slate-400'}`}>
                    {new Date(message.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                    </div>
                </div>
                </div>
            </div>
            ))}
            
            {isLoading && (
            <div className="flex justify-start animate-fade-in">
                <div className="flex items-center space-x-3 bg-white px-5 py-3 rounded-2xl rounded-tl-sm border border-slate-200 shadow-sm">
                    <Loader2 className="w-4 h-4 text-voltz-primary animate-spin" />
                    <span className="text-slate-500 text-sm font-medium">Analisando base de dados...</span>
                </div>
            </div>
            )}
            <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="bg-white/80 backdrop-blur border-t border-slate-200 p-3 sm:p-4 md:p-6 shadow-lg z-20">
            <div className="max-w-4xl mx-auto relative flex items-center">
            <div className="flex-1 relative group">
                <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder={`Descreva a falha ou código de erro...`}
                className="w-full bg-slate-50 text-slate-900 placeholder-slate-400 border border-slate-300 rounded-xl py-3 sm:py-4 pl-4 sm:pl-5 pr-12 sm:pr-14 focus:ring-2 focus:ring-voltz-accent/30 focus:border-voltz-accent focus:bg-white transition-all shadow-inner text-sm sm:text-base"
                disabled={isLoading}
                autoFocus
                />
                <button
                onClick={handleSend}
                disabled={!input.trim() || isLoading}
                className={`absolute right-2 top-2 bottom-2 aspect-square rounded-lg flex items-center justify-center transition-all duration-300 ${
                    !input.trim() || isLoading
                    ? 'bg-transparent text-slate-300 cursor-not-allowed'
                    : 'bg-voltz-accent text-white hover:bg-cyan-600 shadow-md transform hover:scale-105'
                }`}
                >
                <Send className="w-5 h-5" />
                </button>
            </div>
            </div>
            <p className="text-center text-[10px] sm:text-xs text-slate-500 mt-2 sm:mt-3 flex items-center justify-center gap-1">
                <Shield size={10} className="text-slate-400"/>
                <span className="hidden sm:inline">Ambiente Seguro. As respostas são geradas por IA e revisadas por normas técnicas.</span>
                <span className="sm:hidden">Respostas geradas por IA</span>
            </p>
        </div>
      </div>
    </div>
  );
};

export default ChatSessionView;
