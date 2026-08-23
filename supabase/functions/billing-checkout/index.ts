import { handlePreflight, json } from '../_shared/http.ts';
import { getAuthenticatedUser, supabaseAdmin } from '../_shared/supabase.ts';
import {
  getCustomerPortalUrl,
  getLemonConfig,
  lemonRequest,
} from '../_shared/lemon-squeezy.ts';

const ACCESS_STATUSES = new Set(['on_trial', 'active', 'paused', 'past_due', 'unpaid', 'cancelled']);

Deno.serve(async (request) => {
  const preflight = handlePreflight(request);
  if (preflight) return preflight;
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  const user = await getAuthenticatedUser(request);
  if (!user) return json({ error: 'Sign in before choosing a plan.' }, 401);

  try {
    const { data: currentSubscription } = await supabaseAdmin
      .from('subscriptions')
      .select('lemon_subscription_id, status')
      .eq('user_id', user.id)
      .maybeSingle();

    if (currentSubscription && ACCESS_STATUSES.has(currentSubscription.status)) {
      const portalUrl = await getCustomerPortalUrl(currentSubscription.lemon_subscription_id);
      if (portalUrl) return json({ url: portalUrl, destination: 'portal' });
    }

    const body = await request.json().catch(() => ({}));
    const plan = body?.plan;
    const config = getLemonConfig();
    const variantId = plan === 'monthly'
      ? config.monthlyVariantId
      : plan === 'yearly'
        ? config.yearlyVariantId
        : '';

    if (!variantId) {
      if (plan !== 'monthly' && plan !== 'yearly') {
        return json({ error: 'Choose a valid billing period.' }, 400);
      }
      return json({ error: 'This plan is not available yet.' }, 503);
    }
    if (!config.apiKey || !config.storeId || !config.webAppUrl) {
      return json({ error: 'Checkout configuration is incomplete.' }, 503);
    }

    const redirectUrl = new URL(config.webAppUrl);
    redirectUrl.searchParams.set('checkout', 'success');

    const checkout = await lemonRequest('/checkouts', {
      method: 'POST',
      body: JSON.stringify({
        data: {
          type: 'checkouts',
          attributes: {
            product_options: {
              redirect_url: redirectUrl.toString(),
              receipt_button_text: 'Start learning',
              receipt_link_url: config.webAppUrl,
              enabled_variants: [Number(variantId)],
            },
            checkout_options: {
              embed: false,
              media: true,
              logo: true,
              desc: true,
              discount: true,
            },
            checkout_data: {
              email: user.email,
              custom: {
                user_id: user.id,
                plan,
              },
            },
          },
          relationships: {
            store: { data: { type: 'stores', id: config.storeId } },
            variant: { data: { type: 'variants', id: variantId } },
          },
        },
      }),
    });

    const checkoutUrl = checkout?.data?.attributes?.url;
    if (!checkoutUrl) throw new Error('Checkout URL missing from provider response.');
    return json({ url: checkoutUrl, destination: 'checkout' });
  } catch (error) {
    console.error('Unable to create checkout', error instanceof Error ? error.message : error);
    return json({ error: 'Checkout is temporarily unavailable. Please try again.' }, 502);
  }
});
