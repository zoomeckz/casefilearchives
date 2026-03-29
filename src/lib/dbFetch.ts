// Raw fetch helper to bypass broken Supabase JS client HMR state
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export async function dbFetch<T = any>(
  table: string,
  options?: {
    select?: string;
    filters?: string;
    order?: string;
    method?: string;
    body?: any;
    token?: string;
    head?: boolean;
  }
): Promise<{ data: T | null; error: string | null; count?: number }> {
  const select = options?.select || '*';
  const method = options?.method || 'GET';
  let endpoint = `${url}/rest/v1/${table}?select=${encodeURIComponent(select)}`;

  if (options?.filters) {
    endpoint += `&${options.filters}`;
  }
  if (options?.order) {
    endpoint += `&order=${options.order}`;
  }

  const headers: Record<string, string> = {
    'apikey': key,
    'Authorization': `Bearer ${options?.token || key}`,
  };

  if (options?.head) {
    headers['Prefer'] = 'count=exact';
    headers['Range-Unit'] = 'items';
    headers['Range'] = '0-0';
  }

  if (method !== 'GET') {
    headers['Content-Type'] = 'application/json';
    if (method === 'POST') {
      headers['Prefer'] = 'return=representation';
    }
    if (method === 'PATCH') {
      headers['Prefer'] = 'return=minimal';
    }
  }

  try {
    const response = await fetch(endpoint, {
      method,
      headers,
      body: options?.body ? JSON.stringify(options.body) : undefined,
    });

    if (options?.head) {
      const contentRange = response.headers.get('content-range');
      const count = contentRange ? parseInt(contentRange.split('/')[1]) : 0;
      return { data: null, error: null, count };
    }

    if (response.status === 204) {
      return { data: null, error: null };
    }

    const data = await response.json();

    if (!response.ok) {
      return { data: null, error: data.message || 'Request failed' };
    }

    return { data, error: null };
  } catch (err: any) {
    return { data: null, error: err.message || 'Network error' };
  }
}

export async function dbAuth(action: 'signin' | 'signup', payload: {
  email: string;
  password: string;
  name?: string;
}): Promise<{ data: any; error: string | null }> {
  const endpoint = action === 'signup'
    ? `${url}/auth/v1/signup`
    : `${url}/auth/v1/token?grant_type=password`;

  const body: any = {
    email: payload.email,
    password: payload.password,
  };

  if (action === 'signup' && payload.name) {
    body.data = { name: payload.name };
  }

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'apikey': key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok) {
      return { data: null, error: data.error_description || data.msg || data.message || 'Auth failed' };
    }

    return { data, error: null };
  } catch (err: any) {
    return { data: null, error: err.message || 'Network error' };
  }
}

export async function dbRefreshToken(refreshToken: string): Promise<{ data: any; error: string | null }> {
  try {
    const response = await fetch(`${url}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: {
        'apikey': key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    const data = await response.json();

    if (!response.ok) {
      return { data: null, error: data.error_description || data.msg || data.message || 'Refresh failed' };
    }

    return { data, error: null };
  } catch (err: any) {
    return { data: null, error: err.message || 'Network error' };
  }
}