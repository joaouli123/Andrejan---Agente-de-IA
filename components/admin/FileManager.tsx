
import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabase';
import { Brand, Model, SourceFile } from '../../types';
import { Upload, FileText, Trash2, ExternalLink, RefreshCw, CheckCircle, XCircle, Loader2 } from 'lucide-react';

interface UploadStatus {
  fileName: string;
  status: 'waiting' | 'uploading' | 'processing' | 'saving' | 'done' | 'error';
  message?: string;
  pages?: number;
  chunks?: number;
}

export default function FileManager() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [files, setFiles] = useState<SourceFile[]>([]);
  
  const [selectedBrand, setSelectedBrand] = useState<string>('');
  const [selectedModel, setSelectedModel] = useState<string>('');
  
  const [uploading, setUploading] = useState(false);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [uploadStatuses, setUploadStatuses] = useState<UploadStatus[]>([]);
  
  // File Input
  const [filesToUpload, setFilesToUpload] = useState<File[]>([]);
  const [customTitle, setCustomTitle] = useState('');

  useEffect(() => {
    loadBrands();
    loadRecentFiles();
  }, []);

  useEffect(() => {
    if (selectedBrand) {
      loadModels(selectedBrand);
    } else {
      setModels([]);
      setSelectedModel('');
    }
  }, [selectedBrand]);

  async function loadBrands() {
    const { data } = await supabase.from('brands').select('*').order('name');
    if (data) setBrands(data);
  }

  async function loadModels(brandId: string) {
    const { data } = await supabase.from('models').select('*').eq('brand_id', brandId).order('name');
    if (data) setModels(data);
  }

  async function loadRecentFiles() {
    setLoadingFiles(true);
    const { data } = await supabase
      .from('source_files')
      .select('*, brand:brands(name), model:models(name)')
      .order('created_at', { ascending: false })
      .limit(20);
      
    if (data) setFiles(data as any);
    setLoadingFiles(false);
  }

  function updateFileStatus(index: number, update: Partial<UploadStatus>) {
    setUploadStatuses(prev => {
      const newStatuses = [...prev];
      newStatuses[index] = { ...newStatuses[index], ...update };
      return newStatuses;
    });
  }

  async function handleUpload() {
    if (filesToUpload.length === 0 || !selectedBrand) return;

    setUploading(true);
    
    // Inicializar status de cada arquivo
    const initialStatuses: UploadStatus[] = filesToUpload.map(f => ({
      fileName: f.name,
      status: 'waiting'
    }));
    setUploadStatuses(initialStatuses);

    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < filesToUpload.length; i++) {
      const file = filesToUpload[i];

      try {
        // Fase 1: Enviando arquivo
        updateFileStatus(i, { status: 'uploading', message: 'Enviando arquivo para o servidor...' });

        const formData = new FormData();
        formData.append('pdf', file);

        const uploadResponse = await fetch('http://localhost:3002/api/upload', {
          method: 'POST',
          body: formData
        });

        if (!uploadResponse.ok) {
          const errorText = await uploadResponse.text();
          updateFileStatus(i, { status: 'error', message: `Erro no upload: ${errorText}` });
          errorCount++;
          continue;
        }

        const uploadResult = await uploadResponse.json();
        const taskId = uploadResult.taskId;

        if (!taskId) {
          updateFileStatus(i, { status: 'error', message: 'Servidor não retornou taskId' });
          errorCount++;
          continue;
        }

        // Fase 2: Polling do status de processamento
        updateFileStatus(i, { status: 'processing', message: 'Extraindo texto do PDF...' });

        const result = await pollTaskStatus(taskId, (task: any) => {
          // Atualiza UI com progresso real do servidor
          const progressMsg = task.message || 'Processando...';
          if (task.status === 'extracting') {
            updateFileStatus(i, { status: 'processing', message: '📄 Extraindo texto do PDF...' });
          } else if (task.status === 'embedding') {
            updateFileStatus(i, { status: 'processing', message: `🧠 ${progressMsg}` });
          } else if (task.status === 'saving') {
            updateFileStatus(i, { status: 'saving', message: '💾 Salvando no banco de vetores...' });
          }
        });

        if (result.status === 'error') {
          updateFileStatus(i, { status: 'error', message: result.message || 'Erro no processamento' });
          errorCount++;
          continue;
        }

        // Fase 3: Salvando referência no Supabase
        updateFileStatus(i, { status: 'saving', message: 'Registrando no banco de dados...' });

        const localPath = `server/data/pdfs/${file.name}`;
        const fileTitle = (filesToUpload.length === 1 && customTitle.trim()) 
            ? customTitle 
            : file.name.replace('.pdf', '');

        const { error: dbError } = await supabase.from('source_files').insert([{
          brand_id: selectedBrand,
          model_id: selectedModel || null,
          title: fileTitle,
          url: localPath,
          file_size: file.size,
          status: 'indexed'
        }]);

        if (dbError) {
          console.error(`Erro db ${file.name}:`, dbError);
        }

        updateFileStatus(i, { 
          status: 'done', 
          message: result.message || `Concluído! ${result.pages || '?'} páginas → ${result.chunks || '?'} chunks indexados`,
          pages: result.pages,
          chunks: result.chunks
        });
        successCount++;

      } catch (error: any) {
        updateFileStatus(i, { status: 'error', message: error.message || 'Erro desconhecido' });
        errorCount++;
      }
    }

    // Finalizado
    if (successCount > 0) {
      loadRecentFiles();
    }
    
    // Limpar após 3s
    setTimeout(() => {
      setFilesToUpload([]);
      setCustomTitle('');
      setUploading(false);
      setTimeout(() => setUploadStatuses([]), 5000);
    }, 2000);
  }

  /** Faz polling do status de uma tarefa no servidor até completar ou dar erro */
  async function pollTaskStatus(taskId: string, onProgress: (task: any) => void): Promise<any> {
    const maxAttempts = 600; // 10 min max (600 * 1s)
    let attempts = 0;
    
    while (attempts < maxAttempts) {
      try {
        const res = await fetch(`http://localhost:3002/api/upload/status/${taskId}`);
        const task = await res.json();
        
        if (task.status === 'done' || task.status === 'error' || task.status === 'not_found') {
          return task;
        }
        
        // Reporta progresso
        onProgress(task);
        
      } catch (e) {
        // Servidor pode estar ocupado, continua tentando
      }
      
      attempts++;
      await new Promise(resolve => setTimeout(resolve, 1000)); // Poll a cada 1s
    }
    
    return { status: 'error', message: 'Timeout: processamento demorou mais de 10 minutos' };
  }

  return (
    <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
        <div className="mb-6">
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Gerenciador de Manuais (PDFs)</h2>
            <p className="text-slate-500 text-sm">Faça upload de manuais técnicos para alimentar a base de conhecimento dos agentes.</p>
        </div>
        
        {/* Upload Form */}
        <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 mb-8">
            <h3 className="font-semibold mb-4 text-slate-800 flex items-center gap-2 text-lg">
                <Upload size={22} /> Upload de Arquivos
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Marca</label>
                    <select 
                        className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-white"
                        value={selectedBrand}
                        onChange={e => setSelectedBrand(e.target.value)}
                    >
                        <option value="">Selecione uma marca...</option>
                        {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                        Modelo <span className="text-xs font-normal text-slate-500">(Opcional)</span>
                    </label>
                    <select 
                        className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-white"
                        value={selectedModel}
                        onChange={e => setSelectedModel(e.target.value)}
                        disabled={!selectedBrand}
                    >
                        <option value="">Nenhum (Material geral da marca)</option>
                        {models.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                </div>
            </div>

            <div className="mb-6">
                <label className="block text-sm font-semibold text-slate-700 mb-3">Selecionar Arquivos (PDF)</label>
                <div className="border-2 border-dashed border-slate-300 rounded-xl p-8 flex flex-col items-center justify-center text-slate-500 hover:bg-blue-50/30 hover:border-blue-400 transition-all cursor-pointer relative">
                    <input 
                        type="file" 
                        accept=".pdf"
                        multiple // ENABLE BULK
                        className="absolute inset-0 opacity-0 cursor-pointer"
                        onChange={e => setFilesToUpload(Array.from(e.target.files || []))}
                    />
                    <Upload size={40} className="mb-3 text-slate-400" />
                    <p className="font-semibold text-slate-700">Clique para selecionar ou arraste os arquivos</p>
                    <p className="text-sm mt-1">Podem ser selecionados múltiplos PDFs de uma vez</p>
                </div>
            </div>

            {/* File Review List */}
            {filesToUpload.length > 0 && !uploading && (
                <div className="mb-6 bg-white border-2 border-blue-200 rounded-xl p-4">
                    <p className="text-sm font-bold text-slate-800 mb-3">{filesToUpload.length} arquivo(s) selecionado(s):</p>
                    
                    {/* CUSTOM TITLE (Only if 1 file) */}
                    {filesToUpload.length === 1 && (
                        <div className="mb-4">
                             <label className="block text-sm font-medium text-slate-600 mb-2">Título Personalizado (Opcional)</label>
                             <input 
                                type="text" 
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                placeholder={filesToUpload[0].name.replace('.pdf', '')}
                                value={customTitle}
                                onChange={e => setCustomTitle(e.target.value)}
                            />
                        </div>
                    )}

                    <ul className="text-sm text-slate-600 space-y-2 max-h-40 overflow-y-auto">
                        {filesToUpload.map((f, i) => (
                            <li key={i} className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg">
                                <FileText size={16} className="text-red-600" /> 
                                <span className="font-medium">{f.name}</span> 
                                <span className="text-xs text-slate-400 ml-auto">({(f.size / 1024 / 1024).toFixed(2)} MB)</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Upload Progress Panel */}
            {uploadStatuses.length > 0 && (
                <div className="mb-6 bg-white border-2 border-blue-300 rounded-xl p-4 space-y-3">
                    <p className="text-sm font-bold text-slate-800 mb-2">
                        Progresso do Upload
                        {uploading && <span className="ml-2 text-blue-600 font-normal animate-pulse">Processando...</span>}
                    </p>
                    
                    {uploadStatuses.map((s, i) => (
                        <div key={i} className={`flex items-start gap-3 p-3 rounded-lg border transition-all ${
                            s.status === 'done' ? 'bg-green-50 border-green-200' :
                            s.status === 'error' ? 'bg-red-50 border-red-200' :
                            s.status === 'waiting' ? 'bg-slate-50 border-slate-200' :
                            'bg-blue-50 border-blue-200'
                        }`}>
                            <div className="mt-0.5">
                                {s.status === 'done' && <CheckCircle size={18} className="text-green-600" />}
                                {s.status === 'error' && <XCircle size={18} className="text-red-600" />}
                                {s.status === 'waiting' && <FileText size={18} className="text-slate-400" />}
                                {(s.status === 'uploading' || s.status === 'processing' || s.status === 'saving') && (
                                    <Loader2 size={18} className="text-blue-600 animate-spin" />
                                )}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm text-slate-800 truncate">{s.fileName}</p>
                                <p className={`text-xs mt-0.5 ${
                                    s.status === 'done' ? 'text-green-700' :
                                    s.status === 'error' ? 'text-red-600' :
                                    'text-blue-600'
                                }`}>
                                    {s.status === 'waiting' && 'Aguardando...'}
                                    {s.status === 'uploading' && 'Enviando arquivo para o servidor...'}
                                    {s.status === 'processing' && (s.message || 'Processando...')}
                                    {s.status === 'saving' && (s.message || 'Salvando...')}
                                    {(s.status === 'done' || s.status === 'error') && s.message}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <button 
                onClick={handleUpload}
                disabled={uploading || filesToUpload.length === 0 || !selectedBrand}
                className="w-full bg-blue-600 text-white py-3.5 rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-semibold shadow-md transition-all flex items-center justify-center gap-2"
            >
                {uploading ? (
                    <>
                        <Loader2 size={20} className="animate-spin" />
                        Processando... (não feche a página)
                    </>
                ) : (
                    <>
                        <Upload size={20} />
                        {`Fazer Upload ${filesToUpload.length > 0 ? `de ${filesToUpload.length} Arquivo${filesToUpload.length > 1 ? 's' : ''}` : ''}`}
                    </>
                )}
            </button>

            {uploading && (
                <p className="text-xs text-amber-600 mt-3 text-center font-medium bg-amber-50 p-2 rounded-lg">
                    ⚠️ O processamento de PDFs pode demorar alguns minutos dependendo do tamanho. Não feche esta página!
                </p>
            )}
        </div>

        {/* File List */}
        <div>
            <div className="flex items-center justify-between mb-6">
                <h3 className="font-bold text-lg text-slate-800">Arquivos Recentes</h3>
                <button 
                    onClick={loadRecentFiles} 
                    className="text-blue-600 hover:bg-blue-50 p-2 rounded-lg transition-colors flex items-center gap-2 text-sm font-medium"
                >
                    <RefreshCw size={18} /> Atualizar
                </button>
            </div>

            <div className="space-y-3">
                {loadingFiles ? (
                    <div className="flex items-center justify-center py-12">
                        <div className="text-slate-400">Carregando arquivos...</div>
                    </div>
                ) : (
                    <>
                        {files.map(file => (
                            <div key={file.id} className="flex items-center p-4 border border-slate-200 rounded-xl hover:border-blue-300 hover:bg-blue-50/30 transition-all bg-white">
                                <div className="mr-4 text-red-500 bg-red-50 p-3 rounded-lg">
                                    <FileText size={24} />
                                </div>
                                <div className="flex-1">
                                    <h4 className="font-semibold text-slate-900">{file.title}</h4>
                                    <div className="text-xs text-slate-500 flex gap-2 mt-1.5 flex-wrap">
                                        <span className="bg-slate-100 px-2 py-1 rounded font-medium">{file.brand?.name}{file.model?.name ? ` / ${file.model.name}` : ''}</span>
                                        <span className={`px-2 py-1 rounded font-medium ${
                                            file.status === 'indexed' ? 'bg-green-100 text-green-700' : 
                                            file.status === 'processing' ? 'bg-yellow-100 text-yellow-700' :
                                            'bg-slate-100'
                                        }`}>
                                            {file.status}
                                        </span>
                                        <span className="bg-slate-100 px-2 py-1 rounded">{((file.file_size || 0) / 1024 / 1024).toFixed(2)} MB</span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <a 
                                        href={file.url} 
                                        target="_blank" 
                                        rel="noreferrer" 
                                        className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                                    >
                                        <ExternalLink size={18} />
                                    </a>
                                </div>
                            </div>
                        ))}
                        {files.length === 0 && (
                            <div className="text-center py-12 bg-slate-50 rounded-xl border-2 border-dashed border-slate-200">
                                <FileText size={48} className="mx-auto text-slate-300 mb-3" />
                                <p className="text-slate-400 font-medium">Nenhum arquivo carregado ainda.</p>
                                <p className="text-slate-400 text-sm mt-1">Faça upload do primeiro manual acima.</p>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    </div>
  );
}
