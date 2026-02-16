/**
 * RAG Server API — configuration and auth helpers
 * Centralizes server URL and authentication for all RAG API calls
 */

// Pode ser URL absoluta (ex.: http://localhost:3002 ou https://elevex...)
// Se vazio, usa fetch relativo (/api/...) para funcionar com mesmo domínio/proxy
export const RAG_SERVER_URL = (process.env.RAG_SERVER_URL || '').trim().replace(/\/+$/, '');

/**
 * Build full API URL - handles empty RAG_SERVER_URL (relative paths)
 */
export function ragUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${RAG_SERVER_URL}${normalizedPath}`;
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
