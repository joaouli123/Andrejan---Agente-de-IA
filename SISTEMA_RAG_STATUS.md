# 🤖 Sistema RAG - Estado Atual e Integração

## ✅ O que VOCÊ JÁ TEM implementado:

### 1. **Sistema de Processamento de PDFs** (`server/scripts/ingestPDFs.js`)
- Extrai texto de PDFs
- Divide em chunks (pedaços)
- Gera embeddings usando Gemini
- Salva em `data/vectors.json` (arquivo local)

### 2. **Serviço RAG** (`server/services/ragService.js`)
- Busca semântica por similaridade
- Gera respostas com contexto usando Gemini
- Sistema de citações diretas
- Temperatura=0 para respostas precisas

### 3. **Vector Store** (`server/services/vectorStore.js`)
- Armazenamento em JSON (em memória)
- Busca por similaridade de cosseno
- Funciona, mas **não integrado com Supabase**

---

## ⚠️ PROBLEMA ATUAL:

### Sistema está **DUPLICADO**:

1. **Frontend (Dashboard)**: Usa Supabase
   - Tabelas: `brands`, `models`, `source_files`
   - Upload de arquivos para Supabase Storage
   - ❌ Não processa PDFs automaticamente

2. **Backend (server/)**: Usa JSON local
   - Lê PDFs da pasta `server/data/pdfs/`
   - Gera embeddings e salva em `vectors.json`
   - ❌ Não está conectado ao Supabase
   - ❌ Não sabe sobre marcas/modelos

---

## 🎯 SOLUÇÃO: Integrar com Supabase

### Arquitetura Ideal:

```
📤 UPLOAD (Frontend)
   └─> Supabase Storage (bucket "manuals")
       └─> Tabela "source_files" (status: 'pending')

⚙️ PROCESSAMENTO (Background Worker)
   └─> Lê arquivos 'pending'
   └─> Baixa PDF do Storage
   └─> Extrai texto + gera embeddings
   └─> Salva na tabela "documents" com brand_id/model_id
   └─> Atualiza "source_files" (status: 'indexed')

💬 CHAT (Frontend)
   └─> Busca no Supabase via match_documents()
   └─> Filtra por brand_id/model_id do agente
   └─> Gera resposta com Gemini
```

---

## 🔧 COMO INTEGRAR:

### Opção 1: Adaptar o script existente para Supabase

Modificar `server/scripts/ingestPDFs.js` para:
1. Conectar no Supabase
2. Buscar arquivos com `status = 'pending'`
3. Baixar do Storage
4. Processar e salvar na tabela `documents` (com embeddings)
5. Atualizar status para `indexed`

### Opção 2: Manter JSON local (mais simples)

Se não quiser usar Supabase Vector ainda:
1. Fazer upload no frontend apenas para organização
2. Copiar PDFs manualmente para `server/data/pdfs/`
3. Rodar `node server/scripts/ingestPDFs.js`
4. Usar `vectors.json` para buscar
5. **Problema**: Não filtra por marca/modelo

---

## 📊 COMPARAÇÃO:

| Recurso | JSON Local | Supabase |
|---------|------------|----------|
| Busca vetorial | ✅ Funciona | ✅ Funciona (pgvector) |
| Filtros (marca/modelo) | ❌ | ✅ |
| Escalabilidade | ❌ Limitado | ✅ Ilimitado |
| Backup automático | ❌ | ✅ |
| Multi-tenant | ❌ | ✅ |
| Velocidade | ⚡ Rápido | 🌐 Depende da rede |

---

## 🚀 PRÓXIMOS PASSOS:

### 1. **Configurar Storage** (obrigatório)
Siga: [CONFIGURAR_STORAGE.md](./CONFIGURAR_STORAGE.md)

### 2. **Escolher arquitetura**:

#### A) Usar Supabase completo (recomendado)
- Criar worker que processa arquivos pendentes
- Salvar embeddings na tabela `documents`
- Usar `match_documents()` no chat

#### B) Híbrido (mais rápido para testar)
- Upload no Supabase apenas para organização
- Processar com script local
- Buscar no `vectors.json`

#### C) Local puro (para testes offline)
- Ignorar upload do frontend
- Colocar PDFs em `server/data/pdfs/`
- Rodar script manualmente

---

## 💡 RECOMENDAÇÃO:

**Para produção**: Opção A (Supabase completo)
**Para desenvolvimento agora**: Opção B (híbrido)

Quer que eu adapte o script para processar arquivos do Supabase Storage?
