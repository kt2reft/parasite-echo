// Local stand-in for the claude.ai artifact "room" capability (window.claude.use("room")).
// Inject into two browser contexts and relay messages between them with exposeFunction:
//   window.__send(json) is called to broadcast; call window.__recv(json) on the other page.
(()=>{
 const bc={postMessage:(x)=>{try{window.__send(JSON.stringify(x))}catch(e){}},onmessage:null};window.__recv=(s)=>{bc.onmessage&&bc.onmessage({data:JSON.parse(s)})};const me=Math.random().toString(36).slice(2,10);
 const rooms={};
 function mkRoom(name){
  const R={name,mine:{},peersMap:new Map(),hs:[],joined:true};
  const emitPeers=()=>{const arr=api.peers();setTimeout(()=>R.hs.forEach(h=>h({peers:arr,joined:[],left:[],updated:[]})),0)};
  const api={name,
   presence(patch){R.mine=Object.assign({},R.mine,patch);for(const k in patch)if(patch[k]===null)delete R.mine[k];R.peersMap.set(me,{presence:Object.freeze(R.mine),t:Date.now()});bc.postMessage({t:'p',room:name,peer:me,pres:R.mine});emitPeers();return Promise.resolve()},
   peers(){const out=[];for(const [peer,v] of R.peersMap){if(peer!==me&&Date.now()-v.t>4000){R.peersMap.delete(peer);continue}out.push(v.obj&&v.obj.presence===v.presence?v.obj:(v.obj=Object.freeze({peer,by:null,isMe:peer===me,sameTab:peer===me,kind:'viewer',guest:false,presence:v.presence,updatedAt:v.t})))}return out},
   onPeers(h){R.hs.push(h);emitPeers();return()=>{}},
   on(){return()=>{}},emit(){return Promise.resolve()},connected:()=>true,onConnection(h){setTimeout(()=>h(true),0);return()=>{}},
   leave(){R.joined=false;bc.postMessage({t:'l',room:name,peer:me});delete rooms[name];return Promise.resolve()},
  };
  R.api=api;rooms[name]=R;R.peersMap.set(me,{presence:Object.freeze({}),t:Date.now()});bc.postMessage({t:'hello',room:name,peer:me});return R;
 }
 bc.onmessage=e=>{const m=e.data;const R=rooms[m.room];if(!R)return;
  if(m.t==='p'){const v=R.peersMap.get(m.peer);R.peersMap.set(m.peer,{presence:Object.freeze(m.pres),t:Date.now()});R.hs.forEach(h=>h({}))}
  else if(m.t==='hb'){const v=R.peersMap.get(m.peer);if(v)v.t=Date.now();else R.peersMap.set(m.peer,{presence:Object.freeze({}),t:Date.now()})}
  else if(m.t==='hello'){bc.postMessage({t:'p',room:m.room,peer:me,pres:R.mine})}
  else if(m.t==='l'){R.peersMap.delete(m.peer);R.hs.forEach(h=>h({}))}};
 setInterval(()=>{for(const n in rooms){rooms[n].peersMap.get(me).t=Date.now();bc.postMessage({t:'hb',room:n,peer:me})}},800);
 const lobby=mkRoom('__lobby');
 const lobbyApi=Object.assign({},lobby.api,{join:async(name)=>(rooms[name]||mkRoom(name)).api});
 window.claude={use:async(n)=>n==='room'?lobbyApi:null};
})();
