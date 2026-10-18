const fs=require('fs'),path=require('path'),http=require('http'),os=require('os'),{spawn}=require('child_process');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{
 if(req.url.startsWith('/frame')){const w=Number(new URL(req.url,'http://local').searchParams.get('w'));res.end('<iframe style="width:'+w+'px;height:900px;border:0" src="/test?w='+w+'"></iframe><pre id="results"></pre><script>addEventListener("message",e=>document.getElementById("results").textContent=JSON.stringify(e.data))</script>');return;}
 if(req.url.startsWith('/test')){
  let html=fs.readFileSync(path.join(root,'MENTOR/HTML/logsheet.html'),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
  html=html.replace('</body>',`<script>const originalListener=document.addEventListener.bind(document);document.addEventListener=(type,...args)=>{if(type!=="DOMContentLoaded")originalListener(type,...args);};</script><script src="/logsheet-data.js"></script><script src="/checkpoint-window.js"></script><script src="/dashboard-sessions.js"></script><script src="/MENTOR/JS/logsheet.js"></script><script>



  const checks=[];const check=(ok,name)=>checks.push({name,pass:!!ok});
  check(innerWidth===Number(new URL(location.href).searchParams.get('w')),'exact viewport');
  logCalendar=[];
  const statuses=['Pending','Submitted Late','Submitted On Time','Needs Update','Overdue','Pending'];
  const fixture=i=>({sessionID:i+1,slotName:i===0?'After Prelims with a longer checkpoint name and additional readable information':'Before Midterms',sessionDate:'2026-10-12T08:00:00+08:00',actualStart:'2026-10-12T08:00:00+08:00',actualEnd:'2026-10-12T09:00:00+08:00',sessionStatus:i===5?'Cancelled':'Completed',logStatus:i===1?'Submitted':'Draft',reportStatus:statuses[i],sections:'BSIT section with additional course information',proofFilePath:'/synthetic.png',mentees:[{menteeID:1,attendanceID:1,isPresent:true,scannedAt:'2026-10-12T00:00:00Z'}]});
  const listing=document.getElementById('logCards');listing.innerHTML='<div class="log-section-cards log-section-cards--ungrouped">'+statuses.map((_,i)=>renderCard(fixture(i),false,i+1)).join('')+'</div><div class="log-section-group"><div class="log-section-group-header">Second section</div><div class="log-section-cards">'+statuses.slice(0,2).map((_,i)=>renderCard({...fixture(i),sessionID:20+i},true,i+1)).join('')+'</div></div>';
  const grids=listing.querySelectorAll('.log-section-cards');
  const expected=listing.clientWidth>=900?2:1;
  grids.forEach((grid,i)=>{check(getComputedStyle(grid).gridTemplateColumns.split(' ').length===expected,'column count '+i);const cards=grid.children;const a=cards[0].getBoundingClientRect(),b=cards[1].getBoundingClientRect();check(expected===2?Math.abs(a.top-b.top)<1:b.top>=a.bottom,'card positioning '+i);if(expected===2)check(Math.abs(a.height-b.height)<1,'equal row heights '+i);});
  for(const [i,card] of [...listing.querySelectorAll('.log-session-card')].entries()){
   check(card.scrollWidth<=card.clientWidth+1,'no card overflow '+i);
   const box=card.getBoundingClientRect();for(const el of card.querySelectorAll('.log-card-num,.log-card-statuses,.log-card-actions')){const r=el.getBoundingClientRect();check(r.left>=box.left&&r.right<=box.right+1&&r.bottom<=box.bottom,'content fits '+i);}
   check(!card.querySelector('.log-card-actions .status-badge'),'statuses separate from actions '+i);
   for(const button of card.querySelectorAll('.log-card-actions > button,.print-btn-group > button'))check(button.getBoundingClientRect().height>=(innerWidth<=600?44:40),'touch target '+i);
  }
  check(getComputedStyle(listing.querySelector('.report-pending')).backgroundColor==='rgb(255, 251, 235)','Pending warning');
  check(getComputedStyle(listing.querySelector('.report-late')).backgroundColor==='rgb(255, 247, 237)','Late highlight');
  check(getComputedStyle(listing.querySelector('.status-badge.completed')).backgroundColor==='rgb(22, 163, 74)','Completed green');
  let opened=null,printed=null;openPreviewModal=(id,n)=>opened=[id,n];exportOneSession=(id,kind,n)=>printed=[id,kind,n];
  listing.querySelector('.btn-view-logsheet').click();listing.querySelector('.btn-print-main').click();
  check(opened?.[0]===1&&opened?.[1]===1,'Logsheet action preserved');check(printed?.[0]===1&&printed?.[1]==='logsheet'&&printed?.[2]===1,'Print action preserved');
  listing.querySelector('.btn-print-caret').click();check(listing.querySelector('.print-dropdown').classList.contains('open'),'Print menu opens');
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
