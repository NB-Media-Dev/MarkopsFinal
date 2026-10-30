export function getBackendBaseUrl(): string {
  if (typeof window !== 'undefined' && window.location) {
    let savedApiUrl: string | null = null;
    try {
      savedApiUrl = localStorage.getItem('markops_backend_url');
    } catch (err) { console.log('[Storage Notice]:', err); }

    const injectedUrl = (window as any).__API_URL__ || (window as any).process?.env?.BACKEND_URL || savedApiUrl;
    if (injectedUrl) return injectedUrl.replace(/\/$/, '');

    const protocol = window.location.protocol || 'http:';
    const hostname = window.location.hostname || 'localhost';
    const port = window.location.port;

    if (hostname.includes('onrender.com') || hostname.includes('markops')) {
      return 'https://markopsfinal.onrender.com';
    }

    const isDevPort = port === '4200' || port === '4201' || port === '4202';
    const isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1';
    const isLanIp =
      hostname.startsWith('192.168.') ||
      hostname.startsWith('10.') ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname) ||
      hostname.endsWith('.local');

    if (port !== '4000' && (isDevPort || isLocalHost || isLanIp)) {
      return `${protocol}//${hostname}:4000`;
    }

    return window.location.origin;
  }

  const port = (typeof process !== 'undefined' ? (process.env?.['BACKEND_PORT'] || process.env?.['PORT']) : undefined) || '4000';
  const backendHost = (typeof process !== 'undefined' ? process.env?.['BACKEND_URL'] : undefined) || `http://localhost:${port}`;
  return backendHost.replace(/\/$/, '');
}

export function getApiUrl(url: string): string {
  if (!url) return url;
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:') || url.startsWith('blob:')) {
    return url;
  }

  const cleanPath = url.startsWith('/') ? url : `/${url}`;

  if (typeof window !== 'undefined' && window.location) {
    const baseUrl = getBackendBaseUrl();
    if (baseUrl) {
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
    if (localToken?.trim()) {
      return localToken.trim();
    }
  } catch (err) { console.log('[Storage Notice]:', err); }

  if (typeof document !== 'undefined') {
    const nameEQ = 'markops_token=';
    const ca = document.cookie.split(';');
    for (let c of ca) {
      c = c.trim();
      if (c.startsWith(nameEQ)) {
        return decodeURIComponent(c.substring(nameEQ.length));
      }
    }
  }
  return null;
}

function resolveRequestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

export async function safeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const urlStr = resolveRequestUrl(input);
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
