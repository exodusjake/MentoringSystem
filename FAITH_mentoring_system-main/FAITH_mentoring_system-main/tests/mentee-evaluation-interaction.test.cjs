const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
test('evaluation instructions and actions stay in place; card background retains its deep link',()=>{
 let click;const item={dataset:{evalLinkId:'7'},addEventListener(type,fn){click=fn;}};
 const container={innerHTML:'',querySelectorAll(){return [item];}};
 const c=vm.createContext({console,document:{addEventListener(){},getElementById(){return container;}},window:{location:{href:'dashboard'},addEventListener(){}},escapeHtml:s=>s,sanitizeHtml:s=>s,evaluationDeadline:()=>null});
 vm.runInContext(fs.readFileSync('MENTEE/JS/mentee-dashboard.js','utf8'),c);
 c.renderEvaluationCards([{linkID:7,title:'Evaluation',postedAt:'2026-10-01',googleFormURL:'https://forms.gle/example'}],new Map());
 assert.match(container.innerHTML,/details class="eval-upload-instructions"/);
 for(const tag of ['details','summary','a','button','input','label']){
  c.window.location.href='dashboard';
  click({target:{closest(selector){return selector.split(',').map(s=>s.trim()).includes(tag)?{}:null;}}});
  assert.equal(c.window.location.href,'dashboard',tag);
 }
 click({target:{closest(){return null;}}});
 assert.equal(c.window.location.href,'announcements.html?id=eval-7');
});
