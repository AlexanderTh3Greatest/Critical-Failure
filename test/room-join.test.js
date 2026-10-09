import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGameServer} from '../server.js';
import {normalizeRoomCode} from '../public/room-code.js';

// Each client owns its own token and SSE connection. No shared cookie/storage.
function independentClient(base){let credential;return {
 async request(path,body,authorization=credential){const response=await fetch(base+'/api/'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(authorization?{Authorization:'Bearer '+authorization}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,data:await response.json(),instance:response.headers.get('x-cf-instance')};},
 async enter(path,body){const r=await this.request(path,body);assert.equal(r.status,200,JSON.stringify(r.data));credential=r.data.token;return r;},
 async events(){const abort=new AbortController();const response=await fetch(base+'/api/events',{headers:{Authorization:'Bearer '+credential},signal:abort.signal});assert.equal(response.status,200);const reader=response.body.getReader(),decoder=new TextDecoder();let pending='';return {close:()=>abort.abort(),async until(predicate){const timeout=setTimeout(()=>abort.abort(),3000);try{while(true){let end;while((end=pending.indexOf('\n\n'))>=0){const frame=pending.slice(0,end);pending=pending.slice(end+2);if(frame.startsWith('data: ')){const state=JSON.parse(frame.slice(6));if(predicate(state))return state;}}const part=await reader.read();assert.equal(part.done,false);pending+=decoder.decode(part.value,{stream:true});}}finally{clearTimeout(timeout);}}};}
};}
async function start(options={}){const server=createGameServer({logger:()=>{},...options});await new Promise(r=>server.listen(0,'127.0.0.1',r));return {server,base:`http://127.0.0.1:${server.address().port}`,async close(){server.closeAllConnections();await new Promise(r=>server.close(r));await server.drain();}};}
function sharedStore(){let state=null,queue=Promise.resolve();return {transaction(work){const task=queue.then(async()=>{const output=await work(structuredClone(state));state=structuredClone(output.snapshot);return output.result;});queue=task.catch(()=>{});return task;}};}

test('REGRESSION: independent A creates; B joins; same authoritative room and both SSE rosters synchronize',async()=>{
 const logs=[],app=await start({logger:event=>logs.push(event)}),a=independentClient(app.base),b=independentClient(app.base);let eventsA,eventsB;
 try{
  const host=await a.enter('create',{name:'Physical device A'});eventsA=await a.events();await eventsA.until(s=>s.players.length===1);
  const guest=await b.enter('join',{name:'Physical device B',code:host.data.state.code});
  assert.notEqual(host.data.token,guest.data.token);assert.notEqual(host.data.state.self.id,guest.data.state.self.id);assert.equal(host.instance,guest.instance);assert.equal(host.data.state.code,guest.data.state.code);
  eventsB=await b.events();for(const events of [eventsA,eventsB]){const state=await events.until(s=>s.players.length===2&&s.players.every(p=>p.connected));assert.deepEqual(state.players.map(p=>p.name),['Physical device A','Physical device B']);assert.deepEqual(state.stationViews,{});}
  await b.request('ready',{ready:true});await eventsA.until(s=>s.players.find(p=>p.id===guest.data.state.self.id).ready);await eventsB.until(s=>s.self.ready);
  assert.ok(logs.some(e=>e.event==='room_join_attempt'&&e.found===true&&e.code===host.data.state.code));assert.ok(logs.every(e=>!('token' in e)&&!('name' in e)));
 }finally{eventsA?.close();eventsB?.close();await app.close();}
});
test('room-code normalization handles case, spacing, prefixes, Unicode dashes, and prefix-looking hex',async()=>{
 for(const value of ['CF-4821AB','cf-4821ab',' CF-4821AB ','cf 4821ab','CF–4821AB','CF‑4821AB','4821ab','CF4821AB','ＣＦ－４８２１ＡＢ'])assert.equal(normalizeRoomCode(value),'CF-4821AB');
 assert.equal(normalizeRoomCode('CFAB12'),'CF-CFAB12');for(const invalid of ['CF-01','CF-4821AG','CF-4821ABx','https://example.com',''])assert.equal(normalizeRoomCode(invalid),null);
 const app=await start();try{for(const format of [code=>` ${code.toLowerCase()} `,code=>code.replace('-','–'),code=>code.slice(3),code=>code.replace('-',' ')]){const a=independentClient(app.base),b=independentClient(app.base),host=await a.enter('create',{name:'A'});const guest=await b.enter('join',{name:'B',code:format(host.data.state.code)});assert.equal(guest.data.state.code,host.data.state.code);}}finally{await app.close();}
});
test('new-player join ignores stale/foreign session credentials and does not scope room visibility',async()=>{
 const app=await start();try{const a=independentClient(app.base),b=independentClient(app.base),host=await a.enter('create',{name:'Host'});const joined=await b.request('join',{name:'Independent guest',code:host.data.state.code},'obsolete-browser-session');assert.equal(joined.status,200);assert.notEqual(joined.data.token,host.data.token);assert.equal(joined.data.state.self.name,'Independent guest');assert.equal((await a.request('state')).data.self.name,'Host');}finally{await app.close();}
});
test('room and session survive application restart; separate instances use the same authoritative store',async()=>{
 const store=sharedStore(),first=await start({store});let second,eventsA,eventsB;
 try{
  const hostClient=independentClient(first.base),host=await hostClient.enter('create',{name:'Before restart'});await first.close();second=await start({store});
  const guestClient=independentClient(second.base),guest=await guestClient.enter('join',{name:'After restart',code:host.data.state.code});assert.equal(guest.data.state.players.length,2);assert.notEqual(host.instance,guest.instance);
  const restored=await guestClient.request('state',undefined,host.data.token);assert.equal(restored.status,200);assert.equal(restored.data.self.id,host.data.state.self.id);
  const third=await start({store});try{const crossClient=independentClient(third.base);const cross=await crossClient.enter('join',{name:'Other instance',code:host.data.state.code});assert.equal(cross.data.state.players.length,3);assert.notEqual(cross.instance,guest.instance);
   eventsA=await guestClient.events();eventsB=await crossClient.events();await crossClient.request('ready',{ready:true});for(const stream of [eventsA,eventsB])await stream.until(s=>s.players.find(p=>p.id===cross.data.state.self.id).ready);
  }finally{eventsA?.close();eventsB?.close();await third.close();}
 }finally{if(first.server.listening)await first.close();await second?.close();}
});
test('shared storage failure fails closed; never acknowledges an ephemeral replacement room',async()=>{
 const app=await start({store:{transaction:async()=>{throw Error('storage offline');}}});try{assert.equal((await independentClient(app.base).request('create',{name:'Host'})).status,503);}finally{await app.close();}
});
