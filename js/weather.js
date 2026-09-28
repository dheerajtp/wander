import * as THREE from 'three';

const BOX = { x: 25, y: 12.5, z: 25 }; // half-extents around the camera
const FALL_SPEED = 9;

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

export function createWeather() {
  const count = 500;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = randomBetween(-BOX.x, BOX.x);
    positions[i * 3 + 1] = randomBetween(-BOX.y, BOX.y);
    positions[i * 3 + 2] = randomBetween(-BOX.z, BOX.z);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({ color: 0xcfd9dc, size: 0.12, transparent: true, opacity: 0.5 });
  const points = new THREE.Points(geometry, material);
  points.visible = false;

  let active = false;
  let timer = 0;
  let nextToggle = randomBetween(60, 150); // clear for a while before the first rain

  function update(dt, camera) {
    timer += dt;
    if (timer > nextToggle) {
      active = !active;
      timer = 0;
      nextToggle = active ? randomBetween(20, 45) : randomBetween(60, 150);
      points.visible = active;
    }

    if (active) {
      points.position.set(camera.position.x, camera.position.y, camera.position.z);
      const pos = geometry.attributes.position;
      for (let i = 0; i < count; i++) {
        let y = pos.getY(i) - FALL_SPEED * dt;
        if (y < -BOX.y) y = BOX.y;
        pos.setY(i, y);
      }
      pos.needsUpdate = true;
    }

    return { active, mist: active ? 0.4 : 0 };
  }

  return { points, update };
}
