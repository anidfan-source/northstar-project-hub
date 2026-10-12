alter table public.projects
  add column if not exists board_columns jsonb not null default '[
    {"id":"backlog","label":"Backlog","tone":"slate"},
    {"id":"progress","label":"In progress","tone":"blue"},
    {"id":"review","label":"In review","tone":"amber"},
    {"id":"done","label":"Done","tone":"green"}
  ]'::jsonb;

alter table public.tasks
  add column if not exists board_column text;

update public.tasks
set board_column = status
where board_column is null;

alter table public.tasks
  alter column board_column set default 'backlog';
