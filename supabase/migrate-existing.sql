-- Safe additive migration for an existing transactions table.
-- Does not delete existing rows.
alter table public.transactions
  add column if not exists occurred_on date,
  add column if not exists kind text,
  add column if not exists amount numeric(14,2),
  add column if not exists currency text,
  add column if not exists category text,
  add column if not exists note text,
  add column if not exists user_id uuid;
update public.transactions set occurred_on = current_date where occurred_on is null;
alter table public.transactions alter column occurred_on set default current_date;
alter table public.transactions alter column currency set default 'AED';
alter table public.transactions alter column note set default '';
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