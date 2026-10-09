// Fictional CF-01 gameplay model. All units are game abstractions.
export const STATIONS=['Operations','Electrical','Mechanical/Cooling','Instrumentation & Controls'];
export const FAILURE_TYPES=['bearing','falseFlow','overload','stuckValve','falseTemperature','heatExchanger','generator','ventilation','controller','coolingLoss'];
export const REQUESTS=['REQUEST ELECTRICAL STATUS','REQUEST I&C VERIFICATION','REQUEST MECHANICAL STATUS','REDUCE REACTOR OUTPUT','STANDBY EQUIPMENT READY','DO NOT OPERATE'];
export const ACTIONS={
 output:['Operations',false],shutdown:['Operations',true],
 breaker:['Electrical',true],transfer:['Electrical',true],diesel:['Electrical',false],isolateFault:['Electrical',true],
 pump:['Mechanical/Cooling',true],valve:['Mechanical/Cooling',false],isolate:['Mechanical/Cooling',true],standby:['Mechanical/Cooling',false],
 instrument:['Instrumentation & Controls',false],reset:['Instrumentation & Controls',false],mode:['Instrumentation & Controls',false]
};
export function newGame(){return {phase:'lobby',elapsed:0,countdown:3,integrity:100,output:70,temperature:70,primaryTemperature:50,pressure:65,containment:100,battery:100,diesel:false,breakers:{A:true,B:true},feed:{A:'A',B:'B'},trains:{A:{pump:true,valve:100,isolated:false},B:{pump:false,valve:100,isolated:false}},selection:{FT:'A',TT:'A',PT:'A',VT:'A'},mode:'automatic',faults:[],nextFault:0,commands:[],messages:[],sequence:0,metrics:{emergenciesResolved:0,incorrectActions:0,cascadingFailuresCaused:0,criticalActionsCompleted:0,successfulThreePartCommunications:0}};}
const fault=(g,type)=>g.faults.some(f=>f.type===type&&(!f.resolved||['falseFlow','falseTemperature','generator'].includes(type)));
export function injectFailure(g,type){if(!FAILURE_TYPES.includes(type))throw Error('Unknown failure');if(!fault(g,type))g.faults.push({type,resolved:false,at:g.elapsed});}
function resolve(g,type){for(const f of g.faults)if(f.type===type&&!f.resolved){f.resolved=true;g.metrics.emergenciesResolved++;}}
export function actual(g){
 const generator=fault(g,'generator')?55+12*Math.sin(g.elapsed/3):100;
 const power=train=>g.breakers[g.feed[train]]&&(generator>60||g.diesel)&&!(g.feed[train]==='B'&&fault(g,'overload'));
 const trains=Object.fromEntries(['A','B'].map(k=>{const t=g.trains[k],running=t.pump&&!t.isolated&&power(k);const valve=k==='B'&&fault(g,'stuckValve')?15:t.valve;const flow=running?valve*(k==='A'&&fault(g,'bearing')?.7:1):0;return[k,{running,powered:power(k),flow,pressure:running?60:5,vibration:running?(k==='A'&&fault(g,'bearing')?85:12):0,valve,efficiency:k==='A'&&fault(g,'heatExchanger')?.45:1}];}));
 let cooling=Object.values(trains).reduce((sum,t)=>sum+t.flow*t.efficiency,0);if(fault(g,'coolingLoss'))cooling*=.2;
 return {generator,trains,cooling,requiredCooling:g.output*.95,ventilation:!fault(g,'ventilation')};
}
export function instruments(g){const a=actual(g);return {FT:{A:fault(g,'falseFlow')?4:a.trains.A.flow,B:a.trains.A.flow},TT:{A:fault(g,'falseTemperature')?145:g.primaryTemperature,B:g.primaryTemperature},PT:{A:g.pressure,B:g.pressure},VT:{A:a.trains.A.vibration,B:a.trains.A.vibration}};}
export function stationView(g,station){const a=actual(g),i=instruments(g);switch(station){
 case 'Operations':return {reactorOutput:g.output,reactorTemperature:g.temperature,primaryLoopTemperature:i.TT[g.selection.TT],primaryLoopPressure:i.PT[g.selection.PT],overallCoolantFlow:i.FT[g.selection.FT]+a.trains.B.flow,generationOutput:Math.round(g.output*a.generator/100),containmentCondition:Math.round(g.containment)};
 case 'Electrical':return {diagram:'GEN-1 → MAIN BUS → BUS-A / BUS-B',generatorOutput:Math.round(a.generator),busLoads:{A:(g.trains.A.pump&&g.feed.A==='A'?55:0)+(g.trains.B.pump&&g.feed.B==='A'?55:0),B:(g.trains.A.pump&&g.feed.A==='B'?55:0)+(g.trains.B.pump&&g.feed.B==='B'?55:0)+(fault(g,'overload')?90:0)},breakers:{...g.breakers},feeds:{...g.feed},equipmentLoads:{'P-201A':a.trains.A.running?42:0,'P-201B':a.trains.B.running?42:0},batteryCondition:Math.round(g.battery),emergencyGenerator:g.diesel?'RUNNING':'STANDBY'};
 case 'Mechanical/Cooling':return {diagram:'P-201A → HX-201A → CV-201A // P-201B → HX-201B → CV-201B',trains:Object.fromEntries(['A','B'].map(k=>[k,{pump:a.trains[k].running?'RUNNING':g.trains[k].pump?'UNAVAILABLE':'STOPPED',flow:k==='A'?i.FT[g.selection.FT]:a.trains.B.flow,pressure:a.trains[k].pressure,temperature:i.TT[g.selection.TT],valvePosition:a.trains[k].valve,vibration:k==='A'?i.VT[g.selection.VT]:a.trains[k].vibration,heatExchangerCondition:a.trains[k].efficiency<1?'IMPAIRED':'NORMAL',isolated:g.trains[k].isolated}]))};
 case 'Instrumentation & Controls':return {channels:i,disagreement:Object.fromEntries(Object.entries(i).map(([tag,c])=>[tag,Math.abs(c.A-c.B)>10])),selected:{...g.selection},controller:fault(g,'controller')?'UNSTABLE':'NORMAL',mode:g.mode};
 default:throw Error('Unknown station');}}
export function sharedView(g){return {facilityIntegrity:Math.round(g.integrity),alertLevel:g.integrity<=0?'FACILITY FAILURE':g.integrity<25?'CRITICAL':g.integrity<50?'EMERGENCY':g.integrity<75?'DEGRADED':'NORMAL',shiftTimeRemaining:Math.max(0,360-Math.floor(g.elapsed))};}
export function score(g){const m={...g.metrics};const points=Math.max(0,Math.min(100,Math.round(g.integrity)-m.incorrectActions*5-m.cascadingFailuresCaused*10+Math.min(10,m.emergenciesResolved*2)));const rating=g.integrity<=0?'F':points>=95?'S':points>=85?'A':points>=70?'B':points>=55?'C':points>=40?'D':'F';return {finalFacilityIntegrity:Math.round(g.integrity),...m,points,rating,result:g.phase==='complete'&&g.integrity>=99&&m.incorrectActions===0&&m.cascadingFailuresCaused===0&&g.faults.every(f=>f.resolved)&&m.successfulThreePartCommunications>0?'FLAWLESS SHIFT':g.integrity<=0?'FACILITY FAILURE':'SHIFT COMPLETE'};}
export function advance(g,dt){if(g.phase==='countdown'){g.countdown-=dt;if(g.countdown<=0)g.phase='running';return;}if(g.phase!=='running')return;
 g.elapsed=Math.min(360,g.elapsed+dt);
 const schedule=[30,65,100,135,170,205,240,275,310,335];
 const order=['falseFlow','bearing','overload','stuckValve','falseTemperature','heatExchanger','generator','ventilation','controller','coolingLoss'];
 while(g.nextFault<schedule.length&&g.elapsed>=schedule[g.nextFault]){injectFailure(g,order[g.nextFault]);g.nextFault++;}
 if(fault(g,'controller')&&g.mode==='automatic')g.trains.A.valve=Math.max(20,g.trains.A.valve-dt*3);
 const a=actual(g),shortage=Math.max(0,a.requiredCooling-a.cooling);
 g.temperature=Math.max(45,g.temperature+(shortage*.045-(a.cooling-a.requiredCooling)*.008)*dt);
 g.primaryTemperature=Math.max(30,g.temperature-20);g.pressure=65+Math.max(0,g.temperature-75)*.4;
 if(!a.ventilation)g.containment=Math.max(0,g.containment-dt*.4);
 if(a.generator<60&&!g.diesel)g.battery=Math.max(0,g.battery-dt*.5);
 const damage=shortage*.025+Math.max(0,g.temperature-100)*.025+(g.containment<60?.2:0)+(g.battery<=0?.3:0);
 g.integrity=Math.max(0,g.integrity-damage*dt);
 if(g.integrity===0)g.phase='failed';else if(g.elapsed>=360)g.phase='complete';
}
export function validateAction(action){if(!action||!ACTIONS[action.type])throw Error('Unknown action');const {type,target,value}=action;
 if(['pump','breaker','isolate','valve','transfer','standby'].includes(type)&&!['A','B'].includes(target))throw Error('Select train or bus A/B');
 if(['pump','breaker','isolate'].includes(type)&&typeof value!=='boolean')throw Error('Expected on/off');
 if(type==='valve'&&(!Number.isFinite(value)||value<0||value>100))throw Error('Valve range is 0–100');
 if(type==='output'&&(!Number.isFinite(value)||value<0||value>100))throw Error('Output range is 0–100');
 if(type==='transfer'&&!['A','B'].includes(value))throw Error('Select destination bus');
 if(type==='instrument'&&(!['FT','PT','TT','VT'].includes(target)||!['A','B'].includes(value)))throw Error('Select instrument channel');
 if(type==='mode'&&!['manual','automatic'].includes(value))throw Error('Select manual or automatic');
 if(type==='isolateFault'&&target!=='B')throw Error('Select BUS-B fault');
 return {type,...(target!==undefined?{target}:{}),...(value!==undefined?{value}:{})};}
export function applyAction(g,input){const action=validateAction(input),{type,target,value}=action;if(g.phase!=='running')throw Error('Shift is not running');const before=actual(g);let incorrect=false;
 switch(type){
 case 'output':g.output=value;break;case 'shutdown':g.output=0;break;
 case 'breaker':g.breakers[target]=value;break;case 'transfer':g.feed[target]=value;break;case 'diesel':g.diesel=true;resolve(g,'generator');break;
 case 'isolateFault':if(g.breakers.B)throw Error('Open BUS-B breaker before isolating the fault');resolve(g,'overload');break;
 case 'pump':if(value&&!before.trains[target].powered)throw Error('Pump has no electrical power');if(value&&g.trains[target].isolated)throw Error('Pump is isolated');if(!value&&before.trains[target].running&&!(target==='A'&&fault(g,'bearing')))incorrect=true;g.trains[target].pump=value;if(!value&&target==='A')resolve(g,'bearing');break;
 case 'standby':if(!before.trains[target].powered||g.trains[target].isolated)throw Error('Standby equipment unavailable');g.trains[target].pump=true;break;
 case 'valve':if(target==='B'&&fault(g,'stuckValve'))throw Error('CV-201B is stuck');g.trains[target].valve=value;break;
 case 'isolate':g.trains[target].isolated=value;if(value){g.trains[target].pump=false;if(target==='A'){resolve(g,'bearing');resolve(g,'heatExchanger');}else resolve(g,'stuckValve');}break;
 case 'instrument':g.selection[target]=value;if(value==='B'&&target==='FT')resolve(g,'falseFlow');if(value==='B'&&target==='TT')resolve(g,'falseTemperature');break;
 case 'mode':g.mode=value;break;
 case 'reset':if(g.mode!=='manual'&&fault(g,'controller'))throw Error('Select manual before controller reset');resolve(g,'controller');g.trains.A.valve=100;if(g.diesel)resolve(g,'ventilation');if(actual(g).trains.B.running&&g.trains.A.isolated)resolve(g,'coolingLoss');break;
 }
 const after=actual(g);if(before.cooling>=before.requiredCooling&&after.cooling<after.requiredCooling){g.metrics.cascadingFailuresCaused++;incorrect=true;}
 if(incorrect)g.metrics.incorrectActions++;
 if(ACTIONS[type][1])g.metrics.criticalActionsCompleted++;
 return action;
}
export function communicate(g,player,players,body){if(g.phase!=='running')throw Error('Shift is not running');
 if(body.stage==='request'){if(!REQUESTS.includes(body.message)||!STATIONS.includes(body.target))throw Error('Invalid request');const message={id:++g.sequence,from:player.id,target:body.target,message:body.message};g.messages.push(message);g.messages=g.messages.slice(-40);return;}
 if(body.stage==='command'){if(!player.stations.has('Operations'))throw Error('Operations issues commands');const action=validateAction(body.action);const [station,critical]=ACTIONS[action.type];if(!critical)throw Error('Routine actions do not require commands');const target=[...players.values()].find(p=>p.stations.has(station));if(!target)throw Error('Target station unassigned');if(g.commands.filter(c=>c.stage!=='ACTION').length>=20)throw Error('Complete pending commands first');g.commands=g.commands.filter(c=>c.stage!=='ACTION'||c.id>g.sequence-40);g.commands.push({id:++g.sequence,issuer:player.id,recipient:target.id,station,action,stage:'COMMAND'});return;}
 const command=g.commands.find(c=>c.id===body.id);if(!command)throw Error('Command not found');
 if(body.stage==='repeat'){if(command.recipient!==player.id||command.stage!=='COMMAND')throw Error('Repeat-back is not permitted');command.stage='REPEAT-BACK';}
 else if(body.stage==='confirm'){if(command.issuer!==player.id||command.stage!=='REPEAT-BACK')throw Error('Confirmation is not permitted');command.stage='CONFIRMATION';}
 else if(body.stage==='execute'){if(command.recipient!==player.id||command.stage!=='CONFIRMATION')throw Error('Action is not authorized');applyAction(g,command.action);command.stage='ACTION';g.metrics.successfulThreePartCommunications++;}
 else throw Error('Invalid communication stage');
}
