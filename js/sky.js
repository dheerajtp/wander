import * as THREE from 'three';

const VERTEX_SHADER = `
  varying vec3 vWorldPosition;
  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT_SHADER = `
  uniform vec3 topColor;
  uniform vec3 bottomColor;
  uniform float offset;
  uniform float exponent;
  varying vec3 vWorldPosition;
  void main() {
    float h = normalize(vWorldPosition + vec3(0.0, offset, 0.0)).y;
    gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
  }
`;

// Keyframes across one day, t = 0 midnight, 0.25 dawn, 0.5 noon, 0.75 dusk.
// Kept soft and legible even at night -- no near-black, per the palette rule.
const KEYFRAMES = [
  { t: 0.0, top: 0x243449, bottom: 0x33465a, fog: 0x33465a },
  { t: 0.25, top: 0x9fb8c2, bottom: 0xf0d9c0, fog: 0xd8c9b8 },
  { t: 0.5, top: 0x7fa8b8, bottom: 0xdce9dd, fog: 0xaebfc0 },
  { t: 0.75, top: 0x8a90ad, bottom: 0xe3b98f, fog: 0xc9ad9a },
  { t: 1.0, top: 0x243449, bottom: 0x33465a, fog: 0x33465a },
];

function findBracket(t) {
  for (let i = 0; i < KEYFRAMES.length - 1; i++) {
    if (t >= KEYFRAMES[i].t && t <= KEYFRAMES[i + 1].t) return [KEYFRAMES[i], KEYFRAMES[i + 1]];
  }
  return [KEYFRAMES[0], KEYFRAMES[1]];
}

function lerpColor(hexA, hexB, f, out) {
  return out.copy(new THREE.Color(hexA)).lerp(new THREE.Color(hexB), f);
}

export function createSky(CONFIG) {
  const geometry = new THREE.SphereGeometry(CONFIG.camera.far * 0.9, 32, 16);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      topColor: { value: new THREE.Color(CONFIG.palette.skyTop) },
      bottomColor: { value: new THREE.Color(CONFIG.palette.skyBottom) },
      offset: { value: 20 },
      exponent: { value: 0.6 },
    },
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    side: THREE.BackSide,
  });
  const mesh = new THREE.Mesh(geometry, material);

  const sun = new THREE.DirectionalLight(0xfff3e0, 0);
  const moon = new THREE.DirectionalLight(0xaec6e8, 0);
  const ambient = new THREE.HemisphereLight(CONFIG.palette.skyTop, CONFIG.palette.grass, 0.5);
  // DirectionalLight direction is target minus position -- both must move
  // together with the player (see follow() below) so the sun/moon keep the
  // same angle in the sky no matter how far you roam, instead of staying
  // pinned near world (0,0,0) the way a fixed point would.
  const sunTarget = new THREE.Object3D();
  const moonTarget = new THREE.Object3D();
  sun.target = sunTarget;
  moon.target = moonTarget;

  const lightDistance = CONFIG.camera.far * 0.6;
  const sunDisc = new THREE.Mesh(
    new THREE.SphereGeometry(8, 12, 8),
    new THREE.MeshBasicMaterial({ color: 0xfff3d0 })
  );
  const moonDisc = new THREE.Mesh(
    new THREE.SphereGeometry(5, 12, 8),
    new THREE.MeshBasicMaterial({ color: 0xd8e4f0 })
  );

  // stars: fixed points on a shell, opacity fades in as the sun sets
  const starCount = 400;
  const starPositions = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const r = CONFIG.camera.far * 0.85;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(Math.random() * 0.9); // keep them in the upper hemisphere
    starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    starPositions[i * 3 + 1] = r * Math.cos(phi);
    starPositions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
  }
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
  const starMaterial = new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, transparent: true, opacity: 0 });
  const stars = new THREE.Points(starGeometry, starMaterial);

  const topColor = new THREE.Color();
  const bottomColor = new THREE.Color();
  const fogColor = new THREE.Color();
  // Offsets from whatever point the sky is currently centered on (see
  // follow()), not absolute world positions -- that's what keeps the sun
  // and moon at the same angle in the sky everywhere in the infinite world.
  const sunOffset = new THREE.Vector3();
  const moonOffset = new THREE.Vector3();

  function update(t) {
    const [a, b] = findBracket(t);
    const span = b.t - a.t || 1;
    const f = (t - a.t) / span;

    lerpColor(a.top, b.top, f, topColor);
    lerpColor(a.bottom, b.bottom, f, bottomColor);
    lerpColor(a.fog, b.fog, f, fogColor);
    material.uniforms.topColor.value.copy(topColor);
    material.uniforms.bottomColor.value.copy(bottomColor);

    // sun/moon arc: angle 0 at dawn (t=0.25), PI at dusk (t=0.75)
    const angle = (t - 0.25) * Math.PI * 2;
    const sunHeight = Math.sin(angle);
    const sunX = Math.cos(angle);
    sunOffset.set(sunX * lightDistance, sunHeight * lightDistance, lightDistance * 0.3);
    sun.intensity = Math.max(0, sunHeight) * 1.4;
    sunDisc.visible = sunHeight > -0.05;

    const moonAngle = angle + Math.PI;
    const moonHeight = Math.sin(moonAngle);
    moonOffset.set(Math.cos(moonAngle) * lightDistance, moonHeight * lightDistance, lightDistance * 0.3);
    moon.intensity = Math.max(0, moonHeight) * 0.3;
    moonDisc.visible = moonHeight > -0.05;

    ambient.intensity = 0.25 + Math.max(0, sunHeight) * 0.65;

    stars.material.opacity = THREE.MathUtils.clamp(-sunHeight * 1.5, 0, 0.9);

    return { fogColor, isDay: sunHeight > 0.05, isNight: sunHeight < -0.15 };
  }

  // Recenters the whole sky system (dome, sun/moon + their targets, stars)
  // on the camera every frame -- a skybox has to keep surrounding the
  // camera no matter where it roams, and without this the sun/moon (fixed
  // points a few hundred units from world origin) drift toward the horizon
  // and even below it as soon as you drive far from spawn.
  function follow(cx, cy, cz) {
    mesh.position.set(cx, cy, cz);
    stars.position.set(cx, cy, cz);
    sunTarget.position.set(cx, cy, cz);
    sun.position.set(cx + sunOffset.x, cy + sunOffset.y, cz + sunOffset.z);
    sunDisc.position.copy(sun.position);
    moonTarget.position.set(cx, cy, cz);
    moon.position.set(cx + moonOffset.x, cy + moonOffset.y, cz + moonOffset.z);
    moonDisc.position.copy(moon.position);
  }

  update(0.5); // start at noon
  follow(0, 0, 0);

  return { mesh, sun, moon, ambient, sunDisc, moonDisc, stars, sunTarget, moonTarget, update, follow };
}
