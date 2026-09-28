// Procedural low-poly wildlife -- no Kenney kit covers animals, so these are
// primitive shapes in the same style as the vegetation/NPC fallbacks, not
// loaded models. Purely ambient: no collision, no interaction, no threat.
import * as THREE from 'three';

// Same PRNG family as vegetation.js/town.js -- one independent stream per
// chunk coordinate, so a given chunk always plans the same deer (or none).
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

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

// -- birds ------------------------------------------------------------------
// A small flock that loosely follows the player, circling overhead --
// ambient life visible everywhere, not tied to any one landmark.

function makeBird(color) {
  const group = new THREE.Group();
  const wingGeo = new THREE.BufferGeometry();
  wingGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 0.5, 0, -0.15, 0.5, 0, 0.15]), 3));
  wingGeo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, roughness: 1, metalness: 0 });
  const left = new THREE.Mesh(wingGeo, mat);
  const right = new THREE.Mesh(wingGeo, mat);
  right.scale.x = -1;
  group.add(left, right);
  return { group, left, right };
}

export function createBirdFlock(CONFIG) {
  const cfg = CONFIG.wildlife.birds;
  const group = new THREE.Group();
  const birds = [];
  for (let i = 0; i < cfg.count; i++) {
    const bird = makeBird(0x5a5a5a);
    group.add(bird.group);
    birds.push({
      ...bird,
      angle: (i / cfg.count) * Math.PI * 2,
      radiusJitter: 0.8 + Math.random() * 0.4,
      heightJitter: Math.random() * 3,
      speedJitter: 0.85 + Math.random() * 0.3,
      phase: Math.random() * Math.PI * 2,
    });
  }

  const center = new THREE.Vector3();
  let initialized = false;

  function update(dt, elapsed, followX, followZ, groundY) {
    if (!initialized) {
      center.set(followX, groundY + cfg.height, followZ);
      initialized = true;
    } else {
      const t = Math.min(1, cfg.followLerp * dt);
      center.x += (followX - center.x) * t;
      center.z += (followZ - center.z) * t;
      center.y = groundY + cfg.height;
    }

    for (const b of birds) {
      b.angle += cfg.speed * b.speedJitter * dt;
      const r = cfg.radius * b.radiusJitter;
      b.group.position.set(center.x + Math.cos(b.angle) * r, center.y + b.heightJitter, center.z + Math.sin(b.angle) * r);
      b.group.rotation.y = -b.angle + Math.PI / 2;
      const flap = Math.sin(elapsed * 6 + b.phase) * 0.6;
      b.left.rotation.z = flap;
      b.right.rotation.z = -flap;
    }
  }

  return { group, update };
}

// -- deer ---------------------------------------------------------------
// Chunk-scattered, same rejection-sampling shape as vegetation.js's scatter
// groups, but wandering/grazing instead of static.

export function planDeer(cx, cz, CONFIG, heightAt, exclusions = []) {
  const cfg = CONFIG.wildlife.deer;
  const { chunkSize } = CONFIG.world;
  const x0 = cx * chunkSize;
  const z0 = cz * chunkSize;
  const rng = mulberry32(CONFIG.seed + cfg.seed + cx * 374761393 + cz * 668265263);
  if (rng() > cfg.chance) return [];

  const count = cfg.countMin + Math.floor(rng() * (cfg.countMax - cfg.countMin + 1));
  const { sand, grass } = CONFIG.bands;
  const clearing = CONFIG.scatter.spawnClearing;
  const spawns = [];
  let attempts = 0;
  while (spawns.length < count && attempts < count * 30) {
    attempts++;
    const x = x0 + rng() * chunkSize;
    const z = z0 + rng() * chunkSize;
    if (Math.hypot(x - clearing.x, z - clearing.z) < clearing.radius) continue;
    if (exclusions.some((e) => Math.hypot(x - e.x, z - e.z) < e.radius)) continue;
    const h = heightAt(x, z);
    if (h < sand + 1 || h > grass) continue; // open grass only
    spawns.push({ x, z });
  }
  return spawns;
}

// Built once and shared by every deer everywhere -- same "preload once,
// reuse forever" rule vegetation/town/NPC templates already follow. Deer
// used to build a fresh BoxGeometry + material per instance instead, and
// since chunks (and their deer) are constantly created and unloaded as you
// drive, that leaked GPU memory on every chunk unload -- nothing disposed
// it, and nothing needed to once these are shared statics instead.
const DEER_MAT = new THREE.MeshStandardMaterial({ color: 0x8a6b4f, roughness: 1, metalness: 0 });
const DEER_BODY_GEO = new THREE.BoxGeometry(0.42, 0.32, 0.85);
const DEER_NECK_GEO = new THREE.BoxGeometry(0.16, 0.32, 0.16);
const DEER_HEAD_GEO = new THREE.BoxGeometry(0.2, 0.18, 0.3);
const DEER_LEG_GEO = new THREE.BoxGeometry(0.1, 0.5, 0.1);

function makeDeerMesh() {
  const group = new THREE.Group();

  const body = new THREE.Mesh(DEER_BODY_GEO, DEER_MAT);
  body.position.y = 0.5;
  group.add(body);

  const neckHead = new THREE.Group();
  neckHead.position.set(0, 0.62, 0.38);
  const neck = new THREE.Mesh(DEER_NECK_GEO, DEER_MAT);
  neck.position.set(0, 0.14, 0.05);
  neck.rotation.x = -0.55;
  const head = new THREE.Mesh(DEER_HEAD_GEO, DEER_MAT);
  head.position.set(0, 0.3, 0.2);
  neckHead.add(neck, head);
  group.add(neckHead);

  for (const [x, z] of [[-0.15, 0.28], [0.15, 0.28], [-0.15, -0.28], [0.15, -0.28]]) {
    const leg = new THREE.Mesh(DEER_LEG_GEO, DEER_MAT);
    leg.position.set(x, 0.25, z);
    group.add(leg);
  }

  return { group, neckHead };
}

export function createDeer(spawn, cfg, heightAt) {
  const { group, neckHead } = makeDeerMesh();
  const state = {
    x: spawn.x,
    z: spawn.z,
    heading: Math.random() * Math.PI * 2,
    targetX: spawn.x,
    targetZ: spawn.z,
    idleTimer: 1 + Math.random() * 3,
    bobTime: Math.random() * Math.PI * 2,
  };
  group.position.set(spawn.x, heightAt(spawn.x, spawn.z), spawn.z);
  group.rotation.y = state.heading;

  function pickNewTarget() {
    state.targetX = spawn.x + (Math.random() * 2 - 1) * cfg.wanderRadius;
    state.targetZ = spawn.z + (Math.random() * 2 - 1) * cfg.wanderRadius;
  }

  function update(dt, heightAtFn) {
    const dx = state.targetX - state.x;
    const dz = state.targetZ - state.z;
    const dist = Math.hypot(dx, dz);
    const grazing = dist < 0.3;

    if (grazing) {
      state.idleTimer -= dt;
      state.bobTime += dt;
      if (state.idleTimer <= 0) {
        pickNewTarget();
        state.idleTimer = 2 + Math.random() * 4;
      }
    } else {
      state.heading = Math.atan2(dx, dz);
      state.x += (dx / dist) * cfg.speed * dt;
      state.z += (dz / dist) * cfg.speed * dt;
    }

    const targetTilt = grazing ? -0.35 + Math.sin(state.bobTime * 1.2) * 0.05 : 0;
    neckHead.rotation.x += (targetTilt - neckHead.rotation.x) * Math.min(1, 4 * dt);

    group.position.set(state.x, heightAtFn(state.x, state.z), state.z);
    group.rotation.y = state.heading;
  }

  return { group, update };
}

// -- fish -----------------------------------------------------------------
// A single fish that periodically jumps out of the lake -- only animated
// when the player is nearby (CONFIG.wildlife.fish.activeRadius), same
// proximity-gating spirit as everything else that's cheap to skip when far.

export function createFishJumps(CONFIG) {
  const cfg = CONFIG.wildlife.fish;
  const lake = CONFIG.terrain.lake;
  const group = new THREE.Group();

  const fishMat = new THREE.MeshStandardMaterial({ color: 0x6f9a94, roughness: 0.4, metalness: 0.1 });
  const fish = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.5, 5), fishMat);
  fish.rotation.z = Math.PI / 2;
  fish.visible = false;
  group.add(fish);

  const splashMat = new THREE.MeshBasicMaterial({ color: 0xdfeff0, transparent: true, opacity: 0 });
  const splash = new THREE.Mesh(new THREE.CircleGeometry(0.6, 16), splashMat);
  splash.rotation.x = -Math.PI / 2;
  splash.visible = false;
  group.add(splash);

  let nextJumpAt = randomBetween(cfg.jumpIntervalMin, cfg.jumpIntervalMax);
  let jumping = false;
  let jumpStart = 0;
  let jumpX = 0;
  let jumpZ = 0;
  let splashTimer = -1;

  function update(dt, elapsed, playerX, playerZ) {
    const active = Math.hypot(playerX - lake.center.x, playerZ - lake.center.z) < cfg.activeRadius;
    if (!active) {
      fish.visible = false;
      splash.visible = false;
      return;
    }

    if (!jumping && elapsed >= nextJumpAt) {
      jumping = true;
      jumpStart = elapsed;
      const angle = Math.random() * Math.PI * 2;
      const r = Math.random() * lake.radius * 0.7;
      jumpX = lake.center.x + Math.cos(angle) * r;
      jumpZ = lake.center.z + Math.sin(angle) * r;
      fish.visible = true;
    }

    if (jumping) {
      const t = (elapsed - jumpStart) / cfg.arcDuration;
      if (t >= 1) {
        jumping = false;
        fish.visible = false;
        nextJumpAt = elapsed + randomBetween(cfg.jumpIntervalMin, cfg.jumpIntervalMax);
        splash.visible = true;
        splash.position.set(jumpX, 0.02, jumpZ);
        splashTimer = 0;
      } else {
        fish.position.set(jumpX, Math.sin(t * Math.PI) * cfg.arcHeight, jumpZ);
        fish.rotation.x = Math.cos(t * Math.PI) * 0.8;
      }
    }

    if (splashTimer >= 0) {
      splashTimer += dt;
      const p = splashTimer / 0.5;
      if (p >= 1) {
        splash.visible = false;
        splashTimer = -1;
      } else {
        splash.scale.setScalar(0.3 + p * 1.2);
        splashMat.opacity = 0.5 * (1 - p);
      }
    }
  }

  return { group, update };
}
