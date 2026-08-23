import { handlePreflight, json } from '../_shared/http.ts';
import { getAuthenticatedUser, supabaseAdmin } from '../_shared/supabase.ts';
import { getCustomerPortalUrl } from '../_shared/lemon-squeezy.ts';

Deno.serve(async (request) => {
  const preflight = handlePreflight(request);
  if (preflight) return preflight;
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  const user = await getAuthenticatedUser(request);
  if (!user) return json({ error: 'Sign in to manage billing.' }, 401);

  try {
    const { data: subscription, error } = await supabaseAdmin
      .from('subscriptions')
      .select('lemon_subscription_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) throw error;
    if (!subscription) return json({ error: 'No subscription was found for this account.' }, 404);

    const portalUrl = await getCustomerPortalUrl(subscription.lemon_subscription_id);
    if (!portalUrl) throw new Error('Customer portal URL missing from provider response.');
    return json({ url: portalUrl });
  } catch (error) {
    console.error('Unable to open billing portal', error instanceof Error ? error.message : error);
    return json({ error: 'The billing portal is temporarily unavailable.' }, 502);
  }
});
