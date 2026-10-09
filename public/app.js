const $=id=>document.getElementById(id);
const names=['Operations','Electrical','Mechanical/Cooling','Instrumentation & Controls'];
const requests=['REQUEST ELECTRICAL STATUS','REQUEST I&C VERIFICATION','REQUEST MECHANICAL STATUS','REDUCE REACTOR OUTPUT','STANDBY EQUIPMENT READY','DO NOT OPERATE'];
let credential=sessionStorage.getItem('cf-session'),activeStation,connecting=false,latest;
async function api(path,body){const response=await fetch('/api/'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(credential?{Authorization:'Bearer '+credential}:{})},...(body?{body:JSON.stringify(body)}:{})});const data=await response.json();if(!response.ok)throw Error(data.error);return data;}
function error(e){$('status').textContent=e.message;}
function send(path,body){return api(path,body).then(render).catch(error);}
function node(tag,text,parent,cls){const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;if(parent)parent.append(el);return el;}
function button(parent,text,fn,disabled=false){const el=node('button',text,parent);el.type='button';el.disabled=disabled;el.onclick=fn;return el;}
function select(parent,label,options,fn){const wrap=node('label',label,parent),el=node('select',undefined,wrap);for(const [value,text] of options){const o=node('option',text,el);o.value=value;}el.onchange=()=>fn?.(el.value);return el;}
function numeric(v){return typeof v==='number'?Math.round(v*10)/10:v;}
function readouts(parent,values){const grid=node('div',undefined,parent,'readouts');for(const [key,value] of Object.entries(values)){const card=node('div',undefined,grid,'readout');node('span',key.replace(/([a-z])([A-Z])/g,'$1 $2').toUpperCase(),card);node('strong',String(numeric(value)),card);}}
function processDiagram(parent,items){const line=node('div',undefined,parent,'process-line');items.forEach((item,index)=>{if(index)node('span','→',line,item.active?'pipe flowing':'pipe');const box=node('div',undefined,line,item.active?'equipment online':'equipment');node('strong',item.tag,box);node('small',item.status,box);});}
function action(parent,label,payload,critical=false){button(parent,label,()=>send(critical?'communication':'action',critical?{stage:'command',action:payload}:payload),latest.phase!=='running'||(critical&&!latest.self.stations.includes('Operations')));}
function station(parent,s,v){
 node('h2',s,parent);const controls=node('div',undefined,parent,'controls');
 if(s==='Operations'){
  readouts(parent,v);node('p','Compare temperature trends with reported flow. Operations issues major equipment commands below.',parent);
  action(controls,'OUTPUT −10',{type:'output',value:Math.max(0,v.reactorOutput-10)});action(controls,'OUTPUT +10',{type:'output',value:Math.min(100,v.reactorOutput+10)});action(controls,'COMMAND CONTROLLED SHUTDOWN',{type:'shutdown'},true);
  node('h3','Issue critical command',parent);const form=node('form',undefined,parent);
  const options=[['pump:A:false','MECHANICAL — STOP P-201A'],['pump:A:true','MECHANICAL — START P-201A'],['pump:B:false','MECHANICAL — STOP P-201B'],['pump:B:true','MECHANICAL — START P-201B'],['breaker:A:false','ELECTRICAL — OPEN BUS-A'],['breaker:A:true','ELECTRICAL — CLOSE BUS-A'],['breaker:B:false','ELECTRICAL — OPEN BUS-B'],['breaker:B:true','ELECTRICAL — CLOSE BUS-B'],['isolate:A:true','MECHANICAL — ISOLATE TRAIN A'],['isolate:A:false','MECHANICAL — RESTORE TRAIN A'],['isolate:B:true','MECHANICAL — ISOLATE TRAIN B'],['isolate:B:false','MECHANICAL — RESTORE TRAIN B'],['transfer:A:B','ELECTRICAL — TRANSFER TRAIN A TO BUS-B'],['transfer:A:A','ELECTRICAL — TRANSFER TRAIN A TO BUS-A'],['transfer:B:A','ELECTRICAL — TRANSFER TRAIN B TO BUS-A'],['transfer:B:B','ELECTRICAL — TRANSFER TRAIN B TO BUS-B'],['isolateFault:B','ELECTRICAL — ISOLATE BUS-B FAULT']];
  const choice=select(form,'Command',options);button(form,'SEND COMMAND',()=>{const [type,target,raw]=choice.value.split(':');const value=raw==='true'?true:raw==='false'?false:raw;send('communication',{stage:'command',action:{type,target,...(value!==undefined?{value}:{})}});},latest.phase!=='running');
 }else if(s==='Electrical'){
  processDiagram(parent,[{tag:'GEN-1',status:v.generatorOutput+'%',active:v.generatorOutput>60},{tag:'MAIN BUS',status:'DISTRIBUTION',active:v.generatorOutput>60||v.emergencyGenerator==='RUNNING'},{tag:'BUS-A / BUS-B',status:`${v.breakers.A?'CLOSED':'OPEN'} / ${v.breakers.B?'CLOSED':'OPEN'}`,active:v.breakers.A||v.breakers.B}]);readouts(parent,{generatorOutput:v.generatorOutput,batteryCondition:v.batteryCondition,emergencyGenerator:v.emergencyGenerator});
  for(const k of ['A','B'])readouts(parent,{['BUS-'+k+' load']:v.busLoads[k],['BUS-'+k+' breaker']:v.breakers[k]?'CLOSED':'OPEN',['P-201'+k+' current']:v.equipmentLoads['P-201'+k],['TRAIN '+k+' feed']:'BUS-'+v.feeds[k]});
  action(controls,'START DG-1',{type:'diesel'});node('p','Breakers, load transfers and fault isolation require an Operations command. Open BUS-B before isolating its fault.',parent);
 }else if(s==='Mechanical/Cooling'){
  for(const k of ['A','B']){const train=node('section',undefined,parent);node('h3','TRAIN '+k,train);processDiagram(train,[{tag:'P-201'+k,status:v.trains[k].pump,active:v.trains[k].pump==='RUNNING'},{tag:'HX-201'+k,status:v.trains[k].heatExchangerCondition,active:v.trains[k].flow>10},{tag:'CV-201'+k,status:v.trains[k].valvePosition+'% OPEN',active:v.trains[k].flow>10}]);if(v.trains[k].pump==='RUNNING'&&v.trains[k].flow<10)node('p','FLOW INDICATION LOW — REQUEST I&C VERIFICATION',train,'alarm');if(v.trains[k].vibration>50)node('p','HIGH VIBRATION',train,'alarm');readouts(train,v.trains[k]);for(const value of [0,50,100])action(train,`CV-201${k} ${value}%`,{type:'valve',target:k,value});action(train,`SELECT STANDBY P-201${k}`,{type:'standby',target:k});}
  node('p','Flow and temperature indications can be wrong. Ask I&C to compare channels. Pump stops and equipment isolation require an Operations command.',parent);
 }else{
  for(const [tag,channels] of Object.entries(v.channels)){const row=node('section',undefined,parent);node('h3',`${tag}-201A / ${tag}-201B${v.disagreement[tag]?' — CHANNEL DISAGREEMENT':''}`,row);readouts(row,channels);for(const channel of ['A','B'])action(row,`SELECT ${tag} CHANNEL ${channel}${v.selected[tag]===channel?' ✓':''}`,{type:'instrument',target:tag,value:channel});}
  readouts(parent,{controller:v.controller,mode:v.mode});action(controls,'MANUAL',{type:'mode',value:'manual'});action(controls,'AUTOMATIC',{type:'mode',value:'automatic'});action(controls,'RESET CONTROLLER / AUXILIARIES',{type:'reset'});
  node('p','FT: flow · TT: temperature · PT: pressure · VT: vibration. Redundant channels measure the same process. A disagreement needs verification with the crew. Use manual before resetting an unstable controller. Auxiliary reset needs DG-1 for ventilation; primary loss recovery needs Train B running and Train A isolated.',parent);
 }
}
function render(state){
 if(latest&&state.revision<latest.revision)return;
 if(document.activeElement?.tagName==='SELECT'&&latest?.phase===state.phase){latest=state;$('shared').replaceChildren();readouts($('shared'),state.shared);return;}
 latest=state;
 document.body.classList.toggle('playing',state.phase!=='lobby');
 // Preserve focused lobby/command selectors across incoming stream frames.
 const focus=document.activeElement,focusLabel=focus?.closest('label')?.firstChild?.textContent,focusValue=focus?.value;
 const selected=new Map([...document.querySelectorAll('label')].filter(l=>l.querySelector('select')).map(l=>[l.firstChild.textContent,l.querySelector('select').value]));
 $('entry').hidden=true;$('room').hidden=false;$('roomTitle').textContent='CF-01 // '+state.code;$('shared').replaceChildren();readouts($('shared'),state.shared);
 $('crew').textContent=state.players.map(p=>`${p.name} · ${p.connected?'ONLINE':'OFFLINE'} · ${p.ready?'READY':'NOT READY'}`).join(' | ');
 $('lobby').hidden=state.phase!=='lobby';$('stations').replaceChildren();$('lobbyControls').replaceChildren();
 const host=state.host===state.self.id;
 if(state.phase==='lobby'){
  for(const station of names){const owner=state.players.find(p=>p.stations.includes(station)),mine=owner?.id===state.self.id;const row=node('div',undefined,$('stations'));
   button(row,`${station}: ${owner?.name||'UNASSIGNED'}${mine?' — RELEASE':''}`,()=>send('station',{station,claim:!mine}),!!owner&&!mine);
   if(host){const picker=select(row,'Assign '+station,[['','Choose crew member'],...state.players.map(p=>[p.id,p.name])],id=>{if(id)send('assign',{station,player:id});});picker.value=owner?.id||'';}
  }
  button($('lobbyControls'),state.self.ready?'UNREADY':'READY',()=>send('ready',{ready:!state.self.ready}));if(host){button($('lobbyControls'),'RANDOMIZE STATIONS',()=>send('randomize',{}));button($('lobbyControls'),'BEGIN SHIFT',()=>send('start',{}));}
 }
 $('tabs').replaceChildren();if(!state.self.stations.includes(activeStation))activeStation=state.self.stations[0];for(const s of state.self.stations){const b=button($('tabs'),s,()=>{activeStation=s;render(latest);});b.setAttribute('aria-selected',String(s===activeStation));}
 $('console').replaceChildren();if(state.phase==='countdown')node('h2',`FACILITY STATUS: NORMAL — SHIFT BEGINS IN ${state.countdown}…`,$('console'));else if(activeStation)station($('console'),activeStation,state.stationViews[activeStation]);else node('p','Claim a station to open its interface.',$('console'));
 const comm=$('communications');comm.replaceChildren();node('h3','Closed-loop communications',comm);
 for(const c of state.commands.slice(-12)){const row=node('div',undefined,comm,'command');node('p',`${c.stage} // ${c.station} — ${c.action.type.toUpperCase()} ${c.action.target||''} ${c.action.value??''}`,row);
  if(c.recipient===state.self.id&&c.stage==='COMMAND')button(row,'REPEAT BACK EXACT COMMAND',()=>send('communication',{stage:'repeat',id:c.id}));
  if(c.issuer===state.self.id&&c.stage==='REPEAT-BACK')button(row,'CONFIRM',()=>send('communication',{stage:'confirm',id:c.id}));
  if(c.recipient===state.self.id&&c.stage==='CONFIRMATION')button(row,'EXECUTE AUTHORIZED ACTION',()=>send('communication',{stage:'execute',id:c.id}));
 }
 if(state.phase==='running'){const form=node('form',undefined,comm),target=select(form,'Request station',names.map(n=>[n,n])),message=select(form,'Information request',requests.map(n=>[n,n]));button(form,'SEND REQUEST',()=>send('communication',{stage:'request',target:target.value,message:message.value}));}
 for(const m of state.messages.slice(-8))node('p',`${m.target} // ${m.message}`,comm);
 $('results').hidden=!state.result;if(state.result){$('results').replaceChildren();node('h2',`${state.result.result} // CREW RATING ${state.result.rating}`,$('results'));readouts($('results'),Object.fromEntries(Object.entries(state.result).filter(([k])=>!['rating','result'].includes(k))));}
 for(const label of document.querySelectorAll('label')){const el=label.querySelector('select'),value=selected.get(label.firstChild?.textContent);if(el&&value!==undefined&&!label.firstChild.textContent.startsWith('Assign ')&&[...el.options].some(o=>o.value===value))el.value=value;}
 if(focusLabel){const restored=[...document.querySelectorAll('label')].find(l=>l.firstChild?.textContent===focusLabel)?.querySelector('select');if(restored&&[...restored.options].some(o=>o.value===focusValue)){restored.value=focusValue;restored.focus();}}
}
async function connect(){if(connecting)return;connecting=true;while(credential){const abort=new AbortController();let watchdog=setTimeout(()=>abort.abort(),45000);try{const response=await fetch('/api/events',{headers:{Authorization:'Bearer '+credential},signal:abort.signal});if(response.status===401){credential=null;latest=null;sessionStorage.removeItem('cf-session');$('entry').hidden=false;$('room').hidden=true;$('status').textContent='Session expired after a server restart or room expiry. Create or join a new shift.';break;}if(!response.ok)throw Error('Reconnect session unavailable');$('status').textContent='CREW LINK ONLINE';const reader=response.body.getReader(),decoder=new TextDecoder();let pending='';while(true){const {value,done}=await reader.read();if(done)break;clearTimeout(watchdog);watchdog=setTimeout(()=>abort.abort(),45000);pending+=decoder.decode(value,{stream:true});let end;while((end=pending.indexOf('\n\n'))>=0){const frame=pending.slice(0,end);pending=pending.slice(end+2);if(frame.startsWith('data: '))render(JSON.parse(frame.slice(6)));}}}catch(e){error(e);}finally{clearTimeout(watchdog);abort.abort();}if(!credential)break;$('status').textContent='CREW LINK LOST — reconnecting…';await new Promise(r=>setTimeout(r,1500));}connecting=false;}
for(const action of ['create','join'])$(action).onclick=async()=>{try{const result=await api(action,{name:$('name').value,code:$('code').value.trim()});credential=result.token;sessionStorage.setItem('cf-session',credential);render(result.state);connect();}catch(e){error(e);}};
if(credential)api('state').then(state=>{render(state);connect();}).catch(e=>{credential=null;sessionStorage.removeItem('cf-session');error(e);});
