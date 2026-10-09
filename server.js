import http from 'node:http';
import {randomBytes} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {newGame,stationView,sharedView,score,advance,applyAction,communicate,ACTIONS,STATIONS} from './game.js';
import {normalizeRoomCode} from './public/room-code.js';

export const stations=STATIONS;
export function createGameServer({timeScale=1,tickMs=250,store=null,logger=event=>console.log(JSON.stringify(event))}={}) {
  const rooms=new Map(),sessions=new Map(),limits=new Map();
  const instanceId=randomBytes(6).toString('hex'),buildId=process.env.RENDER_GIT_COMMIT?.slice(0,12)||'local';
  const token=()=>randomBytes(24).toString('hex');
  let lastTick=Date.now(),lastCleanup=0,queue=Promise.resolve(),closed=false;
  const diagnostic=(event,details={})=>logger({event,instanceId,buildId,storage:store?'shared':'memory',...details});
  const connected=p=>p.streams.size>0||Object.values(p.presence||{}).some(at=>Date.now()-at<20000);
  function snapshot(){return {lastTick,rooms:[...rooms.values()].map(r=>({...r,players:[...r.players.values()].map(p=>({id:p.id,name:p.name,ready:p.ready,stations:[...p.stations],presence:p.presence}))})),sessions:[...sessions].map(([credential,{room,player}])=>({credential,code:room.code,playerId:player.id}))};}
  function hydrate(saved){
    if(!saved){rooms.clear();sessions.clear();lastTick=Date.now();return;}
    const streams=new Map([...rooms.values()].flatMap(r=>[...r.players.values()].map(p=>[p.id,p.streams])));
    rooms.clear();sessions.clear();lastTick=saved.lastTick;
    for(const data of saved.rooms){const room={...data,players:new Map(data.players.map(p=>[p.id,{...p,stations:new Set(p.stations),streams:streams.get(p.id)||new Set(),presence:p.presence||{}}]))};rooms.set(room.code,room);}
    for(const s of saved.sessions){const room=rooms.get(s.code),player=room?.players.get(s.playerId);if(player)sessions.set(s.credential,{room,player});}
  }
  function run(work){const task=queue.then(()=>store?store.transaction(async saved=>{hydrate(saved);const result=work();return {snapshot:snapshot(),result};}):work());queue=task.catch(()=>{});return task;}
  function view(room,player){const g=room.game;return {code:room.code,revision:room.revision,phase:g.phase,host:room.host,authority:{instanceId,buildId,storage:store?'shared':'memory'},countdown:g.phase==='countdown'?Math.ceil(g.countdown):undefined,self:{id:player.id,name:player.name,ready:player.ready,stations:[...player.stations]},players:[...room.players.values()].map(p=>({id:p.id,name:p.name,ready:p.ready,connected:connected(p),stations:[...p.stations]})),shared:sharedView(g),stationViews:Object.fromEntries([...player.stations].map(s=>[s,stationView(g,s)])),commands:g.commands.filter(c=>c.issuer===player.id||c.recipient===player.id),messages:g.messages.filter(m=>m.from===player.id||player.stations.has(m.target)),result:['complete','failed'].includes(g.phase)?score(g):undefined};}
  function publish(room){room.revision++;}
  function broadcast(){for(const room of rooms.values())for(const player of room.players.values())for(const stream of player.streams){if(!stream.headersSent||stream.destroyed)continue;if(stream.writableLength>1048576)stream.destroy();else stream.write(`data: ${JSON.stringify(view(room,player))}\n\n`);}}
  const result=(status,data)=>({status,data});
  function route(req,url,body,res){
    if(req.method==='POST'&&['/api/create','/api/join'].includes(url.pathname)){
      const name=typeof body.name==='string'?body.name.trim().slice(0,32):'';
      if(!name)return result(400,{error:'Enter a crew name'});
      let room;
      if(url.pathname==='/api/create'){
        if(rooms.size>=500)return result(503,{error:'Facility room capacity reached; try later'});
        let code;do{code=normalizeRoomCode(randomBytes(3).toString('hex'));}while(rooms.has(code));
        room={code,revision:0,players:new Map(),game:newGame(),createdAt:Date.now(),lastActivityAt:Date.now()};rooms.set(code,room);
        diagnostic('room_created',{code,roomCount:rooms.size});
      }else{
        const code=normalizeRoomCode(body.code);room=code?rooms.get(code):null;
        diagnostic('room_join_attempt',{code,validFormat:!!code,found:!!room,playerCount:room?.players.size||0,ageMs:room?Date.now()-room.createdAt:undefined});
        if(!code)return result(400,{error:'Enter the room code shown under ROOM CODE (for example CF-4821AB).'});
        if(!room)return result(404,{error:'Room not found. Verify the ROOM CODE on the host device, or have the host create a new room if its session expired.',code,instanceId});
      }
      if(room.players.size>=4)return result(409,{error:'Room is full'});
      if(room.game.phase!=='lobby')return result(409,{error:'Shift already started; reconnect using your existing session'});
      const credential=token(),player={id:token(),name,ready:false,stations:new Set(),streams:new Set(),presence:{}};
      room.host??=player.id;room.players.set(player.id,player);room.lastActivityAt=Date.now();sessions.set(credential,{room,player});for(const p of room.players.values())p.ready=false;publish(room);
      diagnostic(url.pathname==='/api/create'?'room_host_added':'room_joined',{code:room.code,playerCount:room.players.size});
      return result(200,{token:credential,state:view(room,player)});
    }
    const session=sessions.get((req.headers.authorization||'').replace(/^Bearer /,''));
    if(!session)return result(401,{error:'Session expired or invalid'});
    const {room,player}=session;
    if(req.method==='GET'&&url.pathname==='/api/state')return result(200,view(room,player));
    if(req.method==='GET'&&url.pathname==='/api/events'){
      if(player.streams.size>=3)return result(409,{error:'Too many active connections for this crew session'});
      player.streams.add(res);player.presence[instanceId]=Date.now();room.lastActivityAt=Date.now();publish(room);
      return {events:{code:room.code,playerId:player.id}};
    }
    if(req.method==='POST')room.lastActivityAt=Date.now();
    if(req.method==='POST'&&url.pathname==='/api/station'){
      if(room.game.phase!=='lobby')return result(409,{error:'Station assignments are locked during a shift'});
      if(!stations.includes(body.station)||typeof body.claim!=='boolean')return result(400,{error:'Invalid station assignment'});
      if(body.claim){if([...room.players.values()].some(p=>p.id!==player.id&&p.stations.has(body.station)))return result(409,{error:'Station already assigned'});player.stations.add(body.station);}else player.stations.delete(body.station);
      for(const p of room.players.values())p.ready=false;publish(room);return result(200,view(room,player));
    }
    if(req.method==='POST'&&['/api/ready','/api/assign','/api/randomize','/api/start','/api/action','/api/communication'].includes(url.pathname)){
      try{
        const g=room.game;
        if(['/api/ready','/api/assign','/api/randomize','/api/start'].includes(url.pathname)&&g.phase!=='lobby')throw Error('Lobby is locked during a shift');
        if(['/api/assign','/api/randomize','/api/start'].includes(url.pathname)&&player.id!==room.host)throw Error('Only the host can do this');
        if(url.pathname==='/api/ready'){if(typeof body.ready!=='boolean')throw Error('Expected ready state');player.ready=body.ready;}
        if(url.pathname==='/api/assign'){const target=room.players.get(body.player);if(!target||!stations.includes(body.station))throw Error('Invalid assignment');for(const p of room.players.values()){p.stations.delete(body.station);p.ready=false;}target.stations.add(body.station);}
        if(url.pathname==='/api/randomize'){const crew=[...room.players.values()];for(let i=crew.length-1;i>0;i--){const j=randomBytes(1)[0]%(i+1);[crew[i],crew[j]]=[crew[j],crew[i]];}for(const p of crew){p.stations.clear();p.ready=false;}stations.forEach((s,i)=>crew[i%crew.length].stations.add(s));}
        if(url.pathname==='/api/start'){const crew=[...room.players.values()];if(crew.length<2||crew.some(p=>!p.ready))throw Error('Two to four players must all be READY');if(stations.some(s=>!crew.some(p=>p.stations.has(s)))||crew.some(p=>!p.stations.size)||crew.length===4&&crew.some(p=>p.stations.size!==1))throw Error('Assign all stations; four players need one station each');g.phase='countdown';}
        if(url.pathname==='/api/action'){const rule=ACTIONS[body.type];if(!rule||!player.stations.has(rule[0]))throw Error('Action belongs to another station');if(rule[1])throw Error('Critical action requires COMMAND → REPEAT-BACK → CONFIRMATION → ACTION');applyAction(g,body);}
        if(url.pathname==='/api/communication')communicate(g,player,room.players,body);
        publish(room);return result(200,view(room,player));
      }catch(error){return result(409,{error:error.message});}
    }
    return result(404,{error:'Not found'});
  }
  const server=http.createServer(async(req,res)=>{
    const url=new URL(req.url,'http://localhost');
    res.setHeader('X-CF-Instance',instanceId);res.setHeader('X-CF-Build',buildId);
    const reply=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
    try{
      if(req.method==='GET'&&url.pathname==='/health')return reply(200,{status:'ok',instanceId,buildId,storage:store?'shared':'memory'});
      if(req.method==='GET'&&['/','/app.js','/style.css','/room-code.js'].includes(url.pathname)){
        const path=url.pathname==='/'?'index.html':url.pathname.slice(1),content=await readFile(new URL(`./public/${path}`,import.meta.url));
        res.writeHead(200,{'Content-Type':path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':'text/html','Cache-Control':'no-store','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'"});res.end(content);return;
      }
      if(!url.pathname.startsWith('/api/'))return reply(404,{error:'Not found'});
      let body={};
      if(req.method==='POST'){
        const origin=req.headers.origin;if(origin&&origin!==`http://${req.headers.host}`&&origin!==`https://${req.headers.host}`)return reply(403,{error:'Cross-origin action rejected'});
        const ip=req.socket.remoteAddress,now=Date.now();let limit=limits.get(ip);if(!limit||now-limit.at>60000){limit={at:now,count:0};limits.set(ip,limit);}if(++limit.count>300)return reply(429,{error:'Too many actions; wait a moment'});
        let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>4096)return reply(413,{error:'Request too large'});}
        try{body=JSON.parse(raw||'{}');if(!body||typeof body!=='object'||Array.isArray(body))throw Error();}catch{return reply(400,{error:'Invalid JSON object'});}
      }
      const response=await run(()=>route(req,url,body,res));
      if(['/api/create','/api/join'].includes(url.pathname)&&response.status===200)diagnostic('room_request_committed',{path:url.pathname,code:response.data.state.code,playerCount:response.data.state.players.length});
      if(response.events){
        const {code,playerId}=response.events;
        res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-store','Connection':'keep-alive','X-Accel-Buffering':'no'});
        const heartbeat=setInterval(()=>res.write(': heartbeat\n\n'),5000);
        res.on('close',()=>{clearInterval(heartbeat);run(()=>{const room=rooms.get(code),player=room?.players.get(playerId);if(player){player.streams.delete(res);if(!player.streams.size)delete player.presence[instanceId];publish(room);}}).then(broadcast).catch(()=>diagnostic('room_store_unavailable'));});
        broadcast();return;
      }
      reply(response.status,response.data);broadcast();
    }catch{diagnostic('room_store_unavailable');if(!res.headersSent)reply(503,{error:'Room server is reconnecting. Please try again in a moment.'});else res.end();}
  });
  const ticker=setInterval(()=>{if(closed)return;run(()=>{
    const now=Date.now(),dt=Math.max(0,(now-lastTick)/1000)*timeScale;lastTick=now;
    for(const room of rooms.values()){
      for(const player of room.players.values()){if(player.streams.size){player.presence[instanceId]=now;room.lastActivityAt=now;}for(const [id,at] of Object.entries(player.presence))if(now-at>=20000)delete player.presence[id];}
      if(['running','countdown'].includes(room.game.phase)){let remaining=dt;while(remaining>0&&['running','countdown'].includes(room.game.phase)){const step=Math.min(.25,remaining);advance(room.game,step);remaining-=step;}publish(room);}
    }
    if(now-lastCleanup>60000){lastCleanup=now;for(const [key,limit] of limits)if(now-limit.at>60000)limits.delete(key);for(const [code,room] of rooms)if(now-(room.lastActivityAt||room.createdAt)>7200000&&[...room.players.values()].every(p=>!connected(p))){rooms.delete(code);for(const [key,value] of sessions)if(value.room.code===code)sessions.delete(key);diagnostic('room_expired',{code,reason:'two_hours_inactive'});}}
  }).then(broadcast).catch(()=>diagnostic('room_store_unavailable'));},tickMs);ticker.unref();
  server.on('close',()=>{closed=true;clearInterval(ticker);});server.drain=()=>queue;
  diagnostic('server_started');return server;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const store=process.env.REDIS_URL?await (await import('./room-store.js')).connectRoomStore(process.env.REDIS_URL):null;
  if(process.env.RENDER&&!store)throw Error('REDIS_URL is required on Render; refusing ephemeral room storage');
  const server=createGameServer({store});server.listen(Number(process.env.PORT)||3000,'0.0.0.0');
  process.on('SIGTERM',()=>{server.closeAllConnections();server.close(async()=>{await server.drain();await store?.close();process.exit(0);});});
}
