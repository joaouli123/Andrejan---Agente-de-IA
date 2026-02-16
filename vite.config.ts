import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    
    // Em dev, usa proxy do Vite apontando para URL configurada (ou produção por fallback)
    // Em produção, pode usar URL relativa (mesmo servidor) ou absoluta via RAG_SERVER_URL
    const PRODUCTION_API = 'https://elevex.uxcodedev.com.br';
    
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        proxy: {
          '/api': {
            target: env.RAG_SERVER_URL || PRODUCTION_API,
            changeOrigin: true,
            secure: true,
          },
        },
      },
      plugins: [react()],
      define: {
        'process.env.SUPABASE_URL': JSON.stringify(env.SUPABASE_URL || 'https://cvrvpgzxbigulabwgoac.supabase.co'),
        'process.env.SUPABASE_ANON_KEY': JSON.stringify(env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN2cnZwZ3p4YmlndWxhYndnb2FjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMTg4MzcsImV4cCI6MjA4NTg5NDgzN30.cdOs5jCtIMgBY0hLzt8YtvS3Mtcp3yO52DdfbfcPxRQ'),
        'process.env.RAG_SERVER_URL': JSON.stringify(env.RAG_SERVER_URL || ''),
        'process.env.RAG_API_KEY': JSON.stringify(env.RAG_API_KEY || ''),
        'process.env.RAG_ADMIN_KEY': JSON.stringify(env.RAG_ADMIN_KEY || ''),
        'process.env.MP_PUBLIC_KEY': JSON.stringify(env.MP_PUBLIC_KEY || env.MERCADO_PAGO_PUBLIC_KEY || ''),
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
