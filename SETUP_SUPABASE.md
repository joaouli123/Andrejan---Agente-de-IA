# 🚀 Configuração do Supabase - Elevex

## Passo 1: Acesse o SQL Editor

1. Abra: https://supabase.com/dashboard/project/cvrvpgzxbigulabwgoac
2. Faça login na sua conta Supabase
3. No menu lateral, clique em **SQL Editor**

## Passo 2: Execute o Script

Copie e cole o código abaixo no SQL Editor e clique em **RUN**:

```sql
-- 1. Habilitar extensões
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. TABELAS DE ESTRUTURA (Marcas e Modelos)
CREATE TABLE brands (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  logo_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE models (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id UUID REFERENCES brands(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. TABELA DE ARQUIVOS
CREATE TABLE source_files (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id UUID REFERENCES brands(id),
  model_id UUID REFERENCES models(id),
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  file_size INT,
  status TEXT DEFAULT 'processing',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. TABELA DE DOCUMENTOS (Chunks de IA)
CREATE TABLE documents (
  id BIGSERIAL PRIMARY KEY,
  content TEXT,
  metadata JSONB,
  embedding VECTOR(768),
  brand_id UUID REFERENCES brands(id),
  model_id UUID REFERENCES models(id),
  source_file_id UUID REFERENCES source_files(id) ON DELETE CASCADE
);

-- 5. FUNÇÃO DE BUSCA HÍBRIDA
CREATE OR REPLACE FUNCTION match_documents (
  query_embedding VECTOR(768),
  match_threshold FLOAT,
  match_count INT,
  filter_brand_id UUID DEFAULT NULL,
  filter_model_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id BIGINT,
  content TEXT,
  metadata JSONB,
  similarity FLOAT,
  brand_id UUID,
  model_id UUID
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    documents.id,
    documents.content,
    documents.metadata,
    1 - (documents.embedding <=> query_embedding) AS similarity,
    documents.brand_id,
    documents.model_id
  FROM documents
  WHERE 1 - (documents.embedding <=> query_embedding) > match_threshold
  AND (filter_brand_id IS NULL OR documents.brand_id = filter_brand_id)
  AND (filter_model_id IS NULL OR documents.model_id = filter_model_id)
  ORDER BY similarity DESC
  LIMIT match_count;
END;
$$;

-- 6. TABELAS DO SISTEMA
CREATE TABLE profiles (
  id TEXT PRIMARY KEY,
  name TEXT,
  company TEXT,
  email TEXT,
  plan TEXT CHECK (plan IN ('Free', 'Iniciante', 'Profissional', 'Empresa')),
  credits_used INT DEFAULT 0,
  credits_limit TEXT,
  is_admin BOOLEAN DEFAULT FALSE,
  status TEXT DEFAULT 'active',
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  token_usage JSONB DEFAULT '{"currentMonth": 0}'::JSONB
);

CREATE TABLE agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT,
  description TEXT,
  icon TEXT,
  color TEXT,
  system_instruction TEXT,
  brand_id UUID REFERENCES brands(id),
  is_custom BOOLEAN DEFAULT FALSE,
  created_by TEXT REFERENCES profiles(id)
);

CREATE TABLE chat_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT REFERENCES profiles(id) NOT NULL,
  agent_id TEXT REFERENCES agents(id) NOT NULL,
  title TEXT,
  last_message_at TIMESTAMPTZ DEFAULT NOW(),
  preview TEXT,
  is_archived BOOLEAN DEFAULT FALSE
);

CREATE TABLE messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID REFERENCES chat_sessions(id) ON DELETE CASCADE NOT NULL,
  role TEXT CHECK (role IN ('user', 'model')),
  text TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- 7. DADOS INICIAIS
INSERT INTO profiles (id, name, company, email, plan, credits_limit, is_admin) VALUES 
('admin_001', 'Roberto Administrador', 'Elevex Corp', 'admin@elevex.com', 'Empresa', 'Infinity', TRUE),
('user_001', 'Carlos Técnico', 'Elevadores Brasil', 'carlos@tecnico.com', 'Profissional', '500', FALSE);

INSERT INTO brands (name) VALUES ('Schindler'), ('Otis'), ('Thyssenkrupp'), ('Atlas');

-- Sem agentes padrão iniciais.
-- Os agentes devem ser criados diretamente no aplicativo.

-- 8. POLÍTICAS DE SEGURANÇA (RLS - Acesso Público para desenvolvimento)
ALTER TABLE brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE models ENABLE ROW LEVEL SECURITY;
ALTER TABLE source_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public access brands" ON brands FOR ALL USING (TRUE);
CREATE POLICY "Public access models" ON models FOR ALL USING (TRUE);
CREATE POLICY "Public access source_files" ON source_files FOR ALL USING (TRUE);
CREATE POLICY "Public access documents" ON documents FOR ALL USING (TRUE);
CREATE POLICY "Public access profiles" ON profiles FOR ALL USING (TRUE);
CREATE POLICY "Public access agents" ON agents FOR ALL USING (TRUE);
CREATE POLICY "Public access chat_sessions" ON chat_sessions FOR ALL USING (TRUE);
CREATE POLICY "Public access messages" ON messages FOR ALL USING (TRUE);
```

## Passo 3: Verificar

Após executar o script:

1. No menu lateral, clique em **Table Editor**
2. Você deve ver as tabelas: `brands`, `models`, `agents`, `profiles`, etc.
3. Abra a tabela `brands` - deve ter 4 marcas (Schindler, Otis, Thyssenkrupp, Atlas)

## Passo 4: Testar na aplicação

Após criar as tabelas, atualize sua aplicação no navegador (Ctrl+R) e teste:

✅ Admin → Gerenciar Marcas
✅ Admin → Gerenciar Modelos  
✅ Criar novos agentes

---

## 🔧 Credenciais do seu banco (backup)

```
URL: https://cvrvpgzxbigulabwgoac.supabase.co
Anon Key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN2cnZwZ3p4YmlndWxhYndnb2FjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMTg4MzcsImV4cCI6MjA4NTg5NDgzN30.cdOs5jCtIMgBY0hLzt8YtvS3Mtcp3yO52DdfbfcPxRQ
Database Password: GdHGozcIt5NNmp7V
```

## ⚠️ Nota importante

Por enquanto, a aplicação está usando **LocalStorage** como fallback, então você pode continuar trabalhando normalmente. Quando as tabelas do Supabase forem criadas, você pode optar por usar o banco de dados remoto.
