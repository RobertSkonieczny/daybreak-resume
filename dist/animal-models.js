import * as THREE from './vendor/three.module.js';

// All dimensions are meters. Animals face +Z and stand on y=0 at scale 1.
// The textures are data buffers, so model construction also works in Node.
const TAU = Math.PI * 2;
const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;
const UP = new THREE.Vector3(0, 1, 0);
const sphere = new THREE.SphereGeometry(1, 18, 12);
const shared = new Map();
function hash(x, y) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
  h = Math.imul(h ^ h >>> 13, 1274126177);
  return ((h ^ h >>> 16) >>> 0) / 4294967295;
}
function maps(kind = 'fur') {
  const key = `maps:${kind}`;
  if (shared.has(key)) return shared.get(key);
  const size = 128, albedo = new Uint8Array(size * size * 4), normal = new Uint8Array(albedo.length);
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x, u = x / size, v = y / size, n = hash(x, y);
    let light, relief;
    if (kind === 'shell') {
      let first = 100, second = 100;
      for (let cy = -1; cy < 5; cy++) for (let cx = -1; cx < 5; cx++) {
        const px = (cx + .5 + (cy % 2) * .5) / 4, py = (cy + .5) / 4;
        const d = Math.hypot((u - px) * 1.03, v - py);
        if (d < first) {second = first; first = d;} else if (d < second) second = d;
      }
      const edge = 1 - clamp((second - first) * 90, 0, 1);
      light = 224 + n * 21 - edge * 43 + Math.sin(first * 230) * 3;
      relief = .5 - edge * .13 + n * .012;
    } else if (kind === 'feather') {
      const barb = Math.sin(u * TAU * 23 + Math.abs(v - .5) * 30);
      light = 237 + barb * 4 + n * 12;
      relief = .5 + barb * .015 + n * .008;
    } else {
      const hair = Math.sin(x * 2.1 + Math.sin(y * .11 + x * .045) * 1.2);
      light = 236 + n * 13 + hair * 5;
      relief = .5 + hair * .016 + n * .009;
    }
    albedo.set([light, light, light, 255], i * 4); height[i] = relief;
  }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (height[y * size + (x + size - 1) % size] - height[y * size + (x + 1) % size]) * 3;
    const dy = (height[((y + size - 1) % size) * size + x] - height[((y + 1) % size) * size + x]) * 3;
    const length = Math.hypot(dx, dy, 1);
    normal.set([(dx / length * .5 + .5) * 255, (dy / length * .5 + .5) * 255, (1 / length * .5 + .5) * 255, 255], (y * size + x) * 4);
  }
  function texture(data, color) {
    const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true; t.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.needsUpdate = true; return t;
  }
  const result = {map: texture(albedo, true), normalMap: texture(normal, false)};
  shared.set(key, result); return result;
}
function material(color, kind = 'fur', vertexColors = false) {
  const key = `mat:${color}:${kind}:${vertexColors}`;
  if (!shared.has(key)) shared.set(key, new THREE.MeshStandardMaterial({
    ...(kind === 'plain' || kind === 'eye' ? {} : maps(kind)), color, vertexColors,
    roughness: kind === 'eye' ? .24 : kind === 'shell' ? .73 : .91,
    metalness: 0, normalScale: new THREE.Vector2(.32, .32),
  }));
  return shared.get(key);
}
function node(parent, x = 0, y = 0, z = 0) {
  const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g;
}
function mesh(parent, geometry, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geometry, mat); m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true; parent.add(m); return m;
}
function ellipsoid(parent, mat, x, y, z, rx, ry, rz) {
  const m = mesh(parent, sphere, mat, x, y, z); m.scale.set(rx, ry, rz); return m;
}
function catmull(a, b, c, d, t) {
  return .5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (3 * b - a - 3 * c + d) * t * t * t);
}
// A continuous cross-section surface, avoiding a stack of overlapping balls.
// Each profile is [z, halfWidth, halfHeight, centerY].
function loft(profiles, colorAt, rings = 32, sides = 20) {
  const position = [], uv = [], colors = [], indices = [];
  for (let r = 0; r <= rings; r++) {
    const t = r / rings, step = Math.min(profiles.length - 2, Math.floor(t * (profiles.length - 1)));
    const f = t * (profiles.length - 1) - step;
    const p = [Math.max(0, step - 1), step, step + 1, Math.min(profiles.length - 1, step + 2)].map(i => profiles[i]);
    const values = Array.from({length: 4}, (_, i) => catmull(p[0][i], p[1][i], p[2][i], p[3][i], f));
    for (let s = 0; s <= sides; s++) {
      const angle = s / sides * TAU, x = Math.sin(angle) * Math.max(.0001, values[1]);
      const y = values[3] + Math.cos(angle) * Math.max(.0001, values[2]);
      position.push(x, y, values[0]); uv.push(s / sides, t);
      if (colorAt) {const c = colorAt(Math.cos(angle), values[0], t, Math.sin(angle)); colors.push(c.r, c.g, c.b);}
      if (r < rings && s < sides) {const a = r * (sides + 1) + s; indices.push(a, a + sides + 1, a + 1, a + 1, a + sides + 1, a + sides + 2);}
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  if (colors.length) g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.setIndex(indices); g.computeVertexNormals(); return g;
}
function coat(top, belly, threshold = -.42) {
  const a = new THREE.Color(top), b = new THREE.Color(belly);
  return cosine => a.clone().lerp(b, clamp((threshold - cosine) * 2.2, 0, 1));
}
function combine(geometries) {
  const positions = [], normals = [], uv = [];
  for (const source of geometries) {
    const g = source.index ? source.toNonIndexed() : source;
    positions.push(...g.attributes.position.array); normals.push(...g.attributes.normal.array);
    uv.push(...g.attributes.uv.array); if (g !== source) g.dispose(); source.dispose();
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); return g;
}
function ovalGeometry(rx, ry, rz, x = 0, y = 0, z = 0) {
  const g = new THREE.SphereGeometry(1, 12, 8); g.scale(rx, ry, rz); g.translate(x, y, z); return g;
}
function taperedPath(points, radii, sides = 10) {
  const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
  const count = 28, frames = curve.computeFrenetFrames(count, false), positions = [], uv = [], index = [];
  for (let i = 0; i <= count; i++) {
    const t = i / count, center = curve.getPoint(t), f = t * (radii.length - 1), k = Math.min(radii.length - 2, Math.floor(f));
    const radius = Math.max(.0003, lerp(radii[k], radii[k + 1], f - k));
    for (let j = 0; j <= sides; j++) {
      const a = j / sides * TAU, p = center.clone().addScaledVector(frames.normals[i], Math.cos(a) * radius).addScaledVector(frames.binormals[i], Math.sin(a) * radius);
      positions.push(p.x, p.y, p.z); uv.push(j / sides, t);
      if (i < count && j < sides) {const n = i * (sides + 1) + j; index.push(n, n + 1, n + sides + 1, n + 1, n + sides + 2, n + sides + 1);}
    }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(index); g.computeVertexNormals(); return g;
}
function leafGeometry(height, width, depth, pointed = false) {
  const g = loft([[0,.001,.001,0],[height*.16,width*.78,depth,0],[height*.5,width,depth*.87,0],[height*.82,width*(pointed?.40:.65),depth*.5,0],[height,.001,.001,0]], null, 18, 12);
  // Loft travels +Z; upright ears travel +Y and bow naturally backwards.
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) - (p.getY(i) / height) ** 2 * height * .12);
  g.computeVertexNormals(); return g;
}

export function buildAnimal(species) {
  if (!['rabbit', 'fox', 'deer', 'duck', 'turtle'].includes(species)) throw new Error(`Unknown animal species: ${species}`);
  const root = new THREE.Group(); root.name = `animal:${species}`;
  const body = node(root), ears = [], legs = [], eyes = [];
  let head, neck, tail, neckLength = 0, neckBaseAngle = 0;
  const fur = material('#ffffff', 'fur', true), feather = material('#ffffff', 'feather', true);
  const dark = material('#272823', 'plain'), eyeMat = material('#161b17', 'eye');
  const params = {
    rabbit: {stride:.25, stepHeight:.029, duty:.58, breath:.0018},
    fox: {stride:.43, stepHeight:.038, duty:.64, breath:.0021},
    deer: {stride:.78, stepHeight:.060, duty:.67, breath:.0033},
    duck: {stride:.20, stepHeight:.027, duty:.66, breath:.0017},
    turtle: {stride:.12, stepHeight:.010, duty:.77, breath:.0005},
  }[species];
  function skin(parent, profiles, color, belly = color, kind = 'fur') {
    return mesh(parent, loft(profiles, coat(color, belly)), kind === 'feather' ? feather : fur);
  }
  function eyePair(x, y, z, radius) {
    for (const side of [-1, 1]) {
      const eye = ellipsoid(head, eyeMat, side*x, y, z, radius*.47, radius*.83, radius);
      eye.rotation.y = -side*.25; eyes.push({mesh: eye, height: radius*.83});
    }
  }
  function earPair(x, y, z, height, width, coatColor, insideColor, lean = .12, pointed = false) {
    for (const side of [-1, 1]) {
      const ear = node(head, side*x, y, z); ear.rotation.z = -side*lean;
      mesh(ear, leafGeometry(height, width, width*.25, pointed), material(coatColor));
      const inner = leafGeometry(height*.73, width*.60, width*.055, pointed);
      mesh(ear, inner, material(insideColor, 'plain'), 0, height*.11, width*.22);
      ear.userData = {side, lean: -side*lean}; ears.push(ear);
    }
  }
  function leg({x, y, z, footX=x, footZ=z, upper, lower, radius, color, lowerColor=color, footLength, footWidth, footHeight, front, side, phaseOffset, bend=front?1:-1, hoof=false, web=false}) {
    const hip = new THREE.Vector3(x, y, z), restFoot = new THREE.Vector3(footX, footHeight, footZ);
    const upperMesh = mesh(root, new THREE.CylinderGeometry(radius*.58, radius, 1, 10), material(color));
    const lowerMesh = mesh(root, new THREE.CylinderGeometry(radius*.37, radius*.55, 1, 10), material(lowerColor));
    let footGeometry;
    if (hoof) {
      footGeometry = combine([-1, 1].map(s => ovalGeometry(footWidth*.24, footHeight, footLength*.5, s*footWidth*.255, 0, footLength*.12)));
    } else if (web) {
      const shape = new THREE.Shape(); shape.moveTo(-footWidth*.20,-footLength*.23);
      shape.lineTo(-footWidth*.50,footLength*.42); shape.quadraticCurveTo(-footWidth*.26,footLength*.56,0,footLength*.40);
      shape.quadraticCurveTo(footWidth*.26,footLength*.56,footWidth*.50,footLength*.42);
      shape.lineTo(footWidth*.20,-footLength*.23); shape.closePath();
      footGeometry = new THREE.ExtrudeGeometry(shape,{depth:footHeight*1.4,bevelEnabled:true,bevelSize:footHeight*.2,bevelThickness:footHeight*.2,bevelSegments:1,steps:1,curveSegments:5});
      footGeometry.rotateX(Math.PI/2); footGeometry.translate(0,footHeight*.6,0);
    } else footGeometry = ovalGeometry(footWidth*.5, footHeight, footLength*.5, 0, 0, footLength*.13);
    const footMesh = mesh(root, footGeometry, material(hoof?'#45423a':lowerColor));
    const descriptor = {hip: hip.clone(), baseHip: hip, foot: restFoot.clone(), restFoot, length: upper + lower, upperLength: upper, lowerLength: lower, side, front, phaseOffset, bend, upperMesh, lowerMesh, footMesh, footHeight};
    legs.push(descriptor); return descriptor;
  }

  if (species === 'rabbit') {
    skin(body,[[-.19,.001,.001,.12],[-.12,.105,.10,.14],[-.02,.10,.092,.145],[.10,.069,.077,.145],[.16,.025,.042,.16],[.18,.001,.001,.17]],'#8d8474','#b7ad9c');
    head = node(body,0,.235,.135);
    skin(head,[[-.065,.001,.001,0],[-.035,.052,.059,0],[.014,.052,.053,0],[.057,.033,.025,-.019],[.084,.015,.017,-.019],[.09,.001,.001,-.018]],'#9b9080','#b9ae9c');
    eyePair(.050,.012,.018,.0073);
    ellipsoid(head,material('#69514a','plain'),0,-.014,.085,.010,.006,.006);
    earPair(.027,.044,-.013,.106,.020,'#9a8f7e','#9a7f73',.13);
    tail = node(body,0,.15,-.185); ellipsoid(tail,material('#c3bbaa'),0,0,-.018,.029,.033,.029);
    for (const side of [-1,1]) {
      leg({x:side*.070,y:.14,z:-.095,footX:side*.085,footZ:-.075,upper:.095,lower:.090,radius:.033,color:'#8c8170',lowerColor:'#a19483',footLength:.105,footWidth:.038,footHeight:.014,front:false,side,phaseOffset:0,bend:-1});
      leg({x:side*.046,y:.14,z:.10,footX:side*.052,footZ:.135,upper:.074,lower:.074,radius:.014,color:'#a39886',lowerColor:'#b4a894',footLength:.054,footWidth:.023,footHeight:.010,front:true,side,phaseOffset:.46,bend:1});
    }
  } else if (species === 'fox') {
    skin(body,[[-.30,.001,.001,.29],[-.22,.088,.11,.30],[-.08,.105,.115,.30],[.12,.096,.12,.31],[.26,.076,.10,.32],[.32,.027,.066,.35],[.34,.001,.001,.36]],'#a75e36','#b6a38b');
    neck = node(body,0,.345,.24); neckLength=.09;
    mesh(neck,taperedPath([[0,-.025,0],[0,.015,.04],[0,.055,.09]],[.070,.068,.046],14),material('#a86a41'));
    head = node(neck,0,.055,.09);
    skin(head,[[-.08,.001,.001,0],[-.04,.066,.073,0],[.025,.067,.061,0],[.08,.044,.036,-.024],[.145,.019,.019,-.034],[.161,.004,.011,-.035]],'#af6a3e','#d5c5a9');
    eyePair(.062,.013,.041,.0090);
    ellipsoid(head,dark,0,-.029,.157,.022,.014,.013);
    earPair(.047,.045,-.026,.100,.029,'#a7643b','#685a4c',.13,true);
    tail = node(body,0,.29,-.27);
    mesh(tail,taperedPath([[0,0,0],[.018,-.035,-.16],[.035,-.075,-.34],[.045,-.075,-.46]],[.035,.075,.065,.030],14),material('#a3633b'));
    mesh(tail,taperedPath([[.039,-.076,-.39],[.047,-.073,-.47],[.055,-.045,-.55]],[.056,.037,.001],14),material('#c1b7a1'));
    for (const side of [-1,1]) for (const front of [false,true]) leg({x:side*.067,y:.31,z:front?.21:-.20,footX:side*.071,footZ:front?.23:-.22,upper:.165,lower:.160,radius:front?.022:.034,color:'#a16a43',lowerColor:'#50473a',footLength:.064,footWidth:.040,footHeight:.018,front,side,phaseOffset:(side===1)==front?0:.5,bend:front?1:-1});
  } else if (species === 'deer') {
    skin(body,[[-.56,.001,.001,.79],[-.45,.18,.21,.81],[-.23,.20,.23,.82],[.02,.18,.22,.82],[.28,.17,.22,.84],[.42,.12,.17,.86],[.48,.001,.001,.88]],'#91734e','#b7a68b');
    neck = node(body,0,.87,.34); neckLength=.43;
    mesh(neck,taperedPath([[0,-.03,-.015],[0,.13,.065],[0,.29,.15],[0,.43,.215]],[.12,.105,.079,.059],18),material('#9c7d55'));
    head = node(neck,0,.43,.215);
    skin(head,[[-.095,.001,.001,.01],[-.05,.074,.085,.01],[.028,.078,.076,0],[.115,.055,.046,-.035],[.22,.044,.034,-.053],[.25,.025,.025,-.055]],'#a2845d','#c3b194');
    eyePair(.076,.013,.035,.012);
    ellipsoid(head,material('#4d4a40','plain'),0,-.051,.249,.040,.025,.019);
    earPair(.070,.047,-.045,.155,.043,'#a68c67','#b2a28a',.68);
    tail = node(body,0,.88,-.51);
    mesh(tail,taperedPath([[0,0,0],[0,-.015,-.095],[0,-.055,-.16]],[.038,.043,.004],12),material('#b2a187'));
    for (const side of [-1,1]) for (const front of [false,true]) leg({x:side*.116,y:.81,z:front?.31:-.38,footX:side*.126,footZ:front?.33:-.40,upper:front?.40:.43,lower:front?.395:.42,radius:front?.034:.052,color:'#967952',lowerColor:'#99876a',footLength:.10,footWidth:.056,footHeight:.025,front,side,phaseOffset:front?(side===-1?0:.5):(side===-1?.25:.75),bend:front?1:-1,hoof:true});
  } else if (species === 'duck') {
    skin(body,[[-.27,.001,.001,.19],[-.20,.075,.070,.20],[-.09,.118,.097,.215],[.065,.105,.095,.22],[.17,.072,.080,.24],[.21,.025,.041,.26],[.22,.001,.001,.27]],'#8d8d7f','#b3b1a1','feather');
    for (const side of [-1,1]) {
      const wing = mesh(body,loft([[-.23,.001,.001,.225],[-.15,.013,.043,.24],[-.06,.020,.065,.25],[.065,.016,.045,.255],[.10,.001,.001,.26]],coat('#727564','#8b8b79'),22,12),feather,side*.094,0,0);
      // Folded wings lie against the torso rather than protruding like paddles.
      wing.rotation.z=0;
    }
    neck = node(body,0,.25,.145); neckLength=.105;
    mesh(neck,taperedPath([[0,0,0],[0,.04,.025],[0,.10,.024]],[.043,.032,.035],14),material('#4b5d46','feather'));
    head = node(neck,0,.105,.028);
    skin(head,[[-.053,.001,.001,0],[-.025,.044,.055,0],[.018,.045,.050,0],[.052,.027,.029,-.012],[.063,.001,.001,-.02]],'#425c47','#4a6049','feather');
    eyePair(.041,.014,.021,.0058);
    skin(head,[[.047,.021,.014,-.018],[.079,.031,.012,-.024],[.124,.027,.008,-.029],[.134,.007,.005,-.028]],'#a79b51','#b1a463');
    tail=node(body,0,.22,-.21);
    mesh(tail,loft([[-.10,.001,.001,0],[-.065,.033,.009,0],[0,.051,.022,0],[.025,.001,.001,0]],coat('#4d584d','#777b68'),18,12),feather);
    for (const side of [-1,1]) leg({x:side*.062,y:.145,z:-.015,footX:side*.075,footZ:.015,upper:.077,lower:.073,radius:.009,color:'#a58444',lowerColor:'#ad8642',footLength:.073,footWidth:.053,footHeight:.006,front:true,side,phaseOffset:side===-1?0:.5,bend:-1,web:true});
  } else {
    skin(body,[[-.17,.001,.001,.04],[-.10,.102,.028,.043],[.025,.111,.028,.043],[.13,.082,.025,.043],[.17,.001,.001,.045]],'#696c49','#8c855b');
    const shell = new THREE.SphereGeometry(1,32,16,0,TAU,0,Math.PI/2);
    shell.scale(.126,.105,.173); const p=shell.attributes.position,uv=shell.attributes.uv;
    for(let i=0;i<p.count;i++)uv.setXY(i,p.getX(i)/.252+.5,p.getZ(i)/.346+.5);
    mesh(body,shell,material('#686247','shell'),0,.033,-.008);
    const rim=[];for(let i=0;i<=40;i++){const a=i/40*TAU;rim.push([Math.sin(a)*.126, .034, Math.cos(a)*.173-.008]);}
    mesh(body,taperedPath(rim,[.007,.007]),material('#7b7351','shell'));
    neck=node(body,0,.057,.135);neckLength=.038;
    mesh(neck,taperedPath([[0,0,0],[0,.006,.025],[0,.012,.052]],[.025,.022,.021],12),material('#6e7852'));
    head=node(neck,0,.012,.052);
    skin(head,[[-.026,.001,.001,0],[-.011,.026,.024,0],[.025,.027,.024,.002],[.053,.019,.015,-.003],[.06,.001,.001,-.004]],'#7d8760','#92976b');
    eyePair(.025,.010,.023,.0045);
    tail=node(body,0,.043,-.17);
    mesh(tail,taperedPath([[0,0,0],[.006,-.004,-.035],[.011,-.009,-.075]],[.011,.007,.0005],10),material('#747b52'));
    for(const side of [-1,1])for(const front of [false,true])leg({x:side*.085,y:.052,z:front?.095:-.10,footX:side*.142,footZ:front?.13:-.13,upper:.052,lower:.049,radius:.019,color:'#6e7750',lowerColor:'#79825b',footLength:.043,footWidth:.035,footHeight:.008,front,side,phaseOffset:(side===1)==front?0:.5,bend:side});
  }

  let locomotionBlend=0, grazeBlend=0, yawBlend=0, pitchBlend=0, alertBlend=.5;
  const bodyMatrix = new THREE.Matrix4(), target = new THREE.Vector3(), direction = new THREE.Vector3(), bendDirection = new THREE.Vector3(), knee = new THREE.Vector3();
  function limbBetween(part, a, b) {
    direction.subVectors(b,a); part.position.copy(a).add(b).multiplyScalar(.5);
    part.scale.y=direction.length(); part.quaternion.setFromUnitVectors(UP,direction.normalize());
  }
  function pose({phase=0,locomotion=0,speed=0,dt=1/60,graze=0,lookYaw=0,lookPitch=0,earAlert=.5,tailSway=0,breath=0,hop=0,blink=0,groundOffsets=[],groundPitch=0,groundRoll=0,behavior='idle'}={}) {
    const ease=dt<=0?1:1-Math.exp(-Math.min(dt,.15)*9), eased=(from,to)=>lerp(from,to,ease);
    locomotionBlend=eased(locomotionBlend,clamp(locomotion,0,1));grazeBlend=eased(grazeBlend,clamp(graze,0,1));
    yawBlend=eased(yawBlend,clamp(lookYaw,-.65,.65));pitchBlend=eased(pitchBlend,clamp(lookPitch,-.35,.45));alertBlend=eased(alertBlend,clamp(earAlert,0,1));
    body.position.y=hop+breath*params.breath+Math.sin(phase*2)*params.stepHeight*.07*locomotionBlend-(species==='deer'?grazeBlend*.05:0);
    body.rotation.x=groundPitch+(species==='duck'?Math.sin(phase*2)*.018*locomotionBlend:0);
    body.rotation.z=groundRoll+(species==='duck'?Math.sin(phase)*.055*locomotionBlend:Math.sin(phase)*.008*locomotionBlend);
    body.scale.set(1+breath*.003,1+breath*.004,1);
    if(neck){neck.rotation.x=neckBaseAngle+grazeBlend*(species==='deer'?2.4:species==='duck'?1.45:species==='fox'?1.35:.15);}
    head.rotation.y=yawBlend;
    head.rotation.x=pitchBlend+grazeBlend*(species==='deer'?-.90:species==='duck'?.25:species==='rabbit'?.86:species==='fox'?.28:.12);
    if(species==='duck'&&behavior==='preen'){
      neck.rotation.x=grazeBlend*.25;head.rotation.y=lerp(yawBlend,-1.7,grazeBlend);head.rotation.x=pitchBlend+grazeBlend*.45;
    }
    if(species==='rabbit'){
      const grooming=behavior==='groom';head.position.y=.235-grazeBlend*(grooming?.013:.075);
      head.position.z=.135+(grooming?0:grazeBlend*.040);
      if(grooming)head.rotation.x=pitchBlend+grazeBlend*.25;
    }
    ears.forEach((ear,i)=>{
      ear.rotation.z=ear.userData.lean+ear.userData.side*(1-alertBlend)*(species==='rabbit'?.23:.13);
      ear.rotation.x=(1-alertBlend)*-.16+Math.sin(phase*.31+i*2.1)*.025*locomotionBlend;
      ear.rotation.y=yawBlend*.20+ear.userData.side*(1-alertBlend)*.07;
    });
    if(tail){tail.rotation.y=clamp(tailSway,-.75,.75);tail.rotation.x=species==='deer'?alertBlend*.12:0;}
    eyes.forEach(e=>{e.mesh.scale.y=e.height*Math.max(.08,1-clamp(blink,0,1));});
    body.updateMatrix();bodyMatrix.copy(body.matrix);
    for(let i=0;i<legs.length;i++){
      const leg=legs[i], cycle=((phase/TAU+leg.phaseOffset)%1+1)%1;
      const duty=params.duty, stepSpan=params.stride*duty;
      let travel,lift=0;
      if(cycle<duty)travel=stepSpan*(.5-cycle/duty);
      else{const t=(cycle-duty)/(1-duty);travel=stepSpan*(-.5+t*t*(3-2*t));lift=Math.sin(t*Math.PI)*params.stepHeight;}
      leg.hip.copy(leg.baseHip).applyMatrix4(bodyMatrix);
      leg.foot.copy(leg.restFoot);
      leg.foot.z+=travel*locomotionBlend*(species==='rabbit'&&leg.front?.55:1);
      leg.foot.y+=lift*locomotionBlend+(Number.isFinite(groundOffsets[i])?groundOffsets[i]:0)+hop;
      if(species==='rabbit'&&behavior==='groom'&&leg.front){leg.foot.y+=grazeBlend*.12;leg.foot.z+=grazeBlend*.03;}
      if(species==='duck')leg.foot.x+=leg.side*Math.sin(cycle*Math.PI)*.006*locomotionBlend;
      target.copy(leg.foot);direction.subVectors(target,leg.hip);
      const distance=clamp(direction.length(),Math.abs(leg.upperLength-leg.lowerLength)+.0001,leg.length*.999);
      direction.normalize();
      const along=(leg.upperLength**2-leg.lowerLength**2+distance**2)/(2*distance);
      const across=Math.sqrt(Math.max(0,leg.upperLength**2-along**2));
      bendDirection.set(species==='turtle'?leg.side:0,0,species==='turtle'?(leg.front?-.3:.3):leg.bend);
      bendDirection.addScaledVector(direction,-bendDirection.dot(direction)).normalize();
      knee.copy(leg.hip).addScaledVector(direction,along).addScaledVector(bendDirection,across);
      limbBetween(leg.upperMesh,leg.hip,knee);limbBetween(leg.lowerMesh,knee,target);
      leg.footMesh.position.copy(target);leg.footMesh.rotation.x=groundPitch*.5-lift/Math.max(.001,params.stepHeight)*.22*locomotionBlend;
      leg.footMesh.rotation.z=groundRoll*.5;
    }
    root.updateMatrixWorld(true);
  }
  pose({dt:0});
  const bounds=new THREE.Box3().setFromObject(root,true),size=bounds.getSize(new THREE.Vector3());
  return {root,body,head,neck,tail,ears,legs,species,pose,eyes,
    dimensions:{height:size.y,length:size.z,width:size.x},gait:{stride:params.stride,stepHeight:params.stepHeight},neckLength};
}

function troutMaterial() {
  if(shared.has('trout-material'))return shared.get('trout-material');
  const size=128,data=new Uint8Array(size*size*4),normal=new Uint8Array(data.length);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const u=x/size,v=y/size,cx=Math.floor(u*13),cy=Math.floor(v*27);
    const sx=u*13-cx-(.22+hash(cx,cy)*.56),sy=v*27-cy-(.22+hash(cx+51,cy)*.56);
    const spotted=hash(cx+117,cy)<.16&&Math.hypot(sx,sy)<.15&&Math.cos(u*TAU)>-.57;
    const scale=Math.cos(u*TAU*39+Math.sin(v*TAU*28)*1.1),grain=hash(x,y);
    const value=233+scale*5+grain*13;
    const color=spotted?(hash(cx+71,cy)>.78?[112,79,59,255]:[75,79,64,255]):[value,value,value,255];
    data.set(color,(y*size+x)*4);normal.set([127+scale*5,127+Math.sin(v*TAU*28)*4,254,255],(y*size+x)*4);
  }
  function texture(bytes,color){const t=new THREE.DataTexture(bytes,size,size,THREE.RGBAFormat);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.minFilter=THREE.LinearMipmapLinearFilter;t.magFilter=THREE.LinearFilter;t.generateMipmaps=true;t.colorSpace=color?THREE.SRGBColorSpace:THREE.NoColorSpace;t.needsUpdate=true;return t;}
  const mat=new THREE.MeshPhysicalMaterial({color:'#ffffff',vertexColors:true,map:texture(data,true),normalMap:texture(normal,false),normalScale:new THREE.Vector2(.22,.22),roughness:.43,metalness:.04,clearcoat:.22,clearcoatRoughness:.27});
  shared.set('trout-material',mat);return mat;
}
function fishFinMaterial(){
  if(shared.has('fish-fin-material'))return shared.get('fish-fin-material');
  const size=64,data=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const angle=Math.atan2(x-size*.5,y+12),rays=Math.pow(Math.max(0,Math.cos(angle*49)),6),light=214+rays*27;
    data.set([light,light,light,235],(y*size+x)*4);
  }
  const map=new THREE.DataTexture(data,size,size,THREE.RGBAFormat);map.colorSpace=THREE.SRGBColorSpace;map.minFilter=THREE.LinearFilter;map.magFilter=THREE.LinearFilter;map.needsUpdate=true;
  const mat=new THREE.MeshStandardMaterial({color:'#929271',map,roughness:.57,transparent:true,opacity:.76,side:THREE.DoubleSide,depthWrite:false});
  shared.set('fish-fin-material',mat);return mat;
}
function finGeometry(outline){
  const shape=new THREE.Shape();outline.forEach(([z,y],i)=>i?shape.lineTo(-z,y):shape.moveTo(-z,y));shape.closePath();
  const g=new THREE.ShapeGeometry(shape,3);g.rotateY(Math.PI/2);g.computeBoundingBox();
  const box=g.boundingBox,size=box.getSize(new THREE.Vector3()),p=g.attributes.position,uv=g.attributes.uv;
  for(let i=0;i<p.count;i++)uv.setXY(i,(p.getZ(i)-box.min.z)/Math.max(.0001,size.z),(p.getY(i)-box.min.y)/Math.max(.0001,size.y));
  return g;
}

export function buildFish(){
  const root=new THREE.Group();root.name='lake-trout';
  const top=new THREE.Color('#69745b'),side=new THREE.Color('#9ba48a'),belly=new THREE.Color('#ced0b7');
  const bodyGeometry=loft([[-.185,.010,.020,0],[-.135,.026,.046,.004],[-.055,.039,.061,.009],[.045,.037,.058,.010],[.13,.027,.041,.006],[.188,.015,.023,.002],[.215,.001,.002,0]],cosine=>cosine>0?side.clone().lerp(top,cosine):side.clone().lerp(belly,-cosine),38,24);
  const body=mesh(root,bodyGeometry,troutMaterial());
  const original=bodyGeometry.attributes.position.array.slice(),fins=[],eyes=[];
  const finMat=fishFinMaterial();
  function fin(parent,outline,x=0,y=0,z=0){const m=mesh(parent,finGeometry(outline),finMat,x,y,z);m.castShadow=false;return m;}
  function attachedFin(outline,x,y,z,angle=0){const m=fin(root,outline,x,y,z);m.rotation.y=angle;fins.push({mesh:m,x,z,angle});return m;}
  attachedFin([[.055,.043],[.007,.114],[-.039,.099],[-.077,.048]],0,0,0);
  attachedFin([[-.112,.030],[-.130,.060],[-.153,.050],[-.159,.026]],0,0,0);
  attachedFin([[-.07,-.042],[-.103,-.085],[-.14,-.071],[-.144,-.027]],0,0,0);
  for(const sideSign of [-1,1]){
    attachedFin([[0,0],[-.063,-.034],[-.039,-.043],[-.010,-.015]],sideSign*.031,-.020,.085,-sideSign*1.02);
    attachedFin([[0,0],[-.040,-.028],[-.025,-.033],[-.006,-.011]],sideSign*.021,-.044,-.041,-sideSign*.8);
    const eye=ellipsoid(root,material('#19211c','eye'),sideSign*.026,.016,.141,.0028,.0053,.0053);eye.rotation.y=-sideSign*.12;eyes.push({mesh:eye,x:sideSign*.026,z:.141});
  }
  const tail=node(root,0,0,-.18);
  fin(tail,[[0,.015],[-.052,.066],[-.105,.082],[-.068,.002],[-.105,-.073],[-.054,-.064],[0,-.014]]);
  const mouth=mesh(root,new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(-.011,-.006,.194),new THREE.Vector3(0,-.008,.202),new THREE.Vector3(.011,-.006,.194)]),8,.0008,4,false),material('#495043','plain'));
  function curveX(z,bend){return Math.pow(clamp((.215-z)/.40,0,1),1.5)*bend*.020;}
  function pose({bend=0,tail:tailAngle=0}={}){
    bend=clamp(bend,-1,1);const p=bodyGeometry.attributes.position;
    for(let i=0;i<p.count;i++)p.setXYZ(i,original[i*3]+curveX(original[i*3+2],bend),original[i*3+1],original[i*3+2]);
    p.needsUpdate=true;bodyGeometry.computeVertexNormals();
    tail.position.x=curveX(-.18,bend);tail.rotation.y=clamp(tailAngle,-.85,.85)-bend*.08;
    fins.forEach(f=>{f.mesh.position.x=f.x+curveX(f.z,bend);f.mesh.rotation.y=f.angle-bend*.07;});
    eyes.forEach(e=>{e.mesh.position.x=e.x+curveX(e.z,bend);});mouth.position.x=curveX(.198,bend);
    root.updateMatrixWorld(true);
  }
  pose({});
  const dimensions=new THREE.Box3().setFromObject(root,true).getSize(new THREE.Vector3());
  return{root,body,tail,pose,length:dimensions.z,dimensions:{height:dimensions.y,length:dimensions.z,width:dimensions.x}};
}
