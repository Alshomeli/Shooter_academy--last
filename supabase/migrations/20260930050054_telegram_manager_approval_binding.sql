create table if not exists internal.telegram_manager_bindings (
  chat_id_hash text primary key,
  staff_id text not null references public.staff(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (staff_id)
);

create table if not exists internal.telegram_admin_actions (
  id uuid primary key default gen_random_uuid(),
  chat_id_hash text not null,
  staff_id text not null references public.staff(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  created_at timestamptz not null default now()
);

revoke all on internal.telegram_manager_bindings from public, anon, authenticated;
revoke all on internal.telegram_admin_actions from public, anon, authenticated;

-- Manager Telegram bindings are operational data, not schema seed data.
-- Configure them separately after a real, active manager staff record exists.
-- This migration must also succeed on an empty preview database.

create or replace function internal.telegram_approve_registration_application(
  p_application_id uuid,
  p_chat_id_hash text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff public.staff%rowtype;
  v_result jsonb;
  v_previous_sub text;
begin
  select s.* into v_staff
  from internal.telegram_manager_bindings b
  join public.staff s on s.id=b.staff_id
  where b.chat_id_hash=p_chat_id_hash
    and b.active=true
    and s.role='manager'
    and s.status='active'
    and s.user_id is not null;

  if not found then
    raise exception 'Telegram manager binding not authorized' using errcode='42501';
  end if;

  if not exists (
    select 1 from public.registration_applications
    where id=p_application_id and status in ('pending','under_review')
  ) then
    return jsonb_build_object(
      'success', false,
      'alreadyProcessed', true,
      'applicationId', p_application_id,
      'status', (select status from public.registration_applications where id=p_application_id),
      'reviewedByStaffId', (select reviewed_by_staff_id from public.registration_applications where id=p_application_id)
    );
  end if;

  v_previous_sub := current_setting('request.jwt.claim.sub', true);
  perform set_config('request.jwt.claim.sub', v_staff.user_id::text, true);
  v_result := internal.approve_registration_application(p_application_id);
  perform set_config('request.jwt.claim.sub', coalesce(v_previous_sub,''), true);

  insert into internal.telegram_admin_actions(chat_id_hash,staff_id,action,entity_type,entity_id)
  values (p_chat_id_hash,v_staff.id,'approve','registration_application',p_application_id);

  return v_result || jsonb_build_object('reviewedByStaffId',v_staff.id,'reviewedByName',trim(v_staff.name));
exception when others then
  perform set_config('request.jwt.claim.sub', coalesce(v_previous_sub,''), true);
  raise;
end;
$$;

revoke all on function internal.telegram_approve_registration_application(uuid,text) from public, anon, authenticated;
grant execute on function internal.telegram_approve_registration_application(uuid,text) to service_role;

create or replace function public.telegram_approve_registration_application(
  p_application_id uuid,
  p_chat_id_hash text
) returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select internal.telegram_approve_registration_application(p_application_id,p_chat_id_hash);
$$;

revoke all on function public.telegram_approve_registration_application(uuid,text) from public, anon, authenticated;
grant execute on function public.telegram_approve_registration_application(uuid,text) to service_role;
