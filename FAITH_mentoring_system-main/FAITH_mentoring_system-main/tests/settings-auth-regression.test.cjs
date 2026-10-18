const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const read=p=>fs.readFileSync(p,'utf8');
function setup(fetcher){
 const data=new Map(),nodes={},handlers={};let calls=0;
 const storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)};
 const node=id=>nodes[id]??={value:'',type:'password',disabled:false,style:{},textContent:'',innerHTML:'',select(){},focus(){}};
 const window={location:{pathname:'/ADMIN_/HTML/settings.html',href:'',replace(p){this.href=p;}},addEventListener:(n,f)=>handlers[n]=f};
 const document={getElementById:node,addEventListener(){},createElement:()=>({}),head:{appendChild(){}},documentElement:{style:{}}};
 const c=vm.createContext({window,document,localStorage:storage,sessionStorage:storage,FormData,AbortController,
   setTimeout:()=>1,clearTimeout(){},console:{error(){}},CONFIG:{getUrl:p=>p},fetch:async(...args)=>{calls++;return fetcher(...args);}});
 vm.runInContext(read('apiClient.js')+read('ADMIN_/JS/settings.js'),c);
 const html=read('ADMIN_/HTML/settings.html');
 vm.runInContext(html.match(/<script>\s*([\s\S]*?)<\/script>/)[1],c);
 vm.runInContext("saveSession('test-token','Admin',{setupRequired:false});requireAuth('admin')",c);
 return {c,node,window,storage,handlers,calls:()=>calls};
}
const response=(status,message='failure')=>({ok:status<400,status,json:async()=>({message}),text:async()=>''});
test('typing, focus and password visibility do not request verification or clear login',()=>{
 const s=setup(()=>response(200));s.c.openUnlock();s.node('unlockPasswordInput').focus();s.node('unlockPasswordInput').value='typed';
 s.c.togglePwd('unlockPasswordInput',s.node('eye'));assert.equal(s.node('unlockPasswordInput').type,'text');
 s.c.togglePwd('unlockPasswordInput',s.node('eye'));assert.equal(s.node('unlockPasswordInput').type,'password');
 assert.equal(s.calls(),0);assert.equal(s.storage.getItem('token'),'test-token');
});
test('Enter submits once, rejects wrong settings password and preserves session',async()=>{
 let finish;const s=setup(()=>new Promise(resolve=>finish=()=>resolve(response(400,'Incorrect settings password.'))));
 s.node('unlockPasswordInput').value='wrong';let prevented=0;
 const html=read('ADMIN_/HTML/settings.html');
 const handler=html.match(/id="unlockPasswordInput"[\s\S]*?onkeydown="([^"]+)"/)[1];
 s.c.event={key:'Enter',preventDefault(){prevented++;}};
 vm.runInContext(handler,s.c);vm.runInContext(handler,s.c);assert.equal(s.calls(),1);finish();
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(prevented,2);assert.equal(s.storage.getItem('token'),'test-token');assert.equal(s.window.location.href,'');
 assert.match(s.node('unlockError').textContent,/Incorrect settings password/);
 assert.match(html,/type="button" class="smb-confirm" id="unlockBtn"/);
});
test('changing settings password rejects wrong current password without logout',async()=>{
 const s=setup(()=>response(400,'Incorrect current password.'));
 s.node('cpCurrentInput').value='wrong';s.node('cpNewInput').value=s.node('cpConfirmInput').value='new-password';
 await s.c.submitChangePassword();assert.equal(s.storage.getItem('token'),'test-token');assert.match(s.node('cpError').textContent,/Incorrect current password/);
});
for(const status of [403,409,500,503]) test(`HTTP ${status} background/API failure preserves authentication`,async()=>{
 const s=setup(()=>response(status));await assert.rejects(s.c.apiRequest('Settings','GET',null,true));
 assert.equal(s.storage.getItem('token'),'test-token');assert.equal(s.window.location.href,'');
});
for(const name of ['TypeError','AbortError']) test(`${name} shows retryable password error without logout`,async()=>{
 const s=setup(()=>{const error=new Error('offline');error.name=name;throw error;});s.node('unlockPasswordInput').value='test';
 await s.c.submitUnlock();assert.equal(s.storage.getItem('token'),'test-token');assert.match(s.node('unlockError').textContent,/Unable to verify/);
});
test('authenticated 401 still clears credentials and redirects; unauthenticated login 401 does not',async()=>{
 const s=setup(()=>response(401));await assert.rejects(s.c.apiRequest('Settings','GET',null,true));
 assert.equal(s.storage.getItem('token'),null);assert.equal(s.window.location.href,'/LOGIN/HTML/login.html');
 const login=setup(()=>response(401));await assert.rejects(login.c.apiRequest('Auth/login','POST',{},false));assert.equal(login.storage.getItem('token'),'test-token');
});
test('ordinary explicit logout still clears session and restored pages redirect',()=>{
 const s=setup(()=>response(200));
 vm.runInContext(read('ADMIN_/JS/sidebar.js').match(/function handleLogout\(\) \{[\s\S]*?\n\s*\}/)[0],s.c);
 s.c.handleLogout();s.handlers.pageshow();assert.equal(s.storage.getItem('token'),null);
 assert.equal(s.window.location.href,'/LOGIN/HTML/login.html');
});
test('Settings domain rejection uses 400, while Admin authorization and JWT validation remain enabled',()=>{
 const source=read('AstraMentoring-Backend/AstraMentoringAPI/Controllers/SettingsController.cs');
 assert.match(source,/ok \? Ok\(\) : BadRequest\(new \{ message = "Incorrect settings password/);
 assert.match(source,/if \(!ok\) return BadRequest\(new \{ message = "Incorrect current password/);
 assert.doesNotMatch(source,/Unauthorized\(/);assert.match(source,/Authorize\(Roles = "Admin"\)/);
});
