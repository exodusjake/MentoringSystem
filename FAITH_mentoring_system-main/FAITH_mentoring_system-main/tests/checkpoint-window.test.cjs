const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');
const c=vm.createContext({Intl,Date});vm.runInContext(fs.readFileSync('checkpoint-window.js','utf8'),c);
const events=[{isPublished:true,eventType:'Session Schedule',slotName:'Before Prelims',schoolYear:'2026',semester:'1',startDate:'2026-09-17',endDate:'2026-09-23'}];
test('window inclusive end, closed next day, missing calendar fails closed',()=>{
 c.events=events;
 const state=day=>vm.runInContext("checkpointWindow(events,'Before Prelims','2026','1','"+day+"')",c);
 assert.equal(state('2026-09-23').disabled,false);assert.equal(state('2026-09-24').label,'Closed');assert.equal(state('2026-09-16').upcoming,true);
 assert.equal(vm.runInContext("checkpointWindow(null,'Before Prelims','2026','1').disabled",c),true);
 c.w=state('2026-09-17');c.today='2026-09-17';
 for(const [date,expected] of [['2026-09-16',false],['2026-09-17',true],['2026-09-23',true],['2026-09-24',false]]){c.date=date;assert.equal(vm.runInContext('checkpointDateAllowed(w,date,today)',c),expected);}
});

test('Mentor picker retains Closed options disabled and bounds dates',()=>{
 const nodes={};const document={addEventListener(){},getElementById(id){return nodes[id]??={value:'',innerHTML:'',style:{},addEventListener(){}};}};
 const c=vm.createContext({document,window:{addEventListener(){}},Intl,Date,console});
 vm.runInContext(fs.readFileSync('checkpoint-window.js','utf8'),c);vm.runInContext(fs.readFileSync('MENTOR/JS/sessions.js','utf8'),c);
 vm.runInContext("sessionCalendar=[{isPublished:true,eventType:'Session Schedule',slotName:'Before Prelims',schoolYear:currentSchoolYear,semester:currentSemester,startDate:'2020-01-01',endDate:'2020-01-07'}]; populateSlotPicker('editSlotPick',null,null)",c);
 assert.match(nodes.editSlotPick.innerHTML,/value="Before Prelims"[^>]*\bdisabled\b[^>]*>Before Prelims \u2014 Closed/);
 assert.match(nodes.editSlotPick.innerHTML,/Not scheduled/);
});

test('stale closed checkpoint submission shows form error without posting',async()=>{
 const nodes={};const document={addEventListener(){},getElementById(id){return nodes[id]??={value:'',style:{},innerHTML:''};}};
 const c=vm.createContext({document,window:{addEventListener(){}},Intl,Date,console,apiRequest(){throw Error('Should not post');}});
 vm.runInContext(fs.readFileSync('checkpoint-window.js','utf8'),c);vm.runInContext(fs.readFileSync('MENTOR/JS/sessions.js','utf8'),c);
 document.getElementById('sessionSlotPick').value='Before Prelims';document.getElementById('sessionDateInput').value='2020-01-01';
 await vm.runInContext('submitLogSession({preventDefault(){}})',c);
 assert.match(nodes.logSessionError.textContent,/within its session window/);
});
