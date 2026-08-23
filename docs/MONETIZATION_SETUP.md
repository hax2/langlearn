# GemLang monetisation launch

All code, database policy, checkout, webhook handling, customer portal, paywall UI, and deployment automation are ready. The remaining steps require your legal identity, payment account, or authenticated access.

## 1. Add your public operator details

Add these two values to `.env.local`:

```dotenv
VITE_LEGAL_NAME="Your legal name or registered business name"
VITE_SUPPORT_EMAIL="support@your-domain.example"
```

They appear in the in-app Terms and Privacy Policy. Review those documents for your circumstances before launch; they are a practical product template, not legal advice.

## 2. Activate Lemon Squeezy

1. Create a [Lemon Squeezy account](https://app.lemonsqueezy.com/register) and submit the store for activation.
2. Complete identity/business verification and add your bank payout details.
3. Set the store currency to **EUR** and enable **tax-inclusive pricing**.
4. Set the store support email, statement descriptor, logo, and customer-portal Back link (`https://hax2.github.io/gemlang/`).
5. Create one published subscription product named **GemLang Pro** with this description: `The complete GemLang Spanish course: every lesson, story, review, and future module.`
6. Create two published variants:
   - **Monthly** — €8.99, billed every month, tax code `SaaS`.
   - **Yearly** — €59.99, billed every year, tax code `SaaS`.
7. Do not add a free trial at launch; the four-module free tier is the trial experience and does not require a card.
8. Create a live-mode API key. API keys currently expire after one year, so add a renewal reminder before its expiry date.

Lemon Squeezy is the merchant of record: it calculates and remits VAT/sales tax and provides invoices and customer billing support. You still need to account for payouts as business/self-employment income in your country.

## 3. Fill the private deployment file

Copy the prepared template:

```bash
cp supabase/.env.example .env.monetization
```

Fill every value. IDs are visible in Lemon Squeezy URLs/API pages. Generate the webhook secret with a password manager (6–40 characters). `GEMLANG_SUPABASE_PROJECT_REF` is the subdomain part of your existing Supabase URL.

The file is gitignored. Never commit or paste it into an issue or chat.

## 4. Authenticate the two deployment tools

```bash
npx --yes supabase@latest login
gh auth login -h github.com
gh auth setup-git
```

These browser/device authorization steps require you because they grant access to your Supabase and GitHub accounts.

## 5. Deploy everything

From the repository root:

```bash
./scripts/finish-monetization-setup.sh
```

The script links the existing Supabase project, applies the `subscriptions` migration, uploads billing secrets, deploys all three Edge Functions, creates the signed Lemon Squeezy webhook if absent, builds the app, and deploys GitHub Pages.

## 6. One real end-to-end check

Use a second email address as a customer:

1. Open the deployed app in a private window and create an account.
2. Confirm a free module opens and a Pro module shows pricing.
3. Buy the monthly plan. Confirm checkout returns to GemLang and the header changes to **Pro** within several seconds.
4. Open a premium lesson.
5. Open **Settings → Manage billing** and cancel the subscription. Confirm access remains available through the paid-through date.
6. In Lemon Squeezy, refund this launch test if desired. A cancellation alone does not refund the charge.

Before promoting the app, inspect the Lemon Squeezy webhook log and confirm the `subscription_created` request returned HTTP 200. If it did not, use **Resend** after checking the Supabase Edge Function logs.

## Operating checklist

- Rotate the Lemon Squeezy API key annually and redeploy secrets; webhook secrets do not need to rotate with it.
- Answer support and refund requests through the support email configured in both GemLang and Lemon Squeezy.
- Review Lemon Squeezy payouts and failed-payment reports monthly.
- Add privacy-policy disclosures before introducing analytics, marketing email, error tracking, or advertising cookies.
- Consider moving premium lesson JSON behind an authenticated endpoint only if asset-level copy protection becomes commercially important.
