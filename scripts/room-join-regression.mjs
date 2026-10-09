import assert from 'node:assert/strict';
const base=new URL('/api/',process.argv[2]||'http://localhost:3000');
const legacy=process.argv.includes('--expect-old');
function client(){let token;return {
 async call(path,body){const response=await fetch(new URL(path,base),{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});const data=await response.json();return {status:response.status,data,instance:response.headers.get('x-cf-instance')};},
 async enter(path,body){const r=await this.call(path,body);assert.equal(r.status,200,JSON.stringify(r.data));token=r.data.token;return r;},
 async events(){const abort=new AbortController();const response=await fetch(new URL('events',base),{headers:{Authorization:'Bearer '+token},signal:abort.signal});assert.equal(response.status,200);const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';return {close:()=>abort.abort(),async until(predicate){const timeout=setTimeout(()=>abort.abort(),15000);try{while(true){let end;while((end=buffer.indexOf('\n\n'))>=0){const frame=buffer.slice(0,end);buffer=buffer.slice(end+2);if(frame.startsWith('data: ')){const state=JSON.parse(frame.slice(6));if(predicate(state))return state;}}const chunk=await reader.read();assert.equal(chunk.done,false);buffer+=decoder.decode(chunk.value,{stream:true});}}finally{clearTimeout(timeout);}}};}
};}
let streamA,streamB;
try{
 const a=client(),b=client(),host=await a.enter('create',{name:'JOIN-TEST A'});
 const formatted=`  ${host.data.state.code.toLowerCase().replace('-','–')}  `;
 if(legacy){const failed=await b.call('join',{name:'JOIN-TEST B',code:formatted});assert.equal(failed.status,404);const canonical=await b.enter('join',{name:'JOIN-TEST B',code:host.data.state.code});assert.equal(canonical.data.state.players.length,2);console.log(`REPRODUCED on old deployed build: formatted code returns 404; exact canonical code joins independent B. Room ${host.data.state.code}.`);}
 else{
  streamA=await a.events();await streamA.until(s=>s.players.length===1);
  const guest=await b.enter('join',{name:'JOIN-TEST B',code:formatted});assert.notEqual(host.data.token,guest.data.token);assert.notEqual(host.data.state.self.id,guest.data.state.self.id);assert.equal(guest.data.state.code,host.data.state.code);assert.equal(host.data.state.authority.storage,'shared');assert.equal(host.instance,guest.instance);
  streamB=await b.events();for(const events of [streamA,streamB])await events.until(s=>s.players.length===2&&s.players.every(p=>p.connected));
  await b.call('ready',{ready:true});for(const events of [streamA,streamB])await events.until(s=>s.players.find(p=>p.id===guest.data.state.self.id).ready);
  console.log(`PASS: independent clients, formatted code, same instance ${host.instance}, shared authority, separate identities and synchronized two-player updates. Room ${host.data.state.code}.`);
 }
}finally{streamA?.close();streamB?.close();}
