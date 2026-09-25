import { useState, useEffect, useCallback } from 'react';
import { dbFetch, dbAuth, dbRefreshToken } from '@/lib/dbFetch';

const STORAGE_KEY = 'app-auth-session';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  isAdmin: boolean;
  avatarUrl: string | null;
}

interface StoredSession {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  user: {
    id: string;
    email: string;
    user_metadata?: { name?: string };
  };
}

function getStoredSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const session: StoredSession = JSON.parse(raw);
    // Don't clear expired sessions here — let the hook handle refresh
    return session;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

function isSessionExpired(session: StoredSession): boolean {
  // Expired if less than 60s remaining
  return session.expires_at < Math.floor(Date.now() / 1000) + 60;
}

function storeSession(data: any): StoredSession {
  const session: StoredSession = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: data.expires_at || Math.floor(Date.now() / 1000) + (data.expires_in || 3600),
    user: data.user,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  return session;
}

function clearSession() {
  localStorage.removeItem(STORAGE_KEY);
  // Also clear the supabase key in case it exists
  const keys = Object.keys(localStorage);
  for (const key of keys) {
    if (key.startsWith('sb-') && key.endsWith('-auth-token')) {
      localStorage.removeItem(key);
    }
  }
}

async function fetchUserProfile(userId: string, email: string, token: string): Promise<AuthUser> {
  const { data: profiles } = await dbFetch<any[]>('profiles', {
    select: 'name,avatar_url',
    filters: `user_id=eq.${userId}`,
    token,
  });

  const { data: roles } = await dbFetch<any[]>('user_roles', {
    select: 'role',
    filters: `user_id=eq.${userId}`,
    token,
  });

  const profile = profiles?.[0];
  const isAdmin = roles?.some((r: any) => r.role === 'admin') ?? false;

  return {
    id: userId,
    email,
    name: profile?.name || email.split('@')[0],
    isAdmin,
    avatarUrl: profile?.avatar_url || null,
  };
}

// ---------------------------------------------------------------------------
// Shared, de-duplicated refresh path.
// Several components mount useAuth at the same time; without a shared lock
// each one fires its own refresh with the same refresh_token, and every call
// after the first is rejected with refresh_token_already_used. All callers
// now share a single in-flight refresh promise.
// ---------------------------------------------------------------------------

let inFlightRefresh: Promise<StoredSession | null> | null = null;

function isDefinitiveAuthError(error: string | null): boolean {
  if (!error) return false;
  return /invalid_grant|already.?used|invalid refresh|refresh token/i.test(error);
}

async function tryAdoptSupabaseSession(): Promise<StoredSession | null> {
  // The auth client may already have rotated the token (e.g. after OAuth).
  // If it holds a fresh session, adopt it instead of logging the user out.
  try {
    const { supabase } = await import('@/integrations/supabase/client');
    const res = await Promise.race([
      supabase.auth.getSession(),
      new Promise<null>((r) => setTimeout(() => r(null), 4000)),
    ]);
    const s = (res as any)?.data?.session;
    if (s?.access_token && s?.user) return storeSession(s);
  } catch (e) {
    console.warn('OAuth session bridge failed:', e);
  }
  return null;
}

async function performRefresh(stored: StoredSession): Promise<StoredSession | null> {
  try {
    const { data, error } = await dbRefreshToken(stored.refresh_token);
    if (error || !data?.access_token) {
      if (isDefinitiveAuthError(error)) {
        // Token was rotated elsewhere or is truly invalid — try to adopt the
        // auth client's session before giving up.
        const adopted = await tryAdoptSupabaseSession();
        if (adopted) return adopted;
        console.warn('Token refresh failed definitively:', error);
        clearSession();
        return null;
      }
      // Transient failure (timeout, 500, network) — keep the session and
      // let the next interval/focus retry instead of forcing a logout.
      console.warn('Token refresh failed transiently, keeping session:', error);
      return stored;
    }
    return storeSession(data);
  } catch (err) {
    console.warn('Token refresh error (transient), keeping session:', err);
    return stored;
  }
}

function refreshSessionShared(stored: StoredSession): Promise<StoredSession | null> {
  if (!inFlightRefresh) {
    inFlightRefresh = performRefresh(stored).finally(() => {
      inFlightRefresh = null;
    });
  }
  return inFlightRefresh;
}

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [session, setSession] = useState<StoredSession | null>(null);
  const [loading, setLoading] = useState(true);

  // Refresh token helper — returns null only on definitive auth failure
  const refreshSession = useCallback(async (stored: StoredSession): Promise<StoredSession | null> => {
    const result = await refreshSessionShared(stored);
    if (result === null) {
      setUser(null);
      setSession(null);
      return null;
    }
    setSession(result);
    return result;
  }, []);

  // Initialize from localStorage on mount
  useEffect(() => {
    const init = async () => {
      let stored = getStoredSession() || (await tryAdoptSupabaseSession());
      if (!stored) {
        setLoading(false);
        return;
      }


      // If expired, try to refresh first
      if (isSessionExpired(stored)) {
        stored = await refreshSession(stored);
        if (!stored) {
          setLoading(false);
          return;
        }
      } else {
        setSession(stored);
      }

      try {
        const authUser = await fetchUserProfile(stored.user.id, stored.user.email, stored.access_token);
        setUser(authUser);
      } catch (err) {
        console.error('Failed to fetch user profile:', err);
        setUser({
          id: stored.user.id,
          email: stored.user.email,
          name: stored.user.user_metadata?.name || stored.user.email.split('@')[0],
          isAdmin: false,
          avatarUrl: null,
        });
      }
      setLoading(false);
    };
    init();
  }, [refreshSession]);

  // Auto-refresh token every 50 minutes (tokens last 60 min)
  useEffect(() => {
    if (!session) return;
    const interval = setInterval(async () => {
      const stored = getStoredSession();
      if (stored) {
        await refreshSession(stored);
      }
    }, 50 * 60 * 1000); // 50 minutes
    return () => clearInterval(interval);
  }, [session, refreshSession]);

  // Also refresh on window focus (handles returning after sleep/inactivity)
  useEffect(() => {
    const handleFocus = async () => {
      const stored = getStoredSession();
      if (stored && isSessionExpired(stored)) {
        await refreshSession(stored);
      }
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') handleFocus();
    };
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [refreshSession]);

  const signIn = async (email: string, password: string) => {
    const { data, error } = await dbAuth('signin', { email, password });
    if (error) throw new Error(error);
    if (!data?.access_token) throw new Error('No session returned');

    const stored = storeSession(data);
    setSession(stored);

    const authUser = await fetchUserProfile(stored.user.id, stored.user.email, stored.access_token);
    setUser(authUser);
  };

  const signUp = async (email: string, password: string, name: string) => {
    const { data, error } = await dbAuth('signup', { email, password, name });
    if (error) throw new Error(error);

    // If auto-confirm is off, there won't be a session
    if (data?.access_token) {
      const stored = storeSession(data);
      setSession(stored);
      const authUser = await fetchUserProfile(stored.user.id, stored.user.email, stored.access_token);
      setUser(authUser);
    }
  };

  const signOut = async () => {
    clearSession();
    setUser(null);
    setSession(null);
  };

  const refreshUser = useCallback(async () => {
    if (session) {
      try {
        const authUser = await fetchUserProfile(session.user.id, session.user.email, session.access_token);
        setUser(authUser);
      } catch (err) {
        console.error('Failed to refresh user profile:', err);
      }
    }
  }, [session]);

  return {
    user,
    session,
    loading,
    signIn,
    signUp,
    signOut,
    refreshUser,
  };
}
