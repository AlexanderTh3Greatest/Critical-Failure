import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGameServer} from '../server.js';

test('four independent clients: capacity, assignments, privacy, reconnect and authority',async()=>{
 const server=createGameServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base=`http://127.0.0.1:${server.address().port}/api/`;
 const call=async(path,body,token)=>{const r=await fetch(base+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()};};
 try {
  const host=(await call('create',{name:'Alex'})).data;
  const crew=[host];for(let i=1;i<4;i++)crew.push((await call('join',{name:'Crew '+i,code:host.state.code})).data);
  assert.equal((await call('join',{name:'Extra',code:host.state.code})).status,409);
  assert.equal((await call('state',null,'forged')).status,401);
  assert.equal((await call('station',{station:'Electrical',claim:true},host.token)).status,200);
  assert.equal((await call('station',{station:'Operations',claim:true},host.token)).status,200);
  assert.equal((await call('station',{station:'Electrical',claim:true},crew[1].token)).status,409);
  assert.deepEqual(Object.keys((await call('state',null,crew[1].token)).data.stationViews),[]);
  assert.deepEqual(Object.keys((await call('state',null,host.token)).data.stationViews).sort(),['Electrical','Operations']);
  assert.equal((await call('station',{station:'fake',claim:true},host.token)).status,400);
  const abort=new AbortController();const stream=await fetch(base+'events',{headers:{Authorization:'Bearer '+host.token},signal:abort.signal});const reader=stream.body.getReader();const frame=new TextDecoder().decode((await reader.read()).value);assert.match(frame,/data: /);assert.equal(JSON.parse(frame.split('data: ')[1].trim()).self.id,host.state.self.id);abort.abort();await reader.cancel().catch(()=>{});
  const restored=(await call('state',null,host.token)).data;assert.equal(restored.self.id,host.state.self.id);assert.equal(restored.self.stations.length,2);
  const secondAbort=new AbortController();const reconnected=await fetch(base+'events',{headers:{Authorization:'Bearer '+host.token},signal:secondAbort.signal});const secondReader=reconnected.body.getReader();assert.match(new TextDecoder().decode((await secondReader.read()).value),/Electrical/);secondAbort.abort();await secondReader.cancel().catch(()=>{});
  assert.equal((await call('station',{station:'Electrical',claim:false},host.token)).status,200);
  assert.equal((await call('station',{station:'Electrical',claim:true},crew[1].token)).status,200);
 } finally {server.closeAllConnections();await new Promise(r=>server.close(r));}
});
