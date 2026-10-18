const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('MENTOR/JS/availability.js','utf8');
const functionSource=source.slice(source.indexOf('function timeAgo(dt)'));
test('RequestedAt relative time is independent of browser timezone',()=>{
 const original=process.env.TZ;
 try {
  for(const tz of ['UTC','Asia/Manila','America/Los_Angeles','Europe/London']) {
   process.env.TZ=tz;
   const now=Date.parse('2026-10-12T13:56:55Z');
   const context=vm.createContext({Date:class extends Date {static now(){return now;}}});
   vm.runInContext(functionSource,context);
   for(const [value,expected] of [
    ['2026-10-12T13:56:55','Just now'],
    ['2026-10-12T13:56:55.243','Just now'],
    ['2026-10-12T13:56:55Z','Just now'],
    ['2026-10-12T21:56:55+08:00','Just now'],
    ['2026-10-12T06:56:55-07:00','Just now'],
    ['2026-10-12T21:56:55+0800','Just now'],
    ['2026-10-12T13:56:10','Just now'],
    ['2026-10-12T13:51:55','5m ago'],
    ['2026-10-12T11:56:55','2h ago'],
    ['2026-10-11T13:56:55','1d ago'],
    ['2026-10-05T13:56:55','7d ago'],
    ['2025-10-12T13:56:55','365d ago'],
    ['2026-10-12T14:00:00','Just now'],
    ['',''],[null,''],['not-a-date','']
   ])assert.equal(context.timeAgo(value),expected,`${tz}: ${value}`);
  }
 } finally {if(original===undefined)delete process.env.TZ;else process.env.TZ=original;}
});
