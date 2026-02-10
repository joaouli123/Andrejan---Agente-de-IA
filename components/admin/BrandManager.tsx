
import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabase';
import { Brand } from '../../types';
import { Plus, Trash2, Edit2, Check, X } from 'lucide-react';

export default function BrandManager() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [newBrandName, setNewBrandName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  useEffect(() => {
    fetchBrands();
  }, []);

  async function fetchBrands() {
    setLoading(true);
    const { data, error } = await supabase.from('brands').select('*').order('name');
    if (!error && data) {
      setBrands(data);
    }
    setLoading(false);
  }

  async function addBrand() {
    if (!newBrandName.trim()) return;
    const { error } = await supabase.from('brands').insert([{ name: newBrandName }]);
    if (!error) {
      setNewBrandName('');
      fetchBrands();
    }
  }

  async function handleDeleteBrand(id: string) {
    if (!confirm('Tem certeza? Isso apagará todos modelos e arquivos desta marca.')) return;
    const { error } = await supabase.from('brands').delete().eq('id', id);
    if (!error) {
      fetchBrands();
    }
  }

  async function startEdit(brand: Brand) {
    setEditingId(brand.id);
    setEditName(brand.name);
  }

  async function saveEdit() {
    if (!editingId || !editName.trim()) return;
    const { error } = await supabase.from('brands').update({ name: editName }).eq('id', editingId);
    if (!error) {
      setEditingId(null);
      fetchBrands();
    }
  }

  return (
    <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
        <div className="mb-6">
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Gerenciar Marcas</h2>
            <p className="text-slate-500 text-sm">Cadastre as marcas de elevadores para organizar modelos e documentação.</p>
        </div>
        
        <div className="flex gap-3 mb-8 bg-slate-50 p-4 rounded-xl border border-slate-200">
            <input 
                type="text" 
                placeholder="Nome da nova marca (ex: Schindler, Otis...)" 
                className="flex-1 px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                value={newBrandName}
                onChange={e => setNewBrandName(e.target.value)}
            />
            <button 
                onClick={addBrand}
                className="bg-blue-600 text-white px-6 py-3 rounded-xl hover:bg-blue-700 transition-colors shadow-sm flex items-center gap-2 font-medium"
            >
                <Plus size={20} /> Adicionar Marca
            </button>
        </div>

        {loading ? (
            <div className="flex items-center justify-center py-12">
                <div className="text-slate-400">Carregando marcas...</div>
            </div>
        ) : (
            <div className="space-y-3">
                {brands.map(brand => (
                    <div key={brand.id} className="flex items-center justify-between p-4 bg-slate-50 border border-slate-200 hover:border-blue-300 hover:bg-blue-50/30 rounded-xl transition-all">
                        {editingId === brand.id ? (
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
                                <span className="font-semibold text-slate-800 text-lg">{brand.name}</span>
                                <div className="flex items-center gap-2">
                                    <button onClick={() => startEdit(brand)} className="text-slate-400 hover:text-blue-600 p-2 hover:bg-blue-50 rounded-lg transition-all"><Edit2 size={18} /></button>
                                    <button onClick={() => handleDeleteBrand(brand.id)} className="text-slate-400 hover:text-red-600 p-2 hover:bg-red-50 rounded-lg transition-all"><Trash2 size={18} /></button>
                                </div>
                            </>
                        )}
                    </div>
                ))}
                {brands.length === 0 && (
                    <div className="text-center py-12 bg-slate-50 rounded-xl border-2 border-dashed border-slate-200">
                        <p className="text-slate-400 font-medium">Nenhuma marca cadastrada ainda.</p>
                        <p className="text-slate-400 text-sm mt-1">Adicione sua primeira marca acima.</p>
                    </div>
                )}
                {brands.length === 0 && <p className="text-slate-400 italic">Nenhuma marca cadastrada.</p>}
            </div>
        )}
    </div>
  );
}
