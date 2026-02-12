import { create } from 'zustand';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

interface AuthState {
  session: Session | null;
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setSession: (session: Session | null) => void;
  setLoading: (value: boolean) => void;
  initialize: () => () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  user: null,
  isAuthenticated: false,
  isLoading: true,

  setSession: (session) =>
    set({
      session,
      user: session?.user ?? null,
      isAuthenticated: !!session,
    }),

  setLoading: (value) => set({ isLoading: value }),

  initialize: () => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      set({
        session,
        user: session?.user ?? null,
        isAuthenticated: !!session,
        isLoading: false,
      });
    });

    // Listen for auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      set({
        session,
        user: session?.user ?? null,
        isAuthenticated: !!session,
      });
    });

    return () => subscription.unsubscribe();
  },
}));
