// Session window dates are inclusive Philippine calendar dates.
function checkpointToday() {
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 const get=t=>parts.find(p=>p.type===t).value;
 return get('year')+'-'+get('month')+'-'+get('day');
}
function checkpointWindow(events,name,schoolYear,semester,today=checkpointToday()) {
 if(name==='Mentoring Assembly' && semester==='2nd Semester') return {disabled:true,label:'N/A'};
 if(!Array.isArray(events)) return {disabled:true,label:'Calendar unavailable'};
 const e=events.find(e=>e.isPublished === true && e.eventType==='Session Schedule' && e.slotName===name && e.schoolYear===schoolYear && e.semester===semester);
 if(!e) return {disabled:true,label:'Not scheduled'};
 const start=String(e.startDate).slice(0,10),end=String(e.endDate||e.startDate).slice(0,10);
 return {start,end,disabled:today>end,label:today>end?'Closed':'',upcoming:today<start};
}
function checkpointDateAllowed(w,date,today=checkpointToday()) {
 return !w.disabled && date>=today && date>=w.start && date<=w.end;
}

export { checkpointToday, checkpointWindow, checkpointDateAllowed };
