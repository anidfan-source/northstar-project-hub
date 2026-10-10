insert into public.teams (name)
values ('Transformation and Readiness')
on conflict (name) do nothing;

insert into public.profiles (user_id, username, team_id, must_change_password)
select
  users.id,
  upper(split_part(users.email, '@', 1)),
  teams.id,
  true
from auth.users users
cross join public.teams teams
where teams.name = 'Transformation and Readiness'
  and lower(users.email) in (
    'kchallis@northstar.local',
    'cjennings@northstar.local',
    'jpmcdermott@northstar.local',
    'asymonds@northstar.local',
    'lmetolli@northstar.local',
    'rmeyers@northstar.local'
  )
on conflict (user_id) do update
set username = excluded.username,
    team_id = excluded.team_id,
    must_change_password = true;

update public.projects projects
set team_id = profiles.team_id
from public.profiles profiles
where projects.user_id = profiles.user_id
  and projects.team_id is null;

update public.tasks tasks
set team_id = projects.team_id
from public.projects projects
where tasks.project_id = projects.id
  and tasks.team_id is null;

notify pgrst, 'reload schema';
