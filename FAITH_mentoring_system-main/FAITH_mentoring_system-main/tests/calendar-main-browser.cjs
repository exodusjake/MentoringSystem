const fs=require('fs'),path=require('path'),http=require('http'),os=require('os'),{spawn}=require('child_process');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{
 if(req.url==='/test'){
  let html=fs.readFileSync(path.join(root,'ADMIN_/HTML/calendar-events.html'),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
  html=html.replace('</body>',`<script src="/calendar-sheet.js"></script><script>

  const checks=[];const check=(ok,name)=>checks.push({name,pass:!!ok});
  const panel=document.querySelector('.cal-panel'),sidebar=document.querySelector('.cal-sidebar'),list=document.getElementById('calEventsList'),header=document.querySelector('.cal-sidebar-header');
  for(const days of [35,42]){
    document.getElementById('calGrid').innerHTML=Array.from({length:days},(_,i)=>'<div class="cal-day"><div class="cal-day-num">'+(i%31+1)+'</div></div>').join('');
    let originalHeight;
    for(const count of [2,5,30]){
      list.innerHTML=Array.from({length:count},(_,i)=>'<div class="cal-event-card session"><div class="cal-event-top"><div class="cal-event-title">Synthetic mentoring activity '+i+'</div></div><div class="cal-event-dates">October 8, 2026</div><span class="cal-event-badge badge-session">Session Schedule</span><div class="cal-event-note">Synthetic activity description with multiple lines of readable content.</div></div>').join('');
      const a=panel.getBoundingClientRect(),b=sidebar.getBoundingClientRect();
      if(originalHeight!==undefined)check(Math.abs(a.height-originalHeight)<1,'calendar height unchanged '+days+'/'+count);originalHeight=a.height;
      if(innerWidth>1024){check(Math.abs(a.top-b.top)<1&&Math.abs(a.bottom-b.bottom)<1,'aligned edges '+days+'/'+count);}
      else{check(b.top>=a.bottom,'stacked '+days+'/'+count);check(list.clientHeight<=420,'mobile bounded list '+days+'/'+count);}
      const top=header.getBoundingClientRect().top;list.scrollTop=list.scrollHeight;
      if(count===30)check(list.scrollTop>0,'list scrolls '+days);
      check(header.getBoundingClientRect().top===top,'header stationary '+days+'/'+count);
      check(list.scrollWidth<=list.clientWidth+1,'no list horizontal overflow '+days+'/'+count);
      list.scrollTop=0;
    }
  }
  const out=document.createElement('pre');out.id='results';out.textContent=JSON.stringify(checks);document.body.appendChild(out);
  </script></body>`);
  res.setHeader('Content-Security-Policy',"connect-src 'none'; form-action 'none'");res.end(html);return;
 }
 const f=path.resolve(root,'.'+req.url);
 if(!f.startsWith(root+path.sep)||! /\.(css|js|png)$/.test(f)){res.writeHead(404).end();return;}
 try{res.setHeader('Content-Type',f.endsWith('.css')?'text/css':f.endsWith('.js')?'application/javascript':'image/png');res.end(fs.readFileSync(f));}catch{res.writeHead(404).end();}
});
server.listen(0,'127.0.0.1',async()=>{
 try{for(const size of ['1366,768','768,600','390,844','320,568']){
  const args=['--headless=new','--disable-gpu','--no-first-run','--disable-background-networking','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1','--window-size='+size,'--user-data-dir='+fs.mkdtempSync(path.join(os.tmpdir(),'astra-sheet-')),'--dump-dom','--virtual-time-budget=1500',`http://127.0.0.1:${server.address().port}/test`];
  const output=await new Promise((resolve,reject)=>{const child=spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',args);let s='';child.stdout.on('data',b=>s+=b);child.stderr.resume();const timer=setTimeout(()=>{child.kill();reject(Error('Browser timeout'));},20000);child.on('error',reject);child.on('close',code=>{clearTimeout(timer);code===0?resolve(s):reject(Error('Browser failed'));});});
  const match=output.match(/<pre id="results">([^<]+)<\/pre>/);if(!match)throw Error('Missing results');
  const checks=JSON.parse(match[1].replace(/&quot;/g,'"').replace(/&amp;/g,'&'));const fail=checks.filter(c=>!c.pass);
  console.log(size+': '+(fail.length?'FAIL '+fail.map(c=>c.name).join(', '):'PASS '+checks.length+' checks'));if(fail.length)throw Error('Calendar layout verification failed');
 }}catch(e){console.error(e.message);process.exitCode=1;}finally{server.close();}
});
