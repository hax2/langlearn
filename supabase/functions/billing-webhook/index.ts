import { json } from '../_shared/http.ts';
import { supabaseAdmin } from '../_shared/supabase.ts';
import { getLemonConfig, verifyWebhookSignature } from '../_shared/lemon-squeezy.ts';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  const rawBody = await request.text();
  const signature = request.headers.get('X-Signature') || '';
  const config = getLemonConfig();
  const validSignature = await verifyWebhookSignature(rawBody, signature, config.webhookSecret);
  if (!validSignature) return json({ error: 'Invalid webhook signature.' }, 401);

  try {
    const payload = JSON.parse(rawBody);
    const eventName = payload?.meta?.event_name || request.headers.get('X-Event-Name') || '';
    if (!eventName.startsWith('subscription_') || payload?.data?.type !== 'subscriptions') {
      return json({ received: true, ignored: true });
    }

    const attributes = payload.data.attributes || {};
    if (String(attributes.store_id) !== config.storeId) {
      return json({ error: 'Webhook store does not match.' }, 403);
    }

    const lemonSubscriptionId = String(payload.data.id || '');
    let userId = payload?.meta?.custom_data?.user_id || '';

    if (!UUID_PATTERN.test(userId)) {
      const { data: existing } = await supabaseAdmin
        .from('subscriptions')
        .select('user_id')
        .eq('lemon_subscription_id', lemonSubscriptionId)
        .maybeSingle();
      userId = existing?.user_id || '';
    }

    if (!UUID_PATTERN.test(userId)) {
      console.error('Subscription webhook cannot be linked to a GemLang user', lemonSubscriptionId);
      return json({ error: 'Subscription user is missing.' }, 422);
    }

    const variantId = String(attributes.variant_id || '');
    if (variantId !== config.monthlyVariantId && variantId !== config.yearlyVariantId) {
      return json({ error: 'Webhook variant does not match a GemLang plan.' }, 422);
    }
    const plan = variantId === config.monthlyVariantId ? 'monthly' : 'yearly';

    const record = {
      user_id: userId,
      lemon_customer_id: String(attributes.customer_id || ''),
      lemon_subscription_id: lemonSubscriptionId,
      lemon_order_id: String(attributes.order_id || ''),
      product_id: String(attributes.product_id || ''),
      variant_id: variantId,
      plan,
      status: attributes.status || 'unknown',
      is_cancelled: Boolean(attributes.cancelled),
      pause_mode: attributes.pause?.mode || null,
      renews_at: attributes.renews_at || null,
      ends_at: attributes.ends_at || null,
      trial_ends_at: attributes.trial_ends_at || null,
      provider_updated_at: attributes.updated_at || null,
      test_mode: Boolean(attributes.test_mode),
      synced_at: new Date().toISOString(),
    };

    const { error } = await supabaseAdmin
      .from('subscriptions')
      .upsert(record, { onConflict: 'user_id' });
    if (error) throw error;

    return json({ received: true });
  } catch (error) {
    console.error('Unable to process billing webhook', error instanceof Error ? error.message : error);
    return json({ error: 'Webhook processing failed.' }, 500);
  }
});
