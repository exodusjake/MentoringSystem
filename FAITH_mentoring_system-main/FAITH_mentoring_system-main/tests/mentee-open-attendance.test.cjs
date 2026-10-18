const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');
function context(){const nodes={};const c=vm.createContext({document:{addEventListener(){},getElementById(id){return nodes[id]??={innerHTML:'',textContent:'',value:''};}},window:{addEventListener(){}},console,Intl,Date});vm.runInContext(fs.readFileSync('checkpoint-window.js','utf8'),c);vm.runInContext(fs.readFileSync('MENTEE/JS/sessions.js','utf8'),c);return {c,nodes};}
test('first scan does not close another mentee QR or count session finished',()=>{
 const {c,nodes}=context();
 c.s={sessionID:1,sessionStatus:'Completed',timeEnd:null,slotName:'Before Prelims',schoolYear:'2026',semester:'1',sessionDate:new Date().toISOString(),topic:'Test'};
 vm.runInContext("sessionCalendar=[{isPublished:true,eventType:'Session Schedule',slotName:'Before Prelims',schoolYear:'2026',semester:'1',startDate:'2020-01-01',endDate:'2099-01-01'}];updateStats([s]);renderTable([s])",c);
 assert.equal(nodes.sCompleted.textContent,0);assert.ok(nodes.sessionsBody.innerHTML.includes('Show QR'));assert.ok(nodes.sessionsBody.innerHTML.includes('In Progress'));
 c.s.timeEnd=new Date().toISOString();vm.runInContext('updateStats([s]);renderTable([s])',c);
 assert.equal(nodes.sCompleted.textContent,1);assert.ok(!nodes.sessionsBody.innerHTML.includes('Show QR'));
});
test('ongoing makeup remains separate from previously completed checkpoint',()=>{
 const {c}=context();c.sessions=[{sessionID:1,slotName:'Before Prelims',sessionStatus:'Completed',timeEnd:'2026-09-25'}, {sessionID:2,slotName:'Before Prelims',sessionStatus:'Completed',timeEnd:null}];
 assert.equal(vm.runInContext('mergeSessionsByCheckpoint(sessions,{1:true}).length',c),2);
});
