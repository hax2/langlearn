#!/usr/bin/env bash
set -euo pipefail

setup_file="${1:-.env.monetization}"

if [[ ! -f "$setup_file" ]]; then
  echo "Missing $setup_file. Copy supabase/.env.example to .env.monetization and fill in the values."
  exit 1
fi

set -a
source "$setup_file"
set +a

required=(
  GEMLANG_SUPABASE_PROJECT_REF
  LEMON_SQUEEZY_API_KEY
  LEMON_SQUEEZY_STORE_ID
  LEMON_SQUEEZY_MONTHLY_VARIANT_ID
  LEMON_SQUEEZY_YEARLY_VARIANT_ID
  LEMON_SQUEEZY_WEBHOOK_SECRET
  WEB_APP_URL
)

for variable_name in "${required[@]}"; do
  if [[ -z "${!variable_name:-}" ]]; then
    echo "Missing $variable_name in $setup_file"
    exit 1
  fi
done

if [[ ! -f .env.local ]] ||
  ! grep -Eq '^VITE_LEGAL_NAME=.+$' .env.local ||
  ! grep -Eq '^VITE_SUPPORT_EMAIL=.+$' .env.local; then
  echo "Add VITE_LEGAL_NAME and VITE_SUPPORT_EMAIL to .env.local before launching."
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "GitHub authentication is required. Run: gh auth login -h github.com && gh auth setup-git"
  exit 1
fi

supabase_cli=(npx --yes supabase@latest)

"${supabase_cli[@]}" link --project-ref "$GEMLANG_SUPABASE_PROJECT_REF"
"${supabase_cli[@]}" db push --linked
"${supabase_cli[@]}" secrets set --env-file "$setup_file" --project-ref "$GEMLANG_SUPABASE_PROJECT_REF"
"${supabase_cli[@]}" functions deploy --project-ref "$GEMLANG_SUPABASE_PROJECT_REF"

node scripts/create-lemon-webhook.mjs
npm run build
npm run deploy:prod

echo "GemLang monetisation is deployed. Complete the test transaction checklist in MONETIZATION_SETUP.md."
