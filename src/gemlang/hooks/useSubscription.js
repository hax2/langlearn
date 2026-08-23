import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../supabaseClient';
import { hasPaidAccess } from '../config/monetization';

const CHECKOUT_POLL_DELAYS = [0, 1000, 1500, 2500, 4000, 6000];

const delay = (milliseconds) => new Promise((resolve) => {
  window.setTimeout(resolve, milliseconds);
});

export default function useSubscription(session) {
  const [subscription, setSubscription] = useState(null);
  const [isLoading, setIsLoading] = useState(Boolean(session));
  const [error, setError] = useState(null);
  const requestRef = useRef(0);

  const refresh = useCallback(async ({ quiet = false } = {}) => {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;

    if (!session?.user) {
      setSubscription(null);
      setIsLoading(false);
      setError(null);
      return null;
    }

    if (!quiet) setIsLoading(true);
    const { data, error: queryError } = await supabase
      .from('subscriptions')
      .select('status, variant_id, renews_at, ends_at, trial_ends_at, is_cancelled, synced_at')
      .eq('user_id', session.user.id)
      .maybeSingle();

    if (requestRef.current !== requestId) return null;

    if (queryError) {
      setError('Billing status is temporarily unavailable.');
      setSubscription(null);
    } else {
      setError(null);
      setSubscription(data);
    }
    setIsLoading(false);
    return queryError ? null : data;
  }, [session]);

  useEffect(() => {
    const refreshTimer = window.setTimeout(() => void refresh(), 0);
    return () => {
      window.clearTimeout(refreshTimer);
      requestRef.current += 1;
    };
  }, [refresh]);

  useEffect(() => {
    if (!session?.user) return undefined;

    const params = new URLSearchParams(window.location.search);
    if (params.get('checkout') !== 'success') return undefined;

    let cancelled = false;
    const syncCheckout = async () => {
      for (const pollDelay of CHECKOUT_POLL_DELAYS) {
        if (pollDelay) await delay(pollDelay);
        if (cancelled) return;
        const current = await refresh({ quiet: true });
        if (hasPaidAccess(current)) break;
      }

      if (!cancelled) {
        params.delete('checkout');
        const query = params.toString();
        const nextUrl = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`;
        window.history.replaceState({}, '', nextUrl);
      }
    };

    void syncCheckout();
    return () => { cancelled = true; };
  }, [refresh, session]);

  const startCheckout = useCallback(async (plan) => {
    if (!session?.user) throw new Error('Sign in before choosing a plan.');

    const { data, error: functionError } = await supabase.functions.invoke('billing-checkout', {
      body: { plan },
    });

    if (functionError || !data?.url) {
      throw new Error(data?.error || 'Checkout is temporarily unavailable. Please try again.');
    }

    window.location.assign(data.url);
  }, [session]);

  const openBillingPortal = useCallback(async () => {
    if (!session?.user) throw new Error('Sign in to manage billing.');

    const { data, error: functionError } = await supabase.functions.invoke('billing-portal');
    if (functionError || !data?.url) {
      throw new Error(data?.error || 'The billing portal is temporarily unavailable.');
    }

    window.location.assign(data.url);
  }, [session]);

  return useMemo(() => ({
    subscription,
    hasPremiumAccess: hasPaidAccess(subscription),
    isLoading,
    error,
    refresh,
    startCheckout,
    openBillingPortal,
  }), [error, isLoading, openBillingPortal, refresh, startCheckout, subscription]);
}
