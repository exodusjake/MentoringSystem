const fs=require('fs'),path=require('path'),http=require('http'),os=require('os'),{spawn}=require('child_process');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{
 if(req.url.startsWith('/frame')){const w=Number(new URL(req.url,'http://local').searchParams.get('w'));res.end('<iframe style="width:'+w+'px;height:900px;border:0" src="/test?w='+w+'"></iframe><pre id="results"></pre><script>addEventListener("message",e=>document.getElementById("results").textContent=JSON.stringify(e.data))</script>');return;}
 if(req.url.startsWith('/test')){
  let html=fs.readFileSync(path.join(root,'MENTOR/HTML/sessions.html'),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
  html=html.replace('</body>',`<script>const originalListener=document.addEventListener.bind(document);document.addEventListener=(type,...args)=>{if(type!=="DOMContentLoaded")originalListener(type,...args);};</script><script src="/MENTOR/JS/sessions.js"></script><script>




  const checks=[];const check=(ok,name)=>checks.push({name,pass:!!ok});
  Object.defineProperty(navigator,'mediaDevices',{value:undefined,configurable:true});
  window.validateUploadFile=file=>file.name.endsWith('.exe')?'Invalid file':null;
  let writes=0; window.apiRequest=()=>{writes++;};
  allSessions=[{sessionID:1,presentCount:2,sessionStatus:'Completed',proofFilePath:'/original.jpg'},{sessionID:2,presentCount:1,sessionStatus:'Completed'}];
  const input=document.getElementById('proofFileInput'),options=document.getElementById('proofOptions'),btn=document.getElementById('submitProofBtn');
  const pick=name=>{const dt=new DataTransfer();dt.items.add(new File(['photo'],name,{type:'image/png'}));input.files=dt.files;input.dispatchEvent(new Event('change'));};
  for(const id of [1,2]) {
    openProofModal(id,'Oct 12');
    check(getComputedStyle(options).display==='grid','options visible on open '+id);
    check(btn.disabled,'upload disabled without selection '+id);
    check(options.querySelectorAll('button').length===2,'keyboard accessible options '+id);
    check(options.textContent.includes('Upload Photo')&&options.textContent.includes('Take Photo'),'distinct options '+id);
    pick('selected-photo.png');
    check(!btn.disabled,'valid selection enables upload '+id);
    check(document.getElementById('proofFileName').textContent==='selected-photo.png','filename visible '+id);
    clearProofFile();check(btn.disabled&&getComputedStyle(options).display==='grid','clear restores controls '+id);
    pick('invalid.exe');check(btn.disabled&&input.files.length===0,'invalid selection rejected '+id);
    pick('cancelled.png');closeProofModal();
    check(writes===0&&allSessions[0].proofFilePath==='/original.jpg','cancel preserves saved proof '+id);
    openProofModal(id,'Oct 12');check(getComputedStyle(options).display==='grid'&&btn.disabled,'reopen after selection resets '+id);
  }
  usesProofNativeCamera=()=>true; input.click=()=>{};openCamera();
  check(document.getElementById('proofCameraHint').textContent.includes('file picker'),'desktop camera fallback explained');
  Object.defineProperty(input,'capture',{value:'',configurable:true});
  const originalMatch=window.matchMedia;window.matchMedia=()=>({matches:true});openCamera();
  check(input.getAttribute('capture')==='environment','native mobile camera requested');
  check(document.getElementById('proofCameraHint').textContent.includes('Upload Photo'),'mobile camera fallback explained');
  window.matchMedia=originalMatch;
  check(document.querySelector('#proofModal .modal-card').scrollWidth<=document.querySelector('#proofModal .modal-card').clientWidth+1,'modal no horizontal overflow');
  parent.postMessage(checks,'*');
  const out=document.createElement('pre');out.id='results';out.textContent=JSON.stringify(checks);document.body.appendChild(out);
  </script></body>`);
  res.setHeader('Content-Security-Policy',"connect-src 'none'; form-action 'none'");res.end(html);return;
 }
 const f=path.resolve(root,'.'+req.url);
 if(!f.startsWith(root+path.sep)||! /\.(css|js|png)$/.test(f)){res.writeHead(404).end();return;}
 try{res.setHeader('Content-Type',f.endsWith('.css')?'text/css':f.endsWith('.js')?'application/javascript':'image/png');res.end(fs.readFileSync(f));}catch{res.writeHead(404).end();}
});
server.listen(0,'127.0.0.1',async()=>{
 try{for(const size of ['1536,1000','1024,1000','768,1000','390,1000','320,1000']){
  const args=['--headless=new','--disable-gpu','--no-first-run','--disable-background-networking','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1','--window-size=1800,1000','--user-data-dir='+fs.mkdtempSync(path.join(os.tmpdir(),'astra-sheet-')),'--dump-dom','--virtual-time-budget=1500',`http://127.0.0.1:${server.address().port}/frame?w=${size.split(',')[0]}`];
  const output=await new Promise((resolve,reject)=>{const child=spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',args);let s='';child.stdout.on('data',b=>s+=b);child.stderr.resume();const timer=setTimeout(()=>{child.kill();reject(Error('Browser timeout'));},20000);child.on('error',reject);child.on('close',code=>{clearTimeout(timer);code===0?resolve(s):reject(Error('Browser failed'));});});
  const match=output.match(/<pre id="results">([^<]+)<\/pre>/);if(!match)throw Error('Missing results');
  const checks=JSON.parse(match[1].replace(/&quot;/g,'"').replace(/&amp;/g,'&'));const fail=checks.filter(c=>!c.pass);
  console.log(size+': '+(fail.length?'FAIL '+fail.map(c=>c.name).join(', '):'PASS '+checks.length+' checks'));if(fail.length)throw Error('Logsheet mobile verification failed');
 }}catch(e){console.error(e.message);process.exitCode=1;}finally{server.close();}
});
