const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
function setup(progress) {
 const elements={};
 const c=vm.createContext({console,document:{addEventListener(){},getElementById(id){return elements[id] ||= {style:{}};}}});
 vm.runInContext(fs.readFileSync('dashboard-sessions.js','utf8'),c);
 vm.runInContext(fs.readFileSync('MENTOR/JS/logsheet.js','utf8'),c);
 c.progress=progress;
 vm.runInContext("logProgress=progress; allSessions=[{sessionStatus:'Completed',schoolYear:'2020-2021'}, {sessionStatus:'Completed',schoolYear:'2026-2027'}]; updateStats();",c);
 return elements;
}
test('logsheet uses shared current-period totals and target, not history or inferred section count',()=>{
 const e=setup({completedSessions:1,requiredSessions:12});
 assert.equal(e.lStatCompleted.textContent,1);
 assert.equal(e.lStatRequired.textContent,'of 12 required');
 assert.equal(e.lStatProgressFill.style.width,'8%');
 assert.equal(e.lStatTotal.textContent,2);
});
test('logsheet supports the second-semester target returned by the API',()=>{
 const e=setup({completedSessions:2,requiredSessions:5});
 assert.equal(e.lStatRequired.textContent,'of 5 required');
 assert.equal(e.lStatProgressFill.style.width,'40%');
});
test('unavailable shared progress does not turn into a fabricated zero or target',()=>{
 const e=setup(null);
 assert.equal(e.lStatCompleted.textContent,'\u2014');
 assert.equal(e.lStatRequired.textContent,'Progress unavailable');
 assert.equal(e.lStatTotal.textContent,2);
});

test('logsheet and dashboard agree for unfinished, closed, completed and cancelled sessions',()=>{
 const c=vm.createContext({console,document:{addEventListener(){}}});
 vm.runInContext(fs.readFileSync('dashboard-sessions.js','utf8'),c);
 vm.runInContext(fs.readFileSync('MENTOR/JS/logsheet.js','utf8'),c);
 const base={sessionStatus:'Completed',slotName:'Before Prelims',schoolYear:'2026',semester:'1'};
 assert.equal(c.logDisplayStatus(base),'In Progress');
 c.events=[{isPublished:true,eventType:'Session Schedule',slotName:base.slotName,schoolYear:'2026',semester:'1',startDate:'2020-01-01',endDate:'2020-02-01'}];
 vm.runInContext('logCalendar=events',c);
 assert.equal(c.logDisplayStatus(base),'Closed');
 assert.equal(c.logDisplayStatus({...base,actualEnd:'2020-01-05'}),'Completed');
 assert.equal(c.logDisplayStatus({...base,sessionStatus:'Cancelled'}),'Cancelled');
 assert.equal(c.logDisplayStatus({...base,sessionStatus:'Scheduled'}),'Closed');
});
