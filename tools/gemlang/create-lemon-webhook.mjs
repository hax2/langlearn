const required = [
  'LEMON_SQUEEZY_API_KEY',
  'LEMON_SQUEEZY_STORE_ID',
  'LEMON_SQUEEZY_WEBHOOK_SECRET',
  'GEMLANG_SUPABASE_PROJECT_REF',
];

const missing = required.filter((name) => !process.env[name]);
if (missing.length) {
  throw new Error(`Missing environment variables: ${missing.join(', ')}`);
}

const apiKey = process.env.LEMON_SQUEEZY_API_KEY;
const storeId = process.env.LEMON_SQUEEZY_STORE_ID;
const webhookUrl = `https://${process.env.GEMLANG_SUPABASE_PROJECT_REF}.supabase.co/functions/v1/billing-webhook`;
const testMode = process.env.LEMON_SQUEEZY_TEST_MODE === 'true';
const headers = {
  Accept: 'application/vnd.api+json',
  'Content-Type': 'application/vnd.api+json',
  Authorization: `Bearer ${apiKey}`,
};

const listResponse = await fetch(
  `https://api.lemonsqueezy.com/v1/webhooks?filter[store-id]=${encodeURIComponent(storeId)}&page[size]=100`,
  { headers },
);
if (!listResponse.ok) {
  throw new Error(`Unable to inspect Lemon Squeezy webhooks (${listResponse.status}).`);
}

const list = await listResponse.json();
const existing = list.data?.find((webhook) => webhook.attributes?.url === webhookUrl);
if (existing) {
  console.log(`Lemon Squeezy webhook already exists for ${webhookUrl}`);
  process.exit(0);
}

const createResponse = await fetch('https://api.lemonsqueezy.com/v1/webhooks', {
  method: 'POST',
  headers,
  body: JSON.stringify({
    data: {
      type: 'webhooks',
      attributes: {
        url: webhookUrl,
        events: [
          'subscription_created',
          'subscription_updated',
          'subscription_cancelled',
          'subscription_resumed',
          'subscription_expired',
          'subscription_paused',
          'subscription_unpaused',
          'subscription_plan_changed',
        ],
        secret: process.env.LEMON_SQUEEZY_WEBHOOK_SECRET,
        test_mode: testMode,
      },
      relationships: {
        store: { data: { type: 'stores', id: storeId } },
      },
    },
  }),
});

if (!createResponse.ok) {
  const details = await createResponse.text();
  throw new Error(`Unable to create Lemon Squeezy webhook (${createResponse.status}): ${details}`);
}

console.log(`Created ${testMode ? 'test' : 'live'} Lemon Squeezy webhook for ${webhookUrl}`);
