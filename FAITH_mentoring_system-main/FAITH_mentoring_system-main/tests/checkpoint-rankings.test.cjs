const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
for(const portal of ['ADMIN_','HEAD']) test(portal+' rankings show Done while report keeps mentee counts',()=>{
 const nodes={}; const document={addEventListener(){},getElementById(id){return nodes[id]??=( {value:'',innerHTML:'',style:{}} );}};
 const c=vm.createContext({document,window:{addEventListener(){}},console});
 vm.runInContext(fs.readFileSync('security-utils.js','utf8'),c);
 vm.runInContext(fs.readFileSync(portal+'/JS/evaluation-ratings.js','utf8'),c);
 vm.runInContext("allMentors=[{mentorID:1,firstName:'Test',lastName:'Mentor',slotAttendance:'Before Prelims:3',completedSlots:['Before Prelims']}]; renderTable()",c);
 assert.ok(nodes.tableBody.innerHTML.includes('>Done</td>'));
 assert.ok(!nodes.tableBody.innerHTML.includes('>3</td>'));
 assert.equal(vm.runInContext('programReportRow(allMentors[0], MENTORING_SLOTS).sum',c),3);
});
for(const portal of ['ADMIN_','HEAD']) test(`${portal} program report summary follows the search-filtered totals`,()=>{
 const nodes={}; const document={addEventListener(){},getElementById(id){return nodes[id]??=( {value:'',innerHTML:'',textContent:'',style:{}} );}};
 const c=vm.createContext({document,window:{addEventListener(){}},console});
 vm.runInContext(fs.readFileSync('security-utils.js','utf8'),c);
 vm.runInContext(fs.readFileSync(`${portal}/JS/evaluation-ratings.js`,'utf8'),c);
 vm.runInContext("allMentors=[{firstName:'Ana',lastName:'Reyes',departmentName:'CCIT',slotAttendance:'Mentoring Assembly:2, Before Prelims:1'},{firstName:'Ben',lastName:'Santos',departmentName:'CHC',slotAttendance:'Before Prelims:0'}];renderProgramReportTable()",c);
 assert.equal(nodes.prSummaryAttendance.textContent,'3');
 assert.equal(nodes.prSummaryMentors.textContent,'1');
 assert.equal(nodes.prSummaryAmount.textContent,'₱150.00');
 nodes.prSearchInput.value='Ben';
 vm.runInContext('renderProgramReportTable()',c);
 assert.equal(nodes.prSummaryAttendance.textContent,'0');
 assert.equal(nodes.prSummaryMentors.textContent,'0');
 assert.equal(nodes.prSummaryAmount.textContent,'₱0.00');
});
