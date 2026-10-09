export function getBackendBaseUrl(): string {
  if (typeof window !== 'undefined' && window.location) {

    const injectedUrl = (window as any).__API_URL__ || (window as any).process?.env?.BACKEND_URL;
    if (injectedUrl) return injectedUrl.replace(/\/$/, '');

    const protocol = window.location.protocol || 'http:';
    const hostname = window.location.hostname || 'localhost';
    if (window.location.port === '4200') {
      return `${protocol}//${hostname}:4000`;
    }

    return window.location.origin;
  }

  const port = (typeof process !== 'undefined' && process.env && (process.env['BACKEND_PORT'] || process.env['PORT'])) || '4000';
  const backendHost = (typeof process !== 'undefined' && process.env && process.env['BACKEND_URL']) || `http://localhost:${port}`;
  return backendHost.replace(/\/$/, '');
}

export function getApiUrl(url: string): string {
  if (!url) return url;
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }

  const cleanPath = url.startsWith('/') ? url : `/${url}`;

  if (typeof window !== 'undefined' && window.location) {
    if (window.location.port === '4200') {
      const baseUrl = getBackendBaseUrl();
      return `${baseUrl}${cleanPath}`;
    }
    return cleanPath;
  }

  const baseUrl = getBackendBaseUrl();
  return `${baseUrl}${cleanPath}`;
}

export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const localToken = localStorage.getItem('markops_token');
    if (localToken && localToken.trim()) {
      return localToken.trim();
    }
  } catch {}

  if (typeof document !== 'undefined') {
    const nameEQ = 'markops_token=';
    const ca = document.cookie.split(';');
    for (let c of ca) {
      c = c.trim();
      if (c.indexOf(nameEQ) === 0) {
        return decodeURIComponent(c.substring(nameEQ.length));
      }
    }
  }
  return null;
}

export async function safeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const urlStr = typeof input === 'string' ? input : input.toString();
  const token = getAuthToken();

  const headers = new Headers(init?.headers || {});
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const enhancedInit: RequestInit = {
    ...init,
    headers,
    credentials: init?.credentials || 'include',
  };

  return fetch(getApiUrl(urlStr), enhancedInit);
}
