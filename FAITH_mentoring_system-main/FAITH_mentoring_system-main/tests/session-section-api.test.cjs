const fs=require('node:fs'),vm=require('node:vm'),test=require('node:test'),a=require('node:assert/strict');
function setup(){const elements={};const get=id=>elements[id]??={value:'',style:{},classList:{add(){},remove(){}},innerHTML:''};const c=vm.createContext({console:{error(){}},Date,Intl,FormData,AbortController,setTimeout,clearTimeout,window:{addEventListener(){},location:{pathname:'/MENTOR/HTML/sessions.html'}},document:{addEventListener(){},getElementById:get},checkpointWindow:()=>({}),checkpointDateAllowed:()=>true});vm.runInContext(fs.readFileSync('MENTOR/JS/sessions.js','utf8'),c);vm.runInContext('currentUser={userID:307};loadSessions=async()=>{}',c);return {c,get};}
test('assignment API mapping distinguishes blank profiles from one or multiple valid sections',async()=>{
 for(const sections of [['',''],['BSIT 1A','BSIT 1A'],['BSIT 1A','BSCS 2B']]){
  const x=setup();x.c.apiRequest=async route=>route==='Users/assignments'?[{mentorUserID:307,menteeUserID:308},{mentorUserID:307,menteeUserID:309}]:sections.map((s,i)=>({userID:308+i,sectionCode:s,section:s,sectionID:null}));
  await vm.runInContext('loadMentorSections()',x.c);a.equal(vm.runInContext('mentorSections.length',x.c),sections[0]===''?0:sections[0]===sections[1]?1:2);
  a.equal(vm.runInContext("mentorSections.some(s=>s.sectionCode==='—')",x.c),false);
 }
});
test('captured null-section request preserves the exact backend 400 message, not a generic section error',async()=>{
 const x=setup();x.c.apiRequest=async route=>route==='Users/assignments'?[{mentorUserID:307,menteeUserID:308},{mentorUserID:307,menteeUserID:309}]:[{userID:308,sectionCode:'',section:''},{userID:309,sectionCode:'',section:''}];await vm.runInContext('loadMentorSections()',x.c);
 x.c.CONFIG={getUrl:e=>e};x.c.getSession=()=>({token:'synthetic-test-token'});x.c.clearSession=()=>{};
 x.c.document.createElement=()=>({});x.c.document.head={appendChild(){}};
 let sent;const message='No valid assigned mentee section is available. Ask the administrator to verify section information.';
 x.c.fetch=async(url,options)=>{sent=JSON.parse(options.body);return {ok:false,status:400,json:async()=>({message})};};
 vm.runInContext(fs.readFileSync('apiClient.js','utf8'),x.c);
 vm.runInContext("getSession=()=>({token:'synthetic-test-token'})",x.c);
 x.get('sessionDateInput').value='2026-10-14';x.get('sessionTimeStart').value='13:05';x.get('sessionNotesInput').value='test';x.get('sessionSlotPick').value='After Prelims';
 await vm.runInContext('submitLogSession({preventDefault(){}})',x.c);
 a.deepEqual(sent,{MentorID:307,SessionDate:'2026-10-14T13:05:00',Status:'Scheduled',Notes:'test',SectionCode:null,SlotName:'After Prelims'});a.equal(x.get('logSessionError').textContent,message);
 x.c.fetch=async()=>({ok:false,status:400,json:async()=>({message:'This checkpoint is closed.'})});await vm.runInContext('submitLogSession({preventDefault(){}})',x.c);a.equal(x.get('logSessionError').textContent,'This checkpoint is closed.');
});
