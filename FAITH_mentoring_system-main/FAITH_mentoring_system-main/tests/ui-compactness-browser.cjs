// Presentation fixtures only. No API access, authentication or Production writes.
const fs=require('fs'),path=require('path'),http=require('http'),os=require('os'),{spawn}=require('child_process');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://local');
 if(u.pathname==='/frame') {
  res.end(`<iframe style="width:${Number(u.searchParams.get('w'))}px;height:1000px;border:0" src="/fixture?w=${Number(u.searchParams.get('w'))}&page=${u.searchParams.get('page')}"></iframe><pre id="results"></pre><script>addEventListener('message',e=>document.getElementById('results').textContent=JSON.stringify(e.data))</script>`);return;
 }
 if(u.pathname==='/fixture') {
  const mentee=u.searchParams.get('page')==='mentee';
  let html=fs.readFileSync(path.join(root,mentee?'MENTEE/HTML/sessions.html':'ADMIN_/HTML/sessions.html'),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
  const target=mentee?'#sessionsBody':'#mentorCardsGrid';
  // Choose the real listing ID from the page rather than changing the application.
  const card=mentee?`<div class="scm-card"><div class="scm-num-block"><div class="scm-num-label">SESSION</div><div class="scm-num-value">After Prelims</div></div><div class="scm-body"><div class="scm-date-row"><span class="scm-date">October 14, 2026</span><div class="scm-status-stack"><span class="session-status status-scheduled">Scheduled</span><span class="att-badge att-pending">Not recorded</span></div></div><div class="scm-meta">Wednesday · 9:58 PM · Scheduled Session</div></div><div class="scm-right"><div class="scm-actions"><button class="btn-qr">Show QR</button><button class="btn-detail">Details</button></div></div></div>`:`<div class="mentor-card"><div class="mrc-top"><div class="mr-info"><div class="mr-name">Synthetic Mentor</div><div class="mr-dept">School of Humanities</div></div></div><div class="mr-sections">BAC</div><div class="mrc-footer"><div class="mr-badges"><span class="mc-badge pending">Pending</span><span class="mr-stat-badge">0/6 Sessions</span></div><button class="mr-view-btn">View Details</button></div></div>`;
  html=html.replace('</body>',`<script>
   const target=document.querySelector('${target}')||document.querySelector('.session-list');
   if(!target)throw Error('Listing fixture target missing');
   target.innerHTML=${JSON.stringify(card.repeat(mentee?3:7))};
   const checks=[],check=(pass,name)=>checks.push({pass:!!pass,name});
   check(document.documentElement.scrollWidth<=innerWidth+1,'no horizontal overflow');
   if(${mentee}) {
    const badges=[...target.querySelectorAll('.scm-status-stack')];
    check(badges.every(b=>getComputedStyle(b).flexDirection==='row'),'status badges in row');
    check(badges.every(b=>Math.abs(b.children[0].getBoundingClientRect().top-b.children[1].getBoundingClientRect().top)<2),'Scheduled and Not recorded adjacent');
    check([...target.querySelectorAll('button')].every(b=>b.getBoundingClientRect().width>30),'actions readable');
    if(innerWidth<=640)check([...target.querySelectorAll('button')].every(b=>b.getBoundingClientRect().height>=44),'mobile touch targets');
   }else {
    const cards=[...target.children],heights=cards.slice(1).map(c=>c.getBoundingClientRect().height);
    if(innerWidth>=768)for(const card of cards){const badges=[...card.querySelectorAll('.mr-badges > span')],button=card.querySelector('.mr-view-btn');const rects=[...badges,button].map(e=>e.getBoundingClientRect());check(rects.every(r=>Math.abs((r.top+r.height/2)-(rects[0].top+rects[0].height/2))<2),'footer vertical centers');check(rects[0].right<=rects[1].left&&rects[1].right<button.getBoundingClientRect().left,'footer order and spacer');const footer=card.querySelector('.mrc-footer').getBoundingClientRect();check(Math.abs(footer.right-button.getBoundingClientRect().right)<2,'button at right edge');} 
    const expanded=document.createElement('div');expanded.style.height='240px';expanded.textContent='Synthetic expanded content';cards[0].append(expanded);
    check(cards.slice(1).every((c,i)=>Math.abs(c.getBoundingClientRect().height-heights[i])<1),'expanded content does not stretch other cards');
    check(getComputedStyle(target).display==='block','independent-height monitoring columns');
   }
   parent.postMessage(checks,'*');
  </script>`);
  res.setHeader('Content-Security-Policy',"connect-src 'none'; form-action 'none'");res.end(html);return;
 }
 const f=path.resolve(root,'.'+u.pathname);
 if(!f.startsWith(root+path.sep)||! /\.(css|js|png)$/.test(f)){res.writeHead(404).end();return;}
 try{res.setHeader('Content-Type',f.endsWith('.css')?'text/css':'text/javascript');res.end(fs.readFileSync(f));}catch{res.writeHead(404).end();}
});
server.listen(0,'127.0.0.1',async()=>{
 try {
  for(const page of ['mentee','admin'])for(const w of [1536,1024,768,390,320]) {
   const args=['--headless=new','--disable-gpu','--no-first-run','--disable-background-networking','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1','--window-size=1800,1100','--user-data-dir='+fs.mkdtempSync(path.join(os.tmpdir(),'astra-ui-')),'--dump-dom','--virtual-time-budget=1500',`http://127.0.0.1:${server.address().port}/frame?w=${w}&page=${page}`];
   const output=await new Promise((resolve,reject)=>{const child=spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',args);let s='';child.stdout.on('data',b=>s+=b);child.stderr.resume();const timer=setTimeout(()=>{child.kill();reject(Error('Browser timeout'));},20000);child.on('error',reject);child.on('close',code=>{clearTimeout(timer);code===0?resolve(s):reject(Error('Browser failed'));});});
   const match=output.match(/<pre id="results">([^<]+)<\/pre>/);if(!match)throw Error('Missing fixture results: '+page+' '+w);
   const checks=JSON.parse(match[1].replace(/&quot;/g,'"').replace(/&amp;/g,'&')),failed=checks.filter(c=>!c.pass);
   console.log(page+' '+w+': '+(failed.length?'FAIL '+failed.map(c=>c.name).join(', '):'PASS '+checks.length+' checks'));
   if(failed.length)throw Error('Focused layout validation failed');
  }
 }catch(e){console.error(e.message);process.exitCode=1;}finally{server.close();}
});
