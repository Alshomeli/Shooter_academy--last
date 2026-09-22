create or replace function internal.guard_team_coach_assignment()
returns trigger
language plpgsql
security definer
set search_path = public, internal
as $$
begin
  if tg_op = 'UPDATE' and new.coach_id is distinct from old.coach_id then
    if not internal.has_role(array['manager']::text[]) then
      raise exception 'Only academy managers can change a team coach assignment';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function internal.guard_team_coach_assignment() from public;
grant execute on function internal.guard_team_coach_assignment() to postgres;

drop trigger if exists trg_guard_team_coach_assignment on public.teams;
create trigger trg_guard_team_coach_assignment
before update on public.teams
for each row execute function internal.guard_team_coach_assignment();

-- Remove accidental public/API exposure of the development-only table.
drop policy if exists "Anyone can read some_table" on public.some_table;
revoke all on public.some_table from anon, authenticated;

comment on table public.some_table is 'Development-only table; intentionally not exposed to anon/authenticated API roles.';
