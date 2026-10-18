const fs=require('fs'),path=require('path'),http=require('http'),os=require('os'),{spawn}=require('child_process');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{
 if(req.url==='/test'){
  let html=fs.readFileSync(path.join(root,'ADMIN_/HTML/calendar-events.html'),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
  html=html.replace('</body>',`<script src="/calendar-sheet.js"></script><script>
  function fmtPrintDate(date){return 'October 8, 2026';}
  const checks=[];const check=(ok,name)=>checks.push({name,pass:!!ok});
  const modal=document.getElementById('sheetModal');modal.style.display='flex';
  document.getElementById('sheetPreparedNameDisp').textContent='Synthetic preparer';
  document.getElementById('sheetApprovedNameDisp').textContent='Synthetic approver';
  const preview=document.querySelector('.sheet-preview-panel'),paper=document.getElementById('sheetPreviewBody'),box=document.querySelector('.sheet-container');
  let height;
  for(const count of [2,30,80]){
    paper.innerHTML=buildCalendarSheetBodyHtml({semester:'1st Semester',schoolYear:'Synthetic',prepName:'Synthetic preparer',appName:'Synthetic approver',events:Array.from({length:count},(_,i)=>({title:'Synthetic activity '+i,startDate:'2026-10-08'}))});
    const rect=box.getBoundingClientRect();
    check(rect.top>=0&&rect.bottom<=innerHeight+1,'viewport bounds '+count);
    if(height!==undefined)check(Math.abs(rect.height-height)<1,'fixed height '+count);height=rect.height;
    check(preview.clientHeight>0,'preview usable '+count);
    check(modal.scrollWidth<=modal.clientWidth+1&&preview.scrollWidth<=preview.clientWidth+1,'no horizontal overflow '+count);
    const before=document.querySelector('.sheet-modal-header').getBoundingClientRect().top;
    preview.scrollTop=preview.scrollHeight;
    if(count>=30)check(preview.scrollTop>0,'preview scroll '+count);
    check(document.querySelector('.sheet-modal-header').getBoundingClientRect().top===before,'header stationary '+count);
    for(const button of document.querySelectorAll('.sheet-modal-btns button')){const r=button.getBoundingClientRect();check(r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth,'control visible '+count);}
    check(document.querySelector('.sheet-body').scrollTop===0,'body not scrolled '+count);
    preview.scrollTop=0;
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
  console.log(size+': '+(fail.length?'FAIL '+fail.map(c=>c.name).join(', '):'PASS '+checks.length+' checks'));if(fail.length)throw Error('Modal verification failed');
 }}catch(e){console.error(e.message);process.exitCode=1;}finally{server.close();}
});
