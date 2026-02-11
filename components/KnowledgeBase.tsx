/**
 * Componente de Gerenciamento de Base de Conhecimento
 * Permite upload de PDFs e visualização do status do RAG
 */

import React, { useState, useEffect, useCallback } from 'react';
import { RAG_SERVER_URL, ragHeaders } from '../services/ragApi';
import { 
  Upload, 
  FileText, 
  Trash2, 
  RefreshCw, 
  CheckCircle, 
  AlertCircle,
  Database,
  Loader2,
  FolderOpen,
  HardDrive
} from 'lucide-react';

interface PDFDocument {
  name: string;
  size: number;
  uploadedAt: string;
}

interface RAGStats {
  totalDocuments: number;
  collectionName: string;
}

const KnowledgeBase: React.FC = () => {
  const [documents, setDocuments] = useState<PDFDocument[]>([]);
  const [stats, setStats] = useState<RAGStats | null>(null);
  const [isServerOnline, setIsServerOnline] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const checkServer = useCallback(async () => {
    try {
      const response = await fetch(`${RAG_SERVER_URL}/api/health`);
      setIsServerOnline(response.ok);
      return response.ok;
    } catch {
      setIsServerOnline(false);
      return false;
    }
  }, []);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const online = await checkServer();
    if (!online) {
      setIsLoading(false);
      return;
    }

    try {
      // Carrega estatísticas
      const statsRes = await fetch(`${RAG_SERVER_URL}/api/stats`, {
        headers: { ...ragHeaders() }
      });
      if (statsRes.ok) {
        setStats(await statsRes.json());
      }

      // Carrega lista de documentos
      const docsRes = await fetch(`${RAG_SERVER_URL}/api/documents`, {
        headers: { ...ragHeaders() }
      });
      if (docsRes.ok) {
        setDocuments(await docsRes.json());
      }
    } catch (err) {
      setError('Erro ao carregar dados do servidor RAG');
    } finally {
      setIsLoading(false);
    }
  }, [checkServer]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    setError(null);
    setSuccess(null);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setUploadProgress(`Processando ${i + 1}/${files.length}: ${file.name}`);

      const formData = new FormData();
      formData.append('pdf', file);

      try {
        const response = await fetch(`${RAG_SERVER_URL}/api/upload`, {
          method: 'POST',
          headers: { ...ragHeaders(true) },
          body: formData
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || 'Erro no upload');
        }
      } catch (err: any) {
        setError(`Erro ao processar ${file.name}: ${err.message}`);
      }
    }

    setIsUploading(false);
    setUploadProgress('');
    setSuccess(`${files.length} arquivo(s) processado(s) com sucesso!`);
    loadData();
    
    // Limpa o input
    event.target.value = '';
  };

  const handleClearDatabase = async () => {
    if (!confirm('Tem certeza que deseja limpar toda a base de conhecimento? Esta ação não pode ser desfeita.')) {
      return;
    }

    try {
      const response = await fetch(`${RAG_SERVER_URL}/api/clear`, {
        method: 'DELETE',
        headers: { ...ragHeaders(true) }
      });

      if (response.ok) {
        setSuccess('Base de conhecimento limpa com sucesso!');
        loadData();
      } else {
        throw new Error('Erro ao limpar base');
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
          <Database className="text-cyan-600" />
          Base de Conhecimento RAG
        </h1>
        <p className="text-slate-600 mt-2">
          Gerencie os documentos PDF que alimentam a inteligência dos agentes
        </p>
      </div>

      {/* Status do Servidor */}
      <div className={`mb-6 p-4 rounded-xl border ${
        isServerOnline 
          ? 'bg-emerald-50 border-emerald-200' 
          : 'bg-red-50 border-red-200'
      }`}>
        <div className="flex items-center gap-3">
          {isServerOnline ? (
            <>
              <CheckCircle className="text-emerald-600" size={24} />
              <div>
                <p className="font-semibold text-emerald-800">Servidor RAG Online</p>
                <p className="text-sm text-emerald-600">
                  {stats?.totalDocuments || 0} chunks indexados na base de conhecimento
                </p>
              </div>
            </>
          ) : (
            <>
              <AlertCircle className="text-red-600" size={24} />
              <div>
                <p className="font-semibold text-red-800">Servidor RAG Offline</p>
                <p className="text-sm text-red-600">
                  Execute <code className="bg-red-100 px-2 py-0.5 rounded">npm run dev</code> na pasta server/
                </p>
              </div>
            </>
          )}
          <button
            onClick={loadData}
            disabled={isLoading}
            className="ml-auto p-2 rounded-lg hover:bg-white/50 transition-colors"
          >
            <RefreshCw className={`${isLoading ? 'animate-spin' : ''}`} size={20} />
          </button>
        </div>
      </div>

      {/* Alertas */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700">
          {success}
        </div>
      )}

      {/* Upload Section */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <Upload size={20} className="text-cyan-600" />
          Upload de Documentos
        </h2>
        
        <div className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center hover:border-cyan-400 transition-colors">
          {isUploading ? (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="animate-spin text-cyan-600" size={40} />
              <p className="text-slate-600">{uploadProgress}</p>
              <p className="text-sm text-slate-500">
                Extraindo texto, gerando embeddings e indexando...
              </p>
            </div>
          ) : (
            <>
              <FolderOpen className="mx-auto text-slate-400 mb-4" size={48} />
              <p className="text-slate-600 mb-2">
                Arraste PDFs aqui ou clique para selecionar
              </p>
              <p className="text-sm text-slate-500 mb-4">
                Suporta múltiplos arquivos (máx. 50MB cada)
              </p>
              <label className="inline-flex items-center gap-2 px-6 py-3 bg-cyan-600 text-white rounded-xl hover:bg-cyan-700 cursor-pointer transition-colors">
                <Upload size={18} />
                Selecionar PDFs
                <input
                  type="file"
                  multiple
                  accept=".pdf"
                  onChange={handleUpload}
                  disabled={!isServerOnline || isUploading}
                  className="hidden"
                />
              </label>
            </>
          )}
        </div>
      </div>

      {/* Documents List */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <HardDrive size={20} className="text-cyan-600" />
            Documentos Indexados ({documents.length})
          </h2>
          {documents.length > 0 && (
            <button
              onClick={handleClearDatabase}
              className="text-red-600 hover:text-red-700 text-sm flex items-center gap-1"
            >
              <Trash2 size={16} />
              Limpar Base
            </button>
          )}
        </div>

        {documents.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            <FileText className="mx-auto mb-3 text-slate-300" size={48} />
            <p>Nenhum documento na base de conhecimento</p>
            <p className="text-sm">Faça upload de PDFs para começar</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {documents.map((doc, idx) => (
              <div
                key={idx}
                className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors"
              >
                <FileText className="text-red-500 flex-shrink-0" size={24} />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-900 truncate">{doc.name}</p>
                  <p className="text-sm text-slate-500">
                    {formatFileSize(doc.size)} • {new Date(doc.uploadedAt).toLocaleDateString('pt-BR')}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Instructions */}
      <div className="mt-6 p-6 bg-slate-50 rounded-2xl border border-slate-200">
        <h3 className="font-semibold text-slate-900 mb-3">📖 Como usar:</h3>
        <ol className="list-decimal list-inside space-y-2 text-slate-600">
          <li>Inicie o servidor RAG: <code className="bg-slate-200 px-2 py-0.5 rounded">cd server && npm install && npm run dev</code></li>
          <li>Faça upload dos PDFs de manuais técnicos</li>
          <li>O sistema automaticamente extrai texto, gera embeddings e indexa</li>
          <li>Os agentes agora responderão com base nos documentos!</li>
        </ol>
      </div>
    </div>
  );
};

export default KnowledgeBase;
