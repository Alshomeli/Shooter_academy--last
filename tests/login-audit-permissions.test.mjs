import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
test('restricted login wrapper works while direct internal and anonymous execution fail', async()=>{
 const db=new PGlite();
 try {
 await db.exec(`create role anon; create role authenticated; create schema auth; create schema internal;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema public,internal,auth to anon,authenticated;
 create table public.login_audit_logs(action text,details text);
 create function internal.record_client_login_audit(text,text) returns public.login_audit_logs language plpgsql security definer set search_path='' as $$declare r public.login_audit_logs; begin if auth.uid() is null then raise exception 'Authentication required'; end if; insert into public.login_audit_logs values($1,$2) returning * into r; return r; end$$;
 grant execute on function internal.record_client_login_audit(text,text) to authenticated;`);
 const dir=new URL('../supabase/migrations/',import.meta.url);const file=(await readdir(dir)).find(n=>n.endsWith('_close_direct_login_audit.sql'));
 await db.exec(await readFile(new URL(file,dir),'utf8'));
 await db.exec("set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-000000000001'");
 await assert.rejects(db.query("select internal.record_client_login_audit('forged','forged')"),/permission denied/);
 await assert.rejects(db.query("select public.record_login_audit_log('forged','forged')"),/Unsupported/);
 const result=await db.query("select * from public.record_login_audit_log('login','forged')");
 assert.equal(result.rows[0].details,'Client-reported sign-in');
 await db.exec('reset request.jwt.claim.sub');
 await assert.rejects(db.query("select public.record_login_audit_log('login','x')"),/Authentication required/);
 await db.exec('reset role; set role anon');
 await assert.rejects(db.query("select public.record_login_audit_log('login','x')"),/permission denied/);
 } finally {await db.close();}
});
