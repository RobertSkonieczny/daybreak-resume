import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseResume, validateResume, getSkillEvidence } from '../dist/resume-data.js';
import { createStops, islandProximity, planCourse } from '../dist/navigation.js';
import { ANIMAL_SPECIES, expandAnimals } from '../dist/animal-config.js';
import { buildAnimal, createWildlife } from '../dist/wildlife.js';
import {ANIMAL_MOTION} from '../dist/animal-motion.js';
import * as THREE from '../dist/vendor/three.module.js';

// Check the author's file without tying reusable tests to their name or career.
parseResume(await readFile(new URL('../dist/content/resume.yml',import.meta.url),'utf8'));
const resume=parseResume(await readFile(new URL('../examples/resume.yml',import.meta.url),'utf8'));
assert.equal(createStops(resume.sections).length,5);

const clone=()=>JSON.parse(JSON.stringify(resume));
const duplicate=clone();duplicate.sections[1].id='about';assert.match(validateResume(duplicate).join('\n'),/unique id/);
const typo=clone();typo.profile.headlne='A typo';assert.match(validateResume(typo).join('\n'),/unknown field/);
const badLink=clone();badLink.profile.links[0].url='javascript:alert(1)';assert.match(validateResume(badLink).join('\n'),/https/);
const badLogo=clone();badLogo.sections[1].items[0].logo='javascript:alert(1)';assert.match(validateResume(badLogo).join('\n'),/image path/);
const customLogo=clone();customLogo.sections[1].items[0].logo='assets/companies/custom.png';assert.deepEqual(validateResume(customLogo),[]);
const remoteLogo=clone();remoteLogo.sections[1].items[0].logo='https://example.com/logo.png';assert.deepEqual(validateResume(remoteLogo),[]);
for(const path of ['https://example.com/resume.pdf','../resume.pdf','assets/resume/../resume.pdf','javascript:alert(1)']){
  const invalid=clone();invalid.profile.resume_pdf=path;assert.match(validateResume(invalid).join('\n'),/local PDF/);
}
const localPdf=clone();localPdf.profile.resume_pdf='assets/resume/new-resume.pdf';assert.deepEqual(validateResume(localPdf),[]);
for(const animal of [{species:'lion'},{species:'duck',count:0},{species:'fox',count:1.5},{species:'rabbit',count:'2'},{species:'fox',count:null},{species:'turtle',scale:3},{species:'deer',scale:'1'},{species:'duck',size:1}]){
  const invalid=clone();invalid.sections[0].animals=[animal];assert.match(validateResume(invalid).join('\n'),/animals/);
}
const crowded=clone();crowded.sections[0].animals=[{species:'duck',count:5},{species:'rabbit',count:4}];assert.match(validateResume(crowded).join('\n'),/at most 8/);
const noAnimals=clone();noAnimals.sections[0].animals=[];assert.deepEqual(validateResume(noAnimals),[]);assert.deepEqual(expandAnimals(noAnimals.sections[0]),[]);
assert.deepEqual(expandAnimals({animals:[{species:'fox'}]}),[{species:'fox',scale:1}]);
assert.equal(expandAnimals({animals:[{species:'rabbit',count:3},{species:'deer',scale:1.5}]}).length,4);
const invalidType=clone();invalidType.sections[1].type='job';assert.match(validateResume(invalidType).join('\n'),/choose about/);
const empty=clone();empty.sections.forEach(s=>s.enabled=false);assert.match(validateResume(empty).join('\n'),/1 and 12/);
const badPeriod=clone();badPeriod.sections[1].items[0].period=2025;assert.match(validateResume(badPeriod).join('\n'),/quotes/);
assert.throws(()=>parseResume('version: 1\nversion: 1'),/line 2/,'duplicate YAML keys are rejected');
assert.throws(()=>parseResume('version: 1\nprofile:\n name: First\n  headline: Broken'),/YAML at line/,'indentation errors have a line number');

// Optional story fields stay compatible with basic resumes and fail with useful paths.
const basic=clone();
delete basic.sections[0].story_title;delete basic.sections[0].paragraphs;
for(const field of ['id','focus','overview','stories'])delete basic.sections[1].items[0][field];
delete basic.sections.find(s=>s.type==='skills').featured;
assert.deepEqual(validateResume(basic),[]);
const education=clone();education.profile.education=[{institution:'A university',degree:'A degree'}];assert.deepEqual(validateResume(education),[]);
delete education.profile.education[0].degree;assert.match(validateResume(education).join('\n'),/profile.education\[0\].degree/);
const duplicateStory=clone();duplicateStory.sections[1].items[0].stories.push({...duplicateStory.sections[1].items[0].stories[0]});assert.match(validateResume(duplicateStory).join('\n'),/unique id/);
const missingWork=clone();delete missingWork.sections[1].items[0].stories[0].work;assert.match(validateResume(missingWork).join('\n'),/stories\[0\].work/);
const badMetric=clone();badMetric.sections[1].items[0].stories[0].metric={value:250,label:'Potential savings'};assert.match(validateResume(badMetric).join('\n'),/metric.value/);
const duplicateRole=clone();duplicateRole.sections[1].items.push({...duplicateRole.sections[1].items[0]});assert.match(validateResume(duplicateRole).join('\n'),/unique id/);
const badFeatured=clone();badFeatured.sections.find(s=>s.type==='skills').featured='Unlisted';assert.match(validateResume(badFeatured).join('\n'),/featured/);
for(const groups of [{},null,'Python',false]){
  const invalid=clone();invalid.sections.find(s=>s.type==='skills').groups=groups;
  assert.match(validateResume(invalid).join('\n'),/groups: expected a list/,'bad groups report an error instead of crashing the validator');
}
assert.equal(getSkillEvidence('Python',resume.sections)[0].reference.storyId,'selected-project','story evidence takes priority over a broad role match');
assert.equal(getSkillEvidence('SQL',resume.sections)[0].reference.storyId,undefined,'job technologies remain a useful fallback');
const evidence=[{id:'work',type:'experience',items:[{id:'one',company:'One',role:'Engineer',technologies:['C++','Presto / SQL','GraphQL','Node.js']},{id:'two',company:'Two',role:'Engineer',technologies:['GraphQL']}]}];
assert.deepEqual(getSkillEvidence('sql',evidence).map(e=>e.company),['One'],'SQL matches Presto / SQL without matching GraphQL');
assert.equal(getSkillEvidence('C++',evidence).length,1);assert.equal(getSkillEvidence('C',evidence).length,0);
assert.equal(getSkillEvidence('Node.js',evidence).length,1);assert.equal(getSkillEvidence('Python',evidence).length,0);
evidence[0].enabled=false;assert.equal(getSkillEvidence('C++',evidence).length,0,'hidden experience does not create unreachable links');
console.log('PASS case-study schema, legacy resumes, education, and accurate skill-to-work matching.');

const example=parseResume(await readFile(new URL('../examples/resume.yml',import.meta.url),'utf8'));
assert.equal(createStops(example.sections).length,5);
const reordered=[...example.sections].reverse();
assert.equal(createStops(reordered)[0].section.id,'education');
example.sections.find(s=>s.type==='text').enabled=true;
assert.equal(createStops(example.sections).length,6,'adding a custom section adds an island');
assert.equal(createStops([resume.sections[0]]).length,1);
assert.equal(createStops([...resume.sections,{id:'contact',type:'contact',title:'Contact'}]).length,5,'contact is in the boat book, not an island');

const stops=createStops(resume.sections),s=stops[0];
assert.equal(islandProximity({x:0,z:16},stops,null).arrival,null);
for(const [dx,dz] of [[19,0],[-19,0],[0,16],[0,-16]]){
  const position={x:s.islandX+dx,z:s.islandZ+dz};
  assert.equal(islandProximity(position,stops,null).arrival,0,'an approach from any side opens the island');
  assert.equal(islandProximity(position,stops,0).arrival,null,'dismissed sections stay dismissed nearby');
}
const edge={x:s.islandX+23,z:s.islandZ};
assert.equal(islandProximity(edge,stops,0).latch,0,'a little drift at the boundary does not rearm');
const departed=islandProximity({x:s.islandX-32,z:s.islandZ},stops,0);
assert.equal(departed.latch,null,'rowing away rearms the island');
assert.equal(islandProximity({x:s.islandX-19,z:s.islandZ},stops,departed.latch).arrival,0,'returning reopens the section');
assert.equal(islandProximity({x:s.islandX+19,z:s.islandZ},stops,null,1).arrival,null,'guided trips do not open a different island en route');
console.log('PASS resume parsing, validation, templates, section ordering, and island proximity from every side.');

for(let i=0;i<stops.length;i++)for(let j=0;j<stops.length;j++){
  if(i===j)continue;
  const origin={x:stops[i].islandX+22,z:stops[i].islandZ+7};
  const course=planCourse(origin,stops[j],stops),points=[origin,...course];
  assert.equal(islandProximity(course[course.length-1],stops,null,j).arrival,j,'course ends within automatic arrival range');
  for(let k=1;k<points.length;k++)for(const stop of stops){
    const a=points[k-1],b=points[k],ax=(a.x-stop.islandX)/13,az=(a.z-stop.islandZ)/10,dx=(b.x-a.x)/13,dz=(b.z-a.z)/10;
    const t=Math.max(0,Math.min(1,-(ax*dx+az*dz)/(dx*dx+dz*dz||1)));
    assert.ok(Math.hypot(ax+t*dx,az+t*dz)>=1,'guided route stays outside island collision bounds');
  }
}
console.log('PASS guided routes between every pair of islands stay on the water.');

for(const species of ANIMAL_SPECIES){
  const model=buildAnimal(species),size=new THREE.Box3().setFromObject(model.root).getSize(new THREE.Vector3());
  assert.ok(size.toArray().every(v=>Number.isFinite(v)&&v>0),`${species} has valid 3D geometry`);
}
const scene=new THREE.Scene(),wildlife=createWildlife(scene,{random:()=>0}),island=new THREE.Group();scene.add(island);
const animalStop={...stops[0],section:{id:'wildlife',animals:[{species:'fox'},{species:'duck',count:2,scale:1.5}]}};
island.position.set(animalStop.islandX,0,animalStop.islandZ);
wildlife.populateIsland(island,animalStop,0);
assert.deepEqual(island.children.map(child=>child.scale.x),[1,1.5,1.5],'YAML scale multiplies the realistic species dimensions');
const camera=new THREE.PerspectiveCamera();scene.updateMatrixWorld(true);
assert.equal(wildlife.snapshot(camera,100,100).animals.length,3);
wildlife.update(4,{x:0,z:16,heading:0});
assert.equal(wildlife.snapshot(camera,100,100).fishVisible,1,'a fish begins its occasional jump');
wildlife.update(6,{x:0,z:16,heading:0});
assert.equal(wildlife.snapshot(camera,100,100).fishVisible,0,'the fish returns below the water');
assert.equal(wildlife.snapshot(camera,100,100).jumps,1);
console.log('PASS configurable wildlife, realistic model scales, local PDF paths, and fish jump lifecycle.');

// Supported size/count extremes must also start clear before any motion runs.
for(const angle of [0,Math.PI/2,Math.PI]){
  let seed=270;
  const crowdedScene=new THREE.Scene(),crowdedIsland=new THREE.Group();crowdedScene.add(crowdedIsland);
  const crowdedWildlife=createWildlife(crowdedScene,{random:()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296)});
  const population=angle===0?[{species:'deer',scale:2,count:2},{species:'rabbit',scale:.5,count:6}]:[{species:'deer',scale:2,count:8}];
  const crowdedStop={x:Math.cos(angle)*14,z:Math.sin(angle)*10,islandX:0,islandZ:0,section:{id:'crowded',animals:population}};
  const placements=crowdedWildlife.populateIsland(crowdedIsland,crowdedStop,0),entries=expandAnimals(crowdedStop.section);
  for(let i=0;i<placements.length;i++)for(let j=i+1;j<placements.length;j++){
    const a=placements[i],b=placements[j],r=ANIMAL_MOTION[entries[i].species].radius*entries[i].scale+ANIMAL_MOTION[entries[j].species].radius*entries[j].scale;
    assert.ok(Math.hypot(a.x-b.x,a.z-b.z)>=r+.199,'large and mixed species start with clear personal space');
  }
}
console.log('PASS initial spacing for crowded islands and mixed animal sizes.');

// Fish leave and re-enter the moving surface, and feed physical ripple impulses.
const splashScene=new THREE.Scene(),splashes=[];
const movingWaterFish=createWildlife(splashScene,{sampleWater:()=>.23,onSplash:(...event)=>splashes.push(event),random:()=>0});
movingWaterFish.update(4,{x:0,z:16,heading:0});
assert.equal(splashes.length,1,'takeoff disturbs the water');
movingWaterFish.update(4.45,{x:0,z:16,heading:0});
const jumpingFish=splashScene.getObjectByName('jumping-fish:0');
assert.ok(Math.abs(jumpingFish.position.y-.57)<.00001,'the smaller ballistic jump is relative to wave height');
movingWaterFish.update(6,{x:0,z:16,heading:0});
assert.equal(splashes.length,2,'landing disturbs the water');
assert.ok(splashes[1][2]>splashes[0][2],'landing leaves the larger ripple');
console.log('PASS fish follow the moving surface and generate physical splashes.');

// Even a shore without configured animals must remain off limits to fish.
const shoreScene=new THREE.Scene(),shoreSplashes=[];
let wildlifeSeed=37;
const shoreWildlife=createWildlife(shoreScene,{random:()=>((wildlifeSeed=(Math.imul(wildlifeSeed,1664525)+1013904223)>>>0)/4294967296),onSplash:(x,z)=>shoreSplashes.push({x,z})});
const emptyShore={islandX:0,islandZ:0,x:12,z:5,section:{id:'empty',animals:[]}};
shoreWildlife.populateIsland(new THREE.Group(),emptyShore,0);
for(let frame=0;frame<60*30;frame++){
  shoreWildlife.update(frame/30,{x:13,z:9,heading:.6});
  shoreScene.children.filter(child=>child.name.startsWith('jumping-fish:')&&child.visible).forEach(child=>{
    assert.ok((child.position.x/12.8)**2+(child.position.z/9.1)**2>1,'the entire fish jump stays off the island');
  });
}
assert.ok(shoreSplashes.length>=4,'fish can still find open water near a shoreline');
assert.ok(shoreSplashes.every(p=>(p.x/12.8)**2+(p.z/9.1)**2>1),'takeoff and landing stay in open water');

// Pausing freezes every joint, not only the root position and visible body.
const transforms=()=>{const result=[];island.traverse(part=>result.push([...part.position,...part.quaternion,...part.scale]));return result;};
for(let frame=1;frame<=30;frame++)wildlife.update(6+frame/60,{x:0,z:16,heading:0});
const frozen=transforms();
for(let frame=0;frame<5;frame++)wildlife.update(6.5,{x:0,z:16,heading:0});
assert.deepEqual(transforms(),frozen,'paused wildlife keeps all limb and head transforms unchanged');
console.log('PASS fish avoid land and ambient pause freezes the complete animal rig.');
