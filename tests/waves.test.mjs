import assert from 'node:assert/strict';
import {createWaveField, WATER_LEVEL, RIPPLE_COUNT} from '../dist/wave-field.js';

const seeded = seed => () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const field = createWaveField({random: seeded(918)});
const heights = [];
for (let x = -12; x <= 12; x += 2) for (let z = -12; z <= 12; z += 2) {
  const point = field.atParameter(x, z);
  const world = field.sample(point.x, point.z);
  assert.ok(Math.abs(point.height-world.height)<.00001, 'world-coordinate buoyancy matches the displaced surface');
  assert.ok(Math.hypot(world.x-point.x,world.z-point.z)<.00001, 'Gerstner inversion converges');
  assert.ok(point.normal[1]>.8, 'the lake does not fold or make inverted normals');
  const e=.00001, a=field.atParameter(x+e,z), b=field.atParameter(x,z+e);
  const tx=[(a.x-point.x)/e,(a.height-point.height)/e,(a.z-point.z)/e];
  const tz=[(b.x-point.x)/e,(b.height-point.height)/e,(b.z-point.z)/e];
  const n=[tz[1]*tx[2]-tz[2]*tx[1],tz[2]*tx[0]-tz[0]*tx[2],tz[0]*tx[1]-tz[1]*tx[0]];
  const length=Math.hypot(...n);
  assert.ok(n.every((v,i)=>Math.abs(v/length-point.normal[i])<.00001),'analytic normal agrees with finite differences');
  heights.push(point.height);
}
assert.ok(Math.max(...heights)-Math.min(...heights)>.25,'waves have actual vertical relief');
assert.ok(Math.abs(heights.reduce((a,b)=>a+b)/heights.length-WATER_LEVEL)<.05,'water oscillates about its mean level');
console.log('PASS geometric wave heights, analytic normals, and boat buoyancy inversion.');

let draws=0;
const rng=seeded(56), evolving=createWaveField({random:()=>{draws++;return rng();}});
const initialDraws=draws;
let last=evolving.sample(2,7).height;
for(let frame=0;frame<120*70;frame++){
  evolving.update(1/120);
  const next=evolving.sample(2,7).height;
  assert.ok(Math.abs(next-last)<.015,'gust transitions are continuous');
  assert.ok(evolving.snapshot().foldBound<.45,'all wind strengths keep the surface non-folding');
  last=next;
}
assert.ok(draws>initialDraws,'new random input drives wind during the session');
assert.ok(evolving.snapshot().windChanges>=2,'wind evolves beyond the initial random seed');
const paused=evolving.snapshot(),pausedHeight=evolving.sample(2,7);
for(let i=0;i<10;i++)evolving.update(0);
assert.deepEqual(evolving.snapshot(),paused,'pause freezes phase, gusts, and random events');
assert.deepEqual(evolving.sample(2,7),pausedHeight,'pause freezes the surface');
assert.notDeepEqual(createWaveField().snapshot().signature,createWaveField().snapshot().signature,'fresh visits receive independent wave conditions');
console.log('PASS fresh wave conditions, evolving wind, smooth gust transitions, and ambient pause.');

const rippled=createWaveField({random:seeded(37)}), control=createWaveField({random:seeded(37)});
rippled.splash(0,0,.06);rippled.update(.4);control.update(.4);
assert.ok(Math.abs(rippled.sample(.8,0).height-control.sample(.8,0).height)>.001,'splashes displace the surface');
for(let i=0;i<100;i++)rippled.splash(i,0,.04);
assert.equal(rippled.ripples.length,RIPPLE_COUNT,'ripple memory stays bounded');
rippled.update(6);control.update(6);
assert.equal(rippled.ripples.length,0,'ripples expire');
assert.deepEqual(rippled.sample(.8,0),control.sample(.8,0),'the undisturbed wave field remains after a splash expires');
console.log('PASS physical splash disturbances and bounded ripple lifecycle.');
