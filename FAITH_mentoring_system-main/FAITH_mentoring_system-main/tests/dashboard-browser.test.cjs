// Local real-browser harness: actual dashboard HTML, scripts and Chart.js;
// authentication/bootstrap scripts replaced with synthetic read-only responses.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const os = require('node:os');
const { spawn } = require('node:child_process');
const root = path.resolve(process.env.ASTRA_DASHBOARD_ROOT || path.join(__dirname, '..'));
const browser = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const cases = ['failure', 'empty', 'pending', 'stats-failure'];
const results = [];
const manualPreview = process.argv.includes('--preview');
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/case') {
    const portal = url.searchParams.get('portal');
    const scenario = url.searchParams.get('scenario');
    if (!['ADMIN_', 'HEAD'].includes(portal) || !cases.includes(scenario)) { res.writeHead(400).end(); return; }
    const head = portal === 'HEAD';
    let html = fs.readFileSync(path.join(root, portal, 'HTML', head ? 'head-dashboard.html' : 'dashboard.html'), 'utf8');
    html = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<link\b[^>]*href=["']https?:[^>]*>/gi, '')
      .replace(/(href|src)=["'](?:\.\.\/)+([^"']+)["']/g, '$1="/$2"');
    const testScript = `
      const checks = []; const assert = (ok, name) => { checks.push({name, pass:!!ok}); };
      const head = ${head}; const scenario = ${JSON.stringify(scenario)};
      const fixture = { completedSessions:1, requiredSessions:6, completenessPercent:16.7,
        progressStatus:'Pending', overallPercent:null, school:'BSIT' };
      const before = JSON.stringify(fixture);
      window.getSession = () => ({user:{userID:0}});
      window.apiRequest = async endpoint => {
        if (endpoint === 'MonitorActivities') {
          if (scenario === 'failure') throw new Error('Synthetic API Timeout / cancellation');
          return {mentors:scenario === 'empty' ? [] : [fixture]};
        }
        if (endpoint === 'Users/stats') {
          if (scenario === 'stats-failure') throw new Error('Synthetic stats failure');
          return {totalMentors:scenario === 'empty' ? 0 : 1,totalMentees:2,activeMentees:2,
            assigned:2,menteeStatusDistribution:{Excellent:2}};
        }
        if (endpoint === 'Users' || endpoint.startsWith('Activities')) return [];
        return {SchoolYear:'synthetic',Semester:'1st Semester'};
      };
      const originalAdd = document.addEventListener.bind(document);
      document.addEventListener = (type, fn, ...args) => {
        if(type !== 'DOMContentLoaded') originalAdd(type, fn, ...args);
      };
    `;
    const verify = `
      document.addEventListener = originalAdd;
      loadDashboard().then(() => {
        const text = id => document.getElementById(id)?.textContent || '';
        const desc = text(head ? 'progressChartDesc' : 'chartDesc');
        if (scenario === 'failure') {
          assert(desc.includes('Unavailable'), 'monitoring unavailable');
          assert(text('top3List').includes('Unavailable'), 'ranking unavailable');
          if(head) assert(text('totalMentors') === '\u2014', 'mentor total unavailable');
          assert(text(head ? 'engActive' : 'engAssignedActive') === '2', 'successful engagement preserved');
        } else if(scenario === 'empty') {
          if(head) assert(text('totalMentors') === '0', 'legitimate zero mentors');
          else assert(Chart.getChart(document.getElementById('sessionChart')).data.datasets[0].data.every(n=>n===0), 'legitimate zero chart');
          assert(!desc.includes('Unavailable'), 'empty response available');
        } else {
          assert(desc.includes('1 Pending'), 'Pending count separate');
          if(head) { assert(text('mNotStarted')==='0' && text('mExcellent')==='0', 'Pending not finalized');
            assert(text('schoolBreakdown').includes('1 Pending'), 'school Pending visible'); }
          else { const data=Chart.getChart(document.getElementById('sessionChart')).data.datasets[0].data;
            assert(data[4]===1 && data.slice(0,4).every(n=>n===0), 'Pending chart separate'); }
          if(scenario==='stats-failure') assert(text(head ? 'engActive' : 'engAssignedActive') === '\u2014', 'stats unavailable independently');
        }
        assert(JSON.stringify(fixture) === before, '1/6 progress payload unchanged');
        if (head) {
          const card=document.querySelector('.hd-performance-card');
          const grid=document.querySelector('.hd-performance-stats');
          const saved=card.style.cssText;
          for (const [width,columns] of [[700,4],[420,2],[260,1]]) {
            card.style.width=width+'px'; card.style.maxWidth='none';
            const tracks=getComputedStyle(grid).gridTemplateColumns.split(' ').length;
            assert(tracks===columns, 'performance grid '+columns+' columns');
            assert(grid.scrollWidth<=grid.clientWidth+1, 'performance grid no overflow at '+width);
          }
          card.style.cssText=saved;
          if(scenario !== 'failure') {
            const table=document.getElementById('schoolBreakdown');
            const savedTable=table.style.cssText;
            table.style.width='280px';
            assert(table.scrollWidth>table.clientWidth, 'school table overflow contained');
            table.scrollLeft=100;
            assert(table.scrollLeft>0, 'school table scrolls horizontally');
            assert(getComputedStyle(table.querySelector('.hd-school-head')).display==='grid', 'school headers stay visible');
            table.style.cssText=savedTable;
          }
        }
        const output=document.createElement('pre'); output.id='browser-results';
        output.textContent=JSON.stringify(checks); document.body.appendChild(output);
      }).catch(() => { const output=document.createElement('pre');output.id='browser-results';
        output.textContent=JSON.stringify([{name:'harness execution',pass:false}]);document.body.appendChild(output); });
    `;
    html = html.replace('</body>', `<script>${testScript}</script><script src="/ADMIN_/JS/chart.umd.min.js"></script><script src="/${portal}/JS/dashboard.js"></script><script>${manualPreview ? 'document.addEventListener = originalAdd; loadDashboard();' : verify}</script></body>`);
    res.setHeader('Content-Security-Policy', "connect-src 'none'; form-action 'none'");
    res.setHeader('Content-Type', 'text/html'); res.end(html); return;
  }
  const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '');
  const file = path.resolve(root, relative);
  // Serve only dashboard static dependencies. No application API or configuration.
  if (!file.startsWith(root + path.sep) || !/^(ADMIN_|HEAD|IMAGES)\//.test(relative) || !/\.(css|js|png|jpg|svg|webp|woff2?)$/i.test(file)) { res.writeHead(404).end(); return; }
  try { res.setHeader('Content-Type', file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : 'application/octet-stream'); res.end(fs.readFileSync(file)); }
  catch { res.writeHead(404).end(); }
});
server.on('error', error => { console.error('Local preview failed: '+error.code); process.exitCode=1; });
server.listen(manualPreview ? 8080 : 0, '127.0.0.1', async () => {
  if (manualPreview) {
    console.log('LOCAL VISUAL PREVIEW: http://127.0.0.1:8080/case?portal=ADMIN_&scenario=failure');
    console.log('LOCAL VISUAL PREVIEW: http://127.0.0.1:8080/case?portal=HEAD&scenario=failure');
    console.log('Mock API data only; outbound API requests blocked. Ctrl+C stops preview.');
    return;
  }
  try {
    for(const portal of ['ADMIN_', 'HEAD']) for(const scenario of cases) {
      const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'astra-dashboard-browser-'));
      const args = ['--headless=new', '--disable-gpu', '--no-first-run', '--disable-background-networking',
        '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1', '--dump-dom', '--virtual-time-budget=3000',
        '--user-data-dir='+profile, `http://127.0.0.1:${server.address().port}/case?portal=${portal}&scenario=${scenario}`];
      const output = await new Promise((resolve,reject) => {
        const child=spawn(browser,args); let out=''; child.stdout.on('data',d=>out+=d);
        child.stderr.resume(); child.on('error',reject);
        const timer=setTimeout(()=>{child.kill();reject(Error('browser timeout'));},20000);
        child.on('close',code=>{clearTimeout(timer);code===0?resolve(out):reject(Error('browser exit '+code));});
      });
      const match=output.match(/<pre id="browser-results">([^<]+)<\/pre>/);
      if(!match) throw Error(`${portal}/${scenario}: no browser verification output`);
      const checks=JSON.parse(match[1].replace(/&quot;/g,'"').replace(/&amp;/g,'&'));
      results.push({portal,scenario,checks});
      console.log(`${portal}/${scenario}: ${checks.every(c=>c.pass)?'PASS':'FAIL'} (${checks.length} checks)`);
    }
    const failed=results.flatMap(r=>r.checks.filter(c=>!c.pass).map(c=>`${r.portal}/${r.scenario}: ${c.name}`));
    if(failed.length) throw Error(failed.join('\n'));
    console.log('REAL BROWSER VERIFIED: 8 scenarios; local synthetic APIs only');
  } catch(error) { console.error(error.message);process.exitCode=1; }
  finally { server.close(); }
});
