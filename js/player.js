import * as THREE from 'three';
import { loadAnimatedModel } from './loader.js';

// No animations on the fallback -- a static low-poly figure is still
// better than nothing if the GLB ever fails to load.
function buildCharacterFallback() {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0xd8c9a3 });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.55, 4, 8), mat);
  torso.position.y = 1.05;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), mat);
  head.position.y = 1.55;
  group.add(torso, head);
  return { scene: group, animations: [] };
}

// A lit lens dot plus a forward SpotLight -- same construction as the
// vehicle headlights (vehicles.js addHeadlights), just handheld. Fixed to
// the character root, not a hand bone (see cfg.torch's comment in config.js).
function createTorch(cfg) {
  const group = new THREE.Group();
  group.position.set(...cfg.offset);

  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.16, 8), new THREE.MeshStandardMaterial({ color: 0x2a2a2a }));
  body.rotation.x = Math.PI / 2;
  group.add(body);

  const lensMat = new THREE.MeshStandardMaterial({ color: 0xfff6d8, emissive: 0xfff6d8, emissiveIntensity: 0 });
  const lens = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), lensMat);
  lens.position.z = 0.09;
  group.add(lens);

  const spot = new THREE.SpotLight(0xfff6d8, 0, cfg.distance, cfg.angle, 0.4, 1.5);
  spot.position.z = 0.09;
  const target = new THREE.Object3D();
  target.position.z = cfg.distance;
  group.add(spot, target);
  spot.target = target;

  return {
    group,
    setOn(on) {
      spot.intensity = on ? cfg.intensity : 0;
      lensMat.emissiveIntensity = on ? 1.4 : 0;
    },
  };
}

export async function createPlayer(cfg) {
  const { scene: mesh, animations } = await loadAnimatedModel('assets/character-a.glb', buildCharacterFallback);
  // only the real GLTF needs correcting -- the fallback primitive is already
  // authored at the right size
  if (animations.length) mesh.scale.setScalar(cfg.scale);
  const mixer = new THREE.AnimationMixer(mesh);
  const actions = {};
  for (const clip of animations) actions[clip.name] = mixer.clipAction(clip);

  let currentActionName = null;
  function play(name) {
    const next = actions[name];
    if (!next || currentActionName === name) return;
    const prev = actions[currentActionName];
    next.reset().fadeIn(0.2).play();
    if (prev) prev.fadeOut(0.2);
    currentActionName = name;
  }

  // Named rigid parts (this rig has no skeleton -- see the Stage 4 note on
  // "skins": 0) -- found once here so applyRidingPose() below doesn't
  // re-traverse the mesh every frame. The fallback primitive has none of
  // these names, so they'll just stay undefined and every use is guarded.
  const parts = {};
  mesh.traverse((o) => {
    if (o.name === 'torso') parts.torso = o;
    else if (o.name === 'arm-left') parts.armLeft = o;
    else if (o.name === 'arm-right') parts.armRight = o;
    else if (o.name === 'leg-left') parts.legLeft = o;
    else if (o.name === 'leg-right') parts.legRight = o;
  });

  // Snapshot each part's rest pose now, before any action has played.
  // applyRidingPose() resets to this every frame before layering its own
  // rotation on top: the baked clips don't necessarily re-drive these nodes
  // every tick, so accumulating onto them with "+=" would drift forever
  // with nothing to bound it (this happened -- 5+ radians of arm rotation
  // within a second of turning, caught in testing).
  const restQuats = {};
  for (const [name, obj] of Object.entries(parts)) restQuats[name] = obj.quaternion.clone();

  const state = {
    x: 0,
    z: 0,
    heading: 0,
    speed: 0,
    mode: 'mounted', // 'mounted' | 'walking'
  };

  const torch = createTorch(cfg.torch);
  mesh.add(torch.group);

  return { mesh, mixer, play, state, parts, restQuats, leanCurrent: 0, pedalPhase: 0, torch };
}

// Layers a procedural riding pose on top of whatever the baked 'drive' clip
// set this frame -- lean into turns, arms tracking the wheel/handlebars,
// and (bike only) legs pedaling at a rate tied to speed. Must run *after*
// mixer.update() so the lean/arm/leg resets below aren't immediately
// overwritten by it. No-ops gracefully on the fallback primitive, which has
// no named parts to move.
export function applyRidingPose(player, cfg, vehicleState, isBike, dt) {
  const { parts, restQuats } = player;

  const targetLean = vehicleState.steerAngle * cfg.leanFactor;
  player.leanCurrent += (targetLean - player.leanCurrent) * Math.min(1, cfg.leanSmoothing * dt);
  player.mesh.rotation.z = player.leanCurrent;

  const armTurn = vehicleState.steerAngle * cfg.armFactor;
  if (parts.armLeft) {
    parts.armLeft.quaternion.copy(restQuats.armLeft);
    parts.armLeft.rotateZ(armTurn);
  }
  if (parts.armRight) {
    parts.armRight.quaternion.copy(restQuats.armRight);
    parts.armRight.rotateZ(armTurn);
  }

  if (isBike) {
    player.pedalPhase += Math.abs(vehicleState.forwardSpeed) * cfg.pedalRate * dt;
    const swing = Math.sin(player.pedalPhase) * cfg.pedalAmplitude;
    if (parts.legLeft) {
      parts.legLeft.quaternion.copy(restQuats.legLeft);
      parts.legLeft.rotateX(swing);
    }
    if (parts.legRight) {
      parts.legRight.quaternion.copy(restQuats.legRight);
      parts.legRight.rotateX(-swing);
    }
  }
}

export function updateWalking(player, cfg, input, heightAt, dt, minDrivableHeight) {
  const { throttle, steer, brake } = input;
  const maxSpeed = brake ? cfg.sprintSpeed : cfg.walkSpeed;

  player.state.heading += steer * cfg.turnSpeed * dt * (player.state.speed >= 0 ? 1 : -1);
  const targetSpeed = throttle * maxSpeed;
  player.state.speed += (targetSpeed - player.state.speed) * Math.min(1, cfg.accel * dt);

  const fx = Math.sin(player.state.heading);
  const fz = Math.cos(player.state.heading);
  const nextX = player.state.x + fx * player.state.speed * dt;
  const nextZ = player.state.z + fz * player.state.speed * dt;

  // don't wade out into deep water -- same reasoning as vehicles: terrain
  // height goes far negative under the sea/lake and following it down
  // there breaks the camera
  if (heightAt(nextX, nextZ) >= minDrivableHeight) {
    player.state.x = nextX;
    player.state.z = nextZ;
  } else {
    player.state.speed = 0;
  }

  player.mesh.position.set(player.state.x, heightAt(player.state.x, player.state.z), player.state.z);
  player.mesh.rotation.y = player.state.heading;

  const moving = Math.abs(player.state.speed) > 0.15;
  player.play(moving ? (brake ? 'sprint' : 'walk') : 'idle');
}
