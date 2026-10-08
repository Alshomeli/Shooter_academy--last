import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectPages } from '../src/lib/pagination.ts';
test('pagination reads past a server cap smaller than the requested page', async () => {
 const rows=Array.from({length:1203},(_,i)=>({id:String(i).padStart(5,'0')}));
 const result=await collectPages(async after=>rows.filter(r=>!after||r.id>after).slice(0,73));
 assert.deepEqual(result,rows);
});
test('pagination fails rather than looping on an ignored cursor', async()=>{
 await assert.rejects(collectPages(async()=>[{id:'a'}]),/did not advance/);
});
