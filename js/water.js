import * as THREE from 'three';

export function createWater(CONFIG) {
  const size = CONFIG.world.waterSize;
  const { segments, waveHeight, waveSpeed, waveFreq } = CONFIG.water;

  const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
  geometry.rotateX(-Math.PI / 2);

  const pos = geometry.attributes.position;
  const basePos = pos.array.slice(); // flat rest state to animate waves from

  const material = new THREE.MeshStandardMaterial({
    color: CONFIG.palette.water,
    transparent: true,
    opacity: 0.85,
    roughness: 0.15,
    metalness: 0.05,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = CONFIG.terrain.waterLevel;

  function update(elapsed) {
    for (let i = 0; i < pos.count; i++) {
      const x = basePos[i * 3];
      const z = basePos[i * 3 + 2];
      pos.setY(i, Math.sin((x + z) * waveFreq + elapsed * waveSpeed) * waveHeight);
    }
    pos.needsUpdate = true;
  }

  // Keeps the plane centered under the player so it always reads as an
  // endless ocean/lake surface. The wave pattern is computed from each
  // vertex's position local to the mesh, so it doesn't visibly "slide" as
  // the mesh follows -- there's no fixed landmark on open water to reveal
  // the trick, same technique the rain particles use.
  function follow(x, z) {
    mesh.position.x = x;
    mesh.position.z = z;
  }

  return { mesh, update, follow };
}
