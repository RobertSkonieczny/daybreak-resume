import * as THREE from './vendor/three.module.js';
import {expandAnimals} from './animal-config.js';
import {buildAnimal,buildFish} from './animal-models.js?v=wildlife-1';
import {createAnimalMotion,ANIMAL_MOTION} from './animal-motion.js?v=wildlife-1';
export {buildAnimal} from './animal-models.js?v=wildlife-1';

export function islandHeight(x,z) {
  const soil=-1+3*Math.sqrt(Math.max(0,1-(x/10.6)**2-(z/7.2)**2));
  const beach=-1.8+3.3*Math.sqrt(Math.max(0,1-(x/12)**2-(z/8.5)**2));
  return Math.max(soil,beach);
}

export function createWildlife(scene, {sampleWater=()=>0, onSplash, random=Math.random}={}) {
  const animals=[],fish=[],islands=[],islandObstacles=new Map();
  let jumps=0,lastTime=null,lastJump=-10;
  function applyPose(animal,dt){
    const s=animal.motion.state,scale=animal.scale;
    const sin=Math.sin(s.heading),cos=Math.cos(s.heading);
    const center=islandHeight(s.x,s.z);
    animal.root.position.set(s.x,center,s.z);animal.root.rotation.y=s.heading;
    const length=Math.max(.18,animal.dimensions.length*.55)*scale;
    const width=Math.max(.12,animal.dimensions.width*.6)*scale;
    const front=islandHeight(s.x+sin*length*.5,s.z+cos*length*.5);
    const back=islandHeight(s.x-sin*length*.5,s.z-cos*length*.5);
    const right=islandHeight(s.x+cos*width*.5,s.z-sin*width*.5);
    const left=islandHeight(s.x-cos*width*.5,s.z+sin*width*.5);
    const pitch=THREE.MathUtils.clamp(Math.atan2(back-front,length),-.4,.4);
    const roll=THREE.MathUtils.clamp(Math.atan2(right-left,width),-.35,.35);
    const follow=animal.groundReady?1-Math.exp(-dt*6):1;
    animal.groundPitch=THREE.MathUtils.lerp(animal.groundPitch||0,pitch,follow);
    animal.groundRoll=THREE.MathUtils.lerp(animal.groundRoll||0,roll,follow);animal.groundReady=true;
    const groundOffsets=animal.legs.map(leg=>{
      const foot=leg.foot||leg.restFoot||leg.hip;
      const x=s.x+(cos*foot.x+sin*foot.z)*scale,z=s.z+(-sin*foot.x+cos*foot.z)*scale;
      return (islandHeight(x,z)-center)/scale;
    });
    animal.pose({...s,dt,groundOffsets,groundPitch:animal.groundPitch,groundRoll:animal.groundRoll});
  }
  function populateIsland(island,stop,index) {
    islands.push(stop);
    const entries=expandAnimals(stop.section),shoreAngle=Math.atan2(stop.z-stop.islandZ,stop.x-stop.islandX);
    const allDucks=entries.every(entry=>entry.species==='duck');
    const neededSpace=entries.reduce((sum,entry)=>sum+ANIMAL_MOTION[entry.species].radius*entry.scale*2,0)+Math.max(0,entries.length-1)*.32;
    const spread=Math.max(allDucks?.60:Math.min(1.9,.38*(entries.length-1)),neededSpace/6.1);
    const placements=[];
    entries.forEach((entry,i)=>{
      let angle=shoreAngle+(entries.length===1?.18:(i/(entries.length-1)-.5)*spread)+(random()-.5)*.05;
      const radius=ANIMAL_MOTION[entry.species].radius*entry.scale;
      let x,z;
      // Elliptical shores and mixed sizes need actual pairwise clearance; an
      // average spacing alone can overlap large animals at the ends of a shore.
      for(let attempt=0;attempt<315;attempt++,angle+=.02){
        x=Math.cos(angle)*7.65;z=Math.sin(angle)*5.12;
        if(placements.every(p=>Math.hypot(x-p.x,z-p.z)>=radius+p.radius+.20))break;
      }
      placements.push({x,z,radius});
      const animal=buildAnimal(entry.species);
      animal.root.scale.setScalar(entry.scale);
      animal.root.name+=`:${stop.section.id}:${i}`;island.add(animal.root);
      const motion=createAnimalMotion({species:entry.species,x,z,heading:Math.atan2(Math.cos(angle),Math.sin(angle)),
        scale:entry.scale,stride:animal.gait.stride,random});
      const record={...animal,stop,scale:entry.scale,origin:{x,z,radius:motion.state.radius},motion};
      animals.push(record);applyPose(record,0);
    });
    return animals.filter(animal=>animal.stop===stop).map(animal=>animal.origin);
  }
  function setIslandObstacles(sectionId,obstacles){
    islandObstacles.set(sectionId,obstacles.map(({x,z,radius})=>({x,z,radius})));
  }

  // Independent, infrequent jumps. A candidate flight must stay over water.
  for(let i=0;i<4;i++){
    const model=buildFish();model.root.name=`jumping-fish:${i}`;model.root.visible=false;scene.add(model.root);
    model.root.scale.setScalar(.86+random()*.26);
    fish.push({...model,nextJump:4+random()*7+i*(3.7+random()*2),start:null,index:i});
  }
  const openWater=(x,z)=>islands.every(stop=>((x-stop.islandX)/12.8)**2+((z-stop.islandZ)/9.1)**2>1);
  function startFish(f,t,boat){
    if(t-lastJump<3){f.nextJump=t+3+random()*4;return;}
    const angle=boat.heading||0;
    let found=false;
    for(let attempt=0;attempt<14;attempt++){
      const ahead=6+random()*7,side=(random()-.5)*12;
      f.x=boat.x-Math.sin(angle)*ahead+Math.cos(angle)*side;
      f.z=boat.z-Math.cos(angle)*ahead-Math.sin(angle)*side;
      const direction=angle+random()*Math.PI*2;
      const distance=1.05+random()*1.1;
      f.dx=Math.sin(direction)*distance;f.dz=Math.cos(direction)*distance;
      if([0,.25,.5,.75,1].every(u=>openWater(f.x+f.dx*u,f.z+f.dz*u))){found=true;break;}
    }
    if(!found){f.nextJump=t+2+random()*4;return;}
    f.duration=.9+random()*.38;f.height=.42+random()*.36;
    f.roll=(random()-.5)*.36;f.phase=random()*Math.PI*2;
    f.start=t;f.root.visible=true;jumps++;lastJump=t;onSplash?.(f.x,f.z,.025);
  }
  function update(t,boat) {
    const dt=lastTime===null?0:Math.max(0,Math.min(t-lastTime,.1));lastTime=t;
    // Movement decisions, steering, and pose have independent clocks per animal.
    for(const animal of animals){
      if(dt===0)continue;
      const {stop,motion}=animal;
      const neighbors=animals.filter(other=>other.stop===stop).map(other=>other.motion.state);
      motion.update(dt,{boat:{x:boat.x-stop.islandX,z:boat.z-stop.islandZ,speed:boat.speed||0},
        neighbors,obstacles:islandObstacles.get(stop.section.id)||[]});
      applyPose(animal,dt);
    }
    for(const f of fish){
      if(f.start===null&&t>=f.nextJump)startFish(f,t,boat);
      if(f.start===null)continue;
      const u=(t-f.start)/f.duration;
      if(u>=1){
        f.root.visible=false;f.start=null;f.nextJump=t+17+random()*27;
        onSplash?.(f.x+f.dx,f.z+f.dz,.048);
      }else{
        const x=f.x+f.dx*u,z=f.z+f.dz*u;
        f.root.position.set(x,sampleWater(x,z)+4*f.height*u*(1-u)-.08,z);
        const pitch=-Math.atan2(4*f.height*(1-2*u),Math.hypot(f.dx,f.dz));
        f.root.rotation.set(pitch,Math.atan2(f.dx,f.dz),Math.sin(u*Math.PI)*f.roll,'YXZ');
        f.pose({bend:Math.sin(u*Math.PI*2.8+f.phase)*Math.sin(u*Math.PI)*.12,
          tail:Math.sin(u*Math.PI*4.8+f.phase)*.30});
      }
    }
  }

  function snapshot(camera,width,height){
    return {jumps,fishVisible:fish.filter(f=>f.root.visible).length,animals:animals.map(a=>{
      const position=a.root.getWorldPosition(new THREE.Vector3()),screen=position.clone().add(new THREE.Vector3(0,.7,0)).project(camera);
      return {species:a.species,section:a.stop.section.id,position:position.toArray(),pose:a.body.position.y,head:a.head.rotation.y,behavior:a.motion.state.behavior,speed:a.motion.state.speed,distance:a.motion.state.distance,heading:a.motion.state.heading,scale:a.scale,dimensions:a.dimensions,screen:[(screen.x*.5+.5)*width,(-screen.y*.5+.5)*height]};
    })};
  }
  return {populateIsland,setIslandObstacles,update,snapshot};
}
