// Locally generated materials and batched scenery. No image requests are needed.
// Pines are static instances in their parent; their returned group is a location
// marker, rather than a transformable copy of the shared branch/needle meshes.
export function createNaturalAssets(THREE, renderer) {
  const TAU = Math.PI * 2;
  const anisotropy = Math.min(8, renderer?.capabilities?.getMaxAnisotropy?.() || 1);
  const fract = n => n - Math.floor(n);
  const mix = (a, b, t) => a + (b - a) * t;
  const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
  const seeded = seed => () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const hash = (x, y) => {
    let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  };
  function noise(u, v, period = 16) {
    const x = Math.floor(u), y = Math.floor(v);
    const wrap = n => ((n % period) + period) % period;
    const tx = fract(u), ty = fract(v), sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    return mix(mix(hash(wrap(x), wrap(y)), hash(wrap(x + 1), wrap(y)), sx),
      mix(hash(wrap(x), wrap(y + 1)), hash(wrap(x + 1), wrap(y + 1)), sx), sy);
  }
  function fbm(u, v) {
    return noise(u * 4, v * 4, 4) * .5 + noise(u * 16, v * 16, 16) * .28 +
      noise(u * 64, v * 64, 64) * .15 + noise(u * 128, v * 128, 128) * .07;
  }
  function texture(data, size, color = false) {
    const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = anisotropy;
    t.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.needsUpdate = true;
    return t;
  }
  function surface(size, sample, strength = 2, repeat = 1) {
    const color = new Uint8Array(size * size * 4), normal = new Uint8Array(color.length);
    const roughness = new Uint8Array(color.length), heights = new Float32Array(size * size);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const i = y * size + x, p = sample(x / size, y / size, x, y);
      color.set([p[0], p[1], p[2], 255], i * 4);
      roughness.set([p[4], p[4], p[4], 255], i * 4);
      heights[i] = p[3];
    }
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const left = heights[y * size + (x + size - 1) % size], right = heights[y * size + (x + 1) % size];
      const bottom = heights[((y + size - 1) % size) * size + x], top = heights[((y + 1) % size) * size + x];
      const dx = (left - right) * strength, dy = (bottom - top) * strength, length = Math.hypot(dx, dy, 1);
      normal.set([(dx / length * .5 + .5) * 255, (dy / length * .5 + .5) * 255, (1 / length * .5 + .5) * 255, 255], (y * size + x) * 4);
    }
    const maps = {map: texture(color, size, true), normalMap: texture(normal, size), roughnessMap: texture(roughness, size)};
    Object.values(maps).forEach(t => t.repeat.setScalar(repeat));
    return maps;
  }

  const woodMaps = surface(512, (u, v, x, y) => {
    const coarse = noise(u * 8, v * 8, 8), grainNoise = noise(u * 64, v * 8, 64);
    const knotX = Math.sin((u - .33) * Math.PI), knotY = Math.sin((v - .47) * Math.PI);
    const knot = Math.exp(-(knotX * knotX * 75 + knotY * knotY * 25));
    const flow = u + .012 * Math.sin(v * TAU * 2) + .007 * Math.sin(v * TAU * 5) + knot * .065;
    const lines = Math.pow(Math.max(0, Math.sin(flow * TAU * 11 + coarse * 4.1 + grainNoise * .6)), 9);
    const fine = Math.pow(Math.max(0, Math.sin(flow * TAU * 113 + grainNoise * 2)), 8);
    const pore = hash(x, y), faded = noise(u * 4, v * 4, 4);
    const weather = noise(u * 16, v * 4, 16);
    const value = coarse * 18 + faded * 14 + weather * 9 - lines * 8 - fine * 2.4 - knot * 10 + (pore - .5) * 6;
    return [177 + value, 139 + value * .92, 95 + value * .73, .48 - lines * .028 - fine * .01 + pore * .012 + grainNoise * .022, 201 + weather * 16 + pore * 22];
  }, 2.3);
  const barkMaps = surface(256, (u, v, x, y) => {
    const n = fbm(u, v), split = Math.pow(Math.max(0, Math.sin((u * 19 + noise(u * 8, v * 8, 8) * .85) * TAU)), 12);
    const ridge = noise(u * 64, v * 16, 64), p = hash(x, y);
    const light = n * 42 + ridge * 16 - split * 39 + p * 9;
    return [56 + light, 47 + light * .83, 35 + light * .72, n * .35 + ridge * .2 - split * .4 + p * .05, 222 + p * 29];
  }, 3.8, 2);
  const stoneMaps = surface(256, (u, v, x, y) => {
    const n = fbm(u, v), mineral = noise(u * 32, v * 32, 32), p = hash(x, y);
    const vein = Math.pow(Math.max(0, 1 - Math.abs(noise(u * 16, v * 16, 16) - .48) * 24), 3);
    const light = n * 53 + p * 17 + mineral * 12 - vein * 13;
    return [96 + light, 94 + light, 83 + light * .94, n * .5 + mineral * .15 + p * .07 - vein * .10, 196 + p * 50];
  }, 3.2);
  const groundMaps = surface(256, (u, v, x, y) => {
    const n = fbm(u, v), moss = noise(u * 8, v * 8, 8), p = hash(x, y);
    const mossy = clamp((moss - .35) * 3), light = n * 35 + p * 17;
    return [61 + light - mossy * 11, 48 + light + mossy * 10, 30 + light * .65, n * .5 + p * .15, 220 + p * 32];
  }, 2.8, 7);
  const sandMaps = surface(256, (u, v, x, y) => {
    const n = fbm(u, v), p = hash(x, y), pebble = p > .985 ? -34 : 0;
    return [133 + n * 29 + p * 18 + pebble, 119 + n * 26 + p * 15 + pebble, 94 + n * 25 + p * 12 + pebble, n * .2 + p * .13, 230 + p * 25];
  }, 2.7, 8);
  const standard = opts => new THREE.MeshStandardMaterial({roughness: 1, metalness: 0, ...opts});
  const materials = {
    wood: standard({...woodMaps, color: '#cfb18a', normalScale: new THREE.Vector2(.7, .7)}),
    woodLight: standard({...woodMaps, color: '#fff0d6', normalScale: new THREE.Vector2(.65, .65)}),
    woodDark: standard({...woodMaps, color: '#89715c', normalScale: new THREE.Vector2(.8, .8)}),
    trim: new THREE.MeshPhysicalMaterial({...woodMaps, color: '#e7cb9f', roughness: .8, clearcoat: .16, clearcoatRoughness: .45}),
    bark: standard({...barkMaps, color: '#d5c3ac'}),
    stone: standard({...stoneMaps, color: '#d3d2ca', normalScale: new THREE.Vector2(.8, .8)}),
    sand: standard({...sandMaps, color: '#e2d9c1'}),
    ground: standard({...groundMaps, color: '#d7d5b8'}),
    brass: new THREE.MeshStandardMaterial({color: '#9f8351', roughness: .38, metalness: .78}),
  };
  for (const key of ['wood', 'woodLight', 'woodDark', 'trim']) materials[key].userData.woodGrain = true;

  // Draw real needle sprays into one shared cutout texture. Two crossed sprays
  // on each branch give the crown depth without thousands of individual needles.
  function needleTexture() {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
    const c = canvas.getContext('2d'), rng = seeded(23511);
    c.lineCap = 'round';
    c.strokeStyle = '#596149'; c.lineWidth = 5;
    c.beginPath(); c.moveTo(254, 505); c.quadraticCurveTo(246, 270, 269, 17); c.stroke();
    const needleColors = ['#56664f', '#52634e', '#617058', '#596b53', '#66755c', '#4d614b'];
    function needle(ax, ay, bx, by, width) {
      c.strokeStyle = needleColors[Math.floor(rng() * needleColors.length)]; c.lineWidth = width;
      c.beginPath(); c.moveTo(ax, ay); c.quadraticCurveTo(mix(ax, bx, .55) - 2, mix(ay, by, .55), bx, by); c.stroke();
    }
    for (let i = 0; i < 35; i++) {
      const t = i / 35, y = 472 - t * 424, stemX = 253 + t * 14;
      for (const side of [-1, 1]) {
        const length = (40 + Math.sin(t * Math.PI) * 107) * (.72 + rng() * .4);
        const endX = stemX + side * length, endY = y - 29 - rng() * 31;
        // Closely overlapping needle bundles give each spray opaque volume.
        // Fine needles alone become screen-door glitter and vanish in mipmaps.
        // The serrated edge remains cut out, while interior alpha stays solid.
        c.fillStyle = i % 3 === 0 ? '#50604b' : '#53634d';
        c.beginPath();
        c.moveTo(stemX - side * 7, y + 11);
        c.lineTo(mix(stemX, endX, .25), mix(y, endY, .25) + 12);
        c.lineTo(mix(stemX, endX, .53), mix(y, endY, .53) + 15);
        c.lineTo(mix(stemX, endX, .79), mix(y, endY, .79) + 9);
        c.lineTo(endX + side * 10, endY - 2);
        c.lineTo(mix(stemX, endX, .76), mix(y, endY, .76) - 15);
        c.lineTo(mix(stemX, endX, .41), mix(y, endY, .41) - 17);
        c.lineTo(stemX + side * 3, y - 8);
        c.closePath(); c.fill();
        c.strokeStyle = '#55634b'; c.lineWidth = 2;
        c.beginPath(); c.moveTo(stemX, y); c.lineTo(endX, endY); c.stroke();
        for (let j = 1; j <= 9; j++) {
          const s = j / 10, nx = mix(stemX, endX, s), ny = mix(y, endY, s), length = 16 + rng() * 23;
          needle(nx, ny, nx + side * (9 + rng() * 12), ny - length, 2.1 + rng() * 1.3);
          needle(nx, ny, nx + side * length * .95, ny + 3 + rng() * 11, 1.9 + rng());
        }
      }
    }
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = anisotropy;
    return map;
  }
  function distantCrownTexture() {
    const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 512;
    const c = canvas.getContext('2d'), rng = seeded(3917);
    // Whole-crown coverage survives minification. Individual needle cards are
    // much smaller than a pixel at the far shore and cannot hold a silhouette.
    c.fillStyle = '#50624f';
    c.beginPath(); c.moveTo(125, 9); c.lineTo(170, 271); c.lineTo(192, 471);
    c.lineTo(60, 463); c.lineTo(87, 252); c.closePath(); c.fill();
    for (let level = 0; level < 28; level++) {
      const t = level / 28, y = 474 - t * 449, center = 127 + Math.sin(t * 5) * 4;
      const span = (1 - t) ** .78 * 114 + 4;
      for (const side of [-1, 1]) {
        const length = span * (.74 + rng() * .26), tipX = center + side * length, tipY = y + 7 + rng() * 18;
        c.fillStyle = ['#52644f', '#485d4b', '#576950', '#4e624e'][Math.floor(rng() * 4)];
        c.beginPath(); c.moveTo(center - side * 4, y - 32);
        c.lineTo(center + side * length * .34, y - 19);
        c.lineTo(center + side * length * .64, y - 5);
        c.lineTo(tipX, tipY); c.lineTo(tipX - side * 13, tipY + 5);
        c.lineTo(tipX - side * 23, tipY + 1); c.lineTo(tipX - side * 27, tipY + 9);
        c.lineTo(center + side * length * .45, y + 13); c.lineTo(center, y + 10);
        c.closePath(); c.fill();
        // A few short terminal tufts soften the branch outline, without the
        // high-frequency transparent holes that caused screen-door glitter.
        c.strokeStyle = c.fillStyle; c.lineWidth = 3;
        for (let tuft = 0; tuft < 4; tuft++) {
          const s = .5 + tuft * .125, px = mix(center, tipX, s), py = mix(y, tipY, s);
          c.beginPath(); c.moveTo(px, py); c.lineTo(px + side * (3 + rng() * 8), py - 9 - rng() * 6); c.stroke();
        }
      }
    }
    const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = anisotropy;
    return map;
  }
  const needles = new THREE.MeshPhysicalMaterial({map: needleTexture(), side: THREE.DoubleSide, alphaTest: .28, alphaToCoverage: false, color: '#c5ceb7', roughness: 1, specularIntensity: .08});
  // Modest leaf backscatter keeps backlit crowns from becoming opaque polygons.
  needles.onBeforeCompile = shader => {
    // Crown normals describe the volume of the needles, not the intersecting
    // flat cards. Keep that normal on both sides to avoid bright checker facets.
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>',
      '#include <normal_fragment_begin>\n#ifdef DOUBLE_SIDED\nnormal *= faceDirection;\n#endif');
    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>',
      'outgoingLight += diffuseColor.rgb * 0.018;\n#include <opaque_fragment>');
  };
  needles.customProgramCacheKey = () => 'natural-conifer-needles-3';
  const needleDepth = new THREE.MeshDepthMaterial({map: needles.map, alphaTest: .28, depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide});
  const farNeedles = needles.clone(); farNeedles.map = distantCrownTexture();
  farNeedles.onBeforeCompile = needles.onBeforeCompile;
  farNeedles.customProgramCacheKey = () => 'natural-conifer-distant-crowns-1';

  function mergedGeometry(parts) {
    const positions = [], normals = [], uvs = [];
    for (const geometry of parts) {
      const g = geometry.index ? geometry.toNonIndexed() : geometry;
      positions.push(...g.attributes.position.array); normals.push(...g.attributes.normal.array);
      if (g.attributes.uv) uvs.push(...g.attributes.uv.array);
      else for (let i = 0; i < g.attributes.position.count; i++) uvs.push(0, 0);
      if (g !== geometry) g.dispose();
      geometry.dispose();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.computeBoundingSphere();
    return g;
  }
  const up = new THREE.Vector3(0, 1, 0);
  function branch(a, b, bottom, top, segments = 5) {
    const d = b.clone().sub(a), g = new THREE.CylinderGeometry(top, bottom, d.length(), segments, 1);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, d.normalize()));
    g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    return g;
  }
  function crownGeometry(seed, far) {
    const rng = seeded(seed), branches = [], leaves = [];
    const tip = new THREE.Vector3((rng() - .5) * .025, 1, (rng() - .5) * .025);
    branches.push(branch(new THREE.Vector3(), tip, .023, .002, far ? 5 : 7));
    if (far) {
      for (let side = 0; side < 3; side++) {
        const g = new THREE.PlaneGeometry(.59, .94);
        g.translate(0, .53, 0); g.rotateY(side * Math.PI / 3);
        const p = g.attributes.position, n = g.attributes.normal;
        for (let i = 0; i < p.count; i++) {
          const normal = new THREE.Vector3(p.getX(i), .26, p.getZ(i)).normalize();
          n.setXYZ(i, normal.x, normal.y, normal.z);
        }
        leaves.push(g);
      }
      return {branches: mergedGeometry(branches), leaves: mergedGeometry(leaves)};
    }
    const levels = far ? 5 : 10;
    function spray(origin, direction, length, width, twist) {
      const q = new THREE.Quaternion().setFromUnitVectors(up, direction.clone().normalize());
      for (let side = 0; side < 2; side++) {
        const g = new THREE.PlaneGeometry(width, length);
        g.translate(0, length * .5, 0);
        g.rotateY(twist + side * Math.PI * .5);
        g.applyQuaternion(q); g.translate(origin.x, origin.y, origin.z);
        const positions = g.attributes.position, normals = g.attributes.normal;
        for (let i = 0; i < positions.count; i++) {
          const n = new THREE.Vector3(positions.getX(i), .16, positions.getZ(i)).normalize();
          normals.setXYZ(i, n.x, n.y, n.z);
        }
        leaves.push(g);
      }
    }
    for (let level = 0; level < levels; level++) {
      const y = .14 + level / levels * .76, branchCount = far ? 5 : 7;
      const rotation = rng() * TAU;
      for (let j = 0; j < branchCount; j++) {
        const angle = rotation + j / branchCount * TAU + (rng() - .5) * .25;
        const length = (.30 * (1 - y) + .012) * (.75 + rng() * .38);
        const start = new THREE.Vector3(tip.x * y, y + (rng() - .5) * .066, tip.z * y);
        const end = new THREE.Vector3(Math.cos(angle) * length, start.y - .037 + rng() * .065, Math.sin(angle) * length);
        const mid = start.clone().lerp(end, .58); mid.y -= .025;
        if (!far) {
          branches.push(branch(start, mid, .006 * (1 - y), .003));
          branches.push(branch(mid, end, .003, .0008));
        }
        const count = far ? 2 : 5;
        for (let k = 0; k < count; k++) {
          const t = .28 + k / count * .71, p = start.clone().lerp(end, t);
          p.y -= Math.sin(t * Math.PI) * .018;
          const side = k % 2 ? 1 : -1, shootAngle = angle + side * (.38 + rng() * .3);
          const d = new THREE.Vector3(Math.cos(shootAngle), -.15 + rng() * .75, Math.sin(shootAngle));
          spray(p, d, (far ? .20 : .14) * (.67 + rng() * .45) * (1.10 - y * .43), (far ? .15 : .105) * (1 - y * .44), rng() * Math.PI);
        }
      }
    }
    for (let i = 0; i < 3; i++) {
      const angle = i / 3 * TAU;
      spray(new THREE.Vector3(tip.x * .86, .83, tip.z * .86), new THREE.Vector3(Math.cos(angle) * .18, 1, Math.sin(angle) * .18), .18, .065, angle);
    }
    return {branches: mergedGeometry(branches), leaves: mergedGeometry(leaves)};
  }
  const crowns = {near: [], far: []}, forestPools = new WeakMap();
  const treeMatrix = new THREE.Matrix4(), treeRotation = new THREE.Quaternion(), treeColor = new THREE.Color();
  let pineNumber = 0;
  function instancePool(parent, type, variant) {
    let pools = forestPools.get(parent);
    if (!pools) {pools = new Map(); forestPools.set(parent, pools);}
    const key = `${type}-${variant}`;
    let list = pools.get(key);
    if (!list) {list = []; pools.set(key, list);}
    let pool = list[list.length - 1];
    if (!pool || pool.count >= pool.capacity) {
      const far = type === 'far', capacity = far ? 128 : 32;
      const geometry = crowns[type][variant] ||= crownGeometry(109 + variant * 183, far);
      const trunk = new THREE.InstancedMesh(geometry.branches, materials.bark, capacity);
      const foliage = new THREE.InstancedMesh(geometry.leaves, far ? farNeedles : needles, capacity);
      trunk.count = foliage.count = 0;
      trunk.name = 'conifer-branches'; foliage.name = 'conifer-needle-sprays';
      for (const m of [trunk, foliage]) {m.castShadow = !far; m.receiveShadow = !far; m.frustumCulled = false; parent.add(m);}
      foliage.customDepthMaterial = needleDepth;
      pool = {trunk, foliage, count: 0, capacity}; list.push(pool);
    }
    return pool;
  }
  function createPine(x, z, height, parent, y = 0, options = {}) {
    const rng = options.random || seeded(options.seed ?? (Math.round(x * 391 + z * 179 + height * 257) ^ 8171));
    const far = options.far ?? (Math.hypot(x, z) > 140), type = far || options.lod === 'far' ? 'far' : 'near';
    const variant = Math.floor(rng() * 3), pool = instancePool(parent, type, variant), index = pool.count++;
    treeRotation.setFromAxisAngle(up, rng() * TAU);
    const width = height * (.88 + rng() * .22);
    treeMatrix.compose(new THREE.Vector3(x, y, z), treeRotation, new THREE.Vector3(width, height, width));
    pool.trunk.setMatrixAt(index, treeMatrix); pool.foliage.setMatrixAt(index, treeMatrix);
    const shade = .76 + rng() * .24; treeColor.setRGB(shade * .94, shade, shade * .87);
    pool.foliage.setColorAt(index, treeColor);
    for (const m of [pool.trunk, pool.foliage]) {m.count = pool.count; m.instanceMatrix.needsUpdate = true;}
    pool.foliage.instanceColor.needsUpdate = true;
    const marker = new THREE.Group(); marker.position.set(x, y, z); marker.name = `conifer-${++pineNumber}`;
    marker.userData = {height, batched: true, lod: type}; parent.add(marker); return marker;
  }

  const rockGeometries = Array.from({length: 4}, (_, index) => {
    const g = new THREE.IcosahedronGeometry(1, 2), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const shape = 1 + Math.sin(x * 4.2 + index) * Math.sin(y * 5.1 + z * 3.3) * .15 + Math.cos(x * 7.1 + z * 4.3 + index) * .06;
      p.setXYZ(i, x * shape, Math.max(-.65, y * shape * .77), z * shape * .9);
    }
    g.computeVertexNormals();
    // The icosahedron's UV seams duplicate vertices; average their normals so
    // glacial boulders stay smooth instead of showing the source triangles.
    const normals = g.attributes.normal, average = new Map(), keys = [];
    for (let i = 0; i < p.count; i++) {
      const key = `${p.getX(i).toFixed(5)},${p.getY(i).toFixed(5)},${p.getZ(i).toFixed(5)}`;
      keys.push(key);
      const n = average.get(key) || new THREE.Vector3();
      n.x += normals.getX(i); n.y += normals.getY(i); n.z += normals.getZ(i); average.set(key, n);
    }
    for (const n of average.values()) n.normalize();
    for (let i = 0; i < p.count; i++) {const n = average.get(keys[i]); normals.setXYZ(i, n.x, n.y, n.z);}
    g.computeBoundingSphere(); return g;
  });
  function createRock(x, z, size, parent, y = 0, options = {}) {
    const rng = options.random || seeded(options.seed ?? Math.round(x * 193 + z * 733 + size * 421));
    const rock = new THREE.Mesh(rockGeometries[Math.floor(rng() * rockGeometries.length)], materials.stone);
    rock.position.set(x, y, z); rock.rotation.set((rng() - .5) * .22, rng() * TAU, (rng() - .5) * .25);
    rock.scale.set(size * (1 + rng() * .4), size, size * (.8 + rng() * .3));
    rock.castShadow = rock.receiveShadow = true; parent.add(rock); return rock;
  }

  // Use this height for the original elliptical island; a custom height callback
  // can be supplied when the island's terrain shape changes.
  const islandHeight = (x, z) => {
    const beach = -1.8 + 3.3 * Math.sqrt(Math.max(0, 1 - (x / 12) ** 2 - (z / 8.5) ** 2));
    const soil = -1 + 3 * Math.sqrt(Math.max(0, 1 - (x / 10.6) ** 2 - (z / 7.2) ** 2));
    return Math.max(beach, soil);
  };
  function grassGeometry(reeds = false) {
    const positions = [], colors = [], indices = [], rng = seeded(reeds ? 4851 : 954);
    for (let blade = 0; blade < (reeds ? 7 : 9); blade++) {
      const a = rng() * TAU, spread = rng() * (reeds ? .13 : .22), height = (reeds ? .75 : .30) + rng() * (reeds ? .85 : .45);
      const width = reeds ? .014 : .021 + rng() * .009, bend = .1 + rng() * .27;
      const base = positions.length / 3, direction = a + .5;
      for (let segment = 0; segment < 4; segment++) {
        const t = segment / 3, x = Math.cos(a) * (spread + bend * t * t), z = Math.sin(a) * (spread + bend * t * t);
        for (const side of [-1, 1]) {
          positions.push(x + Math.cos(direction) * width * (1 - t) * side, t * height, z + Math.sin(direction) * width * (1 - t) * side);
          colors.push(.54 + t * .28, .56 + t * .24, .33 + t * .18);
        }
        if (segment < 3) {const k = base + segment * 2; indices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);}
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); g.setIndex(indices); g.computeVertexNormals(); return g;
  }
  const grass = grassGeometry(), reeds = grassGeometry(true);
  const grassMaterial = standard({vertexColors: true, side: THREE.DoubleSide, color: '#899067'});
  const reedsMaterial = standard({vertexColors: true, side: THREE.DoubleSide, color: '#b0a571'});
  function dressIsland(parent, index = 0, animalPositions = [], options = {}) {
    const rng = seeded(903 + index * 1723), heightAt = options.heightAt || islandHeight;
    const counts = {grass: 95, reeds: 46, pebbles: 95};
    const plants = new THREE.InstancedMesh(grass, grassMaterial, counts.grass);
    const shoreReeds = new THREE.InstancedMesh(reeds, reedsMaterial, counts.reeds);
    const pebbles = new THREE.InstancedMesh(rockGeometries[index % rockGeometries.length], materials.stone, counts.pebbles);
    const matrix = new THREE.Matrix4(), q = new THREE.Quaternion(), tint = new THREE.Color();
    function populate(target, count, ring, sizeRange) {
      let accepted = 0;
      for (let tries = 0; accepted < count && tries < count * 5; tries++) {
        const a = rng() * TAU, r = mix(ring[0], ring[1], Math.sqrt(rng()));
        const x = Math.cos(a) * 11.8 * r, z = Math.sin(a) * 8.2 * r;
        if (animalPositions.some(p => Math.hypot(x - p.x, z - p.z) < .8)) continue;
        const y = heightAt(x, z);
        if (!Number.isFinite(y) || y < -.13) continue;
        const scale = mix(sizeRange[0], sizeRange[1], rng()); q.setFromAxisAngle(up, rng() * TAU);
        matrix.compose(new THREE.Vector3(x, y - (target === pebbles ? scale * .34 : .035), z), q, new THREE.Vector3(scale, scale, scale));
        target.setMatrixAt(accepted, matrix);
        const shade = .75 + rng() * .25; tint.setRGB(shade, shade, shade * .95); target.setColorAt(accepted, tint); accepted++;
      }
      target.count = accepted; target.instanceMatrix.needsUpdate = true;
      if (target.instanceColor) target.instanceColor.needsUpdate = true;
      target.receiveShadow = true; target.castShadow = false; target.computeBoundingSphere(); parent.add(target);
    }
    populate(plants, counts.grass, [.34, .83], [.6, 1.1]);
    populate(shoreReeds, counts.reeds, [.86, .98], [.5, .85]);
    populate(pebbles, counts.pebbles, [.82, 1.015], [.09, .27]);
    plants.name = 'island-grass'; shoreReeds.name = 'shore-reeds'; pebbles.name = 'shore-pebbles';
    return {grass: plants, reeds: shoreReeds, pebbles};
  }

  // Real-world UV scale puts longitudinal grain on the longest board axis.
  // It also adds UVs to the custom hull panels, which originally had none.
  function prepareWoodGeometry(geometry, axis = 'auto') {
    geometry.computeBoundingBox();
    const size = geometry.boundingBox.getSize(new THREE.Vector3());
    const along = axis === 'auto' ? (size.x > size.z && size.x > size.y ? 0 : size.z > size.y ? 2 : 1) : {x: 0, y: 1, z: 2}[axis];
    const position = geometry.attributes.position, normal = geometry.attributes.normal, uv = new Float32Array(position.count * 2);
    const coord = (attribute, i, a) => a === 0 ? attribute.getX(i) : a === 1 ? attribute.getY(i) : attribute.getZ(i);
    for (let i = 0; i < position.count; i++) {
      const transverse = [0, 1, 2].filter(a => a !== along);
      const cross = Math.abs(coord(normal, i, transverse[0])) > Math.abs(coord(normal, i, transverse[1])) ? transverse[1] : transverse[0];
      uv[i * 2] = coord(position, i, cross) * 2.2;
      uv[i * 2 + 1] = coord(position, i, along) * .42;
    }
    geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return geometry;
  }
  return {...materials, rock: materials.stone, createPine, createRock, dressIsland, islandHeight, prepareWoodGeometry};
}
