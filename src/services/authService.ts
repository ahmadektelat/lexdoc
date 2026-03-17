// CREATED: 2026-03-17 16:00 IST (Jerusalem)
// authService - Wraps Supabase Auth operations + secure login attempt tracking

import { supabase } from '@/integrations/supabase/client';

export const authService = {
  async signUp(email: string, password: string) {
    return supabase.auth.signUp({ email, password });
  },

  async signIn(email: string, password: string) {
    // 1. Check lockout status FIRST via RPC
    const { data: lockCheck } = await supabase.rpc('check_login_locked', { p_email: email });
    if (lockCheck === true) {
      return {
        data: { user: null, session: null },
        error: { message: 'ACCOUNT_LOCKED', name: 'AuthApiError', status: 403 },
        isLocked: true,
        failedCount: 5,
      };
    }

    // 2. Attempt sign-in via Supabase Auth
    const result = await supabase.auth.signInWithPassword({ email, password });

    // 3. Record attempt via secure RPC (returns lockout state + count)
    const { data: attemptResult } = await supabase.rpc('record_login_attempt', {
      p_email: email,
      p_success: !result.error,
    });

    // 4. Return enriched result
    if (result.error) {
      return {
        ...result,
        isLocked: attemptResult?.[0]?.is_locked ?? false,
        failedCount: attemptResult?.[0]?.failed_count ?? 0,
      };
    }

    return { ...result, isLocked: false, failedCount: 0 };
  },

  async signOut() {
    return supabase.auth.signOut();
  },

  async getCurrentUser() {
    const { data: { user } } = await supabase.auth.getUser();
    return user;
  },

  async getSession() {
    const { data: { session } } = await supabase.auth.getSession();
    return session;
  },

  onAuthStateChange(callback: Parameters<typeof supabase.auth.onAuthStateChange>[0]) {
    return supabase.auth.onAuthStateChange(callback);
  },
};
