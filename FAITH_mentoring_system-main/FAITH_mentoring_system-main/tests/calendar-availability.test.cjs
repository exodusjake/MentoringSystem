const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
test('calendar availability shows scheduled start only, including legacy end times',()=>{
 const c=vm.createContext({document:{addEventListener(){}},window:{addEventListener(){}},console});
 vm.runInContext(fs.readFileSync('MENTOR/JS/calendar.js','utf8'),c);
 for(const endTime of [null,'18:00:00']) {
   c.slot={slotName:'Before Prelims',startTime:'16:00:00',endTime};
   const html=vm.runInContext('renderAvailabilityCard(slot)',c);
   assert.ok(html.includes('4:00 PM'));assert.ok(!html.includes('6:00 PM'));
   assert.ok(!html.includes('undefined'));assert.ok(!html.includes('null'));
 }
});
test('past availability remains on its calendar day and shows its date',()=>{
 const c=vm.createContext({document:{addEventListener(){}},window:{addEventListener(){}},console});
 vm.runInContext(fs.readFileSync('MENTOR/JS/calendar.js','utf8'),c);
 vm.runInContext("mySlots=[{availableDate:'2020-01-15',slotName:'Before Prelims',startTime:'16:00:00'}]",c);
 assert.equal(vm.runInContext("eventsOnDay(2020,0,15).filter(e=>e.source==='availability').length",c),1);
 const html=vm.runInContext('renderAvailabilityCard(mySlots[0])',c);
 assert.match(html,/2020/);assert.match(html,/>Past</);assert.doesNotMatch(html,/>Open</);
});

test('calendar grid and availability list agree on Past and Closed labels',()=>{
 const nodes={};
 const c=vm.createContext({document:{addEventListener(){},getElementById(id){return nodes[id] ||= {}; }},window:{addEventListener(){}},console});
 vm.runInContext(fs.readFileSync('MENTOR/JS/calendar.js','utf8'),c);
 vm.runInContext("viewYear=2020;viewMonth=0;mySlots=[{availableDate:'2020-01-15',slotName:'Before Prelims',startTime:'16:00:00'}];renderCalendar();",c);
 assert.match(nodes.calGrid.innerHTML,/aria-label="Availability - Past:/);
 assert.doesNotMatch(nodes.calGrid.innerHTML,/Availability - Open/);
 vm.runInContext('mySlots[0].isClosed=true;renderCalendar()',c);
 assert.match(nodes.calGrid.innerHTML,/aria-label="Availability - Closed:/);
});
