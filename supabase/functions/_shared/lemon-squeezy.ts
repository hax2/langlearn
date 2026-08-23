const apiBase = 'https://api.lemonsqueezy.com/v1';

export const getLemonConfig = () => ({
  apiKey: Deno.env.get('LEMON_SQUEEZY_API_KEY') || '',
  storeId: Deno.env.get('LEMON_SQUEEZY_STORE_ID') || '',
  monthlyVariantId: Deno.env.get('LEMON_SQUEEZY_MONTHLY_VARIANT_ID') || '',
  yearlyVariantId: Deno.env.get('LEMON_SQUEEZY_YEARLY_VARIANT_ID') || '',
  webhookSecret: Deno.env.get('LEMON_SQUEEZY_WEBHOOK_SECRET') || '',
  webAppUrl: Deno.env.get('WEB_APP_URL') || '',
});

export const lemonRequest = async (path: string, options: RequestInit = {}) => {
  const { apiKey } = getLemonConfig();
  if (!apiKey) throw new Error('Lemon Squeezy API key is not configured.');

  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: {
      Accept: 'application/vnd.api+json',
      'Content-Type': 'application/vnd.api+json',
      Authorization: `Bearer ${apiKey}`,
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    console.error('Lemon Squeezy API request failed', response.status, path);
    throw new Error('The billing provider rejected the request.');
  }

  return response.json();
};

export const getCustomerPortalUrl = async (subscriptionId: string | number) => {
  const payload = await lemonRequest(`/subscriptions/${subscriptionId}`);
  return payload?.data?.attributes?.urls?.customer_portal || null;
};

export const verifyWebhookSignature = async (
  rawBody: string,
  signature: string,
  secret: string,
) => {
  if (!signature || !secret) return false;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
  const expected = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

  if (expected.length !== signature.length) return false;
  let mismatch = 0;
  for (let index = 0; index < expected.length; index += 1) {
    mismatch |= expected.charCodeAt(index) ^ signature.charCodeAt(index);
  }
  return mismatch === 0;
};
