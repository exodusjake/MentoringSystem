const fs=require('node:fs'),vm=require('node:vm'),test=require('node:test'),assert=require('node:assert/strict');
function setup(rows){const elements={},messages=[];const c=vm.createContext({console,window:{addEventListener(){}},document:{addEventListener(){},getElementById:id=>elements[id]??={textContent:'',classList:{add(){this.open=true}},style:{}}},showToast:m=>messages.push(m)});vm.runInContext(fs.readFileSync('MENTOR/JS/sessions.js','utf8'),c);c.rows=rows;vm.runInContext('allSessions=rows;clearProofFile=()=>{};clearProofError=()=>{}',c);return {c,elements,messages};}
test('verified eligibility is independent of account, classification, displayed count, and session status',()=>{
 for(const mentor of [17,841])for(const isMakeup of [false,true])for(const status of ['Scheduled','Completed']){
  const x=setup([{sessionID:mentor,isMakeup,sessionStatus:status,presentCount:0,hasVerifiedAttendance:true}]);
  vm.runInContext(`openProofModal('${mentor}','Oct 12')`,x.c);
  assert.equal(x.elements.proofModal.classList.open,true);assert.equal(x.elements.submitProofBtn.disabled,true);assert.equal(x.messages.length,0);
 }
});
test('unverified positive count, cancelled, missing, and concurrent requests explain why they are blocked',()=>{
 for(const row of [{sessionID:1,sessionStatus:'Completed',presentCount:2,hasVerifiedAttendance:false},{sessionID:1,sessionStatus:'Cancelled',presentCount:2,hasVerifiedAttendance:true},null]){
  const x=setup(row?[row]:[]);vm.runInContext("openProofModal(1,'Oct 12')",x.c);assert.equal(x.elements.proofModal,undefined);assert.equal(x.messages.length,1);assert.ok(x.messages[0]);
 }
 const x=setup([{sessionID:1,presentCount:1}]);vm.runInContext("proofUploadInFlight=true;openProofModal(1,'Oct 12')",x.c);assert.match(x.messages[0],/progress/);
});
test('older API responses preserve rollout compatibility and never infer attendance from classification',()=>{
 const x=setup([]);x.c.sessions=[{isMakeup:true,presentCount:1},{isMakeup:false,presentCount:0}];
 assert.equal(vm.runInContext('proofUnavailableReason(sessions[0])',x.c),'');assert.match(vm.runInContext('proofUnavailableReason(sessions[1])',x.c),/QR attendance/);
});
