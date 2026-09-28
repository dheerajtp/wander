// Assets by Kenney (kenney.nl) are CC0 1.0 Universal.
import * as THREE from 'three';
import { loadModel, fixNatureMaterial } from './loader.js';

// Deterministic PRNG. Each chunk gets its own stream (seeded from its grid
// coordinate) so the same chunk always regenerates identically, independent
// of the terrain noise stream and of every other chunk.
function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function fallbackTree() {
  const group = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.11, 0.6, 6), new THREE.MeshStandardMaterial({ color: 0x8a6a4a }));
  trunk.position.y = 0.3;
  const crown = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.1, 7), new THREE.MeshStandardMaterial({ color: 0x5f8f5a }));
  crown.position.y = 1.05;
  group.add(trunk, crown);
  return group;
}

function fallbackPalm() {
  const group = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 1.4, 6), new THREE.MeshStandardMaterial({ color: 0x9c8058 }));
  trunk.position.y = 0.7;
  trunk.rotation.z = 0.08;
  const crown = new THREE.Mesh(new THREE.SphereGeometry(0.45, 6, 5), new THREE.MeshStandardMaterial({ color: 0x6fae5a }));
  crown.position.y = 1.45;
  crown.scale.set(1, 0.6, 1);
  group.add(trunk, crown);
  return group;
}

function fallbackRock() {
  const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(0.35, 0), new THREE.MeshStandardMaterial({ color: 0x818a97 }));
  return rock;
}

function fallbackAccent() {
  const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.25, 5), new THREE.MeshStandardMaterial({ color: 0x8fae7d }));
  tuft.position.y = 0.12;
  return tuft;
}

const FALLBACKS = { tree: fallbackTree, palm: fallbackPalm, rock: fallbackRock, accent: fallbackAccent };

// Every unique model file is loaded exactly once, up front. Chunks are then
// generated synchronously from these cached {geometry, material} parts --
// no per-chunk network/parse cost, which matters once chunks are loading
// and unloading continuously as the player drives.
export async function preloadVegetationTemplates(CONFIG) {
  const kindByUrl = new Map();
  for (const spec of CONFIG.scatter.groups) {
    for (const url of spec.urls) kindByUrl.set(url, spec.fallbackKind);
  }

  const templates = new Map(); // url -> [{geometry, material}, ...]
  for (const [url, kind] of kindByUrl) {
    const template = await loadModel(url, FALLBACKS[kind]);
    const parts = [];
    template.traverse((o) => {
      if (o.isMesh) {
        fixNatureMaterial(o.material);
        parts.push({ geometry: o.geometry, material: o.material });
      }
    });
    templates.set(url, parts);
  }
  return templates;
}

// One chunk's worth of scattered props, using the preloaded templates. Pure
// and synchronous -- safe to call every time a new chunk streams in.
export function createChunkScatter(cx, cz, CONFIG, heightAt, templates, exclusions = []) {
  const { chunkSize } = CONFIG.world;
  const x0 = cx * chunkSize;
  const z0 = cz * chunkSize;
  // large odd primes for spatial hashing -- keeps each chunk's RNG stream
  // independent even though seeds are just summed ints
  const rng = mulberry32(CONFIG.seed + CONFIG.scatter.seed + cx * 374761393 + cz * 668265263);

  const root = new THREE.Group();
  const obstacles = []; // {x, z, radius} -- only trees/palms/rocks, for vehicle collision
  const matrix = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const axis = new THREE.Vector3(0, 1, 0);
  const scaleV = new THREE.Vector3();

  for (const spec of CONFIG.scatter.groups) {
    const placements = [];
    const maxAttempts = spec.countPerChunk * 50;
    let attempts = 0;
    while (placements.length < spec.countPerChunk && attempts < maxAttempts) {
      attempts++;
      const x = x0 + rng() * chunkSize;
      const z = z0 + rng() * chunkSize;
      const clearing = CONFIG.scatter.spawnClearing;
      const inBubble = Math.hypot(x - clearing.x, z - clearing.z) < clearing.radius;
      const inCorridor =
        Math.abs(x - clearing.x) < clearing.corridorHalfWidth &&
        z >= clearing.z &&
        z < clearing.z + clearing.corridorForward;
      if (inBubble || inCorridor) continue;
      if (exclusions.some((e) => Math.hypot(x - e.x, z - e.z) < e.radius)) continue; // e.g. a town footprint
      const h = heightAt(x, z);
      if (h < spec.minHeight || h > spec.maxHeight) continue;
      const scale = spec.scaleRange[0] + rng() * (spec.scaleRange[1] - spec.scaleRange[0]);
      placements.push({
        x,
        z,
        y: h,
        rotationY: rng() * Math.PI * 2,
        scale,
        urlIndex: Math.floor(rng() * spec.urls.length),
      });
      if (spec.collisionRadius) obstacles.push({ x, z, radius: spec.collisionRadius * scale });
    }

    const byUrl = new Map();
    for (const p of placements) {
      const url = spec.urls[p.urlIndex];
      if (!byUrl.has(url)) byUrl.set(url, []);
      byUrl.get(url).push(p);
    }

    for (const [url, subPlacements] of byUrl) {
      for (const part of templates.get(url)) {
        const inst = new THREE.InstancedMesh(part.geometry, part.material, subPlacements.length);
        subPlacements.forEach((p, i) => {
          pos.set(p.x, p.y, p.z);
          quat.setFromAxisAngle(axis, p.rotationY);
          scaleV.setScalar(p.scale);
          matrix.compose(pos, quat, scaleV);
          inst.setMatrixAt(i, matrix);
        });
        inst.instanceMatrix.needsUpdate = true;
        root.add(inst);
      }
    }
  }

  return { group: root, obstacles };
}
