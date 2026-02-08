import { useState, useEffect, useCallback } from 'react';
import { dbFetch, dbAuth } from '@/lib/dbFetch';

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
    // Check if expired (with 60s buffer)
    if (session.expires_at && session.expires_at < Math.floor(Date.now() / 1000) + 60) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return session;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
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

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [session, setSession] = useState<StoredSession | null>(null);
  const [loading, setLoading] = useState(true);

  // Initialize from localStorage on mount
  useEffect(() => {
    const stored = getStoredSession();
    if (stored) {
      setSession(stored);
      fetchUserProfile(stored.user.id, stored.user.email, stored.access_token)
        .then(authUser => setUser(authUser))
        .catch(err => {
          console.error('Failed to fetch user profile:', err);
          setUser({
            id: stored.user.id,
            email: stored.user.email,
            name: stored.user.user_metadata?.name || stored.user.email.split('@')[0],
            isAdmin: false,
            avatarUrl: null,
          });
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

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
