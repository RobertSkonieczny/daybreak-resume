import * as THREE from './vendor/three.module.js';
import { expandAnimals } from './animal-config.js';

const sphere = new THREE.SphereGeometry(1, 12, 8);
const cone = new THREE.ConeGeometry(1, 1, 5);
const materials = new Map();
function material(color) {
  if (!materials.has(color)) materials.set(color, new THREE.MeshStandardMaterial({color, roughness: .85, flatShading: true}));
  return materials.get(color);
}
function shape(parent, color, position, scale, geometry = sphere) {
  const mesh = new THREE.Mesh(geometry, material(color));
  mesh.position.set(...position); mesh.scale.set(...scale); parent.add(mesh); return mesh;
}
function group(parent, x=0, y=0, z=0) {
  const result = new THREE.Group(); result.position.set(x,y,z); parent.add(result); return result;
}
function face(head, width, depth, eyeHeight=0) {
  for (const side of [-1,1]) {
    shape(head, '#202d28', [side*width, eyeHeight, depth], [.035,.043,.025]);
    shape(head, '#fff4d7', [side*width-.008, eyeHeight+.011, depth+.017], [.010,.013,.008]);
  }
}

export function buildAnimal(species) {
  const root = new THREE.Group(), body = group(root), parts = {root, body, species, legs: [], ears: []};
  root.name = `animal:${species}`;
  const feet = (color, x, y, z, size) => {
    for (const side of [-1,1]) for (const front of [-1,1]) {
      const leg = group(body, side*x, y, front*z);
      shape(leg, color, [0,0,0], size); parts.legs.push(leg);
    }
  };
  if (species === 'rabbit') {
    shape(body, '#d8d1b7', [0,.43,-.12], [.36,.44,.52]);
    feet('#e9dfc7', .23,.15,.28, [.15,.15,.22]);
    const head = parts.head = group(body,0,.83,.29);
    shape(head,'#ede2c9',[0,0,0],[.28,.29,.27]);
    for (const side of [-1,1]) {
      const ear = group(head,side*.14,.22,-.02); ear.rotation.z=-side*.12;
      shape(ear,'#e9dfc5',[0,.29,0],[.085,.36,.07]);
      shape(ear,'#c68e82',[0,.29,.053],[.039,.26,.024]);parts.ears.push(ear);
    }
    face(head,.16,.21,.015);
    shape(head,'#b88276',[0,-.09,.267],[.055,.038,.032]);
    parts.tail=shape(body,'#f8edd5',[0,.45,-.64],[.18,.18,.16]);
  } else if (species === 'fox') {
    shape(body,'#c9763d',[0,.67,-.08],[.35,.37,.67]);
    shape(body,'#edd7ac',[0,.61,.36],[.27,.31,.27]);
    feet('#574031',.24,.25,.43,[.105,.25,.12]);
    const head=parts.head=group(body,0,1.05,.54);
    shape(head,'#d58a48',[0,0,0],[.32,.3,.31]);
    for(const side of [-1,1]) {
      const ear=group(head,side*.23,.30,-.06);
      shape(ear,'#b96735',[0,0,0],[.17,.43,.16],cone);
      shape(ear,'#e7cda9',[0,-.025,.075],[.093,.28,.06],cone);parts.ears.push(ear);
      shape(head,'#f1debc',[side*.13,-.09,.22],[.16,.16,.21]);
    }
    face(head,.18,.26,.06);shape(head,'#372d27',[0,-.06,.43],[.07,.05,.045]);
    const tail=parts.tail=group(body,0,.7,-.58);tail.rotation.x=-.24;
    shape(tail,'#c8783c',[0,.03,-.43],[.26,.25,.62]);
    shape(tail,'#f4e2c2',[0,.06,-.91],[.20,.18,.28]);
  } else if (species === 'deer') {
    shape(body,'#b88c5b',[0,1.02,-.12],[.4,.46,.71]);
    shape(body,'#e6c89b',[0,.87,.05],[.31,.31,.54]);
    feet('#b78c5b',.27,.36,.43,[.09,.38,.11]);
    for (const leg of parts.legs) shape(leg,'#5d4b38',[0,-.30,.012],[.095,.075,.12]);
    shape(body,'#bd9263',[0,1.45,.43],[.22,.53,.23]).rotation.x=.25;
    const head=parts.head=group(body,0,1.86,.64);
    shape(head,'#cba272',[0,0,0],[.24,.25,.33]);
    shape(head,'#e9d5b0',[0,-.1,.24],[.19,.14,.25]);
    shape(head,'#554936',[0,-.09,.45],[.1,.065,.045]);
    face(head,.19,.20,.03);
    for(const side of [-1,1]) {
      const ear=group(head,side*.24,.18,-.06);ear.rotation.z=-side*.75;
      shape(ear,'#cda779',[0,.14,0],[.115,.27,.07]);
      shape(ear,'#e8c7ad',[0,.14,.051],[.057,.17,.024]);parts.ears.push(ear);
      for(const z of [-.35,0,.27])shape(body,'#ecd8b3',[side*.375,1.20,z-.13],[.045,.055,.07]);
    }
    parts.tail=shape(body,'#e6d4b3',[0,1.13,-.85],[.1,.12,.21]);
  } else if (species === 'duck') {
    shape(body,'#e7d8b3',[0,.46,-.04],[.41,.34,.60]);
    for(const side of [-1,1])shape(body,'#9f9f83',[side*.33,.49,-.14],[.13,.20,.38]);
    shape(body,'#d0c3a5',[0,.70,.33],[.18,.25,.18]);
    const head=parts.head=group(body,0,.96,.43);
    shape(head,'#467963',[0,0,0],[.235,.25,.24]);
    shape(head,'#e6b75c',[0,-.07,.26],[.17,.06,.21]);face(head,.18,.16,.035);
    for(const side of [-1,1]){
      const leg=group(body,side*.18,.10,.02);shape(leg,'#c98f40',[0,0,.06],[.15,.06,.21]);parts.legs.push(leg);
    }
    parts.tail=shape(body,'#eee0bc',[0,.48,-.61],[.15,.12,.25]);
  } else if (species === 'turtle') {
    shape(body,'#b9b57a',[0,.27,0],[.56,.19,.63]);
    shape(body,'#708559',[0,.40,-.02],[.59,.35,.69]);
    for(const [x,z] of [[0,-.3],[0,.18],[-.28,-.08],[.28,-.08]])shape(body,'#929968',[x,.674,z],[.18,.055,.20]);
    feet('#899b65',.48,.12,.36,[.20,.10,.20]);
    const head=parts.head=group(body,0,.32,.65);
    shape(head,'#afbd80',[0,0,0],[.22,.19,.26]);face(head,.15,.17,.035);
    parts.tail=shape(body,'#8a9e68',[0,.22,-.73],[.07,.07,.2]);
  } else throw new Error(`Unknown animal species: ${species}`);
  return parts;
}

export function islandHeight(x,z) {
  const soil=-1+3*Math.sqrt(Math.max(0,1-(x/10.6)**2-(z/7.2)**2));
  const beach=-1.8+3.3*Math.sqrt(Math.max(0,1-(x/12)**2-(z/8.5)**2));
  return Math.max(soil,beach);
}

export function createWildlife(scene) {
  const animals=[], fish=[];
  let jumps=0;
  const shadowMaterial=new THREE.MeshBasicMaterial({color:'#233b28',transparent:true,opacity:.18,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1});
  const shadowGeometry=new THREE.CircleGeometry(.55,16);
  function populateIsland(island,stop,index) {
    const entries=expandAnimals(stop.section);
    const shoreAngle=Math.atan2(stop.z-stop.islandZ,stop.x-stop.islandX);
    entries.forEach((entry,i)=>{
      const angle=shoreAngle+(entries.length===1?.38:(i/(entries.length-1)-.5)*1.9);
      const x=Math.cos(angle)*7.5,z=Math.sin(angle)*5.1;
      const animal=buildAnimal(entry.species);
      animal.root.scale.setScalar(entry.scale*.5);animal.root.position.set(x,islandHeight(x,z),z);
      animal.root.rotation.y=Math.atan2(Math.cos(angle),Math.sin(angle));
      animal.root.name+=`:${stop.section.id}:${i}`;island.add(animal.root);
      const shadow=new THREE.Mesh(shadowGeometry,shadowMaterial);shadow.rotation.x=-Math.PI/2;shadow.position.y=.015;shadow.scale.y=1.25;animal.root.add(shadow);
      animals.push({...animal,stop,scale:entry.scale,origin:{x,z},yaw:animal.root.rotation.y,phase:index*2.1+i*1.8,shadow});
    });
    return animals.filter(animal=>animal.stop===stop).map(animal=>animal.origin);
  }

  // Only a few fish, spaced in time. They stay near the current view of the boat.
  for(let i=0;i<4;i++){
    const root=new THREE.Group();root.name=`jumping-fish:${i}`;root.visible=false;scene.add(root);
    shape(root,i%2?'#d3ad77':'#b4c9b6',[0,0,0],[.115,.17,.43]);
    const tail=shape(root,'#bda076',[0,0,-.44],[.16,.27,.14],cone);tail.rotation.x=Math.PI/2;
    shape(root,'#e9ddbe',[0,-.055,.07],[.085,.085,.32]);
    for(const side of [-1,1])shape(root,'#263b32',[side*.093,.045,.24],[.02,.027,.027]);
    const rings=Array.from({length:2},()=>{
      const ring=new THREE.Mesh(new THREE.RingGeometry(.22,.26,24),new THREE.MeshBasicMaterial({color:'#e5e4c0',transparent:true,opacity:0,side:THREE.DoubleSide,depthWrite:false}));
      ring.rotation.x=-Math.PI/2;ring.visible=false;scene.add(ring);return ring;
    });
    fish.push({root,rings,nextJump:4+i*5.6,start:null,splash:null,side:i%2?1:-1,index:i});
  }
  function update(t,boat) {
    for(const animal of animals){
      const {root,body,head,origin,phase,species,stop}=animal;
      const near=Math.hypot(boat.x-stop.islandX-origin.x,boat.z-stop.islandZ-origin.z)<28;
      const pace=species==='turtle'?.23:.48;
      root.position.x=origin.x+Math.sin(t*pace*.5+phase)*.25;
      root.position.z=origin.z+Math.cos(t*pace*.5+phase)*.20;
      root.position.y=islandHeight(root.position.x,root.position.z);
      root.rotation.y=animal.yaw+Math.sin(t*.24+phase)*.18;
      body.position.y=species==='rabbit'?Math.pow(Math.max(0,Math.sin(t*1.9+phase)),8)*.22:Math.sin(t*1.5+phase)*.014;
      body.rotation.z=species==='duck'?Math.sin(t*2.2+phase)*.065:0;
      const towardBoat=Math.atan2(boat.x-stop.islandX-root.position.x,boat.z-stop.islandZ-root.position.z)-root.rotation.y;
      head.rotation.y=near?THREE.MathUtils.clamp(Math.atan2(Math.sin(towardBoat),Math.cos(towardBoat)),-.48,.48):Math.sin(t*.55+phase)*.17;
      head.rotation.x=species==='deer'&&!near?Math.max(0,Math.sin(t*.5+phase))*.35:Math.sin(t*.8+phase)*.055;
      animal.ears.forEach((ear,i)=>{ear.rotation.x=Math.sin(t*1.3+phase+i)*.09;});
      animal.legs.forEach((leg,i)=>{leg.rotation.x=Math.sin(t*1.5+phase+i*Math.PI)*.10;});
      if(animal.tail)animal.tail.rotation.y=Math.sin(t*(species==='fox'?2:1)+phase)*.18;
    }
    for(const f of fish){
      if(f.start===null&&t>=f.nextJump){
        const ahead=8+f.index*1.25,side=f.side*(3.5+f.index*.45),angle=boat.heading||0;
        f.x=boat.x-Math.sin(angle)*ahead+Math.cos(angle)*side;
        f.z=boat.z-Math.cos(angle)*ahead-Math.sin(angle)*side;
        f.dx=Math.cos(angle)*f.side*1.7;f.dz=-Math.sin(angle)*f.side*1.7;
        f.start=t;f.root.visible=true;jumps++;
      }
      if(f.start!==null){
        const progress=(t-f.start)/1.65;
        if(progress>=1){
          f.root.visible=false;f.start=null;f.nextJump=t+19+f.index*1.4;f.splash=t;
          for(const ring of f.rings)ring.position.set(f.x+f.dx,.045,f.z+f.dz);
        }else{
          f.root.position.set(f.x+f.dx*progress,Math.sin(progress*Math.PI)*1.15-.12,f.z+f.dz*progress);
          f.root.rotation.set(-Math.atan2(Math.cos(progress*Math.PI)*Math.PI*1.15,1.7),Math.atan2(f.dx,f.dz),Math.sin(progress*8)*.08,'YXZ');
        }
      }
      if(f.splash!==null)f.rings.forEach((ring,i)=>{
        const age=t-f.splash-i*.12;ring.visible=age>=0&&age<1.8;
        if(ring.visible){ring.scale.setScalar(1+age*4);ring.material.opacity=.32*(1-age/1.8);}
      });
    }
  }
  function snapshot(camera,width,height){
    return {jumps,fishVisible:fish.filter(f=>f.root.visible).length,animals:animals.map(a=>{
      const position=a.root.getWorldPosition(new THREE.Vector3()),screen=position.clone().add(new THREE.Vector3(0,.7,0)).project(camera);
      return {species:a.species,section:a.stop.section.id,position:position.toArray(),pose:a.body.position.y,head:a.head.rotation.y,screen:[(screen.x*.5+.5)*width,(-screen.y*.5+.5)*height]};
    })};
  }
  return {populateIsland,update,snapshot};
}
