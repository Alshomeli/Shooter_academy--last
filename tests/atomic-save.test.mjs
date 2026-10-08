import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
test('atomic save rolls back earlier rows on conflict and preserves RLS', async()=>{
 const db=new PGlite();
 try {
 await db.exec(`create role anon; create role authenticated; create schema auth;
 create function auth.uid() returns uuid language sql as $$ select '00000000-0000-0000-0000-000000000001'::uuid $$;
 grant usage on schema public,auth to authenticated;
 create table public.attendance(id text primary key, row_version bigint default 1, notes text, owner_id uuid default auth.uid());
 alter table public.attendance enable row level security;
 grant select,insert,update,delete on public.attendance to authenticated;
 create policy own_rows on public.attendance to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid());
 insert into public.attendance(id,notes) values('a','before');
 insert into public.attendance(id,notes,owner_id) values('other','private','00000000-0000-0000-0000-000000000002');`);
 await db.exec(await readFile(new URL('../supabase/migrations/20261008223151_audit_atomic_collection_changes.sql',import.meta.url),'utf8'));
 await db.exec('set role authenticated');
 const apply=changes=>db.query('select public.apply_collection_changes($1,$2::jsonb)',['attendance',JSON.stringify(changes)]);
 await assert.rejects(apply([{kind:'update',id:'a',version:1,patch:{notes:'partial'}},{kind:'delete',id:'other',version:1}]),/STALE_RECORD/);
 assert.equal((await db.query("select notes from attendance where id='a'")).rows[0].notes,'before');
 await apply([{kind:'insert',row:{id:'b',notes:'new'}},{kind:'update',id:'a',version:1,patch:{notes:'after'}}]);
 assert.equal((await db.query('select count(*)::integer n from attendance')).rows[0].n,2);
 await assert.rejects(apply([{kind:'update',id:'a',version:1,patch:{row_version:99}}]),/Invalid column/);
 await assert.rejects(db.query("select public.apply_collection_changes('audit_logs','[]')"),/Unsupported collection/);
 await db.exec('reset role; set role anon');
 await assert.rejects(apply([]),/permission denied/);
 } finally {await db.close();}
});
