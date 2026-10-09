import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renewalDraft } from '../src/lib/subscription-dates.ts';
import { academyToday } from '../src/lib/report-dates.ts';
import { csvCell } from '../src/lib/csv.ts';
import { normalizeWhatsappPhone } from '../src/lib/phone.ts';
import { assertNewAttendance } from '../src/lib/attendance-identity.ts';
test('renewal preserves paid history and produces only an unpaid period', () => {
 const old = {id:'old',version:3,playerId:'p',planType:'monthly',amount:35,startDate:'2026-01-01',endDate:'2026-02-01',status:'paid',paidAt:'2026-01-01T00:00:00Z',paymentMethod:'cash'};
 const before=structuredClone(old); const next=renewalDraft(old,'2026-03-01');
 assert.deepEqual(old,before); assert.equal(next.status,'unpaid'); assert.equal(next.startDate,'2026-03-01');
 assert.equal(next.endDate,'2026-04-01'); for(const key of ['id','paidAt','paymentMethod','version']) assert.equal(key in next,false);
 assert.equal(renewalDraft(old,'2026-01-15').startDate,'2026-02-02');
});
test('attendance rejects repeats but accepts different matches on the same date',()=>{
 const a={id:'a',playerId:'p',sessionType:'match',sessionDate:'2026-10-09',matchId:'m1',status:'present'};
 assert.throws(()=>assertNewAttendance([a],[{...a,id:undefined}]),/already recorded/);
 assert.doesNotThrow(()=>assertNewAttendance([a],[{...a,matchId:'m2'}]));
 assert.throws(()=>assertNewAttendance([],[a,a]),/already recorded/);
});
test('Bahrain business date crosses UTC day and month boundaries',()=>{
 assert.equal(academyToday(new Date('2026-01-02T00:30:00+03:00')),'2026-01-02');
 assert.equal(academyToday(new Date('2026-02-01T00:01:00+03:00')),'2026-02-01');
 assert.equal(academyToday(new Date('2026-01-31T23:59:00+03:00')),'2026-01-31');
});

test('CSV formula inputs stay text and quotes stay escaped',()=>{
 for(const input of ['=1+1','+SUM(A1)','-1','@link','\t=1','\r=1','\n=1']) assert.match(csvCell(input), /^"'/);
 assert.equal(csvCell('A"B'), '"A""B"'); assert.equal(csvCell('محمد'), '"محمد"');
});
test('Bahrain phone normalization is shared by contact and reminder links',()=>{
 for(const phone of ['32287776','+973 3228 7776','0097332287776']) assert.equal(normalizeWhatsappPhone(phone),'97332287776');
 assert.equal(normalizeWhatsappPhone('+44 1234567890'),'441234567890');
});
