// Shared by the GPU surface and CPU buoyancy. Wave phases are integrated, never
// recomputed from a changing frequency, so gusts cannot make the surface jump.
const TAU = Math.PI * 2;
export const WAVE_COUNT = 8;
export const RIPPLE_COUNT = 24;
export const WATER_LEVEL = -.03;

export function entropyRandom() {
  const values = new Uint32Array(128);
  let cursor = values.length;
  return () => {
    if (!globalThis.crypto?.getRandomValues) return Math.random();
    if (cursor === values.length) { globalThis.crypto.getRandomValues(values); cursor = 0; }
    return values[cursor++] / 4294967296;
  };
}

export function createWaveField({random = entropyRandom()} = {}) {
  const wind = random() * TAU;
  const wavelengths = [18, 13.4, 10.1, 7.5, 5.4, 3.85, 2.8, 2.15];
  const amplitudes = [.12, .082, .069, .053, .035, .024, .016, .010];
  const waves = wavelengths.map((length, i) => {
    const angle = wind + (random() - .5) * (i < 4 ? 1.6 : 3.8);
    const k = TAU / (length * (.86 + random() * .28));
    const base = amplitudes[i] * (.85 + random() * .3);
    return {dx: Math.cos(angle), dz: Math.sin(angle), k, base, amplitude: base,
      phase: random() * TAU, omega: Math.sqrt(9.81 * k), steepness: .65};
  });
  const ripples = [];
  let time = 0, gust = 1, targetGust = .8 + random() * .4;
  let untilGust = 8 + random() * 10, windChanges = 0;

  function update(dt) {
    if (!(dt > 0)) return;
    // Small substeps keep wind transitions stable even in a background tab.
    const steps = Math.ceil(dt / .05), step = dt / steps;
    for (let s = 0; s < steps; s++) {
      time += step; untilGust -= step;
      if (untilGust <= 0) {
        targetGust = .72 + random() * .56;
        untilGust = 10 + random() * 16; windChanges++;
      }
      gust += (targetGust - gust) * (1 - Math.exp(-step / 6));
      for (const wave of waves) {
        wave.amplitude = wave.base * gust;
        wave.phase = (wave.phase - wave.omega * (.88 + gust * .12) * step) % TAU;
      }
    }
    for (let i = ripples.length - 1; i >= 0; i--) if (time - ripples[i].born > 5.5) ripples.splice(i, 1);
  }

  function splash(x, z, strength = .025) {
    if (!Number.isFinite(x + z + strength)) return;
    if (ripples.length === RIPPLE_COUNT) ripples.shift();
    ripples.push({x, z, strength: Math.max(0, Math.min(.08, strength)), born: time});
  }

  function rippleAt(x, z) {
    let height = 0, slopeX = 0, slopeZ = 0;
    for (const ripple of ripples) {
      const dx = x - ripple.x, dz = z - ripple.z, radius = Math.hypot(dx, dz);
      const age = time - ripple.born;
      const front = radius - age * 1.65;
      const envelope = ripple.strength * Math.exp(-front * front * 2 - age * .8) * Math.min(age * 5, 1);
      const phase = front * 8;
      height += envelope * Math.sin(phase);
      const slope = envelope * (8 * Math.cos(phase) - 4 * front * Math.sin(phase)) / Math.max(radius, .001);
      slopeX += dx * slope; slopeZ += dz * slope;
    }
    return {height, slopeX, slopeZ};
  }

  function atParameter(x, z) {
    let px = x, pz = z, height = WATER_LEVEL;
    const tx = [1, 0, 0], tz = [0, 0, 1];
    for (const w of waves) {
      const angle = w.k * (w.dx * x + w.dz * z) + w.phase;
      const sin = Math.sin(angle), cos = Math.cos(angle), qa = w.steepness * w.amplitude;
      px += qa * w.dx * cos; pz += qa * w.dz * cos; height += w.amplitude * sin;
      const horizontal = qa * w.k * sin, vertical = w.amplitude * w.k * cos;
      tx[0] -= horizontal * w.dx * w.dx; tx[1] += vertical * w.dx; tx[2] -= horizontal * w.dx * w.dz;
      tz[0] -= horizontal * w.dx * w.dz; tz[1] += vertical * w.dz; tz[2] -= horizontal * w.dz * w.dz;
    }
    const ripple = rippleAt(x, z);
    height += ripple.height; tx[1] += ripple.slopeX; tz[1] += ripple.slopeZ;
    const n = [tz[1] * tx[2] - tz[2] * tx[1], tz[2] * tx[0] - tz[0] * tx[2], tz[0] * tx[1] - tz[1] * tx[0]];
    const length = Math.hypot(...n);
    return {x: px, z: pz, height, normal: n.map(v => v / length)};
  }

  function sample(x, z) {
    // Horizontal Gerstner displacement must be inverted before sampling at a
    // world coordinate; otherwise the hull bobs out of phase with the surface.
    let qx = x, qz = z;
    for (let i = 0; i < 5; i++) {
      const p = atParameter(qx, qz);
      qx += x - p.x; qz += z - p.z;
    }
    return atParameter(qx, qz);
  }

  return {waves, ripples, update, splash, sample, atParameter,
    get time() {return time;},
    snapshot: () => ({time, gust, targetGust, windChanges,
      foldBound: waves.reduce((sum, w) => sum + w.steepness * w.amplitude * w.k, 0),
      signature: waves.map(w => [w.dx, w.dz, w.k, w.base, w.phase]), ripples: ripples.length})};
}
