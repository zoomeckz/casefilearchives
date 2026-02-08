import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { User, Session } from '@supabase/supabase-js';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  isAdmin: boolean;
  avatarUrl: string | null;
}

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUserProfile = async (userId: string, email: string): Promise<AuthUser> => {
    // Fetch profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('name, avatar_url')
      .eq('user_id', userId)
      .maybeSingle();

    // Check admin role
    const { data: roles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId);

    const isAdmin = roles?.some(r => r.role === 'admin') ?? false;

    return {
      id: userId,
      email,
      name: profile?.name || email.split('@')[0],
      isAdmin,
      avatarUrl: profile?.avatar_url || null,
    };
  };

  useEffect(() => {
    // Set up auth listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      if (session?.user) {
        try {
          const authUser = await fetchUserProfile(session.user.id, session.user.email || '');
          setUser(authUser);
        } catch (err) {
          console.error('Failed to fetch user profile:', err);
          // Still set a basic user so auth doesn't appear broken
          setUser({
            id: session.user.id,
            email: session.user.email || '',
            name: session.user.email?.split('@')[0] || 'User',
            isAdmin: false,
            avatarUrl: null,
          });
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    // THEN get initial session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        try {
          const authUser = await fetchUserProfile(session.user.id, session.user.email || '');
          setUser(authUser);
        } catch (err) {
          console.error('Failed to fetch user profile:', err);
          setUser({
            id: session.user.id,
            email: session.user.email || '',
            name: session.user.email?.split('@')[0] || 'User',
            isAdmin: false,
            avatarUrl: null,
          });
        }
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signUp = async (email: string, password: string, name: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name }
      }
    });
    if (error) throw error;
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  const refreshUser = useCallback(async () => {
    if (session?.user) {
      try {
        const authUser = await fetchUserProfile(session.user.id, session.user.email || '');
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
