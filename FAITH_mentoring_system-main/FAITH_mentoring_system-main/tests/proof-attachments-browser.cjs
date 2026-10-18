const fs=require('fs'),path=require('path'),http=require('http'),os=require('os'),{spawn}=require('child_process');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{
 if(req.url.startsWith('/frame')){const w=Number(new URL(req.url,'http://local').searchParams.get('w'));res.end('<iframe style="width:'+w+'px;height:900px;border:0" src="/test?w='+w+'"></iframe><pre id="results"></pre><script>addEventListener("message",e=>document.getElementById("results").textContent=JSON.stringify(e.data))</script>');return;}
 if(req.url.startsWith('/test')){
  let html=fs.readFileSync(path.join(root,'MENTOR/HTML/sessions.html'),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
  html=html.replace('</body>',`<script>const originalListener=document.addEventListener.bind(document);document.addEventListener=(type,...args)=>{if(type!=="DOMContentLoaded")originalListener(type,...args);};</script><script src="/MENTOR/JS/sessions.js"></script><script>




  const checks=[];const check=(ok,name)=>checks.push({name,pass:!!ok});
  const CONFIG={getUrl:p=>'/api/'+p,getFileUrl:p=>'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'};
  const file='/uploads/proof/a-very-long-saved-proof-filename-for-responsive-testing-1234567890.png';
  allSessions=[{sessionID:9,presentCount:2,sessionStatus:'Completed',sessionDate:'2026-10-12',proofFilePath:file}];
  viewProof(file,'image','Synthetic session proof',9);
  const body=document.getElementById('lightboxBody'),modal=document.querySelector('.lightbox-inner');
  check(innerWidth===Number(new URL(location.href).searchParams.get('w')),'exact viewport');
  check(body.querySelectorAll('.proof-attachment-row').length===1,'one active attachment');
  check(!body.querySelector('img'),'no automatic image');
  check(body.querySelector('.proof-attachment-name').textContent===file.split('/').pop(),'saved basename');
  check(body.querySelector('a').getAttribute('href')==='/api/ProofOfSession/download?path='+encodeURIComponent(file),'download endpoint preserved');
  check(modal.scrollWidth<=modal.clientWidth+1&&body.scrollWidth<=body.clientWidth+1,'no horizontal overflow');
  body.querySelector('.proof-attachment-name').click();check(!!body.querySelector('img'),'filename opens preview');
  body.querySelector('.proof-preview-back').click();check(!body.querySelector('img')&&!!body.querySelector('.proof-attachment-row'),'back restores list');
  body.querySelector('.proof-attachment-actions button').click();check(!!body.querySelector('img'),'View opens preview');
  body.querySelector('img').onerror();check(body.textContent.includes('Image preview unavailable'),'failed preview explicit');
  body.querySelector('.proof-preview-back').click();check(!!body.querySelector('a'),'download available after preview failure');
  viewProof('/uploads/proof/latest.png','image','Updated saved proof');check(body.querySelector('.proof-attachment-name').textContent==='latest.png','reopen uses supplied latest saved path');
  check(body.querySelectorAll('.proof-attachment-row').length===1,'reopen replaces UI rather than duplicates');
  viewProof(file,'image','Synthetic session proof',9);
  const replaceButton=[...body.querySelectorAll('button')].find(b=>b.textContent==='Replace');
  check(!!replaceButton&&!replaceButton.disabled,'Replace available inside viewer');replaceButton.click();
  check(document.getElementById('proofModal').classList.contains('open'),'Replace opens same upload modal');
  check(document.getElementById('submitProofBtn').disabled,'replacement starts with no selection');
  closeProofModal();check(allSessions[0].proofFilePath===file,'cancel preserves saved path');
  closeLightbox();check(document.getElementById('lightboxOverlay').style.display==='none','close modal');
  window.sessionDisplayStatus=s=>s.sessionStatus;window.checkpointWindow=()=>({disabled:true});
  renderCards([{...allSessions[0],totalAttendees:2},{sessionID:10,sessionDate:'2026-10-12',sessionStatus:'Completed',presentCount:1,totalAttendees:1}]);
  const cards=[...document.querySelectorAll('.session-card')];
  check(cards[0].textContent.includes('View Photo')&&!cards[0].textContent.includes('Replace Photo'),'one external View Photo action');
  check(cards[1].textContent.includes('Upload Proof'),'first upload action retained');
  check(cards.every(c=>c.scrollWidth<=c.clientWidth+1),'session cards no overflow');
  check(cards.every(c=>[...c.querySelectorAll('.sc-action-btn')].every(b=>b.scrollWidth<=b.clientWidth+1)),'action labels not clipped');
  let blockedMessage='';window.showToast=message=>blockedMessage=message;
  allSessions=[{sessionID:71,sessionDate:'2026-10-12',sessionStatus:'Scheduled',presentCount:0,hasVerifiedAttendance:true,isMakeup:false},{sessionID:82,sessionDate:'2026-10-12',sessionStatus:'Completed',presentCount:2,hasVerifiedAttendance:false,isMakeup:true}];
  renderCards(allSessions);
  const uploadButtons=[...document.querySelectorAll('.btn-sc-proof-upload')];
  uploadButtons[0].click();
  check(document.getElementById('proofModal').classList.contains('open'),'actual card click opens for verified attendance despite zero display count');
  closeProofModal();uploadButtons[1].click();
  check(!document.getElementById('proofModal').classList.contains('open')&&blockedMessage.includes('QR attendance'),'actual blocked card click explains unverified attendance');
  check(uploadButtons[1].getAttribute('aria-disabled')==='true'&&!uploadButtons[1].disabled,'blocked action remains explainable with accessibility state');
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
