const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');
for(const portal of ['ADMIN_','HEAD']) test(portal+' chart uses overall score and ranking order, including pending evaluations',()=>{
 const nodes={};let chart;const c=vm.createContext({console,document:{addEventListener(){},getElementById(id){return nodes[id]??={style:{}};}},window:{addEventListener(){}},Chart:function(_,config){chart=config;this.destroy=()=>{};}});
 vm.runInContext(fs.readFileSync(portal+'/JS/evaluation-ratings.js','utf8'),c);
 vm.runInContext("allMentors=[{mentorID:1,firstName:'Pending',lastName:'Mentor',overallPercent:29.2,evaluationRatingPercent:null},{mentorID:2,firstName:'Rated',lastName:'Mentor',overallPercent:20,evaluationRatingPercent:40},{mentorID:3,firstName:'Zero',lastName:'Mentor',overallPercent:0,evaluationRatingPercent:0}];buildRankMap();renderChart()",c);
 assert.deepEqual(Array.from(chart.data.datasets[0].data),[29.2,20,0]);
 assert.equal(chart.data.labels[0],'Pending Mentor');
 assert.match(chart.options.plugins.tooltip.callbacks.label({dataIndex:0}),/29.2%.*Evaluation pending/);
 assert.doesNotMatch(chart.options.plugins.tooltip.callbacks.label({dataIndex:2}),/pending/);
 assert.equal(chart.options.scales.x.max,100);
});
