import * as THREE from 'three';
import { loadModel } from './loader.js';
import { createVehicleState, updateVehicle } from './vehiclePhysics.js';

function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Used only if sedan.glb ever fails to load -- keeps the same wheel names
// so the rest of the vehicle code doesn't need to know which one it got.
function buildCarFallback() {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1.7, 0.9, 4.0),
    new THREE.MeshStandardMaterial({ color: 0x8fae7d })
  );
  body.name = 'body';
  body.position.y = 0.6;
  group.add(body);

  const wheelGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.3, 12);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
  const layout = [
    ['wheel-front-left', 0.85, 0.3, 1.3],
    ['wheel-front-right', -0.85, 0.3, 1.3],
    ['wheel-back-left', 0.85, 0.3, -1.3],
    ['wheel-back-right', -0.85, 0.3, -1.3],
  ];
  for (const [name, x, y, z] of layout) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.name = name;
    wheel.position.set(x, y, z);
    group.add(wheel);
  }
  return group;
}

// No CC0 bike/motorbike model was found (see the Stage 0 asset table) --
// this primitive IS the shipped bike for now, not a placeholder.
function buildBikeFallback() {
  const group = new THREE.Group();
  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(0.18, 0.5, 1.5),
    new THREE.MeshStandardMaterial({ color: 0x6b7280 })
  );
  frame.name = 'body';
  frame.position.y = 0.55;
  group.add(frame);

  const wheelGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.08, 16);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a });

  const front = new THREE.Mesh(wheelGeo, wheelMat);
  front.name = 'wheel-front';
  front.position.set(0, 0.32, 0.7);
  group.add(front);

  const back = new THREE.Mesh(wheelGeo, wheelMat);
  back.name = 'wheel-back';
  back.position.set(0, 0.32, -0.7);
  group.add(back);

  return group;
}

// No CC0 boat model was found either (same situation as the bike) -- a
// simple open-hull rowboat shape, built the same way the bike's frame is.
function buildBoatFallback() {
  const group = new THREE.Group();
  const hullMat = new THREE.MeshStandardMaterial({ color: 0x9c6b3f });

  const floor = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.12, 2.5), hullMat);
  floor.name = 'body';
  floor.position.y = 0.12;
  group.add(floor);

  const sideGeo = new THREE.BoxGeometry(0.12, 0.32, 2.5);
  const left = new THREE.Mesh(sideGeo, hullMat);
  left.position.set(-0.5, 0.28, 0);
  const right = new THREE.Mesh(sideGeo, hullMat);
  right.position.set(0.5, 0.28, 0);
  group.add(left, right);

  const endGeo = new THREE.BoxGeometry(1.0, 0.32, 0.12);
  const bow = new THREE.Mesh(endGeo, hullMat);
  bow.position.set(0, 0.28, 1.25);
  const stern = new THREE.Mesh(endGeo, hullMat);
  stern.position.set(0, 0.28, -1.25);
  group.add(bow, stern);

  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.06, 0.25), new THREE.MeshStandardMaterial({ color: 0x6b4a33 }));
  seat.position.set(0, 0.22, 0);
  group.add(seat);

  return group;
}

function findWheels(root) {
  const wheels = {};
  root.traverse((o) => {
    if (o.name && o.name.startsWith('wheel')) wheels[o.name] = o;
  });
  return wheels;
}

// A lit lens dot per offset (so the car reads as "lights on" even from
// outside/the side) plus one shared forward SpotLight for the actual beam --
// no shadow casting, since nothing else in the scene casts shadows either.
function addHeadlights(group, cfg) {
  const lensGeo = new THREE.SphereGeometry(0.06, 8, 6);
  const lenses = cfg.headlightOffsets.map(([x, y, z]) => {
    const lens = new THREE.Mesh(lensGeo, new THREE.MeshStandardMaterial({ color: 0xfff6d8, emissive: 0xfff6d8, emissiveIntensity: 0 }));
    lens.position.set(x, y, z);
    group.add(lens);
    return lens;
  });

  const [, my, mz] = cfg.headlightOffsets[0];
  const spot = new THREE.SpotLight(0xfff6d8, 0, cfg.headlightDistance, cfg.headlightAngle, 0.5, 1.2);
  spot.position.set(0, my, mz);
  const target = new THREE.Object3D();
  target.position.set(0, my - 0.3, mz + 15);
  group.add(spot, target);
  spot.target = target;

  return {
    setOn(on) {
      spot.intensity = on ? cfg.headlightIntensity : 0;
      for (const lens of lenses) lens.material.emissiveIntensity = on ? 1.4 : 0;
    },
  };
}

async function buildVehicle(url, fallbackFn, cfg, spawn) {
  const mesh = await loadModel(url, fallbackFn);
  const group = new THREE.Group();
  group.add(mesh);
  group.position.set(spawn.x, 0, spawn.z);

  return {
    group,
    cfg,
    wheels: findWheels(mesh),
    state: createVehicleState(spawn.x, spawn.z, spawn.heading ?? 0),
    currentPitch: 0,
    currentRoll: 0,
    wheelRoll: 0,
    headlights: addHeadlights(group, cfg),
  };
}

export async function createVehicles(CONFIG, heightAt, getObstacles = () => []) {
  const car = await buildVehicle('assets/sedan.glb', buildCarFallback, CONFIG.vehicles.car, {
    x: -1.5,
    z: 30,
    heading: 0,
  });
  const bike = await buildVehicle('assets/bike.glb', buildBikeFallback, CONFIG.vehicles.bike, {
    x: 1.5,
    z: 30,
    heading: 0,
  });
  const boat = await buildVehicle('assets/boat.glb', buildBoatFallback, CONFIG.vehicles.boat, CONFIG.vehicles.boat.spawn);

  const vehicles = { car, bike, boat };
  let activeKey = 'car';

  // Places a vehicle's mesh at its current state.x/z/heading -- normally
  // that only happens inside updateOne() as a side effect of driving, which
  // never runs for a parked vehicle. Without this, restoring a save (which
  // updates state.x/z but not the mesh) leaves a parked car rendered at its
  // original spawn point instead of wherever it was actually left.
  function placeVehicle(v) {
    const groundY = v.cfg.isBoat ? CONFIG.terrain.waterLevel : heightAt(v.state.x, v.state.z);
    v.group.position.set(v.state.x, groundY + v.cfg.bodyHeight, v.state.z);
    v.group.rotation.set(0, v.state.heading, 0);
  }

  function updateOne(v, dt, input) {
    const prevX = v.state.x;
    const prevZ = v.state.z;
    updateVehicle(v.state, v.cfg, input, dt);

    const h = heightAt(v.state.x, v.state.z);
    // land vehicles can't drive into deep water; the boat can't beach itself on land
    let blocked = v.cfg.isBoat ? h >= CONFIG.terrain.waterLevel : h < CONFIG.minDrivableHeight;

    if (!blocked) {
      for (const o of getObstacles()) {
        const minDist = o.radius + v.cfg.collisionRadius;
        if (Math.abs(v.state.x - o.x) < minDist && Math.abs(v.state.z - o.z) < minDist) {
          if (Math.hypot(v.state.x - o.x, v.state.z - o.z) < minDist) {
            blocked = true;
            break;
          }
        }
      }
    }

    if (blocked) {
      // hit a tree/rock/the shore -- stop dead rather than pass through it
      v.state.x = prevX;
      v.state.z = prevZ;
      v.state.velocity.x = 0;
      v.state.velocity.z = 0;
      v.state.forwardSpeed = 0;
    }

    let groundY;
    if (v.cfg.isBoat) {
      // floats flat on the water surface -- following the lake-bed contour
      // (like a land vehicle follows terrain) would sink it into the basin
      groundY = CONFIG.terrain.waterLevel;
      v.currentPitch = 0;
      v.currentRoll = 0;
    } else {
      const sampleDist = 0.6;
      const fx = Math.sin(v.state.heading);
      const fz = Math.cos(v.state.heading);
      const hf = heightAt(v.state.x + fx * sampleDist, v.state.z + fz * sampleDist);
      const hb = heightAt(v.state.x - fx * sampleDist, v.state.z - fz * sampleDist);
      const hl = heightAt(v.state.x - fz * sampleDist, v.state.z + fx * sampleDist);
      const hr = heightAt(v.state.x + fz * sampleDist, v.state.z - fx * sampleDist);
      const targetPitch = Math.atan2(hb - hf, 2 * sampleDist);
      const targetRoll = Math.atan2(hl - hr, 2 * sampleDist);
      const tiltT = 1 - Math.exp(-v.cfg.tiltLerp * dt);
      v.currentPitch = lerp(v.currentPitch, targetPitch, tiltT);
      v.currentRoll = lerp(v.currentRoll, targetRoll, tiltT);
      groundY = heightAt(v.state.x, v.state.z);
    }

    v.group.position.set(v.state.x, groundY + v.cfg.bodyHeight, v.state.z);
    v.group.rotation.order = 'YXZ';
    v.group.rotation.y = v.state.heading;
    v.group.rotation.x = v.currentPitch;
    v.group.rotation.z = v.currentRoll;

    v.wheelRoll += (v.state.forwardSpeed * dt) / v.cfg.wheelRadius;
    for (const [name, wheel] of Object.entries(v.wheels)) {
      wheel.rotation.order = 'YXZ';
      wheel.rotation.y = name.includes('front') ? v.state.steerAngle : 0;
      wheel.rotation.x = v.wheelRoll;
    }
  }

  function update(dt, input) {
    updateOne(vehicles[activeKey], dt, input);
  }

  function syncPositions() {
    placeVehicle(car);
    placeVehicle(bike);
    placeVehicle(boat);
  }

  function setHeadlightsOn(on) {
    car.headlights.setOn(on);
    bike.headlights.setOn(on);
    boat.headlights.setOn(on);
  }

  return {
    car,
    bike,
    boat,
    setActive: (key) => {
      activeKey = key;
    },
    update,
    syncPositions,
    setHeadlightsOn,
    getActive: () => vehicles[activeKey],
    getActiveKey: () => activeKey,
    entries: () => Object.entries(vehicles),
  };
}
