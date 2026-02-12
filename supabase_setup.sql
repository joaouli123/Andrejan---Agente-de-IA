-- 1. Habilitar a extensão Vector para IA
create extension if not exists vector;

-- 2. Tabela de Documentos (Base de Conhecimento RAG)
create table documents (
  id bigserial primary key,
  content text,
  metadata jsonb,
  embedding vector(768) -- Dimensão do modelo embedding-001 do Google Gemini
);

-- Função de busca por similaridade (RPC)
create or replace function match_documents (
  query_embedding vector(768),
  match_threshold float,
  match_count int
)
returns table (
  id bigint,
  content text,
  metadata jsonb,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    documents.id,
    documents.content,
    documents.metadata,
    1 - (documents.embedding <=> query_embedding) as similarity
  from documents
  where 1 - (documents.embedding <=> query_embedding) > match_threshold
  order by similarity desc
  limit match_count;
end;
$$;

-- 3. Tabelas do Sistema (Substituindo o localStorage)

-- Tabela de Perfis de Usuário
create table profiles (
  id text primary key, -- Usando text para manter compatibilidade com seus IDs atuais ('user_001', etc)
  name text,
  company text,
  email text,
  plan text check (plan in ('Free', 'Iniciante', 'Profissional', 'Empresa')),
  credits_used int default 0,
  credits_limit text, -- 'Infinity' ou numero
  is_admin boolean default false,
  status text default 'active',
  joined_at timestamptz default now(),
  next_billing_date timestamptz,
  token_usage jsonb default '{"currentMonth": 0, "lastMonth": 0, "history": []}'::jsonb
);

-- Tabela de Agentes de IA
create table agents (
  id text primary key,
  name text not null,
  role text,
  description text,
  icon text,
  color text,
  system_instruction text,
  is_custom boolean default false,
  created_by text references profiles(id)
);

-- Tabela de Sessões de Chat
create table chat_sessions (
  id uuid default gen_random_uuid() primary key,
  user_id text references profiles(id) not null,
  agent_id text references agents(id) not null,
  title text,
  last_message_at timestamptz default now(),
  preview text,
  is_archived boolean default false,
  created_at timestamptz default now()
);

-- Tabela de Mensagens
create table messages (
  id uuid default gen_random_uuid() primary key,
  session_id uuid references chat_sessions(id) on delete cascade not null,
  role text check (role in ('user', 'model')),
  text text,
  created_at timestamptz default now()
);

-- 4. Inserir Dados Iniciais (Opcional - Migrando seus mocks)

-- Inserir os perfis mockados
insert into profiles (id, name, company, email, plan, credits_limit, is_admin) values 
('admin_001', 'Roberto Administrador', 'Elevex Corp', 'admin@elevex.com', 'Empresa', 'Infinity', true),
('user_001', 'Carlos Técnico', 'Elevadores Brasil', 'carlos@tecnico.com', 'Profissional', '500', false);

-- Inserir Agentes Padrão
insert into agents (id, name, role, description, icon, color, system_instruction) values
('safety-eng', 'Eng. de Segurança', 'Normas e Procedimentos', 'Focado em procedimentos de resgate, NR-10, NR-35 e normas técnicas.', 'ShieldAlert', 'amber', 'Você é um Engenheiro de Segurança do Trabalho...'),
('mentor', 'Mentor Técnico', 'Carreira e Aprendizado', 'Ajuda técnicos iniciantes a entenderem conceitos básicos e evoluírem na carreira.', 'GraduationCap', 'violet', 'Você é um mentor paciente...');

-- 5. Políticas de Segurança (RLS) - Permissiva para começar
-- (IMPORTANTE: Em produção, você deve restringir isso)

alter table documents enable row level security;
alter table profiles enable row level security;
alter table agents enable row level security;
alter table chat_sessions enable row level security;
alter table messages enable row level security;

-- Política simples: permitir tudo para todos (apenas para desenvolvimento inicial)
create policy "Allow public access to documents" on documents for all using (true);
create policy "Allow public access to profiles" on profiles for all using (true);
create policy "Allow public access to agents" on agents for all using (true);
create policy "Allow public access to chat_sessions" on chat_sessions for all using (true);
create policy "Allow public access to messages" on messages for all using (true);
