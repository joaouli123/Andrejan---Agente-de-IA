# 📦 Configurar Storage (Upload de PDFs)

## Erro atual:
```
StorageApiError: Bucket not found
```

## Solução: Criar bucket "manuals" no Supabase

### Passo 1: Acesse o Storage

1. Abra: https://supabase.com/dashboard/project/cvrvpgzxbigulabwgoac
2. No menu lateral, clique em **Storage**

### Passo 2: Criar o Bucket

1. Clique em **"New bucket"** (ou "Criar novo bucket")
2. Preencha:
   - **Name**: `manuals`
   - **Public bucket**: ✅ **Marque como público** (para URLs funcionarem)
   - **File size limit**: 52428800 (50 MB - ajuste se necessário)
   - **Allowed MIME types**: `application/pdf` (apenas PDFs)

3. Clique em **"Create bucket"**

### Passo 3: Configurar Políticas de Acesso

Após criar o bucket, configure as políticas para upload e download público:

1. Clique no bucket **"manuals"**
2. Vá na aba **"Policies"**
3. Clique em **"New Policy"** → **"For full customization"**

#### Política 1: Upload (INSERT)
```sql
CREATE POLICY "Allow public uploads"
ON storage.objects FOR INSERT
TO public
WITH CHECK (bucket_id = 'manuals');
```

#### Política 2: Download (SELECT)
```sql
CREATE POLICY "Allow public downloads"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'manuals');
```

#### Política 3: Delete (DELETE) - opcional, apenas para admin
```sql
CREATE POLICY "Allow public deletes"
ON storage.objects FOR DELETE
TO public
USING (bucket_id = 'manuals');
```

### Passo 4: Testar Upload

Após configurar:
1. Atualize a página do aplicativo (Ctrl + R)
2. Vá em **Admin → Gerenciar Arquivos**
3. Selecione uma marca
4. Faça upload de um PDF
5. ✅ Deve funcionar sem erros!

---

## 📁 Estrutura de Arquivos no Storage

Os uploads seguem esta estrutura:
```
manuals/
  ├── {brand_id}/
  │   ├── {model_id}/
  │   │   ├── 1770688822522_Manual_Schindler_3300.pdf
  │   │   └── 1770688823844_Diagrama_Eletrico.pdf
```

## 🔧 URLs Públicas

Após upload bem-sucedido, os arquivos ficam acessíveis em:
```
https://cvrvpgzxbigulabwgoac.supabase.co/storage/v1/object/public/manuals/{caminho_do_arquivo}
```

Essas URLs são salvas automaticamente na tabela `source_files`.

---

## ⚠️ Importante

- **Sem o bucket configurado**, o upload sempre retornará erro 400/404
- As tabelas do banco já existem (`source_files`), só falta o Storage
- Após criar o bucket, você pode fazer upload de quantos PDFs quiser

## 🎯 Próximo Passo (Processamento de PDFs)

Depois que os arquivos estiverem no Storage, você precisará:
1. Extrair texto dos PDFs
2. Gerar embeddings (vetores) usando Gemini
3. Salvar na tabela `documents` com os embeddings
4. Usar na função `match_documents()` para buscar contexto no chat

Isso pode ser feito com um script Node.js processando os PDFs.
