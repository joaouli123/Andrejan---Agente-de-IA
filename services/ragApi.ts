/**
 * RAG Server API — configuration and auth helpers
 * Centralizes server URL and authentication for all RAG API calls
 */

// Em produção (mesmo servidor), usa URL vazia = fetch relativo (/api/...)
// Em dev local, Vite proxy redireciona para servidor de produção
export const RAG_SERVER_URL = process.env.RAG_SERVER_URL || '';

/**
 * Build full API URL - handles empty RAG_SERVER_URL (relative paths)
 */
export function ragUrl(path: string): string {
  return `${RAG_SERVER_URL}${path}`;
}

const RAG_API_KEY = process.env.RAG_API_KEY || '';
const RAG_ADMIN_KEY = process.env.RAG_ADMIN_KEY || '';

/**
 * Returns auth headers for RAG server requests
 * @param admin - Use admin key for protected routes (upload, clear, check-duplicates)
 */
export function ragHeaders(admin = false): Record<string, string> {
  const key = admin ? (RAG_ADMIN_KEY || RAG_API_KEY) : RAG_API_KEY;
  if (!key) return {};
  return { 'x-api-key': key };
}
