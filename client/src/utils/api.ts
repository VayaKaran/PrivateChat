/**
 * Client API & WebSocket Configuration for PrivateChat
 * Supports same-origin (monolith/LAN), cross-origin (remote/reverse proxy),
 * and static hosting (GitHub Pages) with explicit backend endpoint configuration.
 */

const STORAGE_CUSTOM_API_KEY = 'privatechat_custom_api_url';
const SESSION_TOKEN_KEY = 'privatechat_session_token';

let memorySessionToken: string | null = null;

export function getSessionToken(): string | null {
  if (memorySessionToken) return memorySessionToken;
  if (typeof window !== 'undefined') {
    try {
      return sessionStorage.getItem(SESSION_TOKEN_KEY);
    } catch {
      return null;
    }
  }
  return null;
}

export function setSessionToken(token: string | null): void {
  memorySessionToken = token;
  if (typeof window !== 'undefined') {
    try {
      if (token) {
        sessionStorage.setItem(SESSION_TOKEN_KEY, token);
      } else {
        sessionStorage.removeItem(SESSION_TOKEN_KEY);
      }
    } catch {
      // ignore storage access restrictions
    }
  }
}

export function getApiBaseUrl(): string {
  // 1. Build-time environment variable (e.g. VITE_API_URL="https://chat.myhome.net")
  const buildTimeUrl = (import.meta as any).env?.VITE_API_URL;
  if (buildTimeUrl && typeof buildTimeUrl === 'string' && buildTimeUrl.trim()) {
    return buildTimeUrl.trim().replace(/\/+$/, '');
  }

  // 2. User-configured override in browser storage (useful for GitHub Pages deployments)
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem(STORAGE_CUSTOM_API_KEY);
      if (stored && stored.trim()) {
        return stored.trim().replace(/\/+$/, '');
      }
    } catch {
      // ignore storage errors
    }
  }

  // 3. Fallback to same-origin relative path
  return '';
}

export function setCustomApiBaseUrl(url: string): void {
  if (typeof window !== 'undefined') {
    try {
      const cleaned = url.trim().replace(/\/+$/, '');
      if (cleaned) {
        localStorage.setItem(STORAGE_CUSTOM_API_KEY, cleaned);
      } else {
        localStorage.removeItem(STORAGE_CUSTOM_API_KEY);
      }
    } catch {
      // ignore storage errors
    }
  }
}

export function clearCustomApiBaseUrl(): void {
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem(STORAGE_CUSTOM_API_KEY);
    } catch {
      // ignore
    }
  }
}

export function getWsUrl(): string {
  // 1. Build-time WebSocket URL
  const buildTimeWs = (import.meta as any).env?.VITE_WS_URL;
  if (buildTimeWs && typeof buildTimeWs === 'string' && buildTimeWs.trim()) {
    return buildTimeWs.trim().replace(/\/+$/, '');
  }

  // 2. Derive from API Base URL if configured
  const apiBase = getApiBaseUrl();
  if (apiBase) {
    try {
      const parsed = new URL(apiBase);
      const wsProto = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${wsProto}//${parsed.host}/ws`;
    } catch {
      // fallback
    }
  }

  // 3. Same-origin fallback
  if (typeof window !== 'undefined') {
    const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${wsProto}//${window.location.host}/ws`;
  }

  return 'ws://localhost:3000/ws';
}

export function apiUrl(path: string): string {
  const base = getApiBaseUrl();
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${cleanPath}`;
}

export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const targetUrl = apiUrl(path);
  const headers = new Headers(options.headers || {});

  // For cross-origin or bearer token support
  const token = getSessionToken();
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  return fetch(targetUrl, {
    ...options,
    headers,
    credentials: 'include', // Guarantees cookies are sent for same-origin and trusted CORS
  });
}
