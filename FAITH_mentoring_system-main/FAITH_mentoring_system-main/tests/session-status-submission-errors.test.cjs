const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');
function context(file){const nodes={};const c=vm.createContext({console,URLSearchParams,window:{location:{search:''},addEventListener(){}},document:{addEventListener(){},getElementById(id){return nodes[id] ||= {innerHTML:'',querySelectorAll(){return [];}};}},escapeHtml:s=>s,sanitizeHtml:s=>s,evaluationDeadline:()=>null,CONFIG:{getFileUrl:p=>p}});vm.runInContext(fs.readFileSync('dashboard-sessions.js','utf8'),c);vm.runInContext(fs.readFileSync(file,'utf8'),c);return {c,nodes};}
const evaluation={linkID:7,title:'Evaluation',googleFormURL:'https://forms.gle/example'};
test('full evaluation card distinguishes unknown submission from absent proof and recovers submitted state',()=>{
 const {c}=context('MENTEE/JS/announcements.js');
 let html=c.renderEvaluationCard(evaluation);assert.match(html,/Submission status unavailable/);assert.match(html,/Retry/);assert.doesNotMatch(html,/type="file"/);
 vm.runInContext("submissionStatusAvailable=true;myProofPaths=new Map([[7,'/proof.png']])",c);
 html=c.renderEvaluationCard(evaluation);assert.match(html,/Submitted/);assert.match(html,/proof.png/);assert.doesNotMatch(html,/type="file"/);
 vm.runInContext('myProofPaths=new Map()',c);assert.match(c.renderEvaluationCard(evaluation),/type="file"/);
});
test('dashboard unknown submission suppresses upload and submitted claims',()=>{
 const {c,nodes}=context('MENTEE/JS/mentee-dashboard.js');c.renderEvaluationCards([evaluation],new Map(),false);
 assert.match(nodes.evaluationsList.innerHTML,/Submission status unavailable/);assert.match(nodes.evaluationsList.innerHTML,/Retry/);assert.doesNotMatch(nodes.evaluationsList.innerHTML,/type="file"/);
 c.renderEvaluationCards([evaluation],new Map([[7,'/proof.png']]),true);assert.match(nodes.evaluationsList.innerHTML,/Submitted/);assert.doesNotMatch(nodes.evaluationsList.innerHTML,/Submission status unavailable/);
});
test('mentor summary distinguishes completed, ongoing, closed, scheduled and cancelled',()=>{
 const {c,nodes}=context('MENTOR/JS/sessions.js');
 const base={slotName:'Before Prelims',schoolYear:'2026',semester:'1',sessionDate:'2020-01-01'};
 vm.runInContext("sessionCalendar=[{isPublished:true,eventType:'Session Schedule',slotName:'Before Prelims',schoolYear:'2026',semester:'1',startDate:'2020-01-01',endDate:'2020-01-02'}]",c);
 const sessions=[{...base,sessionStatus:'Completed',timeEnd:'2020-01-01'},{...base,sessionStatus:'Scheduled'},{...base,sessionStatus:'Cancelled'},{...base,slotName:'Later',sessionStatus:'Completed'},{...base,slotName:'Later',sessionStatus:'Scheduled'}];
 c.updateStats(sessions);for(const id of ['sCompleted','sScheduled','sCancelled','sInProgress','sClosed'])assert.equal(nodes[id].textContent,1,id);assert.equal(nodes.sTotalSessions.textContent,5);
});
