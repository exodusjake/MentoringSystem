const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('MENTOR/JS/sessions.js','utf8');
const school='School of Humanities',tech='School of Technology';
function context(mentor,profiles,assignments){
 const elements={};const el=id=>elements[id]??={value:'',style:{},classList:{add(){},remove(){}},innerHTML:''};
 let payload;
 const c=vm.createContext({console,Date,Intl,window:{addEventListener(){}},document:{addEventListener(){},getElementById:el},checkpointDateAllowed:()=>true,checkpointWindow:()=>({}),apiRequest:async(path,method,body)=>{
  if(path==='Users/assignments')return assignments;
  if(path==='Users/mentees-with-dept')return profiles;
  if(path==='Users/courses')return {[school]:['BAC'],[tech]:['BSIT']};
  payload=body;
 }});
 vm.runInContext(source,c);vm.runInContext(`currentUser={userID:${mentor}};currentSchoolYear='2099-2100';currentSemester='1st Semester';loadSessions=async()=>{};populateSlotPicker=()=>{};`,c);
 return {c,el,payload:()=>payload};
}
test('course-only assignments resolve without SectionID/Section; one course is automatic across accounts',async()=>{
 for(const mentor of [307,987]){
  const x=context(mentor,[{userID:11,school,course:'BAC',sectionID:null,section:''},{userID:12,school,course:' bac ',section:null}], [{mentorUserID:mentor,menteeUserID:11},{mentorUserID:mentor,menteeUserID:12}]);
  await vm.runInContext('loadMentorSections()',x.c);
  assert.equal(vm.runInContext('mentorSections.length',x.c),1);
  vm.runInContext('openLogSessionModal()',x.c);
  assert.equal(x.el('sectionPickGroup').style.display,'none');
  x.el('sessionDateInput').value='2099-10-12';x.el('sessionTimeStart').value='09:00';x.el('sessionSlotPick').value='After Prelims';
  await vm.runInContext('submitLogSession({preventDefault(){}})',x.c);
  assert.equal(x.payload().CourseCode,'BAC');assert.equal(x.payload().CourseSchool,school);
  assert.equal(x.payload().SectionCode,'BAC');assert.equal(x.payload().RequestID,undefined);
 }
});
test('multiple courses use an explicit school/course selection without leaking composite keys into Notes',async()=>{
 const x=context(801,[{userID:11,school,course:'BAC'},{userID:12,school:tech,course:'BSIT'}],[{mentorUserID:801,menteeUserID:11},{mentorUserID:801,menteeUserID:12}]);
 await vm.runInContext('loadMentorSections()',x.c);vm.runInContext('openLogSessionModal()',x.c);
 assert.equal(x.el('sectionPickGroup').style.display,'');
 x.el('sessionSectionPick').value=encodeURIComponent(tech)+'|BSIT';x.el('sessionDateInput').value='2099-10-12';x.el('sessionTimeStart').value='09:00';x.el('sessionSlotPick').value='Before Finals';
 await vm.runInContext('submitLogSession({preventDefault(){}})',x.c);
 assert.equal(x.payload().CourseCode,'BSIT');assert.equal(x.payload().CourseSchool,tech);assert.equal(x.payload().SectionCode,'BSIT');
 assert.equal(x.payload().Notes,'[BSIT]');
});
test('incompatible school/course and unrelated assignments are excluded',async()=>{
 const x=context(801,[{userID:11,school:tech,course:'BAC'},{userID:12,school,course:'BAC'}],[{mentorUserID:801,menteeUserID:11},{mentorUserID:999,menteeUserID:12}]);
 await vm.runInContext('loadMentorSections()',x.c);assert.equal(vm.runInContext('mentorSections.length',x.c),0);
});
test('Admin course validation accepts course-only profiles and excludes incompatible/blank courses',()=>{
 const c=vm.createContext({console,document:{addEventListener(){}},window:{}});
 vm.runInContext(fs.readFileSync('ADMIN_/JS/user-management.js','utf8'),c);
 assert.equal(vm.runInContext('validSchoolCourse("School of Humanities","BAC")',c),true);
 assert.equal(vm.runInContext('validSchoolCourse("School of Technology","BAC")',c),false);
 assert.equal(vm.runInContext('validSchoolCourse("School of Humanities",null)',c),false);
 vm.runInContext('allSections=[{school:"School of Humanities",course:"SYNTH",isActive:true}];allDepartments=[{departmentID:999,school:null,isActive:true}]',c);
 assert.equal(vm.runInContext('validSchoolCourse("School of Humanities","SYNTH")',c),true);
 assert.equal(vm.runInContext('independentMentor({departmentID:999,school:null})',c),true);
 assert.equal(vm.runInContext('independentMentor({departmentID:999,school:"School of Technology"})',c),false);
});
test('course logs merge regular and makeup by school/course/checkpoint, preserve legacy groups and deduplicate attendance',()=>{
 const c=vm.createContext({Date,Intl});vm.runInContext(fs.readFileSync('logsheet-data.js','utf8'),c);
 const common={groupingMode:'Course',schoolYear:'2026-2027',semester:'1st Semester',slotName:'After Prelims',courseSchool:school,sessionSectionCode:'BAC',sessionStatus:'Completed',sessionDate:'2026-10-14T09:00:00',timeEnd:'2026-10-14T10:00:00',logStatus:'Draft'};
 const m={menteeID:11,sectionCode:'BAC',courseSchool:school,attendanceID:1,isPresent:true,scannedAt:'2026-10-14T01:05:00Z'};
 c.input=[{...common,sessionID:1,isMakeup:false,mentees:[m]},{...common,sessionID:2,isMakeup:true,mentees:[{...m,attendanceID:2}],proofFilePath:'/latest.jpg'}, {...common,groupingMode:undefined,courseSchool:undefined,sessionID:3,sessionSectionCode:'BAC',isMakeup:false,mentees:[{...m,courseSchool:undefined}]}];
 const rows=vm.runInContext('LogsheetData.merge(input)',c);assert.equal(rows.length,2);
 const course=rows.find(r=>r.groupingMode==='Course');assert.equal(course.mentees.length,1);assert.equal(course.presentCount,1);assert.equal(course._proofSources[0].filePath,'/latest.jpg');
});
