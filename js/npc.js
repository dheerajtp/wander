import * as THREE from 'three';
import { loadAnimatedModel } from './loader.js';

function fallbackNpc() {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0xc9a08a });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.5, 4, 8), mat);
  torso.position.y = 1.0;
  group.add(torso);
  return { scene: group, animations: [] };
}

// One of each character variant, loaded once and reused via .clone() for
// every NPC instance -- each clone gets its own AnimationMixer below, which
// works because AnimationClip data (from the shared template) is bindable
// to any hierarchy with matching node names, not just the original.
export async function preloadNpcTemplates(variants) {
  const templates = new Map();
  for (const variant of variants) {
    templates.set(variant, await loadAnimatedModel(`assets/${variant}.glb`, fallbackNpc));
  }
  return templates;
}

export function createNpc(spawn, cfg, heightAt, templates) {
  const tpl = templates.get(spawn.variant);
  const mesh = tpl.scene.clone();
  if (tpl.animations.length) mesh.scale.setScalar(cfg.scale);

  const mixer = new THREE.AnimationMixer(mesh);
  const actions = {};
  for (const clip of tpl.animations) actions[clip.name] = mixer.clipAction(clip);
  let currentActionName = null;
  function play(name) {
    const next = actions[name];
    if (!next || currentActionName === name) return;
    const prev = actions[currentActionName];
    next.reset().fadeIn(0.2).play();
    if (prev) prev.fadeOut(0.2);
    currentActionName = name;
  }

  const state = {
    x: spawn.x,
    z: spawn.z,
    heading: 0,
    targetX: spawn.x,
    targetZ: spawn.z,
    idleTimer: 1 + Math.random() * 2,
  };
  mesh.position.set(spawn.x, heightAt(spawn.x, spawn.z), spawn.z);

  function pickNewTarget() {
    state.targetX = spawn.x + (Math.random() * 2 - 1) * cfg.wanderRadius;
    state.targetZ = spawn.z + (Math.random() * 2 - 1) * cfg.wanderRadius;
  }

  function update(dt, heightAtFn) {
    mixer.update(dt);
    const dx = state.targetX - state.x;
    const dz = state.targetZ - state.z;
    const dist = Math.hypot(dx, dz);

    if (dist < 0.3) {
      play('idle');
      state.idleTimer -= dt;
      if (state.idleTimer <= 0) {
        pickNewTarget();
        state.idleTimer = 2 + Math.random() * 3;
      }
    } else {
      state.heading = Math.atan2(dx, dz);
      state.x += (dx / dist) * cfg.speed * dt;
      state.z += (dz / dist) * cfg.speed * dt;
      play('walk');
    }

    mesh.position.set(state.x, heightAtFn(state.x, state.z), state.z);
    mesh.rotation.y = state.heading;
  }

  return { mesh, update };
}
