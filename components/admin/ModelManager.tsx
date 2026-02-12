
import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabase';
import { Brand, Model } from '../../types';
import { Plus, Trash2, Edit2, Check, X } from 'lucide-react';

export default function ModelManager() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [selectedBrand, setSelectedBrand] = useState<string>('');
  const [loading, setLoading] = useState(false);
  
  const [newModelName, setNewModelName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  useEffect(() => {
    loadBrands();
  }, []);

  useEffect(() => {
    if (selectedBrand) {
      fetchModels(selectedBrand);
    } else {
      setModels([]);
    }
  }, [selectedBrand]);

  async function loadBrands() {
    const { data } = await supabase.from('brands').select('*').order('name');
    if (data) setBrands(data);
  }

  async function fetchModels(brandId: string) {
    setLoading(true);
    const { data } = await supabase.from('models').select('*').eq('brand_id', brandId).order('name');
    if (data) setModels(data);
    setLoading(false);
  }

  async function addModel() {
    if (!newModelName.trim() || !selectedBrand) return;
    const { error } = await supabase.from('models').insert([{ 
        name: newModelName,
        brand_id: selectedBrand
    }]);
    if (!error) {
      setNewModelName('');
      fetchModels(selectedBrand);
    }
  }

  async function handleDeleteModel(id: string) {
    if (!confirm('Tem certeza?')) return;
    const { error } = await supabase.from('models').delete().eq('id', id);
    if (!error) fetchModels(selectedBrand);
  }

  async function startEdit(model: Model) {
    setEditingId(model.id);
    setEditName(model.name);
  }

  async function saveEdit() {
    if (!editingId || !editName.trim()) return;
    const { error } = await supabase.from('models').update({ name: editName }).eq('id', editingId);
    if (!error) {
      setEditingId(null);
      fetchModels(selectedBrand);
    }
  }

  return (
    <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
        <div className="mb-6">
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Gerenciar Modelos</h2>
            <p className="text-slate-500 text-sm">Cadastre os modelos específicos de cada marca de elevador.</p>
        </div>
        
        <div className="mb-8 bg-slate-50 p-4 rounded-xl border border-slate-200">
            <label className="block text-sm font-semibold text-slate-700 mb-3">Selecione a Marca</label>
            <select 
                className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-white"
                value={selectedBrand}
                onChange={e => setSelectedBrand(e.target.value)}
            >
                <option value="">-- Escolha uma marca --</option>
                {brands.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                ))}
            </select>
        </div>

        {selectedBrand && (
            <>
                <div className="flex gap-3 mb-8 bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <input 
                        type="text" 
                    placeholder="Nome do modelo (como aparece no manual/etiqueta)" 
                        className="flex-1 px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                        value={newModelName}
                        onChange={e => setNewModelName(e.target.value)}
                    />
                    <button 
                         onClick={addModel}
                        className="bg-blue-600 text-white px-6 py-3 rounded-xl hover:bg-blue-700 transition-colors shadow-sm flex items-center gap-2 font-medium"
                    >
                        <Plus size={20} /> Adicionar Modelo
                    </button>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-12">
                        <div className="text-slate-400">Carregando modelos...</div>
                    </div>
                ) : (
                    <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
                        {models.map(model => (
                             <div key={model.id} className="flex items-center justify-between p-4 bg-slate-50 border border-slate-200 hover:border-blue-300 hover:bg-blue-50/30 rounded-xl transition-all">
                                {editingId === model.id ? (
                                    <div className="flex items-center gap-3 flex-1">
                                        <input 
                                            className="px-3 py-2 border border-slate-300 bg-white rounded-lg flex-1 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                            value={editName}
                                            onChange={e => setEditName(e.target.value)}
                                        />
                                        <button onClick={saveEdit} className="text-green-600 p-2 hover:bg-green-50 rounded-lg transition-colors"><Check size={18}/></button>
                                        <button onClick={() => setEditingId(null)} className="text-red-500 p-2 hover:bg-red-50 rounded-lg transition-colors"><X size={18}/></button>
                                    </div>
                                ) : (
                                    <>
                                        <span className="font-semibold text-slate-800 text-lg">{model.name}</span>
                                        <div className="flex items-center gap-2">
                                            <button onClick={() => startEdit(model)} className="text-slate-400 hover:text-blue-600 p-2 hover:bg-blue-50 rounded-lg transition-all"><Edit2 size={18} /></button>
                                            <button onClick={() => handleDeleteModel(model.id)} className="text-slate-400 hover:text-red-600 p-2 hover:bg-red-50 rounded-lg transition-all"><Trash2 size={18} /></button>
                                        </div>
                                    </>
                                )}
                            </div>
                        ))}
                        {models.length === 0 && (
                            <div className="text-center py-12 bg-slate-50 rounded-xl border-2 border-dashed border-slate-200">
                                <p className="text-slate-400 font-medium">Nenhum modelo cadastrado ainda.</p>
                                <p className="text-slate-400 text-sm mt-1">Adicione o primeiro modelo desta marca acima.</p>
                            </div>
                        )}
                    </div>
                )}
            </>
        )}
    </div>
  );
}
