-- Run once in Supabase SQL Editor.
create extension if not exists pgcrypto;
create table if not exists public.transactions (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 kind text not null check (kind in ('income','expense','debt')),
 amount numeric(14,2) not null check (amount > 0),
 currency text not null check (currency in ('AED','EGP')),
 category text not null,
 note text not null default '',
 occurred_on date not null default current_date,
 created_at timestamptz not null default now()
);
create index if not exists transactions_user_date_idx on public.transactions(user_id,occurred_on desc);
alter table public.transactions enable row level security;
drop policy if exists "users_select_own_transactions" on public.transactions;
drop policy if exists "users_insert_own_transactions" on public.transactions;
drop policy if exists "users_update_own_transactions" on public.transactions;
drop policy if exists "users_delete_own_transactions" on public.transactions;
create policy "users_select_own_transactions" on public.transactions for select to authenticated using ((select auth.uid())=user_id);
create policy "users_insert_own_transactions" on public.transactions for insert to authenticated with check ((select auth.uid())=user_id);
create policy "users_update_own_transactions" on public.transactions for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy "users_delete_own_transactions" on public.transactions for delete to authenticated using ((select auth.uid())=user_id);