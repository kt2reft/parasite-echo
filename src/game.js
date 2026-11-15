
'use strict';
// ================================================================
//  PARASITE ECHO — single-file prototype
//  Simulation runs on a 2D plane; rendering is 3D (three.js, inlined above):
//  third-person orbit camera, baked height-field terrain, procedural toon models.
// ================================================================
const TAU=Math.PI*2;
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const lerp=(a,b,t)=>a+(b-a)*t;
let RNGF=Math.random;
const rnd=(a=1,b)=>b===undefined?RNGF()*a:a+RNGF()*(b-a);
const rndi=(a,b)=>Math.floor(rnd(a,b+1));
const pick=a=>a[Math.floor(Math.random()*a.length)];
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t)};
function angDiff(a,b){let d=(b-a)%TAU;if(d>Math.PI)d-=TAU;if(d<-Math.PI)d+=TAU;return d}
function hash2(x,y,s){let h=(Math.imul(x|0,374761393)+Math.imul(y|0,668265263)+Math.imul((s|0)+1,982451653))|0;h=Math.imul(h^(h>>>13),1274126177);h^=h>>>16;return (h>>>0)/4294967296}
function vnoise(x,y,s){const xi=Math.floor(x),yi=Math.floor(y);let xf=x-xi,yf=y-yi;const u=xf*xf*(3-2*xf),v=yf*yf*(3-2*yf);
  const a=hash2(xi,yi,s),b=hash2(xi+1,yi,s),c=hash2(xi,yi+1,s),d=hash2(xi+1,yi+1,s);return a+(b-a)*u+(c-a)*v+(a-b-c+d)*u*v}
function fbm(x,y,s,o){let t=0,amp=.5,f=1,n=0;for(let i=0;i<o;i++){t+=vnoise(x*f,y*f,s+i*17)*amp;n+=amp;amp*=.5;f*=2.03}return t/n}
const mk=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c};
const q24=v=>Math.round(v*22)/22;

// ================================================================
//  WORLD / BIOMES
// ================================================================
const WORLD=4800, BC=4, BW=WORLD/BC, POPK=4, NQ=12; // 4x the area of v1 (2x per side)
const B_GRASS=0,B_FOREST=1,B_DIRT=2,B_ROCK=3,B_SWAMP=4,B_WATER=5,B_SAND=6,B_SEA=7;
const W_NONE=0,W_LAKE=1,W_RIVER=2,W_SHORE=3,W_DEEP=4,W_POOL=5;
const EL=new Float32Array(BW*BW), MO=new Float32Array(BW*BW), BIO=new Uint8Array(BW*BW), WK=new Uint8Array(BW*BW), DPT=new Float32Array(BW*BW);
let SEED=1;
const TH={w:.345,s:.37,r:.715,sw:.615,swe:.52,f:.53,d:.375,em:.5,mm:.47};
function classify(e,m){
  if(e<TH.w)return B_WATER; if(e<TH.s)return B_SAND;
  if(e>TH.r)return B_ROCK;
  if(m>TH.sw&&e<TH.swe)return B_SWAMP;
  if(m>TH.f)return B_FOREST;
  if(m<TH.d)return B_DIRT;
  return B_GRASS;
}
function coastY(x){return WORLD-720+(fbm(x*.0016,7.3,SEED+3,3)-.5)*640}
function setCell(k,x,y){
  const e=EL[k],m=MO[k];let b=classify(e,m),wk=W_NONE,dp=0;
  if(b===B_WATER){wk=W_LAKE;dp=clamp((TH.w-e)/.09,0,1)}
  // rivers: thin noise ridges winding toward the sea
  const rv=Math.abs(fbm(x*.0012+7,y*.0012+3,SEED+21,3)-.5);
  const rw=.0075+.004*clamp((y-WORLD*.35)/(WORLD*.5),0,1);
  if(rv<rw&&b!==B_ROCK||rv<rw*.6){b=B_WATER;wk=W_RIVER;dp=clamp(1-rv/rw,0,1)*.7}
  else if(rv<rw*1.9&&(b===B_GRASS||b===B_DIRT||b===B_FOREST))b=B_SAND;
  // marsh pools inside swamps
  if(b===B_SWAMP&&vnoise(x*.013,y*.013,SEED+33)>.6){b=B_WATER;wk=W_POOL;dp=.3}
  // the southern sea
  const d=y-coastY(x);
  if(d>-34){if(d>78){b=B_SEA;wk=W_DEEP;dp=clamp((d-78)/320,0,1)}else if(d>0){b=B_WATER;wk=W_SHORE;dp=d/78*.5}else if(b!==B_WATER)b=B_SAND}
  BIO[k]=b;WK[k]=wk;DPT[k]=dp;
}
function genBiomes(){
  for(let j=0;j<BW;j++)for(let i=0;i<BW;i++){
    const x=i*BC+2,y=j*BC+2;
    let e=fbm(x*.0021,y*.0021,SEED,5), m=fbm(x*.0027+91,y*.0027+33,SEED+7,4);
    e=.5+(e-.5)*1.38; m=.5+(m-.5)*1.5;
    const edge=Math.min(x,WORLD-x,y);
    if(edge<70){e=lerp(e,.8,1-edge/70)}
    EL[j*BW+i]=e;MO[j*BW+i]=m;
  }
  const se=Float32Array.from(EL).sort(),sm=Float32Array.from(MO).sort(),q=(a,t)=>a[Math.floor(a.length*t)];
  Object.assign(TH,{w:q(se,.075),s:q(se,.095),r:q(se,.915),swe:q(se,.7),sw:q(sm,.86),f:q(sm,.66),d:q(sm,.15),em:q(se,.5),mm:q(sm,.42)});
  for(let j=0;j<BW;j++)for(let i=0;i<BW;i++)setCell(j*BW+i,i*BC+2,j*BC+2);
}
let SPAWN={x:WORLD/2,y:WORLD/2};
function chooseSpawn(){
  let best=null,bs=-1;
  for(let t=0;t<120;t++){const x=rnd(400,WORLD-400),y=rnd(400,WORLD-600);let land=0,grass=0,wet=0,n=0;
    for(let j=-6;j<=6;j++)for(let i=-6;i<=6;i++){const b=biomeAt(x+i*40,y+j*40);n++;if(b!==B_WATER&&b!==B_SWAMP&&b!==B_SEA)land++;if(b===B_GRASS)grass++;}
    for(let j=-10;j<=10;j++)for(let i=-10;i<=10;i++){const b=biomeAt(x+i*40,y+j*40);if(b===B_WATER)wet++}
    const s=land/n*2+grass/n+(biomeAt(x,y)===B_GRASS?1:0)+Math.min(wet,25)/25*.8-Math.hypot(x-WORLD/2,y-WORLD/2)/WORLD*.5;if(s>bs){bs=s;best={x,y}}}
  SPAWN=best;
  for(let j=0;j<BW;j++)for(let i=0;i<BW;i++){const x=i*BC+2,y=j*BC+2,dc=Math.hypot(x-SPAWN.x,y-SPAWN.y);if(dc>150)continue;
    const k=1-dc/150,K=k*k*(3-2*k);const id=j*BW+i;EL[id]=lerp(EL[id],TH.em,K);MO[id]=lerp(MO[id],TH.mm,K);
    if(dc<110){BIO[id]=classify(EL[id],MO[id]);WK[id]=0;DPT[id]=0}}
}
function sampleGrid(G,wx,wy){
  let gx=wx/BC-.5,gy=wy/BC-.5; gx=clamp(gx,0,BW-1.001);gy=clamp(gy,0,BW-1.001);
  const i=gx|0,j=gy|0,fx=gx-i,fy=gy-j,k=j*BW+i;
  return lerp(lerp(G[k],G[k+1],fx),lerp(G[k+BW],G[k+BW+1],fx),fy);
}
function cellIdx(x,y){const i=clamp((x/BC)|0,0,BW-1),j=clamp((y/BC)|0,0,BW-1);return j*BW+i}
function biomeAt(x,y){return BIO[cellIdx(x,y)]}
const isWet=b=>b===B_WATER||b===B_SEA;

// ================================================================
//  3D MODELS — procedural toon creatures built from ellipsoids & tubes.
//  Units: 1 = the creature's collision radius, +X forward, +Y up.
//  Every vertex carries a colour, a pivot and an animation tag that the
//  vertex shader plays back (walk cycles, tail wags, wing beats, jaws).
// ================================================================
const SS=1.3;let M_Q=1,M_T=1;   // tessellation quality (a second, coarser set is built for distant creatures); M_T: extra density for creature parts
function M_new(){return{p:[],n:[],c:[],a:[],v:[],i:[],all:null,prims:[]}}
// remember each primitive so the finished model can be "sculpted" (see M_soften)
function M_rec(M,o,sgn,v0,pr){const an=o.an||M.all||[0,0,0],pv=o.piv||[0,0,0];
  const amp=an[1]*(sgn<0&&(an[0]===2||an[0]===3)?-1:1),off=an[2]+(sgn<0&&o.alt?Math.PI:0);
  pr.sgn=sgn;pr.v0=v0;pr.v1=M.p.length/3;pr.mat=o.mat||0;pr.gk=an[0]+'|'+amp.toFixed(3)+'|'+off.toFixed(3)+'|'+pv[0]+','+pv[1]+','+pv[2]*sgn;M.prims.push(pr)}
function M_rot(e){ // euler XYZ -> 3x3 (row-major)
  const [x,y,z]=e||[0,0,0],cx=Math.cos(x),sx=Math.sin(x),cy=Math.cos(y),sy=Math.sin(y),cz=Math.cos(z),sz=Math.sin(z);
  return [cy*cz,-cy*sz,sy, sx*sy*cz+cx*sz,-sx*sy*sz+cx*cz,-sx*cy, -cx*sy*cz+sx*sz,cx*sy*sz+sx*cz,cx*cy]}
const M_mul=(R,x,y,z)=>[R[0]*x+R[1]*y+R[2]*z,R[3]*x+R[4]*y+R[5]*z,R[6]*x+R[7]*y+R[8]*z];
function M_push(M,pos,nor,col,o,sgn){
  const an=o.an||M.all||[0,0,0],pv=o.piv||[0,0,0],t=an[0];
  const amp=an[1]*(sgn<0&&(t===2||t===3)?-1:1),off=an[2]+(sgn<0&&o.alt?Math.PI:0);
  M.p.push(pos[0],pos[1],pos[2]*sgn);M.n.push(nor[0],nor[1],nor[2]*sgn);M.c.push(col[0],col[1],col[2],o.mat||0);M.a.push(pv[0],pv[1],pv[2]*sgn);M.v.push(t,amp,off)}
function M_ell(M,c,r,col,o){
  o=o||{};const mt=Math.max(r[0],r[1],r[2])>.14?M_T:1,U=Math.max(4,Math.round((o.u||8)*M_Q*mt)),V=Math.max(3,Math.round((o.v||5)*M_Q*mt)),R=M_rot(o.rot);
  for(const sgn of(o.mir?[1,-1]:[1])){
    const base=M.p.length/3;
    for(let j=0;j<=V;j++){const ph=j/V*Math.PI,y=Math.cos(ph),s=Math.sin(ph);
      for(let i=0;i<=U;i++){const th=i/U*TAU,ux=s*Math.cos(th),uz=s*Math.sin(th);
        const p=M_mul(R,ux*r[0],y*r[1],uz*r[2]),n0=M_mul(R,ux/r[0],y/r[1],uz/r[2]),l=Math.hypot(n0[0],n0[1],n0[2])||1;
        M_push(M,[p[0]+c[0],p[1]+c[1],p[2]+c[2]],[n0[0]/l,n0[1]/l,n0[2]/l],col,o,sgn)}}
    for(let j=0;j<V;j++)for(let i=0;i<U;i++){const a=base+j*(U+1)+i,b=a+U+1;
      if(sgn>0)M.i.push(a,a+1,b,a+1,b+1,b);else M.i.push(a,b,a+1,a+1,b,b+1)}
    M_rec(M,o,sgn,base,{e:1,c,r,R,col,minR:Math.min(r[0],r[1],r[2]),bc:c,br:Math.max(r[0],r[1],r[2])})}
  return M}
function M_tube(M,A,B,ra,rb,col,o){
  o=o||{};const mt=Math.max(ra,rb)>.1?M_T:1,U=Math.max(M_Q<1?3:4,Math.round((o.u||6)*M_Q*mt));let d=[B[0]-A[0],B[1]-A[1],B[2]-A[2]];const L=Math.hypot(d[0],d[1],d[2])||1;d=d.map(v=>v/L);
  let up=Math.abs(d[1])>.9?[1,0,0]:[0,1,0];let u=[d[1]*up[2]-d[2]*up[1],d[2]*up[0]-d[0]*up[2],d[0]*up[1]-d[1]*up[0]];const ul=Math.hypot(u[0],u[1],u[2]);u=u.map(v=>v/ul);
  const w=[d[1]*u[2]-d[2]*u[1],d[2]*u[0]-d[0]*u[2],d[0]*u[1]-d[1]*u[0]];
  const fl=o.flat||1; // squash factor along w (fins, ears)
  // round end caps: a few rings on a hemisphere (more of them for dense creature parts)
  const cap=mt>1&&M_Q>=1?[1.53,1.2,.84,.44]:[1.48,.8],rings=[];
  for(const f of cap)rings.push([-ra*Math.sin(f),ra*Math.cos(f),-Math.tan(f)/1.2]);
  rings.push([0,ra,-.1],[L,rb,.1]);
  for(let q=cap.length-1;q>=0;q--){const f=cap[q];rings.push([L+rb*Math.sin(f),rb*Math.cos(f),Math.tan(f)/1.2])}
  for(const sgn of(o.mir?[1,-1]:[1])){
    const base=M.p.length/3;
    for(const [t,rad,k] of rings)for(let i=0;i<=U;i++){const th=i/U*TAU,cs=Math.cos(th),sn=Math.sin(th)*fl;
      const rx=u[0]*cs+w[0]*sn,ry=u[1]*cs+w[1]*sn,rz=u[2]*cs+w[2]*sn;
      let n=[u[0]*cs+w[0]*sn/fl/fl+d[0]*k*1.2,u[1]*cs+w[1]*sn/fl/fl+d[1]*k*1.2,u[2]*cs+w[2]*sn/fl/fl+d[2]*k*1.2];const nl=Math.hypot(n[0],n[1],n[2])||1;
      M_push(M,[A[0]+d[0]*t+rx*rad,A[1]+d[1]*t+ry*rad,A[2]+d[2]*t+rz*rad],[n[0]/nl,n[1]/nl,n[2]/nl],col,o,sgn)}
    for(let j=0;j<rings.length-1;j++)for(let i=0;i<U;i++){const a=base+j*(U+1)+i,b=a+U+1;
      if(sgn>0)M.i.push(a,a+1,b,a+1,b+1,b);else M.i.push(a,b,a+1,a+1,b,b+1)}
    M_rec(M,o,sgn,base,{e:0,A,B,ra,rb,flat:fl!==1,col,minR:Math.min(ra,rb),bc:[(A[0]+B[0])/2,(A[1]+B[1])/2,(A[2]+B[2])/2],br:L/2+Math.max(ra,rb)})}
  return M}
// big glossy anime eye: white, iris, pupil, highlight
function M_eye(M,x,y,z,r,o){
  o=o||{};const iris=o.iris||[.16,.12,.1],an=o.an,piv=o.piv,dir=o.dir||[.72,.08,.69];const dl=Math.hypot(...dir),d=dir.map(v=>v/dl);
  const base={mir:z!==0,mat:1,an,piv,u:7,v:5};
  if(o.bead){M_ell(M,[x,y,z],[r,r,r],iris,base);M_ell(M,[x+d[0]*r*.6+r*.1,y+r*.5,z+d[2]*r*.6],[r*.28,r*.28,r*.28],[1,1,1],Object.assign({},base,{u:5,v:3}));return}
  M_ell(M,[x,y,z],[r,r*1.08,r],[1,1,1],base);
  M_ell(M,[x+d[0]*r*.46,y+d[1]*r*.46,z+d[2]*r*.46],[r*.66,r*.74,r*.66],iris,base);
  if(M_Q<1)return;
  if(o.pupil!==0)M_ell(M,[x+d[0]*r*.72,y+d[1]*r*.72,z+d[2]*r*.72],[r*.42,r*.5,r*.42],[.04,.03,.05],base);
  M_ell(M,[x+d[0]*r*.95+r*.05,y+d[1]*r*.95+r*.32,z+d[2]*r*.95-r*.12],[r*.2,r*.2,r*.2],[1,1,1],Object.assign({},base,{u:5,v:3}));
}
function M_leg(M,x,z,h,ra,rb,col,off,o){o=o||{};const amp=o.amp||.65,foot=o.foot||col,piv=[x,h,z];
  M_tube(M,[x,h,z],[x+(o.dx||0),ra*.4,z+(o.dz||0)],ra,rb,col,{mir:true,alt:true,an:[1,amp,off],piv});
  M_ell(M,[x+(o.dx||0)+rb*.5,rb*.55,z+(o.dz||0)],[rb*1.5,rb*.6,rb*1.15],foot,{mir:true,alt:true,an:[1,amp,off],piv,u:6,v:4})}

// ---------------------------------------------------------------- sculpting pass (creatures, once at build time)
// Turns "toy parts stuck together" into one organic body:
//  - parts that move together melt into each other (smooth-union fillets + blended normals)
//  - neighbouring colours fade into each other instead of meeting at a hard seam
//  - creases, joints and undersides get baked ambient occlusion
// Every value is a function of position only, so where vertices of two parts land on the same
// blended surface they get identical position / normal / colour (no z-fighting).
function P_d(pr,x,y,z){if(pr.sgn<0)z=-z;
  if(pr.e){const c=pr.c,R=pr.R,r=pr.r,dx=x-c[0],dy=y-c[1],dz=z-c[2];
    const qx=(R[0]*dx+R[3]*dy+R[6]*dz)/r[0],qy=(R[1]*dx+R[4]*dy+R[7]*dz)/r[1],qz=(R[2]*dx+R[5]*dy+R[8]*dz)/r[2];
    const k0=Math.hypot(qx,qy,qz),k1=Math.hypot(qx/r[0],qy/r[1],qz/r[2]);return k1<1e-6?-pr.minR:k0*(k0-1)/k1}
  const A=pr.A,B=pr.B,bx=B[0]-A[0],by=B[1]-A[1],bz=B[2]-A[2],px=x-A[0],py=y-A[1],pz=z-A[2];
  const t=clamp((px*bx+py*by+pz*bz)/(bx*bx+by*by+bz*bz||1),0,1);return Math.hypot(px-bx*t,py-by*t,pz-bz*t)-(pr.ra+(pr.rb-pr.ra)*t)}
const smin=(a,b,k)=>{if(k<=0)return Math.min(a,b);const h=Math.max(k-Math.abs(a-b),0)/k;return Math.min(a,b)-h*h*k*.25};
function M_soften(M){
  const PR=M.prims;if(!PR||!PR.length)return;
  const K=.2,KC=.13,EP=.004,near=[],grp=[];
  for(const p of PR)p.skip=p.mat!==0||p.minR<.07||!!p.flat;
  // the biggest part's group is the "trunk": limbs and tails melt one-way into it (the trunk itself never moves)
  let big=null,bv=0;for(const p of PR){if(p.skip)continue;const vol=p.e?p.r[0]*p.r[1]*p.r[2]:p.br*p.minR*p.minR;if(vol>bv){bv=vol;big=p}}const root=big?big.gk:'';
  const inNear=(q,x,y,z,m)=>Math.hypot(x-q.bc[0],y-q.bc[1],(q.sgn<0?-z:z)-q.bc[2])<q.br+m;
  const F=(set,x,y,z)=>{let f=1e9;for(const q of set){const d=P_d(q,x,y,z);f=f>=1e8?d:smin(f,d,Math.min(K,q.minR*.8))}return f};
  const Fmin=(set,x,y,z)=>{let f=1e9;for(const q of set){const d=P_d(q,x,y,z);if(d<f)f=d}return f};
  for(const pi of PR){if(pi.mat)continue;
    for(let v=pi.v0;v<pi.v1;v++){const o=v*3;let x=M.p[o],y=M.p[o+1],z=M.p[o+2],nx=M.n[o],ny=M.n[o+1],nz=M.n[o+2];
      near.length=0;for(const q of PR)if(!q.skip&&inNear(q,x,y,z,.45))near.push(q);
      if(!pi.skip){
        // melt into the parts that move with it
        grp.length=0;for(const q of near)if(q.gk===pi.gk||q.gk===root)grp.push(q);
        if(grp.length>1){const di=P_d(pi,x,y,z),f0=F(grp,x,y,z);
          if(di-f0>1e-4&&f0>-K*.7){const x0=x,y0=y,z0=z;
            for(let it=0;it<3;it++){const f=F(grp,x,y,z),gx=(F(grp,x+EP,y,z)-F(grp,x-EP,y,z))/(2*EP),gy=(F(grp,x,y+EP,z)-F(grp,x,y-EP,z))/(2*EP),gz=(F(grp,x,y,z+EP)-F(grp,x,y,z-EP))/(2*EP),g2=gx*gx+gy*gy+gz*gz||1;
              x-=f*gx/g2;y-=f*gy/g2;z-=f*gz/g2}
            if(Math.hypot(x-x0,y-y0,z-z0)>K*.6){x=x0;y=y0;z=z0}
            else{const gx=F(grp,x+EP,y,z)-F(grp,x-EP,y,z),gy=F(grp,x,y+EP,z)-F(grp,x,y-EP,z),gz=F(grp,x,y,z+EP)-F(grp,x,y,z-EP),l=Math.hypot(gx,gy,gz);if(l>1e-9){nx=gx/l;ny=gy/l;nz=gz/l}}}}
        // colour: fade into every neighbouring part (thin layers keep a crisper edge)
        let cr=0,cg=0,cb=0,ws=0;
        for(const q of near){const d=P_d(q,x,y,z),kc=Math.min(KC,q.minR*.6),w=d<=0?1:Math.max(0,1-d/kc)**2;if(w>0){cr+=q.col[0]*w;cg+=q.col[1]*w;cb+=q.col[2]*w;ws+=w}}
        if(ws>0){M.c[v*4]=cr/ws;M.c[v*4+1]=cg/ws;M.c[v*4+2]=cb/ws}}
      // ambient occlusion: march out along the normal through the whole body
      let occ=0;for(let s=1;s<=4;s++){const h=.07*s,dd=Fmin(near,x+nx*h,y+ny*h,z+nz*h);occ+=Math.max(0,h-dd)/(1<<(s-1))}
      let ao=Math.max(.45,1-occ*1.8);ao*=.8+.2*smooth(-.7,.5,ny);ao*=.84+.16*smooth(.02,.45,y);
      M.c[v*4]*=ao;M.c[v*4+1]*=ao;M.c[v*4+2]*=ao;
      M.p[o]=x;M.p[o+1]=y;M.p[o+2]=z;M.n[o]=nx;M.n[o+1]=ny;M.n[o+2]=nz}}
  M.prims=null}

let MODELS={};const MODELS_LO={};
function buildModels(){
  const PI=Math.PI;let m;M_T=1.8;
  // ---------- parasite larva: a translucent lilac grub with glowing nodes
  m=M_new();{const c1=[.86,.72,.96],c2=[.95,.86,1],gl=[1,.55,.95];
    const sg=[[-.8,.36,.36,.34],[-.3,.46,.46,.44],[.25,.52,.5,.48],[.78,.6,.5,.5]];
    sg.forEach(([x,y,r,rz],i)=>{M_ell(m,[x,y,0],[r,r*.92,rz],c1,{an:[5,.13,i*.9]});M_ell(m,[x,y-r*.3,0],[r*.9,r*.6,rz*.85],c2,{an:[5,.13,i*.9]});
      if(i<3)M_ell(m,[x,y+r*.86,0],[.11,.07,.11],gl,{mat:2,an:[5,.13,i*.9],u:5,v:3})});
    M_eye(m,1.02,.74,.27,.2,{iris:[.5,.2,.75],an:[5,.13,2.7]});
    M_tube(m,[.9,1.0,.14],[1.18,1.42,.3],.045,.03,c1,{mir:true,an:[5,.13,2.7]});M_ell(m,[1.2,1.46,.31],[.09,.09,.09],gl,{mir:true,mat:2,an:[5,.13,2.7],u:5,v:3});
    M_tube(m,[-1.05,.36,0],[-1.4,.5,0],.14,.03,c1,{an:[5,.2,-.9]})}
  MODELS.larva=m;
  // ---------- ground beetle: glossy teal armour
  m=M_new();{const el=[.1,.42,.4],th=[.14,.3,.4],hd=[.08,.12,.16],lg=[.07,.07,.1];
    M_ell(m,[-.3,.5,0],[.88,.44,.64],el,{u:10,v:6});M_ell(m,[-.3,.52,0],[.9,.4,.03],[.05,.2,.2]);
    M_ell(m,[-.15,.88,.26],[.34,.05,.13],[.45,.85,.75],{mir:true});
    M_ell(m,[.5,.45,0],[.42,.34,.5],th);M_ell(m,[.95,.4,0],[.27,.23,.31],hd);
    M_tube(m,[1.1,.34,.13],[1.42,.3,.03],.07,.02,[.3,.16,.1],{mir:true});
    M_tube(m,[1.05,.52,.16],[1.5,.8,.5],.03,.02,lg,{mir:true,an:[2,.2,0],piv:[1.05,.52,.16]});
    M_eye(m,1.04,.5,.25,.1,{bead:1,iris:[.02,.02,.04]});
    [.45,-.05,-.55].forEach((x,i)=>{const piv=[x,.36,.45];M_tube(m,piv,[x+(i-1)*-.18,.5,.85],.06,.05,lg,{mir:true,alt:true,an:[1,.5,i*PI],piv});
      M_tube(m,[x+(i-1)*-.18,.5,.85],[x+(i-1)*-.3,0,1.08],.05,.03,lg,{mir:true,alt:true,an:[1,.5,i*PI],piv})})}
  MODELS.beetle=m;
  // ---------- snail
  m=M_new();{const bd=[.95,.84,.62],sh=[.84,.52,.26],sh2=[.62,.34,.16];
    M_ell(m,[0,.2,0],[1.2,.2,.44],bd,{u:10});M_tube(m,[.6,.28,0],[1.08,.56,0],.24,.2,bd);
    M_tube(m,[1.1,.66,.12],[1.32,1.12,.22],.05,.045,bd,{mir:true,an:[2,.18,0],piv:[1.1,.66,.12]});
    M_eye(m,1.34,1.17,.23,.11,{an:[2,.18,0],piv:[1.1,.66,.12]});
    M_tube(m,[1.2,.5,.1],[1.42,.42,.2],.04,.03,bd,{mir:true});
    M_ell(m,[-.25,.9,0],[.74,.74,.46],sh,{u:10,v:7});M_ell(m,[-.25,.9,.36],[.5,.5,.16],sh2,{mir:true});M_ell(m,[-.25,.9,.47],[.28,.28,.1],[.95,.72,.4],{mir:true});
    M_ell(m,[-.25,.9,0],[.76,.76,.09],sh2)}
  MODELS.snail=m;
  // ---------- field mouse
  m=M_new();{const fur=[.66,.54,.43],bel=[.96,.9,.82],pk=[.97,.68,.7];
    M_ell(m,[-.15,.56,0],[.86,.52,.56],fur,{u:10});M_ell(m,[-.1,.42,0],[.76,.4,.48],bel);
    M_ell(m,[.74,.64,0],[.46,.41,.43],fur);M_tube(m,[.98,.56,0],[1.3,.5,0],.21,.09,fur);M_ell(m,[1.34,.5,0],[.085,.075,.085],pk,{u:5,v:3});
    M_ell(m,[.6,1.04,.37],[.08,.27,.27],fur,{mir:true,rot:[0,.3,0]});M_ell(m,[.65,1.04,.38],[.05,.2,.2],pk,{mir:true,rot:[0,.3,0]});
    M_eye(m,.97,.74,.27,.125,{iris:[.1,.07,.08]});
    M_leg(m,.42,.3,.34,.1,.08,fur,0,{foot:pk});M_leg(m,-.58,.33,.36,.12,.09,fur,PI,{foot:pk});
    M_tube(m,[-.92,.5,0],[-1.55,.3,0],.085,.06,pk,{an:[2,.45,0],piv:[-.92,.5,0]});M_tube(m,[-1.55,.3,0],[-2.1,.46,0],.06,.025,pk,{an:[2,.45,0],piv:[-.92,.5,0]})}
  MODELS.mouse=m;
  // ---------- poison dart frog: electric blue, black spots, yellow belly
  m=M_new();m.all=[6,.4,0];{const sk=[.12,.56,.98],sp=[.04,.05,.14],bl=[.99,.86,.28];
    M_ell(m,[-.1,.52,0],[.82,.48,.64],sk,{rot:[0,0,.18],u:10});M_ell(m,[0,.36,0],[.74,.36,.56],bl);
    M_ell(m,[.55,.62,0],[.52,.38,.56],sk);M_ell(m,[.62,.46,0],[.46,.22,.5],bl);
    M_ell(m,[.6,.95,.34],[.21,.21,.21],sk,{mir:true});M_eye(m,.68,.99,.39,.16,{iris:[.95,.6,.1],dir:[.6,.25,.75]});
    [[-.35,.98,.2,.16],[-.6,.86,-.25,.14],[.05,1.0,-.18,.12],[-.75,.74,.12,.12],[.2,.96,.3,.1]].forEach(([x,y,z,r])=>M_ell(m,[x,y,z],[r,.04,r*.85],sp,{u:6,v:3}));
    M_tube(m,[-.5,.36,.5],[-.05,.3,.9],.21,.16,sk,{mir:true,an:[1,.5,0],piv:[-.5,.36,.5]});M_tube(m,[-.05,.3,.9],[-.72,.12,.94],.13,.1,sp,{mir:true,an:[1,.5,0],piv:[-.5,.36,.5]});
    M_ell(m,[-.62,.06,1.0],[.32,.05,.17],sk,{mir:true,an:[1,.5,0],piv:[-.5,.36,.5]});
    M_tube(m,[.45,.42,.45],[.62,.06,.62],.11,.09,sp,{mir:true});M_ell(m,[.72,.05,.66],[.2,.05,.16],sk,{mir:true})}
  MODELS.frog=m;
  // ---------- viper (head) + body segment
  m=M_new();{const br=[.6,.46,.3],dk=[.3,.2,.13],bl=[.9,.83,.64];
    M_ell(m,[.35,.34,0],[.66,.27,.45],br,{u:10});M_ell(m,[.2,.57,0],[.34,.05,.22],dk);M_ell(m,[.75,.42,0],[.2,.1,.2],dk);
    M_ell(m,[.4,.2,0],[.56,.12,.38],bl,{an:[4,-.35,0],piv:[-.1,.25,0]});
    M_eye(m,.62,.45,.3,.1,{iris:[.98,.8,.15],dir:[.5,.2,.85]});
    M_tube(m,[.9,.26,0],[1.3,.26,0],.035,.03,[.9,.15,.2]);M_tube(m,[1.3,.26,0],[1.5,.3,.1],.03,.01,[.9,.15,.2],{mir:true})}
  MODELS.viper=m;
  m=M_new();M_ell(m,[0,.5,0],[.8,.5,.62],[.6,.46,.3],{u:8,v:5});M_ell(m,[0,.84,0],[.42,.2,.5],[.3,.2,.13],{u:6,v:3});M_ell(m,[0,.3,0],[.72,.3,.5],[.9,.83,.64],{u:6,v:3});MODELS.seg_viper=m;
  // ---------- electric eel (head) + glowing body segment
  m=M_new();{const ol=[.3,.4,.36],or=[.98,.62,.22],gl=[1,.96,.45];
    M_ell(m,[.3,.38,0],[.74,.35,.42],ol,{u:10});M_ell(m,[.36,.24,0],[.68,.22,.38],or);
    M_eye(m,.74,.52,.28,.09,{iris:[.06,.06,.08],bead:1});M_ell(m,[.2,.5,.4],[.09,.09,.05],gl,{mir:true,mat:2,u:5,v:3});M_ell(m,[-.2,.48,.4],[.08,.08,.05],gl,{mir:true,mat:2,u:5,v:3})}
  MODELS.eel=m;
  m=M_new();M_ell(m,[0,.5,0],[.8,.5,.42],[.3,.4,.36],{u:8,v:5});M_ell(m,[0,.3,0],[.74,.3,.38],[.98,.62,.22],{u:6,v:3});M_ell(m,[0,.55,.4],[.12,.1,.05],[1,.96,.45],{mir:true,mat:2,u:5,v:3});M_ell(m,[0,1.0,0],[.6,.12,.04],[.22,.3,.28],{u:6,v:3});MODELS.seg_eel=m;
  // ---------- fox
  m=M_new();{const og=[.96,.52,.16],wh=[1,.96,.9],dk=[.24,.14,.1];
    M_ell(m,[-.1,.86,0],[.92,.42,.43],og,{u:10,v:6});M_ell(m,[-.1,.68,0],[.78,.3,.35],wh);M_ell(m,[.48,.74,0],[.38,.4,.37],wh);
    M_tube(m,[.55,.96,0],[.86,1.2,0],.3,.27,og);M_ell(m,[1.0,1.3,0],[.4,.37,.39],og,{u:10});M_ell(m,[1.08,1.16,.2],[.25,.2,.2],wh,{mir:true});
    M_tube(m,[1.24,1.22,0],[1.68,1.12,0],.2,.09,og);M_tube(m,[1.26,1.12,0],[1.66,1.06,0],.17,.08,wh);M_ell(m,[1.74,1.14,0],[.085,.075,.085],[.08,.06,.07],{u:5,v:3});
    M_tube(m,[.84,1.5,.23],[.78,2.0,.32],.18,.02,og,{mir:true,flat:.55});M_tube(m,[.9,1.52,.23],[.82,1.9,.31],.11,.02,[.3,.18,.14],{mir:true,flat:.5});M_ell(m,[.78,2.0,.32],[.07,.12,.06],dk,{mir:true,u:5,v:3});
    M_eye(m,1.24,1.4,.25,.115,{iris:[.75,.45,.08]});
    M_leg(m,.52,.24,.74,.14,.1,dk,0);M_leg(m,-.76,.25,.76,.16,.11,dk,PI);
    const tp=[-.92,.92,0];M_tube(m,tp,[-1.7,1.12,0],.2,.38,og,{an:[2,.38,0],piv:tp,u:8});M_tube(m,[-1.7,1.12,0],[-2.25,1.3,0],.36,.05,wh,{an:[2,.38,0],piv:tp,u:8})}
  MODELS.fox=m;
  // ---------- buzzard
  m=M_new();{const br=[.5,.34,.2],cr=[.95,.88,.72],dk=[.24,.16,.1],yl=[1,.8,.18];
    M_ell(m,[0,.5,0],[.82,.36,.4],br,{u:10});M_ell(m,[.22,.4,0],[.52,.3,.35],cr);
    [[.4,.3,.14],[.15,.24,-.12],[.05,.3,.2],[.5,.36,-.16]].forEach(([x,y,z])=>M_ell(m,[x,y-.12,z],[.07,.03,.06],br,{u:5,v:3}));
    M_ell(m,[.76,.68,0],[.33,.31,.31],br);M_ell(m,[.86,.6,0],[.24,.2,.26],cr);
    M_tube(m,[1.0,.66,0],[1.26,.56,0],.13,.05,yl);M_tube(m,[1.26,.56,0],[1.32,.42,0],.05,.015,dk);
    M_eye(m,.93,.76,.22,.1,{iris:[1,.75,.1]});M_ell(m,[.92,.88,.2],[.16,.035,.1],dk,{mir:true,rot:[0,0,-.25],u:5,v:3});
    const wp=[0,.62,.28],wo={mir:true,an:[3,.6,0],piv:wp};
    M_ell(m,[.05,.62,.8],[.52,.07,.62],br,Object.assign({u:8},wo));M_ell(m,[-.05,.62,1.75],[.44,.055,.7],[.42,.28,.17],Object.assign({u:8},wo));
    M_ell(m,[-.2,.61,2.35],[.3,.04,.42],dk,wo);M_ell(m,[.25,.64,1.3],[.2,.04,.75],cr,wo);
    M_ell(m,[-1.0,.5,0],[.5,.05,.4],br);M_ell(m,[-1.32,.5,0],[.2,.05,.4],dk);M_ell(m,[-1.12,.5,0],[.1,.055,.42],cr);
    M_tube(m,[.1,.26,.16],[.32,.04,.18],.06,.04,yl,{mir:true})}
  MODELS.hawk=m;
  // ---------- brown bear
  m=M_new();{const fur=[.46,.3,.17],lt=[.74,.57,.38],dk=[.3,.19,.11],bk=[.08,.06,.06];
    M_ell(m,[-.15,.96,0],[1.02,.62,.64],fur,{u:10,v:6});M_ell(m,[.34,1.26,0],[.52,.42,.52],fur);M_ell(m,[-.7,1.0,0],[.52,.56,.58],fur);
    M_ell(m,[.74,.78,0],[.24,.3,.34],lt);
    M_ell(m,[1.0,1.16,0],[.47,.44,.47],fur,{u:10});M_tube(m,[1.24,1.06,0],[1.62,.98,0],.26,.18,lt);M_ell(m,[1.72,1.02,0],[.1,.085,.11],bk,{u:5,v:3});
    M_ell(m,[.9,1.6,.34],[.1,.17,.17],fur,{mir:true});M_ell(m,[.94,1.6,.34],[.06,.11,.11],lt,{mir:true,u:5,v:3});
    M_eye(m,1.27,1.3,.23,.095,{iris:[.2,.12,.08]});
    M_leg(m,.56,.38,.82,.27,.23,fur,0,{foot:dk,amp:.5});M_leg(m,-.72,.4,.84,.29,.25,fur,PI,{foot:dk,amp:.5});
    M_ell(m,[-1.16,1.02,0],[.15,.15,.15],dk,{u:5,v:3})}
  MODELS.bear=m;
  // ---------- medaka
  m=M_new();{const og=[1,.7,.26],sv=[1,.97,.88],fn=[1,.52,.2];
    M_ell(m,[.1,.5,0],[.9,.4,.26],og,{u:10});M_ell(m,[.1,.38,0],[.82,.28,.22],sv);
    const p1=[-.3,.5,0],p2=[-.85,.5,0];M_ell(m,[-.65,.5,0],[.45,.26,.15],og,{an:[2,.3,0],piv:p1});
    M_ell(m,[-1.2,.5,0],[.34,.42,.04],fn,{an:[2,.75,-.7],piv:p2});
    M_ell(m,[-.05,.92,0],[.3,.18,.03],fn);M_ell(m,[.3,.34,.25],[.2,.05,.14],fn,{mir:true,rot:[.5,0,0]});
    M_eye(m,.66,.56,.2,.15,{iris:[.15,.2,.35]})}
  MODELS.minnow=m;
  // ---------- leech
  m=M_new();{const dk=[.3,.27,.16],or=[.95,.52,.14];
    [[-.95,.3,.2,.3],[-.48,.38,.24,.4],[0,.42,.26,.45],[.48,.38,.24,.4],[.92,.3,.2,.32]].forEach(([x,rx,ry,rz],i)=>{
      M_ell(m,[x,.25,0],[rx+.1,ry,rz],dk,{an:[5,.16,i*.9]});M_ell(m,[x,.25+ry*.9,0],[rx*.8,.05,.09],or,{an:[5,.16,i*.9],u:6,v:3});
      M_ell(m,[x,.25+ry*.5,rz*.8],[rx*.5,.04,.05],or,{mir:true,an:[5,.16,i*.9],u:5,v:3})});
    M_ell(m,[1.2,.2,0],[.15,.17,.22],[.55,.32,.26],{an:[5,.16,3.6]});M_eye(m,1.06,.4,.13,.07,{bead:1,iris:[.02,.02,.02],an:[5,.16,3.6]})}
  MODELS.leech=m;
  // ---------- crayfish
  m=M_new();{const rd=[.9,.22,.12],dk=[.62,.12,.1],lt=[1,.45,.25],bk=[.06,.05,.06];
    M_ell(m,[.25,.44,0],[.62,.33,.4],rd,{u:10});M_tube(m,[.7,.46,0],[1.08,.42,0],.2,.05,rd);
    M_ell(m,[-.4,.4,0],[.32,.27,.34],dk);M_ell(m,[-.75,.36,0],[.27,.23,.3],rd);M_ell(m,[-1.05,.32,0],[.23,.19,.26],dk);
    M_ell(m,[-1.42,.26,0],[.3,.06,.44],lt,{an:[1,.25,0],piv:[-1.15,.3,0]});
    M_tube(m,[.6,.36,.3],[1.1,.32,.66],.11,.1,rd,{mir:true});M_ell(m,[1.46,.33,.7],[.44,.17,.22],lt,{mir:true});
    M_ell(m,[1.58,.44,.55],[.32,.07,.09],rd,{mir:true,an:[4,.55,0],piv:[1.2,.36,.6]});
    M_tube(m,[.8,.5,.15],[.86,.66,.17],.03,.03,rd,{mir:true});M_ell(m,[.87,.7,.17],[.085,.085,.085],bk,{mir:true,mat:1,u:5,v:3});M_ell(m,[.92,.74,.19],[.03,.03,.03],[1,1,1],{mir:true,mat:1,u:4,v:3});
    M_tube(m,[.95,.5,.1],[1.9,.95,.5],.03,.012,dk,{mir:true,an:[2,.15,0],piv:[.95,.5,.1]});
    [.3,.05,-.2].forEach((x,i)=>{const piv=[x,.3,.3];M_tube(m,piv,[x,.34,.6],.05,.045,dk,{mir:true,alt:true,an:[1,.45,i*PI],piv});M_tube(m,[x,.34,.6],[x-.05,0,.82],.045,.025,dk,{mir:true,alt:true,an:[1,.45,i*PI],piv})})}
  MODELS.crayfish=m;
  // ---------- catfish
  m=M_new();{const gy=[.4,.37,.34],bl=[.93,.88,.76],fn=[.28,.26,.25];
    M_ell(m,[.3,.46,0],[.78,.37,.5],gy,{u:10});M_ell(m,[.85,.4,0],[.52,.27,.54],gy);M_ell(m,[.25,.3,0],[.82,.22,.44],bl);M_ell(m,[1.2,.3,0],[.16,.07,.4],bl,{u:6,v:3});
    const p1=[0,.46,0],p2=[-.5,.46,0];M_ell(m,[-.5,.46,0],[.62,.28,.26],gy,{an:[2,.26,0],piv:p1});M_ell(m,[-1.22,.46,0],[.36,.38,.04],fn,{an:[2,.6,-.8],piv:p2});
    M_ell(m,[0,.86,0],[.3,.15,.03],fn);M_ell(m,[.42,.25,.5],[.26,.04,.2],fn,{mir:true});
    M_tube(m,[1.22,.34,.3],[1.55,.18,.78],.035,.015,fn,{mir:true,an:[2,.2,0],piv:[1.22,.34,.3]});M_tube(m,[1.18,.46,.26],[1.62,.72,.6],.03,.012,fn,{mir:true,an:[2,.2,1],piv:[1.18,.46,.26]});
    M_eye(m,1.02,.56,.39,.09,{iris:[.9,.75,.3]})}
  MODELS.catfish=m;
  // ---------- shark
  m=M_new();{const gy=[.38,.5,.62],wh=[.96,.97,.98],dk=[.26,.36,.47];
    M_ell(m,[.1,.56,0],[1.15,.43,.41],gy,{u:10,v:6});M_ell(m,[.1,.42,0],[1.06,.32,.37],wh);M_tube(m,[1.0,.56,0],[1.5,.5,0],.3,.08,gy);M_tube(m,[1.0,.46,0],[1.44,.44,0],.26,.07,wh);
    const p1=[-.2,.56,0],p2=[-.75,.56,0];M_ell(m,[-.75,.56,0],[.62,.27,.2],gy,{an:[2,.22,0],piv:p1});
    M_ell(m,[-1.5,.9,0],[.2,.48,.045],dk,{rot:[0,0,.55],an:[2,.5,-.8],piv:p2});M_ell(m,[-1.42,.3,0],[.15,.3,.04],dk,{rot:[0,0,-.5],an:[2,.5,-.8],piv:p2});
    M_tube(m,[.12,.88,0],[-.32,1.62,0],.34,.03,dk,{flat:.16,u:8});M_ell(m,[.38,.3,.5],[.3,.045,.3],dk,{mir:true,rot:[.35,.4,0]});
    M_ell(m,[1.02,.34,0],[.26,.035,.26],[.2,.08,.1],{u:6,v:3});
    M_eye(m,1.05,.64,.36,.085,{bead:1,iris:[.03,.03,.05]});
    [.55,.68,.81].forEach(x=>M_ell(m,[x,.52,.4],[.015,.11,.03],dk,{mir:true,u:4,v:3}))}
  MODELS.shark=m;
  // ---------- borrowed wings (flight trait on a non-flyer)
  m=M_new();M_ell(m,[0,.95,.85],[.42,.06,.75],[1,.98,.93],{mir:true,an:[3,.75,0],piv:[0,.95,.15]});M_ell(m,[-.05,.95,1.5],[.3,.05,.4],[.9,.85,.95],{mir:true,an:[3,.75,0],piv:[0,.95,.15]});MODELS.wings=m;
  // ---------- food & items (world units)
  M_T=1;
  for(const k in MODELS)M_soften(MODELS[k]);   // everything built so far is a creature
  m=M_new();M_ell(m,[0,1.5,0],[1.4,1.4,1.4],[.92,.16,.24]);M_ell(m,[1.5,1.1,.8],[1.1,1.1,1.1],[.98,.26,.3]);M_ell(m,[-.9,1.0,1.3],[1,1,1],[.85,.12,.3]);
  M_ell(m,[.2,2.9,0],[1.4,.2,.7],[.4,.75,.3],{rot:[0,.5,.3]});M_ell(m,[.35,2.1,.35],[.3,.3,.3],[1,.8,.85],{u:5,v:3,mat:1});MODELS.berry=m;
  m=M_new();[0,2.1,4.2].forEach((a,i)=>M_ell(m,[Math.cos(a)*1.4,1.6+i*.5,Math.sin(a)*1.4],[1.9,.22,.9],[.45+i*.06,.86,.36],{rot:[0,-a,.7],an:[5,.12,i]}));
  M_tube(m,[0,0,0],[0,2.2,0],.22,.15,[.36,.66,.28]);MODELS.leaf=m;
  m=M_new();[[0,0,2.2],[2.1,.9,1.5],[-1.6,1.5,1.3],[.6,-2,1.2]].forEach(([x,z,r],i)=>M_ell(m,[x,.12,z],[r,.16,r*.9],[.3+i*.04,.74,.42],{u:7,v:3}));
  M_ell(m,[.4,.5,.2],[.5,.4,.5],[1,.86,.95],{u:5,v:3});MODELS.algae=m;
  m=M_new();M_tube(m,[0,0,0],[0,4.4,0],1.1,.8,[.92,.96,.94]);M_ell(m,[0,5.2,0],[3.6,2.3,3.6],[.3,.92,1],{mat:2,u:10});M_ell(m,[0,4.8,0],[3.3,1,3.3],[.75,1,1],{mat:2});
  [[1.6,6.6,.6],[-1.4,6.4,1],[.2,6.9,-1.6],[-1,6.5,-1.2]].forEach(([x,y,z])=>M_ell(m,[x,y,z],[.55,.3,.55],[1,1,1],{mat:2,u:5,v:3}));MODELS.mush=m;
  m=M_new();M_ell(m,[0,2.2,0],[2.6,2.3,2.6],[.6,.4,.9],{u:10,an:[6,.25,0]});M_ell(m,[0,2.4,0],[1.7,1.6,1.7],[.92,.6,1],{mat:2,an:[6,.25,0]});
  [[1.9,2.6,.8],[-1.6,3.2,1],[.3,3.9,-1.6],[-1,1.6,-1.9],[1.2,1.3,-1.7]].forEach(([x,y,z])=>M_ell(m,[x,y,z],[.6,.6,.6],[.8,.5,1],{u:5,v:3}));MODELS.cyst=m;
  // ---------- scenery (world units)
  m=M_new();{const bk=[.5,.34,.22],g1=[.33,.68,.3],g2=[.26,.58,.27],g3=[.44,.78,.34];
    M_tube(m,[0,-2,0],[0,34,0],4.6,2.8,bk,{u:7});M_tube(m,[0,0,0],[5.5,-1.5,2],3,1.2,bk);M_tube(m,[0,0,0],[-4,-1.5,-4],3,1.2,bk);M_tube(m,[0,0,0],[-2,-1.5,5.5],2.6,1.2,bk);
    M_tube(m,[0,22,0],[9,31,3],1.6,1,bk);M_tube(m,[0,25,0],[-8,33,-4],1.5,1,bk);
    M_ell(m,[0,46,0],[22,15,22],g1,{u:16,v:9,an:[5,.7,0]});M_ell(m,[13,37,6],[14,10.5,14],g2,{u:13,v:8,an:[5,.6,1]});M_ell(m,[-11,39,-8],[15,11.5,15],g2,{u:13,v:8,an:[5,.6,2]});
    M_ell(m,[-5,36,12],[12,9,12],g1,{u:12,v:7,an:[5,.6,3]});M_ell(m,[3,58,-2],[13,9.5,13],g3,{u:13,v:8,an:[5,.9,1.5]});M_ell(m,[8,50,-10],[11,8,11],g3,{u:12,v:7,an:[5,.8,2.5]})}
  MODELS.tree=m;
  m=M_new();{const g=[.62,.62,.68],g2=[.52,.52,.6],ms=[.5,.72,.38];
    M_ell(m,[0,3.4,0],[8.2,6.4,7.2],g,{u:7,v:4,rot:[.2,.3,.1]});M_ell(m,[4.6,2,3.4],[5,4,4.4],g2,{u:6,v:4,rot:[.3,0,.4]});M_ell(m,[-4.4,1.6,-3],[4.2,3.2,4],g2,{u:6,v:4});
    M_ell(m,[-.5,8.4,.4],[5,1.6,4.4],ms,{u:6,v:3})}
  MODELS.rock=m;
  for(const berry of[0,1]){m=M_new();const g1=[.3,.64,.28],g2=[.38,.74,.32],g3=[.24,.54,.26];
    M_ell(m,[0,6,0],[10.5,8,10.5],g1,{u:13,v:7,an:[5,.25,0]});M_ell(m,[6.5,4.2,5],[7.2,6,7.2],g2,{u:11,v:6,an:[5,.25,1]});M_ell(m,[-6.5,4.6,-4],[7.4,6.2,7.4],g3,{u:11,v:6,an:[5,.25,2]});M_ell(m,[-2,5,7.5],[6,5,6],g2,{u:10,v:6,an:[5,.25,3]});
    if(berry)[[8,8,3],[-3,12.5,3],[3,6,10.5],[-10,7.5,-1],[2,11,-7],[11,5,7.5],[-5.5,6,11.5]].forEach(([x,y,z])=>M_ell(m,[x,y,z],[1.3,1.3,1.3],[.95,.18,.26],{u:5,v:3}));
    MODELS[berry?'bushB':'bush']=m}
}
// model heights (in radii) for labels
const MODEL_H={larva:1.5,beetle:1.0,snail:1.7,mouse:1.4,frog:1.3,viper:.8,eel:.9,fox:2.1,hawk:1.1,bear:1.9,minnow:1.0,leech:.7,crayfish:1.0,catfish:1.0,shark:1.6};

// ================================================================
//  GAME DATA
// ================================================================
const TRAITS={
  shell:{name:'硬殻',g:'殻',desc:'被ダメージ -35%',active:false},
  longevity:{name:'長寿',g:'寿',desc:'老化速度 -40%',active:false},
  burrow:{name:'潜穴',g:'潜',desc:'3秒間地中に潜伏。無敵・捕捉不能',active:true,cd:12},
  mist:{name:'毒霧',g:'霧',desc:'周囲に毒霧を噴射し、敵を蝕み鈍らせる',active:true,cd:10},
  venom:{name:'猛毒の牙',g:'毒',desc:'噛みつきに猛毒を付与',active:false},
  swift:{name:'俊足',g:'速',desc:'移動速度 +20%・アドレナリン上昇 +20%',active:false},
  flight:{name:'飛行',g:'翔',desc:'水・毒沼・障害物を飛び越える',active:false},
  roar:{name:'覇王の咆哮',g:'咆',desc:'周囲の生物をすくませ恐慌させる',active:true,cd:16},
  swim:{name:'遊泳',g:'泳',desc:'水中を高速で泳ぎ、深い海へも潜れる',active:false},
  drain:{name:'吸血',g:'吸',desc:'噛みついた傷から体力を吸い取る',active:false},
  pincer:{name:'剛鋏',g:'鋏',desc:'噛みつきが30%で相手を挟み止める',active:false},
  shock:{name:'電撃',g:'雷',desc:'周囲へ放電し、触れた生物を痺れさせる',active:true,cd:11},
  frenzy:{name:'血の狂乱',g:'狂',desc:'傷ついた相手への攻撃力 +45%',active:false},
};
const SP0={
  larva:{name:'寄生幼生',tier:0,size:6,speed:42,hp:6,atk:.5,life:1e9,diet:[],plants:false,trait:null,perc:70,atkCd:1,pop:0,turn:12},
  beetle:{name:'オサムシ',tier:1,size:10,speed:31,hp:10,atk:1.5,life:110,diet:[],plants:true,trait:'shell',perc:55,atkCd:1,pop:55,turn:7},
  snail:{name:'マイマイ',tier:1,size:10,speed:16,hp:12,atk:1,life:160,diet:[],plants:true,trait:'longevity',perc:45,atkCd:1.2,pop:30,turn:4},
  mouse:{name:'ノネズミ',tier:2,size:13,speed:64,hp:14,atk:3,life:130,diet:[0,1],plants:true,trait:'burrow',perc:85,atkCd:.8,pop:40,turn:9},
  frog:{name:'ヤドクガエル',tier:2,size:12,speed:46,hp:16,atk:3,life:140,diet:[0,1],plants:false,trait:'mist',perc:75,atkCd:.9,pop:28,turn:8},
  viper:{name:'マムシ',tier:3,size:11,speed:52,hp:32,atk:7,life:180,diet:[0,1,2],plants:false,trait:'venom',perc:105,atkCd:1.1,pop:16,turn:5},
  fox:{name:'キツネ',tier:4,size:24,speed:80,hp:55,atk:11,life:210,diet:[1,2,3],plants:false,trait:'swift',perc:140,atkCd:1,pop:11,turn:6},
  hawk:{name:'ノスリ',tier:5,size:22,speed:94,hp:60,atk:13,life:230,diet:[2,3,4],plants:false,trait:'flight',perc:180,atkCd:1.1,pop:7,turn:3.2,fly:true},
  bear:{name:'ヒグマ',tier:6,size:36,speed:60,hp:150,atk:24,life:280,diet:[3,4,5],plants:true,trait:'roar',perc:130,atkCd:1.3,pop:6,turn:3},
  minnow:{name:'メダカ',tier:1,size:8,speed:52,hp:6,atk:1,life:100,diet:[],plants:true,trait:'swim',perc:60,atkCd:1,pop:46,turn:10,hab:'aqua'},
  leech:{name:'ヒル',tier:1,size:9,speed:24,hp:9,atk:2,life:120,diet:[],plants:true,trait:'drain',perc:50,atkCd:1,pop:28,turn:6,hab:'marsh'},
  crayfish:{name:'ザリガニ',tier:2,size:13,speed:40,hp:18,atk:3.5,life:140,diet:[0,1],plants:true,trait:'pincer',perc:70,atkCd:.9,pop:26,turn:7,hab:'amph'},
  catfish:{name:'ナマズ',tier:3,size:20,speed:56,hp:34,atk:7,life:180,diet:[0,1,2],plants:false,trait:'swim',perc:110,atkCd:1.1,pop:13,turn:4,hab:'aqua'},
  eel:{name:'デンキウナギ',tier:4,size:12,speed:70,hp:50,atk:10,life:210,diet:[1,2,3],plants:false,trait:'shock',perc:130,atkCd:1,pop:9,turn:5,hab:'aqua',seg:1},
  shark:{name:'サメ',tier:5,size:40,speed:86,hp:80,atk:15,life:240,diet:[2,3,4],plants:false,trait:'frenzy',perc:170,atkCd:1.1,pop:4,turn:3,hab:'sea'},
};const SP=SP0;for(const k in SP)SP[k].pop=Math.round(SP[k].pop*POPK);

const LIFE_MUL=2.6,DRY=90;
for(const k in SP){SP[k].key=k;if(k!=='larva')SP[k].life*=LIFE_MUL}SP.viper.seg=1;
const SPKEYS=['beetle','snail','minnow','leech','mouse','frog','crayfish','viper','catfish','fox','eel','hawk','shark','bear'];

let creatures=[],foods=[],bushes=[],trees=[],rocks=[],mushrooms=[],clouds=[],particles=[],decals=[],rivals=[],fireflies=[],motes=[];
let UID=0, gameState='loading', paused=false, modalOpen=false, timeScale=1, slowT=0, worldT=0, dayT=.06;
const DAY=540;
const cam={x:WORLD/2,y:WORLD/2,sx:0,sy:0,shake:0};

// ---- static spatial grid for obstacles & bushes
const OG=64, OGW=Math.ceil(WORLD/OG);
let obsGrid=[],bushGrid=[],fgrid=[];
function buildObsGrid(){obsGrid=Array.from({length:OGW*OGW},()=>[]);
  for(const o of[...trees,...rocks]){const i0=clamp(((o.x-o.r)/OG)|0,0,OGW-1),i1=clamp(((o.x+o.r)/OG)|0,0,OGW-1),j0=clamp(((o.y-o.r)/OG)|0,0,OGW-1),j1=clamp(((o.y+o.r)/OG)|0,0,OGW-1);
    for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++)obsGrid[j*OGW+i].push(o)}
  bushGrid=Array.from({length:OGW*OGW},()=>[]);
  for(const b of bushes){const i0=clamp(((b.x-b.r)/OG)|0,0,OGW-1),i1=clamp(((b.x+b.r)/OG)|0,0,OGW-1),j0=clamp(((b.y-b.r)/OG)|0,0,OGW-1),j1=clamp(((b.y+b.r)/OG)|0,0,OGW-1);
    for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++)bushGrid[j*OGW+i].push(b)}}
// ---- dynamic grid
let cgrid=[];
let cgDirty=[],fgDirty=[];
function buildCGrid(){if(cgrid.length!==OGW*OGW){cgrid=Array.from({length:OGW*OGW},()=>[]);cgDirty=[]}for(const i of cgDirty)cgrid[i].length=0;cgDirty.length=0;
  for(const c of creatures){if(c.dead)continue;const i=clamp((c.x/OG)|0,0,OGW-1),j=clamp((c.y/OG)|0,0,OGW-1),k=j*OGW+i;if(!cgrid[k].length)cgDirty.push(k);cgrid[k].push(c)}
  if(fgrid.length!==OGW*OGW){fgrid=Array.from({length:OGW*OGW},()=>[]);fgDirty=[]}for(const i of fgDirty)fgrid[i].length=0;fgDirty.length=0;
  for(const f of foods){const k=clamp((f.y/OG)|0,0,OGW-1)*OGW+clamp((f.x/OG)|0,0,OGW-1);if(!fgrid[k].length)fgDirty.push(k);fgrid[k].push(f)}}
function nearestFood(c,r){let best=null,bd=r*r;const i0=clamp(((c.x-r)/OG)|0,0,OGW-1),i1=clamp(((c.x+r)/OG)|0,0,OGW-1),j0=clamp(((c.y-r)/OG)|0,0,OGW-1),j1=clamp(((c.y+r)/OG)|0,0,OGW-1);
  for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++)for(const f of fgrid[j*OGW+i]){const dx=f.x-c.x,dy=f.y-c.y,d=dx*dx+dy*dy;if(d<bd&&canEnter(c,biomeAt(f.x,f.y))){bd=d;best=f}}return best}
function query(x,y,r,cb){const i0=clamp(((x-r)/OG)|0,0,OGW-1),i1=clamp(((x+r)/OG)|0,0,OGW-1),j0=clamp(((y-r)/OG)|0,0,OGW-1),j1=clamp(((y+r)/OG)|0,0,OGW-1);const r2=r*r;
  for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++){const cell=cgrid[j*OGW+i];for(let k=0;k<cell.length;k++){const o=cell[k];const dx=o.x-x,dy=o.y-y;if(dx*dx+dy*dy<=r2)cb(o,Math.sqrt(dx*dx+dy*dy))}}}

// ================================================================
//  WORLD POPULATION
// ================================================================
function randLand(pred,tries=60){for(let t=0;t<tries;t++){const x=rnd(60,WORLD-60),y=rnd(60,WORLD-60);const b=biomeAt(x,y);if(pred(b,x,y))return{x,y}}return{x:rnd(200,WORLD-200),y:rnd(200,WORLD-200)}}
function buildDecor(){
  trees=[];rocks=[];bushes=[];mushrooms=[];
  const SG=new Map(),sk=(x,y)=>((x/64)|0)+','+((y/64)|0);
  const okSpace=(x,y,arr,d)=>{const g=SG.get(arr);if(!g)return true;for(let j=-1;j<=1;j++)for(let i=-1;i<=1;i++){const l=g.get((((x/64)|0)+i)+','+(((y/64)|0)+j));if(l)for(const o of l)if(Math.hypot(o.x-x,o.y-y)<=d)return false}return true};
  const addS=(arr,o)=>{arr.push(o);let g=SG.get(arr);if(!g){g=new Map();SG.set(arr,g)}const k=sk(o.x,o.y);(g.get(k)||g.set(k,[]).get(k)).push(o)};
  for(let t=0;t<16000&&trees.length<480;t++){const x=rnd(70,WORLD-70),y=rnd(70,WORLD-70);const b=biomeAt(x,y);
    const want=b===B_FOREST?1:b===B_GRASS?.08:b===B_SWAMP?.25:0;if(RNGF()>want)continue;if(Math.hypot(x-SPAWN.x,y-SPAWN.y)<90)continue;
    if(okSpace(x,y,trees,46))addS(trees,{x,y,r:5,v:rndi(0,3),kind:'tree'})}
  for(let t=0;t<12000&&rocks.length<240;t++){const x=rnd(70,WORLD-70),y=rnd(70,WORLD-70);const b=biomeAt(x,y);
    const want=b===B_ROCK?.6:b===B_DIRT?.25:b===B_SAND?.08:b===B_GRASS?.03:0;if(RNGF()>want)continue;
    if(okSpace(x,y,rocks,30)&&okSpace(x,y,trees,20))addS(rocks,{x,y,r:7,v:rndi(0,3),kind:'rock'})}
  for(let t=0;t<16000&&bushes.length<440;t++){const x=rnd(60,WORLD-60),y=rnd(60,WORLD-60);const b=biomeAt(x,y);
    const want=b===B_GRASS?.45:b===B_FOREST?.4:b===B_DIRT?.12:b===B_SWAMP?.15:0;if(RNGF()>want)continue;
    if(okSpace(x,y,bushes,34)&&okSpace(x,y,trees,18)&&okSpace(x,y,rocks,18))addS(bushes,{x,y,r:11,v:rndi(0,2),berry:RNGF()<.42})}
  // ensure bushes near center
  for(let i=0;i<4;i++){const a=i/4*TAU+.4;bushes.push({x:SPAWN.x+Math.cos(a)*70,y:SPAWN.y+Math.sin(a)*55,r:11,v:i%3,berry:i%2===0})}
  for(let t=0;t<12000&&mushrooms.length<28;t++){const x=rnd(80,WORLD-80),y=rnd(80,WORLD-80);if(biomeAt(x,y)!==B_FOREST&&biomeAt(x,y)!==B_SWAMP)continue;
    if(mushrooms.every(o=>Math.hypot(o.x-x,o.y-y)>160))mushrooms.push({x,y,ready:true,t:0})}
  buildObsGrid();
}
function spawnFood(){if(Math.random()<.3){const p=randLand(b=>b===B_WATER||b===B_SWAMP);foods.push({x:p.x,y:p.y,kind:'algae'});return}
  const berry=Math.random()<.5&&bushes.length;
  if(berry){const b=pick(bushes.filter(b=>b.berry)||bushes);if(b){const a=rnd(TAU),d=rnd(10,20);foods.push({x:b.x+Math.cos(a)*d,y:b.y+Math.sin(a)*d,kind:'berry'});return}}
  const p=randLand(b=>b===B_GRASS||b===B_FOREST||b===B_SWAMP);foods.push({x:p.x,y:p.y,kind:'leaf',d:rndi(0,3)})}
function habOk(sp,b,swim){
  switch(sp.hab){
    case'sea':return b===B_SEA;
    case'aqua':return b===B_WATER||b===B_SEA;
    case'marsh':return b===B_WATER||b===B_SWAMP;
    case'amph':return b!==B_SEA||swim;
    default:return b!==B_SEA||swim||sp.key==='larva';
  }}
function canEnter(c,b){if(isFlying(c))return true;return habOk(c.sp,b,hasTrait(c,'swim'))}
function biomeOkFor(key,b){
  const sp=SP[key];
  switch(key){case'minnow':return b===B_WATER;case'leech':return b===B_SWAMP||b===B_WATER;case'crayfish':return b===B_WATER||b===B_SWAMP||b===B_SAND;
    case'catfish':return b===B_WATER;case'eel':return b===B_WATER||b===B_SEA;case'shark':return b===B_SEA}
  if(isWet(b))return false;
  switch(key){case'snail':return b===B_FOREST||b===B_SWAMP||b===B_GRASS;case'frog':return b===B_SWAMP||b===B_SAND||b===B_FOREST;case'beetle':return b!==B_SAND;
    case'viper':return b===B_ROCK||b===B_DIRT||b===B_GRASS||b===B_SWAMP;case'fox':return b===B_GRASS||b===B_FOREST||b===B_DIRT;case'bear':return b===B_FOREST||b===B_ROCK||b===B_GRASS||b===B_SAND;default:return b!==B_SWAMP}}
function spawnCreature(key,x,y,age){
  const sp=SP[key];
  const c={id:++UID,sp,key,x,y,vx:0,vy:0,ang:rnd(TAU),hp:1,maxhp:sp.hp,atk:sp.atk,r:sp.size*.42,age:age===undefined?rnd(0,sp.life*.7):age,life:sp.life*rnd(.9,1.1),
    sex:Math.random()<.5?0:1,growth:0,hunger:rnd(.6),state:'wander',target:null,threat:null,prey:null,food:null,thinkT:rnd(.3),atkCd:rnd(1),stun:0,fear:0,fearSrc:null,
    poisonT:0,poisonDps:0,poisonSrc:null,hitT:0,hiddenT:0,slowT:0,animT:rnd(4),wanderA:rnd(TAU),wanderT:rnd(3),rest:0,alt:sp.fly?20:0,trail:null,feral:false,rival:null,traits:null,
    eatT:0,chaseT:0,courtT:0,partner:null,skCd:rnd(4,9),dead:false,inBush:false,auraT:rnd(3),tx:0,ty:0,thr:0,tired:0,lastAtt:null,lastAttT:0};
  if(sp.seg){c.trail=[];for(let i=0;i<40;i++)c.trail.push({x:x-Math.cos(c.ang)*i*1.3*SS,y:y-Math.sin(c.ang)*i*1.3*SS})}
  recalc(c);c.hp=c.maxhp;creatures.push(c);return c;
}
function stageOf(c){if(c.key==='larva')return 1;const r=c.age/c.life;return r<.22?0:r<.72?1:2}
function recalc(c){const sp=c.sp,st=stageOf(c);c.stage=st;const g=Math.min(c.growth,14);
  const ratio=c.maxhp>0?c.hp/c.maxhp:1;
  c.maxhp=sp.hp*[.7,1,.9][st]*(1+g*.07)*(c.feral?1.5:1);c.atk=sp.atk*(st===0?.7:1)*(1+g*.06)*(c.feral?1.35:1);
  c.r=sp.size*.42*SS*(st===0?.78:1)*(c.feral?1.18:1);c.hp=clamp(ratio*c.maxhp,0,c.maxhp)}
function populate(initial){
  for(const k of SPKEYS){const sp=SP[k];let n=creatures.filter(c=>!c.dead&&c.key===k).length;
    const lim=initial?sp.pop:Math.min(sp.pop,n+POPK);let made=0;
    while(n<lim){const p=randLand((b,x,y)=>biomeOkFor(k,b)&&(initial||(Math.hypot(x-cam.x-GW/2,y-cam.y-GH/2)>Math.max(GW,GH)*.9&&!nearAnyPlayer(x,y,260)))&&(!initial||k==='beetle'||k==='snail'||Math.hypot(x-SPAWN.x,y-SPAWN.y)>(SP[k].tier>=3?320:150)));
      spawnCreature(k,p.x,p.y,initial?undefined:rnd(0,sp.life*.15));n++;if(!initial&&++made>=POPK)break}}
}
function populateCoop(){
  // a depleted forest: only small life remains; everything above must be rebuilt
  for(const k of SPKEYS){const sp=SP[k];const n=sp.tier<=2?Math.round(sp.pop*.4):0;
    for(let i=0;i<n;i++){const p=randLand((b,x,y)=>biomeOkFor(k,b)&&(k==='beetle'||k==='snail'||Math.hypot(x-SPAWN.x,y-SPAWN.y)>150));spawnCreature(k,p.x,p.y)}}
  Object.assign(ECO,{h:0,hold:0,counts:{},births:0,pBirths:0,returned:0,best:0,capAll:.6,capSp:{},lv:0});
}
function ecoCounts(){const n={};for(const k of SPKEYS)n[k]=0;for(const c of creatures)if(!c.dead&&n[c.key]!==undefined)n[c.key]++;return n}
function preyRatio(sp,n){let have=0,want=0;for(const k of SPKEYS){const s=SP[k];if(sp.diet.includes(s.tier)){have+=Math.min(n[k],s.pop*1.4);want+=s.pop}}return want?have/want:0}
function ecoHealth(n){let t=0;for(const k of SPKEYS){const c=n[k]|0,T=SP[k].pop;t+=c===0?0:Math.min(c/T,1)*(c>T*1.7?.7:1)}return t/SPKEYS.length*100}
function spawnReturning(k,count){
  for(let i=0;i<count;i++){const p=randLand((b,x,y)=>biomeOkFor(k,b)&&!nearAnyPlayer(x,y,240));const c=spawnCreature(k,p.x,p.y,SP[k].life*rnd(.25,.4));c.sex=i%2}
}
function ecoTick(){ // once a second, co-op only
  const n=ecoCounts();ECO.counts=n;
  const foodR=clamp(foods.length/(200*POPK),0,1.3);
  for(const k of SPKEYS){const sp=SP[k],cnt=n[k],T=sp.pop;
    const meat=sp.diet.length?preyRatio(sp,n):0,fr=sp.diet.length?(sp.plants?Math.max(foodR,meat):meat):foodR;
    if(cnt>=2){
      const rate=.009*(cnt+T*.18)*Math.min(fr,1.2)*Math.max(0,1-cnt/(T*ecoCap(k)));
      if(Math.random()<rate){const ad=creatures.filter(c=>!c.dead&&c.key===k&&c.stage===1&&!c.pl);if(ad.length){const par=pick(ad);const ch=spawnCreature(k,par.x+rnd(-6,6),par.y+rnd(-6,6),0);if(!canEnter(ch,biomeAt(ch.x,ch.y))){ch.x=par.x;ch.y=par.y}ECO.births++}}
    }
    const ready=sp.diet.length?meat>=.48:foodR>.45;
    if(cnt===0&&ready&&Math.random()<.03){spawnReturning(k,2+POPK);ECO.returned++;logEco(`生態系が《${sp.name}》を呼び戻した`,'eco');ecoNote(`《${sp.name}》が森に戻ってきた`)}
    else if(cnt===1&&ready&&Math.random()<.015){spawnReturning(k,1)}
    // starvation keeps predators honest
    const hungry=sp.diet.length&&!sp.plants?meat<.22:foodR<.12;
    if(cnt>0&&hungry&&Math.random()<.03*cnt){const v=creatures.filter(c=>!c.dead&&c.key===k&&!c.pl);if(v.length)killedByEnv(pick(v),'starve')}
  }
  ECO.h=ecoHealth(n);ECO.best=Math.max(ECO.best,ECO.h);
  if(MATCH.phase==='play'){if(ECO.h>=ECO_GOAL)ECO.hold++;else ECO.hold=Math.max(0,ECO.hold-2);
    if(ECO.hold>=ECO_HOLD){MATCH.winner={coop:true,name:'',ai:false,me:true,t:MATCH.t,id:'coop'};MATCH.phase='end';setTimeout(showResult,600)}}
}
function ecoBoost(k){ECO.capSp[k]=Math.min(.8,(ECO.capSp[k]||0)+.2);ECO.capAll=Math.min(1.2,ECO.capAll+.06);ECO.lv++;ecoNote(`森の活力が増した（Lv${ECO.lv}）— 《${SP[k].name}》の繁殖地が広がった`)}
function ecoNote(t){for(const pl of PLAYERS)note(pl,'t','生態系の回復',t)}
function initWorld(){
  creatures=[];foods=[];clouds=[];particles=[];decals=[];rivals=[];fireflies=[];SKF=[];AFTER=[];SLIME=[];
  for(const m of mushrooms){m.ready=true;m.t=0}
  if(MATCH.kind==='coop')populateCoop();else populate(true);
  for(let i=0;i<260*POPK;i++)spawnFood();
  for(let i=0;i<RIVALN();i++)spawnRival(true);
}

// ================================================================
//  PLAYERS & MATCH
// ================================================================
const NET={api:null,status:'idle',connected:false,name:'',code:'',role:null,sync:null,info:null,remote:new Map(),myPeer:null,
  ghosts:new Map(),lastSnapObj:null,lastInfoObj:null,lastEv:-1,lastFx:-1,snapT:0,infoT:0,lobbyT:0,inT:0,lastIn:'',hostSeen:0,
  cnt:{a:0,s:0,cy:0,sl:0,sli:-1,tc:0,tci:-1},rank:[],winner:null,seed:0,phase:'',dayT:.06};
const MATCH={mode:'solo',kind:'race',phase:'play',winner:null,t:0};
const ECO={h:0,hold:0,counts:{},births:0,pBirths:0,returned:0,best:0,capAll:.6,capSp:{},lv:0};
const ecoCap=k=>Math.min(1.5,ECO.capAll+(ECO.capSp[k]||0));
const ECO_GOAL=70,ECO_HOLD=60;
let PLAYERS=[];
function mkInput(){return{mx:0,my:0,mag:0,atk:false,atkP:false,skillP:false,court:false,od:false,cyst:false,purge:false,obs:false,cycleP:false,slotP:-1}}
function newPlayer(o){return Object.assign({id:'local',name:'あなた',local:false,remote:false,c:null,adr:0,nutr:0,slots:[],gen:1,sel:0,idleT:0,od:false,susp:0,toxin:0,dry:0,
  holdT:0,holdKind:'',holdTarget:null,purgeT:0,cystT:0,skillCd:{},bestTier:0,bestName:'寄生幼生',time:0,mimic:false,cyst:null,echo:false,critT:0,inBush:false,kills:0,
  atkDip:0,ringVis:1,lastHp:0,lastAdr:0,threat:null,beat:0,beatPh:0,flash:0,hurtT:0,cause:'',transfers:0,dead:false,pendingTrait:null,ptT:0,inp:mkInput(),ev:[],evSeq:0,
  hint:{},respawnT:0,_crit:false,acc:0},o||{})}
let P=newPlayer({local:true});
function resetPlayerState(){P=newPlayer({local:true,name:NET.name||'あなた'});P.inp=IN;PLAYERS=[P];if(MAPV.fog)mapResetFog();MAPV.open=false;show('mapv',false)}
// feedback to one player: applied here if local, queued for the network if remote
function note(pl,k,a,b){if(!pl)return;
  if(pl.local){if(k==='t'){toast(a,b);if(a==='生態系の回復')jingle('chime')}else if(k==='s')sfx(a,b);else if(k==='k')cam.shake=Math.max(cam.shake,a);else if(k==='f')pl.flash=Math.max(pl.flash,a);else if(k==='h')pl.hurtT=.4;else if(k==='lo'&&MATCH.mode==='solo')slowT=a;return}
  if(pl.remote&&k!=='lo'){pl.ev.push([++pl.evSeq,k,a===undefined?0:a,b===undefined?0:b,performance.now()]);if(pl.ev.length>8)pl.ev.shift()}}
// world fx mirrored to remote viewers
let FXQ=[],fxSeq=0;
function netFx(k,x,y,a,b){if(MATCH.mode!=='host'||NET.remote.size===0)return;let near=false;for(const [,p] of NET.remote){const c=p.c;if(c&&Math.abs(c.x-x)+Math.abs(c.y-y)<520){near=true;break}}if(!near)return;FXQ.push([++fxSeq,k,Math.round(x),Math.round(y),a===undefined?0:a,b===undefined?0:b,performance.now()]);if(FXQ.length>28)FXQ.shift()}
function playerOfName(pl){return pl.local&&MATCH.mode==='solo'?'あなた':pl.name}
function declareWinner(name,ai,pl){
  if(MATCH.phase!=='play'||MATCH.winner)return;
  MATCH.winner={name,ai,me:pl===P,t:MATCH.t,id:pl?pl.id:''};MATCH.phase='end';
  if(MATCH.mode==='host')NET.winner=MATCH.winner;
  setTimeout(()=>showResult(),pl===P?1800:600);
}
const ACC_T=0,ACC_I=0; // acclimation after a takeover (disabled after balance tests)
const canUsurp=(pred,prey)=>pred.sp.tier<=Math.max(prey.sp.tier+1,2);
function checkApex(pl){if(MATCH.kind==='race'&&pl&&pl.c&&pl.c.sp.tier>=6)declareWinner(pl.name,false,pl)}

// ================================================================
//  TRAITS / HELPERS
// ================================================================
function slotsOf(c){return c.pl?c.pl.slots:c.rival?c.rival.slots:c.traits}
function traitList(c){if(!c)return[];const s=[];if(c.sp.trait)s.push(c.sp.trait);const ex=slotsOf(c);if(ex)for(const t of ex)if(t&&!s.includes(t))s.push(t);return s}
function hasTrait(c,k){if(c.sp.trait===k)return true;const ex=slotsOf(c);return !!(ex&&ex.includes(k))}
function canEat(a,t){if(!a||!t||a===t||a.dead||t.dead)return false;if(a.feral)return t.pl?t.sp.tier<=a.sp.tier+1:(t.sp.tier<=a.sp.tier&&t.key!=='larva');return a.sp.diet.includes(t.sp.tier)}
function isFlying(c){return (c.sp.fly||hasTrait(c,'flight'))&&c.alt>6}
function speedOf(c){const sp=c.sp,st=c.stage;let s=sp.speed*(st===2?.72:st===0?.92:1);
  if(hasTrait(c,'swift'))s*=1.2;if(c.slowT>0)s*=.5;if(c.hiddenT>0)s*=.8;if(c.feral)s*=1.08;
  if(!isFlying(c)){const b=biomeAt(c.x,c.y),aq=sp.hab==='aqua'||sp.hab==='sea'||sp.hab==='marsh';
    if(isWet(b)){if(aq||c.key==='frog'||c.key==='crayfish'){if(hasTrait(c,'swim')&&!aq)s*=1.3}else s*=hasTrait(c,'swim')?1.3:.5}
    else if(aq&&b!==B_SWAMP)s*=.3;
    else if(b===B_SWAMP&&c.key!=='frog'&&c.key!=='snail'&&sp.hab!=='marsh'&&c.key!=='crayfish')s*=.75}
  if(c.pl&&c.pl.od)s*=1.6;return s}
function inBushAt(x,y){const cell=bushGrid[clamp((y/OG)|0,0,OGW-1)*OGW+clamp((x/OG)|0,0,OGW-1)];if(!cell)return null;for(const b of cell){const dx=b.x-x,dy=b.y-y;if(dx*dx+dy*dy<b.r*b.r*.85)return b}return null}
function onScreen(x,y,m=40){return x>cam.x-m&&x<cam.x+GW+m&&y>cam.y-m&&y<cam.y+GH+m}
function nearCam(x,y){return Math.hypot(x-(cam.x+GW/2),y-(cam.y+GH/2))}
function nearAnyPlayer(x,y,d){for(const pl of PLAYERS)if(pl.c&&Math.hypot(pl.c.x-x,pl.c.y-y)<d)return true;return false}

// ================================================================
//  PARTICLES
// ================================================================
const colStr=(r,g,b)=>`rgb(${r*255|0},${g*255|0},${b*255|0})`;
function part(x,y,o){if(particles.length>700)return;const p=Object.assign({x,y,z:0,vx:0,vy:0,vz:0,life:.6,max:.6,r:1,g:1,b:1,emi:0,sz:1,grav:0,drag:2},o);p.max=p.life;p.cs=colStr(p.r,p.g,p.b);p.ce=p.emi?colStr(p.r*p.emi,p.g*p.emi,p.b*p.emi):null;particles.push(p);return p}
function burst(x,y,n,o,spd=40){for(let i=0;i<n;i++){const a=rnd(TAU),s=rnd(.3,1)*spd;part(x,y,Object.assign({vx:Math.cos(a)*s,vy:Math.sin(a)*s,vz:rnd(10,40),grav:90,life:rnd(.3,.8)},o))}}
function blood(x,y,n,col){netFx('b',x,y,n|0,col?1:0);const c=col||[.55,.05,.06];if(!onScreen(x,y,60))return;burst(x,y,n,{r:c[0],g:c[1],b:c[2]},35);for(let i=0;i<Math.min(n,5);i++)decals.push({x:x+rnd(-5,5),y:y+rnd(-5,5),t:30,c:colStr(c[0]*.7,c[1]*.7,c[2]*.7),s:rndi(1,2)});if(decals.length>260)decals.splice(0,decals.length-260)}
function ring(x,y,r,col,life=.5){if(col.length===3&&r>=24)netFx('r',x,y,r|0,(col[0]*9|0)*100+(col[1]*9|0)*10+(col[2]*9|0));particles.push({ring:1,x,y,r0:2,r1:r,life,max:life,col:col.slice(0,3),cs:colStr(...col),ce:colStr(col[0]*.9,col[1]*.9,col[2]*.9)})}
function toastHearts(x,y){netFx('h',x,y);for(let i=0;i<6;i++)part(x+rnd(-6,6),y+rnd(-4,4),{vz:rnd(14,26),vx:rnd(-6,6),life:1.2,r:1,g:.4,b:.6,emi:.7,sz:2,drag:.5,heart:1})}
function sfxAt(n,x,y,base){const d=nearCam(x,y);if(d<320)sfx(n,{v:clamp((base||1)*(1.15-d/320),0,1)});netFx('z',x,y,SFXN.indexOf(n))}
const SFXN=['bite','roar','zap','mist','dig','eat','gulp','birth','transfer'];

// ================================================================
//  SKILL FX — dynamic signature effects for every species' trait.
//  skfx() spawns the visuals locally and mirrors them to remote viewers.
// ================================================================
let SKF=[],AFTER=[],SLIME=[];
const SKFXN=['burrowIn','burrowOut','mist','shock','roar','shell','venom','drain','pincer','frenzy','dive'];
const SKF_TRAIT={burrowIn:'burrow',mist:'mist',shock:'shock',roar:'roar',shell:'shell',venom:'venom',drain:'drain',pincer:'pincer',frenzy:'frenzy',dive:'flight'};
const encOff=(dx,dy)=>(clamp(Math.round(dx),-500,500)+512)*1024+(clamp(Math.round(dy),-500,500)+512);
const decOff=v=>[Math.floor(v/1024)-512,v%1024-512];
function skfx(k,x,y,a,remote){
  if(!remote)netFx('X',x,y,SKFXN.indexOf(k),a===undefined?0:+(+a).toFixed(2));
  if(!onScreen(x,y,140))return;
  const F={k,x,y,t:0,a:a||0};
  switch(k){
  case'burrowIn':F.max=1.5;
    for(let i=0;i<20;i++){const an=rnd(TAU),s=rnd(25,70);part(x,y,{vx:Math.cos(an)*s,vy:Math.sin(an)*s*.7,vz:rnd(40,90),grav:200,drag:.6,life:rnd(.6,1.1),r:rnd(.36,.5),g:rnd(.25,.33),b:.17,sz:rnd(1.4,2.6),chunk:1})}
    for(let i=0;i<10;i++){const an=rnd(TAU);part(x+Math.cos(an)*6,y+Math.sin(an)*4,{vx:Math.cos(an)*30,vy:Math.sin(an)*20,vz:8,life:rnd(.7,1.2),r:.78,g:.66,b:.5,sz:3,drag:2.5,puff:1})}
    F.cracks=Array.from({length:7},(_,i)=>{const an=i/7*TAU+rnd(-.3,.3);return{an,l:rnd(9,16),b:rnd(-.6,.6)}});break;
  case'burrowOut':F.max=.8;
    for(let i=0;i<16;i++){const an=rnd(TAU),s=rnd(20,50);part(x,y,{vx:Math.cos(an)*s,vy:Math.sin(an)*s*.7,vz:rnd(50,100),grav:220,drag:.6,life:rnd(.5,.9),r:.42,g:.3,b:.18,sz:rnd(1.3,2.4),chunk:1})}
    for(let i=0;i<8;i++){const an=i/8*TAU;part(x,y,{vx:Math.cos(an)*45,vy:Math.sin(an)*30,vz:4,life:.8,r:.8,g:.68,b:.52,sz:3,drag:3,puff:1})}break;
  case'mist':F.max=4.6;F.blobs=Array.from({length:9},(_,i)=>({a0:i/9*TAU,rr:rnd(10,30),s:rnd(.6,1.4)*(i%2?1:-1),sz:rnd(11,17),ph:rnd(TAU)}));
    for(let i=0;i<34;i++){const an=F.a+rnd(-.7,.7),s=rnd(50,120);part(x+Math.cos(F.a)*6,y+Math.sin(F.a)*6,{vx:Math.cos(an)*s,vy:Math.sin(an)*s,vz:rnd(2,12),life:rnd(.6,1.2),r:rnd(.45,.65),g:1,b:rnd(.25,.4),emi:.7,sz:rnd(2,3.4),drag:3.2,puff:1})}break;
  case'shock':F.max=.55;F.tg=[];
    for(const o of creatures){if(o.dead)continue;const d=Math.hypot(o.x-x,o.y-y);if(d>4&&d<60&&F.tg.length<6)F.tg.push(o)}
    F.rnd=Array.from({length:6-Math.min(4,F.tg.length)},()=>{const an=rnd(TAU),d=rnd(36,62);return[x+Math.cos(an)*d,y+Math.sin(an)*d*.7]});
    for(let i=0;i<22;i++){const an=rnd(TAU),s=rnd(40,110);part(x,y,{vx:Math.cos(an)*s,vy:Math.sin(an)*s*.7,vz:rnd(10,40),grav:80,life:rnd(.2,.45),r:.75,g:.92,b:1,emi:1.2,sz:1.2,streak:1})}
    if(nearCam(x,y)<200)cam.shake=Math.max(cam.shake,3);break;
  case'roar':F.max=1.3;F.ex=[];
    for(const o of creatures){if(o.dead)continue;const d=Math.hypot(o.x-x,o.y-y);if(d>6&&d<125&&F.ex.length<10)F.ex.push(o)}
    for(let i=0;i<36;i++){const an=rnd(TAU),s=rnd(80,170),leaf=i%3===0;part(x+Math.cos(an)*14,y+Math.sin(an)*10,{vx:Math.cos(an)*s,vy:Math.sin(an)*s*.7,vz:rnd(6,30),grav:leaf?20:60,drag:1.8,life:rnd(.7,1.3),r:leaf?.38:.86,g:leaf?.72:.74,b:leaf?.3:.56,sz:leaf?2:2.6,leaf:leaf?1:0,puff:leaf?0:1})}
    if(nearCam(x,y)<260)cam.shake=Math.max(cam.shake,7);break;
  case'shell':F.max=.5;F.r=Math.max(6,a||8);
    for(let i=0;i<7;i++){const an=rnd(TAU),s=rnd(30,70);part(x+Math.cos(an)*F.r,y+Math.sin(an)*F.r*.7,{vx:Math.cos(an)*s,vy:Math.sin(an)*s,vz:rnd(10,30),grav:90,life:.35,r:1,g:1,b:.85,emi:1,sz:1.4,star:1})}break;
  case'venom':F.max=.55;
    for(let i=0;i<14;i++){const an=F.a+rnd(-1.2,1.2),s=rnd(25,60);part(x,y,{vx:Math.cos(an)*s,vy:Math.sin(an)*s,vz:rnd(20,45),grav:150,life:rnd(.4,.8),r:i%2?.62:.42,g:i%2?.25:1,b:i%2?.9:.35,emi:.8,sz:rnd(1.2,2)})}break;
  case'drain':{F.max=.95;const [dx,dy]=decOff(a||encOff(0,-20));F.ax=x+dx;F.ay=y+dy;F.orbs=Array.from({length:9},()=>({d:rnd(0,.3),bend:rnd(-26,26),z:rnd(4,14)}));
    if(P.c&&Math.hypot(P.c.x-F.ax,P.c.y-F.ay)<P.c.r+6)glyphPop('drain',F.ax,F.ay);break}
  case'pincer':F.max=.55;break;
  case'frenzy':F.max=.4;for(let i=0;i<12;i++){const an=F.a+rnd(-.8,.8),s=rnd(40,90);part(x,y,{vx:Math.cos(an)*s,vy:Math.sin(an)*s,vz:rnd(15,40),grav:140,life:rnd(.4,.7),r:.75,g:.04,b:.08,emi:.35,sz:rnd(1.3,2.2)})}break;
  case'dive':F.max=.5;for(let i=0;i<10;i++){const an=rnd(TAU),s=rnd(15,45);part(x,y,{vx:Math.cos(an)*s,vy:Math.sin(an)*s,vz:rnd(20,40),grav:18,drag:2.2,life:rnd(.9,1.5),r:i%2?.98:.72,g:i%2?.95:.52,b:i%2?.88:.36,sz:1.8,feather:1,sp:rnd(-6,6)})}break;
  }
  SKF.push(F);if(SKF.length>60)SKF.shift();
  // a kanji badge pops over whoever performed it (active skills: anyone; passives: only you)
  const tr=SKF_TRAIT[k];if(!tr)return;
  if(TRAITS[tr].active)glyphPop(tr,x,y);
  else if(k!=='drain'&&P.c&&Math.hypot(P.c.x-x,P.c.y-y)<P.c.r+(k==='shell'?4:40)&&(k==='shell'||(hasTrait(P.c,tr))))glyphPop(tr,k==='shell'?x:P.c.x,k==='shell'?y:P.c.y);
}
function glyphPop(tr,x,y){SKF.push({k:'glyph',x,y,h:P.c&&Math.hypot(P.c.x-x,P.c.y-y)<30?P.c.r*2.4+6:14,t:0,max:1.1,g:TRAITS[tr].g,col:TRAITS[tr].active?'#ffd36a':'#9fe7ff'})}
// jagged bolt via midpoint displacement
function boltPath(x0,y0,x1,y1,j,depth){let pts=[[x0,y0],[x1,y1]];for(let d=0;d<depth;d++){const np=[pts[0]];for(let i=1;i<pts.length;i++){const a=pts[i-1],b=pts[i],mx=(a[0]+b[0])/2,my=(a[1]+b[1])/2,dx=b[0]-a[0],dy=b[1]-a[1],l=Math.hypot(dx,dy)||1,o=rnd(-j,j)*(1/(d+1));np.push([mx-dy/l*o,my+dx/l*o],b)}pts=np}return pts}
function strokePts(ctx,pts,cx,cy){ctx.beginPath();ctx.moveTo(pts[0][0]-cx,pts[0][1]-cy);for(let i=1;i<pts.length;i++)ctx.lineTo(pts[i][0]-cx,pts[i][1]-cy);ctx.stroke()}
// status tells shared by host simulation and remote ghosts
function statusTells(c,dt){
  if(c.poisonT>0&&Math.random()<dt*6)part(c.x+rnd(-c.r,c.r)*.6,c.y+rnd(-3,3),{vz:rnd(12,22),life:rnd(.5,.9),r:Math.random()<.5?.62:.5,g:Math.random()<.5?.3:1,b:.8,emi:.7,sz:rnd(1.4,2.2),drag:.8,bub:1});
  // burrowing: a mound travels underground; popping out throws dirt
  if(c.hiddenT>0){c._hid=1;c._mt=(c._mt||0)-dt;if(c._mt<=0){c._mt=.09;decals.push({x:c.x+rnd(-1,1),y:c.y+1,t:2.5,c:'#7a5230',s:3,mound:1});if(decals.length>260)decals.splice(0,decals.length-260)}}
  else if(c._hid){c._hid=0;skfx('burrowOut',c.x,c.y,0,true)}
  const v=Math.hypot(c.vx||0,c.vy||0),sp=c.sp;
  // fox: speed lines and after-images when sprinting
  if(hasTrait(c,'swift')&&!c.sp.seg&&v>sp.speed*.95){c._ai=(c._ai||0)-dt;if(c._ai<=0){c._ai=.06;AFTER.push({key:c.key,ang:c.ang,ph:c.animT/4*TAU*2,x:c.x,y:c.y,alt:c.alt||0,r:c.r,t:.28,col:c.feral?1:0});if(AFTER.length>40)AFTER.shift()}
    if(Math.random()<dt*22){const b=c.ang+Math.PI,o=rnd(-c.r,c.r);part(c.x+Math.cos(b)*c.r-Math.sin(b)*o,c.y+Math.sin(b)*c.r+Math.cos(b)*o-2,{vx:Math.cos(b)*v*.6,vy:Math.sin(b)*v*.6,life:.22,r:1,g:1,b:1,sz:1,streak:1,drag:1})}
    if(!c.wet&&Math.random()<dt*10)part(c.x+rnd(-3,3),c.y+c.r*.4,{vz:6,life:.5,r:.86,g:.76,b:.58,sz:2.2,drag:3,puff:1})}
  // flight: wing-tip vapour trails at speed
  if(c.alt>6&&v>sp.speed*.7&&Math.random()<dt*24){const s=Math.random()<.5?1:-1,pa=c.ang+s*Math.PI/2,w=c.r*1.25;part(c.x+Math.cos(pa)*w,c.y+Math.sin(pa)*w,{z:c.alt*1.5+c.r*.6,vx:-Math.cos(c.ang)*v*.3,vy:-Math.sin(c.ang)*v*.3,life:.35,r:1,g:1,b:1,sz:.9,streak:1,drag:.5,emi:.15})}
  // swimmers: V-wake + bubbles
  if(c.wet&&hasTrait(c,'swim')&&v>14){c._wk=(c._wk||0)-dt;if(c._wk<=0){c._wk=.12;const b=c.ang+Math.PI;for(const s of[1,-1]){const pa=b+s*.55;part(c.x+Math.cos(b)*c.r*.6,c.y+Math.sin(b)*c.r*.6,{vx:Math.cos(pa)*v*.45,vy:Math.sin(pa)*v*.45,life:.7,r:.92,g:.98,b:1,sz:1.3,drag:1.6,wake:1,ang:pa})}}
    if(Math.random()<dt*5)part(c.x+rnd(-c.r,c.r)*.5,c.y+rnd(-2,2),{vz:rnd(8,16),life:rnd(.5,.9),r:.8,g:.95,b:1,sz:rnd(1,1.8),drag:1,bub:1})}
  // snail: a glistening slime trail
  if(hasTrait(c,'longevity')&&!c.wet&&v>2){const l=SLIME.length&&c._sl;if(!c._sl||Math.hypot(c.x-c._sl.x,c.y-c._sl.y)>3.2){c._sl={x:c.x-Math.cos(c.ang)*c.r*.6,y:c.y-Math.sin(c.ang)*c.r*.6+1,t:9,ang:c.ang,r:c.r*.42};SLIME.push(c._sl);if(SLIME.length>320)SLIME.shift()}}
  // eel: crackling body sparks
  if(c.key==='eel'&&Math.random()<dt*4){const tr=c.trail,p=tr?tr[(Math.random()*Math.min(tr.length,22))|0]:c;part(p.x+rnd(-2,2),p.y+rnd(-2,2),{vz:rnd(5,15),life:.18,r:.8,g:.95,b:1,emi:1.4,sz:1,star:1})}
  // venomous fangs drip
  if(hasTrait(c,'venom')&&Math.random()<dt*1.2)part(c.x+Math.cos(c.ang)*c.r,c.y+Math.sin(c.ang)*c.r,{vz:-4,grav:30,life:.6,r:.55,g:1,b:.4,emi:.8,sz:1.1});
  // a shark scenting blood: red mist trail
  if(hasTrait(c,'frenzy')&&c.hitT>-2&&c.wet&&Math.random()<dt*8)part(c.x-Math.cos(c.ang)*c.r,c.y-Math.sin(c.ang)*c.r,{life:.9,r:.7,g:.06,b:.1,emi:.25,sz:2.6,drag:1.5,puff:1});
}
function fxSkillsTick(dt){
  for(let i=SKF.length-1;i>=0;i--){const F=SKF[i];F.t+=dt;if(F.t>=F.max){SKF.splice(i,1);continue}
    if(F.k==='mist'&&Math.random()<dt*6&&onScreen(F.x,F.y,60)){const an=rnd(TAU),d=rnd(0,34);part(F.x+Math.cos(an)*d,F.y+Math.sin(an)*d*.7,{vz:rnd(6,14),life:rnd(.4,.8),r:.7,g:1,b:.4,emi:.6,sz:rnd(1.4,2.6),drag:1,bub:1})}
    if(F.k==='drain')for(const o of F.orbs){const u=(F.t-o.d)/.6;if(u>=1&&!o.done){o.done=1;part(F.ax+rnd(-3,3),F.ay+rnd(-3,3),{vz:16,life:.5,r:1,g:.3,b:.35,emi:1,sz:1.6,star:1})}}}
  for(let i=AFTER.length-1;i>=0;i--){AFTER[i].t-=dt;if(AFTER[i].t<=0)AFTER.splice(i,1)}
  for(let i=SLIME.length-1;i>=0;i--){SLIME[i].t-=dt;if(SLIME[i].t<=0)SLIME.splice(i,1)}
}
// ---- 3D skill visuals: emitted every frame as ground decals, beams and billboards
function skill3d(){
  for(const F of SKF){const u=F.t/F.max,fa=1-u,x=F.x,y=F.y;if(!F.max||!onScreen(x,y,160))continue;const gy=groundY(x,y);
    switch(F.k){
    case'burrowIn':{const g=Math.min(1,F.t*6);qFlat(x,y,9*g,.29,.19,.12,.6*fa,Q_DISC);
      for(const c of F.cracks){const l=c.l*g*1.3;qBeam(QG,x+Math.cos(c.an)*5,gy+.25,y+Math.sin(c.an)*5,x+Math.cos(c.an+c.b*.3)*l,gy+.25,y+Math.sin(c.an+c.b*.3)*l,.55,.2,.13,.08,.8*fa,0,1)}break}
    case'roar':{for(let w=0;w<3;w++){const uu=(F.t-w*.16)/.75;if(uu<0||uu>1)continue;const r=10+uu*125,al=1-uu;
        qFlat(x,y,r,1,.97,.88,al*.6,Q_RING,.05+.04*(1-uu),0);qFlat(x,y,r*.97,1,.6,.22,al*.8,Q_RING,.04,1)}
      for(let i=0;i<16;i++){const aa=i/16*TAU+x,r0=18+u*110,r1=r0+12+u*10;qBeam(QA,x+Math.cos(aa)*r0,gy+3+u*4,y+Math.sin(aa)*r0,x+Math.cos(aa)*r1,gy+4+u*6,y+Math.sin(aa)*r1,.8,1,.82,.5,fa*.6,.8)}
      qFlat(x,y,120*(.4+u),1,.5,.15,.3*fa,Q_GLOW,0,1);break}
    case'mist':{const grow=Math.min(1,F.t/.45),fade=Math.min(1,(F.max-F.t)/.8);
      for(const b of F.blobs){const an=b.a0+F.t*b.s*.9,r=b.rr*grow,px=x+Math.cos(an)*r,py=y+Math.sin(an)*r,sz=b.sz*(.8+.2*Math.sin(F.t*3+b.ph))*grow;
        qBill(px,gy+3+sz*.45,py,sz*1.25,.82,1,.45,.42*fade,Q_PUFF,.15);qBill(px+sz*.3,gy+2+sz*.3,py+sz*.2,sz*.7,.62,.36,.9,.3*fade,Q_PUFF,.1)}
      qFlat(x,y,62,.4,1,.25,.2*fade,Q_GLOW,0,1);break}
    case'shock':{if(!F.paths||F.t-(F.pt||0)>.045){F.pt=F.t;F.paths=[];
        for(const o of F.tg)F.paths.push(boltPath(x,y,o.x,o.y,9,4));for(const p of F.rnd)F.paths.push(boltPath(x,y,p[0],p[1],7,3));
        const ex=[];for(const p of F.paths)if(Math.random()<.5){const m=p[(p.length*.5)|0],an=rnd(TAU);ex.push(boltPath(m[0],m[1],m[0]+Math.cos(an)*12,m[1]+Math.sin(an)*10,4,2))}F.paths.push(...ex)}
      const fl=fa*(.7+.3*Math.random());
      for(const p of F.paths){const h0=gy+4,e=p[p.length-1],h1=groundY(e[0],e[1])+3,n=p.length-1;
        for(let i=1;i<=n;i++){const a=p[i-1],b=p[i],ha=lerp(h0,h1,(i-1)/n)+((i-1)&1?1.6:-.4),hb=lerp(h0,h1,i/n)+(i&1?1.6:-.4);
          qBeam(QA,a[0],ha,a[1],b[0],hb,b[1],1.5,.4,.75,1,fl*.9,1);qBeam(QA,a[0],ha,a[1],b[0],hb,b[1],.5,1,1,1,fl,.9)}}
      for(const o of F.tg)qBill(o.x,groundY(o.x,o.y)+o.r,o.y,o.r*2+4,.55,.8,1,.6*fa,Q_GLOW,1);
      qFlat(x,y,60,.5,.75,1,.4*fa,Q_GLOW,0,1);break}
    case'shell':{const s=1+.35*(1-Math.min(1,F.t/.12)),r=(F.r+5)*s*1.25;qBill(x,gy+F.r*.8,y,r,.66,.94,1,fa,Q_HEX,.85);qBill(x,gy+F.r*.8,y,r*1.3,.6,.9,1,.3*fa,Q_GLOW,1);break}
    case'venom':{const an=F.a,cl=Math.min(1,F.t/.12),h=gy+5;
      for(const s of[1,-1]){const ox=-Math.sin(an)*s*4.5,oy=Math.cos(an)*s*4.5,len=12*(1-cl*.5),x0=x+ox-Math.cos(an)*len,y0=y+oy-Math.sin(an)*len,x1=x+Math.cos(an)*2+ox*.2,y1=y+Math.sin(an)*2+oy*.2;
        qBeam(QA,x0,h+7,y0,x1,h-2,y1,1.3,.77,.42,1,fa,.7,0);qBeam(QA,x0,h+7,y0,x1,h-2,y1,.45,.84,1,.48,fa,.8,0)}break}
    case'drain':for(const o of F.orbs){const uu=(F.t-o.d)/.6;if(uu<0||uu>1)continue;const e=uu*uu*(3-2*uu),mx=(x+F.ax)/2,my=(y+F.ay)/2,dx=F.ax-x,dy=F.ay-y,l=Math.hypot(dx,dy)||1,qx=mx-dy/l*o.bend*.6,qy=my+dx/l*o.bend*.6;
        const px=(1-e)*(1-e)*x+2*(1-e)*e*qx+e*e*F.ax,py=(1-e)*(1-e)*y+2*(1-e)*e*qy+e*e*F.ay,h=groundY(px,py)+3+Math.sin(uu*Math.PI)*(4+o.z*.4);
        qBill(px,h,py,1.5,.95,.14,.22,1,Q_DISC,.2);qBill(px,h,py,3.6,1,.2,.25,.5,Q_GLOW,1)}break;
    case'pincer':{const an=F.a,cl=Math.min(1,F.t/.14),open=(1-cl)*1.0+.06,R=11,h=gy+4,al=Math.min(1,fa*1.6);
      for(const s of[1,-1]){const bx=x-Math.cos(an)*R*.8,by=y-Math.sin(an)*R*.8,a2=an+s*open,ex=bx+Math.cos(a2)*R*1.9,ey=by+Math.sin(a2)*R*1.9;
        qBeam(QA,bx,h,by,ex,h,ey,2.4,1,.42,.22,al,.25,0);qBeam(QA,bx,h,by,ex,h,ey,.8,1,.9,.7,al,.5,0)}
      if(F.t>.12&&F.t<.3){const p=(F.t-.12)/.18;qBill(x+Math.cos(an)*R*.9,h,y+Math.sin(an)*R*.9,7+p*7,1,.96,.78,1-p,Q_STAR,.8,p*2)}break}
    case'frenzy':{const an=F.a;for(let i=0;i<3;i++){const uu=clamp((F.t-i*.05)/.22,0,1);if(uu<=0||uu>=1)continue;const o=(i-1)*5,cx=x-Math.sin(an)*o,cy=y+Math.cos(an)*o,d2=an+1.05,L=15*(.5+uu*.5),w=2.6*(1-uu)+.5,h=gy+6;
        const x0=cx-Math.cos(d2)*L,y0=cy-Math.sin(d2)*L,x1=cx+Math.cos(d2)*L,y1=cy+Math.sin(d2)*L;
        qBeam(QA,x0,h+7,y0,x1,h-4,y1,w,1,.16,.16,1-uu,.8,0);qBeam(QA,x0,h+7,y0,x1,h-4,y1,w*.3,1,1,1,(1-uu)*.9,.6,0)}
      qFlat(x,y,34,1,.1,.1,.35*fa,Q_GLOW,0,1);break}
    case'dive':{const an=F.a;for(let i=0;i<7;i++){const o=(i-3)*3.4,bx=x-Math.cos(an)*(26+u*8)-Math.sin(an)*o,by=y-Math.sin(an)*(26+u*8)+Math.cos(an)*o;
        qBeam(QA,bx,gy+26+Math.abs(o)*.5,by,lerp(bx,x,.8),gy+5,lerp(by,y,.8),.45,1,1,1,fa*.8,.6,0)}break}
    }}
}
// crisp overlay: kanji badges and "!" over startled creatures
function renderSkillUI(u){
  u.textAlign='center';
  for(const F of SKF){
    if(F.k==='glyph'){const p=F.t/F.max,pop=p<.15?.6+p/.15*.6:p<.25?1.2-(p-.15)/.1*.2:1,[sx,sy,ok]=toS3(F.x,groundY(F.x,F.y)+(F.h||14)+p*7,F.y);if(!ok)continue;const r=15*pop;
      u.globalAlpha=p>.7?1-(p-.7)/.3:1;u.fillStyle='rgba(30,22,60,.82)';u.beginPath();u.arc(sx,sy,r,0,TAU);u.fill();u.lineWidth=2;u.strokeStyle=F.col;u.stroke();
      u.fillStyle=F.col;u.font=`900 ${Math.round(17*pop)}px 'M PLUS Rounded 1c', sans-serif`;u.fillText(F.g,sx,sy+6*pop);u.globalAlpha=1}
    else if(F.k==='roar'&&F.t>.08){for(const o of F.ex){if(o.dead)continue;const p=(F.t-.08)/(F.max-.08),b=Math.abs(Math.sin(p*9))*3*(1-p);
      const [sx,sy,ok]=toS3(o.x,(o._y3===undefined?groundY(o.x,o.y):o._y3)+o.r*((MODEL_H[o.key]||1.2)+.6)+b,o.y);if(!ok)continue;
      u.globalAlpha=Math.min(1,(1-p)*2);u.font="900 17px 'M PLUS Rounded 1c', sans-serif";u.lineWidth=3;u.strokeStyle='#2a1a10';u.strokeText('!',sx,sy);u.fillStyle='#ffe14a';u.fillText('!',sx,sy);u.globalAlpha=1}}
  }
}

// ================================================================
//  COMBAT & LIFE EVENTS
// ================================================================
function bite(att,t,mult=1){
  if(t.dead||t.hiddenT>0)return;
  if(isFlying(t)&&!isFlying(att)&&!t.pl&&!t.rival)return;
  const ap=att.pl,tp=t.pl;
  let dmg=att.atk*mult*rnd(.85,1.15);if(ap&&ap.od)dmg*=1.5;
  const ba=Math.atan2(t.y-att.y,t.x-att.x);
  if(hasTrait(att,'frenzy')&&t.hp/t.maxhp<.5){dmg*=1.45;skfx('frenzy',t.x,t.y,ba)}
  if(hasTrait(t,'shell')){dmg*=.65;skfx('shell',t.x,t.y,t.r)}
  if(isFlying(att)&&!isFlying(t))skfx('dive',t.x,t.y,ba);
  t.hp-=dmg;
  if(hasTrait(att,'drain')){att.hp=Math.min(att.maxhp,att.hp+dmg*.35);skfx('drain',t.x,t.y,encOff(att.x-t.x,att.y-t.y))}
  if(hasTrait(att,'pincer')&&Math.random()<.3){t.stun=Math.max(t.stun,.7);skfx('pincer',t.x,t.y,ba)}
  t.hitT=.14;const a=Math.atan2(t.y-att.y,t.x-att.x);t.vx+=Math.cos(a)*60;t.vy+=Math.sin(a)*60;
  t.lastAtt=att;t.lastAttT=3;
  if(hasTrait(att,'venom')){t.poisonT=3.2;t.poisonDps=1+att.atk*.22;t.poisonSrc=att;skfx('venom',t.x,t.y,ba)}
  blood(t.x,t.y,4+(dmg|0));
  const d=nearCam(t.x,t.y);if(d<300)sfx('bite',{v:clamp(1-d/300,0,1)});
  if(t.rival)t.rival.adr=Math.min(100,t.rival.adr+16);
  if(tp){tp.adr=Math.min(100,tp.adr+18*ageMul(tp));tp.ringVis=1;note(tp,'k',3);note(tp,'h');note(tp,'s','hurt')}
  if(ap){if(canEat(t,att))ap.adr=Math.min(100,ap.adr+9*ageMul(ap));note(ap,'k',1.5);ap.idleT=0}
  if(!tp&&!t.feral&&t.sp.tier>=att.sp.tier&&!t.rival){t.target=att}
  else if(!tp){t.fear=Math.max(t.fear,1.5);t.fearSrc=att}
  if(t.hp<=0)killed(t,att,'bite');
}
function ageMul(pl){const c=pl.c;if(!c)return 1;let m=c.stage===2?.45:1;if(hasTrait(c,'swift'))m*=1.2;if(pl.od)m*=1.6;return m}
function removeCreature(c){c.dead=true;if(c.rival&&c.rival.c===c)c.rival.c=null}
function setHost(pl,c){if(pl.c&&pl.c.pl===pl)pl.c.pl=null;pl.c=c;if(c)c.pl=pl}
function feed(c,prey){const gain=1+prey.sp.tier*.7+Math.min(prey.growth,10)*.25;c.growth+=gain*.55;c.hunger=0;recalc(c);c.hp=Math.min(c.maxhp,c.hp+c.maxhp*.35);
  c.state='eat';c.eatT=1.3;
  if(c.pl){c.pl.nutr+=gain*4;c.pl.kills++;note(c.pl,'s','eat');burst(c.x,c.y,8,{r:.9,g:.75,b:.3,emi:.4},25)}}
function killed(t,killer,how){
  if(t.dead)return;
  if(t.pl){playerKilled(t.pl,t,killer,how);return}
  if(t.rival){rivalKilled(t,killer,how)}
  if(killer&&!killer.dead&&(how==='bite'||how==='shock')&&canEat(killer,t))feed(killer,t);
  blood(t.x,t.y,10);removeCreature(t);
}
function killedByEnv(t,how){killed(t,null,how)}

// ---------------- player transitions
function playerKilled(pl,t,killer,how){
  const isLarva=t.key==='larva';
  if(killer&&(how==='bite'||how==='shock')&&canEat(killer,t)){
    if(pl.idleT>1.4&&pl.adr<25){ // motionless -> the predator refuses a "sick" body
      note(pl,'t','捕食者はあなたを「病気の個体」と見なした','噛み殺されたが摂食されず、幼生として排出された');
      killer.state='wander';killer.target=null;killer.fear=2;killer.fearSrc=t;
      if(isLarva){t.hp=t.maxhp*.5;t.vx=rnd(-80,80);t.vy=rnd(-80,80);pl.adr=0;return}
      blood(t.x,t.y,12);removeCreature(t);becomeLarva(pl,t.x,t.y);return}
    const thr=(killer.rival||killer.pl)?50:100;
    if(pl.adr>=thr-.01&&pl.acc>0){
      note(pl,'t','まだ肉体に馴染んでいない','乗っ取りに失敗し、幼生として吐き出された');killer.state='eat';killer.eatT=1.2;
      blood(t.x,t.y,10);removeCreature(t);t.pl=null;feed(killer,t);becomeLarva(pl,killer.x+rnd(-10,10),killer.y+rnd(-10,10));return}
    if(pl.adr>=thr-.01&&!canUsurp(killer,t)){ // too mighty a stomach to hijack
      note(pl,'t','格上すぎて乗っ取れない','強大な胃袋に押し戻され、幼生として吐き出された');killer.state='eat';killer.eatT=1.2;
      blood(t.x,t.y,10);removeCreature(t);t.pl=null;feed(killer,t);becomeLarva(pl,killer.x+rnd(-10,10),killer.y+rnd(-10,10));return}
    if(pl.adr>=thr-.01){takeover(pl,killer,t,!!(killer.rival||killer.pl));return}
    blood(t.x,t.y,14);removeCreature(t);t.pl=null;feed(killer,t);
    fullLoss(pl,'消化された','アドレナリンが不足したまま捕食され、胃酸に溶かされた。');return}
  blood(t.x,t.y,10);removeCreature(t);
  if(isLarva){fullLoss(pl,how==='dry'?'干からびた':'幼生は死んだ',how==='dry'?'宿主を見つけられず、幼生は乾ききった。':'無防備な幼生は命を落とした。');return}
  const msg=how==='old'?'宿主が老衰で息絶えた':how==='poison'?'宿主は毒に倒れた':how==='swamp'?'宿主は毒沼に沈んだ':'宿主が命を落とした';
  note(pl,'t',msg,'無防備な幼生として外へ逃れた');becomeLarva(pl,t.x,t.y);
}
function becomeLarva(pl,x,y){
  const l=spawnCreature('larva',x,y,0);l.vx=rnd(-60,60);l.vy=rnd(-60,60);setHost(pl,l);pl.dry=0;pl.adr=0;pl.toxin=0;pl.idleT=0;note(pl,'f',.3);note(pl,'s','eject');
  for(let i=0;i<14;i++)part(x,y,{vx:rnd(-50,50),vy:rnd(-50,50),vz:rnd(10,40),grav:80,life:.8,r:.8,g:.4,b:1,emi:.8});
  return l;
}
function ejectFromHost(pl,reason){
  const h=pl.c;if(!h||h.key==='larva')return;
  h.feral=true;h.traits=pl.slots.slice();h.rival=null;h.state='wander';h.target=null;h.stun=1.2;
  const l=becomeLarva(pl,h.x+rnd(-8,8),h.y+rnd(-8,8));
  recalc(h);h.hp=h.maxhp;
  logEco(`野良化した《${h.sp.name}》がフィールドを徘徊している…`,'feral');
  l.vx=Math.cos(h.ang+Math.PI)*90;l.vy=Math.sin(h.ang+Math.PI)*90;
  note(pl,'t',reason==='purge'?'寄生を強制パージした':'寄生が剥がれた！','残された宿主は野良化し、あなたを狙う');note(pl,'k',5);
}
function takeover(pl,newHost,oldHost,jack){
  const oldTrait=oldHost.sp.trait;
  if(newHost.rival){const r=newHost.rival;newHost.rival=null;r.c=null;rivalToLarva(r,newHost.x,newHost.y)}
  if(newHost.pl&&newHost.pl!==pl){const op=newHost.pl;newHost.pl=null;op.c=null;becomeLarva(op,newHost.x+rnd(-6,6),newHost.y+rnd(-6,6));note(op,'t','体内から肉体を奪われた！','呑み込んだ獲物の正体は寄生体だった');note(op,'k',7)}
  blood(oldHost.x,oldHost.y,8);oldHost.pl=null;removeCreature(oldHost);
  newHost.feral=false;newHost.traits=null;newHost.state='wander';newHost.target=null;newHost.stun=0;newHost.fear=0;newHost.alt=newHost.sp.fly?14:0;
  pl.c=null;setHost(pl,newHost);newHost.hp=Math.max(newHost.hp,newHost.maxhp*.6);
  pl.adr=0;pl.gen++;pl.transfers++;pl.dry=0;pl.toxin=0;pl.acc=ACC_T;note(pl,'f',1);note(pl,'lo',.9);note(pl,'k',6);
  sfxAt('transfer',newHost.x,newHost.y,.8);note(pl,'s','transfer');ring(newHost.x,newHost.y,60,[.8,.4,1],.8);
  for(let i=0;i<30;i++)part(newHost.x,newHost.y,{vx:rnd(-90,90),vy:rnd(-90,90),vz:rnd(10,50),grav:60,life:rnd(.5,1.2),r:.85,g:.45,b:1,emi:1,sz:rndi(1,2)});
  updateBest(pl);
  note(pl,'t',jack?'下剋上ジャック成功！':'水平感染 — 乗っ取り成功',`《${newHost.sp.name}》の肉体を奪った`);
  if(jack)logEco('ある寄生体が体内から弾き出された','');
  offerTrait(pl,oldTrait);
  checkApex(pl);
}
function infectHost(pl,t){
  const l=pl.c;l.pl=null;removeCreature(l);pl.c=null;setHost(pl,t);t.state='wander';t.target=null;t.feral=false;pl.gen++;pl.dry=0;pl.adr=0;pl.acc=ACC_I;note(pl,'f',.6);note(pl,'s','transfer');
  for(let i=0;i<18;i++)part(t.x,t.y,{vx:rnd(-50,50),vy:rnd(-50,50),vz:rnd(10,30),grav:60,life:.8,r:.85,g:.45,b:1,emi:1});
  updateBest(pl);note(pl,'t','寄生成功',`《${t.sp.name}》の肉体を乗っ取った`);
}
function mateWith(pl,partner){
  const h=pl.c;const x=(h.x+partner.x)/2,y=(h.y+partner.y)/2;
  const child=spawnCreature(h.key,x+rnd(-4,4),y+rnd(-4,4),0);
  child.growth=h.growth*.6+partner.growth*.2+1;recalc(child);child.hp=child.maxhp;child.ang=h.ang;
  toastHearts(x,y);burst(x,y,14,{r:1,g:.5,b:.7,emi:.6},30);
  h.state='wander';partner.state='wander';partner.courtT=0;
  if(MATCH.kind==='coop'){for(let i=0;i<2;i++){const sib=spawnCreature(h.key,x+rnd(-8,8),y+rnd(-8,8),0);sib.growth=child.growth*.8;recalc(sib);sib.hp=sib.maxhp;if(!canEnter(sib,biomeAt(sib.x,sib.y))){sib.x=child.x;sib.y=child.y}}ECO.pBirths+=3;ECO.births+=3;ecoBoost(h.key)}
  setHost(pl,child);pl.gen++;pl.transfers++;pl.adr=0;note(pl,'f',.7);note(pl,'lo',.6);note(pl,'s','birth');
  ring(child.x,child.y,40,[1,.6,.8],.7);
  note(pl,'t','垂直感染 — 子孫へ乗り換えた',MATCH.kind==='coop'?`子が3匹生まれた。寿命100%の《${h.sp.name}》として生まれ直した`:`寿命100%の《${h.sp.name}》として生まれ直した`);
}
function updateBest(pl){if(pl.c&&pl.c.sp.tier>pl.bestTier){pl.bestTier=pl.c.sp.tier;pl.bestName=pl.c.sp.name}}
function fullLoss(pl,title,msg){
  if(pl.cyst){const cy=pl.cyst;pl.cyst=null;pl.slots=cy.slots.slice();pl.nutr=cy.nutr;pl.c=null;
    note(pl,'t','分身シストから再生した','保険セーブの卵が孵化した');becomeLarva(pl,cy.x,cy.y);note(pl,'f',1);return}
  pl.c=null;pl.cause=title;
  if(MATCH.mode==='solo'){pl.dead=true;setTimeout(()=>showOver(title,msg),900);return}
  // online race: you lose everything but keep racing from a fresh larva
  pl.slots=[];pl.nutr=0;pl.respawnT=5;pl.adr=0;
  note(pl,'t','完全ロスト — '+title,'5秒後、森のどこかで新たな幼生として再出発する');note(pl,'s','eject');
}
function spawnPoint(pl){
  if(pl.local&&!pl._spawned){pl._spawned=true;return{x:SPAWN.x,y:SPAWN.y}}
  for(let t=0;t<200;t++){const p=randLand(b=>b===B_GRASS||b===B_FOREST);if(!nearAnyPlayer(p.x,p.y,380)&&p.y<WORLD-650)return p}
  return randLand(b=>b===B_GRASS);
}
function spawnPlayer(pl){
  const p=spawnPoint(pl);pl.c=null;pl._spawned=true;
  for(let i=0;i<5;i++){const a=rnd(TAU),d=rnd(40,90);spawnCreature(i%2?'snail':'beetle',p.x+Math.cos(a)*d,p.y+Math.sin(a)*d,rnd(20,40))}
  const l=spawnCreature('larva',p.x,p.y,0);setHost(pl,l);pl.dry=0;pl.adr=0;pl.dead=false;pl.respawnT=0;
  return l;
}

// ---------------- trait inheritance
let pendingTrait=null;
function offerTrait(pl,tk){
  if(!tk)return;if(pl.slots.includes(tk)){note(pl,'t','',`形質『${TRAITS[tk].name}』はすでに保持している`);return}
  if(pl.slots.length<3){pl.slots.push(tk);if(pl.local){setTimeout(()=>toast('キメラ化',`形質『${TRAITS[tk].name}』をスロットに保存した`),1400);renderSlots()}else note(pl,'t','キメラ化',`形質『${TRAITS[tk].name}』をスロットに保存した`);return}
  pl.pendingTrait=tk;pl.ptT=25;
  if(pl.local)openTraitModal(tk,pl.slots);
}
function openTraitModal(tk,slots){
  pendingTrait=tk;if(MATCH.mode==='solo')modalOpen=true;
  document.getElementById('traitMsg').innerHTML=`前の宿主のDNA <b style="color:#ffcf80">『${TRAITS[tk].name}』</b>：${TRAITS[tk].desc}<br>置き換えるスロットを選んでください（形質スロット上限 3）${MATCH.mode==='solo'?'':'<br><span style="color:#ff9a8a">※対戦中は時間が止まりません</span>'}`;
  const box=document.getElementById('traitCards');box.innerHTML='';
  slots.forEach((s,i)=>{const d=document.createElement('div');d.className='tcard';d.tabIndex=0;d.innerHTML=`<div class="g">${TRAITS[s].g}</div><b>${TRAITS[s].name}</b><br><span style="color:#a99bbf">${TRAITS[s].desc}</span><br><span style="color:#ffcf80">→ 置き換える [${i+1}]</span>`;d.onclick=()=>chooseTrait(i);box.appendChild(d)});
  const nd=document.createElement('div');nd.className='tcard new';nd.innerHTML=`<div class="g">${TRAITS[tk].g}</div><b>NEW: ${TRAITS[tk].name}</b><br><span style="color:#cbbde0">${TRAITS[tk].desc}</span>`;box.appendChild(nd);
  show('trait',true);
}
function applyTraitChoice(pl,i){if(!pl.pendingTrait)return;if(i>=0&&i<pl.slots.length)pl.slots[i]=pl.pendingTrait;pl.pendingTrait=null;pl.ptT=0}
function chooseTrait(i){
  if(!pendingTrait)return;
  if(MATCH.mode==='client'){NET.cnt.tc++;NET.cnt.tci=i;NET._ptShown=pendingTrait}
  else applyTraitChoice(P,i);
  pendingTrait=null;modalOpen=false;show('trait',false);renderSlots();sfx('ui')}

// ---------------- skills
function activeTraits(c){return traitList(c).filter(k=>TRAITS[k].active)}
function useSkill(c,k){
  const cdStore=c.pl?c.pl.skillCd:(c.skc||(c.skc={}));
  if((cdStore[k]||0)>0)return false;cdStore[k]=TRAITS[k].cd;
  if(k==='burrow'){c.hiddenT=3;skfx('burrowIn',c.x,c.y);sfxAt('dig',c.x,c.y,c.pl?1:.4);if(c.pl)note(c.pl,'t','','地中に潜った')}
  else if(k==='mist'){clouds.push({x:c.x,y:c.y,r:44,t:4.5,owner:c});netFx('m',c.x,c.y);sfxAt('mist',c.x,c.y,c.pl?1:.4);skfx('mist',c.x,c.y,c.ang)}
  else if(k==='shock'){skfx('shock',c.x,c.y);ring(c.x,c.y,60,[.6,.85,1],.45);ring(c.x,c.y,34,[1,1,.6],.3);sfxAt('zap',c.x,c.y);if(c.pl)note(c.pl,'k',4);
    for(let i=0;i<16;i++){const a=rnd(TAU),d=rnd(8,55);part(c.x+Math.cos(a)*d,c.y+Math.sin(a)*d,{life:.25,r:.7,g:.9,b:1,emi:1,sz:rndi(1,2)})}
    clouds.push({x:c.x,y:c.y,r:0,t:.35,owner:c,flash:1});netFx('e',c.x,c.y);
    query(c.x,c.y,58,o=>{if(o===c||o.dead||isFlying(o))return;o.stun=Math.max(o.stun,1.6);o.hp-=5+c.atk*.3;o.hitT=.2;if(o.pl){o.pl.adr=Math.min(100,o.pl.adr+10)}if(o.hp<=0)killed(o,c,'shock')})}
  else if(k==='roar'){if(c.pl)note(c.pl,'k',8);if(nearCam(c.x,c.y)<200&&!c.pl)cam.shake=Math.max(cam.shake,5);skfx('roar',c.x,c.y);sfxAt('roar',c.x,c.y);
    query(c.x,c.y,125,o=>{if(o===c||o.dead)return;if(o.sp.tier<=c.sp.tier){if(o.pl){o.stun=Math.max(o.stun,1.2);o.pl.adr=Math.min(100,o.pl.adr+15);note(o.pl,'k',5)}else{o.stun=Math.max(o.stun,1.8);o.fear=Math.max(o.fear,4.5);o.fearSrc=c;o.target=null}}})}
  return true;
}

// ================================================================
//  RIVAL PARASITES (anonymous AI parasites racing for the apex)
// ================================================================
const RIVALN=()=>MATCH.kind==='coop'?0:MATCH.mode==='host'?4:5;
function spawnRival(initial){
  const r={id:++UID,c:null,adr:0,slots:[],dry:0,inf:0,respawn:0,gen:1};
  const cand=creatures.filter(c=>!c.dead&&!c.rival&&!c.pl&&c.sp.tier>=1&&c.sp.tier<=2&&!nearAnyPlayer(c.x,c.y,260));
  if(cand.length&&Math.random()<.85){const h=pick(cand);h.rival=r;r.c=h}
  else{const p=randLand(b=>!isWet(b)&&b!==B_SWAMP);rivalToLarva(r,p.x,p.y)}
  rivals.push(r);return r;
}
function rivalToLarva(r,x,y){const l=spawnCreature('larva',x+rnd(-6,6),y+rnd(-6,6),0);l.rival=r;r.c=l;r.dry=0;r.inf=0;r.adr=0}
function rivalKilled(t,killer,how){
  const r=t.rival;t.rival=null;r.c=null;
  if(killer&&how==='bite'&&canEat(killer,t)&&!killer.pl){
    if(r.adr>=95&&!killer.rival&&(!canUsurp(killer,t)||(r.acc||0)>0||(killer.sp.tier>=6&&MATCH.t<480&&MATCH.kind==='race'))){rivalToLarva(r,killer.x,killer.y);return}
    if(r.adr>=95&&!killer.rival){killer.rival=r;r.c=killer;killer.feral=false;r.adr=0;r.acc=ACC_T;if(t.sp.trait&&r.slots.length<3&&!r.slots.includes(t.sp.trait))r.slots.push(t.sp.trait);
      logEco(`寄生体が《${killer.sp.name}》の肉体を乗っ取った…`);
      if(killer.sp.tier>=6&&MATCH.kind==='race')declareWinner('野生の寄生体',true,null);
      return}
    r.respawn=25;return}
  if(killer&&killer.pl){r.respawn=30;return}
  if(t.key==='larva'){r.respawn=20;return}
  rivalToLarva(r,t.x,t.y);
}
function rivalUpdate(dt){
  for(const r of rivals){
    if(!r.c||r.c.dead){r.c=null;r.respawn-=dt;if(r.respawn<=0){const p=randLand((b,x,y)=>!isWet(b)&&b!==B_SWAMP&&!nearAnyPlayer(x,y,400));rivalToLarva(r,p.x,p.y)}continue}
    const c=r.c;
    if(c.key==='larva'){r.dry+=dt;if(r.dry>100){blood(c.x,c.y,3,[.5,.2,.6]);removeCreature(c);r.respawn=25}}
  }
}

// ================================================================
//  AI
// ================================================================
function think(c){
  const sp=c.sp,night=nightAmt();let perc=sp.perc*(c.feral?1.35:1)*(night>.5&&c.key!=='fox'&&c.key!=='viper'&&c.key!=='frog'?.8:1);
  let threat=null,td=1e9,prey=null,ps=1e9;
  query(c.x,c.y,perc,(o,d)=>{
    if(o===c||o.dead)return;
    const op=o.pl;
    if(!c.feral&&canEat(o,c)&&o.stun<=0&&o.state!=='eat'&&(o.sp.fly||canEnter(o,biomeAt(c.x,c.y)))&&(o.target===c||o.hunger>.3||o.feral||op||o.rival)){
      let dr=d;if(op&&op.mimic)dr/=.55;if(o.hiddenT>0)dr*=3;if(isFlying(o))dr*=.8;
      if(dr<perc*.8&&dr<td){threat=o;td=dr}}
    if(canEat(c,o)&&o.hiddenT<=0&&!(isFlying(o)&&!isFlying(c)&&!sp.fly&&!op&&!o.rival)&&(isFlying(c)||sp.fly||canEnter(c,biomeAt(o.x,o.y)))){
      let e=d;if(op){if(op.mimic)e/=.55;if(op.inBush)e/=.5;if(c.rival&&op.susp>.55)e*=.4}else if(o.inBush)e*=1.7;
      if(c.feral&&op)e*=.5;
      if(e<perc){const s=e*(.55+.45*o.hp/o.maxhp)*(o.sp.tier===0?1.6:1);if(s<ps){ps=s;prey=o}}}
  });
  c.threat=threat;c.prey=prey;c.food=null;
  if(sp.plants&&c.hunger>.25&&!prey&&fgrid.length)c.food=nearestFood(c,perc);
  c.inBush=!!inBushAt(c.x,c.y);
  if(c.stage!==stageOf(c))recalc(c);
}
function steerAway(c,o,k){const a=Math.atan2(c.y-o.y,c.x-o.x)+Math.sin(worldT*2+c.id)*.5;c.tx=Math.cos(a);c.ty=Math.sin(a);c.thr=k}
function steerTo(c,x,y,k){const a=Math.atan2(y-c.y,x-c.x);c.tx=Math.cos(a);c.ty=Math.sin(a);c.thr=k}
function aiControl(c,dt){
  const sp=c.sp,r=c.rival;
  c.thinkT-=dt;if(c.thinkT<=0){c.thinkT=r?.15:rnd(.22,.34);think(c)}
  c.thr=0;
  if(c.stun>0)return;
  if(c.state==='eat'){c.eatT-=dt;if(c.eatT<=0)c.state='wander';if(sp.fly)c.alt=Math.max(0,c.alt-dt*30);return}
  if(c.state==='courted'){c.courtT-=dt;if(c.partner&&!c.partner.dead){c.ang+=angDiff(c.ang,Math.atan2(c.partner.y-c.y,c.partner.x-c.x))*Math.min(1,dt*6)}if(c.courtT<=0)c.state='wander';return}
  if(c.key==='larva'&&r){let best=null,bd=1e9;query(c.x,c.y,220,(o,d)=>{if(o.dead||o.rival||o.pl||o.feral||o.sp.tier<1||o.sp.tier>2)return;if(d<bd){bd=d;best=o}});
    if(best){steerTo(c,best.x,best.y,1);if(bd<c.r+best.r+2){r.inf+=dt;if(r.inf>1){best.rival=r;r.c=best;removeCreature(c);r.inf=0;r.gen++;r.acc=ACC_I;if(Math.random()<.5)logEco(`どこかで寄生体が《${best.sp.name}》に潜り込んだ`)}}}
    else{c.wanderA+=rnd(-2,2)*dt;c.tx=Math.cos(c.wanderA);c.ty=Math.sin(c.wanderA);c.thr=.8}
    if(c.threat)steerAway(c,c.threat,1);return}
  if(c.key==='larva')return;
  const thr=c.threat,prey=c.prey;
  if(c.fear>0&&c.fearSrc&&!c.fearSrc.dead){steerAway(c,c.fearSrc,1.1);return}
  if(r){
    if(r.acc>0)r.acc-=dt;
    if(thr){r.adr=Math.min(100,r.adr+(c.stage===2?16:32)*dt);if(r.adr>=100&&canUsurp(thr,c)&&!(r.acc>0)){steerTo(c,thr.x,thr.y,.7);return}steerAway(c,thr,1);return}
    r.adr=Math.max(0,r.adr-5*dt);
    if(c.hunger<.6&&!(c.stage===2)&&!(r.acc>0)){r.seekT=(r.seekT||0)-dt;if(r.seekT<=0){r.seekT=1.5+Math.random()*2;r.goal=null;let bd=200;
        query(c.x,c.y,200,(o,d)=>{if(o.dead||o.pl||o.rival||!canEat(o,c)||!canUsurp(o,c)||(!o.sp.fly&&!canEnter(o,biomeAt(c.x,c.y))))return;if(d<bd){bd=d;r.goal=o}})}
      if(r.goal&&!r.goal.dead&&Math.hypot(r.goal.x-c.x,r.goal.y-c.y)>50){steerTo(c,r.goal.x,r.goal.y,.75);return}}
    if(c.stage===2||(sp.tier>=6&&c.stage>=1&&c.age/c.life>.55)){
      let mate=null,md=1e9;query(c.x,c.y,sp.perc*2,(o,d)=>{if(o.dead||o.key!==c.key||o.sex===c.sex||o.pl||o.feral||o.stage!==1)return;if(d<md){md=d;mate=o}});
      if(mate){steerTo(c,mate.x,mate.y,.9);if(md<c.r+mate.r+6){c.courtT+=dt;if(c.courtT>1.8){c.courtT=0;const ch=spawnCreature(c.key,c.x,c.y,0);ch.growth=c.growth*.6+1;recalc(ch);ch.hp=ch.maxhp;ch.rival=r;r.c=ch;c.rival=null;r.gen++;logEco(`寄生体が《${c.sp.name}》の子孫へ乗り換えた`);toastHearts(c.x,c.y)}}return}
      else if(sp.tier>=5&&c.age/c.life>.9&&Math.random()<dt*.2){
        c.feral=true;c.traits=r.slots.slice();c.rival=null;recalc(c);c.hp=c.maxhp;rivalToLarva(r,c.x,c.y);logEco(`野良化した《${c.sp.name}》が出現した`,'feral');return}
    }
  }
  if(thr&&!c.feral){steerAway(c,thr,1);c.chaseT=0;if(sp.fly)c.alt=Math.min(22,c.alt+dt*30);
    if(activeTraits(c).length&&Math.hypot(thr.x-c.x,thr.y-c.y)<40&&Math.random()<dt*.7)useSkill(c,pick(activeTraits(c)));return}
  if(c.tired>0){c.tired-=dt;c.thr=0;return}
  const hungry=c.feral||c.hunger>(r?.15:.35)||(prey&&(prey.pl||prey.rival)&&c.hunger>.08&&Math.hypot(prey.x-c.x,prey.y-c.y)<55);
  if(prey&&hungry){
    const d=Math.hypot(prey.x-c.x,prey.y-c.y);const lead=Math.min(.5,d/200);
    steerTo(c,prey.x+prey.vx*lead,prey.y+prey.vy*lead,1);c.target=prey;
    if(sp.fly){c.alt=d<46?Math.max(0,c.alt-dt*50):Math.min(20,c.alt+dt*20)}
    const reach=c.r+prey.r+4;
    if(d>reach)c.chaseT+=dt;
    if(c.chaseT>(c.feral?14:7.5)){c.tired=3;c.chaseT=0;c.target=null;return}
    if(d<reach&&c.atkCd<=0&&(!sp.fly||c.alt<6)){bite(c,prey);c.atkCd=sp.atkCd*rnd(.9,1.25)}
    if((c.feral||r)&&activeTraits(c).length&&d<60&&Math.random()<dt*.8)useSkill(c,pick(activeTraits(c)));
    return}
  c.target=null;c.chaseT=Math.max(0,c.chaseT-dt);
  if(c.food&&c.hunger>.25){steerTo(c,c.food.x,c.food.y,.6);if(Math.hypot(c.food.x-c.x,c.food.y-c.y)<c.r+3){const i=foods.indexOf(c.food);if(i>=0){foods.splice(i,1);c.hunger=0;c.growth+=.3;recalc(c);c.hp=Math.min(c.maxhp,c.hp+c.maxhp*.2);c.state='eat';c.eatT=.8}c.food=null}return}
  c.wanderT-=dt;if(c.wanderT<=0){c.wanderT=rnd(2,5);c.rest=Math.random()<(r?.05:.3)?rnd(1,3):0}
  if(c.rest>0){c.rest-=dt;return}
  c.wanderA+=(vnoise(worldT*.4,c.id,7)-.5)*dt*(r?8:4);
  if(!isFlying(c)){const lx=c.x+Math.cos(c.wanderA)*22,ly=c.y+Math.sin(c.wanderA)*22,b=biomeAt(lx,ly);
    const aq=sp.hab==='aqua'||sp.hab==='sea'||sp.hab==='marsh';
    if(!canEnter(c,b)||(aq&&sp.hab!=='marsh'&&!isWet(b))||(!aq&&!sp.hab&&b===B_WATER&&c.key!=='frog')||(b===B_SWAMP&&!sp.hab&&c.key!=='frog'&&c.key!=='snail')||lx<80||ly<80||lx>WORLD-80||ly>WORLD-80)c.wanderA+=2.4*dt*8}
  if(c.key==='frog'&&Math.random()<dt*.3){const wb=biomeAt(c.x,c.y);if(wb!==B_SWAMP&&wb!==B_SAND&&wb!==B_WATER)c.wanderA+=rnd(-1,1)}
  c.tx=Math.cos(c.wanderA);c.ty=Math.sin(c.wanderA);c.thr=sp.fly?.6:(r?.55:.32);
  if(sp.fly)c.alt=Math.min(20,c.alt+dt*15);
}

// ================================================================
//  PLAYER CONTROL
// ================================================================
const IN=Object.assign(mkInput(),{lookX:0,lookY:0,pauseP:false,mode:'kb',hudP:false});
function playerControl(pl,c,dt){
  const I=pl.inp,isL=c.key==='larva';
  pl.mimic=I.mag>.05&&I.mag<.62;
  pl.od=I.od&&!isL;
  let thr=I.mag>.05?(pl.mimic?.42:1):0;
  if(c.stun>0)thr=0;
  c.tx=I.mx;c.ty=I.my;if(I.mag>0){c.tx/=I.mag;c.ty/=I.mag}c.thr=thr;
  if(c.sp.fly||hasTrait(c,'flight')){let want=(I.mag>.62||pl.od)&&pl.atkDip<=0?(c.sp.fly?11:8):0;if(want===0&&!habOk(c.sp,biomeAt(c.x,c.y),hasTrait(c,'swim')))want=9;c.alt=lerp(c.alt,want,1-Math.exp(-dt*4))}
  if(pl.atkDip>0)pl.atkDip-=dt;
  if(I.mag<.12&&!I.atk)pl.idleT+=dt;else pl.idleT=0;
  const turn=Math.abs(angDiff(c.ang,Math.atan2(c.vy,c.vx)));
  if(I.mag>.9||pl.od)pl.susp=Math.min(1,pl.susp+dt*(.05+(pl.od?.25:0)+turn*.05));else pl.susp=Math.max(0,pl.susp-dt*(pl.mimic?.12:.05));
  if(I.atkP&&c.stun<=0){pl.idleT=0;if(!isL)playerBite(pl,c);if(c.sp.fly||hasTrait(c,'flight'))pl.atkDip=.5}
  let holdKind='',holdTarget=null;
  if(I.atk&&c.stun<=0){
    if(isL){const t=nearestHostable(c);if(t){holdKind='infect';holdTarget=t}}
    else{const t=swallowTarget(c);if(t){holdKind='swallow';holdTarget=t}}
  }
  if(I.court&&!isL&&c.stage===1){const t=courtPartner(c);if(t){holdKind='court';holdTarget=t}}
  if(holdKind&&holdKind===pl.holdKind&&holdTarget===pl.holdTarget){pl.holdT+=dt}else{pl.holdT=0;pl.holdKind=holdKind;pl.holdTarget=holdTarget}
  if(holdKind==='infect'){holdTarget.stun=Math.max(holdTarget.stun,.15);if(Math.random()<dt*20)part(holdTarget.x,holdTarget.y,{vz:20,life:.4,r:.8,g:.4,b:1,emi:.8});if(pl.holdT>.9){pl.holdT=0;infectHost(pl,holdTarget)}}
  if(holdKind==='swallow'&&pl.holdT>.55){pl.holdT=0;swallow(pl,c,holdTarget)}
  if(holdKind==='court'){holdTarget.state='courted';holdTarget.courtT=.5;holdTarget.partner=c;if(Math.random()<dt*6)toastHearts(c.x,c.y-4);if(pl.holdT>2.1){pl.holdT=0;mateWith(pl,holdTarget)}}
  const acts=activeTraits(c);if(pl.sel>=acts.length)pl.sel=0;
  if(I.cycleP&&acts.length){pl.sel=(pl.sel+1)%acts.length;if(pl.local){renderSlots();sfx('ui')}}
  if(I.slotP>=0){const k=traitList(c)[I.slotP];if(k&&TRAITS[k].active){pl.sel=acts.indexOf(k);if(pl.local)renderSlots()}}
  if(I.skillP&&acts.length&&c.stun<=0){if(useSkill(c,acts[pl.sel]))pl.susp=Math.min(1,pl.susp+.15);else note(pl,'s','deny')}
  if(I.cyst){pl.cystT+=dt;if(pl.cystT>.8){pl.cystT=-99;layCyst(pl,c)}}else pl.cystT=0;
  if(I.purge&&!isL){pl.purgeT+=dt;if(pl.purgeT>.8){pl.purgeT=-99;ejectFromHost(pl,'purge')}}else pl.purgeT=0;
}
function playerBite(pl,c){
  let best=null,bs=1e9;
  query(c.x,c.y,c.r+40,(o,d)=>{if(o===c||o.dead||o.hiddenT>0||(MATCH.kind==='coop'&&o.pl))return;const reach=c.r+o.r+7;if(d>reach)return;
    if(isFlying(o)&&!isFlying(c))return;const ad=Math.abs(angDiff(c.ang,Math.atan2(o.y-c.y,o.x-c.x)));const s=d*(1+ad);if(s<bs){bs=s;best=o}});
  note(pl,'s','snap');for(let i=0;i<3;i++)part(c.x+Math.cos(c.ang)*(c.r+3),c.y+Math.sin(c.ang)*(c.r+3),{vx:Math.cos(c.ang)*30+rnd(-15,15),vy:Math.sin(c.ang)*30+rnd(-15,15),life:.18,r:1,g:1,b:.9,emi:.3});
  if(best){bite(c,best);if(!best.dead&&!best.pl){best.fear=Math.max(best.fear,2);best.fearSrc=c}}
}
function nearestHostable(c){let best=null,bd=1e9;query(c.x,c.y,c.r+24,(o,d)=>{if(o===c||o.dead||o.rival||o.pl||o.feral||o.sp.tier<1||o.sp.tier>2)return;if(d<c.r+o.r+4&&d<bd){bd=d;best=o}});return best}
function swallowTarget(c){let best=null,bd=1e9;query(c.x,c.y,c.r+30,(o,d)=>{if(!canEat(c,o)||o.hiddenT>0||(MATCH.kind==='coop'&&o.pl))return;if(isFlying(o)&&!isFlying(c))return;
  if(!(o.hp/o.maxhp<=.45||o.sp.tier<=c.sp.tier-2||o.stage===0||o.key==='larva'))return;if(d<c.r+o.r+6&&d<bd){bd=d;best=o}});return best}
function courtPartner(c){let best=null,bd=1e9;query(c.x,c.y,c.r*2+30,(o,d)=>{if(o===c||o.dead||o.pl||o.key!==c.key||o.sex===c.sex||o.feral||o.stage!==1||o.threat)return;if(d<c.r+o.r+14&&d<bd){bd=d;best=o}});return best}
function swallow(pl,c,t){
  pl.idleT=0;
  if(t.pl){t.hp=0;note(pl,'s','gulp');killed(t,c,'bite');return} // swallowed another player: their adrenaline decides
  if(t.rival&&Math.random()<.35){ // reverse parasitism: the rival inside takes over
    const r=t.rival;t.rival=null;r.c=null;removeCreature(t);
    const l=becomeLarva(pl,c.x,c.y);c.pl=null;c.rival=r;r.c=c;r.adr=0;
    note(pl,'t','逆寄生！','丸呑みした獲物の体内から寄生体に肉体を奪われた');note(pl,'k',7);
    l.vx=rnd(-90,90);l.vy=rnd(-90,90);
    return}
  sfxAt('gulp',t.x,t.y);burst(t.x,t.y,10,{r:.9,g:.7,b:.3,emi:.4},30);
  if(t.rival){const r=t.rival;t.rival=null;r.c=null;r.respawn=30;pl.nutr+=10;note(pl,'t','','体内の寄生体ごと消化した')}
  feed(c,t);c.growth+=.6;recalc(c);pl.nutr+=3;removeCreature(t);c.state='wander';
}
function layCyst(pl,c){
  if(!pl.inBush){note(pl,'t','','分身シストは茂みの中にしか産めない');note(pl,'s','deny');return}
  if(pl.nutr<20){note(pl,'t','',`栄養が足りない（${pl.nutr|0}/20）`);note(pl,'s','deny');return}
  pl.nutr-=20;pl.cyst={x:c.x,y:c.y,slots:pl.slots.slice(),nutr:pl.nutr,t:0};
  note(pl,'t','分身シストを産み落とした','完全ロスト時、ここから幼生として再生する');note(pl,'s','birth');if(pl.local)ring(c.x,c.y,26,[.8,.4,1],.6);
}

// ================================================================
//  UPDATE
// ================================================================
function nightAmt(){const s=Math.sin(TAU*dayT);return 1-smooth(-.15,.25,s)}
function updateCreature(c,dt){
  const sp=c.sp,pl=c.pl;
  c.atkCd-=dt;c.stun-=dt;c.fear-=dt;c.hitT-=dt;c.hiddenT-=dt;c.slowT-=dt;c.lastAttT-=dt;
  if(c.skc)for(const k in c.skc)c.skc[k]-=dt;
  if(c.key!=='larva'){let ar=1;if(hasTrait(c,'longevity'))ar*=.6;if(pl&&pl.od)ar+=4;c.age+=dt*ar;
    if(c.age>=c.life){killedByEnv(c,'old');return}
    c.hunger=Math.min(1,c.hunger+dt/90)}
  else if(pl){pl.dry+=dt*(biomeAt(c.x,c.y)===B_SWAMP?2:1);if(pl.dry>=DRY){killedByEnv(c,'dry');return}}
  if(c.poisonT>0){c.poisonT-=dt;c.hp-=c.poisonDps*dt;if(pl&&c.hp<1)c.hp=1;
    if(c.hp<=0){const src=c.poisonSrc&&!c.poisonSrc.dead?c.poisonSrc:null;killed(c,src,src&&Math.hypot(src.x-c.x,src.y-c.y)<150?'bite':'poison');return}}
  const b=biomeAt(c.x,c.y);
  if(b===B_SWAMP&&!isFlying(c)&&c.key!=='frog'&&c.key!=='snail'&&c.key!=='crayfish'&&c.sp.hab!=='marsh'&&c.hiddenT<=0){
    if(c.key!=='larva'){c.hp-=1.4*dt;if(c.hp<=0){killedByEnv(c,'swamp');return}}
    if(pl&&c.key!=='larva'){pl.toxin+=dt*.26;if(pl.toxin>=1){pl.toxin=0;ejectFromHost(pl,'swamp');return}}
    if(Math.random()<dt*3&&onScreen(c.x,c.y))part(c.x+rnd(-4,4),c.y+rnd(-4,4),{vz:8,life:.6,r:.55,g:.85,b:.3,emi:.5})}
  else if(pl)pl.toxin=Math.max(0,pl.toxin-dt*.3);
  if(pl)playerControl(pl,c,dt);else aiControl(c,dt);
  if(c.dead)return;
  let spd=speedOf(c);
  if(c.key==='frog'&&!pl)spd*=.35+1.4*Math.max(0,Math.sin(TAU*c.animT/4));
  const tvx=c.tx*c.thr*spd,tvy=c.ty*c.thr*spd;
  const acc=1-Math.exp(-dt*(pl?12:7));c.vx+=(tvx-c.vx)*acc;c.vy+=(tvy-c.vy)*acc;
  if(c.stun>0){c.vx*=.85;c.vy*=.85}
  const ox=c.x,oy=c.y;c.x+=c.vx*dt;c.y+=c.vy*dt;
  const okOld=canEnter(c,biomeAt(ox,oy));
  if(okOld&&!canEnter(c,biomeAt(c.x,c.y))){
    if(canEnter(c,biomeAt(c.x,oy))){c.y=oy;c.vy*=.2}else if(canEnter(c,biomeAt(ox,c.y))){c.x=ox;c.vx*=.2}else if(canEnter(c,biomeAt(ox,oy))){c.x=ox;c.y=oy;c.vx*=.2;c.vy*=.2}
    if(!pl)c.wanderA+=Math.PI*.6}
  c.wet=!isFlying(c)&&isWet(biomeAt(c.x,c.y));
  if(c.wet&&Math.hypot(c.vx,c.vy)>12&&Math.random()<dt*(c.sp.hab?1.5:5)&&onScreen(c.x,c.y))ring(c.x,c.y,c.r+4,[.5,.7,.8],.6);
  if(!isFlying(c)){const i=clamp((c.x/OG)|0,0,OGW-1),j=clamp((c.y/OG)|0,0,OGW-1);const cell=obsGrid[j*OGW+i];
    for(const o of cell){const dx=c.x-o.x,dy=c.y-o.y,d=Math.hypot(dx,dy),md=o.r+c.r*.55;if(d<md&&d>.01){c.x=o.x+dx/d*md;c.y=o.y+dy/d*md;if(!pl)c.wanderA+=.8}}}
  c.x=clamp(c.x,24,WORLD-24);c.y=clamp(c.y,24,WORLD-24);
  if(okOld&&!canEnter(c,biomeAt(c.x,c.y))){c.x=ox;c.y=oy}
  const v=Math.hypot(c.vx,c.vy);
  if(v>3){const ta=Math.atan2(c.vy,c.vx);const tr=(pl||c.rival)?18:sp.turn;c.ang+=clamp(angDiff(c.ang,ta),-tr*dt,tr*dt)}
  c.animT=(c.animT+dt*(v/(sp.size*.5+2))*1.7+(sp.fly&&c.alt>4?dt*3:0)+(c.key==='larva'?dt*2:0))%4;
  if(c.trail){const h=c.trail[0];if(Math.hypot(c.x-h.x,c.y-h.y)>1.3*SS){c.trail.unshift({x:c.x,y:c.y});c.trail.pop()}}
  creatureTells(c,dt);
}
// purely visual tells, shared by the simulation and by network ghosts
function creatureTells(c,dt){
  if(!onScreen(c.x,c.y,30))return;
  if(c.rival||c.aura){c.auraT=(c.auraT||0)-dt;if(c.auraT<=0){c.auraT=rnd(1.5,3.5);part(c.x+rnd(-c.r,c.r),c.y+rnd(-c.r,c.r),{vz:12,life:1.2,r:.75,g:.35,b:1,emi:.9,drag:.5})}}
  if(c.feral&&Math.random()<dt*4)part(c.x+rnd(-c.r,c.r),c.y+rnd(-c.r,c.r),{vz:14,life:.8,r:1,g:.2,b:.1,emi:.8,drag:.5});
  if(c.hiddenT>0&&Math.random()<dt*10)part(c.x+rnd(-4,4),c.y+rnd(-4,4),{vz:10,grav:60,life:.4,r:.42,g:.32,b:.2});
  statusTells(c,dt);
}
function updatePlayerMeta(pl,dt){
  if(!pl.c){if(pl.respawnT>0){pl.respawnT-=dt;if(pl.respawnT<=0)spawnPlayer(pl)}return}
  const c=pl.c;
  pl.time+=dt;if(pl.acc>0)pl.acc-=dt;
  if(c.stage!==stageOf(c)){recalc(c);if(c.stage===1)note(pl,'t','成熟期に入った','同種の異性と交配できる');else if(c.stage===2)note(pl,'t','老衰期に入った','体が白み、動きが鈍っていく…')}
  pl.inBush=!!inBushAt(c.x,c.y);
  let threat=null,td=1e9;
  query(c.x,c.y,110,(o,d)=>{if(o===c||o.dead||!canEat(o,c)||o.stun>0)return;if(!o.sp.fly&&!canEnter(o,biomeAt(c.x,c.y)))return;if(o.target===c||d<60||o.feral){if(d<td){td=d;threat=o}}});
  pl.threat=threat;
  for(const k in pl.skillCd)pl.skillCd[k]-=dt;
  if(threat){
    const ax=c.x-threat.x,ay=c.y-threat.y,al=Math.hypot(ax,ay)||1,v=Math.hypot(c.vx,c.vy);
    const away=v>1?(c.vx*ax+c.vy*ay)/(v*al):0;
    if(v>speedOf(c)*.45&&away>.15){pl.adr=Math.min(100,pl.adr+(22+42*clamp(1-td/110,0,1))*ageMul(pl)*dt)}
    if(pl.adr>=100)pl.critT=5;
  }else if(pl.critT>0)pl.critT-=dt;
  else pl.adr=Math.max(0,pl.adr-6*dt);
  if(pl.adr>=100&&!pl._crit){pl._crit=true;note(pl,'s','crit');if(pl.local)ring(c.x,c.y,30,[1,.8,.3],.6)}if(pl.adr<95)pl._crit=false;
  if(pl.cyst)pl.cyst.t+=dt;
  if(pl.pendingTrait){pl.ptT-=dt;if(pl.ptT<=0){applyTraitChoice(pl,-1);if(pl.local){pendingTrait=null;show('trait',false)}}}
  // food & mushrooms
  if(c.sp.plants||c.key==='larva'){for(let i=foods.length-1;i>=0;i--){const f=foods[i];if(Math.hypot(f.x-c.x,f.y-c.y)<c.r+3){if(c.key==='larva'){pl.dry=Math.max(0,pl.dry-6)}else{c.growth+=.35;recalc(c);c.hp=Math.min(c.maxhp,c.hp+c.maxhp*.2)}pl.nutr+=1.5;foods.splice(i,1);note(pl,'s','nibble');burst(f.x,f.y,4,{r:.5,g:.8,b:.3},15)}}}
  for(const m of mushrooms){if(m.ready&&c.key!=='larva'&&Math.hypot(m.x-c.x,m.y-c.y)<c.r+6){m.ready=false;m.t=90;c.age=Math.max(0,c.age-c.life*.25);recalc(c);pl.nutr+=3;note(pl,'t','延命キノコ','宿主の寿命が延びた');note(pl,'s','mush');burst(m.x,m.y,16,{r:.4,g:.9,b:1,emi:.9},30)}}
  // context hints (computed here so remote players receive them too)
  const isL=c.key==='larva',sw=isL?null:swallowTarget(c);
  pl.hint={host:isL&&!!nearestHostable(c),sw:sw?(sw.rival||sw.pl?2:1):0,court:!isL&&c.stage===1&&!!courtPartner(c),
    watch:pl.susp>.6&&rivals.some(r=>r.c&&!r.c.dead&&canEat(r.c,c)&&Math.hypot(r.c.x-c.x,r.c.y-c.y)<200),thr:threat?threat.sp.name:'',big:!!(threat&&!canUsurp(threat,c))};
}
// local-only feedback (heartbeat, rings) driven by the viewed player's numbers
function localFeel(dt){
  const c=P.c;if(!c)return;
  const hpR=c.maxhp?c.hp/c.maxhp:1;
  if(Math.abs(P.lastHp-c.hp)>.01||Math.abs(P.lastAdr-P.adr)>.5)P.ringVis=1;else P.ringVis=Math.max(.35,P.ringVis-dt*.4);
  P.lastHp=c.hp;P.lastAdr=P.adr;
  const bpm=56+P.adr*1.1+(1-hpR)*40+(P.od?30:0);
  P.beatPh+=dt*bpm/60;if(P.beatPh>=1){P.beatPh-=1;P.beat=1;const v=.15+P.adr/100*.85+(1-hpR)*.4;if(v>.25||P.adr>20)sfx('heart',{v:Math.min(1,v)})}
  P.beat=Math.max(0,P.beat-dt*3.5);
  P.flash=Math.max(0,P.flash-dt*1.6);P.hurtT-=dt;
}
let LODF=0;
function simWorld(dt){
  worldT+=dt;dayT=(dayT+dt/DAY)%1;MATCH.t+=dt;
  buildCGrid();
  LODF=(LODF+1)%8;const foci=PLAYERS.filter(p=>p.c).map(p=>p.c);if(!foci.length)foci.push({x:cam.x+GW/2,y:cam.y+GH/2});const rf=[];for(const r of rivals)if(r.c&&!r.c.dead)rf.push(r.c);
  for(let i=0;i<creatures.length;i++){const c=creatures[i];if(c.dead)continue;
    if(c.pl||c.rival){updateCreature(c,dt);continue}
    let md=1e9;for(const f of foci){const d=Math.abs(f.x-c.x)+Math.abs(f.y-c.y);if(d<md)md=d}if(md>=850)for(const f of rf){const d=(Math.abs(f.x-c.x)+Math.abs(f.y-c.y))*1.6;if(d<md)md=d}
    if(md<850){if(c.lodAcc){updateCreature(c,dt+c.lodAcc);c.lodAcc=0}else updateCreature(c,dt)}
    else{c.lodAcc=(c.lodAcc||0)+dt;if((c.id&7)===LODF){const d2=Math.min(c.lodAcc,.3);c.lodAcc=0;updateCreature(c,d2)}}}
  rivalUpdate(dt);
  for(const cl of clouds){if(cl.flash||cl.vis)continue;
    query(cl.x,cl.y,cl.r,o=>{if(o===cl.owner||o.dead||o.hiddenT>0||isFlying(o)||o.key==='larva')return;o.hp-=2.6*dt;if(o.pl&&o.hp<1)o.hp=1;o.slowT=.3;if(!o.pl){o.fear=Math.max(o.fear,.5);o.fearSrc=cl.owner}if(o.hp<=0)killed(o,cl.owner&&!cl.owner.dead?cl.owner:null,'poison')})}
  for(const m of mushrooms)if(!m.ready){m.t-=dt;if(m.t<=0)m.ready=true}
  simWorld.acc=(simWorld.acc||0)+dt;
  if(simWorld.acc>1){simWorld.acc=0;creatures=creatures.filter(c=>!c.dead);if(MATCH.kind==='coop'){ecoTick();if(foods.length<300*POPK)for(let i=0;i<3*POPK;i++)spawnFood()}else{populate(false);if(foods.length<260*POPK)for(let i=0;i<4*POPK;i++)spawnFood()}
    while(rivals.length<RIVALN())spawnRival(false)}
  for(const pl of PLAYERS)updatePlayerMeta(pl,dt);
}
function fxWorld(dt){
  fxSkillsTick(dt);
  for(let i=clouds.length-1;i>=0;i--){const cl=clouds[i];cl.t-=dt;if(cl.t<=0){clouds.splice(i,1);continue}if(cl.flash)continue;
    if(Math.random()<dt*14&&onScreen(cl.x,cl.y,60))part(cl.x+rnd(-cl.r,cl.r)*.8,cl.y+rnd(-cl.r,cl.r)*.6,{vz:6,life:1,r:.4,g:.9,b:.3,emi:.45,sz:2,drag:1})}
  for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.life-=dt;if(p.life<=0){particles.splice(i,1);continue}if(p.ring)continue;
    if(p.feather){p.vx+=Math.sin(p.life*7+p.sp)*40*dt}p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;p.vz-=p.grav*dt;if(p.z<0){p.z=0;p.vz*=-.3;p.vx*=.6;p.vy*=.6}const dr=Math.exp(-p.drag*dt);p.vx*=dr;p.vy*=dr}
  for(let i=decals.length-1;i>=0;i--){decals[i].t-=dt;if(decals[i].t<=0)decals.splice(i,1)}
  const night=nightAmt();
  const want=Math.round(night*34);
  while(fireflies.length<want){const x=cam.x+rnd(-40,GW+40),y=cam.y+rnd(-40,GH+40);const b=biomeAt(x,y);if(b===B_ROCK||isWet(b)){fireflies.push({x,y,ph:rnd(TAU),dead:1});continue}fireflies.push({x,y,ph:rnd(TAU),vx:0,vy:0})}
  for(let i=fireflies.length-1;i>=0;i--){const f=fireflies[i];if(f.dead||!onScreen(f.x,f.y,80)||fireflies.length>want+2){fireflies.splice(i,1);continue}
    f.ph+=dt;f.vx+=(vnoise(f.ph*.5,i,3)-.5)*40*dt;f.vy+=(vnoise(i,f.ph*.5,4)-.5)*40*dt;f.vx*=.97;f.vy*=.97;f.x+=f.vx*dt;f.y+=f.vy*dt}
  while(motes.length<26){motes.push({x:cam.x+rnd(GW),y:cam.y+rnd(GH),z:rnd(4,20),vx:rnd(.6,1.4),vy:rnd(-2,2),ph:rnd(TAU)})}
  for(const m of motes){m.ph+=dt;const w=WIND.s*7*m.vx;m.x+=(WIND.x*w+Math.sin(m.ph)*3)*dt;m.y+=(WIND.y*w+m.vy+Math.cos(m.ph*.7)*2)*dt;if(!onScreen(m.x,m.y,10)){m.x=cam.x+rnd(GW);m.y=cam.y+rnd(GH)}}
  ambientTick(dt);
}
// ================================================================
//  AMBIENT LIFE — cosmetic, local-only touches that make the world feel
//  inhabited: butterflies & dragonflies, a circling flock, jumping fish,
//  falling leaves, footstep dust and water ripples around creatures.
//  Never touches the simulation (not networked, no gameplay effect).
// ================================================================
const AMB={bf:[],flock:null,fish:[],acc:0,near:[],nearT:0,fishT:2};
const BFC=[[1,.98,.92],[1,.86,.3],[.62,.82,1],[1,.6,.3],[1,.7,.86]],DFC=[[.35,.75,1],[.4,1,.75],[1,.45,.35]];
function lring(x,y,r,col,life){if(particles.length<700)particles.push({ring:1,x,y,r0:1,r1:r,life,max:life,col})}
function splash(x,y,big){lring(x,y,big?9:6,[.92,.98,1],.9);for(let i=0;i<(big?7:4);i++){const an=rnd(TAU),s=rnd(4,10);part(x,y,{z:.3,vz:rnd(12,24),vx:Math.cos(an)*s,vy:Math.sin(an)*s,grav:70,drag:.5,life:rnd(.4,.7),r:.86,g:.95,b:1,sz:rnd(.8,1.3)})}}
function ambientTick(dt){
  if(!R3.ok)return;
  const fx=CAM3.tx,fy=CAM3.ty,night=nightAmt(),day=night<.45,pc=P.c;
  // ---- butterflies over meadows, dragonflies over shallow water
  const want=day?(R3.coarse?8:14):0;
  if(AMB.bf.length<want&&Math.random()<dt*8){const an=rnd(TAU),d=rnd(30,170),x=fx+Math.cos(an)*d,y=fy+Math.sin(an)*d;
    if(x>0&&y>0&&x<WORLD&&y<WORLD){const b=biomeAt(x,y),h=heightAt(x,y);
      if(b===B_GRASS||(b===B_FOREST&&Math.random()<.3))AMB.bf.push({k:0,x,y,hx:x,hy:y,z:rnd(2,6),a:rnd(TAU),ph:rnd(TAU),col:BFC[(Math.random()*BFC.length)|0],land:0});
      else if((b===B_WATER&&h>-2.5)||b===B_SWAMP)AMB.bf.push({k:1,x,y,hx:x,hy:y,tx:x,ty:y,z:rnd(2.5,5),ph:rnd(TAU),t:0,col:DFC[(Math.random()*DFC.length)|0]})}}
  for(let i=AMB.bf.length-1;i>=0;i--){const b=AMB.bf[i];
    if(Math.hypot(b.x-fx,b.y-fy)>240||(AMB.bf.length>want&&Math.random()<dt*.5)){AMB.bf.splice(i,1);continue}
    b.ph+=dt;const fl=pc&&!pc.dead&&Math.hypot(pc.x-b.x,pc.y-b.y)<pc.r+12;
    if(b.k===0){
      if(b.land>0&&!fl){b.land-=dt;b.z+=(.6-b.z)*Math.min(1,dt*4);continue}
      b.land=0;b.a+=(vnoise(b.ph*.6,i*3.1,7)-.5)*5*dt;
      const hd=Math.hypot(b.hx-b.x,b.hy-b.y);if(hd>45)b.a+=Math.sin(Math.atan2(b.hy-b.y,b.hx-b.x)-b.a)*2*dt;
      if(fl)b.a=Math.atan2(b.y-pc.y,b.x-pc.x);
      const s=fl?22:8;b.x+=(Math.cos(b.a)*s+WIND.x*WIND.s*2)*dt;b.y+=(Math.sin(b.a)*s+WIND.y*WIND.s*2)*dt;
      b.z+=((fl?9:3.2+2*Math.sin(b.ph*1.7)+.8*Math.sin(b.ph*4.3))-b.z)*Math.min(1,dt*3);
      if(Math.random()<dt*.07)b.land=rnd(2,5);
    }else{
      b.t-=dt;if(b.t<=0||fl){b.t=rnd(.4,1.5);const an=fl?Math.atan2(b.y-pc.y,b.x-pc.x):rnd(TAU),d=fl?26:rnd(5,22);b.tx=(fl?b.x:b.hx)+Math.cos(an)*d;b.ty=(fl?b.y:b.hy)+Math.sin(an)*d}
      const k=1-Math.exp(-dt*5);b.x+=(b.tx-b.x)*k;b.y+=(b.ty-b.y)*k;b.z=3.4+Math.sin(b.ph*2.2)*.5}}
  // ---- a flock that drifts across the sky, circling as it goes
  if(day&&!AMB.flock&&Math.random()<dt*.08){const an=rnd(TAU),n=5+((Math.random()*5)|0),B=[];for(let i=0;i<n;i++)B.push({o:rnd(-.5,.5),r:rnd(.75,1.25),h:rnd(-6,6),ph:rnd(TAU)});
    AMB.flock={cx:fx+Math.cos(an)*300,cy:fy+Math.sin(an)*300,vx:-Math.cos(an+rnd(-.5,.5))*12,vy:-Math.sin(an+rnd(-.5,.5))*12,a:rnd(TAU),r:rnd(40,75),h:rnd(60,90),dir:Math.random()<.5?1:-1,B}}
  if(AMB.flock){const F=AMB.flock;F.cx+=F.vx*dt;F.cy+=F.vy*dt;F.a+=F.dir*dt*.32;for(const b of F.B)b.ph+=dt;if(Math.hypot(F.cx-fx,F.cy-fy)>700)AMB.flock=null}
  // ---- fish leaping out of open water
  AMB.fishT-=dt;
  if(AMB.fishT<=0){AMB.fishT=rnd(1.2,3.5)*(night>.5?2:1);for(let k=0;k<6;k++){const an=rnd(TAU),d=rnd(25,170),x=fx+Math.cos(an)*d,y=fy+Math.sin(an)*d;
    if(x>0&&y>0&&x<WORLD&&y<WORLD&&heightAt(x,y)<-1.6){const a=rnd(TAU),L=rnd(6,12);AMB.fish.push({x0:x,y0:y,x1:x+Math.cos(a)*L,y1:y+Math.sin(a)*L,t:0,T:rnd(.55,.85),hgt:rnd(3,6.5),sz:rnd(1.1,1.9)});splash(x,y,0);break}}}
  for(let i=AMB.fish.length-1;i>=0;i--){const f=AMB.fish[i];f.t+=dt;if(f.t>=f.T){splash(f.x1,f.y1,1);AMB.fish.splice(i,1)}}
  // ---- leaves let go of nearby trees and ride the wind
  if((AMB.nearT-=dt)<=0){AMB.nearT=1;AMB.near=trees.filter(t=>Math.abs(t.x-fx)<240&&Math.abs(t.y-fy)<240)}
  if(AMB.near.length&&particles.length<520&&Math.random()<dt*Math.min(6,AMB.near.length*.13)*WIND.s){const t=AMB.near[(Math.random()*AMB.near.length)|0],an=rnd(TAU),d=rnd(4,20),au=Math.random()<.25;
    part(t.x+Math.cos(an)*d,t.y+Math.sin(an)*d,{z:rnd(28,50),vz:-rnd(3.5,6),vx:WIND.x*rnd(6,13),vy:WIND.y*rnd(6,13),drag:.05,life:rnd(7,10),r:au?.95:rnd(.42,.55),g:au?.66:rnd(.7,.82),b:au?.22:.26,sz:1.7,leaf:1,feather:1,sp:rnd(9)})}
  // ---- footstep dust on open ground, ripples around anything in the water
  AMB.acc+=dt;if(AMB.acc<.1)return;const st=AMB.acc;AMB.acc=0;
  for(const c of creatures){if(c.dead||c.hiddenT>0||(c.alt||0)>.5)continue;const dx=c.x-fx,dy=c.y-fy;if(dx*dx+dy*dy>40000)continue;
    const v=Math.hypot(c.vx||0,c.vy||0),gh=heightAt(c.x,c.y);
    if(gh<0){c._rp=(c._rp||0)-st;if(c._rp<=0){c._rp=v>4?.32:1.3;lring(c.x-Math.cos(c.ang)*c.r*.3,c.y-Math.sin(c.ang)*c.r*.3,c.r*1.5+4,[.9,.97,1],v>4?.8:1.4)}}
    else if(v>c.sp.speed*.5&&Math.random()<st*v/c.sp.speed*(c.r>6?6:3)){const b=biomeAt(c.x,c.y),col=b===B_SAND?[.93,.86,.68]:b===B_DIRT||b===B_ROCK?[.78,.68,.54]:[.78,.84,.62],ba=c.ang+Math.PI;
      part(c.x+Math.cos(ba)*c.r*.5+rnd(-1,1)*c.r*.4,c.y+Math.sin(ba)*c.r*.5+rnd(-1,1)*c.r*.4,{vz:rnd(3,6),vx:Math.cos(ba)*v*.15,vy:Math.sin(ba)*v*.15,life:rnd(.5,.8),r:col[0],g:col[1],b:col[2],sz:1.4+c.r*.22,drag:3,puff:1})}}
}
function updateWorld(dt){simWorld(dt);fxWorld(dt)}

// ================================================================
//  3D RENDERER — three.js, third-person camera, toon shading.
//  The simulation stays on the (x,y) plane; rendering maps it to
//  (x, height, z=y). Terrain height is cosmetic and baked per world.
// ================================================================
const glc=document.getElementById('gl'),uic=document.getElementById('ui');
const uctx=uic.getContext('2d');
let GW=560,GH=560,PSZ=1,DPR=1;           // GW/GH: the "awareness window" around the camera focus (culling, audio, map)
const HGT=new Float32Array(BW*BW);
const heightAt=(x,y)=>sampleGrid(HGT,x,y);
const groundY=(x,y)=>Math.max(sampleGrid(HGT,x,y),0);
const R3={ok:false,q:1,slowN:0,fastN:0,icons:{},dchunks:[]};
const CAM3={yaw:-Math.PI/2,pitch:.42,zoom:1,dist:60,tx:WORLD/2,ty:WORLD/2,th:0,manT:9,dragId:null,lx:0,ly:0,px:0,py:0,pz:0,fx:0,fy:-1};
const U3={uTime:{value:0},uSun:{value:null},uSunCol:{value:null},uAmb:{value:null},uFogCol:{value:null},uSkyTop:{value:null},uFog:{value:null},
  uH:{value:null},uC:{value:null},uWorld:{value:WORLD},uFocus:{value:null},uFocusS:{value:null},uNight:{value:0},uRes:{value:null},uOrigin:{value:null},uGrass:{value:null},uClear:{value:4},
  uWind:{value:null},uMist:{value:0},uPush:{value:[]}};
// ---------------------------------------------------------------- terrain bake
function bakeTerrain(){
  const N=BW*BW,D=new Float32Array(N);
  for(let k=0;k<N;k++)D[k]=(BIO[k]===B_WATER||BIO[k]===B_SEA)?0:1e6;
  for(let j=0;j<BW;j++)for(let i=0;i<BW;i++){const k=j*BW+i;let d=D[k];if(d===0)continue;
    if(i>0)d=Math.min(d,D[k-1]+1);if(j>0){d=Math.min(d,D[k-BW]+1);if(i>0)d=Math.min(d,D[k-BW-1]+1.414);if(i<BW-1)d=Math.min(d,D[k-BW+1]+1.414)}D[k]=d}
  for(let j=BW-1;j>=0;j--)for(let i=BW-1;i>=0;i--){const k=j*BW+i;let d=D[k];if(d===0)continue;
    if(i<BW-1)d=Math.min(d,D[k+1]+1);if(j<BW-1){d=Math.min(d,D[k+BW]+1);if(i<BW-1)d=Math.min(d,D[k+BW+1]+1.414);if(i>0)d=Math.min(d,D[k+BW-1]+1.414)}D[k]=d}
  const H=HGT,inv=1/(1-TH.s);
  for(let j=0;j<BW;j++)for(let i=0;i<BW;i++){const k=j*BW+i,b=BIO[k],dp=DPT[k];let h;
    if(b===B_SEA)h=-(1.2+dp*15);
    else if(b===B_WATER){const w=WK[k];h=w===W_RIVER?-(.7+dp*3.4):w===W_SHORE?-(.5+dp*2.2):w===W_POOL?-.9:-(.7+dp*6.5)}
    else{const e=EL[k],x=i*BC+2,y=j*BC+2;let he=Math.pow(clamp((e-TH.s)*inv,0,1),1.2)*70;
      if(b===B_ROCK)he+=(e-TH.r)*110+3;
      he+=(vnoise(x*.03,y*.03,SEED+50)-.5)*2.6;
      if(b===B_SWAMP)he=Math.min(he,2)*.5;
      h=Math.max(.45,Math.min(he+.9,.45+D[k]*BC*.34))}
    H[k]=h}
  const T=new Float32Array(N);
  const blur=(S,Dst)=>{for(let j=0;j<BW;j++){const r=j*BW;Dst[r]=S[r];Dst[r+BW-1]=S[r+BW-1];for(let i=1;i<BW-1;i++)Dst[r+i]=(S[r+i-1]+2*S[r+i]+S[r+i+1])*.25}
    for(let i=0;i<BW;i++){S[i]=Dst[i];S[N-BW+i]=Dst[N-BW+i]}for(let j=1;j<BW-1;j++){const r=j*BW;for(let i=0;i<BW;i++)S[r+i]=(Dst[r+i-BW]+2*Dst[r+i]+Dst[r+i+BW])*.25}};
  blur(H,T);blur(H,T);
  for(let k=0;k<N;k++){const wet=BIO[k]===B_WATER||BIO[k]===B_SEA;if(wet){if(H[k]>-.4)H[k]=-.4}else if(H[k]<.3)H[k]=.3}
  // ---- colour (+ grass density in alpha)
  const R=new Float32Array(N),G=new Float32Array(N),B=new Float32Array(N),Aa=new Float32Array(N);
  const TC=[[.50,.80,.36],[.33,.63,.30],[.83,.69,.47],[.64,.63,.70],[.44,.53,.33],[.96,.87,.63],[.66,.7,.52],[.82,.78,.6]],DN=[1,.5,.1,0,.3,0,0,0];
  for(let j=0;j<BW;j++)for(let i=0;i<BW;i++){const k=j*BW+i,b=BIO[k],x=i*BC+2,y=j*BC+2;let c=TC[b];
    const v=.9+.2*vnoise(x*.012,y*.012,SEED+61),m=MO[k];let r=c[0]*v,g=c[1]*v,bl=c[2]*v;
    if(b===B_GRASS){const dry=clamp((TH.f-m)/(TH.f-TH.d),0,1);r=lerp(r,.72,dry*.35);g=lerp(g,.8,dry*.2)}
    if(b===B_WATER&&WK[k]===W_POOL){r=.4;g=.47;bl=.3}
    R[k]=r;G[k]=g;B[k]=bl;Aa[k]=DN[b]}
  blur(R,T);blur(G,T);blur(B,T);blur(Aa,T);
  const sh=(o,rad,str,ox,oy)=>{const ci=((o.x+ox)/BC)|0,cj=((o.y+oy)/BC)|0,rc=Math.ceil(rad/BC);
    for(let j=cj-rc;j<=cj+rc;j++)for(let i=ci-rc;i<=ci+rc;i++){if(i<0||j<0||i>=BW||j>=BW)continue;const d=Math.hypot(i-ci,j-cj)*BC/rad;if(d>=1)continue;const f=1-str*smooth(1,.35,d),k=j*BW+i;R[k]*=f;G[k]*=f;B[k]*=f*1.03}};
  for(const t of trees)sh(t,27,.3,5,4);for(const b of bushes)sh(b,13,.22,2,2);for(const r of rocks)sh(r,11,.2,2,2);
  const px=new Uint8Array(N*4);for(let k=0;k<N;k++){px[k*4]=clamp(R[k],0,1)*255;px[k*4+1]=clamp(G[k],0,1)*255;px[k*4+2]=clamp(B[k],0,1)*255;px[k*4+3]=clamp(Aa[k],0,1)*255}
  if(!R3.ok)return;
  const hf=new Uint16Array(N),th=THREE.DataUtils.toHalfFloat;for(let k=0;k<N;k++)hf[k]=th(H[k]);
  if(U3.uH.value)U3.uH.value.dispose();if(U3.uC.value)U3.uC.value.dispose();
  const tH=new THREE.DataTexture(hf,BW,BW,THREE.RedFormat,THREE.HalfFloatType);tH.minFilter=tH.magFilter=THREE.LinearFilter;tH.wrapS=tH.wrapT=THREE.ClampToEdgeWrapping;tH.needsUpdate=true;
  const tC=new THREE.DataTexture(px,BW,BW,THREE.RGBAFormat,THREE.UnsignedByteType);tC.minFilter=tC.magFilter=THREE.LinearFilter;tC.wrapS=tC.wrapT=THREE.ClampToEdgeWrapping;tC.needsUpdate=true;
  U3.uH.value=tH;U3.uC.value=tC;
}
function nrmAt(x,y,out){const hx=heightAt(x+3,y)-heightAt(x-3,y),hz=heightAt(x,y+3)-heightAt(x,y-3),l=Math.hypot(hx,6,hz);out[0]=-hx/l;out[1]=6/l;out[2]=-hz/l;return out}
// ---------------------------------------------------------------- shaders
const GLSL_NOISE=`
float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}`;
const GLSL_ENV=`uniform vec3 uSun,uSunCol,uAmb,uFogCol,uSkyTop,uWind;uniform vec2 uFog;uniform float uTime,uWorld,uNight,uMist;`;
// shared "living world" helpers (need GLSL_ENV + GLSL_NOISE first):
//  gust()    rolling wind waves that sweep across grass and canopies (uWind.xy = direction, .z = strength)
//  cloudSh() drifting cloud shadows, the same field on every surface
//  fogC()    aerial perspective: distance cools colours, haze glows toward the sun, low valley mist at dawn/dusk
const GLSL_ATMO=`
vec3 sunD(){return normalize(uSun*vec3(1.,.55,1.));}
float gust(vec2 p){vec2 d=uWind.xy;float g=vn(p*.011-d*uTime*.33)*.65+vn(p*.029-d*uTime*.71+3.1)*.35;return smoothstep(.4,.84,g)*uWind.z;}
float cloudSh(vec2 p){return smoothstep(.52,.74,vn(p*.0032-uWind.xy*uTime*.011))*(1.-uNight);}
vec3 hazeC(vec3 dn){float sd=max(dot(dn,sunD()),0.);return uFogCol+uSunCol*(pow(sd,7.)*.22+pow(sd,40.)*.22)*(1.-uNight*.85);}
vec3 fogC(vec3 col,vec3 w){vec3 d=w-cameraPosition;float dist=length(d);
  float ap=smoothstep(uFog.x*.25,uFog.y,dist)*(1.-uNight*.6);col=mix(col,col*.7+uSkyTop*.32,ap*.45);
  float hf=uMist*exp(-max(w.y,0.)*.08)*smoothstep(25.,uFog.x*1.3,dist);
  return mix(col,hazeC(d/max(dist,.001)),max(smoothstep(uFog.x,uFog.y,dist),hf*.7));}`;
const GLSL_W=GLSL_ENV+GLSL_NOISE+GLSL_ATMO;
const TOON_VS=`
attribute vec4 aCol;attribute vec3 aPiv;attribute vec3 aAnm;
attribute vec4 iA;attribute vec4 iB;attribute vec4 iC;attribute vec4 iD;
${GLSL_W}
uniform float uTimeK;
varying vec3 vCol,vN,vW,vL;varying float vMat,vAlpha,vFlash,vSat,vVZ,vTag,vGl;
mat2 rot(float a){float c=cos(a),s=sin(a);return mat2(c,s,-s,c);}
void main(){
  vec3 p=position,n=normal;float ph=iB.y+uTime*uTimeK,mv=iB.z;
  int t=int(aAnm.x+.5);float amp=aAnm.y,off=aAnm.z;vTag=aAnm.x;
  // idle breathing (creatures only: iD.z=1): a slow swell, quicker and shallower on the move
  float br=sin(uTime*(1.8+mv*2.8)+iA.x*.13+iA.z*.07)*iD.z;p.y*=1.+.032*br*(1.-.55*mv);p.xz*=1.-.012*br;
#ifdef DECOR
  // canopies lean with the passing gusts, more at the top
  float gw=0.;if(t==5){gw=(gust(iA.xz)*1.15+.2*sin(uTime*1.25+iA.x*.05+iA.z*.031))*max(p.y,0.)*.021;
    p+=n*(vn(p.xz*.3+p.y*.21+off*7.)*.65+vn(p.zy*.55+p.x*.13)*.35-.45)*amp*4.2;}   // lumpy, leafy silhouettes
#endif
  if(t==1){float a=amp*sin(ph+off)*mv;vec3 q=p-aPiv;q.xy=rot(a)*q.xy;n.xy=rot(a)*n.xy;p=aPiv+q;}
  else if(t==2){float a=amp*(sin(ph+off)*(.3+.7*mv)+.22*sin(uTime*2.3+off));vec3 q=p-aPiv;q.xz=rot(a)*q.xz;n.xz=rot(a)*n.xz;p=aPiv+q;}
  else if(t==3){float a=amp*(sin(ph+off)*(.35+.65*mv)-.12);vec3 q=p-aPiv;q.yz=rot(a)*q.yz;n.yz=rot(a)*n.yz;p=aPiv+q;}
  else if(t==4){float a=amp*iB.w;vec3 q=p-aPiv;q.xy=rot(a)*q.xy;n.xy=rot(a)*n.xy;p=aPiv+q;}
  else if(t==5){p.z+=amp*sin(ph+off)*(.35+.65*mv);}
  else if(t==6){p.y+=amp*abs(sin(ph*.5+off))*mv;}
  vL=p;vGl=iD.w;
  p*=iB.x;
  float c=cos(iA.w),s=sin(iA.w);
  vec3 w=vec3(p.x*c-p.z*s,p.y,p.x*s+p.z*c)+iA.xyz;
  vec3 nw=normalize(vec3(n.x*c-n.z*s,n.y,n.x*s+n.z*c));
#ifdef DECOR
  w.xz+=uWind.xy*gw*iB.x;w.y-=abs(gw)*.12*iB.x;
#endif
#ifdef OUTLINE
#ifdef DECOR
  float d=distance(cameraPosition,w);w+=nw*min(d*.0028,iB.x*.09+.05);
#else
  float d=distance(cameraPosition,w);w+=nw*min(d*.0019,iB.x*.06+.035);   // creatures: a finer, softer ink line
#endif
#endif
  vCol=aCol.rgb*iC.rgb;vMat=aCol.a;vAlpha=iC.a;vFlash=iD.x;vSat=iD.y;vN=nw;vW=w;
  vec4 mvp=viewMatrix*vec4(w,1.);vVZ=-mvp.z;gl_Position=projectionMatrix*mvp;
}`;
const TOON_FS=`
${GLSL_W}
uniform vec4 uFocusS;uniform vec2 uRes;
varying vec3 vCol,vN,vW,vL;varying float vMat,vAlpha,vFlash,vSat,vVZ,vTag,vGl;
float ign(vec2 p){return fract(52.9829189*fract(dot(p,vec2(.06711056,.00583715))));}
void main(){
  float al=vAlpha;
#ifdef DECOR
  vec2 nd=(gl_FragCoord.xy/uRes)*2.-1.;float asp=uRes.x/uRes.y;
  float dd=length((nd-uFocusS.xy)*vec2(asp,1.));
  al*=1.-.86*step(vVZ,uFocusS.z-4.)*(1.-smoothstep(uFocusS.w*.55,uFocusS.w,dd));
#endif
  if(al<.99&&ign(gl_FragCoord.xy)>al)discard;
  vec3 col=vCol;
  float g=dot(col,vec3(.3,.55,.15));col=mix(vec3(g),col,vSat);
#ifdef OUTLINE
#ifdef DECOR
  col*=.2;
#else
  col*=.34;                                    // creatures: a dark tint of their own colour, not black
#endif
#else
  vec3 n=normalize(vN);float h=dot(n,uSun)*.5+.5+n.y*.1;
  vec3 v=normalize(cameraPosition-vW);
  float fol=0.,ndv=max(dot(n,v),0.);
#ifdef DECOR
  // foliage: a noisy terminator turns faceted blobs into soft leafy clumps
  fol=step(4.5,vTag)*step(vTag,5.5);
  float ln=vn(vW.xz*.3+vW.y*.23)*.6+vn(vW.zy*.43+vW.x*.17)*.4;h+=(ln-.5)*.5*fol;
  float band=smoothstep(.45,.52,h);
#else
  // creatures: a softer light wrap, plus fine fur / skin mottling in the body's own space
  float band=smoothstep(.4,.6,h);
  if(vMat<.5)col*=.93+.13*(vn(vL.xz*9.+vL.y*4.)*.55+vn(vL.xy*15.+vL.z*6.)*.45);
#endif
  band*=1.-.6*cloudSh(vW.xz);
  vec3 hemi=mix(uAmb*vec3(.9,.98,.78),uAmb*vec3(1.12,1.14,1.24),n.y*.5+.5);   // sky above, grass bounce below
  vec3 light=mix(hemi,uAmb*.72+uSunCol*.66,band);
#ifndef DECOR
  light+=uSunCol*vec3(.2,.07,.02)*band*(1.-band)*2.4;                           // warm light bleeding at the terminator
#endif
  if(vMat<.5){col*=light;col+=smoothstep(.93,.96,h)*.1*uSunCol*(1.-fol)*(1.-vGl);col+=pow(1.-ndv,3.)*.22*uSunCol*band;
#ifndef DECOR
    col+=pow(1.-ndv,4.)*.16*uAmb*(1.-band);                                     // soft sky rim on the shaded side
    vec3 hv=normalize(sunD()+v);col+=uSunCol*smoothstep(.25,.7,pow(max(dot(n,hv),0.),24.+vGl*40.))*.5*vGl*band;   // wet / glossy highlight
#endif
    col*=1.-fol*.22*(1.-(n.y*.5+.5));                                                 // canopy underside AO
    col+=fol*uSunCol*vec3(.75,.9,.35)*pow(max(dot(-v,sunD()),0.),3.)*.3*(1.-uNight);}  // sun through the leaves
  else if(vMat<1.5){col*=mix(vec3(1.),light,.45);}
  else{col*=1.15;}
  col=mix(col,vec3(1.),vFlash);
#endif
  // under the waterline: tinted, with a foam ring where the body breaks the surface
  float uw=smoothstep(0.,-2.2,vW.y);col=mix(col,col*vec3(.42,.72,.95)+vec3(.02,.09,.16),uw*.62);
  col=mix(col,vec3(1.),(1.-smoothstep(.0,.22,abs(vW.y+.02)))*.75*step(vW.y,.2));
  gl_FragColor=vec4(fogC(col,vW),1.);
}`;
const TERR_VS=`
uniform vec2 uOrigin;uniform sampler2D uH;uniform float uWorld;
varying vec3 vW,vN;
void main(){
  vec2 xz=position.xz*8.+uOrigin;vec2 uv=xz/uWorld;float e=4./uWorld;
  float h=texture2D(uH,uv).r;
  float hx=texture2D(uH,uv+vec2(e,0.)).r-texture2D(uH,uv-vec2(e,0.)).r;
  float hz=texture2D(uH,uv+vec2(0.,e)).r-texture2D(uH,uv-vec2(0.,e)).r;
  vN=normalize(vec3(-hx,8.,-hz));vW=vec3(xz.x,h,xz.y);
  gl_Position=projectionMatrix*viewMatrix*vec4(vW,1.);
}`;
const TERR_FS=`
${GLSL_W}
uniform sampler2D uC;
varying vec3 vW,vN;
void main(){
  vec2 uv=vW.xz/uWorld;vec4 ct=texture2D(uC,uv);vec3 col=ct.rgb;vec3 n=normalize(vN);
  float n1=vn(vW.xz*.21),n2=vn(vW.xz*.045+7.);
  col*=.95+.08*smoothstep(.42,.58,n2)+.04*step(.55,n1);
  float st=step(.8,vn(vW.xz*vec2(.9,.33)+n2*4.))*ct.a;col=mix(col,col*.87,st*.7);
  float slope=1.-n.y;vec3 rock=vec3(.60,.58,.64)*(.9+.2*n1);
  col=mix(col,rock,smoothstep(.07,.16,slope)*smoothstep(.3,1.2,vW.y));
  col*=mix(.8,1.,smoothstep(-.1,1.1,vW.y));
  float d=-vW.y;
  if(d>0.){float dd=smoothstep(0.,7.,d);col=mix(col*vec3(.78,.96,1.),vec3(.1,.34,.6),dd*.8);
    float ca=vn(vW.xz*.42+vec2(uTime*.5,uTime*.3))+vn(vW.xz*.42-vec2(uTime*.4,-uTime*.35));col+=smoothstep(1.04,1.16,ca)*.1*(1.-dd)*(1.-uNight);}
  col*=1.+gust(vW.xz)*.07*ct.a;                                  // wind waves brighten the meadow floor too
  float lit=smoothstep(.2,.78,dot(n,uSun));
  col*=mix(uAmb*1.12,uAmb*.72+uSunCol*.66,lit*(1.-.45*cloudSh(vW.xz)));
  gl_FragColor=vec4(fogC(col,vW),1.);
}`;
const WATER_VS=`varying vec3 vW;void main(){vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`;
const WATER_FS=`
${GLSL_W}
uniform sampler2D uH,uC;
varying vec3 vW;
void main(){
  vec2 uv=vW.xz/uWorld;float d=-texture2D(uH,uv).r;if(d<-.25)discard;
  float t=uTime;float n1=vn(vW.xz*.11+vec2(t*.35,t*.2)),n2=vn(vW.xz*.27-vec2(t*.45,-t*.3));
  vec3 bed=texture2D(uC,uv).rgb;
  vec3 col=mix(vec3(.36,.84,.88),vec3(.08,.36,.72),smoothstep(.4,8.,d));
  col=mix(col,bed*vec3(.6,.95,.8),.3*(1.-smoothstep(.5,4.,d)));
  float lines=smoothstep(.70,.74,vn(vW.xz*vec2(.16,.5)+vec2(t*.3,n1*2.)));col+=lines*.1;
  vec3 v=normalize(cameraPosition-vW);float fr=pow(1.-max(v.y,0.),3.);
  col=mix(col,mix(uFogCol,uSkyTop,.4)*1.05,fr*.55);
  float cs=cloudSh(vW.xz);
  col*=mix(uAmb*.62+uSunCol*.6,uAmb*.9,cs*.5);
  float sp=step(.972,vn(vW.xz*1.1+vec2(t*.8,-t*.6)))*step(.6,n2)*(1.-uNight);col+=sp*.6*(1.-cs);
  // sun glitter off the ripples
  vec3 wn=normalize(vec3((n1-.5)*.8+(n2-.5)*.45,1.,(n2-.5)*.8-(n1-.5)*.35));
  col+=uSunCol*pow(max(dot(reflect(-v,wn),sunD()),0.),80.)*1.1*(1.-cs)*(1.-uNight);
  float w=.25*sin(t*1.6+n1*6.283);
  float foam=smoothstep(.95+w,.45+w,d)*smoothstep(-.2,.12,d);
  foam=max(foam,smoothstep(.6,.64,n2)*smoothstep(2.2,.9,d)*.5);
  col=mix(col,vec3(1.)*(uAmb*.7+uSunCol*.5),foam*.9);
  float a=mix(.5,.9,smoothstep(0.,6.,d));a=max(a,foam);a*=smoothstep(-.2,.15,d);
  float f=smoothstep(uFog.x,uFog.y,distance(vW,cameraPosition));col=fogC(col,vW);a=mix(a,1.,f*step(.5,d));
  gl_FragColor=vec4(col,a);
}`;
const GRASS_VS=`
${GLSL_W}
attribute vec2 iO;attribute vec3 aG;   // aG: height fraction, blade angle, part (0 blade, 1 flower)
uniform vec3 uFocus;uniform vec3 uGrass;uniform sampler2D uH,uC;uniform float uClear;
uniform vec4 uPush[8];                 // creatures parting the grass: x, z, radius, strength
varying vec3 vCol,vW;varying float vTip;
void main(){
  float SP=uGrass.x,RR=uGrass.y;
  vec2 cell=floor(uFocus.xz/SP)+iO;vec2 xz=cell*SP;
  float h1=hash(cell),h2=hash(cell+17.3),h3=hash(cell+41.7),h4=hash(cell+73.1);
  xz+=(vec2(h1,h2)-.5)*SP*.95;vec2 uv=xz/uWorld;
  vec4 ct=texture2D(uC,uv);float gh=texture2D(uH,uv).r;
  float keep=step(h3,ct.a*1.05)*step(.35,gh)*step(0.,xz.x)*step(0.,xz.y)*step(xz.x,uWorld)*step(xz.y,uWorld);
  float fade=1.-smoothstep(RR*.6,RR,distance(xz,uFocus.xz));
  float dfo=distance(xz,uFocus.xz);
  float sc=keep*fade*(.6+.6*h4)*uGrass.z*mix(.3,1.,smoothstep(uClear,uClear*2.4+2.,dfo));
  float fl=step(h4,.05);
  float a=aG.y+h1*6.283;float c=cos(a),s=sin(a);
  vec3 p=position;if(aG.z>.5)p*=fl;
  // wind: idle sway + rolling gusts along the wind direction (+ a little flutter across it)
  float g=gust(xz),hk=aG.x*aG.x;
  vec2 bv=uWind.xy*(sin(uTime*1.7+xz.x*.13+xz.y*.09)*.16+.06+g*1.25)+vec2(-uWind.y,uWind.x)*sin(uTime*2.6+h2*6.3)*.07;
  // creatures part the grass around them
  float fp=0.;for(int i=0;i<8;i++){vec4 pp=uPush[i];vec2 dd=xz-pp.xy;float l=length(dd)+.01;float k=(1.-smoothstep(pp.z*.45,pp.z*1.35+1.5,l))*pp.w;bv+=dd/l*k*1.5;fp=max(fp,k);}
  bv*=hk;
  vec3 q=vec3(p.x*c-p.z*s+bv.x,p.y*(1.-min(.55,length(bv)*.16)-fp*.3),p.x*s+p.z*c+bv.y)*sc;
  vW=vec3(xz.x,gh,xz.y)+q;
  vec3 fc=h2<.33?vec3(1.,.98,.9):h2<.66?vec3(1.,.82,.25):vec3(1.,.6,.75);
  vec3 base=ct.rgb*(.92+.16*h3);
  vec3 bc=mix(base*.8,base*vec3(1.16,1.22,.9)+vec3(.035,.035,0.),aG.x)+aG.x*g*vec3(.16,.17,.11);   // shaded roots, sunny tips, gust sheen
  vCol=aG.z>.5?fc:bc;vTip=aG.x*(1.-aG.z);
  gl_Position=projectionMatrix*viewMatrix*vec4(vW,1.);
}`;
const GRASS_FS=`
${GLSL_W}
varying vec3 vCol,vW;varying float vTip;
void main(){float cs=cloudSh(vW.xz);vec3 col=vCol*mix(uAmb*.74+uSunCol*.64,uAmb*1.05,cs*.45);
  vec3 v=normalize(cameraPosition-vW);col+=vCol*uSunCol*pow(max(dot(-v,sunD()),0.),4.)*vTip*.45*(1.-cs)*(1.-uNight);   // backlit blades glow
  gl_FragColor=vec4(fogC(col,vW),1.);}`;
const QUAD_VS=`
attribute vec4 iP;attribute vec4 iX;attribute vec4 iC;attribute vec4 iS;
varying vec2 vUV;varying vec4 vC;varying vec4 vS;varying vec3 vW;
void main(){
  vec3 c=iP.xyz;float sz=iP.w;int mode=int(iS.y+.5);vec3 rt,up;
  if(mode==0){vec3 cr=vec3(viewMatrix[0][0],viewMatrix[1][0],viewMatrix[2][0]),cu=vec3(viewMatrix[0][1],viewMatrix[1][1],viewMatrix[2][1]);
    float ca=cos(iX.w),sa=sin(iX.w);rt=(cr*ca+cu*sa)*sz;up=(cu*ca-cr*sa)*sz;}
  else if(mode==1){vec3 ax=iX.xyz;vec3 tc=normalize(cameraPosition-c);vec3 sd=cross(ax,tc);float l=length(sd);sd=l>1e-4?sd/l:vec3(0.,1.,0.);rt=ax;up=sd*sz;}
  else{vec3 n=normalize(iX.xyz);vec3 t=normalize(cross(vec3(0.,0.,1.),n));vec3 b=cross(n,t);float ca=cos(iX.w),sa=sin(iX.w);rt=(t*ca+b*sa)*sz;up=(b*ca-t*sa)*sz;}
  vec3 w=c+rt*position.x+up*position.y;
  vUV=position.xy;vC=iC;vS=iS;vW=w;
  gl_Position=projectionMatrix*viewMatrix*vec4(w,1.);
}`;
const QUAD_FS=`
${GLSL_ENV}
float wingA(vec2 q,float fw){q.x=abs(q.x)/max(fw,.12);   // butterfly / dragonfly wings (fw = flap opening)
  return max(smoothstep(.05,-.05,length((q-vec2(.5,.22))*vec2(1.,1.25))-.48),smoothstep(.05,-.05,length((q-vec2(.4,-.38))*vec2(1.,1.1))-.32));}
varying vec2 vUV;varying vec4 vC;varying vec4 vS;varying vec3 vW;
void main(){
  int sh=int(vS.x+.5);float r=length(vUV),a=0.;float p1=vS.z;
  if(sh==0)a=smoothstep(1.,.86,r);
  else if(sh==1){a=max(0.,1.-r);a*=a;}
  else if(sh==2){float w=p1>0.?p1:.1;a=smoothstep(w,w*.5,abs(r-(1.-w)));}
  else if(sh==3){float an=atan(vUV.y,vUV.x);float k=pow(abs(cos(an*2.)),5.);a=smoothstep(.06,0.,r-mix(.3,1.,k));}
  else if(sh==4){vec2 q=vUV*1.25;q.y=-q.y+.25;float x2=q.x*q.x;float hy=q.y-sqrt(abs(q.x))*.6;a=smoothstep(.05,-.05,x2+hy*hy-.62);}
  else if(sh==5)a=step(max(abs(vUV.x),abs(vUV.y)),.92);
  else if(sh==6){vec2 q=abs(vUV);float hx=max(q.x*.866+q.y*.5,q.y);float edge=smoothstep(.1,.04,abs(hx-.86));
    vec2 g=vUV*2.4;vec2 gi=abs(fract(g*vec2(1.,.577)+vec2(0.,floor(g.x)*.5))-.5);float cell=smoothstep(.06,.02,min(gi.x,gi.y))*.45*step(hx,.86);a=max(edge,cell)+step(hx,.86)*.12;}
  else if(sh==7){float w=.11;float an=atan(vUV.x,vUV.y);float fr=an/3.14159;   // fr: 0 at +y, +-1 at -y
    float on=p1>=0.?step(0.,fr)*step(fr,p1):step(fr,0.)*step(-fr,-p1);a=smoothstep(w,w*.55,abs(r-(1.-w)))*on;}
  else if(sh==8){float e=1.-abs(vUV.y);float tp=p1>.5?1.:smoothstep(-1.,-.2,vUV.x);a=smoothstep(0.,.5,e)*tp*smoothstep(1.,.9,abs(vUV.x));}
  else if(sh==9){a=smoothstep(.16,.08,abs(r-.82))+smoothstep(.2,.1,length(vUV-vec2(-.35,.4)));}
  else if(sh==10){a=smoothstep(1.,.25,r)*.85;}
  else if(sh==11){a=smoothstep(1.,.85,length(vUV*vec2(1.,2.3)));}
  else if(sh==12){a=smoothstep(1.,.2,r);}
  float shade=1.;
  if(sh==13){a=max(wingA(vUV,p1),smoothstep(.04,-.02,length(vUV*vec2(7.,1.25))-1.));shade=mix(1.,.45,smoothstep(.55,.95,r))*mix(1.,.3,step(abs(vUV.x),.08));}
  else if(sh==14){float x=abs(vUV.x);float yc=vUV.y-(p1*.55*x-.18*x*(1.-x)*(1.-p1));float th=.15*(1.-x)+.025;
    a=max(smoothstep(th,th*.4,abs(yc))*step(x,.98),smoothstep(.06,-.02,length(vUV*vec2(3.2,4.))-.42));}
  else if(sh==15){a=max(smoothstep(.04,-.04,length(vUV*vec2(1.05,2.8))-.78),step(vUV.x,-.6)*step(abs(vUV.y),(-.6-vUV.x)*1.1)*step(-.98,vUV.x));shade=mix(1.25,.8,step(0.,vUV.y));}
  a=clamp(a,0.,1.)*vC.a;if(a<.004)discard;
  float f=smoothstep(uFog.x,uFog.y,distance(vW,cameraPosition));a*=1.-f;
  float add=vS.w;vec3 col=vC.rgb*shade;if(add<.01&&sh!=12)col*=mix(vec3(1.),uAmb*.74+uSunCol*.6,.75);
  gl_FragColor=vec4(col*a,a*(1.-add));
}`;
const SKY_VS=`varying vec3 vD;void main(){vD=position;vec4 p=projectionMatrix*viewMatrix*vec4(position+cameraPosition,1.);gl_Position=p.xyww;}`;
const SKY_FS=`
${GLSL_W}
varying vec3 vD;
void main(){
  vec3 d=normalize(vD);float t=max(d.y,0.);vec3 s3=sunD();
  vec3 col=mix(hazeC(d),uSkyTop,smoothstep(0.,.5,pow(t,.85)));
  col+=(1.-smoothstep(0.,.14,abs(d.y)))*.045*(1.-uNight);                 // bright band along the horizon
  float sd=dot(d,s3);
  col+=mix(uSunCol,vec3(1.),.5)*(smoothstep(.9965,.9975,sd)+pow(max(sd,0.),24.)*.2)*(1.-uNight*.4);
  // painterly clouds: shaded bellies, sunlit rims (density probed one step toward the sun)
  vec2 cu=d.xz/(d.y+.22)*1.6-uWind.xy*uTime*.006;float cl=vn(cu)*.6+vn(cu*2.3+3.)*.4;
  vec2 so=normalize(s3.xz+1e-4)*.09;float cl2=vn(cu+so)*.6+vn((cu+so)*2.3+3.)*.4;
  float cm=smoothstep(.54,.63,cl)*smoothstep(.02,.2,d.y);
  float lit=clamp(.35+(cl-cl2)*7.-smoothstep(.62,.8,cl)*.35,0.,1.);
  vec3 cc=mix(mix(uFogCol,uSkyTop,.3)*.9+uAmb*.08,vec3(1.)*(uAmb*.6+uSunCol*.6),lit);
  cc+=uSunCol*pow(max(sd,0.),5.)*.45*(1.-smoothstep(.58,.74,cl))*(1.-uNight);
  col=mix(col,cc,cm*.92);
  float stv=step(.9975,hash(floor(d.xz/(d.y+.4)*220.)))*uNight*smoothstep(.1,.4,d.y)*(1.-cm);col+=stv;
  gl_FragColor=vec4(col,1.);
}`;
const POST_FS=`
uniform sampler2D tex,uBloom;uniform vec2 uRes,uBT;uniform float uTime;uniform vec4 uF1,uF2,uF3,uSunS;uniform vec3 uSunC;varying vec2 vUV;
void main(){
  vec2 uv=vUV;vec2 c=uv-.5;float asp=uRes.x/uRes.y;float r=length(c*vec2(asp,1.))*1.15;
  float tox=uF3.x;uv+=tox*.006*vec2(sin(uv.y*24.+uTime*3.),cos(uv.x*20.+uTime*2.6));
  float ca=uF2.z*.0035*r;
  vec3 col=vec3(texture2D(tex,uv+c*ca).r,texture2D(tex,uv).g,texture2D(tex,uv-c*ca).b);
  // soft bloom from the quarter-res bright pass: sky and sunlit edges glow onto silhouettes
  vec3 bl=texture2D(uBloom,uv).rgb*.4+(texture2D(uBloom,uv+uBT*vec2(1.5,1.5))+texture2D(uBloom,uv-uBT*vec2(1.5,1.5))+texture2D(uBloom,uv+uBT*vec2(1.5,-1.5))+texture2D(uBloom,uv-uBT*vec2(1.5,-1.5))).rgb*.15;
  col+=bl*.32;
  // sun glare, dimmed when something blocks the sun
  if(uSunS.z>0.){vec2 sp=uSunS.xy;float vis=0.;
    for(int i=0;i<5;i++){vec2 o=vec2(i==1?.012:i==2?-.012:0.,i==3?.012*asp:i==4?-.012*asp:0.);vec3 s=texture2D(tex,sp+o).rgb;vis+=smoothstep(.72,.95,max(s.r,max(s.g,s.b)))*.2;}
    float dd=length((uv-sp)*vec2(asp,1.));col+=uSunC*vis*uSunS.z*(exp(-dd*5.)*.22+exp(-dd*28.)*.18);}
  {vec3 k=clamp(col,0.,1.);col=mix(col,k*k*(3.-2.*k),.16);}                      // gentle S-curve
  float g=dot(col,vec3(.3,.59,.11));
  col=mix(col,vec3(g)*vec3(1.06,1.,.9),clamp(uF1.w*.75+uF2.w,0.,1.));           // old age / death: colour drains
  col=mix(col,col*vec3(.75,1.08,.7)+vec3(.0,.03,.0),tox*.6);
  col=mix(col,col*vec3(.86,.95,1.1),uF3.y*.5);
  float vig=smoothstep(.45,1.15,r);
  col*=1.-vig*(.22+uF3.y*.25+uF1.w*.3);
  float beat=uF1.y;
  col=mix(col,vec3(1.,.42,.12),vig*uF1.x*(.26+.26*beat));                        // adrenaline
  col=mix(col,vec3(.75,.02,.04),smoothstep(.3,1.1,r)*clamp(uF1.z,0.,1.)*(.55+.25*beat)); // hurt
  col=mix(col,vec3(.72,.55,.25),smoothstep(.35,1.1,r)*uF2.x*.75);              // drying out
  col+=uF2.y*.7;
  gl_FragColor=vec4(col,1.);
}`;
const BLOOM_FS=`
uniform sampler2D tex;uniform vec2 uTx;varying vec2 vUV;
vec3 bp(vec2 o){vec3 c=texture2D(tex,vUV+o*uTx).rgb;return c*smoothstep(.66,1.05,max(c.r,max(c.g,c.b)));}
void main(){gl_FragColor=vec4(bp(vec2(0.))*.25+(bp(vec2(1.,0.))+bp(vec2(-1.,0.))+bp(vec2(0.,1.))+bp(vec2(0.,-1.)))*.125
  +(bp(vec2(1.,1.))+bp(vec2(-1.,-1.))+bp(vec2(1.,-1.))+bp(vec2(-1.,1.)))*.0625,1.);}`;
// ---------------------------------------------------------------- setup
const Q_DISC=0,Q_GLOW=1,Q_RING=2,Q_STAR=3,Q_HEART=4,Q_SQ=5,Q_HEX=6,Q_ARC=7,Q_STREAK=8,Q_BUB=9,Q_PUFF=10,Q_LEAF=11,Q_SHADOW=12,Q_BFLY=13,Q_BIRD=14,Q_FISH=15;
const BATCH={};let QG=null,QA=null;
function mkBaseGeo(M){const g={};g.position=new THREE.Float32BufferAttribute(M.p,3);g.normal=new THREE.Float32BufferAttribute(M.n,3);g.aCol=new THREE.Float32BufferAttribute(M.c,4);
  g.aPiv=new THREE.Float32BufferAttribute(M.a,3);g.aAnm=new THREE.Float32BufferAttribute(M.v,3);g.index=new THREE.BufferAttribute(M.p.length/3>65535?new Uint32Array(M.i):new Uint16Array(M.i),1);return g}
function instGeo(base,cap,dyn){const g=new THREE.InstancedBufferGeometry();for(const k of['position','normal','aCol','aPiv','aAnm'])g.setAttribute(k,base[k]);g.setIndex(base.index);
  const at={};for(const k of['iA','iB','iC','iD']){at[k]=new THREE.InstancedBufferAttribute(new Float32Array(cap*4),4);if(dyn)at[k].setUsage(THREE.DynamicDrawUsage);g.setAttribute(k,at[k])}
  g.instanceCount=0;return{g,at}}
function mkBatch(key,cap,scene){const {g,at}=instGeo(R3.base[key],cap,true);
  const mesh=new THREE.Mesh(g,R3.mToon),ol=new THREE.Mesh(g,R3.mOut);mesh.frustumCulled=ol.frustumCulled=false;mesh.visible=ol.visible=false;scene.add(mesh);scene.add(ol);
  return BATCH[key]={g,A:at.iA.array,B:at.iB.array,C:at.iC.array,D:at.iD.array,at,n:0,cap,mesh,ol}}
let BREATH=0,GLOSS=0;   // BREATH: 1 while pushing living creatures (idle breathing swell); GLOSS: species sheen (wet skin, shells)
const GLOSSK={beetle:.9,frog:.75,leech:.8,eel:.7,minnow:.6,catfish:.55,shark:.5,crayfish:.6,snail:.45,viper:.4,larva:.5};
function bPush(b,x,y,z,yaw,sc,ph,mv,bite,tr,tg,tb,al,flash,sat){if(b.n>=b.cap)return;const o=b.n*4;
  b.A[o]=x;b.A[o+1]=y;b.A[o+2]=z;b.A[o+3]=yaw;b.B[o]=sc;b.B[o+1]=ph;b.B[o+2]=mv;b.B[o+3]=bite;b.C[o]=tr;b.C[o+1]=tg;b.C[o+2]=tb;b.C[o+3]=al;b.D[o]=flash;b.D[o+1]=sat;b.D[o+2]=BREATH;b.D[o+3]=GLOSS;b.n++}
function bFlush(b){b.g.instanceCount=b.n;b.mesh.visible=b.ol.visible=b.n>0;if(b.n)for(const k in b.at){const a=b.at[k];a.clearUpdateRanges();a.addUpdateRange(0,b.n*4);a.needsUpdate=true}}
function mkQuads(cap,scene,order,offset){const g=new THREE.InstancedBufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute([-1,-1,0,1,-1,0,1,1,0,-1,1,0],3));g.setIndex([0,1,2,0,2,3]);
  const at={};for(const k of['iP','iX','iC','iS']){at[k]=new THREE.InstancedBufferAttribute(new Float32Array(cap*4),4);at[k].setUsage(THREE.DynamicDrawUsage);g.setAttribute(k,at[k])}
  const mat=new THREE.ShaderMaterial({vertexShader:QUAD_VS,fragmentShader:QUAD_FS,uniforms:U3,transparent:true,depthWrite:false,side:THREE.DoubleSide,
    blending:THREE.CustomBlending,blendSrc:THREE.OneFactor,blendDst:THREE.OneMinusSrcAlphaFactor,blendSrcAlpha:THREE.OneFactor,blendDstAlpha:THREE.OneMinusSrcAlphaFactor,
    polygonOffset:!!offset,polygonOffsetFactor:-2,polygonOffsetUnits:-4});
  const mesh=new THREE.Mesh(g,mat);mesh.frustumCulled=false;mesh.renderOrder=order;scene.add(mesh);
  return{g,at,P:at.iP.array,X:at.iX.array,C:at.iC.array,S:at.iS.array,n:0,cap,mesh}}
function qPush(Q,x,y,z,size,ax,ay,az,rot,r,g,b,a,shape,mode,p1,add){if(Q.n>=Q.cap||a<=.003)return;const o=Q.n*4;
  Q.P[o]=x;Q.P[o+1]=y;Q.P[o+2]=z;Q.P[o+3]=size;Q.X[o]=ax;Q.X[o+1]=ay;Q.X[o+2]=az;Q.X[o+3]=rot;Q.C[o]=r;Q.C[o+1]=g;Q.C[o+2]=b;Q.C[o+3]=a;Q.S[o]=shape;Q.S[o+1]=mode;Q.S[o+2]=p1||0;Q.S[o+3]=add||0;Q.n++}
const _n3=[0,1,0];
// flat decal on the ground (or the water surface)
function qFlat(x,y,size,r,g,b,a,shape,p1,add,rot,lift){const h=heightAt(x,y);if(h>0)nrmAt(x,y,_n3);else{_n3[0]=0;_n3[1]=1;_n3[2]=0}
  qPush(QG,x,Math.max(h,0)+(lift||.18),y,size,_n3[0],_n3[1],_n3[2],rot||0,r,g,b,a,shape,2,p1,add)}
const qBill=(x,h,y,size,r,g,b,a,shape,add,rot,p1)=>qPush(QA,x,h,y,size,0,0,0,rot||0,r,g,b,a,shape,0,p1,add);
function qBeam(Q,x1,h1,y1,x2,h2,y2,w,r,g,b,a,add,p1){qPush(Q,(x1+x2)/2,(h1+h2)/2,(y1+y2)/2,w,(x2-x1)/2,(h2-h1)/2,(y2-y1)/2,0,r,g,b,a,Q_STREAK,1,p1===undefined?1:p1,add)}
function qFlush(Q){Q.g.instanceCount=Q.n;Q.mesh.visible=Q.n>0;if(Q.n)for(const k in Q.at){const a=Q.at[k];a.clearUpdateRanges();a.addUpdateRange(0,Q.n*4);a.needsUpdate=true}}
function r3Init(){
  THREE.ColorManagement.enabled=false;
  const rn=new THREE.WebGLRenderer({canvas:glc,antialias:false,alpha:false,stencil:false,powerPreference:'high-performance'});
  rn.outputColorSpace=THREE.LinearSRGBColorSpace;rn.autoClear=false;rn.setPixelRatio(1);R3.rn=rn;
  R3.coarse=!!(window.matchMedia&&matchMedia('(pointer:coarse)').matches);
  if(navigator.webdriver&&location.hash!=='#hq'){R3.q=.3;R3.testSkip=true}   // automated test runs: tiny and sparse rendering
  U3.uSun.value=new THREE.Vector3(.3,.8,.4).normalize();U3.uSunCol.value=new THREE.Vector3(1,.9,.8);U3.uAmb.value=new THREE.Vector3(.5,.5,.6);U3.uFogCol.value=new THREE.Vector3(.7,.85,.95);
  U3.uSkyTop.value=new THREE.Vector3(.35,.6,.95);U3.uFog.value=new THREE.Vector2(300,640);U3.uFocus.value=new THREE.Vector3();U3.uFocusS.value=new THREE.Vector4(0,0,1e6,.3);
  U3.uRes.value=new THREE.Vector2(1,1);U3.uOrigin.value=new THREE.Vector2();U3.uGrass.value=new THREE.Vector3(3.2,110,1);
  U3.uWind.value=new THREE.Vector3(.8,.6,1);for(let i=0;i<8;i++)U3.uPush.value.push(new THREE.Vector4(-1e4,-1e4,1,0));
  R3.cam=new THREE.PerspectiveCamera(52,1,1,1700);
  const S1=R3.S1=new THREE.Scene(),S2=R3.S2=new THREE.Scene(),S3=R3.S3=new THREE.Scene();
  // sky
  const sky=new THREE.Mesh(new THREE.BoxGeometry(2,2,2),new THREE.ShaderMaterial({vertexShader:SKY_VS,fragmentShader:SKY_FS,uniforms:U3,side:THREE.BackSide,depthWrite:false,depthTest:false}));
  sky.frustumCulled=false;sky.renderOrder=-10;S1.add(sky);
  // terrain grid (follows the camera, heights come from the baked texture)
  {const NG=176,pos=[],idx=[];for(let j=0;j<=NG;j++)for(let i=0;i<=NG;i++)pos.push(i-NG/2,0,j-NG/2);
    for(let j=0;j<NG;j++)for(let i=0;i<NG;i++){const a=j*(NG+1)+i,b=a+NG+1;idx.push(a,b,a+1,a+1,b,b+1)}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setIndex(idx);
    const m=new THREE.Mesh(g,new THREE.ShaderMaterial({vertexShader:TERR_VS,fragmentShader:TERR_FS,uniforms:U3}));m.frustumCulled=false;m.renderOrder=0;S1.add(m);R3.terr=m}
  QG=mkQuads(1800,S1,2,true);
  {const g=new THREE.PlaneGeometry(1,1);g.rotateX(-Math.PI/2);const m=new THREE.Mesh(g,new THREE.ShaderMaterial({vertexShader:WATER_VS,fragmentShader:WATER_FS,uniforms:U3,transparent:true,depthWrite:false}));
    m.scale.set(2400,1,2400);m.frustumCulled=false;m.renderOrder=3;S1.add(m);R3.water=m}
  // grass field that wraps around the camera
  {const GN=R3.coarse?62:76,pos=[],aG=[],idx=[];let v=0;
    for(let b=0;b<4;b++){const an=b*1.7+.3,w=.42,hh=[2.7,2.1,2.4,1.7][b],ox=[-.5,.45,.1,-.15][b],oz=[-.2,.3,-.5,.5][b];
      pos.push(-w+ox,0,oz,w+ox,0,oz,ox,hh,oz);aG.push(0,an,0,0,an,0,hh/2.7,an,0);idx.push(v,v+1,v+2);v+=3}
    for(const sx of[-1,1])for(const sy of[-1,1]){pos.push(sx*.32,2.9+sy*.32,0);aG.push(1,0,1)}idx.push(v,v+1,v+2,v+1,v+3,v+2);v+=4;
    const g=new THREE.InstancedBufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('aG',new THREE.Float32BufferAttribute(aG,3));g.setIndex(idx);
    const io=new Float32Array(GN*GN*2);for(let j=0;j<GN;j++)for(let i=0;i<GN;i++){io[(j*GN+i)*2]=i-GN/2;io[(j*GN+i)*2+1]=j-GN/2}
    g.setAttribute('iO',new THREE.InstancedBufferAttribute(io,2));g.instanceCount=GN*GN;R3.grassN=GN;
    const m=new THREE.Mesh(g,new THREE.ShaderMaterial({vertexShader:GRASS_VS,fragmentShader:GRASS_FS,uniforms:U3,side:THREE.DoubleSide}));m.frustumCulled=false;S2.add(m);R3.grass=m}
  // toon materials
  const mkT=(defs,tk,side)=>new THREE.ShaderMaterial({vertexShader:TOON_VS,fragmentShader:TOON_FS,defines:defs,side:side||THREE.FrontSide,
    uniforms:Object.assign({uTimeK:{value:tk}},U3)});
  R3.mToon=mkT({},0);R3.mOut=mkT({OUTLINE:1},0,THREE.BackSide);R3.mDec=mkT({DECOR:1},1);R3.mDecOut=mkT({DECOR:1,OUTLINE:1},1,THREE.BackSide);
  buildModels();R3.base={};for(const k in MODELS)R3.base[k]=mkBaseGeo(MODELS[k]);
  {const hi=MODELS;MODELS={};M_Q=.5;buildModels();M_Q=1;for(const k in MODELS)R3.base[k+'~']=mkBaseGeo(MODELS[k]);Object.assign(MODELS_LO,MODELS);MODELS=hi}
  for(const k in SP){mkBatch(k,k==='larva'?24:60,S2);mkBatch(k+'~',k==='larva'?24:110,S2)}
  mkBatch('seg_viper',260,S2);mkBatch('seg_eel',200,S2);mkBatch('seg_viper~',600,S2);mkBatch('seg_eel~',400,S2);mkBatch('wings',40,S2);
  mkBatch('berry',160,S2);mkBatch('leaf',200,S2);mkBatch('algae',200,S2);mkBatch('mush',32,S2);mkBatch('cyst',8,S2);
  QA=mkQuads(2600,S3,5,false);
  // post
  R3.rt=new THREE.WebGLRenderTarget(4,4,{samples:R3.coarse?0:4,depthBuffer:true});
  R3.bloomRT=new THREE.WebGLRenderTarget(4,4,{depthBuffer:false});
  const FSQ_VS='varying vec2 vUV;void main(){vUV=position.xy*.5+.5;gl_Position=vec4(position.xy,0.,1.);}';
  R3.postMat=new THREE.ShaderMaterial({vertexShader:FSQ_VS,fragmentShader:POST_FS,depthTest:false,depthWrite:false,
    uniforms:{tex:{value:R3.rt.texture},uBloom:{value:R3.bloomRT.texture},uBT:{value:new THREE.Vector2(1,1)},uRes:U3.uRes,uTime:U3.uTime,uF1:{value:new THREE.Vector4()},uF2:{value:new THREE.Vector4()},uF3:{value:new THREE.Vector4()},
      uSunS:{value:new THREE.Vector4()},uSunC:{value:new THREE.Vector3(1,1,1)}}});
  R3.bloomMat=new THREE.ShaderMaterial({vertexShader:FSQ_VS,fragmentShader:BLOOM_FS,depthTest:false,depthWrite:false,uniforms:{tex:{value:R3.rt.texture},uTx:{value:new THREE.Vector2(1,1)}}});
  const pg=new THREE.BufferGeometry();pg.setAttribute('position',new THREE.Float32BufferAttribute([-1,-1,0,3,-1,0,-1,3,0],3));
  R3.postScene=new THREE.Scene();const pm=new THREE.Mesh(pg,R3.postMat);pm.frustumCulled=false;R3.postScene.add(pm);R3.postCam=new THREE.Camera();
  R3.bloomScene=new THREE.Scene();const bm=new THREE.Mesh(pg,R3.bloomMat);bm.frustumCulled=false;R3.bloomScene.add(bm);
  R3.ok=true;r3Icons();
}
// portraits for the map, rendered from the real models
function r3Icons(){
  const rn=R3.rn,S=96,rt=new THREE.WebGLRenderTarget(S,S),cam=new THREE.OrthographicCamera(-1.5,1.5,1.5,-1.5,.1,50),buf=new Uint8Array(S*S*4);
  U3.uFog.value.set(1e5,1e6);R3.grass.visible=false;rn.setClearColor(0,0);
  for(const k in SP){for(const b in BATCH){BATCH[b].n=0;bFlush(BATCH[b])}
    const b=BATCH[k],hh=(MODEL_H[k]||1.2)*.5;bPush(b,0,5,0,0,1,1,.4,0,1,1,1,1,0,1);bFlush(b);
    if(SP[k].seg){const sb=BATCH['seg_'+k];for(let i=1;i<=6;i++)bPush(sb,-i*.62,5,Math.sin(i*.9)*.3,0,.62*(1-i*.07),0,0,0,1,1,1,1,0,1);bFlush(sb)}
    const z=k==='hawk'?2.3:SP[k].seg?1.7:k==='shark'||k==='fox'?1.55:1.35;cam.left=-z;cam.right=z;cam.top=z;cam.bottom=-z;cam.updateProjectionMatrix();
    cam.position.set(4+(SP[k].seg?-1.4:0),hh+8.2,6);cam.lookAt(SP[k].seg?-1.2:0,hh+5,0);cam.updateMatrixWorld();
    rn.setRenderTarget(rt);rn.clear();rn.render(R3.S2,cam);rn.readRenderTargetPixels(rt,0,0,S,S,buf);
    const cv=mk(S,S),g=cv.getContext('2d'),id=g.createImageData(S,S);for(let y=0;y<S;y++)id.data.set(buf.subarray((S-1-y)*S*4,(S-y)*S*4),y*S*4);g.putImageData(id,0,0);R3.icons[k]=cv}
  for(const b in BATCH){BATCH[b].n=0;bFlush(BATCH[b])}
  rn.setRenderTarget(null);rt.dispose();R3.grass.visible=true;
}
// static scenery, grouped into coarse cells so distant groups are skipped
function r3BuildDecor(){
  if(!R3.ok)return;
  for(const d of R3.dchunks){R3.S2.remove(d.mesh);R3.S2.remove(d.ol);R3.S2.remove(d.lo);d.g.dispose();d.g2.dispose()}R3.dchunks=[];
  const DC=400,ND=Math.ceil(WORLD/DC),cells=new Map();
  const add=(key,x,y,yaw,sc,ph,tint)=>{const ck=key+':'+((x/DC)|0)+':'+((y/DC)|0);let a=cells.get(ck);if(!a){a=[];cells.set(ck,a)}a.push([x,y,yaw,sc,ph,tint])};
  const TT=[[1,1,1],[.9,1.06,.88],[1.1,1.02,.8],[.88,.98,1.06]];
  for(const t of trees){const h=hash2(t.x,t.y,5);add('tree',t.x,t.y,h*TAU,.88+.34*hash2(t.x,t.y,6),h*9,biomeAt(t.x,t.y)===B_SWAMP?[.78,.86,.7]:TT[t.v&3])}
  for(const r of rocks){const h=hash2(r.x,r.y,5);add('rock',r.x,r.y,h*TAU,.8+.4*hash2(r.x,r.y,6),0,[.94+.12*h,.94+.1*h,1])}
  for(const b of bushes){const h=hash2(b.x,b.y,5);add(b.berry?'bushB':'bush',b.x,b.y,h*TAU,b.r/11*(.94+.14*h),h*9,TT[b.v&3])}
  for(const [ck,arr] of cells){const [key,ci,cj]=ck.split(':');const {g,at}=instGeo(R3.base[key],arr.length,false);
    const g2=new THREE.InstancedBufferGeometry(),bl=R3.base[key+'~'];for(const k of['position','normal','aCol','aPiv','aAnm'])g2.setAttribute(k,bl[k]);g2.setIndex(bl.index);for(const k in at)g2.setAttribute(k,at[k]);g2.instanceCount=arr.length;
    arr.forEach(([x,y,yaw,sc,ph,tint],i)=>{const o=i*4;at.iA.array.set([x,heightAt(x,y)-(key==='tree'?.5:.3),y,yaw],o);at.iB.array.set([sc,ph,1,0],o);at.iC.array.set([tint[0],tint[1],tint[2],1],o);at.iD.array.set([0,1,0,0],o)});
    g.instanceCount=arr.length;const cx=(+ci+.5)*DC,cy=(+cj+.5)*DC;g.boundingSphere=g2.boundingSphere=new THREE.Sphere(new THREE.Vector3(cx,30,cy),DC*.75+60);
    const mesh=new THREE.Mesh(g,R3.mDec),ol=new THREE.Mesh(g,R3.mDecOut),lo=new THREE.Mesh(g2,R3.mDec);R3.S2.add(mesh);R3.S2.add(ol);R3.S2.add(lo);R3.dchunks.push({g,g2,mesh,ol,lo,cx,cy})}
}
function r3World(){bakeTerrain();r3BuildDecor()}
function resize(){
  DPR=Math.min(window.devicePixelRatio||1,3);const W=innerWidth,H=innerHeight;
  uic.width=W*DPR;uic.height=H*DPR;
  if(!R3.ok)return;
  const s=Math.min(DPR,R3.coarse?1.6:2)*R3.q,w=Math.max(160,Math.round(W*s)),h=Math.max(90,Math.round(H*s));
  R3.rn.setSize(w,h,false);R3.rt.setSize(w,h);U3.uRes.value.set(w,h);
  {const bw=Math.max(8,w>>2),bh=Math.max(8,h>>2);R3.bloomRT.setSize(bw,bh);R3.bloomMat.uniforms.uTx.value.set(2/w,2/h);R3.postMat.uniforms.uBT.value.set(1/bw,1/bh)}R3.cam.aspect=W/H;R3.cam.fov=W<H?clamp(52*(1+(1-W/H)*.9),52,80):52;R3.portrait=W<H;R3.cam.updateProjectionMatrix();
}
const _v3=typeof THREE!=='undefined'?new THREE.Vector3():null,_v3b=typeof THREE!=='undefined'?new THREE.Vector3():null;
const WIND={x:.8,y:.6,s:1};   // cosmetic wind shared by shaders (uWind) and drifting particles
function toS3(x,h,y){_v3.set(x,h,y).project(R3.cam);return[(_v3.x*.5+.5)*innerWidth,(.5-_v3.y*.5)*innerHeight,_v3.z>-1&&_v3.z<1&&Math.abs(_v3.x)<1.15&&Math.abs(_v3.y)<1.15]}
// ---------------------------------------------------------------- camera
function camInput(dx,dy){CAM3.yaw+=dx;CAM3.pitch=clamp(CAM3.pitch+dy,.08,1.25);CAM3.manT=0}
function r3Camera(dt){
  const C=CAM3,pc=P.c;C.manT+=dt;let tx,ty,th,dist,pit=C.pitch;
  {const ka=(keys.ArrowRight?1:0)-(keys.ArrowLeft?1:0),kb=(keys.ArrowDown?1:0)-(keys.ArrowUp?1:0),jx=IN.camX||0,jy=IN.camY||0;
    if((ka||kb||jx||jy)&&gameState==='play'&&!modalOpen&&!paused)camInput((ka*2+jx*2.6)*dt,(kb*1.1+jy*1.5)*dt)}
  if(pc&&!pc.dead&&gameState==='play'){
    tx=pc.x+pc.vx*.12;ty=pc.y+pc.vy*.12;th=(pc._y3===undefined?groundY(pc.x,pc.y):pc._y3)+pc.r*(MODEL_H[pc.key]||1.2)*.75;
    dist=(pc.r*5+17)*C.zoom*(R3.portrait?1.2:1)+(isFlying(pc)?16:0);
    if(IN.obs){dist=dist*1.9+40;pit=Math.max(pit,.75)}
    // drift behind the direction of travel when the player isn't steering the camera
    if(C.manT>1&&Math.abs(IN.rawX||0)>.05&&IN.mag>0)C.yaw+=IN.rawX*1.35*dt*(IN.rawY>0.3?.6:1);
  }else if(gameState==='play'||gameState==='over'){tx=C.tx;ty=C.ty;th=C.th;dist=C.dist}
  else{attractA+=dt*.045;C.yaw=attractA*1.2;tx=SPAWN.x+Math.cos(attractA*.7)*150;ty=SPAWN.y+Math.sin(attractA*.9)*120;th=groundY(tx,ty)+8;dist=230;pit=.46}
  const k=1-Math.exp(-dt*(gameState==='play'?9:2));
  if(Math.hypot(tx-C.tx,ty-C.ty)>400){C.tx=tx;C.ty=ty;C.th=th;C.dist=dist;if(pc&&gameState==='play'){C.yaw=pc.ang;C.manT=9}}
  C.tx+=(tx-C.tx)*k;C.ty+=(ty-C.ty)*k;C.th+=(th-C.th)*k;C.dist+=(dist-C.dist)*(1-Math.exp(-dt*4));
  C.pitS=C.pitS===undefined?pit:C.pitS+(pit-C.pitS)*(1-Math.exp(-dt*5));
  C.fx=Math.cos(C.yaw);C.fy=Math.sin(C.yaw);
  const cp=Math.cos(C.pitS),sp=Math.sin(C.pitS);
  cam.shake=Math.max(0,cam.shake-dt*14);const sk=cam.shake*.12*Math.min(1,C.dist/60);
  let px=C.tx-C.fx*C.dist*cp,pz=C.ty-C.fy*C.dist*cp,py=C.th+C.dist*sp;
  const minY=Math.max(heightAt(clamp(px,0,WORLD),clamp(pz,0,WORLD)),0)+2.5;if(py<minY)py=minY;
  C.px=px;C.py=py;C.pz=pz;
  const c3=R3.cam;c3.position.set(px+rnd(-1,1)*sk,py+rnd(-1,1)*sk,pz+rnd(-1,1)*sk);c3.lookAt(C.tx,C.th,C.ty);c3.updateMatrixWorld();c3.matrixWorldInverse.copy(c3.matrixWorld).invert();
  // legacy 2D window used for culling / audio / map
  cam.x=clamp(C.tx-GW/2,0,WORLD-GW);cam.y=clamp(C.ty-GH/2,0,WORLD-GH);
}
// ---------------------------------------------------------------- per-frame scene fill
const SEGP={viper:t=>.64*(1-.6*Math.pow(t,2.2)),eel:t=>.7*(1-.5*Math.pow(t,2.6))};
function creatureY(c,gh){
  const sp=c.sp;if((c.alt||0)>.5)return Math.max(gh,0)+c.alt*1.5;
  if(gh<0){if(sp.hab==='aqua'||sp.hab==='sea'||sp.hab==='marsh'||c.key==='larva')return Math.max(gh,-c.r*(MODEL_H[c.key]||1)*.9);return Math.max(gh,-c.r*.55)}
  return gh}
function r3Creatures(fx,fy,night){
  const RV=Math.min(560,U3.uFog.value.y*.86),RV2=RV*RV,pc=P.c,obs=IN.obs,cx=CAM3.px,cy=CAM3.pz;
  // grass parting: the player plus the nearest grounded creatures (shader takes 8)
  const PU=U3.uPush.value,pr=R3.pushC||(R3.pushC=[]);pr.length=0;
  BREATH=1;
  for(const c of creatures){if(c.dead)continue;const dx=c.x-fx,dy=c.y-fy,d2=dx*dx+dy*dy;if(d2>RV2)continue;
    if(d2<9000&&!(c.alt>.5)&&!(c.hiddenT>0)&&!c.wet){c._pd=c===pc?-1:d2;pr.push(c)}
    const sp=c.sp,lo=c!==pc&&Math.hypot(c.x-cx,c.y-cy)>130+c.r*9?'~':'',b=BATCH[c.key+lo];if(!b)continue;const gh=heightAt(c.x,c.y);let y=creatureY(c,gh),al=1;
    const hidden=c.hiddenT>0;if(hidden){if(c!==pc){c._y3=gh;continue}y=gh-c.r*.55;al=.45}
    c._y3=y;
    const v=Math.hypot(c.vx||0,c.vy||0),fly=(c.alt||0)>.5;let mv=clamp(v/(sp.speed*.45),0,1);if(fly)mv=Math.max(mv,.55);
    const ph=c.animT/4*TAU*2,old=c.stage===2;
    const bite=c.atkCd>0&&sp.atkCd?clamp(1-(sp.atkCd-c.atkCd)/.3,0,1):0;
    let tr=1,tg=1,tb=1,sat=1;if(old){tr=.86;tg=.84;tb=.84;sat=.5}else if(c.stage===0){tr=tg=tb=1.07}
    if(c.feral){tr*=1.2;tg*=.72;tb*=.68}
    const flash=c.hitT>0?.7:0;GLOSS=GLOSSK[c.key]||0;
    bPush(b,c.x,y,c.y,c.ang,c.r,ph,mv,bite,tr,tg,tb,al,flash,sat);
    if(sp.seg&&c.trail){const sb=BATCH['seg_'+c.key+lo],tr2=c.trail,n=11,ys=c.stage===0?.78:1,prof=SEGP[c.key];let lx=c.x,ly=c.y;
      for(let i=1;i<=n;i++){const p=tr2[Math.min(tr2.length-1,Math.round(i*2*ys*SS))];const rr=c.r*prof(i/(n+1));const g2=heightAt(p.x,p.y);
        const yy=g2<0?Math.max(g2,-rr*.95):g2;bPush(sb,p.x,yy+(y-creatureY(c,gh))*0,p.y,Math.atan2(ly-p.y,lx-p.x),rr,i*.7,0,0,(i&1?1:.9)*tr,(i&1?1:.9)*tg,(i&1?1:.92)*tb,al,flash,sat);lx=p.x;ly=p.y}}
    if(!sp.fly&&hasTrait(c,'flight'))bPush(BATCH.wings,c.x,y,c.y,c.ang,c.r,worldT*18,1,0,1,1,1,1,0,1);
    // blob shadow
    const sub=gh<0&&!fly;
    if(!sub&&!hidden){const alt=fly?c.alt*1.5:0,k=Math.max(.35,1-alt/110);qFlat(c.x,c.y,c.r*1.25*k*(sp.seg?.8:1),.02,.05,.1,(fly?.22:.34)*(1-night*.4),Q_SHADOW,0,0,0,.14)}
    if(c.feral){qFlat(c.x,c.y,c.r+4,1,.2,.15,.6,Q_RING,.08,.5);qBill(c.x+Math.cos(c.ang)*c.r*.9,y+c.r*(MODEL_H[c.key]||1)*.7,c.y+Math.sin(c.ang)*c.r*.9,c.r*.5,1,.15,.1,.8,Q_GLOW,1)}
    if(c.rival&&obs){const pu=.5+.3*Math.sin(worldT*6);qFlat(c.x,c.y,c.r+5,.8,.45,1,pu,Q_RING,.1,.6)}
    if(c.stun>0){const hy=y+c.r*((MODEL_H[c.key]||1)+.35),rr=c.r*.7+2;for(let i=0;i<3;i++){const an=worldT*6+i/3*TAU;qBill(c.x+Math.cos(an)*rr,hy+Math.sin(an*2)*.4,c.y+Math.sin(an)*rr,1.6+c.r*.08,1,.9,.4,1,Q_STAR,.5,an)}}
    if(c.key==='eel')qBill(c.x,y+c.r*.5,c.y,c.r*1.6,.5,.8,1,.16+.08*Math.sin(worldT*9+c.id),Q_GLOW,1);
  }
  BREATH=0;GLOSS=0;
  if(pr.length>8){pr.sort((a,b)=>a._pd-b._pd)}
  for(let i=0;i<8;i++){const c=pr[i];if(c)PU[i].set(c.x,c.y,c.r*1.15,1);else PU[i].set(-1e4,-1e4,1,0)}
  // speed after-images
  for(const g of AFTER){const b=BATCH[g.key];if(!b||g.t>.19||!onScreen(g.x,g.y,60))continue;const a=g.t/.19;bPush(b,g.x,groundY(g.x,g.y)+(g.alt||0)*1.5,g.y,g.ang,g.r,g.ph,1,0,1.2,1.3,1.5,a*.26,g.col?.2:.6,1)}
}
function r3Items(fx,fy,night){
  const RV=420;
  for(const f of foods){const dx=f.x-fx,dy=f.y-fy;if(dx>RV||dx<-RV||dy>RV||dy<-RV)continue;const h=hash2(f.x*7,f.y*7,3),gy=groundY(f.x,f.y);
    if(f.kind==='berry'){bPush(BATCH.berry,f.x,gy,f.y,h*TAU,.72,0,0,0,1,1,1,1,0,1);qFlat(f.x,f.y,2.6,.02,.05,.1,.22,Q_SHADOW)}
    else if(f.kind==='algae')bPush(BATCH.algae,f.x,gy+.02,f.y,h*TAU,.8+.3*h,0,0,0,1,1,1,1,0,1);
    else bPush(BATCH.leaf,f.x,gy,f.y,h*TAU,.8+.3*h,worldT*1.6+h*6,1,0,1,1,1,1,0,1)}
  for(const m of mushrooms){if(!m.ready||!onScreen(m.x,m.y,200))continue;const gy=groundY(m.x,m.y),bob=Math.sin(worldT*2+m.x)*.5;
    bPush(BATCH.mush,m.x,gy+bob*.3,m.y,m.x,1.15,0,0,0,1,1,1,1,0,1);qFlat(m.x,m.y,34+bob*3,.25,.9,1,.16+.3*night,Q_GLOW,0,1);qBill(m.x,gy+7,m.y,10,.3,.9,1,.18+.2*night,Q_GLOW,1);
    if(Math.random()<.05)part(m.x+rnd(-5,5),m.y+rnd(-4,4),{z:rnd(2,7),vz:10,life:1,r:.7,g:1,b:1,emi:.9,drag:1,star:1,sz:2})}
  if(P.cyst&&onScreen(P.cyst.x,P.cyst.y,100)){const p=.6+.4*Math.sin(P.cyst.t*3),gy=groundY(P.cyst.x,P.cyst.y);
    bPush(BATCH.cyst,P.cyst.x,gy,P.cyst.y,0,1,P.cyst.t*4,1,0,1,1,1,1,p*.25,1);qFlat(P.cyst.x,P.cyst.y,16+p*8,.7,.3,1,.3*p,Q_GLOW,0,1)}
}
function r3Fx(fx,fy,night){
  // ground decals
  for(const d of decals){if(!onScreen(d.x,d.y,80))continue;
    if(d.mound){const f=Math.min(1,d.t/1.5);qFlat(d.x,d.y,3.8,.54,.37,.22,.8*f,Q_DISC);qFlat(d.x-.4,d.y-.5,2.2,.72,.54,.35,.8*f,Q_DISC,0,0,0,.24);continue}
    const c=d.rgb||(d.rgb=(d.c.match(/\d+/g)||[120,20,20]).map(v=>v/255));qFlat(d.x,d.y,d.s*1.1+.6,c[0],c[1],c[2],Math.min(1,d.t/6)*.8,Q_DISC)}
  for(const s of SLIME){if(!onScreen(s.x,s.y,60))continue;const f=Math.min(1,s.t/3);qFlat(s.x,s.y,s.r+1,.9,.96,1,.3*f,Q_DISC);
    if(Math.sin(worldT*5+s.x*1.7+s.y)>.86)qBill(s.x,groundY(s.x,s.y)+.5,s.y,.8,.8,.95,1,f,Q_STAR,.8)}
  // particles
  for(const p of particles){const dx=p.x-fx,dy=p.y-fy;if(dx>420||dx<-420||dy>420||dy<-420)continue;const a=clamp(p.life/p.max,0,1);
    if(p.ring){const r=lerp(p.r1,p.r0,a),c=p.col||[1,1,1];qFlat(p.x,p.y,r,c[0],c[1],c[2],a*.9,Q_RING,Math.min(.3,1.6/r+.03),.6);continue}
    const gy=groundY(p.x,p.y),y=gy+.7+(p.z||0),al=Math.min(1,a*1.5),r=Math.max(.7,p.sz*.9)*(.5+.5*a),add=p.emi?Math.min(.85,p.emi*.7):0;
    let cr=p.r,cg=p.g,cb=p.b;if(p.emi){const e=.6+p.emi*.5;cr=Math.min(1.4,cr*e+.1);cg=Math.min(1.4,cg*e+.1);cb=Math.min(1.4,cb*e+.1)}
    if(p.heart)qBill(p.x,y,p.y,r*1.8,cr,cg,cb,al,Q_HEART,add);
    else if(p.wake){const l=2.8;qBeam(QG,p.x,gy+.2,p.y,p.x-Math.cos(p.ang)*l,gy+.2,p.y-Math.sin(p.ang)*l,.5,cr,cg,cb,al*.8,.3,0)}
    else if(p.streak){const vz=p.vz||0,sp=Math.hypot(p.vx,p.vy,vz)||1,l=Math.min(9,sp*.06+2);qBeam(QA,p.x,y,p.y,p.x-p.vx/sp*l,y-vz/sp*l,p.y-p.vy/sp*l,Math.max(.35,p.sz*.45),cr,cg,cb,al,add,0)}
    else if(p.bub)qBill(p.x,y,p.y,r+.5,cr,cg,cb,al,Q_BUB,add);
    else if(p.puff)qBill(p.x,y+r,p.y,r*(2.2-a)*1.5,cr,cg,cb,a*.5,Q_PUFF,add*.5);
    else if(p.leaf||p.feather)qBill(p.x,y,p.y,r*1.5,cr,cg,cb,al,Q_LEAF,add,p.life*8);
    else if(p.chunk)qBill(p.x,y,p.y,r,cr,cg,cb,al,Q_SQ,add,p.life*5);
    else if(p.star)qBill(p.x,y,p.y,r*1.6,cr,cg,cb,al,Q_STAR,add,p.life*2);
    else qBill(p.x,y,p.y,r,cr,cg,cb,al,Q_DISC,add)}
  // fireflies, pollen, lingering mist glow
  fireflies.forEach((f,i)=>{if(f.dead)return;const b=.5+.5*Math.sin(f.ph*3);if(b<.15)return;const y=groundY(f.x,f.y)+5+3*Math.sin(f.ph*1.3+i);
    qBill(f.x,y,f.y,2.6,.8,1,.4,b*.7,Q_GLOW,1);qBill(f.x,y,f.y,.5,1,1,.75,b,Q_DISC,.6);if(b>.5)qFlat(f.x,f.y,13,.7,1,.3,.12*b,Q_GLOW,0,1)});
  if(night<.6)for(const m of motes)qBill(m.x,groundY(m.x,m.y)+m.z*.8+2,m.y,.42,1,1,.94,.55*(1-night),Q_DISC,.3);
  for(const cl of clouds){if(cl.flash)qFlat(cl.x,cl.y,90,1,1,1,.5*cl.t/.35,Q_GLOW,0,1);else qFlat(cl.x,cl.y,56,.5,1,.3,.14,Q_GLOW,0,1)}
  r3Ambient();
  skill3d();
  // the player's own aura and status ring
  const pc=P.c;
  if(pc&&!pc.dead&&gameState==='play'){
    const isL=pc.key==='larva',g=.3+night*.7;qFlat(pc.x,pc.y,(isL?46:36)+night*30,isL?.75:.6,isL?.5:.7,1,(isL?.2:.1)*g,Q_GLOW,0,1);
    if(P.adr>=100){const p=.6+.4*Math.sin(worldT*10);qFlat(pc.x,pc.y,pc.r*2.4+12,1,.7,.2,.4*p,Q_GLOW,0,1)}
    const v=P.ringVis,hpR=clamp(pc.hp/pc.maxhp,0,1),R=pc.r+5.5,rot=-(CAM3.yaw+Math.PI/2);
    if(!(pc.hiddenT>0)||true){
      qFlat(pc.x,pc.y,R,1,1,1,v*.3,Q_RING,.07,0,rot,.2);
      const hc=hpR>.5?[.37,.9,.55]:hpR>.25?[1,.78,.25]:[1,.3,.3];qFlat(pc.x,pc.y,R,hc[0],hc[1],hc[2],v,Q_ARC,-hpR,.5,rot,.24);
      if(isL){qFlat(pc.x,pc.y,R,.5,.8,1,v,Q_ARC,Math.max(.001,1-P.dry/DRY),.5,rot,.24)}
      else{const ar=clamp(P.adr/100,0,1),fl=ar>=1?.8+.2*Math.sin(worldT*12):1;qFlat(pc.x,pc.y,R,1,ar>=1?.85*fl:.62,ar>=1?.4:.22,v,Q_ARC,Math.max(.001,ar),.5,rot,.24);
        if(ar>=1)qFlat(pc.x,pc.y,R+2.5,1,.8,.35,.5+.5*Math.sin(worldT*12),Q_RING,.06,.7,0,.26)}}
    if(P.od&&Math.random()<.6)part(pc.x+rnd(-3,3),pc.y+rnd(-3,3),{z:rnd(1,pc.r),life:.25,r:1,g:.35,b:.25,emi:.8,drag:5,sz:2});
  }
}
function r3Ambient(){
  for(const b of AMB.bf){const y=groundY(b.x,b.y)+b.z;
    if(b.k===0){const fw=b.land>0?.3+.15*Math.abs(Math.sin(b.ph*1.5)):.15+.85*Math.abs(Math.sin(b.ph*14));qBill(b.x,y,b.y,1.3,b.col[0],b.col[1],b.col[2],1,Q_BFLY,0,Math.sin(b.ph*2.3)*.3,fw)}
    else qBill(b.x,y,b.y,1.7,b.col[0],b.col[1],b.col[2],.9,Q_BFLY,0,1.5708+Math.sin(b.ph*3)*.15,.55+.3*Math.sin(b.ph*70))}
  const F=AMB.flock;
  if(F){const gy=Math.max(groundY(F.cx,F.cy),0);for(const b of F.B){const a=F.a+b.o*1.6,x=F.cx+Math.cos(a)*F.r*b.r,y=F.cy+Math.sin(a)*F.r*b.r;
    const glide=Math.sin(b.ph*.55)>.1,fl=glide?.18+.06*Math.sin(b.ph*2):Math.sin(b.ph*11);qBill(x,gy+F.h+b.h+Math.sin(b.ph*.8)*2,y,3.2,.15,.16,.21,.88,Q_BIRD,0,F.dir*.18,fl)}}
  const sx=-CAM3.fy,sy=CAM3.fx;   // camera right on the ground plane
  for(const f of AMB.fish){const s=f.t/f.T,x=lerp(f.x0,f.x1,s),y=lerp(f.y0,f.y1,s),h=4*f.hgt*s*(1-s);
    const hz=((f.x1-f.x0)*sx+(f.y1-f.y0)*sy),vh=4*f.hgt*(1-2*s);qBill(x,h,y,f.sz,.78,.88,.98,1,Q_FISH,0,Math.atan2(vh,hz),0)}
}
// ---------------------------------------------------------------- frame
function render(){
  if(!R3.ok)return;
  if(R3.testSkip&&(R3.fc=(R3.fc|0)+1)%10)return;
  const night=nightAmt(),C=CAM3,fx=C.tx,fy=C.ty,rn=R3.rn,pc=P.c;
  // ---- environment: bright storybook daylight, soft blue nights
  const sunUp=Math.sin(TAU*dayT),az=dayT*TAU+.8,dayAmt=smooth(-.12,.3,sunUp),hi=smooth(.05,.55,sunUp);
  U3.uSun.value.set(Math.cos(az)*.55-.25,Math.max(.35,Math.abs(sunUp))+.3,Math.sin(az)*.35-.35).normalize();
  U3.uSunCol.value.set(lerp(.30,lerp(1.0,.94,hi),dayAmt),lerp(.34,lerp(.64,.9,hi),dayAmt),lerp(.55,lerp(.5,.82,hi),dayAmt));
  U3.uAmb.value.set(lerp(.27,lerp(.52,.50,hi),dayAmt),lerp(.32,lerp(.44,.56,hi),dayAmt),lerp(.56,lerp(.52,.66,hi),dayAmt));
  U3.uFogCol.value.set(lerp(.07,lerp(.98,.74,hi),dayAmt),lerp(.11,lerp(.7,.88,hi),dayAmt),lerp(.24,lerp(.55,.97,hi),dayAmt));
  U3.uSkyTop.value.set(lerp(.02,lerp(.36,.3,hi),dayAmt),lerp(.04,lerp(.42,.6,hi),dayAmt),lerp(.13,lerp(.72,.96,hi),dayAmt));
  const mist=clamp(1-Math.abs(((dayT+.5)%1)-.5)*7,0,1)*.9+night*.25;
  const fogF=Math.min(545,430+C.dist*1.6)*(1-mist*.28);U3.uFog.value.set(fogF*.42,fogF+140);
  U3.uTime.value=worldT;U3.uNight.value=night;U3.uMist.value=mist*(1-night*.5);
  {const wa=.65+.55*Math.sin(worldT*.013)+.2*Math.sin(worldT*.047);WIND.x=Math.cos(wa);WIND.y=Math.sin(wa);WIND.s=clamp(.78+.28*Math.sin(worldT*.041)+.14*Math.sin(worldT*.13),.4,1.15);U3.uWind.value.set(WIND.x,WIND.y,WIND.s)}
  U3.uFocus.value.set(fx,C.th,fy);U3.uOrigin.value.set(Math.floor(fx/8)*8,Math.floor(fy/8)*8);
  const big=C.dist>95?2:C.dist>55?1:0;{const SPc=[2.7,3.6,4.8][big];U3.uGrass.value.set(SPc,R3.grassN*SPc*.48,[1,1.2,1.5][big])}
  R3.water.position.set(fx,0,fy);U3.uClear.value=pc&&gameState==='play'?pc.r*1.1+1.5:0;
  // where the player sits on screen (scenery in front of them turns see-through there)
  if(pc&&!pc.dead&&gameState==='play'){_v3.set(fx,C.th,fy).applyMatrix4(R3.cam.matrixWorldInverse);const vz=-_v3.z;_v3.applyMatrix4(R3.cam.projectionMatrix);U3.uFocusS.value.set(_v3.x,_v3.y,vz,.34)}
  else U3.uFocusS.value.set(0,0,-1e6,.3);
  {const far=U3.uFog.value.y+330,nearD=470;for(const d of R3.dchunks){const dd=Math.hypot(d.cx-C.px,d.cy-C.pz),hi=dd<nearD;d.mesh.visible=d.ol.visible=hi;d.lo.visible=!hi&&dd<far}}
  // ---- fill instance buffers
  for(const k in BATCH)BATCH[k].n=0;QG.n=0;QA.n=0;
  r3Creatures(fx,fy,night);r3Items(fx,fy,night);r3Fx(fx,fy,night);
  for(const k in BATCH)bFlush(BATCH[k]);qFlush(QG);qFlush(QA);
  // ---- diegetic screen feedback
  let fAdr=0,fHurt=0,fAge=0,fDry=0,fTox=0,fObs=IN.obs?1:0,fCA=0,fDes=0;
  if(pc&&!pc.dead){fAdr=clamp(P.adr/100,0,1)*.9;const hp=pc.hp/pc.maxhp;fHurt=clamp((.55-hp)/.55,0,1)*.8+(P.hurtT>0?.3:0);
    if(pc.key!=='larva'){const ar=pc.age/pc.life;fAge=clamp((ar-.68)/.32,0,1)}else fDry=clamp((P.dry/DRY-.35)/.65,0,1);
    fTox=P.toxin;fCA=(P.od?1:0)+(P.adr>=100?.5:0)}
  if(gameState!=='play'){fObs=0;fAdr=fHurt=fAge=fDry=fTox=fCA=0}
  if(P.dead)fDes=.7;
  const pu=R3.postMat.uniforms;pu.uF1.value.set(fAdr,P.beat||0,fHurt,fAge);pu.uF2.value.set(fDry,P.flash||0,fCA,fDes);pu.uF3.value.set(fTox||0,fObs,night,mist);
  // sun position on screen for the glare
  {const sd=U3.uSun.value,s=_v3.set(sd.x,sd.y*.55,sd.z).normalize(),cp=R3.cam.position;s.multiplyScalar(800).add(cp).project(R3.cam);
    const on=s.z<1&&Math.abs(s.x)<1.3&&Math.abs(s.y)<1.3&&_v3.set(sd.x,sd.y*.55,sd.z).normalize().dot(R3.cam.getWorldDirection(_v3b))>0;
    pu.uSunS.value.set(s.x*.5+.5,s.y*.5+.5,on?(1-night)*smooth(-.05,.25,sunUp):0,0);const sc=U3.uSunCol.value;pu.uSunC.value.set(sc.x,sc.y*.95,sc.z*.85)}
  rn.setRenderTarget(R3.rt);rn.setClearColor(0x000000,1);rn.clear();
  rn.render(R3.S1,R3.cam);rn.render(R3.S2,R3.cam);rn.render(R3.S3,R3.cam);
  rn.setRenderTarget(R3.bloomRT);rn.render(R3.bloomScene,R3.postCam);
  rn.setRenderTarget(null);rn.render(R3.postScene,R3.postCam);
  renderUI();
}
// dynamic resolution: trade sharpness for a steady frame rate on slow GPUs
function r3Adapt(dt){
  if(navigator.webdriver||!R3.ok||document.hidden)return;
  if(dt>1/34){R3.slowN++;R3.fastN=0}else if(dt<1/55){R3.fastN++;R3.slowN=Math.max(0,R3.slowN-1)}
  if(R3.slowN>50&&R3.q>.5){R3.q=Math.max(.5,R3.q*.85);R3.slowN=0;resize()}
  else if(R3.fastN>900&&R3.q<1){R3.q=Math.min(1,R3.q/.85);R3.fastN=0;resize()}
}
// ---------------------------------------------------------------- crisp UI overlay (labels, hold rings, threat arrow)
function renderUI(){
  const u=uctx;u.setTransform(DPR,0,0,DPR,0,0);u.clearRect(0,0,innerWidth,innerHeight);
  const pc=P.c;if(!pc||gameState!=='play')return;
  const top=o=>(o._y3===undefined?groundY(o.x,o.y):o._y3)+o.r*((MODEL_H[o.key]||1.2)+.25);
  renderSkillUI(u);
  u.font="700 11px 'M PLUS Rounded 1c', sans-serif";u.textAlign='center';
  if(MATCH.kind==='coop'){u.font="700 10px 'M PLUS Rounded 1c', sans-serif";const tags=MATCH.mode==='client'?(NET.pp||[]).map(([id,nm])=>[NET.ghosts.get(id),nm]):PLAYERS.filter(p=>p!==P).map(p=>[p.c,p.name]);
    for(const [g,nm] of tags){if(!g||g===pc||!onScreen(g.x,g.y,0))continue;const [sx,sy,ok]=toS3(g.x,top(g)+3,g.y);if(!ok)continue;u.fillStyle='rgba(10,30,14,.6)';const w=u.measureText(nm).width+8;u.fillRect(sx-w/2,sy-10,w,13);u.fillStyle='#9cf59c';u.fillText(nm,sx,sy)}
    u.font="700 11px 'M PLUS Rounded 1c', sans-serif"}
  if(IN.obs){query(pc.x,pc.y,GW*.75,(o)=>{if(o===pc||o.dead||o.hiddenT>0)return;const [sx,sy,ok]=toS3(o.x,top(o)+1,o.y);if(!ok)return;
    const st=['幼','成','老'][o.stage]||'';const sex=o.key==='larva'?'':o.sex?'♀':'♂';
    const danger=canEat(o,pc),food=canEat(pc,o),tx=`${o.feral?'【野良】':''}${o.sp.name}${sex}${st}${o.rival?' ?':''}`;
    u.fillStyle=danger?'#ff6a6a':food?'#7ff08a':'#ffffff';u.lineWidth=3;u.strokeStyle='rgba(20,30,45,.85)';u.strokeText(tx,sx,sy);u.fillText(tx,sx,sy)})}
  else if(pc.stage===1&&pc.key!=='larva'){u.font="800 15px 'M PLUS Rounded 1c', sans-serif";query(pc.x,pc.y,150,o=>{if(o===pc||o.dead||o.key!==pc.key||o.sex===pc.sex||o.stage!==1||o.feral)return;const [sx,sy,ok]=toS3(o.x,top(o)+1,o.y);if(!ok)return;
      u.lineWidth=3;u.strokeStyle='rgba(60,10,40,.8)';u.strokeText(o.sex?'♀':'♂',sx,sy);u.fillStyle='#ff9ec8';u.fillText(o.sex?'♀':'♂',sx,sy)})}
  // hold progress
  const holds=[];
  if(P.holdKind&&P.holdT>0){const need={infect:.9,swallow:.55,court:2.1}[P.holdKind];holds.push([P.holdT/need,{infect:'#c88cff',swallow:'#ffcf6a',court:'#ff9ec8'}[P.holdKind]])}
  if(P.cystT>0)holds.push([P.cystT/.8,'#c88cff']);if(P.purgeT>0)holds.push([P.purgeT/.8,'#ff7070']);
  if(holds.length){const [sx,sy]=toS3(pc.x,top(pc),pc.y);holds.forEach(([t,col],i)=>{u.strokeStyle='rgba(0,0,0,.6)';u.lineWidth=6;u.beginPath();u.arc(sx,sy-18-i*24,10,0,TAU);u.stroke();
    u.strokeStyle=col;u.lineWidth=4;u.beginPath();u.arc(sx,sy-18-i*24,10,-Math.PI/2,-Math.PI/2+clamp(t,0,1)*TAU);u.stroke()})}
  // a hunter you cannot see: an arrow on the rim of the screen
  let th=P.threat;if(th&&th.x===undefined){let bd=1e9,b=null;for(const o of creatures){if(o.dead||o===pc||o.sp.name!==th.sp.name)continue;const d=Math.hypot(o.x-pc.x,o.y-pc.y);if(d<bd){bd=d;b=o}}th=b}
  if(th&&th.x!==undefined&&!th.dead){const [sx,sy,ok]=toS3(th.x,top(th),th.y);const W=innerWidth,H=innerHeight;
    if(!ok||sx<40||sx>W-40||sy<60||sy>H-60){const dx=th.x-pc.x,dy=th.y-pc.y,l=Math.hypot(dx,dy)||1,f=(dx*CAM3.fx+dy*CAM3.fy)/l,r=(-dx*CAM3.fy+dy*CAM3.fx)/l,an=Math.atan2(r,f);
      const R=Math.min(W,H)*.36,ax=W/2+Math.sin(an)*R*Math.min(1.6,W/H),ay=H/2-Math.cos(an)*R,pu=.6+.4*Math.sin(worldT*10);
      u.save();u.translate(ax,ay);u.rotate(an);u.globalAlpha=pu;u.fillStyle='#ff4040';u.strokeStyle='#40060a';u.lineWidth=3;u.beginPath();u.moveTo(0,-20);u.lineTo(14,6);u.lineTo(0,0);u.lineTo(-14,6);u.closePath();u.stroke();u.fill();u.restore();
      u.globalAlpha=1;u.font="800 11px 'M PLUS Rounded 1c', sans-serif";u.lineWidth=3;u.strokeStyle='rgba(50,5,10,.9)';const tx=`${th.sp.name} ${Math.round(l/10)}m`;u.strokeText(tx,ax,ay+26);u.fillStyle='#ffd0d0';u.fillText(tx,ax,ay+26)}
    else{const pu=.5+.5*Math.sin(worldT*10);u.globalAlpha=.5+.5*pu;u.fillStyle='#ff4040';u.strokeStyle='#40060a';u.lineWidth=3;u.font="900 20px 'M PLUS Rounded 1c', sans-serif";u.strokeText('!',sx,sy-6);u.fillText('!',sx,sy-6);u.globalAlpha=1}}
}

// ================================================================
//  AUDIO (synthesised)
// ================================================================
const AU={ctx:null};
function auInit(){if(AU.ctx){if(AU.ctx.state==='suspended')AU.ctx.resume();return}try{const C=window.AudioContext||window.webkitAudioContext;const ctx=new C();AU.ctx=ctx;AU.master=ctx.createGain();AU.master.gain.value=.55;AU.master.connect(ctx.destination);
  const len=ctx.sampleRate*2,buf=ctx.createBuffer(1,len,ctx.sampleRate),d=buf.getChannelData(0);let last=0;for(let i=0;i<len;i++){const w=Math.random()*2-1;last=(last+.02*w)/1.02;d[i]=last*3.5}
  AU.noise=buf;const src=ctx.createBufferSource();src.buffer=buf;src.loop=true;const lp=ctx.createBiquadFilter();lp.type='lowpass';lp.frequency.value=500;AU.wind=ctx.createGain();AU.wind.gain.value=.12;src.connect(lp);lp.connect(AU.wind);AU.wind.connect(AU.master);src.start();AU.windLP=lp;
  const wb=ctx.createBuffer(1,ctx.sampleRate*.5,ctx.sampleRate),wd=wb.getChannelData(0);for(let i=0;i<wd.length;i++)wd[i]=Math.random()*2-1;AU.white=wb;
 musInit();
 }catch(e){AU.ctx=null}}
function env(g,t,a,d,v){g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(v,t+a);g.gain.exponentialRampToValueAtTime(.0001,t+a+d)}
function tone(type,f0,f1,dur,v,t0){const c=AU.ctx,t=c.currentTime+(t0||0),o=c.createOscillator(),g=c.createGain();o.type=type;o.frequency.setValueAtTime(f0,t);o.frequency.exponentialRampToValueAtTime(Math.max(20,f1),t+dur);env(g,t,.005,dur,v);o.connect(g);g.connect(AU.master);o.start(t);o.stop(t+dur+.05)}
function nz(dur,f,q,v,t0,type){const c=AU.ctx,t=c.currentTime+(t0||0),s=c.createBufferSource();s.buffer=AU.white;const bp=c.createBiquadFilter();bp.type=type||'bandpass';bp.frequency.value=f;bp.Q.value=q;const g=c.createGain();env(g,t,.003,dur,v);s.connect(bp);bp.connect(g);g.connect(AU.master);s.start(t);s.stop(t+dur+.05)}
function sfx(n,o){if(!AU.ctx||AU.ctx.state!=='running')return;const v=(o&&o.v!==undefined)?o.v:1;if(v<=.02)return;
  switch(n){
    case'heart':tone('sine',70,40,.13,.55*v);tone('sine',62,36,.12,.38*v,.17);break;
    case'bite':nz(.07,1800,1.2,.35*v);tone('square',220,90,.05,.05*v);break;
    case'snap':nz(.05,2600,2,.18);break;
    case'hurt':tone('sawtooth',180,60,.18,.12);nz(.1,900,1,.2);break;
    case'eat':for(let i=0;i<3;i++)nz(.05,1200+i*300,1.5,.25,i*.08);break;
    case'gulp':tone('sine',300,80,.25,.25);nz(.1,600,1,.2,.05);break;
    case'nibble':nz(.04,2200,2,.15);break;
    case'transfer':tone('sine',180,900,.6,.25);tone('triangle',90,600,.7,.2,.05);nz(.5,3000,.7,.08);break;
    case'birth':tone('sine',500,1000,.3,.15);tone('sine',750,1500,.3,.12,.12);break;
    case'eject':tone('sawtooth',400,60,.4,.12);nz(.3,700,.8,.2);break;
    case'crit':tone('triangle',440,880,.25,.15);tone('triangle',660,1320,.3,.12,.1);break;
    case'roar':tone('sawtooth',90,40,1,.4*v);tone('sawtooth',130,55,.9,.25*v);nz(.9,300,.6,.4*v);break;
    case'mist':nz(.6,4000,.5,.18*v,0,'highpass');break;
    case'dig':nz(.3,500,1,.25*v);break;
    case'zap':tone('square',1200,300,.18,.12*v);nz(.25,5000,.6,.25*v,0,'highpass');break;
    case'splash':nz(.12,1400,.8,.08*v);break;
    case'mush':tone('sine',800,1600,.25,.12);tone('sine',1200,2400,.3,.08,.08);break;
    case'ui':tone('square',660,660,.04,.05);break;
    case'deny':tone('square',160,120,.08,.06);break;
    case'chirp':tone('sine',4200+rnd(600),4000,.04,.03*v);tone('sine',4200+rnd(600),4000,.04,.03*v,.07);break;
  }}
function audioTick(dt){if(!AU.ctx)return;const night=nightAmt();AU.wind.gain.value=.08+.06*Math.sin(worldT*.3)+(P.c&&isFlying(P.c)?.1:0);
  if(night>.5&&Math.random()<dt*2.5*night)sfx('chirp',{v:night});musTick()}

// ================================================================
//  ADAPTIVE BGM — original theme "Little Echo March", fully synthesised
//  One 16-bar song; arrangement, mode (major/minor), tempo and instruments
//  follow the player's state and species. Changes land on bar/half-bar lines.
// ================================================================
const MUS={on:true,lvl:2,ctx:null,step:0,nextT:0,tempo:118,st:null,want:null,buses:{},duckUntil:0,lastGen:0,lastTier:-1,lastKey:''};
const MUS_LV=[0,.22,.42,.66],MUS_LVN=['切','小','中','大'];
// ---- score -------------------------------------------------------
// chords per bar (two per bar where a pair is given)
const CHORDS=[['C'],['G'],['Am'],['F'],['C'],['G'],['F','G'],['C'],
              ['F'],['G'],['Em'],['Am'],['Dm'],['G'],['C/E','F'],['G']];
const CHD={C:[0,4,7],G:[7,11,2],Am:[9,0,4],F:[5,9,0],Em:[4,7,11],Dm:[2,5,9],'C/E':[4,7,0]};
const CROOT={C:0,G:7,Am:9,F:5,Em:4,Dm:2,'C/E':4};
// melody: 8 eighth-notes per bar ('-' holds, '.' rests)
const MEL=[
 'G4 . C5 E5 G5 - E5 C5','D5 - B4 G4 D5 - . .','C5 . E5 A5 G5 - E5 C5','F5 E5 D5 C5 A4 - . .',
 'G4 . C5 E5 G5 - C6 -','B5 A5 G5 F5 D5 - . G4','A4 C5 F5 A5 G5 F5 D5 B4','C5 - - - . . G4 .',
 'A5 - G5 F5 C5 - F5 -','G5 - F5 E5 D5 - B4 -','E5 G5 B5 - A5 G5 E5 -','A5 - G5 - E5 C5 A4 -',
 'F5 - E5 D5 A4 - D5 F5','G5 - A5 - B5 - D6 -','C6 - G5 E5 F5 - A5 C6','D6 - B5 - G5 - . .'].map(b=>b.split(' '));
const NN={C:0,D:2,E:4,F:5,G:7,A:9,B:11};
const midiOf=s=>12*(+s[s.length-1]+1)+NN[s[0]]+(s[1]==='#'?1:s[1]==='b'?-1:0);
const mf=m=>440*Math.pow(2,(m-69)/12);
// parallel-minor mapping (keeps the tune recognisable when danger hits)
function mapMode(m,minor,root){if(!minor)return m;const pc=((m%12)+12)%12;if(pc===4||pc===9)return m-1;if(pc===11&&root!==7)return m-1;return m}
// ---- arrangements per species family -------------------------------
const ARR={
 title:{lead:'flute',comp:'marimba',bass:'pluck',kit:'full',tempo:1,vol:.8,oct:0,swing:.08,bells:1,pad:0,name:'メインテーマ'},
 larva:{lead:'pizz',comp:'pizz',bass:'sub',vol:1.7,kit:'tiny',tempo:.96,oct:12,swing:.15,extra:'bubbles',name:'ちいさな幼生'},
 bug:{lead:'marimba',comp:'marimba',bass:'pluck',kit:'shaker',tempo:1,oct:0,swing:.14,name:'草むらマーチ'},
 mouse:{lead:'xylo',comp:'pluck',bass:'pluck',kit:'light',tempo:1.08,oct:12,swing:.2,name:'すばしっこギャロップ'},
 frog:{lead:'boing',comp:'pluck',bass:'boing',kit:'light',tempo:1,oct:0,swing:.22,extra:'croak',name:'沼のぴょんぴょん'},
 water:{lead:'aqua',comp:'pluck',bass:'sub',kit:'soft',tempo:.94,oct:0,swing:.24,extra:'bubbles',echo:1,pad:1,name:'みなものワルツ'},
 crayfish:{vol:1.3,lead:'xylo',comp:'pluck',bass:'pluck',kit:'shaker',tempo:1.02,oct:0,swing:.18,extra:'clicks',name:'川底のカチカチ'},
 viper:{lead:'reed',comp:'pluck',bass:'pluck',kit:'tabla',tempo:1,oct:0,swing:.1,orn:1,name:'くねくね蛇使い'},
 fox:{lead:'flute',comp:'pluck',bass:'pluck',kit:'full',tempo:1.1,oct:12,swing:.06,name:'野原の疾走'},
 eel:{lead:'chip',comp:'arp',bass:'synth',kit:'electro',tempo:1.06,oct:0,swing:0,extra:'zap',echo:1,name:'ビリビリ水路'},
 hawk:{lead:'flute',comp:'pad',bass:'sub',kit:'soft',tempo:1,oct:12,swing:0,legato:1,pad:1,bells:1,name:'大空のアリア'},
 shark:{lead:'aqua',comp:'pluck',bass:'deep',kit:'toms',tempo:.92,oct:-12,swing:.12,echo:1,pad:1,name:'深海パレード'},
 bear:{lead:'brass',comp:'brass',bass:'tuba',kit:'big',tempo:.9,oct:-12,swing:0,name:'森の王さま'},
};
const SPARR={larva:'larva',beetle:'bug',snail:'bug',mouse:'mouse',frog:'frog',minnow:'water',leech:'water',catfish:'water',crayfish:'crayfish',viper:'viper',fox:'fox',eel:'eel',hawk:'hawk',shark:'shark',bear:'bear'};
const MODE_NAME={calm:'',chase:'追跡',crit:'臨界',old:'老衰',dry:'乾燥',night:'夜'};

// ---- engine setup --------------------------------------------------
function musInit(){
  if(MUS.ctx||!AU.ctx)return;const c=AU.ctx;MUS.ctx=c;
  try{MUS.lvl=+(localStorage.getItem('pe_bgm')??2)}catch(e){}
  MUS.out=c.createGain();MUS.out.gain.value=MUS_LV[MUS.lvl];
  MUS.lp=c.createBiquadFilter();MUS.lp.type='lowpass';MUS.lp.frequency.value=18000;MUS.lp.Q.value=.5;
  MUS.duck=c.createGain();MUS.duck.gain.value=1;
  const comp=c.createDynamicsCompressor();comp.threshold.value=-20;comp.ratio.value=4;comp.knee.value=8;comp.attack.value=.01;comp.release.value=.2;
  MUS.mix=c.createGain();MUS.mix.gain.value=.4;MUS.mix.connect(MUS.duck);MUS.duck.connect(MUS.lp);MUS.lp.connect(comp);comp.connect(MUS.out);MUS.out.connect(c.destination);
  // reverb (procedural impulse) + echo sends
  const len=c.sampleRate*1.8,ir=c.createBuffer(2,len,c.sampleRate);for(let ch=0;ch<2;ch++){const d=ir.getChannelData(ch);for(let i=0;i<len;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/len,2.6)}
  MUS.rev=c.createConvolver();MUS.rev.buffer=ir;MUS.revG=c.createGain();MUS.revG.gain.value=.22;MUS.rev.connect(MUS.revG);MUS.revG.connect(MUS.mix);
  MUS.dly=c.createDelay(1);MUS.dly.delayTime.value=.3;const fb=c.createGain();fb.gain.value=.34;const dl=c.createBiquadFilter();dl.type='lowpass';dl.frequency.value=2600;
  MUS.dly.connect(dl);dl.connect(fb);fb.connect(MUS.dly);MUS.dlyG=c.createGain();MUS.dlyG.gain.value=.0;dl.connect(MUS.dlyG);MUS.dlyG.connect(MUS.mix);
  const nlen=c.sampleRate*2,nb=c.createBuffer(1,nlen,c.sampleRate),nd=nb.getChannelData(0);for(let i=0;i<nlen;i++)nd[i]=Math.random()*2-1;MUS.noise=nb;
  for(const n of['lead','comp','bass','drum','bell','danger','pad','fx','jingle']){const g=c.createGain();g.gain.value=1;g.connect(MUS.mix);const s=c.createGain();s.gain.value=.25;g.connect(s);s.connect(MUS.rev);MUS.buses[n]=g}
  MUS.buses.jingle.disconnect();MUS.buses.jingle.gain.value=.4;MUS.buses.jingle.connect(MUS.out);MUS.buses.jingle.connect(MUS.rev);
  MUS.st=musTarget();MUS.nextT=c.currentTime+.1;MUS.step=0;updateBgmButtons();
}
function setBgmLevel(l){MUS.lvl=(l+4)%4;try{localStorage.setItem('pe_bgm',MUS.lvl)}catch(e){}if(MUS.out)MUS.out.gain.setTargetAtTime(MUS_LV[MUS.lvl],MUS.ctx.currentTime,.1);updateBgmButtons()}
function updateBgmButtons(){document.querySelectorAll('.bgmBtn').forEach(b=>b.textContent=`♪ BGM：${MUS_LVN[MUS.lvl]}`)}
// ---- synth voices -------------------------------------------------
function vg(t,a,d,s,dur,r,v,bus){const c=MUS.ctx,g=c.createGain();g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(v,t+a);g.gain.setTargetAtTime(v*s,t+a,Math.max(.005,d/3));g.gain.setTargetAtTime(0,t+Math.max(a,dur),Math.max(.01,r/3));g.connect(bus);return g}
function vo(type,f,t,end,dest,det){const o=MUS.ctx.createOscillator();o.type=type;o.frequency.setValueAtTime(f,t);if(det)o.detune.value=det;o.connect(dest);o.start(t);o.stop(end);return o}
function vib(o,t,end,rate,depth){const c=MUS.ctx,l=c.createOscillator(),g=c.createGain();l.frequency.value=rate;g.gain.value=depth;l.connect(g);g.connect(o.frequency);l.start(t);l.stop(end)}
function lpf(f,q,dest){const b=MUS.ctx.createBiquadFilter();b.type='lowpass';b.frequency.value=f;b.Q.value=q||.7;b.connect(dest);return b}
const INS={
  marimba(t,f,dur,v,bus){const g=vg(t,.003,.35,0,.05,.45,v,bus);vo('sine',f,t,t+.9,g);const g2=vg(t,.002,.08,0,.02,.1,v*.35,bus);vo('sine',f*4,t,t+.25,g2)},
  xylo(t,f,dur,v,bus){const g=vg(t,.002,.2,0,.03,.25,v*.9,bus);vo('triangle',f,t,t+.5,g);const g2=vg(t,.001,.05,0,.01,.06,v*.4,bus);vo('sine',f*3,t,t+.15,g2)},
  pluck(t,f,dur,v,bus){const g=vg(t,.002,.3,.0,.05,.3,v*.8,bus);const lp=lpf(f*5,1.2,g);lp.frequency.setValueAtTime(f*6,t);lp.frequency.exponentialRampToValueAtTime(f*1.4,t+.25);vo('sawtooth',f,t,t+.7,lp)},
  pizz(t,f,dur,v,bus){const g=vg(t,.002,.14,0,.02,.16,v,bus);vo('triangle',f,t,t+.35,g);const g2=vg(t,.001,.03,0,.01,.04,v*.25,bus);vo('square',f*2,t,t+.08,lpf(f*4,1,g2))},
  flute(t,f,dur,v,bus){const d=Math.max(dur,.12);const g=vg(t,.045,.2,.78,d,.12,v*.85,bus);const o=vo('sine',f,t,t+d+.4,g);vib(o,t+.12,t+d+.4,5.4,f*.006);
    const n=MUS.ctx.createBufferSource();n.buffer=MUS.noise;const bp=MUS.ctx.createBiquadFilter();bp.type='bandpass';bp.frequency.value=f*2;bp.Q.value=3;const ng=vg(t,.02,.1,.25,d,.1,v*.12,bus);n.connect(bp);bp.connect(ng);n.start(t,Math.random());n.stop(t+d+.3)},
  brass(t,f,dur,v,bus){const d=Math.max(dur,.1);const g=vg(t,.03,.15,.75,d,.12,v*.7,bus);const lp=lpf(f*1.5,2,g);lp.frequency.setValueAtTime(f*1.2,t);lp.frequency.exponentialRampToValueAtTime(f*6,t+.05);lp.frequency.exponentialRampToValueAtTime(f*3,t+.25);
    vo('sawtooth',f,t,t+d+.3,lp);vo('sawtooth',f,t,t+d+.3,lp,8)},
  aqua(t,f,dur,v,bus){const d=Math.max(dur,.15);const g=vg(t,.02,.25,.6,d,.25,v*.8,bus);const o=vo('sine',f,t,t+d+.5,g);vib(o,t,t+d+.5,4.2,f*.012);const g2=vg(t,.02,.2,.3,d,.2,v*.18,bus);vo('triangle',f*2,t,t+d+.5,g2);
    if(MUS.dly){const s=MUS.ctx.createGain();s.gain.value=.5;g.connect(s);s.connect(MUS.dly)}},
  reed(t,f,dur,v,bus){const d=Math.max(dur,.1);const g=vg(t,.02,.12,.7,d,.1,v*.6,bus);const bp=MUS.ctx.createBiquadFilter();bp.type='bandpass';bp.frequency.value=f*2.4;bp.Q.value=1.6;bp.connect(g);const o=vo('sawtooth',f,t,t+d+.3,bp);vib(o,t+.08,t+d+.3,6.2,f*.01)},
  chip(t,f,dur,v,bus){const d=Math.min(Math.max(dur,.08),.5);const g=vg(t,.003,.08,.5,d,.06,v*.42,bus);vo('square',f,t,t+d+.2,lpf(f*7,1,g));if(MUS.dly){const s=MUS.ctx.createGain();s.gain.value=.4;g.connect(s);s.connect(MUS.dly)}},
  boing(t,f,dur,v,bus){const g=vg(t,.003,.22,0,.04,.25,v,bus);const o=vo('sine',f*.72,t,t+.5,g);o.frequency.exponentialRampToValueAtTime(f,t+.06);const g2=vg(t,.002,.06,0,.02,.08,v*.25,bus);vo('square',f,t,t+.15,lpf(f*3,1,g2))},
  musicbox(t,f,dur,v,bus){const g=vg(t,.002,.9,0,.04,1.2,v*.7,bus);const o=vo('sine',f,t,t+1.6,g);o.detune.setValueAtTime(-8+Math.random()*16,t);const g2=vg(t,.001,.3,0,.02,.4,v*.22,bus);vo('sine',f*2.003,t,t+.8,g2);const g3=vg(t,.001,.1,0,.01,.12,v*.08,bus);vo('sine',f*5.4,t,t+.3,g3)},
  bell(t,f,dur,v,bus){const g=vg(t,.002,1.2,0,.04,1.6,v*.5,bus);vo('sine',f,t,t+2,g);const g2=vg(t,.001,.4,0,.02,.5,v*.18,bus);vo('sine',f*2.76,t,t+1,g2);const g3=vg(t,.001,.15,0,.01,.2,v*.08,bus);vo('sine',f*5.4,t,t+.5,g3)},
  pad(t,f,dur,v,bus){const g=vg(t,.35,.5,.8,dur,.6,v*.32,bus);const lp=lpf(1400,.6,g);vo('sawtooth',f,t,t+dur+1,lp,-7);vo('sawtooth',f,t,t+dur+1,lp,7)},
  strings(t,f,dur,v,bus){const g=vg(t,.005,.08,0,.03,.08,v*.55,bus);vo('sawtooth',f,t,t+.25,lpf(1500,1.5,g))},
  // basses
  b_pluck(t,f,dur,v,bus){const g=vg(t,.003,.28,.15,dur,.12,v,bus);vo('triangle',f,t,t+dur+.3,g);vo('sine',f/2,t,t+dur+.3,g)},
  b_sub(t,f,dur,v,bus){const g=vg(t,.02,.3,.7,dur,.15,v*.9,bus);vo('sine',f,t,t+dur+.3,g)},
  b_tuba(t,f,dur,v,bus){const g=vg(t,.03,.2,.6,dur,.1,v,bus);vo('sawtooth',f,t,t+dur+.3,lpf(f*3,1.4,g))},
  b_synth(t,f,dur,v,bus){const g=vg(t,.003,.15,.4,dur,.06,v*.8,bus);const lp=lpf(f*5,4,g);lp.frequency.setValueAtTime(f*7,t);lp.frequency.exponentialRampToValueAtTime(f*1.6,t+.15);vo('square',f,t,t+dur+.2,lp)},
  b_boing(t,f,dur,v,bus){const g=vg(t,.003,.25,.1,dur,.1,v,bus);const o=vo('sine',f*1.5,t,t+dur+.3,g);o.frequency.exponentialRampToValueAtTime(f,t+.07)},
  b_deep(t,f,dur,v,bus){const g=vg(t,.01,.3,.5,dur,.15,v,bus);vo('sawtooth',f,t,t+dur+.3,lpf(260,2,g));vo('sine',f,t,t+dur+.3,g)},
};
// ---- drums ---------------------------------------------------------
function noiseHit(t,type,f,q,dec,v,bus,dur){const c=MUS.ctx,n=c.createBufferSource();n.buffer=MUS.noise;const fl=c.createBiquadFilter();fl.type=type;fl.frequency.value=f;fl.Q.value=q;const g=c.createGain();g.gain.setValueAtTime(v,t);g.gain.exponentialRampToValueAtTime(.0005,t+dec);n.connect(fl);fl.connect(g);g.connect(bus);n.start(t,Math.random()*Math.max(.05,1.9-dec));n.stop(t+dec+.05)}
const DR={
  kick(t,v,b){const c=MUS.ctx,o=c.createOscillator(),g=c.createGain();o.frequency.setValueAtTime(150,t);o.frequency.exponentialRampToValueAtTime(42,t+.12);g.gain.setValueAtTime(v,t);g.gain.exponentialRampToValueAtTime(.001,t+.35);o.connect(g);g.connect(b);o.start(t);o.stop(t+.4)},
  snare(t,v,b){noiseHit(t,'bandpass',1900,.7,.16,v*.55,b);const g=vg(t,.001,.06,0,.01,.06,v*.35,b);vo('triangle',190,t,t+.12,g)},
  clap(t,v,b){for(let i=0;i<3;i++)noiseHit(t+i*.011,'bandpass',1500,1,.08,v*.35,b)},
  hat(t,v,b){noiseHit(t,'highpass',7500,.5,.045,v*.28,b)},
  ohat(t,v,b){noiseHit(t,'highpass',7000,.5,.22,v*.22,b)},
  shaker(t,v,b){noiseHit(t,'bandpass',6200,1.2,.06,v*.2,b)},
  rim(t,v,b){const g=vg(t,.001,.03,0,.01,.03,v*.4,b);vo('square',820,t,t+.06,lpf(3000,1,g))},
  wood(t,v,b){const g=vg(t,.001,.05,0,.01,.05,v*.45,b);vo('sine',1050,t,t+.1,g);vo('sine',1580,t,t+.06,g)},
  tom(t,v,b,p){const c=MUS.ctx,o=c.createOscillator(),g=c.createGain();o.frequency.setValueAtTime(p||140,t);o.frequency.exponentialRampToValueAtTime((p||140)*.6,t+.25);g.gain.setValueAtTime(v*.7,t);g.gain.exponentialRampToValueAtTime(.001,t+.3);o.connect(g);g.connect(b);o.start(t);o.stop(t+.35)},
  timp(t,v,b){const c=MUS.ctx,o=c.createOscillator(),g=c.createGain();o.frequency.setValueAtTime(82,t);o.frequency.exponentialRampToValueAtTime(70,t+.6);g.gain.setValueAtTime(v*.8,t);g.gain.exponentialRampToValueAtTime(.001,t+1);o.connect(g);g.connect(b);o.start(t);o.stop(t+1.1);noiseHit(t,'lowpass',400,.5,.15,v*.3,b)},
  crash(t,v,b){noiseHit(t,'highpass',4200,.4,1.3,v*.3,b)},
};
const KITS={ // step lists per 16th
  full:{kick:[0,7,8],snare:[4,12],hat:[0,2,4,6,8,10,12],ohat:[14]},
  light:{kick:[0,8],snare:[4,12],hat:[2,6,10,14]},
  shaker:{kick:[0,10],clap:[4,12],shaker:[1,3,5,7,9,11,13,15]},
  soft:{kick:[0],rim:[12],shaker:[2,6,10,14]},
  electro:{kick:[0,4,8,12],clap:[4,12],hat:[2,6,10,14],shaker:[1,3,5,7,9,11,13,15]},
  big:{kick:[0,8],snare:[12],timp:[0],tom:[10,14]},
  tiny:{wood:[0,6,10],shaker:[3,7,11,15]},
  tabla:{tom:[0,3,6,10,12],shaker:[2,5,8,11,14],kick:[0]},
  toms:{tom:[0,6,10],kick:[0,8],shaker:[4,12]},
  chase:{kick:[0,4,8,12],snare:[4,12],hat:[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15]},
  crit:{kick:[0,4,8,12],snare:[4,12],hat:[2,6,10,14],ohat:[14]},
  old:{kick:[0]},
  hurt:{kick:[0,8]},
};
// ---- state → target arrangement ------------------------------------
function musTarget(){
  const t={arr:'title',mode:'calm',night:false,hurt:false,adr:0,minor:false,lp:18000};
  if(gameState!=='play'||!P.c){if(gameState==='play'&&P.respawnT>0){t.arr='larva';t.mode='dry';t.minor=true}return t}
  const c=P.c;t.arr=SPARR[c.key]||'bug';
  const hp=c.maxhp?c.hp/c.maxhp:1;t.night=nightAmt()>.6;t.hurt=hp<.35;t.adr=P.adr/100;
  if(c.key==='larva'){t.mode=P.dry>DRY*.66?'dry':'calm';t.minor=t.mode==='dry'}
  else if(c.stage===2)t.mode='old';
  if((P.threat||MUS.thrT>0)&&!P.hint.big&&P.adr>=100&&!(P.acc>0)){t.mode='crit';t.minor=false}
  else if(P.threat||MUS.thrT>0||P.critT>0&&P.adr>60){t.mode=t.mode==='old'?'old':'chase';t.minor=true}
  t.lp=t.hurt?900:IN.obs?2600:P.toxin>.2?1600:18000;
  return t;
}
function musTempo(){const st=MUS.st,a=ARR[st.arr]||ARR.bug;let m={calm:1,chase:1.16,crit:1.22,old:.84,dry:1.05}[st.mode]||1;if(st.night&&st.mode==='calm')m*=.94;if(st.hurt)m*=.94;return 118*a.tempo*m}
function busLevels(){const st=MUS.st,a=ARR[st.arr]||ARR.bug,B=MUS.buses,c=MUS.ctx,t=c.currentTime;
  const lv={lead:1,comp:.9,bass:1,drum:1,bell:.8,danger:0,pad:a.pad?1:0,fx:1};
  if(st.mode==='chase'){lv.danger=.55+.45*st.adr;lv.bell=.3}
  if(st.mode==='crit'){lv.danger=.7;lv.drum=1.15}
  if(st.mode==='old'){lv.drum=.4;lv.bass=.6;lv.comp=.7}
  if(st.night&&st.mode==='calm'){lv.drum=.55;lv.pad=1;lv.bell=1}
  if(st.hurt){lv.drum=.6;lv.comp=.6}
  for(const k in lv)B[k].gain.setTargetAtTime(lv[k],t,.25);
  MUS.lp.frequency.setTargetAtTime(st.lp,t,.3);MUS.mix.gain.setTargetAtTime(.4*(a.vol||1)*(st.mode==='old'?1.6:1),t,.4);
  MUS.dlyG.gain.setTargetAtTime(a.echo?.5:.12,t,.3);MUS.revG.gain.setTargetAtTime(st.night||st.mode==='old'?.38:.22,t,.4);
}
// ---- the sequencer --------------------------------------------------
function chordAt(bar,st){const cs=CHORDS[bar];return cs.length>1&&st>=8?cs[1]:cs[0]}
function schedStep(s,t,sd){
  const bar=Math.floor(s/16)%16,st=s%16;
  if(st===0||st===8){const w=musTarget();const changed=w.arr!==MUS.st.arr||w.mode!==MUS.st.mode||w.night!==MUS.st.night||w.hurt!==MUS.st.hurt;MUS.st=w;if(changed||st===0)busLevels();}
  const S=MUS.st,A=ARR[S.arr]||ARR.bug,B=MUS.buses,minor=S.minor;
  const ch=chordAt(bar,st),root=CROOT[ch],pcs=CHD[ch];
  const sw=(st%4===2)?A.swing*sd*2:0,tt=t+sw;
  const mode=S.mode,crit=mode==='crit',old=mode==='old',chase=mode==='chase',larva=S.arr==='larva',dry=mode==='dry';
  // ---------- melody
  if(st%2===0){const tok=MEL[bar][st/2];
    if(tok!=='-'&&tok!=='.'&&!(larva&&!dry&&st%4!==0&&Math.random()<.5)){
      let n=1;for(let k=st/2+1;k<8&&MEL[bar][k]==='-';k++)n++;
      let m=mapMode(midiOf(tok),minor,root)+A.oct+(crit?12:0)+(old?12:0);
      const dur=(A.legato?n*2:Math.min(n*2,old?2:4))*sd;
      const lead=old?'musicbox':crit?'brass':larva?'pizz':A.lead;
      const v=(crit?1:chase?.95:old?.75:S.night?.7:.85);
      if(A.orn&&n>=2&&!old){INS[lead](tt,mf(m+2),sd*.5,v*.6,B.lead);INS[lead](tt+sd*.5,mf(m),dur-sd*.5,v,B.lead)}
      else INS[lead](tt,mf(m),dur,v,B.lead);
      if(crit&&st%8===0)INS.bell(tt,mf(m+12),dur,.5,B.bell)}}
  // ---------- comping
  const tones=pcs.map(p=>mapMode(60+p,minor,root));
  if(chase){INS.pluck(tt,mf(tones[st%3]+(st%6>2?12:0)),sd,.35,B.comp)}
  else if(crit){if([0,6,8,14].includes(st))for(const m of tones)INS.brass(tt,mf(m),sd*1.5,.32,B.comp)}
  else if(old){if(st%4===0)INS.musicbox(tt,mf(tones[(st/4)%3]+12),sd*4,.4,B.comp)}
  else if(larva){if(st===0||st===8)INS.pizz(tt,mf(tones[(st/8)%3]+12),sd,.55,B.comp)}
  else if(A.comp==='arp'){INS.chip(tt,mf(tones[st%3]+12),sd*.8,.28,B.comp)}
  else if(A.comp==='pad'){if(st===0)for(const m of tones)INS.pad(tt,mf(m),sd*15,.6,B.comp)}
  else if([2,6,10,14].includes(st)){for(const m of tones)INS[A.comp](tt,mf(m),sd,.32,B.comp)}
  // pads (night / airy / watery)
  if((A.pad||S.night)&&st===0&&!crit)for(const m of tones)INS.pad(tt,mf(m-12),sd*15.5,.5,B.pad);
  // bells: sparkle every other bar
  if(st===0&&bar%2===0&&(A.bells||S.night||S.arr==='title')&&!chase&&!crit)INS.bell(tt,mf(tones[2]+12),sd*8,.45,B.bell);
  // ---------- bass
  if(A.bass||dry){
    const pat=chase||dry?[0,null,0,null,0,null,0,null,12,null,0,null,7,null,0,null]:crit?[0,null,0,0,7,null,7,7,12,null,12,12,7,null,0,null]:old||larva?[0,null,null,null,null,null,null,null,7,null,null,null,null,null,null,null]:[0,null,null,null,7,null,0,null,0,null,null,null,7,null,12,null];
    const o=pat[st];if(o!==null&&o!==undefined){const bm=mapMode(36+root,minor,root)+o+(S.arr==='bear'||S.arr==='shark'?-12:0);
      const bi='b_'+(dry?'pluck':A.bass||'pluck');INS[bi](tt,mf(bm),sd*(chase?.9:1.6),.7,B.bass)}}
  // ---------- danger ostinato (only when hunted)
  if(chase||crit){const pat=[0,0,7,0,12,0,7,0,0,0,7,0,12,7,3,0];const dm=mapMode(48+root+pat[st],true,root);INS.strings(tt,mf(dm),sd,.5+.4*S.adr,B.danger);
    if(chase&&bar%4===3&&st>=12)DR.tom(tt,.6,B.drum,180-(st-12)*25)}
  // ---------- drums
  const kitName=crit?'crit':chase?'chase':old?'old':S.hurt?'hurt':(A.kit||'light'),kit=KITS[kitName];
  for(const k in kit){if(!kit[k].includes(st))continue;if(S.night&&mode==='calm'&&(k==='hat'||k==='ohat'))continue;
    const v=(k==='kick'?.9:k==='timp'?.8:.7)*(S.night&&mode==='calm'?.6:1);DR[k](tt,v,B.drum,k==='tom'?(st%2?120:170):undefined)}
  if(crit&&st===0&&bar%2===0)DR.crash(tt,.7,B.drum);
  if(dry&&st%2===0)DR.wood(tt,.35+.25*(st%4===0),B.drum);
  // ---------- species colour
  if(A.extra==='bubbles'&&Math.random()<.07){const c=MUS.ctx,o=c.createOscillator(),g=vg(tt,.002,.06,0,.02,.06,.18,B.fx);const f=500+Math.random()*700;o.frequency.setValueAtTime(f,tt);o.frequency.exponentialRampToValueAtTime(f*2.4,tt+.08);o.connect(g);o.start(tt);o.stop(tt+.12)}
  if(A.extra==='croak'&&st===8&&bar%2===1){const c=MUS.ctx,g=vg(tt,.005,.12,.3,.18,.06,.3,B.fx),o=vo('square',110,tt,tt+.3,lpf(700,3,g));vib(o,tt,tt+.3,28,22)}
  if(A.extra==='clicks'&&[3,7,11,15].includes(st))noiseHit(tt,'highpass',5200,2,.02,.3,B.fx);
  if(A.extra==='zap'&&st===14&&bar%2===1){const g=vg(tt,.002,.1,0,.03,.1,.22,B.fx);const o=vo('square',1800,tt,tt+.2,lpf(4000,1,g));o.frequency.exponentialRampToValueAtTime(200,tt+.15)}
}
function musTick(){
  if(!MUS.ctx||MUS.ctx.state!=='running')return;
  const c=MUS.ctx;if(MUS.nextT<c.currentTime-.25)MUS.nextT=c.currentTime+.05;
  if(MUS.lvl===0){MUS.nextT=c.currentTime+.05;return}
  // ducking for jingles
  MUS.duck.gain.setTargetAtTime(c.currentTime<MUS.duckUntil?.15:1,c.currentTime,.12);
  while(MUS.nextT<c.currentTime+.16){
    const sd=60/musTempo()/4;
    schedStep(MUS.step,MUS.nextT,sd);
    MUS.nextT+=sd;MUS.step=(MUS.step+1)%256;
  }
  // jingles for the viewed player's milestones
  MUS.thrT=P.threat?2.5:Math.max(0,(MUS.thrT||0)-(c.currentTime-(MUS.lastTick||c.currentTime)));MUS.lastTick=c.currentTime;
  if(gameState==='play'&&P.c){const tier=P.c.sp.tier;
    if(P.gen!==MUS.lastGen&&MUS.lastGen){jingle(tier>MUS.lastTier?'up':tier===MUS.lastTier?'birth':'down')}
    MUS.lastGen=P.gen;MUS.lastTier=tier}
  else if(gameState!=='play'){MUS.lastGen=0;MUS.lastTier=-1}
}
// ---- jingles ---------------------------------------------------------
const JING={
  up:{tempo:150,notes:[['bell',67,0,.5],['bell',72,.5,.5],['bell',76,1,.5],['bell',79,1.5,1.5],['brass',72,1.5,1.5],['brass',76,1.5,1.5],['brass',79,1.5,1.5]]},
  birth:{tempo:140,notes:[['musicbox',84,0,.5],['musicbox',88,.5,.5],['musicbox',91,1,.5],['musicbox',96,1.5,2],['bell',79,1.5,2]]},
  down:{tempo:130,notes:[['pizz',72,0,.5],['pizz',67,.5,.5],['pizz',64,1,1]]},
  win:{tempo:132,notes:[['brass',60,0,.5],['brass',64,.5,.5],['brass',67,1,.5],['brass',72,1.5,.5],['brass',67,2,.5],['brass',72,2.5,2.5],['brass',76,2.5,2.5],['brass',79,2.5,2.5],['bell',84,2.5,3],['flute',84,3,2]],crash:2.5},
  lose:{tempo:100,notes:[['reed',67,0,1],['reed',63,1,1],['reed',60,2,2],['pad',48,2,3],['pad',55,2,3],['pad',63,2,3]]},
  gameover:{tempo:90,notes:[['musicbox',76,0,1],['musicbox',74,1,1],['musicbox',72,2,1],['musicbox',71,3,3],['pad',55,3,3]]},
  chime:{tempo:150,notes:[['bell',76,0,.5],['bell',79,.5,.5],['bell',84,1,2]]},
};
function jingle(name){
  if(!MUS.ctx||MUS.ctx.state!=='running'||MUS.lvl===0)return;const J=JING[name];if(!J)return;
  const c=MUS.ctx,t0=c.currentTime+.04,b=60/J.tempo;let end=0;
  for(const [ins,m,st,du] of J.notes){INS[ins](t0+st*b,mf(m),du*b,.8,MUS.buses.jingle);end=Math.max(end,st+du)}
  if(J.crash!==undefined)DR.crash(t0+J.crash*b,.8,MUS.buses.jingle);
  MUS.duckUntil=t0+end*b+.2;
}

// ================================================================
//  INPUT
// ================================================================
const keys={};let mouse={x:0,y:0,l:false,r:false,lP:false};
addEventListener('keydown',e=>{if(e.repeat){if(['Tab','Space'].includes(e.code))e.preventDefault();return}keys[e.code]=true;IN.mode='kb';kbEdge[e.code]=true;if(['Tab','Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();auInit()});
addEventListener('keyup',e=>{keys[e.code]=false});
const kbEdge={};
glc.addEventListener('contextmenu',e=>e.preventDefault());
addEventListener('pointerdown',()=>auInit(),true);
addEventListener('pointerdown',e=>{if(e.pointerType==='mouse'&&e.target===glc||e.pointerType==='mouse'&&e.target===document.body){if(e.button===0){mouse.l=true;mouse.lP=true}if(e.button===2)mouse.r=true;IN.mode='kb'}});
addEventListener('pointerup',e=>{if(e.pointerType==='mouse'){if(e.button===0)mouse.l=false;if(e.button===2)mouse.r=false}});
addEventListener('pointermove',e=>{if(e.pointerType==='mouse'){mouse.x=e.clientX;mouse.y=e.clientY}});
addEventListener('contextmenu',e=>e.preventDefault());
// touch
const T={stickId:null,ox:0,oy:0,x:0,y:0,a:false,aP:false,s:false,c:false,o:false,obs:false,cyst:false,purge:false,pause:false};
const stickEl=document.getElementById('stick'),knob=document.getElementById('knob');
function enableTouch(){if(IN.mode==='touch'&&document.body.classList.contains('touch'))return;document.getElementById('touch').classList.add('on');document.body.classList.add('touch');IN.mode='touch'}
addEventListener('touchstart',()=>{enableTouch();auInit()},{passive:true});
addEventListener('gamepadconnected',e=>{toast('コントローラーを検出しました',e.gamepad&&e.gamepad.id?String(e.gamepad.id).slice(0,40):'');document.getElementById('touch').classList.remove('on');document.body.classList.remove('touch');IN.mode='pad'});
function stickMove(cx,cy){let dx=cx-T.ox,dy=cy-T.oy;const l=Math.hypot(dx,dy),R=54;if(l>R){dx*=R/l;dy*=R/l}T.x=dx/R;T.y=dy/R;knob.style.transform=`translate(${dx}px,${dy}px)`}
glc.addEventListener('pointerdown',e=>{if(e.pointerType!=='touch')return;if(T.stickId===null&&e.clientX<innerWidth*.5&&e.clientY>innerHeight*.4){const r=stickEl.getBoundingClientRect();T.stickId=e.pointerId;T.ox=r.left+r.width/2;T.oy=r.top+r.height/2;stickEl.classList.add('act');stickMove(e.clientX,e.clientY)}});
addEventListener('pointermove',e=>{if(e.pointerId!==T.stickId)return;stickMove(e.clientX,e.clientY)});
const endStick=e=>{if(e.pointerId===T.stickId){T.stickId=null;T.x=T.y=0;stickEl.classList.remove('act');knob.style.transform='translate(0,0)'}};
addEventListener('pointerup',endStick);addEventListener('pointercancel',endStick);
function tbtn(id,onDown,onUp){const el=document.getElementById(id);el.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();el.classList.add('on');onDown();auInit()});
  const up=e=>{el.classList.remove('on');onUp&&onUp()};el.addEventListener('pointerup',up);el.addEventListener('pointercancel',up);el.addEventListener('pointerleave',up)}
tbtn('tbA',()=>{T.a=true;T.aP=true},()=>{T.a=false});
tbtn('tbS',()=>{T.s=true},()=>{});
tbtn('tbC',()=>{T.c=true},()=>{T.c=false});
tbtn('tbO',()=>{T.o=true},()=>{T.o=false});
tbtn('tbObs',()=>{T.obs=!T.obs;document.getElementById('tbObs').classList.toggle('on',T.obs)},()=>{document.getElementById('tbObs').classList.toggle('on',T.obs)});
tbtn('tbCyst',()=>{T.cyst=true},()=>{T.cyst=false});
tbtn('tbPurge',()=>{T.purge=true},()=>{T.purge=false});
tbtn('tbPause',()=>{T.pause=true},()=>{});
// camera: right-drag / touch-drag to orbit, wheel to zoom
glc.addEventListener('pointerdown',e=>{if(CAM3.dragId!==null)return;
  if(e.pointerType==='mouse'){if(e.button!==2&&e.button!==1)return}
  else if(e.pointerId===T.stickId)return;
  CAM3.dragId=e.pointerId;CAM3.lx=e.clientX;CAM3.ly=e.clientY});
addEventListener('pointermove',e=>{if(e.pointerId!==CAM3.dragId)return;const k=e.pointerType==='mouse'?.0055:.0075;camInput((e.clientX-CAM3.lx)*k,(e.clientY-CAM3.ly)*k*.7);CAM3.lx=e.clientX;CAM3.ly=e.clientY});
const endCam=e=>{if(e.pointerId===CAM3.dragId)CAM3.dragId=null};addEventListener('pointerup',endCam);addEventListener('pointercancel',endCam);
glc.addEventListener('wheel',e=>{e.preventDefault();CAM3.zoom=clamp(CAM3.zoom*(e.deltaY>0?1.1:.91),.55,2)},{passive:false});
// gamepad
let padPrev=[];
function pollInput(){
  let mx=0,my=0,mag=0;
  const k=c=>!!keys[c];
  const kx=(k('KeyD')?1:0)-(k('KeyA')?1:0),ky=(k('KeyS')?1:0)-(k('KeyW')?1:0);
  let atk=k('KeyJ')||k('KeyZ')||mouse.l,atkP=!!(kbEdge.KeyJ||kbEdge.KeyZ||mouse.lP),skillP=!!(kbEdge.KeyK||kbEdge.KeyX),court=k('KeyL')||k('KeyC'),od=k('Space'),cyst=k('KeyF'),purge=k('KeyG'),obs=k('KeyQ'),cycleP=!!(kbEdge.Tab||kbEdge.KeyE),pauseP=!!(kbEdge.Escape||kbEdge.KeyP),hudP=!!kbEdge.KeyH,mapP=!!kbEdge.KeyN;
  if(kbEdge.KeyM){setBgmLevel(MUS.lvl+1);toast('',`BGM音量：${MUS_LVN[MUS.lvl]}`)}
  let slotP=kbEdge.Digit1?0:kbEdge.Digit2?1:kbEdge.Digit3?2:kbEdge.Digit4?3:kbEdge.Digit0?9:-1;
  let lookX=0,lookY=0,camX=0,camY=0,camR=!!kbEdge.KeyR;
  if(kx||ky){const l=Math.hypot(kx,ky);mx=kx/l;my=ky/l;mag=k('ShiftLeft')||k('ShiftRight')?.5:1}
  // gamepad
  const pads=navigator.getGamepads?navigator.getGamepads():[];const gp=[...pads].find(p=>p&&p.connected);
  const inMenu=!!document.querySelector('.screen.on');
  if(gp){const b=i=>!inMenu&&gp.buttons[i]&&(gp.buttons[i].pressed||gp.buttons[i].value>.4),bp=i=>b(i)&&!padPrev[i];
    if(gp.buttons.some(x=>x.pressed)||Math.hypot(gp.axes[0]||0,gp.axes[1]||0)>.3){if(IN.mode==='touch'||document.body.classList.contains('touch')){document.getElementById('touch').classList.remove('on');document.body.classList.remove('touch')}IN.mode='pad'}
    const ax=gp.axes[0]||0,ay=gp.axes[1]||0,al=Math.hypot(ax,ay);
    if(al>.18&&!inMenu){const m=clamp((al-.18)/.82,0,1);mx=ax/al;my=ay/al;mag=m<.55?.5:1;if(m<.15)mag=0}
    const rx=gp.axes[2]||0,ry=gp.axes[3]||0;if(Math.hypot(rx,ry)>.2&&!inMenu){camX=rx;camY=ry;IN.mode='pad'}
    if(b(0))atk=true;if(bp(0)){atkP=true;IN.mode='pad'}if(bp(2))skillP=true;if(b(3))court=true;if(b(7))od=true;if(b(6))obs=true;if(b(13))cyst=true;if(b(12))purge=true;if(bp(4)||bp(5))cycleP=true;if(bp(9))pauseP=true;if(bp(8))mapP=true;if(bp(10))hudP=true;if(bp(11))camR=true;
    padPrev=gp.buttons.map(x=>x.pressed||x.value>.4)}
  // touch
  if(T.stickId!==null){const l=Math.hypot(T.x,T.y);if(l>.12){mx=T.x/l;my=T.y/l;mag=l<.58?.5:1}}
  if(T.a)atk=true;if(T.aP)atkP=true;if(T.s)skillP=true;if(T.c)court=true;if(T.o)od=true;if(T.obs)obs=true;if(T.cyst)cyst=true;if(T.purge)purge=true;if(T.pause)pauseP=true;
  T.aP=false;T.s=false;T.pause=false;
  const rawX=mx*mag,rawY=my*mag;mx=-CAM3.fx*rawY-CAM3.fy*rawX;my=-CAM3.fy*rawY+CAM3.fx*rawX;
  if(camR&&P.c){CAM3.yaw=P.c.ang;CAM3.manT=9}
  Object.assign(IN,{rawX,rawY,camX,camY,mx,my,mag,atk,atkP,skillP,court,od,cyst,purge,obs,lookX,lookY,cycleP,pauseP,hudP,slotP,mapP});
  for(const kk in kbEdge)delete kbEdge[kk];mouse.lP=false;
}

// ================================================================
//  HUD (HTML)
// ================================================================
const $=id=>document.getElementById(id);
let toastT=0,lastObj='',lastHint='',hudOn=false;
function toast(t,s){const el=$('toast');el.innerHTML=(t?`<div>${t}</div>`:'')+(s?`<small>${s}</small>`:'');el.style.opacity=1;toastT=3.2}
function logEco(t,cls){const el=$('log');const d=document.createElement('div');d.textContent=t;if(cls==='feral')d.style.color='#ff9a8a';el.prepend(d);while(el.children.length>4)el.lastChild.remove();setTimeout(()=>{d.style.opacity=0},7000);setTimeout(()=>d.remove(),8400)}
function show(id,on){$(id).classList.toggle('on',on)}
const BTN={kb:{atk:'J',skill:'K',court:'L',od:'Space',cyst:'F長押し',purge:'G長押し',obs:'Q'},pad:{atk:'A',skill:'X',court:'Y',od:'R2',cyst:'↓長押し',purge:'↑長押し',obs:'L2'},touch:{atk:'攻撃',skill:'技',court:'求愛',od:'OD',cyst:'シスト',purge:'パージ',obs:'観察'}};
function renderSlots(){
  const box=$('slots');const c=P.c;if(!c||gameState!=='play'){box.innerHTML='';return}
  const acts=activeTraits(c);const sel=acts[P.sel];
  let h='';const inn=c.sp.trait;
  if(inn)h+=slotHtml(inn,true,sel===inn,-1);
  for(let i=0;i<3;i++){const t=P.slots[i];h+=t?slotHtml(t,false,sel===t,i):`<div class="slot empty"><small>空</small></div>`}
  box.innerHTML=h;
  box.querySelectorAll('.slot[data-k]').forEach(el=>el.onclick=()=>{const k=el.dataset.k;const a=activeTraits(P.c);if(a.includes(k)){P.sel=a.indexOf(k);renderSlots();sfx('ui')}});
}
function slotHtml(t,innate,sel,i){const T_=TRAITS[t];return `<div class="slot ${innate?'innate':''} ${sel?'sel':''}" data-k="${t}" title="${T_.name}: ${T_.desc}">${T_.g}<small>${T_.name}</small><div class="cd" data-cd="${t}" style="transform:scaleY(0)"></div></div>`}
function updateHUD(dt){
  if(toastT>0){toastT-=dt;if(toastT<=0)$('toast').style.opacity=0}
  renderRank.t=(renderRank.t||0)-dt;if(renderRank.t<=0){renderRank.t=.4;renderRank()}
  const c=P.c;if(gameState==='play'&&!c&&P.respawnT>0){const o=`<b>完全ロスト</b> — ${P.respawnT|0}秒後に新たな幼生として再出発する`;if(o!==lastObj){$('obj').innerHTML=o;lastObj=o}return}
  if(gameState!=='play'||!c){if(lastObj){$('obj').innerHTML='';$('hint').innerHTML='';lastObj='';lastHint=''}return}
  const B=BTN[IN.mode]||BTN.kb;
  // objective
  let o='';const isL=c.key==='larva';const goal=MATCH.phase==='free'?'':MATCH.kind==='coop'?`<div class="goal">協力目標：生態系の健全度 ${ECO_GOAL}% を ${ECO_HOLD}秒保つ（現在 ${ECO.h|0}%）</div>`:`<div class="goal">勝利条件：最初に第6階層《ヒグマ》の肉体を奪う</div>`;
  if(isL)o=`<b>寄生幼生</b> — 乾ききる前に <b>小さな生物</b>（虫・カタツムリ・ネズミ・カエル・メダカ・ヒル・ザリガニ）へ寄生せよ<div class="sub">近づいて［${B.atk}］長押し</div>`;
  else if(c.key==='shark')o=`<b>サメ</b>（海の頂点）— ここから上には誰も来ない。<b>陸の頂点ヒグマ</b>を目指すなら［${B.purge}］でパージし、幼生で岸へ泳げ<div class="sub">海辺の小さな生物に寄生し直すのが近道</div>`;
  else if(c.sp.tier>=6)o=`<b>${c.sp.name}</b>（頂点）— 寿命が尽きる前に<b>異性と交配し</b>、血脈を繋げ<div class="sub">成熟期に同種の異性へ［${B.court}］長押し</div>`;
  else{const up=SPKEYS.map(k=>SP[k]).filter(s=>s.diet.includes(c.sp.tier)&&s.tier<=Math.max(c.sp.tier+1,2)).map(s=>s.name);
    o=`<b>${c.sp.name}</b>${c.sex?'♀':'♂'}・${['幼体期','成熟期','老衰期'][c.stage]} — ひとつ上の捕食者（${up.join('・')||'—'}）から<b>全力で逃げて</b>アドレナリンを溜めよ<div class="sub">臨界に達したら、わざと喰われて肉体を奪え（乗っ取れるのは1階層上まで）</div>`}
  o=goal+o;if(o!==lastObj){$('obj').innerHTML=o;lastObj=o}
  // hints
  const hs=[];
  if(isL&&P.dry>DRY*.66)hs.push(['warn','体が乾いていく… 急いで宿主を探せ']);
  if(P.holdKind==='infect')hs.push(['',`［${B.atk}］長押しで寄生中…`]);
  else if(isL&&P.hint.host)hs.push(['',`［${B.atk}］長押し：寄生`]);
  if(!isL){
    if(P.acc>0)hs.push(['',`肉体に馴染むまで あと${Math.ceil(P.acc)}秒（それまで乗っ取り不可）`]);
    if(P.threat&&P.hint.big)hs.push(['warn',`《${P.threat.sp.name}》は格上すぎて乗っ取れない — 逃げ切れ`]);
    else if(P.adr>=100&&P.threat&&!(P.acc>0))hs.push(['gold',`アドレナリン臨界 — 今、喰われれば《${P.threat.sp.name}》を乗っ取れる`]);
    else if(P.adr>=100)hs.push(['gold','アドレナリン臨界 — 捕食者に身を委ねよ']);
    else if(P.threat&&!P.hint.big){hs.push(['warn',`《${P.threat.sp.name}》が狙っている！ 逃げろ`]);if(P.idleT>.8)hs.push(['warn','棒立ちは見抜かれる']);}
    const sw=P.hint.sw;if(sw)hs.push(['',`［${B.atk}］長押し：丸呑み${sw===2?'（…何かが潜んでいる気がする）':''}`]);
    if(MATCH.kind==='coop'&&c.stage===1&&!P.hint.court&&ECO.counts&&(ECO.counts[c.key]|0)<SP[c.key].pop*.6)hs.push(['','《'+c.sp.name+'》が足りない — 成熟した異性と交配して増やそう']);
    if(P.hint.court)hs.push(['',`［${B.court}］長押し：求愛・交配`]);
    if(c.stage===2)hs.push(['warn','宿主は老衰期 — 乗り換えを急げ']);
    if(P.toxin>.2)hs.push(['warn','毒沼で寄生が剥がれかけている！']);
    if(P.inBush&&!P.cyst&&P.nutr>=20)hs.push(['',`茂みの中：［${B.cyst}］で分身シスト`]);
    if(P.hint.watch)hs.push(['warn','…何かに見られている（擬態歩きで紛れろ）']);
  }
  if(c.stun>0)hs.push(['warn','すくんで動けない！']);
  const h=hs.slice(0,3).map(([cl,t])=>`<span class="${cl}">${t}</span>`).join('');
  if(h!==lastHint){$('hint').innerHTML=h;lastHint=h}
  // cooldowns on slots
  document.querySelectorAll('#slots .cd').forEach(el=>{const k=el.dataset.cd;const cd=TRAITS[k].cd;const v=cd?clamp((P.skillCd[k]||0)/cd,0,1):0;el.style.transform=`scaleY(${v})`});
  // stats
  if(hudOn){const s=$('stats');s.style.display='block';const lr=isL?1-P.dry/DRY:1-c.age/c.life;
    s.innerHTML=`${c.sp.name} ${isL?'':(c.sex?'♀':'♂')} 世代 ${P.gen}<br>体力 ${c.hp.toFixed(0)}/${c.maxhp.toFixed(0)}<div class="bar"><i style="width:${c.hp/c.maxhp*100}%;background:#5fe08a"></i></div>アドレナリン ${P.adr|0}%<div class="bar"><i style="width:${P.adr}%;background:#ff9d3a"></i></div>${isL?'乾燥':'寿命'} ${(lr*100)|0}%<div class="bar"><i style="width:${lr*100}%;background:#c8c0d8"></i></div>攻撃 ${c.atk.toFixed(1)}　栄養 ${P.nutr|0}　シスト ${P.cyst?'あり':'なし'}`}
  else $('stats').style.display='none';
}
function recordHtml(){const m=Math.floor(P.time/60),s=Math.floor(P.time%60);
  return `生存時間　${m}分${String(s).padStart(2,'0')}秒<br>世代数　${P.gen}<br>最高到達　《${P.bestName}》（第${P.bestTier}階層）<br>乗り換え　${P.transfers}回　捕食　${P.kills}匹<br>継承形質　${P.slots.length?P.slots.map(t=>TRAITS[t].name).join('・'):'なし'}${P.echo?'<br><span style="color:#ffcf80">★ ECHO：頂点の血脈を繋いだ</span>':''}`}
function showOver(title,msg){if(gameState!=='play')return;gameState='over';jingle('gameover');$('overTitle').textContent=title;$('overMsg').textContent=msg;$('overRec').innerHTML=recordHtml();show('over',true);renderSlots()}

// ================================================================
//  WORLD (re)generation with a shared seed
// ================================================================
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
function buildWorld(seed){SEED=seed%100000;RNGF=mulberry32(seed);genBiomes();chooseSpawn();buildDecor();RNGF=Math.random;r3World();buildMapImage();
}
const SPIDX=['larva','beetle','snail','minnow','leech','mouse','frog','crayfish','viper','catfish','fox','eel','hawk','shark','bear'];
const cleanName=s=>String(s||'').replace(/[<>&"'`\u0000-\u001f\u200b-\u200f\u2028-\u202e]/g,'').slice(0,10)||'名無し';

// ================================================================
//  NETWORK — host-authoritative over the artifact "room" capability
// ================================================================
function b64(u){let s='';for(let i=0;i<u.length;i++)s+=String.fromCharCode(u[i]);return btoa(s)}
function unb64(s){const b=atob(s),u=new Uint8Array(b.length);for(let i=0;i<b.length;i++)u[i]=b.charCodeAt(i);return u}
// ---------------- P2P fallback (outside claude.ai): the same presence-room API over WebRTC.
// Uses PeerJS (vendor/peerjs.min.js) with its free cloud broker for signalling only;
// game data flows directly between browsers. The room host is the hub and relays presences.
// No public room list here: friends join with the 4-letter room code or an invite link (#join=CODE).
const P2P={pfx:'parasite-echo-v1-',sess:{},
  ice:{iceServers:[{urls:'stun:stun.l.google.com:19302'},{urls:'stun:stun1.l.google.com:19302'},{urls:'stun:global.stun.twilio.com:3478'}]}};
const p2pOK=()=>typeof window.Peer==='function'&&typeof RTCPeerConnection!=='undefined';
// wrap a PeerJS DataConnection
function p2pLink(conn,onMsg,onState){
  const L={remote:conn.peer,open:false,conn,send(o){if(L.open)try{conn.send(typeof o==='string'?o:JSON.stringify(o))}catch(e){}},close(){try{conn.close()}catch(e){}}};
  const down=()=>{if(L.open){L.open=false;onState(L,false)}};
  conn.on('open',()=>{L.open=true;onState(L,true)});
  conn.on('data',d=>{let m;try{m=typeof d==='string'?JSON.parse(d):d}catch(_){return}if(m)onMsg(L,m)});
  conn.on('close',down);conn.on('error',down);
  return L}
// one session per room code; the 'pe-' and 'pi-' rooms share it
function p2pSession(code,host){
  if(P2P.sess[code])return P2P.sess[code].ready;
  const hostId=P2P.pfx+code,me=host?hostId:hostId+'-'+Math.random().toString(36).slice(2,10);
  const X={code,host,me,rooms:{},links:new Map(),conn:false,peer:null};P2P.sess[code]=X;
  const notify=R=>{for(const h of R.hs.slice())try{h({})}catch(e){}};
  const room=name=>X.rooms[name]||(X.rooms[name]=p2pRoom(X,name));
  const fullState=()=>{const out=[];for(const n in X.rooms)for(const [peer,v] of X.rooms[n].map)out.push({t:'p',room:n,peer,pres:v.presence});return out};
  const onMsg=(L,m)=>{if(m.t==='b'){for(const x of m.a||[])onMsg(L,x);return}
    if(typeof m.room!=='string'||typeof m.peer!=='string'||m.peer===X.me)return;
    const R=room(m.room);
    if(m.t==='p'&&m.pres&&typeof m.pres==='object'){R.put(m.peer,m.pres);if(X.host)R.map.get(m.peer).via=L.remote;notify(R)}
    else if(m.t==='l'){R.map.delete(m.peer);notify(R)}else return;
    if(X.host){const s=JSON.stringify(m);for(const o of X.links.values())if(o!==L)o.send(s)}};
  const onState=(L,up)=>{
    if(X.host){if(up){L.send({t:'b',a:fullState()});return}
      X.links.delete(L.remote);L.close();
      for(const n in X.rooms){const R=X.rooms[n];let ch=false;for(const [peer,v] of R.map)if(v.via===L.remote){R.map.delete(peer);ch=true;for(const o of X.links.values())o.send({t:'l',room:n,peer})}if(ch)notify(R)}}
    else{X.conn=up;
      if(!up){for(const n in X.rooms){const R=X.rooms[n];for(const peer of [...R.map.keys()])if(peer!==X.me)R.map.delete(peer);notify(R)}}
      else for(const n in X.rooms){const v=X.rooms[n].map.get(X.me);if(v)L.send({t:'p',room:n,peer:X.me,pres:v.presence})}}};
  X.room=room;
  X.close=()=>{for(const L of X.links.values())L.close();X.links.clear();if(X.peer)try{X.peer.destroy()}catch(e){}delete P2P.sess[code]};
  X.bcast=m=>{const s=JSON.stringify(m);for(const L of X.links.values())L.send(s)};
  X.ready=new Promise((res,rej)=>{let done=false;
    const fail=msg=>{if(done)return;done=true;X.close();rej(new Error(msg))};
    let pr;try{pr=X.peer=new window.Peer(me,{config:P2P.ice,debug:0})}catch(e){fail('error');return}
    pr.on('error',e=>{const t=e&&e.type;if(!done)fail(t==='unavailable-id'?'taken':t==='peer-unavailable'?'nohost':'error')});
    pr.on('disconnected',()=>{try{pr.reconnect()}catch(e){}});   // keep the broker link so late joiners can still find the host
    pr.on('open',()=>{
      if(host){X.conn=true;pr.on('connection',c=>{const old=X.links.get(c.peer);if(old)old.close();X.links.set(c.peer,p2pLink(c,onMsg,onState))});done=true;res(X);return}
      const L=p2pLink(pr.connect(hostId,{reliable:true,serialization:'raw'}),onMsg,(l,up)=>{onState(l,up);if(up&&!done){done=true;res(X)}});X.links.set(hostId,L)});
    setTimeout(()=>fail('timeout'),15000)});
  return X.ready}
function p2pRoom(X,name){
  const R={map:new Map(),hs:[],recs:new Map(),mine:{}};
  R.put=(peer,pres)=>{R.map.set(peer,Object.assign(R.map.get(peer)||{},{presence:Object.freeze(Object.assign({},pres)),t:Date.now()}))};
  R.put(X.me,{});
  R.api={name,p2p:true,
    presence(patch){const m=Object.assign({},R.mine,patch);for(const k in patch)if(patch[k]===null)delete m[k];R.mine=m;R.put(X.me,m);
      X.bcast({t:'p',room:name,peer:X.me,pres:m});for(const h of R.hs.slice())try{h({})}catch(e){}return Promise.resolve()},
    peers(){const out=[];for(const [peer,v] of R.map){let r=R.recs.get(peer);
        if(!r||r.presence!==v.presence){r=Object.freeze({peer,by:null,isMe:peer===X.me,sameTab:peer===X.me,kind:'viewer',guest:false,presence:v.presence,updatedAt:v.t});R.recs.set(peer,r)}out.push(r)}return out},
    onPeers(h){R.hs.push(h);setTimeout(()=>h({}),0);return()=>{const i=R.hs.indexOf(h);if(i>=0)R.hs.splice(i,1)}},
    onConnection(h){setTimeout(()=>h(X.conn),0);return()=>{}},connected:()=>X.conn,on(){return()=>{}},emit(){return Promise.resolve()},
    leave(){X.bcast({t:'l',room:name,peer:X.me});delete X.rooms[name];if(!Object.keys(X.rooms).length)setTimeout(()=>X.close(),300);return Promise.resolve()}};
  return R}
// the lobby-level API (no network until a room is joined)
function p2pLobby(){
  const me={presence:Object.freeze({}),peer:'me',isMe:true,sameTab:true,kind:'viewer'},hs=[];
  return{p2p:true,
    presence(patch){const m=Object.assign({},me.presence,patch);for(const k in patch)if(patch[k]===null)delete m[k];me.presence=Object.freeze(m);return Promise.resolve()},
    peers:()=>[Object.freeze(Object.assign({},me))],onPeers(h){hs.push(h);return()=>{}},onConnection(h){setTimeout(()=>h(typeof RTCPeerConnection!=='undefined'),0);return()=>{}},
    connected:()=>true,on(){return()=>{}},emit(){return Promise.resolve()},
    async join(name,opt){const code=String(name).replace(/^p[ei]-/,'');const X=await p2pSession(code,!!(opt&&opt.host));return X.room(name).api}}}
async function netConnect(){
  if(NET.api)return NET.api;
  NET.status='connecting';renderLobby();
  const onClaude=/claude/i.test(location.hostname)||window.claude;
  for(let i=0;i<(onClaude?40:0)&&!(window.claude&&window.claude.use);i++)await new Promise(r=>setTimeout(r,250));
  if(!(window.claude&&window.claude.use)){
    if(!p2pOK()){NET.status='unavailable';renderLobby();return null}
    NET.api=p2pLobby();NET.p2p=true;NET.status='ok';NET.connected=true;renderLobby();return NET.api}
  try{const r=await window.claude.use('room');
    if(!r){NET.status='unavailable';renderLobby();return null}
    NET.api=r;NET.status='ok';
    r.onPeers(()=>renderLobby(),()=>{NET.status='unavailable';renderLobby()});
    r.onConnection(c=>{NET.connected=c;renderLobby()});
    r.presence({app:'pe1',nm:NET.name,mode:'idle'}).catch(()=>{});
    renderLobby();return r}
  catch(e){NET.status='unavailable';renderLobby();return null}
}
function lobbyRooms(){if(!NET.api)return[];return NET.api.peers().filter(p=>!p.sameTab&&p.presence&&p.presence.app==='pe1'&&p.presence.mode==='host'&&typeof p.presence.code==='string')}
function renderLobby(){
  if(!$('lobby').classList.contains('on')&&!$('roomscr').classList.contains('on'))return;
  const st=$('netStatus');
  st.textContent=NET.status==='ok'?(NET.p2p?'● 準備OK（ルームを作るか、コードで参加）':NET.connected?'● 接続中':'… 接続しています'):NET.status==='connecting'?'… 接続しています':'このブラウザではオンライン機能を使えません。';
  $('p2pJoin').style.display=NET.p2p?'block':'none';
  $('lobbyNote').innerHTML=NET.p2p?'友だちにルームコード（または招待リンク）を伝えて参加してもらいます。<br>回線の相性によっては繋がらないことがあります。':'このページを同時に開いている人のルームが表示されます。<br>友だちを招くには、このページを共有してください（claude.ai へのログインが必要です）。';
  st.style.color=NET.status==='ok'&&NET.connected?'#9cf59c':NET.status==='unavailable'?'#ff9a8a':'#cdb8ee';
  $('bCreate').disabled=$('bCreateCoop').disabled=!(NET.status==='ok');
  const box=$('roomList');box.innerHTML='';
  const rooms=lobbyRooms();
  box.style.display=NET.p2p?'none':'block';
  if(!rooms.length){const d=document.createElement('div');d.style.color='#9a90ab';d.textContent=NET.status==='ok'?'公開中のルームはまだありません。ルームを作って友だちを待ちましょう。':'—';box.appendChild(d)}
  for(const p of rooms){const pr=p.presence;const b=document.createElement('button');b.className='btn sub room-item';b.style.display='block';b.style.width='100%';
    b.textContent=`${pr.k==='coop'?'【協力】':'【対戦】'}${cleanName(pr.nm)} のルーム　${Math.min(6,pr.n|0)}/6人　${pr.ph==='play'?'対戦中（途中参加可）':pr.ph==='end'?'結果発表中':'待機中'}`;
    b.onclick=()=>joinRoom(String(pr.code).replace(/[^a-z0-9]/g,'').slice(0,8));box.appendChild(b)}
  if($('roomscr').classList.contains('on'))renderRoom();
}
function renderRoom(){
  const r=NET.sync;if(!r)return;
  $('roomCode').textContent=NET.code.toUpperCase();
  const inv=$('invite');inv.style.display=NET.p2p&&NET.role==='host'?'block':'none';
  if(NET.p2p)$('inviteUrl').value=location.href.split('#')[0]+'#join='+NET.code;
  const box=$('memberList');box.innerHTML='';
  const peers=r.peers().filter(p=>p.presence&&p.presence.app==='pe1');
  for(const p of peers){const d=document.createElement('div');d.textContent=`${p.presence.role==='host'?'👑 ':'・'}${cleanName(p.presence.nm)}${p.sameTab?'（あなた）':''}`;box.appendChild(d)}
  const isHost=NET.role==='host';
  $('bBegin').style.display=isHost?'inline-block':'none';
  const hp=peers.find(p=>p.presence.role==='host');const kd=(hp&&hp.presence.k)||NET.kind;
  $('roomKind').textContent=kd==='coop'?'協力モード：みんなで痩せた森の生態系を蘇らせる':'対戦モード：最初に《ヒグマ》の肉体を奪った寄生体が勝者';
  $('roomMsg').textContent=isHost?`参加者 ${peers.length}人。準備ができたら開始してください（最大6人）。`:'ホストの開始を待っています…';
}
async function createRoom(kind){
  const api=await netConnect();if(!api)return;
  NET.role='host';NET.kind=kind||'race';MATCH.kind=NET.kind;
  if(NET.p2p)$('netStatus').textContent='… ルームを準備しています';
  let ok=false;
  for(let tries=0;tries<3&&!ok;tries++){NET.code=Math.random().toString(36).slice(2,6).replace(/[^a-z0-9]/g,'x');
    try{NET.sync=await api.join('pe-'+NET.code,{host:true});NET.info=await api.join('pi-'+NET.code,{host:true});ok=true}catch(e){if(!(e&&e.message==='taken'))break}}
  if(!ok){toast('ルームを作れませんでした',NET.p2p?'通信サーバーに繋がりません。時間をおいて試してください':'時間をおいて試してください');NET.role=null;renderLobby();return}
  NET.remote.clear();MATCH.phase='wait';MATCH.mode='host';
  NET.sync.presence({app:'pe1',role:'host',nm:NET.name,code:NET.code,ph:'wait',k:NET.kind}).catch(()=>{});
  api.presence({app:'pe1',nm:NET.name,mode:'host',code:NET.code,n:1,ph:'wait',k:NET.kind}).catch(()=>{});
  NET.sync.onPeers(()=>renderRoom());
  show('lobby',false);show('roomscr',true);renderRoom();
}
async function joinRoom(code){
  const api=await netConnect();if(!api||!code)return;
  NET.code=code;NET.role='cli';
  if(NET.p2p)$('netStatus').textContent='… ルーム '+code.toUpperCase()+' に接続しています';
  try{NET.sync=await api.join('pe-'+code);NET.info=await api.join('pi-'+code)}
  catch(e){toast('ルームに入れませんでした',NET.p2p?(e&&e.message==='nohost'?'そのコードのルームが見つかりません':'接続できませんでした（回線の相性で繋がらないことがあります）'):'');NET.role=null;renderLobby();return}
  NET.cnt={a:0,s:0,cy:0,sl:0,sli:-1,tc:0,tci:-1};NET.seed=0;NET.hostSeen=performance.now();NET.lastSnapObj=null;NET.lastInfoObj=null;
  NET.sync.presence({app:'pe1',role:'cli',nm:NET.name,in:[0,0,0,0,0,0,0,0,-1],tc:[0,-1]}).catch(()=>{});
  api.presence({app:'pe1',nm:NET.name,mode:'cli',code}).catch(()=>{});
  NET.sync.onPeers(()=>renderRoom());
  show('lobby',false);show('roomscr',true);renderRoom();
}
async function leaveRoom(){
  try{if(NET.sync)await NET.sync.leave();if(NET.info)await NET.info.leave()}catch(e){}
  NET.sync=NET.info=null;NET.role=null;NET.remote.clear();NET.ghosts.clear();
  if(NET.api)NET.api.presence({app:'pe1',nm:NET.name,mode:'idle',code:null}).catch(()=>{});
}
function myPeer(){if(NET.myPeer)return NET.myPeer;const r=NET.sync&&NET.sync.peers().find(p=>p.sameTab);if(r)NET.myPeer=r.peer;return NET.myPeer}

// ---------------- host side
function startHostMatch(kind){
  if(kind)NET.kind=kind;
  const seed=(Math.random()*1e9)|0;NET.seed=seed;
  $('loading').style.display='flex';
  setTimeout(()=>{
    buildWorld(seed);
    const remotes=[...NET.remote.values()];
    resetPlayerState();P.name=NET.name;P.id='host';
    for(const pl of remotes){Object.assign(pl,newPlayer({id:pl.id,remote:true,name:pl.name,_cnt:pl._cnt,_tc:pl._tc}));PLAYERS.push(pl)}
    Object.assign(MATCH,{mode:'host',kind:NET.kind||'race',phase:'play',winner:null,t:0});NET.winner=null;
    initWorld();for(const pl of PLAYERS)spawnPlayer(pl);
    dayT=.06;gameState='play';paused=false;modalOpen=false;
    for(const s of['title','lobby','roomscr','result','over','pause','help'])show(s,false);
    $('loading').style.display='none';
    cam.x=P.c.x-GW/2;cam.y=P.c.y-GH/2;renderSlots();
    setTimeout(()=>MATCH.kind==='coop'?toast('協力開始 — 痩せた森を、みんなで蘇らせよう','繁殖して数を増やし、失われた捕食者を呼び戻せ'):toast('対戦開始 — 最初にヒグマの肉体を奪え','森の中に正体を隠した寄生体が潜んでいる'),300);
  },40);
}
function parseInput(pl,pr){
  const a=pr.in,I=pl.inp;
  if(Array.isArray(a)&&a.length>=9){
    I.mx=clamp(+a[0]/100||0,-1,1);I.my=clamp(+a[1]/100||0,-1,1);I.mag=clamp(+a[2]/100||0,0,1);const b=a[3]|0;
    I.atk=!!(b&1);I.court=!!(b&2);I.od=!!(b&4);I.cyst=!!(b&8);I.purge=!!(b&16);I.obs=!!(b&32);
    const pc=pl._cnt||(pl._cnt={a:a[4],s:a[5],cy:a[6],sl:a[7]});
    I.atkP=a[4]!==pc.a;I.skillP=a[5]!==pc.s;I.cycleP=a[6]!==pc.cy;I.slotP=a[7]!==pc.sl?clamp(a[8]|0,0,3):-1;
    pc.a=a[4];pc.s=a[5];pc.cy=a[6];pc.sl=a[7]}
  if(Array.isArray(pr.tc)){if(pl._tc===undefined)pl._tc=pr.tc[0];else if(pr.tc[0]!==pl._tc){pl._tc=pr.tc[0];applyTraitChoice(pl,pr.tc[1]|0)}}
}
function encodeSnap(){
  const foci=PLAYERS.filter(p=>p.c).map(p=>p.c);const list=[];
  for(const c of creatures){if(c.dead)continue;let md=1e9;for(const f of foci){const d=Math.abs(f.x-c.x)+Math.abs(f.y-c.y);if(d<md)md=d}if(md<340||c.pl)list.push([c.pl?-1:md,c])}
  list.sort((a,b)=>a[0]-b[0]);const n=Math.min(list.length,185);
  const u=new Uint8Array(n*10),dv=new DataView(u.buffer);
  for(let i=0;i<n;i++){const c=list[i][1],o=i*10;dv.setUint16(o,c.id&65535);u[o+2]=SPIDX.indexOf(c.key)|((c.stage&3)<<4)|(c.sex?64:0)|(c.wet?128:0);
    dv.setUint16(o+3,clamp(c.x*NQ,0,65535)|0);dv.setUint16(o+5,clamp(c.y*NQ,0,65535)|0);u[o+7]=(((c.ang%TAU)+TAU)%TAU)/TAU*256&255;u[o+8]=clamp(c.alt|0,0,255);
    u[o+9]=(c.hitT>0?1:0)|(c.hiddenT>0?2:0)|(c.feral?4:0)|((c.rival||c.pl)?8:0)|(c.poisonT>0?16:0)|(c.stun>0?32:0)}
  return b64(u);
}
function encodeFood(){const foci=PLAYERS.filter(p=>p.c).map(p=>p.c);const out=[];
  for(const f of foods){if(foci.some(c=>Math.abs(c.x-f.x)+Math.abs(c.y-f.y)<260)){out.push(f);if(out.length>=60)break}}
  const u=new Uint8Array(out.length*5),dv=new DataView(u.buffer);
  out.forEach((f,i)=>{dv.setUint16(i*5,f.x*NQ|0);dv.setUint16(i*5+2,f.y*NQ|0);u[i*5+4]=f.kind==='berry'?0:f.kind==='algae'?1:2+(f.d|0)});return b64(u)}
function mushBits(){let b=0;mushrooms.forEach((m,i)=>{if(m.ready)b|=1<<i});return b}
function computeRank(){
  const r=PLAYERS.map(pl=>[MATCH.mode==='solo'&&pl.local?'あなた':pl.name,pl.c?pl.c.sp.tier:0,pl.c?SPIDX.indexOf(pl.c.key):0,0,pl.id]);
  let best=null;for(const rv of rivals)if(rv.c&&!rv.c.dead&&(!best||rv.c.sp.tier>best.sp.tier))best=rv.c;
  if(best)r.push(['正体不明の寄生体',best.sp.tier,SPIDX.indexOf(best.key),1,'ai']);
  r.sort((a,b)=>b[1]-a[1]);return r.slice(0,7)}
function playerInfo(pl){const c=pl.c;const acts=c?activeTraits(c):[];const now=MATCH.t;
  return {c:c?c.id&65535:-1,a:pl.adr|0,h:c?Math.round(c.hp/c.maxhp*100):0,m:c?Math.round(c.maxhp):1,k:c?Math.round(c.atk*10):0,
    l:c?(c.key==='larva'?Math.round(pl.dry/DRY*1000):Math.round(c.age/c.life*1000)):0,g:pl.gen,n:pl.nutr|0,s:pl.slots.join(','),e:pl.sel,
    d:acts.map(k=>Math.max(0,Math.round((pl.skillCd[k]||0)*10))),hk:pl.holdKind?pl.holdKind[0]:'',ht:Math.round(pl.holdT*100),ct:pl.cystT>0?Math.round(pl.cystT*100):0,pg:pl.purgeT>0?Math.round(pl.purgeT*100):0,
    cy:pl.cyst?[pl.cyst.x|0,pl.cyst.y|0]:0,tx:Math.round(pl.toxin*100),ib:pl.inBush?1:0,od:pl.od?1:0,su:Math.round(pl.susp*100),
    hn:[pl.hint.host?1:0,pl.hint.sw|0,pl.hint.court?1:0,pl.hint.watch?1:0,pl.hint.thr||'',pl.hint.big?1:0],pt:pl.pendingTrait||0,ev:pl.ev.filter(e=>performance.now()-e[4]<3000).slice(-5).map(e=>e.slice(0,4)),rs:Math.ceil(pl.respawnT),
    ac:Math.ceil(Math.max(0,pl.acc||0)),bt:pl.bestTier,tr:pl.transfers,kl:pl.kills,tm:pl.time|0,st:c?c.stage:1,ki:pl.idleT>.8?1:0,cr:pl.critT>0?1:0}}
const enc=new TextEncoder();
function buildInfo(){
  const pl={};for(const [id,p] of NET.remote)pl[id]=playerInfo(p);
  const now=performance.now();const fx=FXQ.filter(e=>now-e[6]<1600).map(e=>e.slice(0,6));
  let o={pl,rk:MATCH.kind==='coop'?[]:computeRank(),fx};
  if(MATCH.kind==='coop'){o.eco={lv:ECO.lv,h:Math.round(ECO.h),hd:ECO.hold|0,n:SPKEYS.map(k=>ECO.counts[k]|0),b:ECO.births,pb:ECO.pBirths,r:ECO.returned};o.pp=PLAYERS.filter(p=>p.c).map(p=>[p.c.id&65535,p.name,p.c.x|0,p.c.y|0])}
  // stay inside the 4 KiB presence budget
  let guard=0;while(enc.encode(JSON.stringify(o)).length>3900&&guard++<20){if(o.fx.length>4)o.fx=o.fx.slice(-Math.floor(o.fx.length/2));else for(const k in pl)pl[k].ev=pl[k].ev.slice(1)}
  return o}
function hostNet(dt){
  const sync=NET.sync;if(!sync)return;
  const seen=new Set();
  for(const pe of sync.peers()){if(pe.sameTab||pe.kind!=='viewer')continue;const pr=pe.presence||{};if(pr.app!=='pe1'||pr.role!=='cli')continue;
    seen.add(pe.peer);let pl=NET.remote.get(pe.peer);
    if(!pl){if(NET.remote.size>=5)continue;pl=newPlayer({id:pe.peer,remote:true,name:cleanName(pr.nm)});NET.remote.set(pe.peer,pl);
      if(MATCH.phase!=='wait'&&gameState==='play'){PLAYERS.push(pl);spawnPlayer(pl)}logEco(`${pl.name} が森に入った`)}
    pl.name=cleanName(pr.nm);parseInput(pl,pr)}
  for(const [id,pl] of NET.remote)if(!seen.has(id)){NET.remote.delete(id);const i=PLAYERS.indexOf(pl);if(i>=0)PLAYERS.splice(i,1);if(pl.c&&pl.c.pl===pl)pl.c.pl=null;logEco(`${pl.name} が去った`)}
  NET.snapT-=dt;
  if(NET.snapT<=0){NET.snapT=.07;
    const w=MATCH.winner?(MATCH.winner.coop?['',0,'coop']:[MATCH.winner.name,MATCH.winner.ai?1:0,MATCH.winner.id||'']):0;
    const pr={app:'pe1',role:'host',nm:NET.name,code:NET.code,ph:MATCH.phase,seed:NET.seed,w,k:NET.kind};
    if(gameState==='play'&&MATCH.phase!=='wait'){pr.s=encodeSnap();pr.f=encodeFood();pr.t=Math.round(MATCH.t);pr.d=Math.round(dayT*1000);pr.mu=mushBits()}
    sync.presence(pr).catch(()=>{})}
  NET.infoT-=dt;if(NET.infoT<=0&&gameState==='play'){NET.infoT=.14;NET.info.presence(buildInfo()).catch(()=>{})}
  NET.lobbyT-=dt;if(NET.lobbyT<=0){NET.lobbyT=2;NET.api.presence({app:'pe1',nm:NET.name,mode:'host',code:NET.code,n:1+NET.remote.size,ph:MATCH.phase,k:NET.kind}).catch(()=>{})}
}

// ---------------- client side
function startClientGame(seed){
  NET.seed=seed;$('loading').style.display='flex';
  setTimeout(()=>{
    buildWorld(seed);
    creatures=[];foods=[];clouds=[];particles=[];decals=[];rivals=[];fireflies=[];SKF=[];AFTER=[];SLIME=[];NET.ghosts.clear();
    resetPlayerState();P.name=NET.name;
    Object.assign(MATCH,{mode:'client',kind:MATCH.kind,phase:'play',winner:null,t:0});
    NET.lastEv=-1;NET.lastFx=-1;NET.lastInfoObj=null;NET._ptShown=null;
    gameState='play';paused=false;modalOpen=false;
    for(const s of['title','lobby','roomscr','result','over','pause','help'])show(s,false);
    $('loading').style.display='none';renderSlots();
    setTimeout(()=>MATCH.kind==='coop'?toast('協力開始 — 痩せた森を、みんなで蘇らせよう','繁殖して数を増やし、失われた捕食者を呼び戻せ'):toast('対戦開始 — 最初にヒグマの肉体を奪え','森の中に正体を隠した寄生体が潜んでいる'),300);
  },40);
}
function makeGhost(key,id,x,y){const sp=SP[key];const g={id,sp,key,x,y,tx:x,ty:y,vx:0,vy:0,ang:0,tang:0,animT:rnd(4),stage:1,alt:0,talt:0,r:sp.size*.42*SS,feral:false,rival:null,aura:false,
  hitT:0,hiddenT:0,poisonT:0,stun:0,trail:null,wet:false,sex:0,pl:null,traits:null,dead:false,hp:1,maxhp:1,atk:1,age:.5,life:1,inBush:false,seen:0,state:'',auraT:rnd(3),growth:0,ghost:1};
  if(sp.seg){g.trail=[];for(let i=0;i<40;i++)g.trail.push({x,y})}return g}
const NORIVAL={slots:[]};
function applySnap(s){
  let u;try{u=unb64(s)}catch(e){return}
  const dv=new DataView(u.buffer),now=performance.now();
  for(let o=0;o+10<=u.length;o+=10){const id=dv.getUint16(o),b=u[o+2],key=SPIDX[b&15];if(!key)continue;const x=dv.getUint16(o+3)/NQ,y=dv.getUint16(o+5)/NQ;
    let g=NET.ghosts.get(id);if(!g||g.key!==key){g=makeGhost(key,id,x,y);NET.ghosts.set(id,g)}
    g.tx=x;g.ty=y;g.stage=(b>>4)&3;g.sex=b&64?1:0;g.wet=!!(b&128);g.tang=u[o+7]/256*TAU;g.talt=u[o+8];const f=u[o+9];
    if(f&1)g.hitT=.15;if(f&2)g.hiddenT=.2;g.feral=!!(f&4);g.aura=!!(f&8)&&g!==P.c;g.rival=g.aura?NORIVAL:null;g.poisonT=f&16?.2:0;g.stun=f&32?.2:0;
    g.r=g.sp.size*.42*SS*(g.stage===0?.78:1)*(g.feral?1.18:1);g.seen=now}
}
function applyFood(s){if(!s){foods=[];return}let u;try{u=unb64(s)}catch(e){return}const dv=new DataView(u.buffer);foods=[];
  for(let o=0;o+5<=u.length;o+=5){const k=u[o+4];foods.push({x:dv.getUint16(o)/NQ,y:dv.getUint16(o+2)/NQ,kind:k===0?'berry':k===1?'algae':'leaf',d:Math.max(0,k-2)})}}
function noteLocal(e){const k=e[1],a=e[2],b=e[3];if(k==='t'){toast(a||'',b||'');if(a==='生態系の回復')jingle('chime')}else if(k==='s')sfx(a);else if(k==='k')cam.shake=Math.max(cam.shake,+a||0);else if(k==='f')P.flash=Math.max(P.flash,+a||0);else if(k==='h')P.hurtT=.4}
function playFx(e){const k=e[1],x=e[2],y=e[3],a=e[4],b=e[5];
  if(k==='b'){blood(x,y,a,b?[.5,.2,.6]:undefined);const d=nearCam(x,y);if(d<300)sfx('bite',{v:clamp(1-d/300,0,1)*.8})}
  else if(k==='r'){ring(x,y,a,[Math.floor(b/100)/9,Math.floor(b/10)%10/9,b%10/9],.6)}
  else if(k==='h')toastHearts(x,y);
  else if(k==='m')clouds.push({x,y,r:44,t:4.5,vis:1});
  else if(k==='e')clouds.push({x,y,r:0,t:.35,flash:1});
  else if(k==='X'){const n=SKFXN[a];if(n)skfx(n,x,y,b,true)}
  else if(k==='z'){const n=SFXN[a];const d=nearCam(x,y);if(n&&d<320)sfx(n,{v:clamp(1.15-d/320,0,1)})}
}
function applyInfo(o){
  if(Array.isArray(o.rk))NET.rank=o.rk;
  if(o.eco&&Array.isArray(o.eco.n)){ECO.h=o.eco.h;ECO.hold=o.eco.hd;ECO.lv=o.eco.lv|0;ECO.births=o.eco.b|0;ECO.pBirths=o.eco.pb|0;ECO.returned=o.eco.r|0;const n={};SPKEYS.forEach((k,i)=>n[k]=o.eco.n[i]|0);ECO.counts=n}
  NET.pp=Array.isArray(o.pp)?o.pp:[];
  if(Array.isArray(o.fx)){let mx=NET.lastFx;for(const e of o.fx){if(!Array.isArray(e)||e[0]<=NET.lastFx)continue;if(NET.lastFx>=0)playFx(e);mx=Math.max(mx,e[0])}NET.lastFx=Math.max(mx,0)}
  const me=o.pl&&o.pl[myPeer()];if(!me)return;
  const g=me.c>=0?NET.ghosts.get(me.c):null;
  if(P.c&&P.c!==g&&P.c.pl===P)P.c.pl=null;
  if(me.c<0)P.c=null;else if(g)P.c=g;
  const slots=String(me.s||'').split(',').filter(k=>TRAITS[k]);const slotsChanged=slots.join()!==P.slots.join();P.slots=slots;
  P.adr=me.a;P.gen=me.g;P.nutr=me.n;P.sel=me.e|0;
  if(P.c){const c=P.c;c.pl=P;c.rival=null;c.aura=false;c.maxhp=Math.max(1,me.m);c.hp=me.h/100*c.maxhp;c.atk=me.k/10;c.stage=me.st|0;
    if(c.key==='larva')P.dry=me.l/1000*DRY;else{c.age=me.l/1000;c.life=1}
    const acts=activeTraits(c);P.skillCd={};acts.forEach((k,i)=>P.skillCd[k]=(me.d&&me.d[i]||0)/10)}
  P.holdKind={i:'infect',s:'swallow',c:'court'}[me.hk]||'';P.holdT=me.ht/100;P.cystT=me.ct/100;P.purgeT=me.pg/100;
  P.cyst=me.cy?{x:me.cy[0],y:me.cy[1],t:P.cyst?P.cyst.t:0}:null;
  P.toxin=me.tx/100;P.inBush=!!me.ib;P.od=!!me.od;P.susp=me.su/100;
  const hn=me.hn||[];P.hint={host:!!hn[0],sw:hn[1]|0,court:!!hn[2],watch:!!hn[3],thr:hn[4]||'',big:!!hn[5]};P.threat=P.hint.thr?{sp:{name:P.hint.thr}}:null;
  P.respawnT=me.rs|0;P.acc=me.ac|0;P.bestTier=me.bt|0;P.transfers=me.tr|0;P.kills=me.kl|0;P.time=me.tm|0;P.idleT=me.ki?1:0;P.critT=me.cr?1:0;
  if(Array.isArray(me.ev)){let mx=NET.lastEv;for(const e of me.ev){if(!Array.isArray(e)||e[0]<=NET.lastEv)continue;if(NET.lastEv>=0)noteLocal(e);mx=Math.max(mx,e[0])}NET.lastEv=Math.max(mx,0)}
  if(me.pt&&TRAITS[me.pt]&&!pendingTrait&&NET._ptShown!==me.pt)openTraitModal(me.pt,P.slots);
  if(!me.pt){NET._ptShown=null;if(pendingTrait){pendingTrait=null;show('trait',false)}}
  if(slotsChanged)renderSlots();
}
function onHostSync(pr){
  if((pr.ph==='play'||pr.ph==='end')&&pr.seed&&pr.seed!==NET.seed){MATCH.kind=pr.k==='coop'?'coop':'race';startClientGame(pr.seed);return}
  if(pr.ph==='wait'&&gameState==='play'&&MATCH.mode==='client'){gameState='title';show('result',false);show('roomscr',true);renderRoom();return}
  if(gameState!=='play'||MATCH.mode!=='client')return;
  if(pr.s)applySnap(pr.s);if(pr.f!==undefined)applyFood(pr.f);
  if(typeof pr.d==='number')NET.dayT=pr.d/1000;if(typeof pr.t==='number')MATCH.t=pr.t;
  if(typeof pr.mu==='number')mushrooms.forEach((m,i)=>m.ready=!!(pr.mu&(1<<i)));
  if(Array.isArray(pr.w)&&!MATCH.winner){MATCH.winner=pr.w[2]==='coop'?{coop:true,name:'',ai:false,me:true,t:MATCH.t}:{name:cleanName(pr.w[0]),ai:!!pr.w[1],me:pr.w[2]===myPeer(),t:MATCH.t};MATCH.phase='end';setTimeout(showResult,600)}
  if(!pr.w&&MATCH.winner&&pr.ph==='play'){MATCH.winner=null;MATCH.phase='play'}
}
function clientNet(dt){
  if(!NET.sync)return;
  const hp=NET.sync.peers().find(p=>p.presence&&p.presence.app==='pe1'&&p.presence.role==='host');
  if(hp){NET.hostSeen=performance.now();if(hp.presence!==NET.lastSnapObj){NET.lastSnapObj=hp.presence;onHostSync(hp.presence)}}
  else if(performance.now()-NET.hostSeen>7000&&NET.role==='cli'){NET.hostSeen=performance.now()+1e9;hostGone();return}
  if(NET.info){const ip=NET.info.peers().find(p=>p.presence&&p.presence.pl);if(ip&&ip.presence!==NET.lastInfoObj&&gameState==='play'){NET.lastInfoObj=ip.presence;applyInfo(ip.presence)}}
  if(gameState!=='play')return;
  if(IN.atkP)NET.cnt.a++;if(IN.skillP)NET.cnt.s++;if(IN.cycleP)NET.cnt.cy++;if(IN.slotP>=0&&IN.slotP<9){NET.cnt.sl++;NET.cnt.sli=IN.slotP}
  const arr=[Math.round(IN.mx*100),Math.round(IN.my*100),Math.round(IN.mag*100),(IN.atk?1:0)|(IN.court?2:0)|(IN.od?4:0)|(IN.cyst?8:0)|(IN.purge?16:0)|(IN.obs?32:0),NET.cnt.a,NET.cnt.s,NET.cnt.cy,NET.cnt.sl,NET.cnt.sli];
  const key=arr.join(',')+'|'+NET.cnt.tc;NET.inT-=dt;
  if((key!==NET.lastIn&&NET.inT<=0)||NET.inT<-1){NET.inT=.05;NET.lastIn=key;NET.sync.presence({in:arr,tc:[NET.cnt.tc,NET.cnt.tci]}).catch(()=>{})}
}
function clientWorld(dt){
  worldT+=dt;MATCH.t+=dt;dayT+=(((NET.dayT-dayT+1.5)%1)-.5)*Math.min(1,dt*2)+dt/DAY;dayT=(dayT+1)%1;
  const now=performance.now();
  for(const [id,g] of NET.ghosts){if(now-g.seen>700&&g!==P.c){NET.ghosts.delete(id);continue}
    const dx=g.tx-g.x,dy=g.ty-g.y,d=Math.hypot(dx,dy);
    if(d>90){g.x=g.tx;g.y=g.ty;g.vx=g.vy=0;if(g.trail)for(const p of g.trail){p.x=g.x;p.y=g.y}}
    else{const k=1-Math.exp(-dt*12),nx=g.x+dx*k,ny=g.y+dy*k;g.vx=lerp(g.vx,(nx-g.x)/Math.max(dt,1e-3),.3);g.vy=lerp(g.vy,(ny-g.y)/Math.max(dt,1e-3),.3);g.x=nx;g.y=ny}
    g.ang+=angDiff(g.ang,g.tang)*Math.min(1,dt*14);g.alt=lerp(g.alt,g.talt,1-Math.exp(-dt*8));
    const v=Math.hypot(g.vx,g.vy);g.animT=(g.animT+dt*(v/(g.sp.size*.5+2))*1.7+(g.sp.fly&&g.alt>4?dt*3:0)+(g.key==='larva'?dt*2:0))%4;
    if(g.trail){const h=g.trail[0];if(Math.hypot(g.x-h.x,g.y-h.y)>1.3*SS){g.trail.unshift({x:g.x,y:g.y});g.trail.pop()}}
    g.hitT-=dt;g.hiddenT-=dt;
    if(g.wet&&v>12&&Math.random()<dt*(g.sp.hab?1.5:5)&&onScreen(g.x,g.y))ring(g.x,g.y,g.r+4,[.5,.7,.8],.6);
    creatureTells(g,dt)}
  creatures=[...NET.ghosts.values()];
  buildCGrid();fxWorld(dt);
  if(P.cyst)P.cyst.t+=dt;
}
function hostGone(){
  toast('ホストとの接続が切れた','');MATCH.phase='end';
  $('resTitle').textContent='対戦終了';$('resMsg').textContent='ホストが退出したため、対戦は終了しました。';$('resRank').innerHTML='';
  resButtons([['ロビーへ',()=>{leaveRoom();toLobby()}],['タイトルへ',()=>{leaveRoom();toTitle()}]]);show('result',true);
}

// ================================================================
//  RESULT / RANKING / MENUS
// ================================================================
function rankHtml(rk){return rk.map((r,i)=>{const me=MATCH.mode==='client'?r[4]===myPeer():r[4]===P.id&&!r[3];const sp=SP[SPIDX[r[2]]];
  const nm=document.createElement('span');nm.textContent=r[0];
  return `<div class="rk${me?' me':''}${r[3]?' ai':''}"><b>${i+1}</b> ${nm.innerHTML} <span>第${r[1]}階層 ${sp?sp.name:''}</span></div>`}).join('')}
function renderEco(box){
  const n=ECO.counts||{};let rows='';
  for(const k of SPKEYS){const c=n[k]|0,T=SP[k].pop,r=Math.min(c/T,1.7);const col=c===0?'#555':c>T*1.7?'#e98':r<.5?'#e9b34a':'#7fd88a';
    rows+=`<div class="eco"><span>${SP[k].name}</span><i style="width:${Math.max(1,Math.min(r,1)*28)}px;background:${col}"></i><em>${c}</em></div>`}
  const hold=(ECO.hold>0?`　維持 ${ECO.hold|0}/${ECO_HOLD}秒`:'')+`<span class="vit"><br><span style="color:#9cf59c">森の活力 Lv${ECO.lv|0}</span><span style="color:#8a8">（交配するたびに上がる）</span></span>`;
  const h=`<div class="rkh">生態系の健全度 <b style="color:${ECO.h>=ECO_GOAL?'#9cf59c':'#ffcf80'}">${ECO.h|0}%</b>${hold}</div><div class="ecog">${rows}</div>`;
  box.style.display='block';box.classList.add('ecomode');if(box._h!==h){box.innerHTML=h+'<div class="more">▼ タップで詳細</div>';box._h=h}}
function renderRank(){const box=$('rank');if(gameState!=='play'){box.style.display='none';return}
  if(MATCH.kind==='coop'){if(MATCH.mode!=='client')ECO.counts=ECO.counts&&Object.keys(ECO.counts).length?ECO.counts:ecoCounts();renderEco(box);return}
  box.classList.remove('ecomode');
  const rk=MATCH.mode==='client'?NET.rank:computeRank();box.style.display=rk.length?'block':'none';
  const h=`<div class="rkh">頂点争い — 目標：第6階層《ヒグマ》</div>`+rankHtml(rk);if(box._h!==h){box.innerHTML=h+'<div class="more">▼ タップで全員</div>';box._h=h}}
$('rank').classList.add('collapsed');$('rank').addEventListener('pointerdown',e=>{e.stopPropagation();$('rank').classList.toggle('collapsed')});
function resButtons(list){const box=$('resBtns');box.innerHTML='';list.forEach(([t,f],i)=>{const b=document.createElement('button');b.className=i?'btn sub':'btn';b.textContent=t;b.onclick=f;box.appendChild(b)})}
function showResult(){
  const w=MATCH.winner;if(!w)return;
  const m=Math.floor(w.t/60),s=Math.floor(w.t%60),tm=`${m}分${String(s).padStart(2,'0')}秒`;
  if(w.coop){$('resTitle').textContent='生態系の再生に成功';$('resTitle').style.color='#bff5c2';
    $('resMsg').textContent=`みんなで食物連鎖を立て直し、森は再び息を吹き返した（${tm}）`;
    $('resRank').innerHTML=`健全度 ${ECO.h|0}%　森の活力 Lv${ECO.lv|0}<br>この森で生まれた命　${ECO.births}匹（寄生体の繁殖 ${ECO.pBirths}匹）<br>森に戻った種　${ECO.returned}種`;
    const again=MATCH.mode==='host'?['もう一度（全員）',()=>{show('result',false);startHostMatch('coop')}]:MATCH.mode==='solo'?['もう一度',()=>{show('result',false);startSolo('coop')}]:null;
    resButtons([...(again?[again]:[]),['このまま続ける',()=>{MATCH.phase='free';show('result',false)}],[MATCH.mode==='solo'?'タイトルへ':'ロビーへ',()=>{show('result',false);if(MATCH.mode==='solo')toTitle();else{leaveRoom();toLobby()}}]]);
    show('result',true);sfx('crit');jingle('win');return}
  const me=w.me;$('resTitle').textContent=me?'頂点到達 — あなたの勝利':w.ai?'敗北 — 先を越された':`${w.name} の勝利`;
  $('resTitle').style.color=me?'#ffe7a8':'#ffb0b0';
  $('resMsg').textContent=me?`《ヒグマ》の肉体を奪い、食物連鎖の頂点に立った（${tm}）`:w.ai?`正体不明の寄生体が先に《ヒグマ》を乗っ取った（${tm}）`:`${w.name} が先に《ヒグマ》を乗っ取った（${tm}）`;
  $('resRank').innerHTML=rankHtml(MATCH.mode==='client'?NET.rank:computeRank())+(MATCH.mode==='client'?'':'<div style="margin-top:8px">'+recordHtml()+'</div>');
  if(MATCH.mode==='solo')resButtons([['もう一度',()=>{show('result',false);startSolo('race')}],['このまま続ける',()=>{MATCH.phase='free';show('result',false)}],['タイトルへ',()=>{show('result',false);toTitle()}]]);
  else if(MATCH.mode==='host')resButtons([['もう一度（全員）',()=>{show('result',false);startHostMatch('race')}],['観戦を続ける',()=>show('result',false)],['ロビーへ',()=>{leaveRoom();toLobby()}]]);
  else resButtons([['観戦を続ける',()=>show('result',false)],['ロビーへ',()=>{leaveRoom();toLobby()}]]);
  show('result',true);sfx(me?'crit':'eject');jingle(me?'win':'lose');
}
// controller navigation for every menu screen
let navIdx=0,navPrev={};
function menuNav(){
  const scr=[...document.querySelectorAll('.screen.on')].pop();
  const gp=[...(navigator.getGamepads?navigator.getGamepads():[])].find(p=>p&&p.connected);
  if(!gp){navPrev={};return false}
  const b=i=>gp.buttons[i]&&(gp.buttons[i].pressed||gp.buttons[i].value>.5);
  const ay=gp.axes[1]||0,ax=gp.axes[0]||0;
  const st={up:b(12)||ay<-.6||(b(14)||ax<-.6),dn:b(13)||ay>.6||(b(15)||ax>.6),a:b(0),bk:b(1),st:b(9),map:b(8)};
  if(!scr){document.querySelectorAll('.navf').forEach(e=>e.classList.remove('navf'));navPrev=st;return false}
  const items=[...scr.querySelectorAll('button,.tcard')].filter(e=>e.offsetParent!==null&&!e.disabled);if(!items.length){navPrev=st;return true}
  const edge=k=>st[k]&&!navPrev[k];
  if(edge('up'))navIdx--;if(edge('dn'))navIdx++;
  navIdx=(navIdx%items.length+items.length)%items.length;
  items.forEach((e,i)=>e.classList.toggle('navf',i===navIdx));
  if(edge('a')||edge('st'))items[navIdx].click();
  if(scr.id==='mapv'&&edge('map'))setMap(false);
  if(edge('bk')){const bk=scr.querySelector('[data-back]');if(bk)bk.click();else if(scr.id==='trait')chooseTrait(-1);else if(scr.id==='pause')setPause(false)}
  navPrev=st;return true;
}

// ================================================================
//  FLOW
// ================================================================
function startSolo(kind){
  kind=kind==='coop'?'coop':'race';
  for(const s of['title','over','pause','help','result'])show(s,false);
  $('loading').style.display='flex';
  setTimeout(()=>{
    if(startSolo.used)buildWorld((Math.random()*1e9)|0);startSolo.used=true;
    Object.assign(MATCH,{mode:'solo',kind,phase:'play',winner:null,t:0});
    resetPlayerState();initWorld();spawnPlayer(P);
    cam.x=P.c.x-GW/2;cam.y=P.c.y-GH/2;
    gameState='play';paused=false;modalOpen=false;dayT=.06;
    $('loading').style.display='none';renderSlots();
    setTimeout(()=>kind==='coop'?toast('痩せた森を蘇らせよう','繁殖して数を増やし、失われた捕食者を呼び戻せ'):toast('頂点を目指せ — 最初にヒグマの肉体を奪った者が勝者','あなたは寄生幼生。乾ききる前に、小さな生物へ寄生せよ'),400);
  },40);
  auInit();if(AU.ctx&&AU.ctx.state==='suspended')AU.ctx.resume();
}
function setPause(on){if(gameState!=='play')return;paused=on&&MATCH.mode==='solo';if(on)$('pauseRec').innerHTML=recordHtml()+(MATCH.mode==='solo'?'':'<br><span style="color:#ff9a8a">対戦中は時間が止まりません</span>');show('pause',on)}
function toTitle(){if(NET.role)leaveRoom();gameState='title';Object.assign(MATCH,{mode:'solo',kind:'race',phase:'play',winner:null});for(const s of['lobby','roomscr','result','over','pause','help','trait'])show(s,false);
  pendingTrait=null;modalOpen=false;resetPlayerState();initWorld();show('title',true);renderSlots();$('obj').innerHTML='';$('hint').innerHTML='';lastObj=lastHint=''}
function toLobby(){gameState='title';Object.assign(MATCH,{mode:'solo',kind:'race',phase:'play',winner:null});for(const s of['title','roomscr','result','over','pause','help','trait'])show(s,false);
  pendingTrait=null;modalOpen=false;resetPlayerState();initWorld();renderSlots();$('obj').innerHTML='';$('hint').innerHTML='';lastObj=lastHint='';
  show('lobby',true);renderLobby();netConnect()}
function saveName(){NET.name=cleanName($('nick').value);$('nick').value=NET.name;try{localStorage.setItem('pe_name',NET.name)}catch(e){}if(NET.api)NET.api.presence({nm:NET.name}).catch(()=>{});if(P)P.name=NET.name}
$('bStart').onclick=()=>{sfx('ui');startSolo('race')};
$('bOnline').onclick=()=>{sfx('ui');auInit();toLobby()};
$('bCreate').onclick=()=>{saveName();createRoom('race')};
$('bCreateCoop').onclick=()=>{saveName();createRoom('coop')};
$('bSoloCoop').onclick=()=>{sfx('ui');startSolo('coop')};
$('bLobbyBack').onclick=()=>{show('lobby',false);toTitle()};
$('bBegin').onclick=()=>{if(NET.role==='host')startHostMatch(NET.kind)};
$('bLeave').onclick=()=>{leaveRoom();show('roomscr',false);toLobby()};
const doJoinCode=()=>{const c=$('joinCode').value.toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,4);if(c.length<4){toast('4文字のルームコードを入れてください','');return}saveName();joinRoom(c)};
$('bJoinCode').onclick=doJoinCode;
$('joinCode').addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Enter')doJoinCode()});
$('bCopyInvite').onclick=()=>{const i=$('inviteUrl');i.select();try{navigator.clipboard.writeText(i.value).then(()=>toast('招待リンクをコピーしました',''),()=>document.execCommand('copy'))}catch(e){document.execCommand('copy')}};
$('nick').addEventListener('change',saveName);$('nick').addEventListener('keydown',e=>e.stopPropagation());
$('bHelp').onclick=()=>{show('title',false);show('help',true);$('help').dataset.back='title'};
$('bHelp2').onclick=()=>{show('pause',false);show('help',true);$('help').dataset.back='pause'};
$('bHelpBack').onclick=()=>{show('help',false);show($('help').dataset.back||'title',true)};
document.querySelectorAll('.bgmBtn').forEach(b=>b.onclick=()=>{auInit();setBgmLevel(MUS.lvl+1)});
try{const v=localStorage.getItem('pe_bgm');if(v!==null)MUS.lvl=+v}catch(e){}updateBgmButtons();
$('bMapClose').onclick=()=>setMap(false);
$('mini').addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();auInit();setMap(true)});
$('bResume').onclick=()=>setPause(false);
$('bQuit').onclick=()=>{paused=false;show('pause',false);toTitle()};
$('bQuit2').onclick=()=>{show('over',false);toTitle()};
$('bRetry').onclick=()=>{startSolo(MATCH.kind)};
$('bDiscard').onclick=()=>chooseTrait(-1);

// ================================================================
//  FIELD MAP — painted atlas of the (now 4x) world, fog of war,
//  minimap, full-screen map, predator sightings, co-op allies
// ================================================================
const MAPV={MS:480,img:null,fog:null,fg:null,FG:48,open:false,lastRev:null,revT:0,sight:new Map(),sightT:0,explored:0};
const MAP_COL={[B_GRASS]:[143,209,106],[B_FOREST]:[86,160,78],[B_DIRT]:[222,186,128],[B_ROCK]:[190,186,206],[B_SWAMP]:[128,146,100],[B_SAND]:[243,219,160]};
function buildMapImage(){
  const MS=MAPV.MS,sc=WORLD/MS,cv=mk(MS,MS),g=cv.getContext('2d'),id=g.createImageData(MS,MS),d=id.data;
  const land=b=>b!==B_WATER&&b!==B_SEA;
  for(let j=0;j<MS;j++)for(let i=0;i<MS;i++){const wx=(i+.5)*sc,wy=(j+.5)*sc,k=cellIdx(wx,wy),b=BIO[k];let c;
    if(b===B_SEA){const t=DPT[k];c=[lerp(96,28,t),lerp(196,92,t),lerp(232,172,t)]}
    else if(b===B_WATER){const t=DPT[k];c=[lerp(120,52,t),lerp(212,146,t),lerp(236,206,t)]}
    else{c=MAP_COL[b].slice();const e0=sampleGrid(EL,wx-sc,wy-sc),e1=sampleGrid(EL,wx+sc,wy+sc),sh=clamp((e0-e1)*9,-.16,.16);for(let q=0;q<3;q++)c[q]*=1+sh;
      if(b===B_FOREST&&hash2(i,j,9)>.7){c[0]*=.86;c[1]*=.9;c[2]*=.86}}
    // shorelines: dark ink on the water side, foam on the land side
    const nb=[biomeAt(wx+sc,wy),biomeAt(wx-sc,wy),biomeAt(wx,wy+sc),biomeAt(wx,wy-sc)];
    if(!land(b)&&nb.some(land)){c=[c[0]*.55,c[1]*.62,c[2]*.75]}
    else if(land(b)&&nb.some(x=>!land(x))){c=[lerp(c[0],255,.55),lerp(c[1],252,.55),lerp(c[2],240,.55)]}
    const n=(hash2(i,j,3)-.5)*10,p=(j*MS+i)*4;d[p]=clamp(c[0]+n,0,255);d[p+1]=clamp(c[1]+n,0,255);d[p+2]=clamp(c[2]+n,0,255);d[p+3]=255}
  g.putImageData(id,0,0);
  // decor icons
  for(const t of trees){const x=t.x/sc,y=t.y/sc;g.fillStyle='#2f6a34';g.beginPath();g.arc(x,y+.4,2.1,0,TAU);g.fill();g.fillStyle='#5fae54';g.beginPath();g.arc(x-.4,y-.3,1.4,0,TAU);g.fill()}
  for(const r of rocks){g.fillStyle='#8a86a0';g.beginPath();g.arc(r.x/sc,r.y/sc,1.3,0,TAU);g.fill()}
  // a soft grid every 1/8 of the world (A–H / 1–8)
  g.strokeStyle='rgba(60,50,30,.18)';g.lineWidth=1;for(let q=1;q<8;q++){const v=Math.round(q*MS/8)+.5;g.beginPath();g.moveTo(v,0);g.lineTo(v,MS);g.moveTo(0,v);g.lineTo(MS,v);g.stroke()}
  MAPV.img=cv;mapResetFog();
}
function mapResetFog(){
  const MS=MAPV.MS;if(!MAPV.fog)MAPV.fog=mk(MS,MS);const g=MAPV.fog.getContext('2d');g.globalCompositeOperation='source-over';
  g.fillStyle='#e8dcbf';g.fillRect(0,0,MS,MS);
  // parchment clouds
  for(let i=0;i<260;i++){const x=Math.random()*MS,y=Math.random()*MS,r=8+Math.random()*26;g.fillStyle=`rgba(${200+Math.random()*30|0},${185+Math.random()*25|0},${150+Math.random()*25|0},.18)`;g.beginPath();g.arc(x,y,r,0,TAU);g.fill()}
  g.strokeStyle='rgba(150,125,90,.25)';g.lineWidth=1;for(let i=0;i<40;i++){const x=Math.random()*MS,y=Math.random()*MS;g.beginPath();g.arc(x,y,4+Math.random()*7,Math.random()*TAU,Math.random()*TAU+2.5);g.stroke()}
  MAPV.fg=new Uint8Array(MAPV.FG*MAPV.FG);MAPV.explored=0;MAPV.lastRev=null;MAPV.sight.clear();
}
function mapReveal(x,y,R){
  const MS=MAPV.MS,sc=WORLD/MS,g=MAPV.fog.getContext('2d'),mx=x/sc,my=y/sc,mr=R/sc;
  g.globalCompositeOperation='destination-out';const gr=g.createRadialGradient(mx,my,mr*.55,mx,my,mr);gr.addColorStop(0,'rgba(0,0,0,1)');gr.addColorStop(1,'rgba(0,0,0,0)');
  g.fillStyle=gr;g.beginPath();g.arc(mx,my,mr,0,TAU);g.fill();g.globalCompositeOperation='source-over';
  const FG=MAPV.FG,cs=WORLD/FG,r2=(R*.8)**2;for(let j=Math.max(0,((y-R)/cs)|0);j<=Math.min(FG-1,((y+R)/cs)|0);j++)for(let i=Math.max(0,((x-R)/cs)|0);i<=Math.min(FG-1,((x+R)/cs)|0);i++){
    const dx=(i+.5)*cs-x,dy=(j+.5)*cs-y;if(dx*dx+dy*dy<r2&&!MAPV.fg[j*FG+i]){MAPV.fg[j*FG+i]=1;MAPV.explored++}}
}
const cellName=(x,y)=>'ABCDEFGH'[clamp((x/WORLD*8)|0,0,7)]+(clamp((y/WORLD*8)|0,0,7)+1);
const isRevealed=(x,y)=>{const FG=MAPV.FG,cs=WORLD/FG;return !!MAPV.fg[clamp((y/cs)|0,0,FG-1)*FG+clamp((x/cs)|0,0,FG-1)]};
function mapTick(dt){
  if(!MAPV.img||gameState!=='play')return;const c=P.c;
  if(c&&!c.dead){MAPV.revT-=dt;if(MAPV.revT<=0&&(!MAPV.lastRev||Math.hypot(c.x-MAPV.lastRev.x,c.y-MAPV.lastRev.y)>24)){MAPV.revT=.25;MAPV.lastRev={x:c.x,y:c.y};mapReveal(c.x,c.y,Math.max(GW,GH)*.55+130+(isFlying(c)?90:0))}
    // remember where bigger predators were spotted
    MAPV.sightT-=dt;if(MAPV.sightT<=0){MAPV.sightT=.5;const my=c.sp.tier;
      for(const o of creatures){if(o.dead||o===c||o.sp.tier<=my||o.key==='larva'||!onScreen(o.x,o.y,0))continue;MAPV.sight.set(o.key+':'+(o.id&65535),{x:o.x,y:o.y,key:o.key,t:worldT})}
      for(const [k,s] of MAPV.sight)if(worldT-s.t>150||SP[s.key].tier<=my)MAPV.sight.delete(k);
      if(MAPV.sight.size>40){const arr=[...MAPV.sight.entries()].sort((a,b)=>a[1].t-b[1].t);for(let i=0;i<arr.length-40;i++)MAPV.sight.delete(arr[i][0])}}}
}
function mapAllies(){if(MATCH.kind!=='coop')return[];
  if(MATCH.mode==='client')return(NET.pp||[]).filter(p=>p.length>=4&&p[1]!==P.name).map(p=>({x:p[2],y:p[3],name:p[1]}));
  return PLAYERS.filter(p=>p!==P&&p.c).map(p=>({x:p.c.x,y:p.c.y,name:p.name}))}

// draws the map into ctx; (vx,vy,vw) = world window, (W) = target px size
function drawMapView(g,W,vx,vy,vw,opt){
  const MS=MAPV.MS,sc=WORLD/MS,k=W/vw;g.save();g.imageSmoothingEnabled=true;
  g.fillStyle='#d9c9a3';g.fillRect(0,0,W,W);
  g.drawImage(MAPV.img,vx/sc,vy/sc,vw/sc,vw/sc,0,0,W,W);
  g.globalAlpha=.86;g.drawImage(MAPV.fog,vx/sc,vy/sc,vw/sc,vw/sc,0,0,W,W);g.globalAlpha=1;
  const T=(x,y)=>[(x-vx)*k,(y-vy)*k],t=performance.now()/1000;
  // mushrooms you have seen
  for(const m of mushrooms){if(!isRevealed(m.x,m.y))continue;const [x,y]=T(m.x,m.y);if(x<-8||y<-8||x>W+8||y>W+8)continue;g.fillStyle=m.ready?'#7fe6ff':'rgba(120,150,160,.6)';g.strokeStyle='#1b4a5a';g.lineWidth=1.2;
    g.beginPath();g.arc(x,y-1,opt.big?5:3.2,Math.PI,0);g.lineTo(x+(opt.big?2:1.3),y+(opt.big?4:2.6));g.lineTo(x-(opt.big?2:1.3),y+(opt.big?4:2.6));g.closePath();g.fill();g.stroke()}
  // predator sightings: tiny portraits; usurpable ones get a gold ring, the apex a red one
  const my=P.c?P.c.sp.tier:0;
  for(const s of MAPV.sight.values()){const [x,y]=T(s.x,s.y);if(x<-10||y<-10||x>W+10||y>W+10)continue;const age=(worldT-s.t)/150,tier=SP[s.key].tier,can=tier===my+1||(my<=1&&tier===2);
    const r=opt.big?9:6;g.globalAlpha=1-age*.65;g.fillStyle='rgba(255,250,236,.9)';g.beginPath();g.arc(x,y,r,0,TAU);g.fill();g.lineWidth=opt.big?2.4:1.6;g.strokeStyle=s.key==='bear'?'#e04040':can?'#f2b52a':'#6b6b7a';g.stroke();
    const ic=R3.icons[s.key];if(ic)g.drawImage(ic,x-r*1.05,y-r*1.05,r*2.1,r*2.1);g.globalAlpha=1}
  // the cyst you left behind
  if(P.cyst){const [x,y]=T(P.cyst.x,P.cyst.y);g.fillStyle='#b98aff';g.strokeStyle='#3a1a6a';g.lineWidth=1.5;g.beginPath();g.arc(x,y,opt.big?5:3.5,0,TAU);g.fill();g.stroke()}
  // co-op allies
  g.font=`800 ${opt.big?12:9}px 'M PLUS Rounded 1c', sans-serif`;g.textAlign='center';
  for(const a of mapAllies()){const [x,y]=T(a.x,a.y);g.fillStyle='#7ff08a';g.strokeStyle='#14361a';g.lineWidth=1.6;g.beginPath();g.arc(x,y,opt.big?5.5:3.8,0,TAU);g.fill();g.stroke();
    if(opt.big){g.lineWidth=3;g.strokeStyle='rgba(20,40,20,.85)';g.strokeText(a.name,x,y-9);g.fillStyle='#d4ffd4';g.fillText(a.name,x,y-9)}}
  // you
  const c=P.c;if(c&&!c.dead){const [x,y]=T(c.x,c.y),pu=.5+.5*Math.sin(t*5),R=opt.big?9:6.5;
    {const a=CAM3.yaw,L=opt.big?30:24;const gr=g.createRadialGradient(x,y,2,x,y,L);gr.addColorStop(0,'rgba(255,255,255,.5)');gr.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=gr;g.beginPath();g.moveTo(x,y);g.arc(x,y,L,a-.48,a+.48);g.closePath();g.fill()}
    g.strokeStyle=`rgba(255,255,255,${.35+.4*pu})`;g.lineWidth=2;g.beginPath();g.arc(x,y,R+3+pu*3,0,TAU);g.stroke();
    g.save();g.translate(x,y);g.rotate(c.ang);g.fillStyle='#ffd04a';g.strokeStyle='#3a2408';g.lineWidth=1.6;g.beginPath();g.moveTo(R,0);g.lineTo(-R*.7,R*.68);g.lineTo(-R*.35,0);g.lineTo(-R*.7,-R*.68);g.closePath();g.fill();g.stroke();g.restore()}
  g.restore();
}
// ---- minimap (HUD) ---------------------------------------------------
function renderMinimap(){
  const el=$('mini');if(!el)return;const show=gameState==='play'&&!!MAPV.img&&!MAPV.open;el.style.display=show?'block':'none';$('miniLbl').style.display=show?'block':'none';if(!show)return;
  const css=el.clientWidth||140,dpr=Math.min(2,devicePixelRatio||1),W=Math.round(css*dpr);if(el.width!==W){el.width=W;el.height=W}
  const g=el.getContext('2d'),c=P.c,cx=c?c.x:cam.x+GW/2,cy=c?c.y:cam.y+GH/2,vw=1300;
  drawMapView(g,W,clamp(cx-vw/2,0,WORLD-vw),clamp(cy-vw/2,0,WORLD-vw),vw,{big:false,dpr});
  const lbl=`${cellName(cx,cy)}　探索 ${Math.round(MAPV.explored/(MAPV.FG*MAPV.FG)*100)}%`;if($('miniLbl').textContent!==lbl)$('miniLbl').textContent=lbl;
}
// ---- full map --------------------------------------------------------
function setMap(on){if(gameState!=='play'||modalOpen)return;if(on&&$('pause').classList.contains('on'))return;MAPV.open=on;show('mapv',on);if(on)renderFullMap();sfx('ui')}
function renderFullMap(){
  if(!MAPV.open)return;const el=$('mapc'),box=el.parentElement,css=Math.max(180,Math.min(box.clientWidth,innerHeight-(innerWidth<700?250:210))),dpr=Math.min(2,devicePixelRatio||1),W=Math.round(css*dpr);
  if(el.width!==W){el.width=W;el.height=W;el.style.width=css+'px';el.style.height=css+'px'}
  const g=el.getContext('2d');drawMapView(g,W,0,0,WORLD,{big:true});
  // border coordinates
  g.font=`800 ${Math.round(11*dpr)}px 'M PLUS Rounded 1c', sans-serif`;g.fillStyle='rgba(70,50,20,.75)';g.textAlign='center';
  for(let q=0;q<8;q++){g.fillText('ABCDEFGH'[q],(q+.5)*W/8,13*dpr);g.fillText(String(q+1),8*dpr,(q+.5)*W/8+4*dpr)}
  const c=P.c,ex=Math.round(MAPV.explored/(MAPV.FG*MAPV.FG)*100);
  const lbl=`現在地 ${c?cellName(c.x,c.y):'—'}　／　探索率 ${ex}%　／　目撃した上位種 ${MAPV.sight.size}`;if($('mapInfo').textContent!==lbl)$('mapInfo').textContent=lbl;
}

// ================================================================
//  MAIN LOOP
// ================================================================
let lastT=performance.now(),attractA=0,lastScr='';const PERF={u:0,r:0};
function frame(now){
  requestAnimationFrame(frame);
  const rawDt=(now-lastT)/1000;let dt=Math.min(.05,rawDt);lastT=now;
  pollInput();
  const scrNow=([...document.querySelectorAll('.screen.on')].pop()||{}).id||'';if(scrNow!==lastScr){lastScr=scrNow;navIdx=0}
  menuNav();
  if(IN.hudP&&gameState==='play')hudOn=!hudOn;
  if(pendingTrait&&IN.slotP>=0){chooseTrait(IN.slotP===9||IN.slotP>=P.slots.length?-1:IN.slotP);IN.slotP=-1}
  if(MAPV.open&&(gameState!=='play'||IN.pauseP||IN.mapP)){setMap(false);IN.pauseP=false;IN.mapP=false;if(gameState!=='play'){MAPV.open=false;show('mapv',false)}}
  if(IN.mapP&&gameState==='play'&&!modalOpen)setMap(true);
  if(IN.pauseP&&gameState==='play'&&!modalOpen)setPause(!$('pause').classList.contains('on'));
  if(slowT>0){slowT-=dt;dt*=.35}
  const _t0=performance.now();
  if(MATCH.mode==='client'){clientNet(dt);if(gameState==='play')clientWorld(dt);else fxWorld(dt)}
  else{
    const sim=gameState==='title'||(gameState==='play'&&((!paused&&!modalOpen&&!MAPV.open)||MATCH.mode!=='solo'))||gameState==='over';
    if(sim)updateWorld(dt);
    if(NET.role==='host')hostNet(dt);
    else if(NET.role==='cli')clientNet(dt);
  }
  if(gameState==='play')localFeel(dt);
  PERF.u=PERF.u*.95+(performance.now()-_t0)*.05;
  r3Camera(dt);r3Adapt(rawDt);
  const _t1=performance.now();render();PERF.r=PERF.r*.95+(performance.now()-_t1)*.05;
  updateHUD(dt);audioTick(dt);
  if(!(MATCH.mode==='solo'&&MAPV.open))mapTick(dt);renderMinimap();renderFullMap();
}

// ================================================================
//  BOOT
// ================================================================
window.addEventListener('resize',resize);
function boot(){
  try{r3Init()}catch(e){console.error(e);$('loading').textContent='この端末では3D表示（WebGL2）を利用できません';return}
  resize();
  try{NET.name=cleanName(localStorage.getItem('pe_name')||'')}catch(e){}
  if(!NET.name||NET.name==='名無し')NET.name='寄生体'+Math.floor(Math.random()*900+100);
  $('nick').value=NET.name;
  buildWorld((Math.random()*1e9)|0);resetPlayerState();initWorld();
  gameState='title';$('loading').style.display='none';
  requestAnimationFrame(t=>{lastT=t;frame(t)});
  netConnect();
  // invite link: #join=CODE opens the lobby and joins that room
  const jm=/join=([a-z0-9]{4})/i.exec(location.hash);
  if(jm){try{history.replaceState(null,'',location.href.split('#')[0])}catch(e){}setTimeout(()=>{auInit();toLobby();$('joinCode').value=jm[1].toUpperCase();joinRoom(jm[1].toLowerCase())},300)}
}
setTimeout(boot,30);
