export const FREE_MODULE_IDS = new Set([
  'module-1',
  'module-2',
  'module-3',
  'review-1-2-3',
]);

export const PRICING_PLANS = {
  monthly: {
    id: 'monthly',
    name: 'Monthly',
    price: '€8.99',
    cadence: '/month',
  },
  yearly: {
    id: 'yearly',
    name: 'Yearly',
    price: '€59.99',
    cadence: '/year',
    monthlyEquivalent: '€5/month',
    badge: 'Save 44%',
  },
};

// Lemon Squeezy recommends retaining access for every documented subscription
// state except "expired". An unknown/corrupt value fails closed.
const ACCESS_STATUSES = new Set([
  'on_trial',
  'active',
  'paused',
  'past_due',
  'unpaid',
  'cancelled',
]);

export const hasPaidAccess = (subscription) =>
  Boolean(subscription && ACCESS_STATUSES.has(subscription.status));

export const isModuleFree = (moduleId) => FREE_MODULE_IDS.has(moduleId);
