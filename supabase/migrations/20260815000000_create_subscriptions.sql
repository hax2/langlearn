create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  lemon_customer_id text not null,
  lemon_subscription_id text not null unique,
  lemon_order_id text,
  product_id text not null,
  variant_id text not null,
  plan text not null check (plan in ('monthly', 'yearly')),
  status text not null,
  is_cancelled boolean not null default false,
  pause_mode text,
  renews_at timestamptz,
  ends_at timestamptz,
  trial_ends_at timestamptz,
  provider_updated_at timestamptz,
  test_mode boolean not null default false,
  synced_at timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

drop policy if exists "Users can view their own subscription" on public.subscriptions;
create policy "Users can view their own subscription"
  on public.subscriptions
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.subscriptions from anon;
revoke insert, update, delete, truncate, references, trigger on table public.subscriptions from authenticated;
grant select on table public.subscriptions to authenticated;
grant all on table public.subscriptions to service_role;

create index if not exists subscriptions_status_idx on public.subscriptions(status);
