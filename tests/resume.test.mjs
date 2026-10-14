import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseResume, validateResume, getSkillEvidence } from '../dist/resume-data.js';
import { createStops, islandProximity, planCourse } from '../dist/navigation.js';
import { ANIMAL_SPECIES, expandAnimals } from '../dist/animal-config.js';
import { buildAnimal, createWildlife } from '../dist/wildlife.js';
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
const scene=new THREE.Scene(),wildlife=createWildlife(scene),island=new THREE.Group();scene.add(island);
const animalStop={...stops[0],section:{id:'wildlife',animals:[{species:'fox'},{species:'duck',count:2,scale:1.5}]}};
island.position.set(animalStop.islandX,0,animalStop.islandZ);
wildlife.populateIsland(island,animalStop,0);
assert.deepEqual(island.children.map(child=>child.scale.x),[.5,.75,.75],'all island animals use the requested half-size base');
const camera=new THREE.PerspectiveCamera();scene.updateMatrixWorld(true);
assert.equal(wildlife.snapshot(camera,100,100).animals.length,3);
wildlife.update(4,{x:0,z:16,heading:0});
assert.equal(wildlife.snapshot(camera,100,100).fishVisible,1,'a fish begins its occasional jump');
wildlife.update(6,{x:0,z:16,heading:0});
assert.equal(wildlife.snapshot(camera,100,100).fishVisible,0,'the fish returns below the water');
assert.equal(wildlife.snapshot(camera,100,100).jumps,1);
console.log('PASS configurable wildlife, half-size models, local PDF paths, and fish jump lifecycle.');
