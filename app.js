import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const UNIT = { w: 2.4, d: 3.6, h: 2.8, area: 8.64 };
const GRID = .6;
const colors = { ivory: 0xe3dfd6, concrete: 0xa6a59f, charcoal: 0x363a38, timber: 0xa47f57 };
const typeNames = { living: '通用空間盒', service: '設備核心盒', terrace: '半戶外盒' };
const initial = [
  {x:-2.4,z:0,floor:0,rotation:0,type:'living',material:'ivory'},
  {x:0,z:0,floor:0,rotation:0,type:'living',material:'ivory'},
  {x:2.4,z:.6,floor:0,rotation:0,type:'service',material:'concrete'},
  {x:0,z:-3.6,floor:0,rotation:1,type:'terrace',material:'timber'}
];

let canvas = document.querySelector('#scene');
const viewport = document.querySelector('#viewport');
let renderer=null, fallbackContext=null;
try{
  renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false});
  renderer.setPixelRatio(Math.min(devicePixelRatio,window.innerWidth<700?1.5:2));
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.05;
}catch(error){
  const replacement=document.createElement('canvas');
  replacement.id='scene';
  replacement.setAttribute('aria-label','模組建築簡化預覽');
  canvas.replaceWith(replacement);
  canvas=replacement;
  fallbackContext=canvas.getContext('2d');
  document.documentElement.classList.add('fallback-renderer');
  const badge=document.createElement('div');
  badge.className='fallback-badge';
  badge.textContent='相容模式 · 簡化 3D 預覽';
  viewport.appendChild(badge);
}
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xd8dbd7);
scene.fog = new THREE.Fog(0xd8dbd7,24,52);
const camera = new THREE.PerspectiveCamera(38,1,.1,100);
camera.position.set(11,10,14);
const controls = new OrbitControls(camera,canvas);
controls.enableDamping=true; controls.target.set(0,1.2,0); controls.maxPolarAngle=Math.PI*.48; controls.minDistance=7; controls.maxDistance=34;

scene.add(new THREE.HemisphereLight(0xf7f4e9,0x777d78,2.1));
const sun = new THREE.DirectionalLight(0xffe1b6,3.2); sun.position.set(-8,14,8); sun.castShadow=true; sun.shadow.mapSize.set(2048,2048); sun.shadow.camera.left=-18; sun.shadow.camera.right=18; sun.shadow.camera.top=18; sun.shadow.camera.bottom=-18; scene.add(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(60,60),new THREE.MeshStandardMaterial({color:0xc9ccc6,roughness:.94}));
ground.rotation.x=-Math.PI/2; ground.receiveShadow=true; scene.add(ground);
const grid = new THREE.GridHelper(30,50,0x929791,0xb8bbb5); grid.position.y=.008; grid.material.opacity=.38; grid.material.transparent=true; scene.add(grid);

let modules=[], selected=null, currentFloor=0, drag=null, history=[], historyIndex=-1;
const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0,1,0),0), hit = new THREE.Vector3();

function panelMaterial(hex){ return new THREE.MeshStandardMaterial({color:hex,roughness:.8,metalness:.02}); }
function makeModule(data,index){
  const group=new THREE.Group(); group.userData={...data,id:data.id||`M-${String(index+1).padStart(2,'0')}`};
  const rotated=data.rotation%2===1, w=rotated?UNIT.d:UNIT.w, d=rotated?UNIT.w:UNIT.d;
  const mat=panelMaterial(colors[data.material]);
  const edgeMat=new THREE.MeshStandardMaterial({color:0x262a28,roughness:.55,metalness:.35});
  const glassMat=new THREE.MeshPhysicalMaterial({color:0x9db0b2,roughness:.08,transmission:.45,transparent:true,opacity:.72});
  const slab=(x,y,z,sx,sy,sz,m=mat)=>{const o=new THREE.Mesh(new THREE.BoxGeometry(sx,sy,sz),m);o.position.set(x,y,z);o.castShadow=o.receiveShadow=true;group.add(o);return o};
  if(data.type==='terrace'){
    slab(0,.09,0,w,.18,d,panelMaterial(colors.timber));
    slab(0,UNIT.h-.08,0,w,.16,d,panelMaterial(0xdfd8c9));
    for(const x of [-w/2+.055,w/2-.055]) for(const z of [-d/2+.055,d/2-.055]) slab(x,UNIT.h/2,z,.11,UNIT.h,.11,edgeMat);
  }else{
    slab(0,.1,0,w,.2,d,panelMaterial(0xbab8b0)); slab(0,UNIT.h-.1,0,w,.2,d,mat);
    slab(-w/2+.09,UNIT.h/2,0,.18,UNIT.h,d,mat);
    slab(w/2-.09,UNIT.h/2,0,.18,UNIT.h,d,mat);
    slab(0,UNIT.h/2,-d/2+.09,w,UNIT.h,.18,mat);
    if(data.type==='service'){
      slab(0,UNIT.h/2,d/2-.09,w,UNIT.h,.18,mat);
      slab(0,UNIT.h/2,d/2+.015,w*.19,UNIT.h*.72,.035,glassMat);
    }else{
      slab(0,UNIT.h*.67,d/2-.065,w,.2,.13,mat);
      slab(0,UNIT.h*.39,d/2-.01,w-.28,UNIT.h*.62,.06,glassMat);
      slab(0,UNIT.h*.39,d/2+.03,.035,UNIT.h*.62,.09,edgeMat);
    }
  }
  const outline=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w,UNIT.h,d)),new THREE.LineBasicMaterial({color:0x474b48,transparent:true,opacity:.38}));outline.position.y=UNIT.h/2;group.add(outline);
  group.position.set(data.x,data.floor*UNIT.h,data.z); group.traverse(o=>{if(o!==group)o.userData.module=group}); scene.add(group); return group;
}
function serialize(){return modules.map(m=>({id:m.userData.id,type:m.userData.type,material:m.userData.material,rotation:m.userData.rotation,x:m.position.x,z:m.position.z,floor:Math.round(m.position.y/UNIT.h)}));}
function rebuild(data,record=false){modules.forEach(m=>scene.remove(m));modules=data.map(makeModule);selected=modules[0]||null;updateSelection();updateStats();if(record)saveHistory();}
function saveHistory(){const state=JSON.stringify(serialize());history=history.slice(0,historyIndex+1);history.push(state);historyIndex=history.length-1;localStorage.setItem('modu-layout',state);}
function snap(v){return Math.round(v/GRID)*GRID}
function updateSelection(){
  modules.forEach(m=>{const line=m.children[m.children.length-1]; if(line?.isLineSegments)line.material.color.set(m===selected?0xd45531:0x474b48)});
  const p=document.querySelector('#selectionPanel');p.style.opacity=selected?1:.45;
  if(!selected)return;
  document.querySelector('#selectedId').textContent=selected.userData.id;document.querySelector('#typeSelect').value=selected.userData.type;
  document.querySelector('#posX').value=selected.position.x.toFixed(1);document.querySelector('#posZ').value=selected.position.z.toFixed(1);
  document.querySelectorAll('.swatch').forEach(s=>s.classList.toggle('active',s.dataset.material===selected.userData.material));
}
function bounds(m){const r=m.userData.rotation%2===1;return{x:m.position.x,z:m.position.z,w:r?UNIT.d:UNIT.w,d:r?UNIT.w:UNIT.d,f:Math.round(m.position.y/UNIT.h)}}
function overlap(a,b){const A=bounds(a),B=bounds(b);return A.f===B.f&&Math.abs(A.x-B.x)<(A.w+B.w)/2-.04&&Math.abs(A.z-B.z)<(A.d+B.d)/2-.04}
function collides(module){return modules.some(other=>other!==module&&overlap(module,other))}
function findFreePosition(floor=0,rotation=0){
  if(!modules.some(m=>Math.round(m.position.y/UNIT.h)===floor))return{x:0,z:0};
  for(let ring=1;ring<=12;ring++){
    const candidates=[];
    for(let ix=-ring;ix<=ring;ix++)for(let iz=-ring;iz<=ring;iz++){
      if(Math.max(Math.abs(ix),Math.abs(iz))===ring)candidates.push({x:snap(ix*UNIT.w),z:snap(iz*UNIT.w)});
    }
    for(const p of candidates){
      const probe={position:new THREE.Vector3(p.x,floor*UNIT.h,p.z),userData:{rotation}};
      if(!modules.some(m=>overlap(probe,m)))return p;
    }
  }
  return{x:snap((modules.length+1)*UNIT.w),z:0};
}
let toastTimer;
function notify(message){const el=document.querySelector('#toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),1800)}
function updateStats(){
  document.querySelector('#moduleCount').textContent=modules.length;document.querySelector('#totalArea').textContent=(modules.length*UNIT.area).toFixed(1);
  document.querySelector('#floorCount').textContent=modules.length?Math.max(...modules.map(m=>Math.round(m.position.y/UNIT.h)))+1:0;
  let bad=false;for(let i=0;i<modules.length;i++)for(let j=i+1;j<modules.length;j++)if(overlap(modules[i],modules[j]))bad=true;
  const row=document.querySelector('#overlapRule');row.classList.toggle('warn',bad);row.classList.toggle('ok',!bad);row.lastChild.textContent=bad?' 發現模組重疊':' 無空間重疊';document.querySelector('#ruleState').textContent=bad?'需調整':'可組裝';
}
function addModule(type){const position=findFreePosition(currentFloor,0);const data={...position,floor:currentFloor,rotation:0,type,material:type==='terrace'?'timber':type==='service'?'concrete':'ivory',id:`M-${String(Date.now()).slice(-4)}`};selected=makeModule(data,modules.length);modules.push(selected);updateSelection();updateStats();saveHistory();notify(`${typeNames[type]}已建立於最近空位`);}
function replaceSelected(patch){if(!selected)return;const data=serialize();const i=modules.indexOf(selected);data[i]={...data[i],...patch};rebuild(data);selected=modules[i];updateSelection();saveHistory();}
function setPointer(e){const r=canvas.getBoundingClientRect();pointer.x=((e.clientX-r.left)/r.width)*2-1;pointer.y=-((e.clientY-r.top)/r.height)*2+1;raycaster.setFromCamera(pointer,camera)}
canvas.addEventListener('pointerdown',e=>{setPointer(e);const hits=raycaster.intersectObjects(modules,true);if(hits.length){selected=hits[0].object.userData.module;updateSelection();plane.constant=-selected.position.y;raycaster.ray.intersectPlane(plane,hit);drag={dx:selected.position.x-hit.x,dz:selected.position.z-hit.z,startX:selected.position.x,startZ:selected.position.z};controls.enabled=false;canvas.setPointerCapture(e.pointerId)}});
canvas.addEventListener('pointermove',e=>{if(!drag||!selected)return;setPointer(e);if(raycaster.ray.intersectPlane(plane,hit)){selected.position.x=snap(hit.x+drag.dx);selected.position.z=snap(hit.z+drag.dz);updateSelection();updateStats()}});
canvas.addEventListener('pointerup',()=>{if(drag){if(collides(selected)){selected.position.x=drag.startX;selected.position.z=drag.startZ;notify('此位置與其他模組重疊，已回到原位')}drag=null;controls.enabled=true;updateSelection();updateStats();saveHistory()}});

document.querySelectorAll('.add-module').forEach(b=>b.addEventListener('click',()=>addModule(b.closest('.module-card').dataset.type)));
document.querySelector('#rotateBtn').onclick=()=>replaceSelected({rotation:(selected.userData.rotation+1)%4});
document.querySelector('#duplicateBtn').onclick=()=>{if(!selected)return;const floor=Math.round(selected.position.y/UNIT.h),position=findFreePosition(floor,selected.userData.rotation);const d={...selected.userData,...position,floor,id:`M-${String(Date.now()).slice(-4)}`};selected=makeModule(d,modules.length);modules.push(selected);updateSelection();updateStats();saveHistory();notify('複製模組已放入最近空位')};
document.querySelector('#deleteBtn').onclick=()=>{if(!selected)return;scene.remove(selected);modules.splice(modules.indexOf(selected),1);selected=modules[0]||null;updateSelection();updateStats();saveHistory()};
document.querySelector('#typeSelect').onchange=e=>replaceSelected({type:e.target.value});
document.querySelectorAll('.swatch').forEach(s=>s.onclick=()=>replaceSelected({material:s.dataset.material}));
for(const [id,key] of [['posX','x'],['posZ','z']])document.querySelector('#'+id).onchange=e=>{if(!selected)return;selected.position[key]=snap(+e.target.value);updateSelection();updateStats();saveHistory()};
document.querySelector('#floorUp').onclick=()=>{currentFloor=Math.min(4,currentFloor+1);document.querySelector('#floorLabel').textContent=`${currentFloor+1}F`};
document.querySelector('#floorDown').onclick=()=>{currentFloor=Math.max(0,currentFloor-1);document.querySelector('#floorLabel').textContent=`${currentFloor+1}F`};
document.querySelector('#resetBtn').onclick=()=>{localStorage.removeItem('modu-layout');rebuild(initial,true)};
document.querySelector('#undoBtn').onclick=()=>{if(historyIndex>0){historyIndex--;rebuild(JSON.parse(history[historyIndex]))}};
document.querySelector('#redoBtn').onclick=()=>{if(historyIndex<history.length-1){historyIndex++;rebuild(JSON.parse(history[historyIndex]))}};
document.querySelector('#exportBtn').onclick=()=>{const blob=new Blob([JSON.stringify({system:'MODU-2400x3600',unit:UNIT,modules:serialize()},null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='modu-layout.json';a.click();URL.revokeObjectURL(a.href)};
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{document.querySelectorAll('[data-view]').forEach(x=>x.classList.remove('active'));b.classList.add('active');const v=b.dataset.view;if(v==='top')camera.position.set(0,22,.01);else if(v==='front')camera.position.set(0,5,18);else camera.position.set(11,10,14);controls.target.set(0,1.2,0);controls.update()});

function drawFallback(){
  if(!fallbackContext)return;
  const w=viewport.clientWidth,h=viewport.clientHeight,ctx=fallbackContext;
  ctx.clearRect(0,0,w,h);ctx.fillStyle='#d8dbd7';ctx.fillRect(0,0,w,h);
  const scale=Math.min(w,h)/15,cx=w*.5,cy=h*.57;
  const iso=(x,y,z)=>({x:cx+(x-z)*scale*.72,y:cy+(x+z)*scale*.32-y*scale*.78});
  ctx.strokeStyle='rgba(100,106,101,.22)';ctx.lineWidth=1;
  for(let i=-12;i<=12;i+=2){
    let a=iso(i,0,-12),b=iso(i,0,12);ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
    a=iso(-12,0,i);b=iso(12,0,i);ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
  }
  const palette={ivory:'#e3dfd6',concrete:'#a6a59f',charcoal:'#363a38',timber:'#a47f57'};
  const shade=(hex,amount)=>{const n=parseInt(hex.slice(1),16),r=Math.max(0,Math.min(255,(n>>16)+amount)),g=Math.max(0,Math.min(255,((n>>8)&255)+amount)),b=Math.max(0,Math.min(255,(n&255)+amount));return`rgb(${r},${g},${b})`};
  [...modules].sort((a,b)=>(a.position.x+a.position.z+a.position.y)-(b.position.x+b.position.z+b.position.y)).forEach(m=>{
    const r=m.userData.rotation%2===1,mw=r?UNIT.d:UNIT.w,md=r?UNIT.w:UNIT.d;
    const x=m.position.x,z=m.position.z,y=m.position.y,top=y+UNIT.h;
    const base=[[x-mw/2,z-md/2],[x+mw/2,z-md/2],[x+mw/2,z+md/2],[x-mw/2,z+md/2]];
    const B=base.map(p=>iso(p[0],y,p[1])),T=base.map(p=>iso(p[0],top,p[1]));
    const face=(points,fill)=>{ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.fillStyle=fill;ctx.fill();ctx.strokeStyle=m===selected?'#d45531':'rgba(50,54,51,.5)';ctx.lineWidth=m===selected?2.5:1;ctx.stroke()};
    const color=palette[m.userData.material]||palette.ivory;
    face([B[1],B[2],T[2],T[1]],shade(color,-28));
    face([B[2],B[3],T[3],T[2]],shade(color,-14));
    face([T[0],T[1],T[2],T[3]],shade(color,12));
    if(m.userData.type==='living')face([T[2],T[3],iso(x-mw*.33,top*.58,z+md/2),iso(x+mw*.33,top*.58,z+md/2)],'rgba(142,166,169,.78)');
    ctx.fillStyle='#343834';ctx.font='11px "Noto Sans TC", sans-serif';const label=iso(x,top+.22,z);ctx.textAlign='center';ctx.fillText(m.userData.id,label.x,label.y);
  });
}
function resize(){const w=viewport.clientWidth,h=viewport.clientHeight;camera.aspect=w/h;camera.updateProjectionMatrix();if(renderer)renderer.setSize(w,h,false);else{const ratio=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(w*ratio);canvas.height=Math.round(h*ratio);canvas.style.width=`${w}px`;canvas.style.height=`${h}px`;fallbackContext.setTransform(ratio,0,0,ratio,0,0);drawFallback()}}
window.addEventListener('resize',resize);resize();
const stored=localStorage.getItem('modu-layout');rebuild(stored?JSON.parse(stored):initial);saveHistory();
document.querySelector('#loading').classList.add('done');
if(renderer)renderer.setAnimationLoop(()=>{controls.update();renderer.render(scene,camera)});
else(function fallbackLoop(){controls.update();drawFallback();requestAnimationFrame(fallbackLoop)})();
