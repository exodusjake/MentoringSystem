const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');
function setup(portal){const nodes={};const c=vm.createContext({document:{addEventListener(){},getElementById(id){return nodes[id]??={innerHTML:''}}},window:{addEventListener(){}},console,Date,Intl});vm.runInContext(fs.readFileSync('dashboard-sessions.js','utf8'),c);vm.runInContext(fs.readFileSync(`${portal}/JS/${portal.toLowerCase()}-dashboard.js`,'utf8'),c);return {c,nodes};}
const cancelled={sessionID:8,sessionStatus:'Cancelled',sessionDate:'2026-09-26T10:00:00',cancelledAt:'2026-09-28T01:00:00Z',slotName:'Before Prelims',sectionCode:'BSIT',topic:'Before Prelims',isMakeup:false};
test('mentor recent panel includes cancelled sessions, upcoming excludes them',()=>{const {c,nodes}=setup('MENTOR');c.renderSessionCards([cancelled]);assert.match(nodes.recentSessionsList.innerHTML,/Cancelled/);assert.doesNotMatch(nodes.upcomingSessionsList.innerHTML,/Cancelled/);});
test('mentee sees cancelled regular and own makeup sessions, not unrelated makeup',()=>{const {c,nodes}=setup('MENTEE');c.renderUpcomingSessions([cancelled]);assert.match(nodes.recentSessionsList.innerHTML,/Cancelled/);assert.doesNotMatch(nodes.upcomingSessionsList.innerHTML,/Cancelled/);const makeup={...cancelled,isMakeup:true};c.renderUpcomingSessions([makeup],{});assert.doesNotMatch(nodes.recentSessionsList.innerHTML,/Cancelled/);c.renderUpcomingSessions([makeup],{8:null});assert.match(nodes.recentSessionsList.innerHTML,/Cancelled/);assert.doesNotMatch(nodes.recentSessionsList.innerHTML,/>Absent</);});
test('shared grouping separates future, past, ongoing and closed sessions',()=>{
 const c=vm.createContext({Date,Intl});vm.runInContext(fs.readFileSync('dashboard-sessions.js','utf8'),c);
 const now=new Date('2026-10-04T04:00:00Z');
 const s={sessionStatus:'Scheduled',sessionDate:'2026-10-04T13:00:00',slotName:'Before Prelims',schoolYear:'2026',semester:'1'};
 assert.equal(c.dashboardSessionState(s,[],now),'Upcoming');
 assert.equal(c.dashboardSessionState({...s,sessionDate:'2026-10-04T11:00:00'},[],now),'Past Scheduled');
 assert.equal(c.dashboardSessionState({...s,sessionStatus:'Completed'},[],now),'In Progress');
 const events=[{isPublished:true,eventType:'Session Schedule',slotName:s.slotName,schoolYear:s.schoolYear,semester:s.semester,startDate:'2026-09-01',endDate:'2026-10-03'}];
 assert.equal(c.dashboardSessionState(s,events,now),'Closed');
 assert.equal(c.dashboardSessionState({...s,sessionStatus:'Completed',timeEnd:'2026-10-03'},events,now),'Completed');
});

test('mentor progress failure cannot fabricate progress from session history',async()=>{
 const {c,nodes}=setup('MENTOR');
 c.apiRequest=async path=>{
  if(path.startsWith('MonitorActivities'))throw new Error('timeout');
  if(path==='CalendarEvents')return [];
  return {sessions:[{...cancelled,sessionStatus:'Completed',timeEnd:'2026-09-26T11:00:00'}]};
 };
 await c.loadSessionStats(1);
 assert.equal(nodes.statCompleted.textContent,'\u2014');
 assert.equal(nodes.statAttRate.textContent,'\u2014');
 assert.match(nodes.statCompleted.title,/unavailable/);
 assert.match(nodes.recentSessionsList.innerHTML,/Completed/);
});
test('mentor retains authoritative checkpoint totals on successful load',async()=>{
 const {c,nodes}=setup('MENTOR');
 c.apiRequest=async path=>path.startsWith('MonitorActivities')?{completedSessions:2,requiredSessions:12,progressPercent:16.7}:path==='CalendarEvents'?[]:{sessions:[]};
 c.clampPercent=n=>Math.max(0,Math.min(100,n));
 await c.loadSessionStats(1);
 assert.equal(nodes.statCompleted.textContent,'2/12');
 assert.equal(nodes.statAttRate.textContent,'17%');
});
