import assert from 'node:assert/strict';
import {createAnimalMotion,ANIMAL_MOTION} from '../dist/animal-motion.js';
const seeded=seed=>()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
const obstacles=[{x:5.2,z:1.6,radius:.5},{x:4.2,z:3.2,radius:.4},{x:7,z:-2.7,radius:.4}];
for(const [index,species] of Object.keys(ANIMAL_MOTION).entries()){
  const animal=createAnimalMotion({species,x:7.5,z:0,heading:Math.PI/2,random:seeded(37+index)});
  const actions=new Set(),positions=[];
  let previous={...animal.state},largestStep=0;
  for(let frame=0;frame<60*90;frame++){
    animal.update(1/60,{obstacles});const s=animal.state;actions.add(s.behavior);
    assert.ok(Number.isFinite(s.x+s.z+s.heading+s.phase+s.speed+s.hop),'all motion remains finite');
    assert.ok((s.x/animal.bounds.x)**2+(s.z/animal.bounds.z)**2<=1.00001,'animals stay on dry land');
    for(const o of obstacles)assert.ok(Math.hypot(s.x-o.x,s.z-o.z)>o.radius+s.radius+.095,'animals avoid rocks and trees');
    largestStep=Math.max(largestStep,Math.hypot(s.x-previous.x,s.z-previous.z));
    assert.ok(Math.abs(Math.atan2(Math.sin(s.heading-previous.heading),Math.cos(s.heading-previous.heading)))<=ANIMAL_MOTION[species].turn/60+.00001,'turns stay fluid');
    if(frame%60===0)positions.push({x:s.x,z:s.z});previous={...s};
  }
  const excursion=Math.max(...positions.map(p=>Math.hypot(p.x-7.5,p.z)));
  assert.ok(excursion>(species==='turtle'?.9:2),`${species} actually explores its island (${excursion.toFixed(2)}m)`);
  assert.ok(actions.size>=2,`${species} changes between walking and natural idle actions`);
  assert.ok(largestStep<.035,'no position jumps');
  const paused=animal.snapshot();animal.update(0,{boat:{x:animal.state.x,z:animal.state.z,speed:8}});
  assert.deepEqual(animal.snapshot(),paused,'paused animals do not make decisions or animate');
}
console.log('PASS species-specific exploration, changing actions, obstacle avoidance, dry boundaries, continuous movement, and pause.');

const a=createAnimalMotion({species:'deer',x:7,z:1,random:seeded(41)});
const b=createAnimalMotion({species:'deer',x:7,z:1,random:seeded(42)});
for(let i=0;i<1800;i++){a.update(1/60);b.update(1/60);}
assert.notDeepEqual(a.snapshot().target,b.snapshot().target,'different random streams produce different decisions');
assert.ok(Math.hypot(a.state.x-b.state.x,a.state.z-b.state.z)>1,'animals do not retrace one prescribed route');
const near=createAnimalMotion({species:'deer',x:7.5,z:0,random:seeded(17)});
for(let i=0;i<180;i++)near.update(1/60);
let reacted=false;
for(let i=0;i<120;i++){
  near.update(1/60,{boat:{x:11.8,z:0,speed:6}});
  if(['alert','retreat'].includes(near.state.behavior))reacted=true;
}
assert.ok(reacted,'a fast nearby boat elicits a reaction');
console.log('PASS independent random decisions and reactions to an approaching boat.');

const ducks=[-1,0,1].map((n,i)=>createAnimalMotion({species:'duck',x:6.7,z:n*.85,random:seeded(70+i)}));
let minGap=Infinity;
for(let frame=0;frame<60*60;frame++){
  for(const duck of ducks)duck.update(1/60,{neighbors:ducks.map(d=>d.state)});
  for(let i=0;i<ducks.length;i++)for(let j=i+1;j<ducks.length;j++)minGap=Math.min(minGap,Math.hypot(ducks[i].state.x-ducks[j].state.x,ducks[i].state.z-ducks[j].state.z));
}
assert.ok(minGap>=.43,'the flock keeps personal space without overlapping');
assert.ok(ducks.every(d=>d.state.distance>4),'all flock members move');
console.log('PASS flock movement and animal separation.');

for(const species of Object.keys(ANIMAL_MOTION))for(const scale of [.5,2]){
  const animal=createAnimalMotion({species,scale,x:7.5,z:0,random:seeded(89)});
  for(let i=0;i<60*30;i++)animal.update(1/60,{obstacles});
  assert.ok((animal.state.x/animal.bounds.x)**2+(animal.state.z/animal.bounds.z)**2<=1,'YAML scale extremes retain dry-land bounds');
  for(const o of obstacles)assert.ok(Math.hypot(animal.state.x-o.x,animal.state.z-o.z)>o.radius+animal.state.radius,'avoidance accounts for animal scale');
}
console.log('PASS motion and collision clearance at both supported size extremes.');

// Regression: a large deer that starts slightly inside a rock's safety margin
// must be able to leave, instead of rejecting every possible destination.
const trappedRock={x:-.6081,z:6.9870,radius:1.01405};
const escaping=createAnimalMotion({species:'deer',scale:2,x:-.6995,z:5.0986,random:seeded(120)});
let previousGap=Math.hypot(escaping.state.x-trappedRock.x,escaping.state.z-trappedRock.z);
for(let frame=0;frame<60*45;frame++){
  escaping.update(1/60,{obstacles:[trappedRock]});
  const gap=Math.hypot(escaping.state.x-trappedRock.x,escaping.state.z-trappedRock.z);
  if(previousGap<=trappedRock.radius+escaping.state.radius+.10)assert.ok(gap>=previousGap-1e-8,'escape never moves deeper into an existing overlap');
  previousGap=gap;
}
assert.ok(escaping.state.distance>2,'a rock near the starting position does not permanently trap a large animal');
console.log('PASS animals recover from an initial obstacle overlap.');
