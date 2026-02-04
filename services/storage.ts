
import { ChatSession, Message, UserProfile, Agent, DEFAULT_AGENTS } from '../types';

const CHATS_KEY = 'elevex_chats';
const CURRENT_USER_KEY = 'elevex_current_user';
const ADMIN_USERS_KEY = 'elevex_admin_users';
const CUSTOM_AGENTS_KEY = 'elevex_custom_agents';

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

export const logout = () => {
    localStorage.removeItem(CURRENT_USER_KEY);
};

export const getUserProfile = (): UserProfile | null => {
  const stored = localStorage.getItem(CURRENT_USER_KEY);
  return stored ? JSON.parse(stored) : null;
};

// --- AGENTS MANAGEMENT ---

export const getAgents = (): Agent[] => {
    const stored = localStorage.getItem(CUSTOM_AGENTS_KEY);
    const customAgents: Agent[] = stored ? JSON.parse(stored) : [];
    
    // In a real app, we might filter by Company ID. 
    // Here, we assume Custom Agents are created by Admins for ALL users to use.
    return [...DEFAULT_AGENTS, ...customAgents];
};

export const saveAgent = (agent: Agent) => {
    const stored = localStorage.getItem(CUSTOM_AGENTS_KEY);
    const customAgents: Agent[] = stored ? JSON.parse(stored) : [];
    
    const index = customAgents.findIndex(a => a.id === agent.id);
    if (index >= 0) {
        customAgents[index] = agent;
    } else {
        customAgents.push(agent);
    }
    localStorage.setItem(CUSTOM_AGENTS_KEY, JSON.stringify(customAgents));
};

export const deleteAgent = (agentId: string) => {
    const stored = localStorage.getItem(CUSTOM_AGENTS_KEY);
    let customAgents: Agent[] = stored ? JSON.parse(stored) : [];
    customAgents = customAgents.filter(a => a.id !== agentId);
    localStorage.setItem(CUSTOM_AGENTS_KEY, JSON.stringify(customAgents));
};


// --- CHAT SESSIONS ---

export const getSessions = (includeArchived = false): ChatSession[] => {
  const user = getUserProfile();
  if (!user) return [];

  const stored = localStorage.getItem(CHATS_KEY);
  const allSessions: ChatSession[] = stored ? JSON.parse(stored) : [];
  
  // FILTER BY USER ID (Separated Access)
  const userSessions = allSessions.filter(s => s.userId === user.id);

  if (includeArchived) return userSessions;
  return userSessions.filter(s => !s.isArchived);
};

export const getSession = (id: string): ChatSession | undefined => {
  const sessions = getSessions(true);
  return sessions.find(s => s.id === id);
};

export const saveSession = (session: ChatSession) => {
  const stored = localStorage.getItem(CHATS_KEY);
  let allSessions: ChatSession[] = stored ? JSON.parse(stored) : [];
  
  const index = allSessions.findIndex(s => s.id === session.id);
  
  if (index >= 0) {
    allSessions[index] = session;
  } else {
    allSessions.unshift(session);
  }
  
  localStorage.setItem(CHATS_KEY, JSON.stringify(allSessions));
};

export const deleteSession = (id: string) => {
  const stored = localStorage.getItem(CHATS_KEY);
  let allSessions: ChatSession[] = stored ? JSON.parse(stored) : [];
  
  const newSessions = allSessions.filter(s => s.id !== id);
  localStorage.setItem(CHATS_KEY, JSON.stringify(newSessions));
};

export const archiveSession = (id: string, archive: boolean) => {
  const stored = localStorage.getItem(CHATS_KEY);
  let allSessions: ChatSession[] = stored ? JSON.parse(stored) : [];
  
  const index = allSessions.findIndex(s => s.id === id);
  if (index >= 0) {
      allSessions[index].isArchived = archive;
      localStorage.setItem(CHATS_KEY, JSON.stringify(allSessions));
  }
};

export const renameSession = (id: string, newTitle: string) => {
  const stored = localStorage.getItem(CHATS_KEY);
  let allSessions: ChatSession[] = stored ? JSON.parse(stored) : [];
  
  const index = allSessions.findIndex(s => s.id === id);
  if (index >= 0) {
      allSessions[index].title = newTitle;
      localStorage.setItem(CHATS_KEY, JSON.stringify(allSessions));
  }
};

export const createNewSession = (agentId: string): ChatSession => {
  const user = getUserProfile();
  if (!user) throw new Error("User not authenticated");

  const newSession: ChatSession = {
    id: Date.now().toString(),
    userId: user.id, // Bind to current user
    agentId,
    title: 'Novo Diagnóstico',
    lastMessageAt: new Date().toISOString(),
    preview: 'Inicie a conversa...',
    messages: []
  };
  saveSession(newSession);
  return newSession;
};

// --- ADMIN MOCK DATA ---

const MOCK_USERS_DB: UserProfile[] = [
    { ...USER_PROFILE }, // Include the current mock user in the list
    {
        id: 'u_1',
        name: 'Ana Souza',
        company: 'Manutenção Express',
        email: 'ana@express.com',
        plan: 'Profissional',
        creditsUsed: 50,
        creditsLimit: 'Infinity',
        status: 'active',
        joinedAt: '2023-11-01',
        nextBillingDate: '2024-06-01',
        tokenUsage: { currentMonth: 45000, lastMonth: 40000, history: [30, 40, 45] }
    },
    {
        id: 'u_2',
        name: 'Roberto Lima',
        company: 'RL Elevadores',
        email: 'beto@rl.com',
        plan: 'Iniciante',
        creditsUsed: 10,
        creditsLimit: 150,
        status: 'overdue',
        joinedAt: '2024-01-15',
        nextBillingDate: '2024-05-15',
        tokenUsage: { currentMonth: 5000, lastMonth: 8000, history: [10, 8, 5] }
    }
];

export const getAdminUsers = (): UserProfile[] => {
    const stored = localStorage.getItem(ADMIN_USERS_KEY);
    if (stored) return JSON.parse(stored);
    
    // Initialize
    localStorage.setItem(ADMIN_USERS_KEY, JSON.stringify(MOCK_USERS_DB));
    return MOCK_USERS_DB;
};

export const toggleUserStatus = (userId: string, newStatus: 'active' | 'inactive') => {
    const users = getAdminUsers();
    const index = users.findIndex(u => u.id === userId);
    if (index >= 0) {
        users[index].status = newStatus;
        localStorage.setItem(ADMIN_USERS_KEY, JSON.stringify(users));
        return users;
    }
    return users;
};

export const getFinancialMetrics = () => {
    const users = getAdminUsers();
    const totalUsers = users.length;
    const activeUsers = users.filter(u => u.status === 'active').length;
    
    // Mock calculations
    const mrr = users.reduce((acc, user) => {
        if (user.status !== 'active') return acc;
        if (user.plan === 'Iniciante') return acc + 9.99;
        if (user.plan === 'Profissional') return acc + 19.99;
        if (user.plan === 'Empresa') return acc + 99.99;
        return acc;
    }, 0);

    return {
        totalUsers,
        activeUsers,
        mrr: mrr.toFixed(2),
        churnRate: '2.4%'
    };
};
