const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
test('orphaned, active and cancelled availability actions reflect the linked session',()=>{
 const c=vm.createContext({document:{addEventListener(){}},console});
 vm.runInContext(fs.readFileSync('MENTOR/JS/availability.js','utf8'),c);
 c.slot={availabilityID:12,availableDate:'2026-09-26',startTime:'16:10:00',approvedMentees:'Test Mentee'};
 let html=vm.runInContext('renderSlotCard(slot,false)',c);
 assert.ok(html.includes('Session Deleted'));assert.ok(html.includes('deleteSlot(12)'));
 c.slot.linkedSessionID=42;
 html=vm.runInContext('renderSlotCard(slot,false)',c);
 assert.ok(html.includes('sessions.html'));assert.ok(!html.includes('deleteSlot(12)'));
 c.slot.linkedSessionStatus='Cancelled';
 html=vm.runInContext('renderSlotCard(slot,false)',c);assert.ok(html.includes('Cancelled'));
});
