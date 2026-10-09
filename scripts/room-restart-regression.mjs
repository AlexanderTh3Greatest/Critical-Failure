import assert from 'node:assert/strict';
const base=new URL('/api/',process.argv[2]||'http://localhost:3000');
async function call(path,body,token){const r=await fetch(new URL(path,base),{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(10000)});return {status:r.status,data:await r.json()};}
const host=await call('create',{name:'RESTART A'});assert.equal(host.status,200);assert.equal(host.data.state.authority.storage,'shared');
console.log(`READY: room ${host.data.state.code}, instance ${host.data.state.authority.instanceId}. Redeploy this application without changing storage.`);
const deadline=Date.now()+240000;let restored;
while(Date.now()<deadline){await new Promise(r=>setTimeout(r,2000));try{const r=await call('state',null,host.data.token);if(r.status===200&&r.data.authority.instanceId!==host.data.state.authority.instanceId){restored=r.data;break;}}catch{}}
assert.ok(restored,'No replacement application instance observed');assert.equal(restored.self.id,host.data.state.self.id);assert.equal(restored.code,host.data.state.code);
const guest=await call('join',{name:'RESTART B',code:restored.code});assert.equal(guest.status,200);assert.notEqual(guest.data.token,host.data.token);assert.equal(guest.data.state.players.length,2);
const final=await call('state',null,host.data.token);assert.equal(final.status,200);assert.equal(final.data.players.length,2);
console.log(`PASS: public application restart preserved room ${restored.code}, host session and identity; independent guest joined replacement instance ${restored.authority.instanceId}.`);
