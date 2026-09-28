import { createTerrainChunk, heightAt as heightAtRaw } from './terrain.js';
import { createChunkScatter } from './vegetation.js';
import { planTown, buildTownGroup } from './town.js';
import { createNpc } from './npc.js';
import { planDeer, createDeer } from './wildlife.js';
import { planCampsite, buildCampsiteGroup } from './campsite.js';

// Loads/unloads terrain + vegetation + occasional towns in a square ring
// around whatever position is passed to update() each frame. heightAt()
// itself needs no chunk to be loaded -- it's pure math -- so physics,
// camping, and score all work anywhere immediately, independent of what's
// currently rendered.
export function createWorld(CONFIG, scene, assets) {
  const { vegetationTemplates, townTemplates, npcTemplates, campsiteTemplates } = assets;
  const { chunkSize, loadRadiusChunks, unloadRadiusChunks } = CONFIG.world;
  const loaded = new Map(); // "cx,cz" -> { terrainMesh, scatterGroup, townGroup, npcs, deer, campsiteGroup, campsiteUpdate, obstacles, townCenter, campsiteCenter, cx, cz }
  let obstaclesFlat = [];
  let townCentersFlat = [];
  let campsiteCentersFlat = [];

  const heightAt = (x, z) => heightAtRaw(x, z, CONFIG);

  function key(cx, cz) {
    return `${cx},${cz}`;
  }

  function rebuildDerived() {
    obstaclesFlat = [];
    townCentersFlat = [];
    campsiteCentersFlat = [];
    for (const entry of loaded.values()) {
      obstaclesFlat.push(...entry.obstacles);
      if (entry.townCenter) townCentersFlat.push(entry.townCenter);
      if (entry.campsiteCenter) campsiteCentersFlat.push(entry.campsiteCenter);
    }
  }

  function loadChunk(cx, cz) {
    const k = key(cx, cz);
    if (loaded.has(k)) return;

    const townPlan = planTown(cx, cz, CONFIG, heightAt);
    const exclusions = townPlan ? [{ x: townPlan.center.x, z: townPlan.center.z, radius: townPlan.halfSpan + 3 }] : [];

    const campsitePlan = planCampsite(cx, cz, CONFIG, heightAt, exclusions);
    if (campsitePlan) exclusions.push({ x: campsitePlan.x, z: campsitePlan.z, radius: 4.5 }); // clears the now-larger tent footprint

    const terrainMesh = createTerrainChunk(cx, cz, CONFIG);
    const { group: scatterGroup, obstacles } = createChunkScatter(cx, cz, CONFIG, heightAt, vegetationTemplates, exclusions);
    const deer = planDeer(cx, cz, CONFIG, heightAt, exclusions).map((spawn) => createDeer(spawn, CONFIG.wildlife.deer, heightAt));

    const toAdd = [terrainMesh, scatterGroup, ...deer.map((d) => d.group)];
    let townGroup = null;
    let npcs = [];
    let townCenter = null;
    let campsiteGroup = null;
    let campsiteUpdate = null;
    let campsiteCenter = null;

    if (townPlan) {
      const built = buildTownGroup(townPlan, townTemplates, CONFIG);
      townGroup = built.group;
      obstacles.push(...built.obstacles);
      npcs = townPlan.npcs.map((spawn) => createNpc(spawn, CONFIG.town.npc, heightAt, npcTemplates));
      toAdd.push(townGroup, ...npcs.map((n) => n.mesh));
      townCenter = { x: townPlan.center.x, z: townPlan.center.z };
    }

    if (campsitePlan) {
      const built = buildCampsiteGroup(campsitePlan, campsiteTemplates, CONFIG);
      campsiteGroup = built.group;
      campsiteUpdate = built.update;
      obstacles.push(...built.obstacles);
      toAdd.push(campsiteGroup);
      campsiteCenter = { x: campsitePlan.x, z: campsitePlan.z };
    }

    scene.add(...toAdd);
    loaded.set(k, { terrainMesh, scatterGroup, townGroup, npcs, deer, campsiteGroup, campsiteUpdate, obstacles, townCenter, campsiteCenter, cx, cz });
    rebuildDerived();
  }

  function unloadChunk(entry) {
    scene.remove(entry.terrainMesh, entry.scatterGroup);
    entry.terrainMesh.geometry.dispose();
    entry.terrainMesh.material.dispose();
    // scatterGroup/townGroup InstancedMeshes and clones share geometry and
    // material with the preloaded templates -- only this chunk's own
    // wrapper objects belong to it, so there's nothing else to dispose.
    if (entry.townGroup) scene.remove(entry.townGroup);
    if (entry.campsiteGroup) scene.remove(entry.campsiteGroup);
    for (const npc of entry.npcs) scene.remove(npc.mesh);
    for (const d of entry.deer) scene.remove(d.group);
    loaded.delete(key(entry.cx, entry.cz));
  }

  function update(centerX, centerZ) {
    const ccx = Math.floor(centerX / chunkSize);
    const ccz = Math.floor(centerZ / chunkSize);

    for (let dx = -loadRadiusChunks; dx <= loadRadiusChunks; dx++) {
      for (let dz = -loadRadiusChunks; dz <= loadRadiusChunks; dz++) {
        loadChunk(ccx + dx, ccz + dz);
      }
    }

    const toUnload = [];
    for (const entry of loaded.values()) {
      if (Math.abs(entry.cx - ccx) > unloadRadiusChunks || Math.abs(entry.cz - ccz) > unloadRadiusChunks) {
        toUnload.push(entry);
      }
    }
    for (const entry of toUnload) unloadChunk(entry);
    if (toUnload.length > 0) rebuildDerived();
  }

  function updateNpcs(dt) {
    for (const entry of loaded.values()) {
      for (const npc of entry.npcs) npc.update(dt, heightAt);
    }
  }

  function updateWildlife(dt) {
    for (const entry of loaded.values()) {
      for (const d of entry.deer) d.update(dt, heightAt);
    }
  }

  function updateCampsites(dt) {
    for (const entry of loaded.values()) {
      if (entry.campsiteUpdate) entry.campsiteUpdate(dt);
    }
  }

  return {
    update,
    updateNpcs,
    updateWildlife,
    updateCampsites,
    heightAt,
    getObstacles: () => obstaclesFlat,
    getTownCenters: () => townCentersFlat,
    getCampsiteCenters: () => campsiteCentersFlat,
  };
}
