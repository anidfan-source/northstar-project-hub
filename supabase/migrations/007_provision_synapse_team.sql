-- Creates the Synapse workspace and automatically seeds it when the
-- babyyoda account is created through Supabase Auth.
-- Create the account as babyyoda@northstar.local in Supabase Auth, then set its
-- password in the Auth dashboard. Passwords must not be committed to this repository.

insert into public.teams (name)
values ('Synapse')
on conflict (name) do nothing;

create or replace function public.provision_synapse_babyyoda()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  synapse_team_id uuid;
  project_id bigint;
begin
  if lower(new.email) <> 'babyyoda@northstar.local' then
    return new;
  end if;

  select id into synapse_team_id
  from public.teams
  where name = 'Synapse';

  insert into public.profiles (user_id, username, team_id, must_change_password)
  values (new.id, 'babyyoda', synapse_team_id, false)
  on conflict (user_id) do update
  set username = excluded.username,
      team_id = excluded.team_id,
      must_change_password = excluded.must_change_password;

  insert into public.projects (user_id, team_id, name, color, description, notes)
  select new.id, synapse_team_id, seed.name, seed.color, seed.description, seed.notes
  from (values
    ('AI Support Copilot', 'violet', 'Build an AI assistant that summarises customer issues and recommends next actions.', 'Discovery: map support journeys. Build: prototype retrieval and response drafting.'),
    ('Smart Meeting Studio', 'blue', 'Create an AI workspace that turns meetings into actions, decisions and follow-ups.', 'Start with transcription import, decision extraction and task assignment.'),
    ('Insight Canvas', 'coral', 'Build an AI-powered app for turning operational data into concise visual insight packs.', 'Prioritise source connections, executive summaries and editable visual stories.')
  ) as seed(name, color, description, notes)
  where not exists (
    select 1 from public.projects project
    where project.user_id = new.id and project.name = seed.name
  );

  select id into project_id
  from public.projects
  where user_id = new.id and name = 'AI Support Copilot'
  order by id asc
  limit 1;

  if project_id is not null then
    insert into public.tasks (user_id, team_id, project_id, title, description, status, priority, due, assignee, tag, sort_order)
    select new.id, synapse_team_id, project_id, task.title, task.description, task.status, task.priority, task.due, 'babyyoda', task.tag, task.sort_order
    from (values
      ('Map top five support journeys', 'Identify the highest-value journeys for the first copilot release.', 'backlog', 'High', '24 Oct 2026', 'Discovery', 10),
      ('Design retrieval prototype', 'Create a prototype that grounds suggested responses in approved knowledge.', 'progress', 'High', '31 Oct 2026', 'AI', 20),
      ('Test response quality', 'Review answers for accuracy, usefulness and tone with a pilot group.', 'backlog', 'Medium', '14 Nov 2026', 'Quality', 30)
    ) as task(title, description, status, priority, due, tag, sort_order)
    where not exists (
      select 1 from public.tasks t
      where t.user_id = new.id and t.project_id = project_id and t.title = task.title
    );
  end if;

  return new;
end;
$$;

drop trigger if exists provision_synapse_babyyoda_after_signup on auth.users;
create trigger provision_synapse_babyyoda_after_signup
after insert on auth.users
for each row execute function public.provision_synapse_babyyoda();

notify pgrst, 'reload schema';
