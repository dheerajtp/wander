// Assets by Kenney (kenney.nl) are CC0 1.0 Universal.
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const loader = new GLTFLoader();

// Every model in the game goes through this: if the GLB is missing or
// fails to load, fallbackFn builds a primitive stand-in so the game still
// runs.
export function loadModel(url, fallbackFn) {
  return new Promise((resolve) => {
    loader.load(
      url,
      (gltf) => resolve(gltf.scene),
      undefined,
      (err) => {
        console.warn(`[assets] could not load "${url}", using fallback primitive`, err);
        resolve(fallbackFn());
      }
    );
  });
}

// Same pattern, but also keeps the animation clips -- for rigged models
// like the rider. fallbackFn here returns { scene, animations }.
export function loadAnimatedModel(url, fallbackFn) {
  return new Promise((resolve) => {
    loader.load(
      url,
      (gltf) => resolve({ scene: gltf.scene, animations: gltf.animations }),
      undefined,
      (err) => {
        console.warn(`[assets] could not load "${url}", using fallback primitive`, err);
        resolve(fallbackFn());
      }
    );
  });
}

// Kenney's Nature Kit ships flat-color materials with metalness=1 (a
// Blender export default, not an intentional look). With no environment
// map to reflect, that renders almost pure black -- these are wood,
// leaves, stone: force them matte. Call on every mesh from that kit.
export function fixNatureMaterial(material) {
  for (const m of Array.isArray(material) ? material : [material]) {
    m.metalness = 0;
    m.roughness = 1;
  }
}
