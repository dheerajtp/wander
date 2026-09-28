// Assets by Kenney (kenney.nl) are CC0 1.0 Universal.
// Decorative wayside campsites -- a tent + lit fire scattered like towns,
// purely a landmark. Reuses the same models/scale corrections as the
// player's own portable camp (camp.js), but these instances are static
// scenery: no interaction, R still makes/packs your own camp anywhere.
import * as THREE from 'three';
import { loadModel, fixNatureMaterial } from './loader.js';

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

function fallbackTent() {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.ConeGeometry(0.9, 1.0, 4), new THREE.MeshStandardMaterial({ color: 0xd8c9a3 }));
  body.rotation.y = Math.PI / 4;
  body.position.y = 0.5;
  group.add(body);
  return group;
}

function fallbackCampfire() {
  const group = new THREE.Group();
  const logs = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 5), new THREE.MeshStandardMaterial({ color: 0x6b4a33 }));
  logs.rotation.z = Math.PI / 2;
  logs.position.y = 0.08;
  group.add(logs);
  return group;
}

async function loadPart(url, fallbackFn) {
  const obj = await loadModel(url, fallbackFn);
  obj.traverse((o) => {
    if (o.isMesh) fixNatureMaterial(o.material);
  });
  return obj;
}

export async function preloadCampsiteTemplates() {
  const tent = await loadPart('assets/nature/tent_smallOpen.glb', fallbackTent);
  const campfire = await loadPart('assets/nature/campfire_logs.glb', fallbackCampfire);
  return { tent, campfire };
}

export function planCampsite(cx, cz, CONFIG, heightAt, exclusions = []) {
  const cfg = CONFIG.campsite;
  if (cx === 0 && cz === 0) return null; // keep the fixed spawn area clear, same as town

  const { chunkSize } = CONFIG.world;
  const rng = mulberry32(CONFIG.seed + cfg.seed + cx * 374761393 + cz * 668265263);
  if (rng() > cfg.chance) return null;

  const x = cx * chunkSize + rng() * chunkSize;
  const z = cz * chunkSize + rng() * chunkSize;

  const clearing = CONFIG.scatter.spawnClearing;
  if (Math.hypot(x - clearing.x, z - clearing.z) < clearing.radius) return null;
  if (exclusions.some((e) => Math.hypot(x - e.x, z - e.z) < e.radius)) return null;

  const { sand, grass } = CONFIG.bands;
  const h = heightAt(x, z);
  if (h < sand + 1 || h > grass - 1) return null; // flat open grass, not beach/rock/slope

  return { x, z, y: h, rotationY: rng() * Math.PI * 2 };
}

export function buildCampsiteGroup(plan, templates, CONFIG) {
  const cfg = CONFIG.camp; // same tent/campfire scale + flicker constants as the player's own camp
  const group = new THREE.Group();
  group.position.set(plan.x, plan.y, plan.z);
  group.rotation.y = plan.rotationY;

  const tent = templates.tent.clone();
  tent.scale.setScalar(cfg.tentScale);
  tent.position.set(2.45, 0, -1.23); // scaled with tentScale to keep the same layout around the fire
  tent.rotation.y = -0.6;

  const campfire = templates.campfire.clone();
  campfire.scale.setScalar(cfg.campfireScale);

  const fireLight = new THREE.PointLight(0xffaa55, cfg.fire.baseIntensity, 6, 2);
  fireLight.position.set(0, 0.5, 0);

  group.add(tent, campfire, fireLight);

  let t = Math.random() * Math.PI * 2;
  function update(dt) {
    t += dt;
    fireLight.intensity = cfg.fire.baseIntensity + Math.sin(t * 9) * cfg.fire.flicker + Math.sin(t * 23.7) * cfg.fire.flicker * 0.5;
  }

  return { group, update, obstacles: [{ x: plan.x, z: plan.z, radius: 2.2 }] };
}
