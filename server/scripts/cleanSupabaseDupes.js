/**
 * Script para limpar entradas duplicadas na tabela source_files do Supabase
 * Mantém apenas a primeira entrada de cada title + brand_id
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://cvrvpgzxbigulabwgoac.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN2cnZwZ3p4YmlndWxhYndnb2FjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMTg4MzcsImV4cCI6MjA4NTg5NDgzN30.cdOs5jCtIMgBY0hLzt8YtvS3Mtcp3yO52DdfbfcPxRQ';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function cleanDuplicates() {
  console.log('🔍 Buscando todos os source_files...');
  
  const { data: allFiles, error } = await supabase
    .from('source_files')
    .select('*')
    .order('created_at', { ascending: true });
  
  if (error) {
    console.error('Erro:', error);
    return;
  }
  
  console.log(`Total de registros: ${allFiles.length}`);
  
  // Group by brand_id + title
  const groups = {};
  allFiles.forEach(f => {
    const key = `${f.brand_id}_${f.title}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(f);
  });
  
  // Find duplicates
  const dupes = Object.entries(groups).filter(([k, v]) => v.length > 1);
  console.log(`Grupos com duplicatas: ${dupes.length}`);
  
  if (dupes.length === 0) {
    console.log('✅ Nenhuma duplicata encontrada!');
    return;
  }
  
  // Collect IDs to delete (keep first, delete rest)
  const idsToDelete = [];
  dupes.forEach(([key, files]) => {
    // Keep the first (oldest), delete the rest
    const toDelete = files.slice(1);
    toDelete.forEach(f => idsToDelete.push(f.id));
    console.log(`  DUPE: "${files[0].title}" - ${files.length}x (deletando ${toDelete.length})`);
  });
  
  console.log(`\n🗑️ Deletando ${idsToDelete.length} registros duplicados...`);
  
  // Delete in batches of 50
  for (let i = 0; i < idsToDelete.length; i += 50) {
    const batch = idsToDelete.slice(i, i + 50);
    const { error: delError } = await supabase
      .from('source_files')
      .delete()
      .in('id', batch);
    
    if (delError) {
      console.error(`Erro ao deletar batch ${i}:`, delError);
    } else {
      console.log(`  Deletados ${Math.min(i + 50, idsToDelete.length)}/${idsToDelete.length}`);
    }
  }
  
  // Verify
  const { data: remaining } = await supabase
    .from('source_files')
    .select('id', { count: 'exact' });
  
  console.log(`\n✅ Limpeza concluída! Registros restantes: ${remaining?.length || '?'}`);
}

cleanDuplicates().catch(console.error);
