import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      define: {
        'process.env.SUPABASE_URL': JSON.stringify(env.SUPABASE_URL || 'https://cvrvpgzxbigulabwgoac.supabase.co'),
        'process.env.SUPABASE_ANON_KEY': JSON.stringify(env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN2cnZwZ3p4YmlndWxhYndnb2FjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMTg4MzcsImV4cCI6MjA4NTg5NDgzN30.cdOs5jCtIMgBY0hLzt8YtvS3Mtcp3yO52DdfbfcPxRQ'),
        'process.env.RAG_SERVER_URL': JSON.stringify(env.RAG_SERVER_URL || (mode === 'production' ? '' : 'http://localhost:3002')),
        'process.env.RAG_API_KEY': JSON.stringify(env.RAG_API_KEY || ''),
        'process.env.RAG_ADMIN_KEY': JSON.stringify(env.RAG_ADMIN_KEY || ''),
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
