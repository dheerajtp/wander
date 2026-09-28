// Small deterministic 2D value-noise + fBm. No external noise library needed
// for terrain at this scale -- this is the whole "dependency".
function hash2(x, y, seed) {
  const s = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453123;
  return s - Math.floor(s);
}

function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

function valueNoise2D(x, y, seed) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const sx = smoothstep(x - x0);
  const sy = smoothstep(y - y0);

  const n00 = hash2(x0, y0, seed);
  const n10 = hash2(x0 + 1, y0, seed);
  const n01 = hash2(x0, y0 + 1, seed);
  const n11 = hash2(x0 + 1, y0 + 1, seed);

  const ix0 = n00 + (n10 - n00) * sx;
  const ix1 = n01 + (n11 - n01) * sx;
  return ix0 + (ix1 - ix0) * sy; // 0..1
}

export function fbm2D(x, y, { octaves = 5, lacunarity = 2, gain = 0.5, seed = 0 } = {}) {
  let amplitude = 1;
  let frequency = 1;
  let sum = 0;
  let max = 0;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise2D(x * frequency, y * frequency, seed + i * 17) * amplitude;
    max += amplitude;
    amplitude *= gain;
    frequency *= lacunarity;
  }
  return sum / max; // 0..1
}
