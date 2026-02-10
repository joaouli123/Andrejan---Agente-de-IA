
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

export const DEFAULT_AGENTS: Agent[] = [
  {
    id: 'general-tech',
    name: 'Técnico Geral',
    role: 'Diagnóstico Universal',
    description: 'Especialista em identificar falhas comuns em diversas marcas e modelos.',
    icon: 'Wrench',
    color: 'blue',
    systemInstruction: 'Você é um técnico especialista em elevadores com 20 anos de experiência. Ajude a diagnosticar falhas, sempre priorizando a segurança. Seja direto e técnico.'
  },
  {
    id: 'code-master',
    name: 'Mestre dos Códigos',
    role: 'Decodificador de Erros',
    description: 'Especialista em interpretar códigos hexadecimais e falhas de inversores.',
    icon: 'Binary',
    color: 'emerald',
    systemInstruction: 'Você é um especialista em eletrônica de elevadores. Seu foco é traduzir códigos de erro (frequentemente hexadecimais ou numéricos) de inversores e placas (Schindler, Otis, WEG, Yaskawa) para linguagem humana compreensível.'
  },
  {
    id: 'safety-eng',
    name: 'Eng. de Segurança',
    role: 'Normas e Procedimentos',
    description: 'Focado em procedimentos de resgate, NR-10, NR-35 e normas técnicas.',
    icon: 'ShieldAlert',
    color: 'amber',
    systemInstruction: 'Você é um Engenheiro de Segurança do Trabalho focado em transporte vertical. Cite normas (NM 207, NBR 16858) e procedimentos seguros para resgate e manutenção. Nunca sugira gambiarras.'
  },
  {
    id: 'mentor',
    name: 'Mentor Técnico',
    role: 'Carreira e Aprendizado',
    description: 'Ajuda técnicos iniciantes a entenderem conceitos básicos e evoluírem na carreira.',
    icon: 'GraduationCap',
    color: 'violet',
    systemInstruction: 'Você é um mentor paciente. Explique conceitos físicos e elétricos de elevadores (polia, contra-peso, série de segurança) de forma didática para iniciantes.'
  }
];
