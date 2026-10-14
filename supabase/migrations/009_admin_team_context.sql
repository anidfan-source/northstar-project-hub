alter table public.profiles
  add column if not exists active_team_id uuid references public.teams(id) on delete set null;

create or replace function public.current_team_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select case
    when is_admin then coalesce(active_team_id, team_id)
    else team_id
  end
  from public.profiles
  where user_id = auth.uid()
$$;

create or replace function public.set_admin_team_context(target_team uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.teams where id = target_team) then
    raise exception 'Team not found';
  end if;

  update public.profiles
  set active_team_id = target_team
  where user_id = auth.uid() and is_admin = true;

  if not found then
    raise exception 'Administrator access required';
  end if;
end;
$$;

revoke all on function public.set_admin_team_context(uuid) from public;
grant execute on function public.set_admin_team_context(uuid) to authenticated;
grant select, insert, update, delete on public.profiles to service_role;

create or replace function public.is_app_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select is_admin from public.profiles where user_id = auth.uid()), false)
$$;

revoke all on function public.is_app_admin() from public;
grant execute on function public.is_app_admin() to authenticated;

drop policy if exists "Team members can view profiles" on public.profiles;
create policy "Team members can view profiles" on public.profiles for select to authenticated
  using (user_id = auth.uid() or team_id = public.current_team_id());

drop policy if exists "Owners can update projects" on public.projects;
create policy "Owners can update projects" on public.projects for update to authenticated
  using (user_id = auth.uid() or (public.is_app_admin() and team_id = public.current_team_id()))
  with check (team_id = public.current_team_id() and (user_id = auth.uid() or public.is_app_admin()));

drop policy if exists "Owners can delete projects" on public.projects;
create policy "Owners can delete projects" on public.projects for delete to authenticated
  using (user_id = auth.uid() or (public.is_app_admin() and team_id = public.current_team_id()));

drop policy if exists "Owners can update tasks" on public.tasks;
create policy "Owners can update tasks" on public.tasks for update to authenticated
  using (user_id = auth.uid() or (public.is_app_admin() and team_id = public.current_team_id()))
  with check (team_id = public.current_team_id() and (user_id = auth.uid() or public.is_app_admin()));

drop policy if exists "Owners can delete tasks" on public.tasks;
create policy "Owners can delete tasks" on public.tasks for delete to authenticated
  using (user_id = auth.uid() or (public.is_app_admin() and team_id = public.current_team_id()));

notify pgrst, 'reload schema';
