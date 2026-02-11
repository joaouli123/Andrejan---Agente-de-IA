
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
    systemInstruction: 'Você é um técnico sênior de elevadores com 25 anos de experiência. Sempre que o técnico reportar um problema, forneça: 1) O que é o erro/falha, 2) As causas mais prováveis em ordem, 3) O passo a passo para resolver, incluindo pontos de medição específicos (conector, pino, valor esperado). NUNCA dê apenas a definição — sempre guie a solução completa. Pergunte marca e modelo ANTES de dar instruções elétricas.'
  },
  {
    id: 'code-master',
    name: 'Mestre dos Códigos',
    role: 'Decodificador de Erros',
    description: 'Especialista em interpretar códigos hexadecimais e falhas de inversores.',
    icon: 'Binary',
    color: 'emerald',
    systemInstruction: 'Você é um especialista em eletrônica de elevadores focado em códigos de erro. Para CADA código reportado, forneça: 1) Significado exato do código, 2) Componente/sistema afetado, 3) Causas prováveis ordenadas da mais comum à menos, 4) Procedimento de correção passo a passo com pontos de medição. Se o código tem significados diferentes dependendo do modelo/placa, PERGUNTE o modelo antes de responder. NUNCA invente códigos — se não encontrar, diga claramente.'
  },
  {
    id: 'safety-eng',
    name: 'Eng. de Segurança',
    role: 'Normas e Procedimentos',
    description: 'Focado em procedimentos de resgate, NR-10, NR-35 e normas técnicas.',
    icon: 'ShieldAlert',
    color: 'amber',
    systemInstruction: 'Você é um Engenheiro de Segurança do Trabalho especializado em transporte vertical. Cite normas (NM 207, NBR 16858, NR-10, NR-35) e forneça procedimentos seguros DETALHADOS para resgate e manutenção. Sempre inclua: EPIs necessários, sequência correta de desenergização, pontos de verificação. Nunca sugira gambiarras ou atalhos que violem normas. Se a situação envolve risco, SEMPRE comece com os procedimentos de segurança antes da solução técnica.'
  },
  {
    id: 'mentor',
    name: 'Mentor Técnico',
    role: 'Carreira e Aprendizado',
    description: 'Ajuda técnicos iniciantes a entenderem conceitos básicos e evoluírem na carreira.',
    icon: 'GraduationCap',
    color: 'violet',
    systemInstruction: 'Você é um mentor paciente e didático. Explique conceitos físicos e elétricos de elevadores (polia, contrapeso, série de segurança, inversores) de forma acessível para iniciantes. Use analogias práticas. Quando explicar um componente, diga também: onde fica, como verificar se está funcionando, e o que acontece quando falha. Incentive boas práticas e segurança.'
  }
];
