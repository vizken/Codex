import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const UNIT = { w: 2.4, d: 3.6, h: 2.8, area: 8.64 };
const GRID = .6;
const colors = { ivory: 0xe3dfd6, concrete: 0xa6a59f, charcoal: 0x363a38, timber: 0xa47f57 };
const typeNames = { living: '通用空間盒', service: '設備核心盒', terrace: '半戶外盒' };
const wallNames = { front:'前牆', back:'後牆', left:'左牆', right:'右牆' };
const openingTypes = {
  door:{label:'單扇門',w:.9,h:2.1,sill:0,kind:'door'},
  window:{label:'標準窗',w:1.2,h:1.2,sill:.9,kind:'window'},
  wide:{label:'橫向窗',w:1.8,h:.6,sill:1.1,kind:'window'},
  full:{label:'落地窗',w:1.8,h:2.4,sill:.2,kind:'window'},
  passage:{label:'連通開口',w:1.8,h:2.4,sill:0,kind:'passage'}
};
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
  const openings=Array.isArray(data.openings)?data.openings.map(o=>({...o})):[];
  const group=new THREE.Group(); group.userData={...data,openings,id:data.id||`M-${String(index+1).padStart(2,'0')}`};
  const w=UNIT.w,d=UNIT.d;
  const mat=panelMaterial(colors[data.material]);
  const edgeMat=new THREE.MeshStandardMaterial({color:0x262a28,roughness:.55,metalness:.35});
  const glassMat=new THREE.MeshPhysicalMaterial({color:0x91aeb2,roughness:.12,transmission:.55,transparent:true,opacity:.68});
  const doorMat=new THREE.MeshStandardMaterial({color:0x8d7256,roughness:.72,metalness:.02});
  const slab=(x,y,z,sx,sy,sz,m=mat)=>{const o=new THREE.Mesh(new THREE.BoxGeometry(sx,sy,sz),m);o.position.set(x,y,z);o.castShadow=o.receiveShadow=true;group.add(o);return o};
  const wallPart=(wall,start,end,bottom,top)=>{
    const length=end-start,height=top-bottom;if(length<=.01||height<=.01)return;
    const center=(start+end)/2,y=(bottom+top)/2;
    if(wall==='front'||wall==='back')slab(center,y,wall==='front'?d/2-.09:-d/2+.09,length,height,.18,mat);
    else slab(wall==='right'?w/2-.09:-w/2+.09,y,center,.18,height,length,mat);
  };
  const addFrame=(wall,opening,def)=>{
    const plane=wall==='front'?d/2+.015:wall==='back'?-d/2-.015:wall==='right'?w/2+.015:-w/2-.015;
    const depth=.055,centerY=def.sill+def.h/2;
    if(def.kind==='door'){
      if(wall==='front'||wall==='back')slab(opening.offset,centerY,plane,def.w-.08,def.h-.04,depth,doorMat);
      else slab(plane,centerY,opening.offset,depth,def.h-.04,def.w-.08,doorMat);
    }else if(def.kind==='window'){
      if(wall==='front'||wall==='back'){
        slab(opening.offset,centerY,plane,def.w-.1,def.h-.1,.035,glassMat);
        for(const x of [opening.offset-def.w/2,opening.offset+def.w/2])slab(x,centerY,plane,.055,def.h+.05,depth,edgeMat);
        for(const y of [def.sill,def.sill+def.h])slab(opening.offset,y,plane,def.w+.05,.055,depth,edgeMat);
      }else{
        slab(plane,centerY,opening.offset,.035,def.h-.1,def.w-.1,glassMat);
        for(const z of [opening.offset-def.w/2,opening.offset+def.w/2])slab(plane,centerY,z,depth,def.h+.05,.055,edgeMat);
        for(const y of [def.sill,def.sill+def.h])slab(plane,y,opening.offset,depth,.055,def.w+.05,edgeMat);
      }
    }else{
      if(wall==='front'||wall==='back'){
        for(const x of [opening.offset-def.w/2,opening.offset+def.w/2])slab(x,centerY,plane,.05,def.h,depth,edgeMat);
        slab(opening.offset,def.h,plane,def.w+.05,.05,depth,edgeMat);
      }else{
        for(const z of [opening.offset-def.w/2,opening.offset+def.w/2])slab(plane,centerY,z,depth,def.h,.05,edgeMat);
        slab(plane,def.h,opening.offset,depth,.05,def.w+.05,edgeMat);
      }
    }
  };
  const buildWall=(wall,length)=>{
    const wallOpenings=openings.filter(o=>o.wall===wall&&openingTypes[o.type]).map(o=>({opening:o,def:openingTypes[o.type]}));
    if(!wallOpenings.length){wallPart(wall,-length/2,length/2,0,UNIT.h);return}
    const points=[-length/2,length/2];
    wallOpenings.forEach(({opening,def})=>{points.push(Math.max(-length/2,opening.offset-def.w/2),Math.min(length/2,opening.offset+def.w/2))});
    [...new Set(points)].sort((a,b)=>a-b).forEach((start,i,list)=>{
      const end=list[i+1];if(end===undefined)return;const middle=(start+end)/2;
      const hit=wallOpenings.find(({opening,def})=>middle>opening.offset-def.w/2+.001&&middle<opening.offset+def.w/2-.001);
      if(!hit)wallPart(wall,start,end,0,UNIT.h);
      else{
        if(hit.def.sill>0)wallPart(wall,start,end,0,hit.def.sill);
        if(hit.def.sill+hit.def.h<UNIT.h)wallPart(wall,start,end,hit.def.sill+hit.def.h,UNIT.h);
      }
    });
    wallOpenings.forEach(({opening,def})=>addFrame(wall,opening,def));
  };
  if(data.type==='terrace'){
    slab(0,.09,0,w,.18,d,panelMaterial(colors.timber));
    slab(0,UNIT.h-.08,0,w,.16,d,panelMaterial(0xdfd8c9));
    for(const x of [-w/2+.055,w/2-.055]) for(const z of [-d/2+.055,d/2-.055]) slab(x,UNIT.h/2,z,.11,UNIT.h,.11,edgeMat);
  }else{
    slab(0,.1,0,w,.2,d,panelMaterial(0xbab8b0)); slab(0,UNIT.h-.1,0,w,.2,d,mat);
    buildWall('front',w);buildWall('back',w);buildWall('left',d);buildWall('right',d);
  }
  const outline=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w,UNIT.h,d)),new THREE.LineBasicMaterial({color:0x474b48,transparent:true,opacity:.38}));outline.position.y=UNIT.h/2;group.add(outline);
  group.position.set(data.x,data.floor*UNIT.h,data.z);group.rotation.y=((data.rotation||0)%4)*Math.PI/2;group.traverse(o=>{if(o!==group)o.userData.module=group});scene.add(group);return group;
}
function serialize(){return modules.map(m=>({id:m.userData.id,type:m.userData.type,material:m.userData.material,rotation:m.userData.rotation,x:m.position.x,z:m.position.z,floor:Math.round(m.position.y/UNIT.h),openings:(m.userData.openings||[]).map(o=>({...o}))}));}
function rebuild(data,record=false){modules.forEach(m=>scene.remove(m));modules=data.map(makeModule);selected=modules[0]||null;updateSelection();updateStats();if(record)saveHistory();}
function saveHistory(){const state=JSON.stringify(serialize());history=history.slice(0,historyIndex+1);history.push(state);historyIndex=history.length-1;localStorage.setItem('modu-layout',state);}
function snap(v){return Math.round(v/GRID)*GRID}
function updateSelection(){
  modules.forEach(m=>{const line=m.children[m.children.length-1]; if(line?.isLineSegments)line.material.color.set(m===selected?0xd45531:0x474b48)});
  const p=document.querySelector('#selectionPanel');p.style.opacity=selected?1:.45;
  if(!selected){updateOpeningPanel();return}
  document.querySelector('#selectedId').textContent=selected.userData.id;document.querySelector('#typeSelect').value=selected.userData.type;
  document.querySelector('#posX').value=selected.position.x.toFixed(1);document.querySelector('#posZ').value=selected.position.z.toFixed(1);
  document.querySelectorAll('.swatch').forEach(s=>s.classList.toggle('active',s.dataset.material===selected.userData.material));
  updateOpeningPanel();
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
function openingWallLength(wall){return wall==='front'||wall==='back'?UNIT.w:UNIT.d}
function openingLimit(wall,type){const def=openingTypes[type],raw=(openingWallLength(wall)-def.w)/2-.3;return Math.max(0,Math.floor((raw+.001)/.3)*.3)}
function openingFits(openings,wall,type,offset,ignoreId=null){
  const def=openingTypes[type],limit=openingLimit(wall,type);
  if(!def||Math.abs(offset)>limit+.01)return false;
  return !openings.some(o=>o.id!==ignoreId&&o.wall===wall&&openingTypes[o.type]&&Math.abs(o.offset-offset)<(openingTypes[o.type].w+def.w)/2-.01);
}
function updateOpeningPanel(){
  const editor=document.querySelector('#openingEditor'),list=document.querySelector('#openingList'),addButton=document.querySelector('#addOpeningBtn');
  if(!editor||!list||!addButton)return;
  const usable=!!selected&&selected.userData.type!=='terrace',openings=usable?(selected.userData.openings||[]):[];
  editor.classList.toggle('disabled',!usable);addButton.disabled=!usable;
  document.querySelector('#openingCount').textContent=`${openings.length} 個`;
  list.replaceChildren();
  if(!usable){const empty=document.createElement('div');empty.className='opening-empty';empty.textContent=selected?'半戶外盒不配置門窗':'請先選取模組';list.appendChild(empty);return}
  if(!openings.length){const empty=document.createElement('div');empty.className='opening-empty';empty.textContent='目前是完整牆面';list.appendChild(empty);return}
  openings.forEach(opening=>{
    const def=openingTypes[opening.type],item=document.createElement('div');item.className='opening-item';
    const info=document.createElement('div'),title=document.createElement('strong'),meta=document.createElement('small');
    title.textContent=def.label;meta.textContent=`${wallNames[opening.wall]} · 位置 ${opening.offset.toFixed(1)} m`;info.append(title,meta);
    const remove=document.createElement('button');remove.type='button';remove.textContent='×';remove.setAttribute('aria-label',`刪除${def.label}`);remove.onclick=()=>removeOpening(opening.id);
    const range=document.createElement('input');range.type='range';range.step='.3';const limit=openingLimit(opening.wall,opening.type);range.min=String(-limit);range.max=String(limit);range.value=String(Math.max(-limit,Math.min(limit,opening.offset)));range.setAttribute('aria-label',`${def.label}牆上位置`);range.onchange=e=>moveOpening(opening.id,+e.target.value);
    item.append(info,remove,range);list.appendChild(item);
  });
}
function commitSelectedOpenings(nextOpenings,message){
  if(!selected)return;const data=serialize(),index=modules.indexOf(selected);data[index].openings=nextOpenings;rebuild(data);selected=modules[index];updateSelection();saveHistory();if(message)notify(message);
}
function addOpening(){
  if(!selected||selected.userData.type==='terrace')return;
  const wall=document.querySelector('#wallSelect').value,type=document.querySelector('#openingTypeSelect').value,current=(selected.userData.openings||[]).map(o=>({...o})),limit=openingLimit(wall,type);
  const candidates=[0];for(let value=.3;value<=limit+.01;value+=.3)candidates.push(+value.toFixed(1),+(-value).toFixed(1));
  const offset=candidates.find(value=>openingFits(current,wall,type,value));
  if(offset===undefined){notify('此牆面沒有足夠空間');return}
  current.push({id:`O-${String(Date.now()).slice(-5)}`,type,wall,offset});commitSelectedOpenings(current,`${openingTypes[type].label}已加入${wallNames[wall]}`);
}
function moveOpening(id,offset){
  if(!selected)return;const current=(selected.userData.openings||[]).map(o=>({...o})),opening=current.find(o=>o.id===id);if(!opening)return;
  const next=Math.round(offset/.3)*.3;
  if(!openingFits(current,opening.wall,opening.type,next,id)){notify('此位置與其他元件重疊');updateOpeningPanel();return}
  opening.offset=next;commitSelectedOpenings(current);
}
function removeOpening(id){if(!selected)return;commitSelectedOpenings((selected.userData.openings||[]).filter(o=>o.id!==id),'門窗元件已移除')}
function updateStats(){
  document.querySelector('#moduleCount').textContent=modules.length;document.querySelector('#totalArea').textContent=(modules.length*UNIT.area).toFixed(1);
  document.querySelector('#floorCount').textContent=modules.length?Math.max(...modules.map(m=>Math.round(m.position.y/UNIT.h)))+1:0;
  let bad=false;for(let i=0;i<modules.length;i++)for(let j=i+1;j<modules.length;j++)if(overlap(modules[i],modules[j]))bad=true;
  const row=document.querySelector('#overlapRule');row.classList.toggle('warn',bad);row.classList.toggle('ok',!bad);row.lastChild.textContent=bad?' 發現模組重疊':' 無空間重疊';document.querySelector('#ruleState').textContent=bad?'需調整':'可組裝';
}
function addModule(type){const position=findFreePosition(currentFloor,0);const data={...position,floor:currentFloor,rotation:0,type,material:type==='terrace'?'timber':type==='service'?'concrete':'ivory',openings:[],id:`M-${String(Date.now()).slice(-4)}`};selected=makeModule(data,modules.length);modules.push(selected);updateSelection();updateStats();saveHistory();notify(`${typeNames[type]}已建立於最近空位`);}
function replaceSelected(patch){if(!selected)return;const data=serialize();const i=modules.indexOf(selected);data[i]={...data[i],...patch};rebuild(data);selected=modules[i];updateSelection();saveHistory();}
function setPointer(e){const r=canvas.getBoundingClientRect();pointer.x=((e.clientX-r.left)/r.width)*2-1;pointer.y=-((e.clientY-r.top)/r.height)*2+1;raycaster.setFromCamera(pointer,camera)}
canvas.addEventListener('pointerdown',e=>{setPointer(e);const hits=raycaster.intersectObjects(modules,true);if(hits.length){selected=hits[0].object.userData.module;updateSelection();plane.constant=-selected.position.y;raycaster.ray.intersectPlane(plane,hit);drag={dx:selected.position.x-hit.x,dz:selected.position.z-hit.z,startX:selected.position.x,startZ:selected.position.z};controls.enabled=false;canvas.setPointerCapture(e.pointerId)}});
canvas.addEventListener('pointermove',e=>{if(!drag||!selected)return;setPointer(e);if(raycaster.ray.intersectPlane(plane,hit)){selected.position.x=snap(hit.x+drag.dx);selected.position.z=snap(hit.z+drag.dz);updateSelection();updateStats()}});
canvas.addEventListener('pointerup',()=>{if(drag){if(collides(selected)){selected.position.x=drag.startX;selected.position.z=drag.startZ;notify('此位置與其他模組重疊，已回到原位')}drag=null;controls.enabled=true;updateSelection();updateStats();saveHistory()}});

document.querySelectorAll('.add-module').forEach(b=>b.addEventListener('click',()=>addModule(b.closest('.module-card').dataset.type)));
document.querySelector('#rotateBtn').onclick=()=>replaceSelected({rotation:(selected.userData.rotation+1)%4});
document.querySelector('#duplicateBtn').onclick=()=>{if(!selected)return;const floor=Math.round(selected.position.y/UNIT.h),position=findFreePosition(floor,selected.userData.rotation);const d={...selected.userData,...position,floor,id:`M-${String(Date.now()).slice(-4)}`};selected=makeModule(d,modules.length);modules.push(selected);updateSelection();updateStats();saveHistory();notify('複製模組已放入最近空位')};
document.querySelector('#deleteBtn').onclick=()=>{if(!selected)return;scene.remove(selected);modules.splice(modules.indexOf(selected),1);selected=modules[0]||null;updateSelection();updateStats();saveHistory()};
document.querySelector('#typeSelect').onchange=e=>replaceSelected({type:e.target.value,openings:e.target.value==='terrace'?[]:(selected.userData.openings||[])});
document.querySelectorAll('.swatch').forEach(s=>s.onclick=()=>replaceSelected({material:s.dataset.material}));
document.querySelector('#addOpeningBtn').onclick=addOpening;
for(const [id,key] of [['posX','x'],['posZ','z']])document.querySelector('#'+id).onchange=e=>{if(!selected)return;selected.position[key]=snap(+e.target.value);updateSelection();updateStats();saveHistory()};
document.querySelector('#floorUp').onclick=()=>{currentFloor=Math.min(4,currentFloor+1);document.querySelector('#floorLabel').textContent=`${currentFloor+1}F`};
document.querySelector('#floorDown').onclick=()=>{currentFloor=Math.max(0,currentFloor-1);document.querySelector('#floorLabel').textContent=`${currentFloor+1}F`};
document.querySelector('#resetBtn').onclick=()=>{localStorage.removeItem('modu-layout');rebuild(initial,true)};
document.querySelector('#undoBtn').onclick=()=>{if(historyIndex>0){historyIndex--;rebuild(JSON.parse(history[historyIndex]))}};
document.querySelector('#redoBtn').onclick=()=>{if(historyIndex<history.length-1){historyIndex++;rebuild(JSON.parse(history[historyIndex]))}};
const importFile=document.querySelector('#importFile');
document.querySelector('#importBtn').onclick=()=>importFile.click();
importFile.onchange=async e=>{
  const file=e.target.files?.[0];
  if(!file)return;
  try{
    if(file.size>2*1024*1024)throw new Error('file-too-large');
    const parsed=JSON.parse(await file.text());
    const source=Array.isArray(parsed)?parsed:parsed?.modules;
    if(!Array.isArray(source)||source.length<1||source.length>200)throw new Error('invalid-modules');
    const validTypes=new Set(Object.keys(typeNames)),validMaterials=new Set(Object.keys(colors)),validOpeningTypes=new Set(Object.keys(openingTypes)),validWalls=new Set(Object.keys(wallNames));
    const normalized=source.map((item,index)=>{
      const x=Number(item?.x),z=Number(item?.z),floor=Number(item?.floor),rotation=Number(item?.rotation);
      if(!Number.isFinite(x)||!Number.isFinite(z)||Math.abs(x)>120||Math.abs(z)>120)throw new Error('invalid-position');
      if(!validTypes.has(item?.type)||!validMaterials.has(item?.material))throw new Error('invalid-module');
      const importedOpenings=[];
      if(item.type!=='terrace'&&Array.isArray(item.openings))item.openings.slice(0,20).forEach((opening,openingIndex)=>{
        if(!validOpeningTypes.has(opening?.type)||!validWalls.has(opening?.wall))return;
        const rawOffset=Number(opening.offset),limit=openingLimit(opening.wall,opening.type),offset=Math.max(-limit,Math.min(limit,Math.round((Number.isFinite(rawOffset)?rawOffset:0)/.3)*.3));
        if(openingFits(importedOpenings,opening.wall,opening.type,offset))importedOpenings.push({id:typeof opening.id==='string'?opening.id.slice(0,30):`O-${index}-${openingIndex}`,type:opening.type,wall:opening.wall,offset});
      });
      return{
        id:typeof item.id==='string'&&item.id.trim()?item.id.trim().slice(0,30):`M-${String(index+1).padStart(2,'0')}`,
        type:item.type,
        material:item.material,
        rotation:((Math.round(Number.isFinite(rotation)?rotation:0)%4)+4)%4,
        floor:Math.max(0,Math.min(4,Math.round(Number.isFinite(floor)?floor:0))),
        x:snap(x),z:snap(z),openings:importedOpenings
      };
    });
    history=[];historyIndex=-1;currentFloor=0;document.querySelector('#floorLabel').textContent='1F';
    rebuild(normalized,true);
    notify(`已讀入 ${normalized.length} 個模組`);
  }catch(error){
    notify('讀入失敗：請選擇 MODU 匯出的 JSON');
  }finally{e.target.value=''}
};
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
    ctx.fillStyle='#343834';ctx.font='11px "Noto Sans TC", sans-serif';const label=iso(x,top+.22,z);ctx.textAlign='center';ctx.fillText(m.userData.id,label.x,label.y);
  });
}
function resize(){const w=viewport.clientWidth,h=viewport.clientHeight;camera.aspect=w/h;camera.updateProjectionMatrix();if(renderer)renderer.setSize(w,h,false);else{const ratio=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(w*ratio);canvas.height=Math.round(h*ratio);canvas.style.width=`${w}px`;canvas.style.height=`${h}px`;fallbackContext.setTransform(ratio,0,0,ratio,0,0);drawFallback()}}
window.addEventListener('resize',resize);resize();
const stored=localStorage.getItem('modu-layout');rebuild(stored?JSON.parse(stored):initial);saveHistory();
document.querySelector('#loading').classList.add('done');
if(renderer)renderer.setAnimationLoop(()=>{controls.update();renderer.render(scene,camera)});
else(function fallbackLoop(){controls.update();drawFallback();requestAnimationFrame(fallbackLoop)})();
