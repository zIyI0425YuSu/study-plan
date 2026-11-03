-- 在 Supabase SQL Editor 中运行。需要先在 Authentication > Users 中创建两位用户。
-- 使用行级安全策略保护留言与打卡，禁止未授权用户访问。
create table if not exists public.board_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','guest'))
);
create table if not exists public.task_checks (
  task_id integer primary key check (task_id between 1 and 20),
  completed boolean not null default false,
  updated_at timestamptz not null default now()
);
create table if not exists public.board_messages (
  id bigint generated always as identity primary key,
  day integer not null check (day between 1 and 30),
  author_id uuid not null references auth.users(id) on delete cascade,
  content text not null check (char_length(trim(content)) between 1 and 1200),
  created_at timestamptz not null default now()
);
create or replace function public.is_board_member()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.board_members where user_id = (select auth.uid()));
$$;
create or replace function public.is_board_owner()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.board_members where user_id = (select auth.uid()) and role = 'owner');
$$;
revoke all on function public.is_board_member() from public;
revoke all on function public.is_board_owner() from public;
grant execute on function public.is_board_member() to authenticated;
grant execute on function public.is_board_owner() to authenticated;
alter table public.board_members enable row level security;
alter table public.task_checks enable row level security;
alter table public.board_messages enable row level security;
create policy "members read membership" on public.board_members for select to authenticated using (public.is_board_member());
create policy "members read checks" on public.task_checks for select to authenticated using (public.is_board_member());
create policy "owner insert checks" on public.task_checks for insert to authenticated with check (public.is_board_owner());
create policy "owner update checks" on public.task_checks for update to authenticated using (public.is_board_owner()) with check (public.is_board_owner());
create policy "owner delete checks" on public.task_checks for delete to authenticated using (public.is_board_owner());
create policy "members read messages" on public.board_messages for select to authenticated using (public.is_board_member());
create policy "members write own messages" on public.board_messages for insert to authenticated with check (public.is_board_member() and author_id = (select auth.uid()));

-- 创建好两人的账号后，再运行以下两句（分别填入实际邮箱）：
-- insert into public.board_members(user_id, role) select id, 'owner' from auth.users where email = '你的邮箱@example.com' on conflict(user_id) do update set role = excluded.role;
-- insert into public.board_members(user_id, role) select id, 'guest' from auth.users where email = '女朋友邮箱@example.com' on conflict(user_id) do update set role = excluded.role;
