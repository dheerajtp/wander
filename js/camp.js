// Assets by Kenney (kenney.nl) are CC0 1.0 Universal.
import * as THREE from 'three';
import { loadModel, fixNatureMaterial } from './loader.js';

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

// Ambient life is specifically a camp-mode thing per the spec ("while
// camped: ... ambient life appears") -- not a general open-world system.
function createBirds(count) {
  const group = new THREE.Group();
  const geometry = new THREE.ConeGeometry(0.06, 0.22, 3);
  geometry.rotateX(Math.PI / 2);
  const material = new THREE.MeshBasicMaterial({ color: 0x3a3a3a });
  const birds = [];
  for (let i = 0; i < count; i++) {
    const bird = new THREE.Mesh(geometry, material);
    bird.userData = {
      radius: 3 + Math.random() * 2.5,
      height: 3 + Math.random() * 1.5,
      speed: 0.35 + Math.random() * 0.25,
      phase: Math.random() * Math.PI * 2,
    };
    birds.push(bird);
    group.add(bird);
  }
  group.visible = false;
  return { group, birds };
}

function updateBirds(birds, elapsed) {
  for (const bird of birds) {
    const { radius, height, speed, phase } = bird.userData;
    const angle = elapsed * speed + phase;
    bird.position.set(Math.cos(angle) * radius, height + Math.sin(angle * 3) * 0.15, Math.sin(angle) * radius);
    bird.rotation.y = -angle + Math.PI / 2;
    bird.rotation.z = Math.sin(elapsed * 8 + phase) * 0.3;
  }
}

function createFireflies(count) {
  const group = new THREE.Group();
  const geometry = new THREE.SphereGeometry(0.035, 6, 6);
  const flies = [];
  for (let i = 0; i < count; i++) {
    const material = new THREE.MeshBasicMaterial({ color: 0xdfff9a, transparent: true });
    const fly = new THREE.Mesh(geometry, material);
    fly.userData = {
      baseX: (Math.random() - 0.5) * 3,
      baseZ: (Math.random() - 0.5) * 3,
      baseY: 0.3 + Math.random() * 0.6,
      phase: Math.random() * Math.PI * 2,
      speed: 0.5 + Math.random() * 0.5,
    };
    flies.push(fly);
    group.add(fly);
  }
  group.visible = false;
  return { group, flies };
}

function updateFireflies(flies, elapsed) {
  for (const fly of flies) {
    const { baseX, baseZ, baseY, phase, speed } = fly.userData;
    fly.position.set(
      baseX + Math.sin(elapsed * speed + phase) * 0.4,
      baseY + Math.sin(elapsed * speed * 1.7 + phase) * 0.2,
      baseZ + Math.cos(elapsed * speed + phase) * 0.4
    );
    fly.material.opacity = 0.5 + 0.5 * Math.sin(elapsed * 3 + phase * 2);
  }
}

async function loadPart(url, fallbackFn) {
  const obj = await loadModel(url, fallbackFn);
  obj.traverse((o) => {
    if (o.isMesh) fixNatureMaterial(o.material);
  });
  return obj;
}

export async function createCamp(CONFIG) {
  const tent = await loadPart('assets/nature/tent_smallOpen.glb', fallbackTent);
  const campfire = await loadPart('assets/nature/campfire_logs.glb', fallbackCampfire);

  tent.scale.setScalar(CONFIG.camp.tentScale);
  tent.position.set(2.45, 0, -1.23); // scaled with tentScale to keep the same layout around the fire
  tent.rotation.y = -0.6;

  campfire.scale.setScalar(CONFIG.camp.campfireScale);

  const fireLight = new THREE.PointLight(0xffaa55, 0, 6, 2);
  fireLight.position.set(0, 0.5, 0);

  const { group: birdsGroup, birds } = createBirds(6);
  const { group: firefliesGroup, flies } = createFireflies(10);

  const group = new THREE.Group();
  group.add(tent, campfire, fireLight, birdsGroup, firefliesGroup);
  group.visible = false;

  function moveTo(x, z, groundY) {
    group.position.set(x, groundY, z);
    group.visible = true;
  }

  function updateFire(elapsed) {
    const cfg = CONFIG.camp.fire;
    fireLight.intensity = cfg.baseIntensity + Math.sin(elapsed * 9) * cfg.flicker + Math.sin(elapsed * 23.7) * cfg.flicker * 0.5;
  }

  // Ambient life is specifically a "while camped" thing per the spec, so
  // isCamping is required here even though camp.group itself stays visible
  // (and in place) after packing up, so you can find your way back to it.
  function updateAmbient(elapsed, isCamping, isDay, isNight) {
    birdsGroup.visible = isCamping && isDay;
    firefliesGroup.visible = isCamping && isNight;
    if (birdsGroup.visible) updateBirds(birds, elapsed);
    if (firefliesGroup.visible) updateFireflies(flies, elapsed);
  }

  return { group, moveTo, updateFire, updateAmbient };
}
