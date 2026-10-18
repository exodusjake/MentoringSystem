const fs=require('fs'),path=require('path'),http=require('http'),os=require('os'),{spawn}=require('child_process');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{
 if(req.url.startsWith('/frame')){const w=Number(new URL(req.url,'http://local').searchParams.get('w'));res.end('<iframe style="width:'+w+'px;height:900px;border:0" src="/test?w='+w+'"></iframe><pre id="results"></pre><script>addEventListener("message",e=>document.getElementById("results").textContent=JSON.stringify(e.data))</script>');return;}
 if(req.url.startsWith('/test')){
  let html=fs.readFileSync(path.join(root,'MENTOR/HTML/calendar.html'),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
  html=html.replace('</body>',`<script>const originalListener=document.addEventListener.bind(document);document.addEventListener=(type,...args)=>{if(type!=="DOMContentLoaded")originalListener(type,...args);};</script><script src="/MENTOR/JS/calendar.js"></script><script>





  const checks=[];const check=(ok,name)=>checks.push({name,pass:!!ok});
  check(!document.getElementById('addPersonalBtn'),'creation button removed');
  openPersonalModal();check(!document.getElementById('personalModalOverlay').classList.contains('active'),'creation entry disabled');
  mySessions=['Cancelled','Completed','Scheduled','Pending'].map((status,i)=>({sessionID:i+1,sessionStatus:status,sessionDate:'2026-10-12T08:00:00',slotName:'After Prelims',topic:'Synthetic mentoring session',sectionCode:'BSIT'}));
  personalEvents=[{eventID:50,eventDate:'2026-10-12T00:00:00',title:'Existing historical note'}];
  const events=normalizedEvents();check(events.some(e=>e.kind==='Cancelled'),'cancelled history retained');check(events.some(e=>e.origin==='personal'),'existing personal notes retained');
  check(barClassFor(events.find(e=>e.kind==='Cancelled'))==='my-session cancelled','cancelled indicator mapping');
  const list=document.getElementById('calEventsList');list.innerHTML=mySessions.map(renderLoggedSessionCard).join('')+'<div class="cal-day-bar my-session cancelled"></div><div class="cal-day-bar my-session"></div>';
  const colors={cancelled:'rgb(185, 28, 28)',completed:'rgb(22, 101, 52)',scheduled:'rgb(29, 78, 216)',pending:'rgb(146, 64, 14)'};
  for(const [status,color] of Object.entries(colors))check(getComputedStyle(list.querySelector('.session-status-'+status)).color===color,status+' badge');
  check(getComputedStyle(list.querySelector('.cal-event-card.cancelled')).borderLeftColor==='rgb(220, 38, 38)','red cancelled card');
  check(getComputedStyle(list.querySelector('.cal-day-bar.cancelled')).backgroundColor==='rgb(220, 38, 38)','red cancelled indicator');
  check(getComputedStyle(list.querySelector('.cal-day-bar.my-session:not(.cancelled)')).backgroundColor==='rgb(124, 58, 237)','normal purple category preserved');
  check(list.scrollWidth<=list.clientWidth+1,'list no horizontal overflow');
  check(!!document.getElementById('exportBtn'),'export retained');check(!!document.getElementById('calSearch')&&!!document.getElementById('typeFilter'),'search and filters retained');
  sourceVisible.sessions=false;check(!normalizedEvents().some(e=>e.source==='session'),'My Sessions filter preserved');
  sourceVisible.sessions=true;openPersonalModal(50);check(document.getElementById('personalModalOverlay').classList.contains('active'),'retained note edit available');closePersonalModal();
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
