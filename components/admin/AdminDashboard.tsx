
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../services/supabase';
import { RAG_SERVER_URL, ragHeaders, ragUrl } from '../../services/ragApi';
import { Brand, Model, SourceFile } from '../../types';
import { 
  Plus, Trash2, Edit2, Check, X, ChevronDown, ChevronRight, 
  Upload, FileText, Loader2, CheckCircle, XCircle, RefreshCw,
  Database, Layers, FolderOpen
} from 'lucide-react';

interface UploadStatus {
  fileName: string;
  status: 'waiting' | 'uploading' | 'processing' | 'saving' | 'done' | 'error';
  message?: string;
  pages?: number;
  chunks?: number;
  progress?: number;
  lastUpdatedAt?: number;
}

export default function AdminDashboard() {
  // --- DATA ---
  const [brands, setBrands] = useState<Brand[]>([]);
  const [modelsMap, setModelsMap] = useState<Record<string, Model[]>>({});
  const [filesMap, setFilesMap] = useState<Record<string, SourceFile[]>>({});
  const [loading, setLoading] = useState(true);

  // --- UI STATE ---
  const [expandedBrands, setExpandedBrands] = useState<Set<string>>(new Set());
  const [expandedModels, setExpandedModels] = useState<Set<string>>(new Set());

  // --- BRAND CRUD ---
  const [newBrandName, setNewBrandName] = useState('');
  const [editingBrandId, setEditingBrandId] = useState<string | null>(null);
  const [editBrandName, setEditBrandName] = useState('');

  // --- MODEL CRUD ---
  const [addingModelToBrand, setAddingModelToBrand] = useState<string | null>(null);
  const [newModelName, setNewModelName] = useState('');
  const [editingModelId, setEditingModelId] = useState<string | null>(null);
  const [editModelName, setEditModelName] = useState('');

  // --- UPLOAD ---
  const [uploadTarget, setUploadTarget] = useState<{ brandId: string; modelId?: string } | null>(null);
  const [filesToUpload, setFilesToUpload] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadStatuses, setUploadStatuses] = useState<UploadStatus[]>([]);
  const [uploadNow, setUploadNow] = useState(Date.now());
  const [checkingDuplicates, setCheckingDuplicates] = useState(false);
  const [duplicateFiles, setDuplicateFiles] = useState<Set<string>>(new Set());
  const [serverStatus, setServerStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const progressScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!uploading && uploadStatuses.length === 0) return;
    const id = setInterval(() => setUploadNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [uploading, uploadStatuses.length]);

  // Test server connection when upload modal opens
  useEffect(() => {
    if (!uploadTarget) return;
    setServerStatus('checking');
    const ctrl = new AbortController();
    fetch(ragUrl('/api/health'), { headers: { ...ragHeaders() }, signal: ctrl.signal })
      .then(r => r.json())
      .then(d => {
        console.log('[Upload] Server health:', d);
        setServerStatus(d.status === 'ok' || d.status === 'loading' ? 'online' : 'offline');
      })
      .catch(err => {
        if (err.name !== 'AbortError') {
          console.error('[Upload] Server offline:', err);
          setServerStatus('offline');
        }
      });
    return () => ctrl.abort();
  }, [uploadTarget]);

  // ======================== DATA LOADING ========================

  const fetchAll = useCallback(async () => {
    setLoading(true);
    
    // Fetch brands
    const { data: brandsData } = await supabase.from('brands').select('*').order('name');
    const loadedBrands = brandsData || [];
    setBrands(loadedBrands);

    // Fetch all models grouped by brand
    const { data: modelsData } = await supabase.from('models').select('*').order('name');
    const mMap: Record<string, Model[]> = {};
    (modelsData || []).forEach((m: Model) => {
      if (!mMap[m.brand_id]) mMap[m.brand_id] = [];
      mMap[m.brand_id].push(m);
    });
    setModelsMap(mMap);

    // Fetch all files
    const { data: filesData } = await supabase
      .from('source_files')
      .select('*, brand:brands(name), model:models(name)')
      .order('created_at', { ascending: false });
    
    const fMap: Record<string, SourceFile[]> = {};
    (filesData || []).forEach((f: any) => {
      const key = f.model_id ? `model_${f.model_id}` : `brand_${f.brand_id}`;
      if (!fMap[key]) fMap[key] = [];
      fMap[key].push(f);
    });
    setFilesMap(fMap);

    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // ======================== BRAND ACTIONS ========================

  const toggleBrand = (id: string) => {
    setExpandedBrands(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleModel = (id: string) => {
    setExpandedModels(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  async function addBrand() {
    if (!newBrandName.trim()) return;
    const { error } = await supabase.from('brands').insert([{ name: newBrandName }]);
    if (!error) {
      setNewBrandName('');
      fetchAll();
    }
  }

  async function saveBrandEdit() {
    if (!editingBrandId || !editBrandName.trim()) return;
    await supabase.from('brands').update({ name: editBrandName }).eq('id', editingBrandId);
    setEditingBrandId(null);
    fetchAll();
  }

  async function deleteBrand(id: string) {
    if (!confirm('Tem certeza? Isso apagará todos modelos e arquivos desta marca.')) return;
    await supabase.from('brands').delete().eq('id', id);
    fetchAll();
  }

  // ======================== MODEL ACTIONS ========================

  async function addModel(brandId: string) {
    if (!newModelName.trim()) return;
    await supabase.from('models').insert([{ name: newModelName, brand_id: brandId }]);
    setAddingModelToBrand(null);
    setNewModelName('');
    fetchAll();
  }

  async function saveModelEdit() {
    if (!editingModelId || !editModelName.trim()) return;
    await supabase.from('models').update({ name: editModelName }).eq('id', editingModelId);
    setEditingModelId(null);
    fetchAll();
  }

  async function deleteModel(id: string) {
    if (!confirm('Excluir este modelo e seus arquivos?')) return;
    await supabase.from('models').delete().eq('id', id);
    fetchAll();
  }

  // ======================== UPLOAD ACTIONS ========================

  function openUpload(brandId: string, modelId?: string) {
    setUploadTarget({ brandId, modelId });
    setFilesToUpload([]);
    setUploadStatuses([]);
  }

  function updateFileStatus(index: number, update: Partial<UploadStatus>) {
    setUploadStatuses(prev => {
      const next = [...prev];
      next[index] = { ...next[index], ...update, lastUpdatedAt: Date.now() };
      return next;
    });
    // Preservar scroll position após re-render
    requestAnimationFrame(() => {
      const el = progressScrollRef.current;
      if (el && (el as any)._userScrollPos !== undefined) {
        el.scrollTop = (el as any)._userScrollPos;
      }
    });
  }

  async function pollTaskStatus(taskId: string, onProgress: (task: any) => void): Promise<any> {
    const maxAttempts = 600;
    let attempts = 0;
    while (attempts < maxAttempts) {
      try {
        const url = ragUrl(`/api/upload/status/${taskId}`);
        const res = await fetch(url, {
          headers: { ...ragHeaders(true) }
        });
        const task = await res.json();
        if (task.status === 'done' || task.status === 'error' || task.status === 'not_found') return task;
        onProgress(task);
      } catch (e) {
        console.warn(`[Upload] Erro ao verificar status do task ${taskId}:`, e);
      }
      attempts++;
      await new Promise(r => setTimeout(r, 1000));
    }
    return { status: 'error', message: 'Timeout: processamento demorou mais de 10 minutos' };
  }

  function normalizeTaskProgress(task: any): number | undefined {
    if (typeof task?.progress === 'number' && Number.isFinite(task.progress)) {
      return Math.max(0, Math.min(100, Math.round(task.progress)));
    }
    if (task?.status === 'extracting') return 10;
    if (task?.status === 'embedding') return 30;
    if (task?.status === 'saving') return 95;
    if (task?.status === 'done') return 100;
    return undefined;
  }

  // Check duplicates when files are selected
  async function checkDuplicates(files: File[]) {
    if (files.length === 0) return;
    setCheckingDuplicates(true);
    const dupes = new Set<string>();
    let serverCheckOk = false;
    
    // 1. Verificar no servidor (vector store + disco)
    try {
      const url = ragUrl('/api/check-duplicates');
      console.log('[Upload] Verificando duplicatas em:', url);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...ragHeaders(true) },
        body: JSON.stringify({ fileNames: files.map(f => f.name) })
      });
      if (res.ok) {
        const data = await res.json();
        console.log('[Upload] Resultado duplicatas:', data);
        (data.duplicates || []).forEach((d: string) => dupes.add(d));
        serverCheckOk = true;
      } else {
        console.warn('[Upload] check-duplicates retornou:', res.status);
      }
    } catch (err) {
      console.warn('[Upload] Erro ao verificar duplicatas no servidor:', err);
    }
    
    // 2. Fallback: só verifica no Supabase se o servidor estiver indisponível
    if (!serverCheckOk) {
      try {
        const titles = files.map(f => f.name.replace('.pdf', ''));
        const { data: existing } = await supabase
          .from('source_files')
          .select('title')
          .in('title', titles);
        if (existing && existing.length > 0) {
          existing.forEach((e: any) => {
            // Encontrar o arquivo original correspondente ao título
            const match = files.find(f => f.name.replace('.pdf', '') === e.title);
            if (match) dupes.add(match.name);
          });
        }
      } catch (err) {
        console.warn('Erro ao verificar duplicatas no Supabase:', err);
      }
    }
    
    setDuplicateFiles(dupes);
    setCheckingDuplicates(false);
  }

  async function handleUpload(forceAll = false) {
    if (!uploadTarget || filesToUpload.length === 0) return;
    console.log('[Upload] Iniciando upload...', { target: uploadTarget, files: filesToUpload.map(f => f.name), forceAll });
    setUploading(true);

    // Filter out duplicates (unless force)
    const filesToProcess = forceAll ? filesToUpload : filesToUpload.filter(f => !duplicateFiles.has(f.name));
    if (filesToProcess.length === 0) {
      console.warn('[Upload] Nenhum arquivo para processar (todos duplicados)');
      setUploading(false);
      return;
    }

    const statuses: UploadStatus[] = filesToUpload.map(f => {
      if (!forceAll && duplicateFiles.has(f.name)) {
        return { fileName: f.name, status: 'done' as const, message: '⏭️ Já indexado, ignorado', progress: 100, lastUpdatedAt: Date.now() };
      }
      return { fileName: f.name, status: 'waiting' as const, progress: 0, lastUpdatedAt: Date.now() };
    });
    setUploadStatuses(statuses);

    for (let i = 0; i < filesToUpload.length; i++) {
      const file = filesToUpload[i];
      // Skip duplicates (unless force)
      if (!forceAll && duplicateFiles.has(file.name)) continue;
      try {
        updateFileStatus(i, { status: 'uploading', message: 'Enviando arquivo...', progress: 5 });

        const formData = new FormData();
        formData.append('pdf', file);
        // Send brand name so vectors are tagged with it
        const brand = brands.find(b => b.id === uploadTarget.brandId);
        if (brand) {
          formData.append('brandName', brand.name);
        }

        const uploadUrl = ragUrl('/api/upload');
        console.log(`[Upload] Enviando ${file.name} para: ${uploadUrl}`);
        
        let res: Response;
        try {
          const uploadCtrl = new AbortController();
          const uploadTimeout = setTimeout(() => uploadCtrl.abort(), 120_000); // 2min timeout for upload
          res = await fetch(uploadUrl, { 
            method: 'POST', 
            headers: { ...ragHeaders(true) },
            body: formData,
            signal: uploadCtrl.signal
          });
          clearTimeout(uploadTimeout);
        } catch (networkError: any) {
          console.error('[Upload] Erro de rede:', networkError);
          const msg = networkError.name === 'AbortError'
            ? 'Upload expirou (>2min). O servidor pode estar sobrecarregado.'
            : `Erro de conexão: ${networkError.message}. Verifique se o servidor está online.`;
          updateFileStatus(i, { status: 'error', message: msg });
          continue;
        }
        
        if (!res.ok) {
          const errText = await res.text();
          console.error(`[Upload] Servidor retornou ${res.status}:`, errText);
          updateFileStatus(i, { status: 'error', message: `Erro ${res.status}: ${errText}` });
          continue;
        }

        const uploadResult = await res.json();
        
        // Server-side duplicate detection
        if (uploadResult.skipped) {
          updateFileStatus(i, { status: 'done', message: '⏭️ Já indexado no servidor, ignorado', progress: 100 });
          continue;
        }

        const { taskId } = uploadResult;
        if (!taskId) {
          updateFileStatus(i, { status: 'error', message: 'Servidor não retornou taskId' });
          continue;
        }

        updateFileStatus(i, { status: 'processing', message: 'Processando PDF...', progress: 10 });

        const result = await pollTaskStatus(taskId, (task: any) => {
          const taskProgress = normalizeTaskProgress(task);
          if (task.status === 'extracting') updateFileStatus(i, { status: 'processing', message: task.message || '📄 Extraindo texto...', progress: taskProgress });
          else if (task.status === 'embedding') updateFileStatus(i, { status: 'processing', message: `🧠 ${task.message || 'Gerando embeddings...'}`, progress: taskProgress });
          else if (task.status === 'saving') updateFileStatus(i, { status: 'saving', message: task.message || '💾 Salvando vetores...', progress: taskProgress });
        });

        if (result.status === 'error') {
          updateFileStatus(i, { status: 'error', message: result.message, progress: normalizeTaskProgress(result) });
          continue;
        }

        // Save to Supabase (check if already exists first)
        updateFileStatus(i, { status: 'saving', message: 'Registrando no banco...', progress: 98 });
        const cleanTitle = file.name.replace('.pdf', '');
        const { data: existing } = await supabase
          .from('source_files')
          .select('id')
          .eq('brand_id', uploadTarget.brandId)
          .eq('title', cleanTitle)
          .limit(1);
        
        if (!existing || existing.length === 0) {
          await supabase.from('source_files').insert([{
            brand_id: uploadTarget.brandId,
            model_id: uploadTarget.modelId || null,
            title: cleanTitle,
            url: `server/data/pdfs/${file.name}`,
            file_size: file.size,
            status: 'indexed'
          }]);
        }

        updateFileStatus(i, { 
          status: 'done', 
          message: `${result.pages || '?'} páginas → ${result.chunks || '?'} chunks indexados`,
          progress: 100
        });
      } catch (err: any) {
        console.error(`[Upload] Erro geral no arquivo ${file.name}:`, err);
        updateFileStatus(i, { status: 'error', message: err.message || 'Erro desconhecido' });
      }
    }

    setUploading(false);
    fetchAll();
    setTimeout(() => {
      setFilesToUpload([]);
      setUploadTarget(null);
      setUploadStatuses([]);
    }, 5000);
  }

  // ======================== SYNC BASE ========================

  async function syncBase() {
    try {
      const res = await fetch(ragUrl('/api/stats'));
      const stats = await res.json();
      if (stats.totalDocuments === 0) {
        // Qdrant está vazio — limpar source_files stale
        const { data: staleFiles } = await supabase
          .from('source_files')
          .select('id')
          .eq('status', 'indexed');
        if (staleFiles && staleFiles.length > 0) {
          await supabase
            .from('source_files')
            .delete()
            .eq('status', 'indexed');
          alert(`🧹 ${staleFiles.length} registros antigos limpos! Agora você pode re-enviar os PDFs.`);
          fetchAll();
        } else {
          alert('✅ Base já está sincronizada.');
        }
      } else {
        alert(`✅ Base de vetores tem ${stats.totalDocuments} documentos indexados.`);
      }
    } catch (err) {
      console.error('[Sync] Erro:', err);
      alert('❌ Erro ao verificar base. Tente novamente.');
    }
  }

  // ======================== FILE LIST COMPONENT ========================

  const FileList: React.FC<{ files: SourceFile[] }> = ({ files: fileList }) => {
    if (fileList.length === 0) return (
      <p className="text-xs text-slate-400 italic py-2 px-4">Nenhum arquivo</p>
    );
    return (
      <div className="space-y-1.5 px-4 pb-3">
        {fileList.map(file => (
          <div key={file.id} className="flex items-center gap-3 p-2.5 bg-white border border-slate-100 rounded-lg text-sm hover:border-blue-200 transition-all">
            <FileText size={16} className="text-red-500 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="font-medium text-slate-800 truncate block">{file.title}</span>
              <span className="text-xs text-slate-400">{((file.file_size || 0) / 1024 / 1024).toFixed(1)} MB</span>
            </div>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
              file.status === 'indexed' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
            }`}>
              {file.status}
            </span>
          </div>
        ))}
      </div>
    );
  };

  // ======================== UPLOAD MODAL ========================

  const UploadModal = () => {
    if (!uploadTarget) return null;
    const brand = brands.find(b => b.id === uploadTarget.brandId);
    const model = uploadTarget.modelId 
      ? (modelsMap[uploadTarget.brandId] || []).find(m => m.id === uploadTarget.modelId)
      : null;

    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => !uploading && setUploadTarget(null)}>
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg font-bold text-slate-900">Upload de PDFs</h3>
              <p className="text-sm text-slate-500 mt-0.5">
                {brand?.name}{model ? ` → ${model.name}` : ' (Geral)'}
              </p>
            </div>
            {!uploading && (
              <button onClick={() => setUploadTarget(null)} className="p-2 hover:bg-slate-100 rounded-lg">
                <X size={20} className="text-slate-400" />
              </button>
            )}
          </div>

          {/* Server status */}
          {!uploading && uploadStatuses.length === 0 && (
            <div className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg mb-3 ${
              serverStatus === 'online' ? 'bg-green-50 text-green-700' :
              serverStatus === 'offline' ? 'bg-red-50 text-red-700' :
              'bg-slate-50 text-slate-500'
            }`}>
              <span className={`w-2 h-2 rounded-full ${
                serverStatus === 'online' ? 'bg-green-500' :
                serverStatus === 'offline' ? 'bg-red-500' :
                'bg-slate-400 animate-pulse'
              }`} />
              {serverStatus === 'online' ? 'Servidor conectado' :
               serverStatus === 'offline' ? 'Servidor offline — verifique se está rodando' :
               'Verificando conexão...'}
              {serverStatus === 'offline' && (
                <button onClick={() => { setServerStatus('checking'); fetch(ragUrl('/api/health'), { headers: ragHeaders() }).then(r => r.json()).then(() => setServerStatus('online')).catch(() => setServerStatus('offline')); }} className="ml-auto underline font-medium">Tentar novamente</button>
              )}
            </div>
          )}

          {/* Drop zone */}
          {!uploading && uploadStatuses.length === 0 && (
            <>
              <div className="border-2 border-dashed border-slate-300 rounded-xl p-8 flex flex-col items-center justify-center text-slate-500 hover:bg-blue-50/30 hover:border-blue-400 transition-all cursor-pointer relative mb-4">
                <input 
                  type="file" accept=".pdf" multiple
                  className="absolute inset-0 opacity-0 cursor-pointer"
                  onChange={e => {
                    const files = Array.from(e.target.files || []);
                    setFilesToUpload(files);
                    setDuplicateFiles(new Set());
                    checkDuplicates(files);
                  }}
                />
                <Upload size={36} className="mb-2 text-slate-400" />
                <p className="font-semibold text-slate-700 text-sm">Clique ou arraste PDFs aqui</p>
              </div>

              {filesToUpload.length > 0 && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 mb-4 space-y-1.5 max-h-60 overflow-y-auto">
                  {filesToUpload.map((f, i) => {
                    const isDuplicate = duplicateFiles.has(f.name);
                    return (
                    <div key={i} className={`flex items-center gap-2 text-sm ${isDuplicate ? 'opacity-50' : ''}`}>
                      <FileText size={14} className={isDuplicate ? 'text-yellow-500' : 'text-red-500'} />
                      <span className="truncate flex-1">{f.name}</span>
                      {isDuplicate && <span className="text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded font-medium whitespace-nowrap">Já indexado</span>}
                      <span className="text-xs text-slate-400">{(f.size / 1024 / 1024).toFixed(1)} MB</span>
                    </div>
                    );
                  })}
                </div>
              )}

              <button
                onClick={() => handleUpload(false)}
                disabled={filesToUpload.length === 0 || checkingDuplicates || serverStatus === 'offline' || filesToUpload.every(f => duplicateFiles.has(f.name))}
                className={`w-full py-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2 ${
                  filesToUpload.length === 0 || serverStatus === 'offline'
                    ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed'
                }`}
              >
                <Upload size={18} />
                {checkingDuplicates ? 'Verificando duplicados...' : 
                 duplicateFiles.size > 0 
                   ? `Fazer Upload (${filesToUpload.length - duplicateFiles.size} novos, ${duplicateFiles.size} ignorados)` 
                   : `Fazer Upload ${filesToUpload.length > 0 ? `(${filesToUpload.length})` : ''}`
                }
              </button>

              {/* Force upload button when duplicates block everything */}
              {duplicateFiles.size > 0 && filesToUpload.every(f => duplicateFiles.has(f.name)) && (
                <button
                  onClick={() => handleUpload(true)}
                  className="w-full mt-2 bg-amber-500 text-white py-2.5 rounded-xl font-semibold hover:bg-amber-600 transition-all flex items-center justify-center gap-2 text-sm"
                >
                  <RefreshCw size={16} />
                  Forçar Re-upload ({filesToUpload.length} arquivo{filesToUpload.length !== 1 ? 's' : ''})
                </button>
              )}
            </>
          )}

          {/* Progress */}
          {uploadStatuses.length > 0 && (
            <div
              ref={progressScrollRef}
              className="space-y-2 max-h-[50vh] overflow-y-auto pr-1"
              onScroll={(e) => {
                const el = e.currentTarget;
                (el as any)._userScrollPos = el.scrollTop;
              }}
            >
              {[...uploadStatuses]
                .map((s, i) => ({ ...s, originalIndex: i }))
                .sort((a, b) => {
                  const order: Record<string, number> = { processing: 0, saving: 0, uploading: 1, waiting: 2, error: 3, done: 4 };
                  return (order[a.status] ?? 5) - (order[b.status] ?? 5);
                })
                .map((s) => (
                <div key={s.originalIndex} className={`flex items-start gap-3 p-3 rounded-lg border ${
                  s.status === 'done' ? 'bg-green-50 border-green-200' :
                  s.status === 'error' ? 'bg-red-50 border-red-200' :
                  s.status === 'waiting' ? 'bg-slate-50 border-slate-200' :
                  'bg-blue-50 border-blue-200'
                }`}>
                  <div className="mt-0.5">
                    {s.status === 'done' && <CheckCircle size={16} className="text-green-600" />}
                    {s.status === 'error' && <XCircle size={16} className="text-red-600" />}
                    {s.status === 'waiting' && <FileText size={16} className="text-slate-400" />}
                    {['uploading', 'processing', 'saving'].includes(s.status) && <Loader2 size={16} className="text-blue-600 animate-spin" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium text-sm text-slate-800 truncate">{s.fileName}</p>
                      {typeof s.progress === 'number' && ['uploading', 'processing', 'saving', 'done'].includes(s.status) && (
                        <span className="text-[11px] font-semibold text-slate-500">{Math.max(0, Math.min(100, Math.round(s.progress)))}%</span>
                      )}
                    </div>
                    <p className={`text-xs ${s.status === 'done' ? 'text-green-700' : s.status === 'error' ? 'text-red-600' : 'text-blue-600'}`}>
                      {s.message || (s.status === 'waiting' ? 'Aguardando...' : 'Processando...')}
                    </p>
                    {typeof s.progress === 'number' && ['uploading', 'processing', 'saving', 'done'].includes(s.status) && (
                      <div className="mt-1.5">
                        <div className="h-1.5 w-full rounded-full bg-slate-200 overflow-hidden">
                          <div
                            className={`h-full transition-all duration-500 ${s.status === 'done' ? 'bg-green-500' : s.status === 'error' ? 'bg-red-500' : 'bg-blue-500'}`}
                            style={{ width: `${Math.max(0, Math.min(100, Math.round(s.progress)))}%` }}
                          />
                        </div>
                        {['uploading', 'processing', 'saving'].includes(s.status) && s.lastUpdatedAt && (
                          <p className="mt-1 text-[10px] text-slate-400">
                            {uploadNow - s.lastUpdatedAt > 25000 ? `Sem atualização há ${Math.floor((uploadNow - s.lastUpdatedAt) / 1000)}s` : 'Atualizando em tempo real...'}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  // ======================== RENDER ========================

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-blue-600" size={32} />
      </div>
    );
  }

  return (
    <div className="w-full h-full">
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 flex items-center gap-2 sm:gap-3">
            <span className="p-1.5 sm:p-2 bg-blue-100 text-blue-600 rounded-xl">
              <Database size={20} />
            </span>
            Marcas, Modelos & Manuais
          </h1>
          <p className="text-slate-500 mt-1 sm:mt-2 text-sm">Gerencie tudo em um só lugar: marcas de elevadores, seus modelos e documentação técnica.</p>
          <button 
            onClick={syncBase}
            className="mt-2 text-xs text-slate-500 hover:text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
          >
            <RefreshCw size={14} /> Sincronizar Base
          </button>
        </div>

        {/* Add Brand */}
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 mb-6 bg-white p-3 sm:p-4 rounded-xl border border-slate-200 shadow-sm">
          <input 
            type="text"
            placeholder="Nova marca (ex: Schindler, Otis...)"
            className="flex-1 px-3 sm:px-4 py-2.5 sm:py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none bg-slate-50 text-sm"
            value={newBrandName}
            onChange={e => setNewBrandName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addBrand()}
          />
          <button
            onClick={addBrand}
            className="bg-blue-600 text-white px-4 sm:px-6 py-2.5 sm:py-3 rounded-xl hover:bg-blue-700 transition-colors shadow-sm flex items-center justify-center gap-2 font-medium text-sm whitespace-nowrap"
          >
            <Plus size={18} /> Adicionar
          </button>
        </div>

        {/* Brands List */}
        {brands.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-2xl border-2 border-dashed border-slate-200">
            <Database size={48} className="mx-auto text-slate-300 mb-3" />
            <h3 className="text-lg font-bold text-slate-900">Nenhuma marca cadastrada</h3>
            <p className="text-slate-400 mt-1">Adicione sua primeira marca acima para começar.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {brands.map(brand => {
              const isExpanded = expandedBrands.has(brand.id);
              const brandModels = modelsMap[brand.id] || [];
              const brandFiles = filesMap[`brand_${brand.id}`] || [];

              return (
                <div key={brand.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                  {/* Brand Header */}
                  <div className="flex items-center gap-3 p-3 sm:p-4 cursor-pointer hover:bg-slate-50 transition-colors" onClick={() => toggleBrand(brand.id)}>
                    <div className="text-slate-400">
                      {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                    </div>
                    <div className="w-8 h-8 sm:w-10 sm:h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Layers size={18} className="text-blue-600" />
                    </div>

                    {editingBrandId === brand.id ? (
                      <div className="flex items-center gap-2 flex-1" onClick={e => e.stopPropagation()}>
                        <input
                          className="px-3 py-1.5 border border-slate-300 rounded-lg flex-1 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                          value={editBrandName}
                          onChange={e => setEditBrandName(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && saveBrandEdit()}
                          autoFocus
                        />
                        <button onClick={saveBrandEdit} className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg"><Check size={18} /></button>
                        <button onClick={() => setEditingBrandId(null)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg"><X size={18} /></button>
                      </div>
                    ) : (
                      <>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-bold text-slate-900 text-base sm:text-lg truncate">{brand.name}</h3>
                          <p className="text-[10px] sm:text-xs text-slate-400 truncate">
                            {brandModels.length} modelo{brandModels.length !== 1 ? 's' : ''} · {brandFiles.length} arquivo{brandFiles.length !== 1 ? 's' : ''} gerais
                          </p>
                        </div>
                        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                          <button 
                            onClick={() => openUpload(brand.id)} 
                            className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all" 
                            title="Upload para marca"
                          >
                            <Upload size={18} />
                          </button>
                          <button 
                            onClick={() => { setEditingBrandId(brand.id); setEditBrandName(brand.name); }} 
                            className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                          >
                            <Edit2 size={18} />
                          </button>
                          <button 
                            onClick={() => deleteBrand(brand.id)} 
                            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Brand Expanded Content */}
                  {isExpanded && (
                    <div className="border-t border-slate-100">
                      {/* Brand-level files */}
                      {brandFiles.length > 0 && (
                        <div className="bg-slate-50/50 py-2">
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-4 py-1.5 flex items-center gap-1.5">
                            <FileText size={12} /> Arquivos gerais da marca
                          </p>
                          <FileList files={brandFiles} />
                        </div>
                      )}

                      {/* Models Section */}
                      <div className="px-4 py-3">
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                            <FolderOpen size={12} /> Modelos
                          </p>
                          <button
                            onClick={() => { setAddingModelToBrand(brand.id); setNewModelName(''); }}
                            className="text-xs text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1"
                          >
                            <Plus size={14} /> Adicionar Modelo
                          </button>
                        </div>

                        {/* Add Model Input */}
                        {addingModelToBrand === brand.id && (
                          <div className="flex gap-2 mb-3">
                            <input
                              type="text"
                              placeholder="Nome do modelo (como aparece no manual/etiqueta)"
                              className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                              value={newModelName}
                              onChange={e => setNewModelName(e.target.value)}
                              onKeyDown={e => e.key === 'Enter' && addModel(brand.id)}
                              autoFocus
                            />
                            <button onClick={() => addModel(brand.id)} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">Salvar</button>
                            <button onClick={() => setAddingModelToBrand(null)} className="px-3 py-2 text-slate-500 hover:bg-slate-100 rounded-lg text-sm">Cancelar</button>
                          </div>
                        )}

                        {/* Models List */}
                        {brandModels.length === 0 && addingModelToBrand !== brand.id && (
                          <p className="text-xs text-slate-400 italic py-2">Nenhum modelo cadastrado para esta marca.</p>
                        )}
                        
                        <div className="space-y-2">
                          {brandModels.map(model => {
                            const isModelExpanded = expandedModels.has(model.id);
                            const modelFiles = filesMap[`model_${model.id}`] || [];

                            return (
                              <div key={model.id} className="bg-slate-50 rounded-lg border border-slate-200 overflow-hidden">
                                {/* Model Header */}
                                <div className="flex items-center gap-2 px-3 py-2.5 cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => toggleModel(model.id)}>
                                  <div className="text-slate-400">
                                    {isModelExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                  </div>

                                  {editingModelId === model.id ? (
                                    <div className="flex items-center gap-2 flex-1" onClick={e => e.stopPropagation()}>
                                      <input
                                        className="px-2 py-1 border border-slate-300 rounded flex-1 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                        value={editModelName}
                                        onChange={e => setEditModelName(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && saveModelEdit()}
                                        autoFocus
                                      />
                                      <button onClick={saveModelEdit} className="p-1 text-green-600 hover:bg-green-50 rounded"><Check size={16} /></button>
                                      <button onClick={() => setEditingModelId(null)} className="p-1 text-red-500 hover:bg-red-50 rounded"><X size={16} /></button>
                                    </div>
                                  ) : (
                                    <>
                                      <span className="font-semibold text-slate-800 flex-1">{model.name}</span>
                                      <span className="text-xs text-slate-400 mr-2">{modelFiles.length} arquivo{modelFiles.length !== 1 ? 's' : ''}</span>
                                      <div className="flex items-center gap-0.5" onClick={e => e.stopPropagation()}>
                                        <button 
                                          onClick={() => openUpload(brand.id, model.id)} 
                                          className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-all" 
                                          title="Upload para modelo"
                                        >
                                          <Upload size={15} />
                                        </button>
                                        <button 
                                          onClick={() => { setEditingModelId(model.id); setEditModelName(model.name); }} 
                                          className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-all"
                                        >
                                          <Edit2 size={15} />
                                        </button>
                                        <button 
                                          onClick={() => deleteModel(model.id)} 
                                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-all"
                                        >
                                          <Trash2 size={15} />
                                        </button>
                                      </div>
                                    </>
                                  )}
                                </div>

                                {/* Model Files */}
                                {isModelExpanded && (
                                  <div className="border-t border-slate-200 bg-white py-2">
                                    <FileList files={modelFiles} />
                                    {modelFiles.length === 0 && (
                                      <div className="flex items-center justify-center py-3">
                                        <button
                                          onClick={() => openUpload(brand.id, model.id)}
                                          className="text-xs text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1"
                                        >
                                          <Upload size={14} /> Enviar primeiro PDF
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Upload Modal */}
      <UploadModal />
    </div>
  );
}
