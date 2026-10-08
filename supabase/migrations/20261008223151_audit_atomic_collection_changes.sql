-- One transaction per editor save; caller privileges, RLS and triggers remain in force.
create or replace function public.apply_collection_changes(p_table text, p_changes jsonb)
returns integer language plpgsql security invoker set search_path = '' as $$
declare
 c jsonb; payload jsonb; cols text; vals text; assignments text; affected integer; total integer := 0;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if p_table is null or p_table <> all(array['staff','teams','players','parents','subscriptions','attendance','matches','trainings','transactions','tournaments','notifications']) then
  raise exception 'Unsupported collection';
 end if;
 if jsonb_typeof(p_changes) is distinct from 'array' then raise exception 'Changes must be an array'; end if;
 if jsonb_array_length(p_changes)>500 then raise exception 'Too many changes'; end if;
 for c in select value from jsonb_array_elements(p_changes) loop
  if c->>'kind' in ('insert','update') then
   payload := case when c->>'kind'='insert' then c->'row' else c->'patch' end;
   if jsonb_typeof(payload) is distinct from 'object' or payload='{}'::jsonb then raise exception 'Invalid payload'; end if;
   if exists(select 1 from jsonb_object_keys(payload) k where k in ('row_version','created_at') or (c->>'kind'='update' and k='id') or not exists(
    select 1 from pg_catalog.pg_attribute a where a.attrelid=pg_catalog.to_regclass('public.'||p_table) and a.attname=k and a.attnum>0 and not a.attisdropped
   )) then raise exception 'Invalid column'; end if;
   select string_agg(format('%I',k),',' order by k),
          string_agg(format('(jsonb_populate_record(null::public.%I,$1)).%I',p_table,k),',' order by k),
          string_agg(format('%I=(jsonb_populate_record(null::public.%I,$1)).%I',k,p_table,k),',' order by k)
   into cols,vals,assignments from jsonb_object_keys(payload) k;
  end if;
  if c->>'kind'='insert' then
   execute format('insert into public.%I (%s) select %s',p_table,cols,vals) using payload;
  elsif c->>'kind'='update' then
   execute format('update public.%I set %s where id=$2 and row_version=$3',p_table,assignments)
    using payload,c->>'id',(c->>'version')::bigint;
  elsif c->>'kind'='delete' then
   execute format('delete from public.%I where id=$1 and row_version=$2',p_table)
    using c->>'id',(c->>'version')::bigint;
  else raise exception 'Invalid change kind';
  end if;
  get diagnostics affected = row_count;
  if affected<>1 then raise exception 'STALE_RECORD' using errcode='40001'; end if;
  total := total+affected;
 end loop;
 return total;
end $$;
revoke all on function public.apply_collection_changes(text,jsonb) from public,anon;
grant execute on function public.apply_collection_changes(text,jsonb) to authenticated;
