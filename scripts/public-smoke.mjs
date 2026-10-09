import assert from 'node:assert/strict';
const base=new URL('/api/',process.argv[2]||'http://localhost:3000');
const stations=['Operations','Electrical','Mechanical/Cooling','Instrumentation & Controls'];
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function call(path,body,token,expected=200){const r=await fetch(new URL(path,base),{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});const data=await r.json();assert.equal(r.status,expected,`${path}: ${JSON.stringify(data)}`);return data;}
const streams=[];
async function stream(player){const abort=new AbortController();streams.push(abort);const response=await fetch(new URL('events',base),{headers:{Authorization:'Bearer '+player.token},signal:abort.signal});assert.equal(response.status,200);const reader=response.body.getReader(),decoder=new TextDecoder();let pending='';
 const first=(async()=>{while(true){const part=await reader.read();if(part.done)throw Error('Event stream closed');pending+=decoder.decode(part.value,{stream:true});const end=pending.indexOf('\n\n');if(end>=0){const frame=pending.slice(0,end);pending=pending.slice(end+2);if(frame.startsWith('data: '))return JSON.parse(frame.slice(6));}}})();
 const state=await Promise.race([first,new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error('Stream timeout')),15000);timer.unref();})]);assert.equal(state.self.id,player.state.self.id);return {abort,reader,state};
}
try{
 assert.equal((await fetch(new URL('../health',base))).status,200);
 const host=await call('create',{name:'SMOKE Operations'}),crew=[host];for(let i=1;i<4;i++)crew.push(await call('join',{name:'SMOKE '+stations[i],code:host.state.code}));
 for(let i=0;i<4;i++)await call('assign',{station:stations[i],player:crew[i].state.self.id},host.token);
 for(const p of crew)await call('ready',{ready:true},p.token);
 for(const p of crew)await stream(p);
 await call('start',{},host.token);await wait(3500);
 for(let i=0;i<4;i++){const state=await call('state',null,crew[i].token);assert.deepEqual(Object.keys(state.stationViews),[stations[i]]);assert.equal(state.phase,'running');assert.equal('faults' in state,false);}
 await call('action',{type:'output',value:0},crew[1].token,409);await call('action',{type:'pump',target:'A',value:false},crew[2].token,409);
 console.log('Four hosted clients synchronized; station privacy and action authorization verified. Waiting for FT-201A.');
 let ic;const deadline=Date.now()+40000;do{ic=await call('state',null,crew[3].token);if(ic.stationViews[stations[3]].disagreement.FT)break;await wait(1000);}while(Date.now()<deadline);
 assert.equal(ic.stationViews[stations[3]].channels.FT.A,4);assert.equal(ic.stationViews[stations[3]].channels.FT.B,100);assert.equal(ic.shared.facilityIntegrity,100);
 const mechanical=await call('state',null,crew[2].token);assert.equal(mechanical.stationViews[stations[2]].trains.A.flow,4);assert.equal((await call('state',null,crew[1].token)).stationViews.Electrical.equipmentLoads['P-201A'],42);
 const before=(await call('state',null,host.token)).stationViews.Operations.reactorTemperature;
 const command=await call('communication',{stage:'command',action:{type:'pump',target:'A',value:false}},host.token),id=command.commands.at(-1).id;
 await call('communication',{stage:'execute',id},crew[2].token,409);await call('communication',{stage:'repeat',id},crew[2].token);await call('communication',{stage:'confirm',id},host.token);await call('communication',{stage:'execute',id},crew[2].token);await call('communication',{stage:'execute',id},crew[2].token,409);await wait(2000);
 const after=await call('state',null,host.token);assert.ok(after.shared.facilityIntegrity<100);assert.ok(after.stationViews.Operations.reactorTemperature>before);assert.equal((await call('state',null,crew[3].token)).stationViews[stations[3]].channels.FT.B,0);
 await call('action',{type:'standby',target:'B'},crew[2].token);await call('action',{type:'instrument',target:'FT',value:'B'},crew[3].token);
 assert.equal((await call('state',null,crew[2].token)).stationViews[stations[2]].trains.B.flow,100);
 for(const abort of streams)abort.abort();await wait(250);const reconnected=await stream(crew[2]);assert.equal(reconnected.state.commands.at(-1).stage,'ACTION');assert.equal(reconnected.state.self.stations[0],stations[2]);
 console.log(`PASS: hosted FT-201A false indication, player-created real cooling loss, standby recovery, closed-loop communications, replay rejection and reconnect. Room ${host.state.code}.`);
}finally{for(const abort of streams)abort.abort();}
