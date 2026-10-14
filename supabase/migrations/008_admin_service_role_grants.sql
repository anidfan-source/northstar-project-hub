-- Edge Functions use the service role for administrator-only team provisioning.
-- BYPASSRLS does not replace PostgreSQL table privileges, so grant them explicitly.
grant usage on schema public to service_role;
grant select, insert, update, delete on public.teams, public.profiles to service_role;

notify pgrst, 'reload schema';
