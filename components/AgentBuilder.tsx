
import React, { useState } from 'react';
import { UserProfile, Agent } from '../types';
import * as Storage from '../services/storage';
import { 
    Bot, Save, Trash2, Edit3, Plus, Terminal, 
    BookOpen, Sparkles, Check, X, AlertCircle 
} from 'lucide-react';
import * as Icons from 'lucide-react';

interface AgentBuilderProps {
    user: UserProfile;
    onAgentCreated: () => void;
}

const ICONS_LIST = ['Bot', 'Zap', 'Wrench', 'Shield', 'Code', 'Database', 'Cpu', 'Activity', 'Search', 'BookOpen', 'Terminal'];

const AgentBuilder: React.FC<AgentBuilderProps> = ({ user, onAgentCreated }) => {
    const [agents, setAgents] = useState<Agent[]>(Storage.getAgents());
    const [view, setView] = useState<'list' | 'create'>('list');
    
    // Form State
    const [name, setName] = useState('');
    const [role, setRole] = useState('');
    const [description, setDescription] = useState('');
    const [instruction, setInstruction] = useState('');
    const [selectedIcon, setSelectedIcon] = useState('Bot');

    const handleCreate = (e: React.FormEvent) => {
        e.preventDefault();
        
        const newAgent: Agent = {
            id: `custom_${Date.now()}`,
            name,
            role,
            description,
            icon: selectedIcon,
            color: 'blue',
            systemInstruction: instruction,
            isCustom: true,
            createdBy: user.id
        };

        Storage.saveAgent(newAgent);
        setAgents(Storage.getAgents()); // Refresh list
        onAgentCreated(); // Notify parent
        resetForm();
        setView('list');
    };

    const handleDelete = (id: string) => {
        if (confirm('Tem certeza que deseja excluir este agente?')) {
            Storage.deleteAgent(id);
            setAgents(Storage.getAgents());
            onAgentCreated();
        }
    };

    const resetForm = () => {
        setName('');
        setRole('');
        setDescription('');
        setInstruction('');
        setSelectedIcon('Bot');
    };

    if (view === 'create') {
        // @ts-ignore
        const SelectedIconComp = Icons[selectedIcon] || Icons.Bot;

        return (
            <div className="h-full overflow-y-auto p-6 lg:p-12 bg-slate-50">
                <div className="max-w-3xl mx-auto">
                    <div className="flex items-center gap-4 mb-8">
                        <button onClick={() => setView('list')} className="p-2 hover:bg-white rounded-lg border border-transparent hover:border-slate-200 transition-all">
                            <X className="text-slate-500" />
                        </button>
                        <h1 className="text-2xl font-bold text-slate-900">Criar Novo Especialista</h1>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        {/* Form */}
                        <div className="lg:col-span-2 space-y-6">
                            <form onSubmit={handleCreate} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-5">
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-2">Nome do Agente</label>
                                    <input 
                                        required
                                        type="text" 
                                        value={name}
                                        onChange={e => setName(e.target.value)}
                                        placeholder="Ex: Especialista Atlas Schindler"
                                        className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-2">Função (Role)</label>
                                    <input 
                                        required
                                        type="text" 
                                        value={role}
                                        onChange={e => setRole(e.target.value)}
                                        placeholder="Ex: Tira-dúvidas de Manuais"
                                        className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-2">Descrição Curta</label>
                                    <input 
                                        required
                                        type="text" 
                                        value={description}
                                        onChange={e => setDescription(e.target.value)}
                                        placeholder="Ex: Focado nos manuais da linha 3300 e 5500."
                                        className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-2">Ícone</label>
                                    <div className="flex flex-wrap gap-3">
                                        {ICONS_LIST.map(icon => {
                                            // @ts-ignore
                                            const I = Icons[icon];
                                            return (
                                                <button
                                                    key={icon}
                                                    type="button"
                                                    onClick={() => setSelectedIcon(icon)}
                                                    className={`p-3 rounded-lg border transition-all ${selectedIcon === icon ? 'bg-blue-50 border-blue-500 text-blue-600' : 'bg-slate-50 border-slate-200 text-slate-400 hover:bg-slate-100'}`}
                                                >
                                                    <I size={20} />
                                                </button>
                                            )
                                        })}
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-2 flex items-center justify-between">
                                        <span>Instrução de Sistema (O Cérebro)</span>
                                        <span className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded">Segredo da IA</span>
                                    </label>
                                    <p className="text-xs text-slate-500 mb-2">
                                        Aqui você "alimenta" a IA. Cole manuais, descreva comportamentos ou defina regras estritas.
                                    </p>
                                    <textarea 
                                        required
                                        value={instruction}
                                        onChange={e => setInstruction(e.target.value)}
                                        rows={6}
                                        placeholder="Você é um especialista na linha Schindler 3300. Seus conhecimentos incluem..."
                                        className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none font-mono text-sm bg-slate-50"
                                    />
                                </div>

                                <div className="pt-4 border-t border-slate-100 flex justify-end gap-3">
                                    <button 
                                        type="button" 
                                        onClick={() => setView('list')}
                                        className="px-6 py-2.5 text-slate-600 font-medium hover:bg-slate-100 rounded-lg transition-colors"
                                    >
                                        Cancelar
                                    </button>
                                    <button 
                                        type="submit"
                                        className="px-6 py-2.5 bg-slate-900 text-white font-bold rounded-lg hover:bg-slate-800 transition-transform active:scale-95 flex items-center gap-2"
                                    >
                                        <Save size={18} /> Salvar Agente
                                    </button>
                                </div>
                            </form>
                        </div>

                        {/* Preview */}
                        <div className="lg:col-span-1">
                            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Pré-visualização</h3>
                            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-lg relative overflow-hidden h-64 flex flex-col">
                                <div className="absolute -right-6 -top-6 text-slate-100 opacity-50">
                                    <SelectedIconComp size={140} />
                                </div>
                                <div className="relative z-10 flex-1">
                                    <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-200 mb-4">
                                        <SelectedIconComp size={24} />
                                    </div>
                                    <h3 className="text-xl font-bold text-slate-900 mb-1">{name || 'Nome do Agente'}</h3>
                                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">{role || 'Função'}</p>
                                    <p className="text-slate-600 text-sm">{description || 'Descrição breve do especialista...'}</p>
                                </div>
                            </div>
                            
                            <div className="mt-6 bg-blue-50 border border-blue-100 p-4 rounded-xl">
                                <h4 className="flex items-center text-blue-800 font-bold text-sm mb-2">
                                    <Sparkles size={16} className="mr-2" /> Dica Pro
                                </h4>
                                <p className="text-xs text-blue-700">
                                    Quanto mais detalhada a "Instrução de Sistema", melhor o agente se comportará. Você pode colar trechos de manuais técnicos.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full overflow-y-auto p-6 lg:p-12 bg-slate-50">
            <div className="max-w-6xl mx-auto">
                <div className="flex flex-col md:flex-row md:items-center justify-between mb-10 gap-4">
                    <div>
                        <h1 className="text-3xl font-extrabold text-slate-900 flex items-center gap-3">
                            <Bot className="text-slate-900" /> Meus Agentes
                        </h1>
                        <p className="text-slate-500 mt-2">Crie, treine e gerencie seus especialistas virtuais.</p>
                    </div>
                    <button 
                        onClick={() => setView('create')}
                        className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-blue-200 hover:bg-blue-700 transition-all flex items-center gap-2"
                    >
                        <Plus size={20} /> Criar Novo Agente
                    </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {agents.filter(a => a.isCustom).length === 0 && (
                        <div className="col-span-full py-16 text-center border-2 border-dashed border-slate-200 rounded-2xl bg-white">
                            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-300">
                                <Bot size={32} />
                            </div>
                            <h3 className="text-lg font-bold text-slate-900">Nenhum agente personalizado</h3>
                            <p className="text-slate-500 mt-2 max-w-md mx-auto">
                                Você ainda não criou nenhum especialista. Clique em "Criar Novo Agente" para começar.
                            </p>
                        </div>
                    )}

                    {agents.filter(a => a.isCustom).map(agent => {
                        // @ts-ignore
                        const Icon = Icons[agent.icon] || Icons.Bot;
                        return (
                            <div key={agent.id} className="bg-white rounded-2xl border border-slate-200 p-6 hover:shadow-lg transition-shadow relative group">
                                <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button 
                                        onClick={() => handleDelete(agent.id)}
                                        className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </div>

                                <div className="w-12 h-12 bg-slate-900 rounded-xl flex items-center justify-center text-white mb-4">
                                    <Icon size={24} />
                                </div>
                                <h3 className="font-bold text-slate-900 text-lg">{agent.name}</h3>
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">{agent.role}</p>
                                <p className="text-sm text-slate-600 line-clamp-2 mb-4">{agent.description}</p>
                                
                                <div className="flex items-center text-xs text-slate-400 gap-1 bg-slate-50 p-2 rounded-lg border border-slate-100">
                                    <Terminal size={12} />
                                    <span className="truncate flex-1 font-mono">{agent.systemInstruction.substring(0, 30)}...</span>
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>
        </div>
    );
};

export default AgentBuilder;
