const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function client(fetchImpl=async()=>({ok:true,status:200,text:async()=>'{"saved":true}'})) {
  let calls=0;
  const c=vm.createContext({FormData,AbortController,TypeError,console,setTimeout,clearTimeout,
    CONFIG:{getUrl:e=>e},localStorage:{getItem:()=>null},
    window:{location:{pathname:'/'},addEventListener(){}},
    document:{createElement:()=>({}),head:{appendChild(){}}},
    fetch:async(...args)=>{calls++;return fetchImpl(...args);}});
  vm.runInContext(fs.readFileSync('apiClient.js','utf8'),c);
  return {c,calls:()=>calls};
}
for(const endpoint of ['ProofOfSession/upload','EvaluationSubmissions/upload']) {
  test(`${endpoint}: phone images with missing MIME type are accepted by extension`,()=>{
    const {c}=client();
    assert.equal(c.validateUploadFile({name:'IMG_1234.JPG',type:'',size:1024},endpoint),null);
    assert.equal(c.validateUploadFile({name:'Screenshot.PNG',type:'image/png',size:20*1024*1024},endpoint),null);
    assert.match(c.validateUploadFile({name:'IMG.HEIC',size:100},endpoint),/JPG\/PNG/);
    assert.match(c.validateUploadFile({name:'bad.exe',size:100},endpoint),/not supported/);
  });
  test(`${endpoint}: oversized files are rejected before any request`,async()=>{
    const {c,calls}=client();const data=new FormData();
    data.append('file',new Blob([new Uint8Array(20*1024*1024+1)]),'photo.jpg');
    await assert.rejects(c.apiRequest(endpoint,'POST',data),/Maximum size is 20 MB/);
    assert.equal(calls(),0);
  });
}
test('signature retains its separate PNG and 5 MB limits',()=>{
  const {c}=client();
  assert.equal(c.validateUploadFile({name:'sign.png',size:5*1024*1024},'ESignature/1'),null);
  assert.match(c.validateUploadFile({name:'sign.png',size:5*1024*1024+1},'ESignature/1'),/5 MB/);
  assert.match(c.validateUploadFile({name:'sign.jpg',size:100},'ESignature/1'),/PNG/);
});
test('PDF is allowed for session proof, not evaluation screenshot',()=>{
  const {c}=client();const file={name:'proof.pdf',size:100};
  assert.equal(c.validateUploadFile(file,'ProofOfSession/upload'),null);
  assert.match(c.validateUploadFile(file,'EvaluationSubmissions/upload'),/not supported/);
});
for(const kind of ['413','network','server']) test(`upload explains ${kind} failures`,async()=>{
  const {c}=client(async()=>{
    if(kind==='network')throw new TypeError('Failed to fetch');
    return {ok:false,status:kind==='413'?413:400,json:async()=>({message:'File type not allowed.'})};
  });
  const data=new FormData();data.append('file',new Blob(['test']),'photo.jpg');
  await assert.rejects(c.apiRequest('EvaluationSubmissions/upload','POST',data),
    kind==='413'?/too large/:kind==='network'?/internet connection/:/File type not allowed/);
});
