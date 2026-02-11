
export interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: string;
}

export interface Brand {
  id: string;
  name: string;
  logo_url?: string;
  created_at?: string;
}

export interface Model {
  id: string;
  brand_id: string;
  name: string;
  description?: string;
  created_at?: string;
}

export interface SourceFile {
  id: string;
  brand_id?: string;
  model_id?: string;
  title: string;
  url: string;
  file_size?: number;
  status: 'pending' | 'processing' | 'indexed' | 'error';
  created_at?: string;
  brand?: Brand; // Join
  model?: Model; // Join
}

export interface Agent {
  id: string;
  name: string;
  role: string;
  description: string;
  icon: string; // Lucide icon name
  color: string;
  systemInstruction: string;
  brandName?: string; // Brand name to filter documents (e.g., 'Schindler', 'Orona')
  isCustom?: boolean; // Identifies user-created agents
  createdBy?: string; // User ID of creator
}

export interface ChatSession {
  id: string;
  userId: string; 
  agentId: string;
  title: string;
  lastMessageAt: string;
  preview: string;
  isArchived?: boolean;
  messages: Message[];
}

export interface UserProfile {
  id: string;
  name: string;
  company: string;
  email: string;
  phone?: string;
  cpf?: string;
  avatar?: string;
  address?: {
    street?: string;
    number?: string;
    complement?: string;
    neighborhood?: string;
    city?: string;
    state?: string;
    zipCode?: string;
  };
  plan: 'Free' | 'Iniciante' | 'Profissional' | 'Empresa';
  creditsUsed: number;
  creditsLimit: number | 'Infinity';
  isAdmin?: boolean; 
  status: 'active' | 'inactive' | 'overdue' | 'pending_payment';
  joinedAt: string;
  nextBillingDate: string;
  tokenUsage: {
    currentMonth: number;
    lastMonth: number;
    history: number[];
  };
}

export const DEFAULT_AGENTS: Agent[] = [];
