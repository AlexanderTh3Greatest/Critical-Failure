import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {newGame,stationView,sharedView,score,advance,applyAction,communicate,ACTIONS,STATIONS} from './game.js';

export const stations = STATIONS;
export function createGameServer({timeScale=1,tickMs=250}={}) {
  const rooms = new Map(), sessions = new Map();
  const limits=new Map();
  const token = () => randomBytes(24).toString('hex');
  function view(room, player) {
    const g=room.game;
    return {code:room.code, revision:room.revision, phase:g.phase,host:room.host,countdown:g.phase==='countdown'?Math.ceil(g.countdown):undefined,self:{id:player.id,name:player.name,ready:player.ready,stations:[...player.stations]}, players:[...room.players.values()].map(p=>({id:p.id,name:p.name,ready:p.ready,connected:p.streams.size>0,stations:[...p.stations]})), shared:sharedView(g),stationViews:Object.fromEntries([...player.stations].map(s=>[s,stationView(g,s)])),commands:g.commands.filter(c=>c.issuer===player.id||c.recipient===player.id),messages:g.messages.filter(m=>m.from===player.id||player.stations.has(m.target)),result:['complete','failed'].includes(g.phase)?score(g):undefined};
  }
  function publish(room) { room.revision++; for(const p of room.players.values()) for(const stream of p.streams){if(stream.writableLength>1048576)stream.destroy();else stream.write(`data: ${JSON.stringify(view(room,p))}\n\n`);} }
  const server=http.createServer(async(req,res)=>{
    const url=new URL(req.url,'http://localhost');
    const reply=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
    try {
      if(req.method==='GET'&&url.pathname==='/health')return reply(200,{status:'ok'});
      if(req.method==='GET' && (url.pathname==='/' || url.pathname==='/app.js' || url.pathname==='/style.css')) {
        const path=url.pathname==='/'?'index.html':url.pathname.slice(1);
        res.writeHead(200,{'Content-Type':path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':'text/html','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'"});res.end(await readFile(new URL(`./public/${path}`,import.meta.url)));return;
      }
      if(!url.pathname.startsWith('/api/')) return reply(404,{error:'Not found'});
      if(req.method==='POST'){
        const origin=req.headers.origin;if(origin&&origin!==`http://${req.headers.host}`&&origin!==`https://${req.headers.host}`)return reply(403,{error:'Cross-origin action rejected'});
        const ip=req.socket.remoteAddress,now=Date.now();let limit=limits.get(ip);if(!limit||now-limit.at>60000){limit={at:now,count:0};limits.set(ip,limit);}if(++limit.count>300)return reply(429,{error:'Too many actions; wait a moment'});
      }
      let body={};
      if(req.method==='POST') {let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>4096)return reply(413,{error:'Request too large'});}try{body=JSON.parse(raw||'{}');if(!body||typeof body!=='object'||Array.isArray(body))throw Error();}catch{return reply(400,{error:'Invalid JSON object'});}}
      if(req.method==='POST' && ['/api/create','/api/join'].includes(url.pathname)) {
        const name=typeof body.name==='string'?body.name.trim().slice(0,32):'';
        if(!name)return reply(400,{error:'Enter a crew name'});
        let room;
        if(url.pathname==='/api/create'){if(rooms.size>=500)return reply(503,{error:'Facility room capacity reached; try later'});let code;do{code='CF-'+randomBytes(3).toString('hex').toUpperCase();}while(rooms.has(code));room={code,revision:0,players:new Map(),game:newGame(),createdAt:Date.now()};rooms.set(code,room);}
        else {room=rooms.get(String(body.code).toUpperCase());if(!room)return reply(404,{error:'Room not found'});}
        if(room.players.size>=4)return reply(409,{error:'Room is full'});
        if(room.game.phase!=='lobby')return reply(409,{error:'Shift already started; reconnect using your existing session'});
        const credential=token(),player={id:token(),name,ready:false,stations:new Set(),streams:new Set()};room.host??=player.id;room.players.set(player.id,player);sessions.set(credential,{room,player});for(const p of room.players.values())p.ready=false;publish(room);return reply(200,{token:credential,state:view(room,player)});
      }
      const session=sessions.get((req.headers.authorization||'').replace(/^Bearer /,''));
      if(!session)return reply(401,{error:'Session expired or invalid'});
      const {room,player}=session;
      if(req.method==='POST'&&['/api/ready','/api/assign','/api/randomize','/api/start','/api/action','/api/communication'].includes(url.pathname)) {
        try {
          const g=room.game;
          if(['/api/ready','/api/assign','/api/randomize','/api/start'].includes(url.pathname)&&g.phase!=='lobby')throw Error('Lobby is locked during a shift');
          if(['/api/assign','/api/randomize','/api/start'].includes(url.pathname)&&player.id!==room.host)throw Error('Only the host can do this');
          if(url.pathname==='/api/ready'){if(typeof body.ready!=='boolean')throw Error('Expected ready state');player.ready=body.ready;}
          if(url.pathname==='/api/assign'){const target=room.players.get(body.player);if(!target||!stations.includes(body.station))throw Error('Invalid assignment');for(const p of room.players.values()){p.stations.delete(body.station);p.ready=false;}target.stations.add(body.station);}
          if(url.pathname==='/api/randomize'){const crew=[...room.players.values()];for(let i=crew.length-1;i>0;i--){const j=randomBytes(1)[0]%(i+1);[crew[i],crew[j]]=[crew[j],crew[i]];}for(const p of crew){p.stations.clear();p.ready=false;}stations.forEach((s,i)=>crew[i%crew.length].stations.add(s));}
          if(url.pathname==='/api/start'){const crew=[...room.players.values()];if(crew.length<2||crew.some(p=>!p.ready))throw Error('Two to four players must all be READY');if(stations.some(s=>!crew.some(p=>p.stations.has(s)))||crew.some(p=>p.stations.size===0)||crew.length===4&&crew.some(p=>p.stations.size!==1))throw Error('Assign all stations; four players need one station each');g.phase='countdown';}
          if(url.pathname==='/api/action'){const rule=ACTIONS[body.type];if(!rule||!player.stations.has(rule[0]))throw Error('Action belongs to another station');if(rule[1])throw Error('Critical action requires COMMAND → REPEAT-BACK → CONFIRMATION → ACTION');applyAction(g,body);}
          if(url.pathname==='/api/communication')communicate(g,player,room.players,body);
          publish(room);return reply(200,view(room,player));
        }catch(e){return reply(409,{error:e.message});}
      }
      if(req.method==='GET'&&url.pathname==='/api/state')return reply(200,view(room,player));
      if(req.method==='GET'&&url.pathname==='/api/events') {
        if(player.streams.size>=3)return reply(409,{error:'Too many active connections for this crew session'});
        res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-store','Connection':'keep-alive'});player.streams.add(res);publish(room);
        const heartbeat=setInterval(()=>res.write(': heartbeat\n\n'),15000);req.on('close',()=>{clearInterval(heartbeat);player.streams.delete(res);publish(room);});return;
      }
      if(req.method==='POST'&&url.pathname==='/api/station') {
        if(room.game.phase!=='lobby')return reply(409,{error:'Station assignments are locked during a shift'});
        if(!stations.includes(body.station)||typeof body.claim!=='boolean')return reply(400,{error:'Invalid station assignment'});
        if(body.claim){if([...room.players.values()].some(p=>p.id!==player.id&&p.stations.has(body.station)))return reply(409,{error:'Station already assigned'});player.stations.add(body.station);}else player.stations.delete(body.station);
        for(const p of room.players.values())p.ready=false;publish(room);return reply(200,view(room,player));
      }
      reply(404,{error:'Not found'});
    } catch {if(!res.headersSent)reply(500,{error:'Server error'});else res.end();}
  });
  let last=performance.now();const ticker=setInterval(()=>{const now=performance.now(),dt=(now-last)/1000*timeScale;last=now;for(const room of rooms.values())if(['running','countdown'].includes(room.game.phase)){let remaining=dt;while(remaining>0&&['running','countdown'].includes(room.game.phase)){const step=Math.min(.25,remaining);advance(room.game,step);remaining-=step;}publish(room);}},tickMs);ticker.unref();
  const cleanup=setInterval(()=>{const now=Date.now();for(const [key,value] of limits)if(now-value.at>60000)limits.delete(key);for(const [code,room] of rooms)if(now-room.createdAt>7200000&&[...room.players.values()].every(p=>p.streams.size===0)){rooms.delete(code);for(const [key,value] of sessions)if(value.room===room)sessions.delete(key);}},60000);cleanup.unref();
  server.on('close',()=>{clearInterval(ticker);clearInterval(cleanup);});
  return server;
}
if(process.argv[1]===fileURLToPath(import.meta.url))createGameServer().listen(Number(process.env.PORT)||3000,'0.0.0.0',()=>console.log('CRITICAL FAILURE: http://localhost:3000'));
