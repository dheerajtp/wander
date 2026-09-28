// Assets by Kenney (kenney.nl) are CC0 1.0 Universal.
import * as THREE from 'three';
import { loadModel } from './loader.js';

// Same PRNG family as vegetation.js's per-chunk scatter -- one independent
// stream per chunk coordinate, so a given chunk always plans the same town
// (or no town) on every visit.
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

function fallbackRoad() {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({ color: 0x555a5e }));
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}
function fallbackBuilding() {
  const h = 1.2 + Math.random() * 1.3;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.9, h, 0.9), new THREE.MeshStandardMaterial({ color: 0xb9ada0 }));
  mesh.position.y = h / 2;
  return mesh;
}
function fallbackProp() {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.2, 6), new THREE.MeshStandardMaterial({ color: 0x444444 }));
  mesh.position.y = 0.6;
  return mesh;
}

const ROAD_URLS = {
  straight: 'assets/roads/road-straight.glb',
  crossroad: 'assets/roads/road-crossroad.glb',
  end: 'assets/roads/road-end.glb',
  square: 'assets/roads/road-square.glb',
  light: 'assets/roads/light-square.glb',
};

const BUILDING_URLS = [
  'assets/commercial/building-a.glb',
  'assets/commercial/building-b.glb',
  'assets/commercial/building-c.glb',
  'assets/commercial/building-d.glb',
  'assets/commercial/building-e.glb',
  'assets/suburban/building-type-a.glb',
  'assets/suburban/building-type-b.glb',
  'assets/suburban/building-type-c.glb',
  'assets/suburban/building-type-d.glb',
  'assets/suburban/building-type-e.glb',
  'assets/suburban/building-type-f.glb',
];

// One of each unique model, loaded once and reused (via .clone()) for every
// town -- same reasoning as vegetation.js's template preload.
export async function preloadTownTemplates() {
  const templates = new Map();
  for (const url of Object.values(ROAD_URLS)) {
    const fallback = url === ROAD_URLS.light ? fallbackProp : fallbackRoad;
    templates.set(url, await loadModel(url, fallback));
  }
  for (const url of BUILDING_URLS) {
    templates.set(url, await loadModel(url, fallbackBuilding));
  }
  return templates;
}

// Cross-shaped street layout: one crossroad at the center, a straight arm in
// each of the 4 directions capped with an end piece, buildings scattered in
// the four quadrants between the arms. Pure data -- no THREE objects here --
// so vegetation.js can use the footprint as an exclusion zone before this
// ever gets rendered.
export function planTown(cx, cz, CONFIG, heightAt) {
  const cfg = CONFIG.town;
  if (cx === 0 && cz === 0) return null; // never overlap the fixed spawn area

  const { chunkSize } = CONFIG.world;
  const rng = mulberry32(CONFIG.seed + cfg.seed + cx * 374761393 + cz * 668265263);
  if (rng() > cfg.chance) return null;

  const footprintRadius = (cfg.armLength + 1) * cfg.tileSize;
  const margin = footprintRadius + 5;
  if (margin * 2 >= chunkSize) return null; // config sanity guard, shouldn't normally trigger

  const centerX = cx * chunkSize + margin + rng() * (chunkSize - margin * 2);
  const centerZ = cz * chunkSize + margin + rng() * (chunkSize - margin * 2);

  // require the footprint to sit on reasonably flat, non-aquatic, non-alpine
  // ground -- sample the center and the tip of each arm
  const { sand, grass } = CONFIG.bands;
  const samples = [
    [0, 0],
    [footprintRadius, 0],
    [-footprintRadius, 0],
    [0, footprintRadius],
    [0, -footprintRadius],
  ].map(([dx, dz]) => heightAt(centerX + dx, centerZ + dz));
  const minH = Math.min(...samples);
  const maxH = Math.max(...samples);
  if (minH < sand + 1 || maxH > grass - 1 || maxH - minH > cfg.maxSlope) return null;

  const DIRS = [
    { dx: 1, dz: 0, rot: Math.PI / 2 },
    { dx: -1, dz: 0, rot: -Math.PI / 2 },
    { dx: 0, dz: 1, rot: 0 },
    { dx: 0, dz: -1, rot: Math.PI },
  ];

  const roadCells = [{ x: 0, z: 0, kind: 'crossroad', rot: 0 }];
  for (const dir of DIRS) {
    for (let i = 1; i <= cfg.armLength; i++) {
      const isEnd = i === cfg.armLength;
      roadCells.push({
        x: dir.dx * i * cfg.tileSize,
        z: dir.dz * i * cfg.tileSize,
        kind: isEnd ? 'end' : 'straight',
        rot: dir.rot,
      });
    }
  }

  const halfSpan = footprintRadius;
  const roadHalfWidth = cfg.tileSize * 0.65;
  const targetBuildings = cfg.buildingsMin + Math.floor(rng() * (cfg.buildingsMax - cfg.buildingsMin + 1));
  const buildings = [];
  let attempts = 0;
  while (buildings.length < targetBuildings && attempts < targetBuildings * 30) {
    attempts++;
    const bx = (rng() * 2 - 1) * (halfSpan - cfg.tileSize);
    const bz = (rng() * 2 - 1) * (halfSpan - cfg.tileSize);
    if (Math.abs(bx) < roadHalfWidth || Math.abs(bz) < roadHalfWidth) continue; // too close to a road arm
    if (buildings.some((b) => Math.hypot(b.x - bx, b.z - bz) < cfg.buildingSpacing)) continue;
    buildings.push({
      x: bx,
      z: bz,
      rotationY: Math.floor(rng() * 4) * (Math.PI / 2),
      url: BUILDING_URLS[Math.floor(rng() * BUILDING_URLS.length)],
    });
  }

  const npcCount = cfg.npcMin + Math.floor(rng() * (cfg.npcMax - cfg.npcMin + 1));
  const npcs = [];
  for (let i = 0; i < npcCount; i++) {
    npcs.push({
      x: centerX + (rng() * 2 - 1) * halfSpan * 0.8,
      z: centerZ + (rng() * 2 - 1) * halfSpan * 0.8,
      variant: cfg.npcVariants[Math.floor(rng() * cfg.npcVariants.length)],
    });
  }

  return {
    center: { x: centerX, z: centerZ, y: heightAt(centerX, centerZ) },
    halfSpan,
    roadCells,
    buildings,
    npcs,
    lightOffsets: DIRS.map((d) => ({ x: d.dx * cfg.armLength * cfg.tileSize, z: d.dz * cfg.armLength * cfg.tileSize })),
  };
}

function roadTemplateFor(kind, templates) {
  if (kind === 'crossroad') return templates.get(ROAD_URLS.crossroad);
  if (kind === 'end') return templates.get(ROAD_URLS.end);
  return templates.get(ROAD_URLS.straight);
}

// Renders a planned town into an actual THREE.Group, and returns the
// building positions as vehicle-collision obstacles (roads are meant to be
// driven on, so only buildings block).
export function buildTownGroup(plan, templates, CONFIG) {
  const cfg = CONFIG.town;
  const group = new THREE.Group();
  group.position.set(plan.center.x, plan.center.y, plan.center.z);
  const obstacles = [];

  for (const cell of plan.roadCells) {
    const inst = roadTemplateFor(cell.kind, templates).clone();
    inst.scale.setScalar(cfg.tileSize);
    inst.position.set(cell.x, 0, cell.z);
    inst.rotation.y = cell.rot;
    group.add(inst);
  }

  for (const b of plan.buildings) {
    const inst = templates.get(b.url).clone();
    inst.scale.setScalar(cfg.buildingScale);
    inst.position.set(b.x, 0, b.z);
    inst.rotation.y = b.rotationY;
    group.add(inst);
    obstacles.push({ x: plan.center.x + b.x, z: plan.center.z + b.z, radius: cfg.buildingCollisionRadius });
  }

  for (const lp of plan.lightOffsets) {
    const inst = templates.get(ROAD_URLS.light).clone();
    inst.scale.setScalar(cfg.tileSize);
    inst.position.set(lp.x, 0, lp.z);
    group.add(inst);
  }

  return { group, obstacles };
}
