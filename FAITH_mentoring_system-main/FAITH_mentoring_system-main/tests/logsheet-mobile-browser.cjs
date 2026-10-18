const fs=require('fs'),path=require('path'),http=require('http'),os=require('os'),{spawn}=require('child_process');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{
 if(req.url==='/test'){
  let html=fs.readFileSync(path.join(root,'MENTOR/HTML/logsheet.html'),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
  html=html.replace('</body>',`<script>


  const checks=[];const check=(ok,name)=>checks.push({name,pass:!!ok});
  document.getElementById('logsheetPreviewOverlay').style.display='flex';
  document.getElementById('lpmTitle').textContent='Synthetic After Prelims logsheet';
  document.getElementById('lpmSub').textContent='October 12, 2026';
  const modal=document.querySelector('.lpm-modal'),remarks=document.querySelector('.lpm-remarks-list'),preview=document.querySelector('.lpm-preview-scroll');
  remarks.innerHTML=Array.from({length:25},(_,i)=>'<div class="lrm-mentee-row"><div class="lrm-mentee-info">Synthetic mentee '+i+'</div><textarea class="lrm-textarea">Synthetic remarks</textarea></div>').join('');
  document.getElementById('lpmContent').innerHTML='<div style="width:680px;height:1800px;background:white">Synthetic document preview</div>';
  const rect=modal.getBoundingClientRect();check(rect.top>=0&&rect.bottom<=innerHeight+1,'modal inside viewport');
  check(modal.scrollWidth<=modal.clientWidth+1,'modal no horizontal overflow');
  const header=document.querySelector('.lpm-header'),footer=document.querySelector('.lpm-left-footer'),tabs=document.querySelector('.lpm-preview-tabs');
  const old=[header,footer,tabs].map(x=>x.getBoundingClientRect().top);
  remarks.scrollTop=remarks.scrollHeight;preview.scrollTop=preview.scrollHeight;
  check(remarks.scrollTop>0,'remarks scroll');check(preview.scrollTop>0,'document scroll');
  [header,footer,tabs].forEach((x,i)=>{const r=x.getBoundingClientRect();check(r.top===old[i],'stationary controls '+i);check(r.top>=rect.top&&r.bottom<=rect.bottom+1,'visible controls '+i);});
  for(const button of footer.querySelectorAll('button')){const r=button.getBoundingClientRect();check(r.left>=rect.left&&r.right<=rect.right+1&&r.bottom<=rect.bottom,'navigation button visible');}
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
  console.log(size+': '+(fail.length?'FAIL '+fail.map(c=>c.name).join(', '):'PASS '+checks.length+' checks'));if(fail.length)throw Error('Logsheet mobile verification failed');
 }}catch(e){console.error(e.message);process.exitCode=1;}finally{server.close();}
});
