import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newGame,actual,instruments,stationView,injectFailure,applyAction,advance,score,FAILURE_TYPES,communicate} from '../game.js';
const running=()=>({...newGame(),phase:'running'});
test('mandatory FT-201A false flow: healthy cooling, corroborating clues, wrong pump stop creates real loss',()=>{
 const g=running(),healthy=actual(g);injectFailure(g,'falseFlow');
 assert.deepEqual(actual(g),healthy);assert.equal(instruments(g).FT.A,4);assert.equal(instruments(g).FT.B,100);
 assert.equal(stationView(g,'Mechanical/Cooling').trains.A.flow,4);
 assert.equal(stationView(g,'Electrical').equipmentLoads['P-201A'],42);
 assert.equal(stationView(g,'Operations').reactorTemperature,70);
 assert.equal(stationView(g,'Instrumentation & Controls').disagreement.FT,true);
 advance(g,10);assert.equal(g.integrity,100);assert.ok(g.temperature<=70);
 applyAction(g,{type:'pump',target:'A',value:false});assert.equal(actual(g).cooling,0);assert.equal(g.metrics.cascadingFailuresCaused,1);assert.equal(g.metrics.incorrectActions,1);
 advance(g,5);assert.ok(g.integrity<100);assert.ok(g.temperature>70);assert.equal(instruments(g).FT.B,0);
});
test('alternate FT channel mitigates the emergency without repairing the failed transmitter',()=>{
 const g=running();injectFailure(g,'falseFlow');applyAction(g,{type:'instrument',target:'FT',value:'B'});
 assert.equal(stationView(g,'Mechanical/Cooling').trains.A.flow,100);assert.equal(instruments(g).FT.A,4);assert.equal(g.metrics.emergenciesResolved,1);
 applyAction(g,{type:'instrument',target:'FT',value:'B'});assert.equal(g.metrics.emergenciesResolved,1);
});
test('electrical power gates mechanical availability; standby recovery and isolation interact',()=>{
 const g=running();applyAction(g,{type:'breaker',target:'A',value:false});assert.equal(actual(g).trains.A.flow,0);
 assert.throws(()=>applyAction(g,{type:'pump',target:'A',value:true}),/power/);
 applyAction(g,{type:'standby',target:'B'});assert.equal(actual(g).trains.B.flow,100);
 injectFailure(g,'overload');assert.equal(actual(g).trains.B.flow,0);applyAction(g,{type:'transfer',target:'B',value:'A'});assert.equal(actual(g).trains.B.flow,0);
 applyAction(g,{type:'breaker',target:'A',value:true});assert.equal(actual(g).trains.B.flow,100);
});
test('ten representative failures coexist; real faults and false indications remain distinct',()=>{
 const g=running();for(const type of FAILURE_TYPES)injectFailure(g,type);
 assert.equal(g.faults.length,10);applyAction(g,{type:'diesel'});assert.equal(instruments(g).TT.A,145);assert.equal(instruments(g).TT.B,50);
 assert.equal(stationView(g,'Mechanical/Cooling').trains.A.vibration,85);assert.equal(stationView(g,'Mechanical/Cooling').trains.A.heatExchangerCondition,'IMPAIRED');
 assert.equal(actual(g).trains.B.valve,15);assert.ok(actual(g).cooling<10);
 advance(g,5);assert.ok(g.integrity<100);assert.ok(g.containment<100);assert.ok(g.trains.A.valve<100);
});
test('normal first 30 seconds, gradual failures, completion and failure',()=>{
 const g=running();advance(g,29);assert.equal(g.faults.length,0);advance(g,1);assert.equal(g.faults.length,1);assert.equal(g.faults[0].type,'falseFlow');assert.equal(actual(g).cooling,100);assert.equal(g.integrity,100);
 const completed=running();completed.nextFault=10;completed.elapsed=359;advance(completed,1);assert.equal(completed.phase,'complete');
 const failed=running();failed.integrity=.01;applyAction(failed,{type:'pump',target:'A',value:false});advance(failed,1);assert.equal(failed.phase,'failed');assert.equal(score(failed).rating,'F');
});
test('a competent crew can recover all ten scheduled emergencies and finish a flawless six-minute shift',()=>{
 const g=running();g.metrics.successfulThreePartCommunications=1;
 for(let step=0;step<3601;step++){
  advance(g,.1);
  for(const f of g.faults.filter(f=>!f.resolved)){
   const act=(type,target,value)=>applyAction(g,{type,target,value});
   if(f.type==='falseFlow')act('instrument','FT','B');
   if(f.type==='bearing'){act('standby','B');act('pump','A',false);}
   if(f.type==='overload'){act('transfer','B','A');act('breaker','B',false);act('isolateFault','B');act('breaker','B',true);act('transfer','B','B');}
   if(f.type==='stuckValve'){act('pump','A',true);act('isolate','B',true);act('isolate','B',false);act('standby','B');}
   if(f.type==='falseTemperature')act('instrument','TT','B');
   if(f.type==='heatExchanger'){act('isolate','A',true);}
   if(f.type==='generator')act('diesel');
   if(f.type==='ventilation')act('reset');
   if(f.type==='controller'){act('mode',undefined,'manual');act('reset');}
   if(f.type==='coolingLoss')act('reset');
  }
 }
 assert.equal(g.phase,'complete');assert.equal(g.metrics.emergenciesResolved,10);assert.equal(score(g).result,'FLAWLESS SHIFT',JSON.stringify(score(g)));
});
test('deterministic metrics, F-through-S thresholds and FLAWLESS SHIFT',()=>{
 for(const [integrity,rating] of [[100,'S'],[90,'A'],[75,'B'],[60,'C'],[45,'D'],[20,'F']]){const g=running();g.integrity=integrity;assert.equal(score(g).rating,rating);assert.deepEqual(score(g),score(g));}
 const g=running();g.phase='complete';g.metrics.successfulThreePartCommunications=1;assert.equal(score(g).result,'FLAWLESS SHIFT');g.metrics.incorrectActions=1;assert.notEqual(score(g).result,'FLAWLESS SHIFT');
});
test('closed-loop command binds action, issuer and recipient; replay and skipped stages fail',()=>{
 const g=running(),ops={id:'ops',stations:new Set(['Operations'])},mech={id:'mech',stations:new Set(['Mechanical/Cooling'])},other={id:'other',stations:new Set(['Electrical'])};const players=new Map([ops,mech,other].map(p=>[p.id,p]));
 communicate(g,ops,players,{stage:'command',action:{type:'pump',target:'A',value:false}});const id=g.commands[0].id;
 assert.throws(()=>communicate(g,mech,players,{stage:'execute',id}),/authorized/);assert.equal(actual(g).cooling,100);
 assert.throws(()=>communicate(g,other,players,{stage:'repeat',id}),/permitted/);
 communicate(g,mech,players,{stage:'repeat',id});communicate(g,ops,players,{stage:'confirm',id});communicate(g,mech,players,{stage:'execute',id});assert.equal(actual(g).cooling,0);
 assert.equal(g.metrics.successfulThreePartCommunications,1);assert.throws(()=>communicate(g,mech,players,{stage:'execute',id}),/authorized/);
});
