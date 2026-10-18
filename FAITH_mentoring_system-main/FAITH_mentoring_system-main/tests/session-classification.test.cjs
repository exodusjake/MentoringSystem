const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('Log Session sends a course-compatible display code, never a make-up flag or request, across accounts and periods',async()=>{
 for(const mentor of [17,841]) for(const semester of ['1st Semester','2nd Semester']) for(const slot of ['After Prelims','Before Finals']) {
  const elements={sessionDateInput:{value:'2099-10-12'},sessionTimeStart:{value:'09:00'},sessionNotesInput:{value:'Topic'},sessionSlotPick:{value:slot},sessionSectionPick:{value:'BAC'},submitSessionBtn:{},logSessionModal:{classList:{remove(){}}}};
  let request;
  const c=vm.createContext({console,Date,Intl,window:{addEventListener(){}},document:{addEventListener(){},getElementById:id=>elements[id]},apiRequest:async(path,method,body)=>{request={path,method,body}},checkpointWindow:()=>({}),checkpointDateAllowed:()=>true});
  vm.runInContext(fs.readFileSync('MENTOR/JS/sessions.js','utf8'),c);
  vm.runInContext(`currentUser={userID:${mentor}};currentSchoolYear='2099-2100';currentSemester=${JSON.stringify(semester)};mentorSections=${JSON.stringify(mentor===17?[{sectionCode:'BSIT'}]:[{sectionCode:'BAC'},{sectionCode:'BSIT'}])};loadSessions=async()=>{};`,c);
  await vm.runInContext('submitLogSession({preventDefault(){}})',c);
  assert.equal(request.path,'Sessions');assert.equal(request.method,'POST');assert.equal(request.body.MentorID,mentor);
  assert.equal(request.body.SectionCode,mentor===17?'BSIT':'BAC');assert.equal(request.body.SlotName,slot);
  assert.equal(request.body.Status,'Scheduled');assert.equal(request.body.RequestID,undefined);assert.equal(request.body.IsMakeup,undefined);
 }
});
test('course picker is hidden for zero/one and shown for multiple assignments; empty assignments explain the rejection',async()=>{
 for(const sections of [[],[{sectionCode:'BSIT'}],[{sectionCode:'BAC'},{sectionCode:'BSIT'}]]){
  const elements={};const get=id=>elements[id]??={value:'',style:{},classList:{add(){},remove(){}},innerHTML:''};
  const c=vm.createContext({console:{error(){}},Date,Intl,window:{addEventListener(){}},document:{addEventListener(){},getElementById:get},checkpointWindow:()=>({}),checkpointDateAllowed:()=>true});
  vm.runInContext(fs.readFileSync('MENTOR/JS/sessions.js','utf8'),c);c.sections=sections;
  vm.runInContext('mentorSections=sections;currentUser={userID:57};populateSlotPicker=()=>{};loadSessions=async()=>{}',c);
  vm.runInContext('openLogSessionModal()',c);
  assert.equal(get('sectionPickGroup').style.display,sections.length>1?'':'none');
  if(sections.length>1){assert.match(get('sessionSectionPick').innerHTML,/BAC/);assert.match(get('sessionSectionPick').innerHTML,/BSIT/);}
  if(sections.length===0){
   c.apiRequest=async()=>{throw Error('No valid assigned course is available. Contact the administrator.');};
   get('sessionTimeStart').value='09:00';get('sessionSlotPick').value='After Prelims';
   await vm.runInContext('submitLogSession({preventDefault(){}})',c);
   assert.match(get('logSessionError').textContent,/assigned course/);assert.equal(get('logSessionError').style.display,'');assert.equal(get('submitSessionBtn').disabled,false);
  }
 }
});
