import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
test('SQL uniqueness allows two matches but rejects duplicate match and training attendance',async()=>{
 const db=new PGlite(); try {
 await db.exec(`create table attendance(id text primary key,player_id text,session_date date,session_type text,training_id text,match_id text);
 create unique index attendance_unique_player_session on attendance(player_id,session_date,session_type,coalesce(training_id,''));
 create unique index uq_attendance_training_player on attendance(training_id,player_id) where training_id is not null;
 create unique index uq_attendance_match_player on attendance(match_id,player_id) where match_id is not null;
 insert into attendance values('a','p','2026-10-09','match',null,'m1');`);
 await db.exec(await readFile(new URL('../supabase/migrations/20261009075903_attendance_match_identity.sql',import.meta.url),'utf8'));
 await db.exec("insert into attendance values('b','p','2026-10-09','match',null,'m2')");
 await assert.rejects(db.exec("insert into attendance values('c','p','2026-10-09','match',null,'m1')"),/duplicate key/);
 await db.exec("insert into attendance values('d','p','2026-10-09','training','t1',null)");
 await assert.rejects(db.exec("insert into attendance values('e','p','2026-10-10','training','t1',null)"),/duplicate key/);
 assert.equal((await db.query('select count(*)::int n from attendance')).rows[0].n,3);
 } finally {await db.close();}
});
