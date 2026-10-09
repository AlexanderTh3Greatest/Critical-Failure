import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGameServer,stations} from '../server.js';
test('independent clients: ready gates, host assignment, private views and three-part execution synchronize',async()=>{
 const server=createGameServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}/api/`;
 const call=async(path,body,token)=>{const r=await fetch(base+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()};};
 try{
  const host=(await call('create',{name:'Operations'})).data,crew=[host];for(let i=1;i<4;i++)crew.push((await call('join',{name:stations[i],code:host.state.code})).data);
  assert.equal((await call('start',{},host.token)).status,409);assert.equal((await call('randomize',{},crew[1].token)).status,409);
  for(let i=0;i<4;i++)assert.equal((await call('assign',{station:stations[i],player:crew[i].state.self.id},host.token)).status,200);
  for(const p of crew)await call('ready',{ready:true},p.token);
  assert.equal((await call('start',{},host.token)).status,200);await new Promise(r=>setTimeout(r,3300));
  for(let i=0;i<4;i++){const state=(await call('state',null,crew[i].token)).data;assert.equal(state.phase,'running');assert.deepEqual(Object.keys(state.stationViews),[stations[i]]);assert.equal('faults' in state,false);assert.equal('trains' in state.shared,false);}
  assert.equal((await call('station',{station:'Electrical',claim:false},crew[1].token)).status,409);
  assert.equal((await call('action',{type:'output',value:0},crew[1].token)).status,409);
  assert.equal((await call('action',{type:'pump',target:'A',value:false},crew[2].token)).status,409);
  const command=await call('communication',{stage:'command',action:{type:'pump',target:'A',value:false}},host.token);const id=command.data.commands[0].id;
  assert.equal((await call('state',null,crew[1].token)).data.commands.length,0);
  assert.equal((await call('communication',{stage:'execute',id},crew[2].token)).status,409);
  await call('communication',{stage:'repeat',id},crew[2].token);await call('communication',{stage:'confirm',id},host.token);assert.equal((await call('communication',{stage:'execute',id},crew[2].token)).status,200);
  assert.equal((await call('state',null,crew[2].token)).data.stationViews['Mechanical/Cooling'].trains.A.pump,'STOPPED');
  assert.equal((await call('state',null,crew[1].token)).data.stationViews.Electrical.equipmentLoads['P-201A'],0);
  assert.equal((await call('state',null,host.token)).data.stationViews.Operations.overallCoolantFlow,0);
  assert.equal((await call('communication',{stage:'execute',id},crew[2].token)).status,409);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
test('accelerated full shift reaches one synchronized end state for four clients',async()=>{
 const server=createGameServer({timeScale:1200,tickMs:10});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}/api/`;
 const call=async(path,body,token)=>{const r=await fetch(base+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});assert.equal(r.status,200);return r.json();};
 try{const host=await call('create',{name:'Host'}),crew=[host];for(let i=1;i<4;i++)crew.push(await call('join',{name:'Crew '+i,code:host.state.code}));for(let i=0;i<4;i++)await call('assign',{station:stations[i],player:crew[i].state.self.id},host.token);for(const p of crew)await call('ready',{ready:true},p.token);await call('start',{},host.token);
  await new Promise(r=>setTimeout(r,500));const states=await Promise.all(crew.map(p=>call('state',null,p.token)));assert.ok(['failed','complete'].includes(states[0].phase));for(const s of states){assert.equal(s.phase,states[0].phase);assert.deepEqual(s.shared,states[0].shared);assert.deepEqual(s.result,states[0].result);assert.ok(s.result.rating);}
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
test('two-player crew keeps all four stations and one private projection per assigned interface',async()=>{
 const server=createGameServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}/api/`;
 const call=async(path,body,token)=>{const r=await fetch(base+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()};};
 try{const host=(await call('create',{name:'Host'})).data,guest=(await call('join',{name:'Guest',code:host.state.code})).data;
  await call('randomize',{},host.token);for(const p of [host,guest]){const state=(await call('state',null,p.token)).data;assert.equal(state.self.stations.length,2);assert.deepEqual(Object.keys(state.stationViews).sort(),state.self.stations.sort());await call('ready',{ready:true},p.token);}
  assert.equal((await call('start',{},host.token)).status,200);
  assert.equal((await call('action',{type:'output',value:NaN},host.token)).status,409);
  const response=await fetch(base+'ready',{method:'POST',headers:{Authorization:'Bearer '+host.token,Origin:'https://untrusted.example','Content-Type':'application/json'},body:'{"ready":true}'});assert.equal(response.status,403);
  assert.equal((await fetch(base+'../health')).status,200);
  const landing=await (await fetch(base+'../')).text();assert.ok(landing.includes('Created &amp; Designed by Alex Noblin'));assert.ok(landing.includes('Alexander “Alex” Noblin'));assert.ok(landing.includes('Developed with AI-assisted tools using ChatGPT.'));
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
