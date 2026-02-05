import { useState, useEffect } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    // IMMEDIATELY clear local state - don't wait for API
    // This ensures the UI updates instantly and user can navigate away
    setUser(null);
    setSession(null);
    
    // Clear localStorage immediately (synchronous operation)
    try {
      // Clear all Supabase-related keys from localStorage
      const keys = Object.keys(localStorage);
      keys.forEach(key => {
        if (
          key.startsWith('sb-') ||
          key.includes('supabase') ||
          key.includes('auth') ||
          key.startsWith('reportChat_')
        ) {
          localStorage.removeItem(key);
        }
      });
      
      // Also try to clear sessionStorage
      try {
        const sessionKeys = Object.keys(sessionStorage);
        sessionKeys.forEach(key => {
          if (key.startsWith('sb-') || key.includes('supabase') || key.includes('auth')) {
            sessionStorage.removeItem(key);
          }
        });
      } catch (e) {
        // Ignore sessionStorage errors
      }
    } catch (storageError) {
      logger.warn('Failed to clear storage:', storageError);
    }
    
    // Try API signout in background (fire-and-forget, don't wait for it)
    // Use a timeout to prevent hanging, and catch all errors silently
    Promise.race([
      supabase.auth.signOut({ scope: 'local' }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 2000))
    ]).catch((error) => {
      // Silently ignore all signout API errors - we've already cleared local state
      // This is expected in production environments where API calls may fail
      if (process.env.NODE_ENV === 'development') {
        logger.warn('SignOut API call failed (non-blocking):', error);
      }
    });
    
    // Always return success since we've cleared local state
    return { error: null };
  };

  return {
    user,
    session,
    loading,
    signOut,
    isAuthenticated: !!user
  };
};