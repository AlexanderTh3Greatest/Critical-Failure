import { createClient } from 'redis';
import { randomUUID } from 'node:crypto';

// All application instances transact against one shared authoritative snapshot.
// The distributed lock prevents concurrent actions/ticks from splitting state.
export async function connectRoomStore(url) {
  const client = createClient({url, disableOfflineQueue:true,
    socket:{connectTimeout:5000, reconnectStrategy:attempt=>Math.min(1000,100+attempt*100)}});
  client.on('error',()=>console.error(JSON.stringify({event:'room_store_connection_error'})));
  await client.connect();
  const stateKey='cf:v01:rooms', lockKey='cf:v01:transaction';
  return {
    async transaction(work) {
      const owner=randomUUID();let acquired=false;
      for(let attempt=0;attempt<30;attempt++) {
        if(await client.set(lockKey,owner,{NX:true,PX:30000})){acquired=true;break;}
        await new Promise(resolve=>setTimeout(resolve,100));
      }
      if(!acquired)throw Error('Room authority is busy');
      try {
        const raw=await client.get(stateKey);
        const {snapshot,result}=await work(raw?JSON.parse(raw):null);
        const saved=await client.eval("if redis.call('GET',KEYS[1]) == ARGV[1] then redis.call('SET',KEYS[2],ARGV[2]); redis.call('DEL',KEYS[1]); return 1 else return 0 end",{keys:[lockKey,stateKey],arguments:[owner,JSON.stringify(snapshot)]});
        if(saved!==1)throw Error('Room authority changed');
        return result;
      } finally {
        await client.eval("if redis.call('GET',KEYS[1]) == ARGV[1] then return redis.call('DEL',KEYS[1]) else return 0 end",{keys:[lockKey],arguments:[owner]}).catch(()=>{});
      }
    },
    async close(){client.destroy();}
  };
}
