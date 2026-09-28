import * as THREE from 'three';
import { fbm2D } from './noise.js';

// Pure function of (x, z) -- no notion of a map edge, so it's valid
// anywhere. Reused by vehicles, the camp system, and the chunk builder
// below to sample ground height.
export function heightAt(x, z, CONFIG) {
  const t = CONFIG.terrain;
  const h01 = fbm2D(x * t.noise.scale, z * t.noise.scale, {
    octaves: t.noise.octaves,
    lacunarity: t.noise.lacunarity,
    gain: t.noise.gain,
    seed: CONFIG.seed,
  });

  let h = (h01 * 2 - 1) * t.maxHeight;
  h += t.maxHeight * 0.15; // bias so most land sits above the waterline

  // lake basin -> carve a depression so a lake can sit in it. This is the
  // one fixed landmark in an otherwise endless terrain.
  const dLake = Math.hypot(x - t.lake.center.x, z - t.lake.center.z);
  if (dLake < t.lake.radius) {
    h -= (1 - dLake / t.lake.radius) * t.lake.depth;
  }

  // waterfall cliff -> a second deliberate landmark next to the lake. The
  // natural fbm terrain only ever produces a ~2-3 unit slope here (checked
  // empirically), nowhere near dramatic enough to read as a waterfall, so
  // this raises a small plateau on the uphill side that steps sharply back
  // down to the base terrain on the lake-facing side.
  const wf = t.waterfall;
  const wdx = x - wf.x;
  const wdz = z - wf.z;
  const along = wdx * wf.facingX + wdz * wf.facingZ; // + toward the lake, - behind the cliff
  const perp = wdx * -wf.facingZ + wdz * wf.facingX;
  const widthT = smoothstep(1 - Math.abs(perp) / wf.halfWidth);
  const stepT = 1 - smoothstep((along + wf.transition / 2) / wf.transition);
  h += wf.dropHeight * stepT * widthT;

  return h;
}

const BAND_BLEND = 1.5; // world units of softness at each band boundary, avoids harsh banding

function smoothstep(t) {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}

// Colors the terrain by height band, blending across each boundary instead
// of a hard cutoff so the biomes don't read as painted-on stripes.
function colorForHeight(h, CONFIG, out, tmp) {
  const { sand, grass, rock } = CONFIG.bands;
  const p = CONFIG.palette;
  const b = BAND_BLEND;

  if (h < sand - b) out.setHex(p.sand);
  else if (h < sand + b) out.setHex(p.sand).lerp(tmp.setHex(p.grass), smoothstep((h - (sand - b)) / (2 * b)));
  else if (h < grass - b) out.setHex(p.grass);
  else if (h < grass + b) out.setHex(p.grass).lerp(tmp.setHex(p.rock), smoothstep((h - (grass - b)) / (2 * b)));
  else if (h < rock - b) out.setHex(p.rock);
  else if (h < rock + b) out.setHex(p.rock).lerp(tmp.setHex(p.snow), smoothstep((h - (rock - b)) / (2 * b)));
  else out.setHex(p.snow);
}

// One chunkSize x chunkSize tile of the infinite terrain, at grid
// coordinate (cx, cz). Geometry stays in local (-half..half) space; the
// mesh's own position carries it to the right place in the world, so the
// only per-vertex world-space math needed is for the heightAt() sampling.
export function createTerrainChunk(cx, cz, CONFIG) {
  const { chunkSize, segmentsPerChunk } = CONFIG.world;
  const originX = cx * chunkSize + chunkSize / 2;
  const originZ = cz * chunkSize + chunkSize / 2;

  const geometry = new THREE.PlaneGeometry(chunkSize, chunkSize, segmentsPerChunk, segmentsPerChunk);
  geometry.rotateX(-Math.PI / 2);

  const pos = geometry.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const color = new THREE.Color();
  const tmp = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const worldX = pos.getX(i) + originX;
    const worldZ = pos.getZ(i) + originZ;
    const h = heightAt(worldX, worldZ, CONFIG);
    pos.setY(i, h);

    colorForHeight(h, CONFIG, color, tmp);
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }

  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();

  // flatShading also happens to erase the normal-smoothing seam that would
  // otherwise show at chunk boundaries (each chunk computes its own normals
  // independently, so adjoining edges don't match up under smooth shading)
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(originX, 0, originZ);
  mesh.receiveShadow = true;
  return mesh;
}
