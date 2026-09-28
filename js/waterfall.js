import * as THREE from 'three';

const VERTEX_SHADER = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Scrolling stripes standing in for flowing water -- no texture asset for
// this, so the motion itself is what sells it, same spirit as the sky's
// procedural gradient shader.
const FRAGMENT_SHADER = `
  uniform float time;
  uniform vec3 colorLight;
  uniform vec3 colorDark;
  varying vec2 vUv;
  void main() {
    float flow = fract(vUv.y * 6.0 - time * 1.6);
    float stripe = smoothstep(0.0, 0.15, flow) * smoothstep(1.0, 0.7, flow);
    vec3 color = mix(colorDark, colorLight, stripe);
    float edgeFade = smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.92, vUv.x);
    gl_FragColor = vec4(color, 0.82 * edgeFade);
  }
`;

// A second fixed landmark next to the lake (see terrain.js's cliff carve).
// Not chunk-dependent -- added once directly to the scene, same as the camp
// and vehicles, since it's a single deliberate spot rather than something
// that needs to stream in and out.
export function createWaterfall(CONFIG, heightAt) {
  const wf = CONFIG.terrain.waterfall;
  const topY = heightAt(wf.x - wf.facingX * 2, wf.z - wf.facingZ * 2) - 0.5;
  const baseY = heightAt(wf.x + wf.facingX * 2.5, wf.z + wf.facingZ * 2.5) + 0.3;
  const height = Math.max(3, topY - baseY);
  const width = wf.halfWidth * 1.2;

  const geometry = new THREE.PlaneGeometry(width, height, 1, 20);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      colorLight: { value: new THREE.Color(0xdfeff0) },
      colorDark: { value: new THREE.Color(CONFIG.palette.water) },
    },
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    transparent: true,
    side: THREE.DoubleSide,
  });

  const cascade = new THREE.Mesh(geometry, material);
  cascade.position.set(wf.x, baseY + height / 2, wf.z);
  cascade.rotation.y = Math.atan2(wf.facingX, wf.facingZ);

  const mistGeo = new THREE.SphereGeometry(width * 0.7, 8, 6);
  const mistMat = new THREE.MeshBasicMaterial({ color: 0xeaf4f2, transparent: true, opacity: 0.25 });
  const mist = new THREE.Mesh(mistGeo, mistMat);
  mist.position.set(wf.x + wf.facingX * 1.5, baseY + 0.4, wf.z + wf.facingZ * 1.5);
  mist.scale.y = 0.4;

  const group = new THREE.Group();
  group.add(cascade, mist);

  function update(elapsed) {
    material.uniforms.time.value = elapsed;
    mist.scale.set(1, 0.4 + Math.sin(elapsed * 1.3) * 0.05, 1);
  }

  return { group, update, position: { x: wf.x, z: wf.z } };
}
