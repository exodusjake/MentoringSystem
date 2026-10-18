const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function context(file) {
  const nodes={};
  const c=vm.createContext({URL,console,CONFIG:{getFileUrl:s=>s},
    document:{addEventListener(){},getElementById:id=>nodes[id]??={value:'',innerHTML:'',style:{},classList:{add(){},remove(){}},querySelectorAll:()=>[]}},
    window:{addEventListener(){}},getSession:()=>({user:{userID:1}}),
    escapeHtml:s=>String(s).replace(/</g,'&lt;').replace(/>/g,'&gt;'),sanitizeHtml:s=>s});
  vm.runInContext(fs.readFileSync('evaluation-deadline.js','utf8'),c);
  if(file)vm.runInContext(fs.readFileSync(file,'utf8'),c);
  return {c,nodes};
}
test('explicit midnight is start of day, legacy date-only is end of day in Philippines',()=>{
  const {c}=context();
  assert.equal(c.evaluationDeadline('2026-09-30T00:00:00').toISOString(),'2026-09-29T16:00:00.000Z');
  assert.equal(c.evaluationDeadline('2026-09-30').toISOString(),'2026-09-30T15:59:59.999Z');
  assert.equal(c.evaluationDeadlineInput('2026-09-30T15:30:00Z'),'2026-09-30T23:30');
  assert.equal(c.evaluationDeadline(null),null);
  assert.equal(c.evaluationDeadline('bad'),null);
});
for(const portal of ['ADMIN_','HEAD'])test(`${portal}: author replaces generic heading; deadline exact and no ownership changes`,()=>{
  const {c,nodes}=context(`${portal}/JS/evaluation-forms.js`);
  vm.runInContext(`allForms=[{linkID:1,postedByUserID:1,postedByName:'Test <Admin>',title:'Survey',deadline:'2020-01-01T00:00:00',googleFormURL:'https://example.test'}];renderForms()`,c);
  const html=nodes.formsList.innerHTML;
  assert.match(html,/<strong>Test &lt;Admin&gt;<\/strong>/);
  assert.doesNotMatch(html,/Posted by|\(You\)|>Mentees<|>Evaluation Form</);
  assert.match(html,/12:00 am|12:00 AM/);
  assert.doesNotMatch(html,/Philippine time/);
  assert.equal(html.includes('ann-kebab-btn'),portal==='ADMIN_');
});
test('modal requires title and usable link before confirmation',()=>{
  const {c,nodes}=context('ADMIN_/JS/evaluation-forms.js');
  c.errors=[];c.confirmed=0;
  vm.runInContext('showErrorModal=m=>errors.push(m);showConfirmModal=()=>confirmed++',c);
  c.saveForm();assert.match(c.errors.pop(),/title/);
  nodes.fieldTitle.value='Survey';nodes.fieldUrl.value='javascript:alert(1)';
  c.saveForm();assert.match(c.errors.pop(),/valid http/);
  nodes.fieldUrl.value='https://forms.gle/example';
  c.saveForm();assert.equal(c.confirmed,1);
});
test('attachment retry updates existing form and preserves entered fields',async()=>{
  const {c,nodes}=context('ADMIN_/JS/evaluation-forms.js');
  for(const [id,value] of Object.entries({fieldTitle:'Survey',fieldUrl:'https://forms.gle/example',fieldDeadline:'2026-10-01T00:00'})) {
    c.document.getElementById(id).value=value;
  }
  c.document.getElementById('fieldDesc').innerHTML='Instructions';
  c.FormData=class{append(){}};
  const calls=[];let uploads=0;
  c.apiRequest=async(endpoint,method,body)=>{
    calls.push({endpoint,method,body});
    if(endpoint==='EvaluationLinks')return {linkID:12};
    if(endpoint==='EvaluationAttachments/upload' && uploads++===0)throw new Error('Upload failed');
    return {};
  };
  vm.runInContext('pendingAttachFiles=[{}];showErrorModal=()=>{};closeModal=()=>{};loadForms=async()=>{};showToast=()=>{}',c);
  await c.doSaveForm();await c.doSaveForm();
  assert.equal(calls.filter(r=>r.endpoint==='EvaluationLinks').length,1);
  const update=calls.find(r=>r.endpoint==='EvaluationLinks/12');
  assert.equal(update.method,'PUT');assert.equal(update.body.title,'Survey');
  assert.equal(update.body.deadline,'2026-10-01T00:00');
  assert.equal(update.body.description,'Instructions');
});
for(const page of ['announcements','mentee-dashboard'])test(`Mentee ${page}: overdue wording allows late proof and keeps form closed`,()=>{
  const {c,nodes}=context(`MENTEE/JS/${page}.js`);
  c.form={linkID:1,postedByName:'Admin Name',title:'Survey',googleFormURL:'https://forms.gle/example',deadline:'2020-01-01T00:00:00'};
  let html;
  if(page==='announcements') html=vm.runInContext('renderEvaluationCard(form)',c);
  else {vm.runInContext('renderEvaluationCards([form],new Map())',c);html=nodes.evaluationsList.innerHTML;}
  assert.match(html,/Admin Name/);assert.match(html,/Overdue/);assert.match(html,/You can still upload proof after the deadline\./);assert.doesNotMatch(html,/Philippine time/);
  assert.doesNotMatch(html,/href="https:\/\/forms.gle\/example"/);
});
