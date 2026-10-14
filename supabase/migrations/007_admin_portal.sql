alter table public.profiles
  add column if not exists is_admin boolean not null default false;

update public.profiles
set is_admin = true
where lower(username::text) = 'mkearney';

insert into public.teams (name)
values ('Synapse')
on conflict (name) do nothing;

notify pgrst, 'reload schema';
