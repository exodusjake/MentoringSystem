const fs=require('fs'),path=require('path'),http=require('http'),os=require('os'),{spawn}=require('child_process');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{
 if(req.url.startsWith('/frame')){const w=Number(new URL(req.url,'http://local').searchParams.get('w'));res.end('<iframe style="width:'+w+'px;height:900px;border:0" src="/test?w='+w+'"></iframe><pre id="results"></pre><script>addEventListener("message",e=>document.getElementById("results").textContent=JSON.stringify(e.data))</script>');return;}
 if(req.url.startsWith('/test')){
  let html=fs.readFileSync(path.join(root,'MENTOR/HTML/sessions.html'),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
  html=html.replace('</body>',`<script>const originalListener=document.addEventListener.bind(document);document.addEventListener=(type,...args)=>{if(type!=="DOMContentLoaded")originalListener(type,...args);};</script><script src="/MENTOR/JS/sessions.js"></script><script>




﻿  (async()=>{
  const checks=[];const check=(ok,name)=>checks.push({name,pass:!!ok});
  window.validateUploadFile=()=>null;let writes=0;window.apiRequest=()=>{writes++;};
  allSessions=[{sessionID:1,presentCount:2,sessionStatus:'Completed',proofFilePath:'/old.jpg'}];
  openProofModal(1,'Oct 12');check(getComputedStyle(document.getElementById('proofCameraPanel')).display==='none','camera hidden by default'); usesProofNativeCamera=()=>false;
  let stops=0;const track={stop:()=>stops++};const stream={getTracks:()=>[track],getVideoTracks:()=>[track]};
  Object.defineProperty(navigator,'mediaDevices',{value:{getUserMedia:async()=>stream},configurable:true});
  const video=document.getElementById('proofCameraVideo');Object.defineProperty(video,'srcObject',{value:null,writable:true});
  Object.defineProperty(video,'videoWidth',{value:640});Object.defineProperty(video,'videoHeight',{value:480});
  const create=document.createElement.bind(document);document.createElement=(tag)=>{const el=create(tag);if(tag==='canvas'){el.getContext=()=>({drawImage(){}});el.toBlob=callback=>callback(new Blob(['synthetic camera image'],{type:'image/jpeg'}));}return el;};
  await openCamera();check(!document.getElementById('proofCameraPanel').hidden,'desktop preview opens');
  check(document.querySelectorAll('#proofCameraLiveActions button').length===2,'minimal Capture and Cancel controls');
  check(document.getElementById('proofCameraCapturedActions').hidden,'captured controls hidden while live');
  captureProofPhoto();check(document.getElementById('submitProofBtn').disabled,'Capture does not select or upload');
  check(document.getElementById('proofCameraLiveActions').hidden&&!document.getElementById('proofCameraCapturedActions').hidden,'only Retake and Use Photo after capture');
  document.querySelector('#proofCameraCapturedActions button').click();await Promise.resolve();await Promise.resolve();
  check(!document.getElementById('proofCameraPanel').hidden&&document.getElementById('submitProofBtn').disabled,'Retake restarts preview and clears selection');
  captureProofPhoto();useProofPhoto();check(document.getElementById('proofFileName').textContent==='session-proof.jpg','Use Photo selects filename');
  check(!document.getElementById('submitProofBtn').disabled,'capture enables separate Upload');
  check(writes===0&&stops>0&&document.getElementById('proofCameraPanel').hidden,'capture stops stream and never uploads');
  clearProofFile();check(document.getElementById('proofCameraPanel').hidden,'Cancel stops camera');
  navigator.mediaDevices.getUserMedia=async()=>{throw Object.assign(Error('Denied'),{name:'NotAllowedError'});};await openCamera();
  check(document.getElementById('proofCameraHint').textContent.includes('permission denied'),'permission denial explained');
  navigator.mediaDevices.getUserMedia=async()=>{throw Object.assign(Error('No camera'),{name:'NotFoundError'});};await openCamera();
  check(document.getElementById('proofCameraHint').textContent.includes('Upload Photo'),'unavailable camera fallback');
  let resolve;navigator.mediaDevices.getUserMedia=()=>new Promise(r=>resolve=r);
  const pending=openCamera();closeProofModal();resolve(stream);await pending;
  check(document.getElementById('proofCameraPanel').hidden,'close during permission request prevents reopen');
  openProofModal(1,'Oct 12');navigator.mediaDevices.getUserMedia=async()=>stream;await openCamera();proofCameraFailed();
  check(document.getElementById('proofCameraPanel').hidden,'camera error stops stream');
  usesProofNativeCamera=()=>true;let picker=0;const input=document.getElementById('proofFileInput');input.click=()=>picker++;
  await openCamera();check(input.accept==='image/*'&&input.getAttribute('capture')==='environment'&&picker===1,'mobile native capture preserved');
  openProofPicker();check(!input.hasAttribute('capture')&&input.accept.includes('application/pdf')&&picker===2,'normal picker remains separate');
  check(writes===0&&allSessions[0].proofFilePath==='/old.jpg','existing record untouched');
  check(document.querySelector('#proofModal .modal-card').scrollWidth<=document.querySelector('#proofModal .modal-card').clientWidth+1,'modal no overflow');
  parent.postMessage(checks,'*');
  })();
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
