-- 1. Habilitar EXTENSÕES
create extension if not exists vector;

-- 2. TABELAS DE ESTRUTURA (Marcas e Modelos)
create table if not exists brands (
  id uuid default gen_random_uuid() primary key,
  name text not null unique, -- ex: 'Schindler', 'Otis'
  logo_url text,
  created_at timestamptz default now()
);

create table if not exists models (
  id uuid default gen_random_uuid() primary key,
  brand_id uuid references brands(id) on delete cascade not null,
  name text not null, -- ex: '3300', 'Gen2'
  description text,
  created_at timestamptz default now()
);

-- 3. TABELA DE ARQUIVOS (Gerenciamento de Uploads)
create table if not exists source_files (
  id uuid default gen_random_uuid() primary key,
  brand_id uuid references brands(id),
  model_id uuid references models(id),
  title text not null,
  url text not null, -- Link do Supabase Storage
  file_size int,
  status text default 'processing', -- 'pending', 'processing', 'indexed', 'error'
  created_at timestamptz default now()
);

-- 4. TABELA DE DOCUMENTOS (Chunks de IA)
create table if not exists documents (
  id bigserial primary key,
  content text,
  metadata jsonb, -- Page number, context, etc
  embedding vector(768), -- Google Gemini Dimension
  
  -- Relacionamentos para filtros precisos
  brand_id uuid references brands(id),
  model_id uuid references models(id),
  source_file_id uuid references source_files(id) on delete cascade
);

-- 5. FUNÇÃO DE BUSCA HÍBRIDA (Com filtros de Marca/Modelo)
create or replace function match_documents (
  query_embedding vector(768),
  match_threshold float,
  match_count int,
  filter_brand_id uuid default null,
  filter_model_id uuid default null
)
returns table (
  id bigint,
  content text,
  metadata jsonb,
  similarity float,
  brand_id uuid,
  model_id uuid
)
language plpgsql
as $$
begin
  return query
  select
    documents.id,
    documents.content,
    documents.metadata,
    1 - (documents.embedding <=> query_embedding) as similarity,
    documents.brand_id,
    documents.model_id
  from documents
  where 1 - (documents.embedding <=> query_embedding) > match_threshold
  and (filter_brand_id is null or documents.brand_id = filter_brand_id)
  and (filter_model_id is null or documents.model_id = filter_model_id)
  order by similarity desc
  limit match_count;
end;
$$;

-- 6. TABELAS DO SISTEMA (Usuários e Chats)

create table if not exists profiles (
  id text primary key,
  name text,
  company text,
  email text,
  plan text check (plan in ('Free', 'Iniciante', 'Profissional', 'Empresa')),
  credits_used int default 0,
  credits_limit text,
  is_admin boolean default false,
  status text default 'active',
  joined_at timestamptz default now(),
  token_usage jsonb default '{"currentMonth": 0}'::jsonb
);

create table if not exists agents (
  id text primary key,
  name text not null,
  role text,
  description text,
  icon text,
  color text,
  system_instruction text,
  brand_id uuid references brands(id), -- Agente especialista em uma marca específica
  is_custom boolean default false,
  created_by text references profiles(id)
);

create table if not exists chat_sessions (
  id uuid default gen_random_uuid() primary key,
  user_id text references profiles(id) not null,
  agent_id text references agents(id) not null,
  title text,
  last_message_at timestamptz default now(),
  preview text,
  is_archived boolean default false
);

create table if not exists messages (
  id uuid default gen_random_uuid() primary key,
  session_id uuid references chat_sessions(id) on delete cascade not null,
  role text check (role in ('user', 'model')),
  text text,
  timestamp timestamptz default now()
);

-- 7. DADOS INICIAIS

-- Usuários
insert into profiles (id, name, company, email, plan, credits_limit, is_admin) values 
('admin_001', 'Roberto Administrador', 'Elevex Corp', 'admin@elevex.com', 'Empresa', 'Infinity', true),
('user_001', 'Carlos Técnico', 'Elevadores Brasil', 'carlos@tecnico.com', 'Profissional', '500', false)
on conflict (id) do nothing;

-- Marcas Iniciais (Exemplo)
insert into brands (name) values ('Schindler'), ('Otis'), ('Thyssenkrupp'), ('Atlas')
on conflict (name) do nothing;

-- Agentes Padrão
-- Nenhum agente padrão inicial. Os agentes serão criados sob demanda no app.

-- 8. POLÍTICAS DE SEGURANÇA (RLS - Público para dev)
alter table brands enable row level security;
alter table models enable row level security;
alter table source_files enable row level security;
alter table documents enable row level security;
alter table profiles enable row level security;
alter table agents enable row level security;
alter table chat_sessions enable row level security;
alter table messages enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'brands' and policyname = 'Public access brands') then
    execute 'create policy "Public access brands" on brands for all using (true)';
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'models' and policyname = 'Public access models') then
    execute 'create policy "Public access models" on models for all using (true)';
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'source_files' and policyname = 'Public access source_files') then
    execute 'create policy "Public access source_files" on source_files for all using (true)';
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'documents' and policyname = 'Public access documents') then
    execute 'create policy "Public access documents" on documents for all using (true)';
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'Public access profiles') then
    execute 'create policy "Public access profiles" on profiles for all using (true)';
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'agents' and policyname = 'Public access agents') then
    execute 'create policy "Public access agents" on agents for all using (true)';
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'chat_sessions' and policyname = 'Public access chat_sessions') then
    execute 'create policy "Public access chat_sessions" on chat_sessions for all using (true)';
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'messages' and policyname = 'Public access messages') then
    execute 'create policy "Public access messages" on messages for all using (true)';
  end if;
end $$;
