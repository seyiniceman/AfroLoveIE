import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import { supabase } from '../lib/supabase';

export function useSessionRefresh() {
  useEffect(() => {
    const client = supabase;
    if (!client || Platform.OS === 'web') return;
    const refresh = (state: string) => {
      if (state === 'active') void client.auth.startAutoRefresh();
      else void client.auth.stopAutoRefresh();
    };
    refresh(AppState.currentState);
    const subscription = AppState.addEventListener('change', refresh);
    return () => {
      subscription.remove();
      void client.auth.stopAutoRefresh();
    };
  }, []);
}
