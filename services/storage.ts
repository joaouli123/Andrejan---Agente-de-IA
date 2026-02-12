import { ChatSession, Message, UserProfile, Agent, DEFAULT_AGENTS, Brand, Model } from '../types';
import { supabase } from './supabase';

// Storage service for local data management
const CHATS_KEY = 'elevex_chats';
const CURRENT_USER_KEY = 'elevex_current_user';
const ADMIN_USERS_KEY = 'elevex_admin_users';
const BRANDS_KEY = 'elevex_brands';
const MODELS_KEY = 'elevex_models';

// --- MOCK PROFILES ---
const ADMIN_PROFILE: UserProfile = {
    id: 'admin_001',
    name: 'Roberto Administrador',
    company: 'Elevex Corp',
    email: 'admin@elevex.com',
    plan: 'Empresa',
    creditsUsed: 1420,
    creditsLimit: 'Infinity',
    isAdmin: true,
    status: 'active',
    joinedAt: '2023-01-01',
    nextBillingDate: '2024-12-31',
    tokenUsage: { currentMonth: 540000, lastMonth: 420000, history: [300, 400, 540] }
};

const USER_PROFILE: UserProfile = {
    id: 'user_001',
    name: 'Carlos Técnico',
    company: 'Elevadores Brasil',
    email: 'carlos@tecnico.com',
    plan: 'Profissional',
    creditsUsed: 45,
    creditsLimit: 500, // Fixed limit for demo
    isAdmin: false,
    status: 'active',
    joinedAt: '2024-02-15',
    nextBillingDate: '2024-06-15',
    tokenUsage: { currentMonth: 12000, lastMonth: 8000, history: [5, 8, 12] }
};

// --- AUTH ---

export const login = (type: 'admin' | 'user'): UserProfile => {
    const profile = type === 'admin' ? ADMIN_PROFILE : USER_PROFILE;
    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(profile));
    return profile;
};

export const signup = (data: Partial<UserProfile>): UserProfile => {
    const newProfile: UserProfile = {
        id: 'user_002',
        name: data.name || 'Novo Usuário',
        company: data.company || 'Empresa',
        email: data.email || 'user@email.com',
        plan: data.plan || 'Free',
        creditsUsed: 0,
        creditsLimit: 10,
        isAdmin: false,
        status: 'pending_payment', // Default for new signups
        joinedAt: new Date().toISOString().split('T')[0],
        nextBillingDate: new Date().toISOString().split('T')[0],
        tokenUsage: { currentMonth: 0, lastMonth: 0, history: [] }
    };
    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(newProfile));
    return newProfile;
};

export const updateUserProfile = (updates: Partial<UserProfile>) => {
    const user = getUserProfile();
    if (user) {
        const updated = { ...user, ...updates };
        localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(updated));
        return updated;
    }
    return null;
};

export const logout = () => {
    localStorage.removeItem(CURRENT_USER_KEY);
};

export const getUserProfile = (): UserProfile | null => {
    const stored = localStorage.getItem(CURRENT_USER_KEY);
    return stored ? JSON.parse(stored) : null;
};

// --- DATA ---

export const getChats = (): ChatSession[] => {
    const stored = localStorage.getItem(CHATS_KEY);
    return stored ? JSON.parse(stored) : [];
};

export const saveChat = (chat: ChatSession) => {
    const chats = getChats();
    const index = chats.findIndex(c => c.id === chat.id);
    if (index >= 0) {
        chats[index] = chat;
    } else {
        chats.push(chat);
    }
    localStorage.setItem(CHATS_KEY, JSON.stringify(chats));
};

// --- SESSIONS ---

export const getSessions = (includeAllUsers?: boolean): ChatSession[] => {
    const allChats = getChats();
    const user = getUserProfile();
    
    if (!user) return [];
    
    // If admin and includeAllUsers is true, return all sessions
    if (includeAllUsers && user.isAdmin) {
        return allChats;
    }
    
    // Otherwise, return only user's sessions
    return allChats.filter(chat => chat.userId === user.id);
};

export const createNewSession = (agentId: string): ChatSession => {
    const user = getUserProfile();
    if (!user) {
        throw new Error('No user logged in');
    }
    
    const agents = getAgents();
    const agent = agents.find(a => a.id === agentId);
    const agentName = agent?.name || 'Assistente';
    
    const newSession: ChatSession = {
        id: `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        userId: user.id,
        agentId,
        title: `Conversa com ${agentName}`,
        lastMessageAt: new Date().toISOString(),
        preview: 'Nova conversa iniciada',
        isArchived: false,
        messages: []
    };
    
    saveChat(newSession);
    return newSession;
};

export const deleteSession = (sessionId: string) => {
    const user = getUserProfile();
    const chats = getChats();
    const session = chats.find(c => c.id === sessionId);
    // Only allow deleting own sessions (or admin can delete any)
    if (session && user && (session.userId === user.id || user.isAdmin)) {
        const filtered = chats.filter(c => c.id !== sessionId);
        localStorage.setItem(CHATS_KEY, JSON.stringify(filtered));
    }
};

export const getSession = (sessionId: string): ChatSession | null => {
    const user = getUserProfile();
    const chats = getChats();
    const session = chats.find(c => c.id === sessionId) || null;
    // Only return session if it belongs to the current user (or admin)
    if (session && user && (session.userId === user.id || user.isAdmin)) {
        return session;
    }
    return null;
};

export const saveSession = (session: ChatSession) => {
    saveChat(session);
};

export const renameSession = (sessionId: string, newTitle: string) => {
    const user = getUserProfile();
    const chats = getChats();
    const session = chats.find(c => c.id === sessionId);
    if (session && user && (session.userId === user.id || user.isAdmin)) {
        session.title = newTitle;
        saveChat(session);
    }
};

export const archiveSession = (sessionId: string, archived: boolean) => {
    const user = getUserProfile();
    const chats = getChats();
    const session = chats.find(c => c.id === sessionId);
    if (session && user && (session.userId === user.id || user.isAdmin)) {
        session.isArchived = archived;
        saveChat(session);
    }
};

// --- AGENTS ---

let runtimeAgents: Agent[] = [...DEFAULT_AGENTS];

const clearLegacyAgentLocalData = () => {
    localStorage.removeItem('elevex_custom_agents');
    localStorage.removeItem('elevex_agents_cache');
};

export const getAgents = (): Agent[] => {
    return runtimeAgents;
};

export const saveAgent = (agent: Agent) => {
    const index = runtimeAgents.findIndex((a: Agent) => a.id === agent.id);
    if (index >= 0) {
        runtimeAgents[index] = agent;
    } else {
        runtimeAgents.push(agent);
    }
};

export const deleteAgent = (agentId: string) => {
    runtimeAgents = runtimeAgents.filter((a: Agent) => a.id !== agentId);
};

type SupabaseAgentRow = {
    id: string;
    name: string;
    role: string | null;
    description: string | null;
    icon: string | null;
    color: string | null;
    system_instruction: string | null;
    is_custom: boolean | null;
    created_by: string | null;
    brands?: { name?: string } | null;
};

const REMOVED_AGENT_IDS = new Set(['general-tech', 'code-master']);

const mapSupabaseAgentToApp = (row: SupabaseAgentRow): Agent => ({
    id: row.id,
    name: row.name,
    role: row.role || '',
    description: row.description || '',
    icon: row.icon || 'Bot',
    color: row.color || 'blue',
    systemInstruction: row.system_instruction || '',
    brandName: row.brands?.name || undefined,
    isCustom: !!row.is_custom,
    createdBy: row.created_by || undefined,
});

const setAgentsCache = (agents: Agent[]) => {
    runtimeAgents = agents;
};

export const syncAgentsFromDatabase = async (): Promise<Agent[]> => {
    try {
        clearLegacyAgentLocalData();
        const user = getUserProfile();

        await supabase
            .from('agents')
            .delete()
            .in('id', Array.from(REMOVED_AGENT_IDS));

        const { data, error } = await supabase
            .from('agents')
            .select('id,name,role,description,icon,color,system_instruction,is_custom,created_by,brand_id,brands(name)')
            .order('name');

        if (error || !data) {
            return runtimeAgents;
        }

        const allAgents = (data as SupabaseAgentRow[]).map(mapSupabaseAgentToApp);

        // Padrão + custom do usuário logado
        const filtered = allAgents.filter(a => {
            if (REMOVED_AGENT_IDS.has(a.id)) return false;
            return !a.isCustom || (user && a.createdBy === user.id);
        });
        setAgentsCache(filtered);
        return filtered;
    } catch {
        return runtimeAgents;
    }
};

export const saveAgentToDatabase = async (agent: Agent): Promise<Agent> => {
    if (REMOVED_AGENT_IDS.has(agent.id)) {
        throw new Error('Este agente foi removido e não pode ser recriado com o mesmo ID');
    }

    const user = getUserProfile();

    // Resolve brand_id pela brandName (quando informado)
    let brandId: string | null = null;
    if (agent.brandName) {
        const { data: brand } = await supabase
            .from('brands')
            .select('id')
            .eq('name', agent.brandName)
            .maybeSingle();
        brandId = brand?.id || null;
    }

    const payload = {
        id: agent.id,
        name: agent.name,
        role: agent.role,
        description: agent.description,
        icon: agent.icon,
        color: agent.color,
        system_instruction: agent.systemInstruction,
        brand_id: brandId,
        is_custom: true,
        created_by: user?.id || agent.createdBy || null,
    };

    const { error } = await supabase.from('agents').upsert([payload]);
    if (error) {
        throw new Error(error.message || 'Falha ao salvar agente no banco');
    }

    await syncAgentsFromDatabase();
    return agent;
};

export const deleteAgentFromDatabase = async (agentId: string): Promise<void> => {
    try {
        const user = getUserProfile();
        let query = supabase.from('agents').delete().eq('id', agentId);
        if (user?.id) query = query.eq('created_by', user.id);

        const { error } = await query;
        if (error) {
            throw new Error(error.message || 'Falha ao excluir agente no banco');
        }

        await syncAgentsFromDatabase();
    } catch {
        throw new Error('Falha ao excluir agente no banco');
    }
};

// --- ADMIN ---

export const getAdminUsers = (): UserProfile[] => {
    // Mock data for admin users management
    return [
        ADMIN_PROFILE,
        USER_PROFILE,
        {
            id: 'user_003',
            name: 'Maria Silva',
            company: 'Elevadores São Paulo',
            email: 'maria@elevsp.com',
            plan: 'Iniciante',
            creditsUsed: 15,
            creditsLimit: 100,
            isAdmin: false,
            status: 'active',
            joinedAt: '2024-03-01',
            nextBillingDate: '2024-07-01',
            tokenUsage: { currentMonth: 3500, lastMonth: 2800, history: [2, 3, 3.5] }
        }
    ];
};

export const toggleUserStatus = (userId: string, newStatus: 'active' | 'inactive' | 'overdue' | 'pending_payment'): UserProfile[] => {
    const users = getAdminUsers();
    const user = users.find(u => u.id === userId);
    if (user) {
        user.status = newStatus;
    }
    return users;
};

export const getFinancialMetrics = () => {
    return {
        revenue: {
            current: 12450,
            previous: 10890,
            change: 14.3
        },
        activeUsers: {
            current: 248,
            previous: 221,
            change: 12.2
        },
        avgTicket: {
            current: 50.2,
            previous: 49.3,
            change: 1.8
        },
        churnRate: {
            current: 2.4,
            previous: 3.1,
            change: -22.6
        }
    };
};

// --- BRANDS & MODELS ---

export const getBrands = (): Brand[] => {
    const stored = localStorage.getItem(BRANDS_KEY);
    if (!stored) {
        // Initialize with default brands
        const defaultBrands: Brand[] = [
            { id: 'brand_001', name: 'Schindler', created_at: new Date().toISOString() },
            { id: 'brand_002', name: 'Otis', created_at: new Date().toISOString() },
            { id: 'brand_003', name: 'Thyssenkrupp', created_at: new Date().toISOString() },
            { id: 'brand_004', name: 'Atlas', created_at: new Date().toISOString() }
        ];
        localStorage.setItem(BRANDS_KEY, JSON.stringify(defaultBrands));
        return defaultBrands;
    }
    return JSON.parse(stored);
};

export const saveBrand = (brand: Brand): Brand => {
    const brands = getBrands();
    const existing = brands.findIndex(b => b.id === brand.id);
    
    if (existing >= 0) {
        brands[existing] = brand;
    } else {
        // New brand
        if (!brand.id) {
            brand.id = `brand_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        }
        if (!brand.created_at) {
            brand.created_at = new Date().toISOString();
        }
        brands.push(brand);
    }
    
    localStorage.setItem(BRANDS_KEY, JSON.stringify(brands));
    return brand;
};

export const updateBrand = (brandId: string, updates: Partial<Brand>): Brand | null => {
    const brands = getBrands();
    const index = brands.findIndex(b => b.id === brandId);
    
    if (index >= 0) {
        brands[index] = { ...brands[index], ...updates };
        localStorage.setItem(BRANDS_KEY, JSON.stringify(brands));
        return brands[index];
    }
    
    return null;
};

export const deleteBrand = (brandId: string) => {
    const brands = getBrands();
    const filtered = brands.filter(b => b.id !== brandId);
    localStorage.setItem(BRANDS_KEY, JSON.stringify(filtered));
    
    // Also delete associated models
    const models = getModels();
    const filteredModels = models.filter(m => m.brand_id !== brandId);
    localStorage.setItem(MODELS_KEY, JSON.stringify(filteredModels));
};

export const getModels = (brandId?: string): Model[] => {
    const stored = localStorage.getItem(MODELS_KEY);
    const models = stored ? JSON.parse(stored) : [];
    
    if (brandId) {
        return models.filter((m: Model) => m.brand_id === brandId);
    }
    
    return models;
};

export const saveModel = (model: Model): Model => {
    const models = getModels();
    const existing = models.findIndex(m => m.id === model.id);
    
    if (existing >= 0) {
        models[existing] = model;
    } else {
        // New model
        if (!model.id) {
            model.id = `model_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        }
        if (!model.created_at) {
            model.created_at = new Date().toISOString();
        }
        models.push(model);
    }
    
    localStorage.setItem(MODELS_KEY, JSON.stringify(models));
    return model;
};

export const updateModel = (modelId: string, updates: Partial<Model>): Model | null => {
    const models = getModels();
    const index = models.findIndex(m => m.id === modelId);
    
    if (index >= 0) {
        models[index] = { ...models[index], ...updates };
        localStorage.setItem(MODELS_KEY, JSON.stringify(models));
        return models[index];
    }
    
    return null;
};

export const deleteModel = (modelId: string) => {
    const models = getModels();
    const filtered = models.filter(m => m.id !== modelId);
    localStorage.setItem(MODELS_KEY, JSON.stringify(filtered));
};
