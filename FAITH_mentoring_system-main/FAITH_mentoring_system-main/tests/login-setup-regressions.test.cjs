const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

function storage() {
  const values=new Map();
  return {getItem:key=>values.get(key)??null, setItem:(key,value)=>values.set(key,String(value)), removeItem:key=>values.delete(key)};
}

for (const [portal,role] of [['ADMIN_','Admin'],['HEAD','Head'],['MENTOR','Mentor'],['MENTEE','Mentee']]) {
  for (const remember of [true,false]) test(`${role}: explicit logout blocks restored profile with Remember me=${remember}`,()=>{
    const handlers={},local=storage(),session=storage();
    const document={documentElement:{style:{}},createElement:()=>({}),head:{appendChild(){}}};
    const window={location:{pathname:`/${portal}/HTML/profile.html`,href:'',replace(url){this.href=url;}},addEventListener:(event,handler)=>handlers[event]=handler};
    const c=vm.createContext({localStorage:local,sessionStorage:session,window,document});
    vm.runInContext(fs.readFileSync('apiClient.js','utf8'),c);
    c.role=role;c.remember=remember;
    vm.runInContext("saveSession('token',role,{setupRequired:false},remember);requireAuth(role);clearSession()",c);
    handlers.pageshow({persisted:true});
    assert.equal(window.location.href,'/LOGIN/HTML/login.html');
    assert.equal(local.getItem('token'),null);
    assert.equal(document.documentElement.style.visibility,'hidden');
  });

  for (const outcome of ['success','failure','missing-confirmation']) test(`${role}: signature setup ${outcome}`,async()=>{
    const nodes={};
    const node=id=>nodes[id]??=( {style:{},classList:{add(){},remove(){}},handlers:{},checked:true,
      files:[{type:'image/png',size:2*1024*1024}],addEventListener(event,fn){this.handlers[event]=fn;}} );
    const session={token:'token',role,user:{userID:1,setupRequired:true}};
    const window={location:{href:''}};
    const c=vm.createContext({window,document:{getElementById:node},getSession:()=>session,localStorage:storage(),
      FormData:class {append(){}},FileReader:class {readAsDataURL(){this.onload({target:{result:'data:image/png;base64,test'}});}},
      apiRequest:async(endpoint)=>{
        assert.equal(endpoint,'ESignature/1');
        if(outcome==='failure')throw new Error('Upload failed. Please try again.');
        return outcome==='success'?{signatureFilePath:'/uploads/signatures/test.png'}:{};
      }});
    vm.runInContext(fs.readFileSync(`${portal}/JS/setup.js`,'utf8'),c);
    node('sigFile').handlers.change();
    await window.uploadAndFinish();
    assert.equal(session.user.setupRequired,outcome!=='success');
    if(outcome==='success')assert.match(window.location.href,/dashboard\.html$/);
    else {
      assert.equal(window.location.href,'');
      assert.equal(node('btnContinue').disabled,false);
      assert.match(node('step1Error').textContent,/try again/i);
    }
  });
}

test('logout in another tab blocks an already open protected page',()=>{
  const handlers={},local=storage();
  const window={location:{pathname:'/MENTEE/HTML/setup.html',replace(url){this.href=url;}},addEventListener:(event,fn)=>handlers[event]=fn};
  const c=vm.createContext({window,localStorage:local,sessionStorage:storage(),document:{documentElement:{style:{}},createElement:()=>({}),head:{appendChild(){}}}});
  vm.runInContext(fs.readFileSync('apiClient.js','utf8'),c);
  handlers.storage({key:'token'});
  assert.equal(window.location.href,'/LOGIN/HTML/login.html');
});
