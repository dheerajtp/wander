// Wander -- assets from Kenney (kenney.nl) are CC0 1.0 Universal.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CONFIG } from './config.js';
import { createWorld } from './world.js';
import { createWaterfall } from './waterfall.js';
import { createMinimap } from './minimap.js';
import { createBirdFlock, createFishJumps } from './wildlife.js';
import { preloadVegetationTemplates } from './vegetation.js';
import { preloadTownTemplates } from './town.js';
import { preloadNpcTemplates } from './npc.js';
import { preloadCampsiteTemplates } from './campsite.js';
import { createWater } from './water.js';
import { createSky } from './sky.js';
import { initNameEntry } from './nameEntry.js';
import { createVehicles } from './vehicles.js';
import { createCamp } from './camp.js';
import { createWeather } from './weather.js';
import { createPlayer, updateWalking, applyRidingPose } from './player.js';
import { getDriveInput, onKeyPress, setVirtualKey } from './input.js';
import { loadSave, writeSave } from './save.js';
import { getBiome } from './biome.js';
import { Score, SHOW_SCORE } from './score.js';

initNameEntry((name) => {
  startGame(name).catch(showBootError);
});

function showBootError(err) {
  console.error(err);
  const el = document.getElementById('boot-error');
  const overlay = document.getElementById('name-entry');
  if (el && overlay) {
    overlay.style.display = 'flex';
    document.getElementById('name-form').style.display = 'none';
    el.style.display = 'block';
    el.textContent = 'Something failed to start: ' + (err && err.message ? err.message : err);
  }
}

async function startGame(playerName) {
  CONFIG.identity = { name: playerName }; // save-slot key, not the tunables in CONFIG.player

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    CONFIG.camera.fov,
    window.innerWidth / window.innerHeight,
    CONFIG.camera.near,
    CONFIG.camera.far
  );
  camera.position.set(0, 60, 140);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  document.body.appendChild(renderer.domElement);

  const hints = document.getElementById('hints');
  setTimeout(() => hints && hints.classList.add('hidden'), 8000);
  const compassRose = document.getElementById('compass-rose');

  // Touch buttons drive the same virtual key state keyboard input does --
  // one code path for both (see input.js).
  document.querySelectorAll('#touch-controls .tbtn').forEach((btn) => {
    const code = btn.dataset.key;
    const down = (e) => {
      e.preventDefault();
      setVirtualKey(code, true);
    };
    const up = (e) => {
      e.preventDefault();
      setVirtualKey(code, false);
    };
    btn.addEventListener('pointerdown', down);
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
    btn.addEventListener('pointerleave', up);
  });

  if (SHOW_SCORE) {
    const panel = document.getElementById('score-panel');
    panel.style.display = 'block';
    Score.on((entry) => {
      panel.innerHTML =
        `<b>Score: ${entry.total}</b><br>` +
        Score.log
          .slice(-12)
          .reverse()
          .map((e) => `+${e.amount} ${e.type}`)
          .join('<br>');
    });
  }

  scene.fog = new THREE.Fog(CONFIG.palette.fog, 150, CONFIG.camera.far);
  scene.background = new THREE.Color(CONFIG.palette.skyBottom);

  const water = createWater(CONFIG);
  scene.add(water.mesh);

  const sky = createSky(CONFIG);
  scene.add(sky.mesh, sky.sun, sky.moon, sky.ambient, sky.sunDisc, sky.moonDisc, sky.stars, sky.sunTarget, sky.moonTarget);

  const weather = createWeather();
  scene.add(weather.points);

  // Terrain/vegetation/towns are infinite -- streamed in around whatever
  // position is passed to world.update() each frame (see the render loop
  // below). heightAt itself is just math, so it's valid everywhere
  // immediately, independent of which chunks happen to be loaded.
  const vegetationTemplates = await preloadVegetationTemplates(CONFIG);
  const townTemplates = await preloadTownTemplates();
  const npcTemplates = await preloadNpcTemplates(CONFIG.town.npcVariants);
  const campsiteTemplates = await preloadCampsiteTemplates();
  const world = createWorld(CONFIG, scene, { vegetationTemplates, townTemplates, npcTemplates, campsiteTemplates });
  const heightAt = world.heightAt;
  world.update(0, 30); // pre-load the chunks around spawn before the first frame

  const waterfall = createWaterfall(CONFIG, heightAt);
  scene.add(waterfall.group);

  const minimap = createMinimap(CONFIG, heightAt, document.getElementById('minimap'));
  onKeyPress('KeyM', () => minimap.toggle());

  const birds = createBirdFlock(CONFIG);
  scene.add(birds.group);
  const fishJumps = createFishJumps(CONFIG);
  scene.add(fishJumps.group);

  const vehicles = await createVehicles(CONFIG, heightAt, world.getObstacles);
  scene.add(vehicles.car.group, vehicles.bike.group, vehicles.boat.group);
  // A vehicle's mesh is only positioned correctly as a side effect of being
  // driven -- without this, the bike (never driven at spawn) stays at its
  // construction-time y=0 forever, buried under the actual terrain height.
  vehicles.syncPositions();

  const player = await createPlayer(CONFIG.player);
  scene.add(player.mesh);

  const camp = await createCamp(CONFIG);
  scene.add(camp.group);

  function mountVehicle(key) {
    const v = vehicles.entries().find(([k]) => k === key)[1];
    vehicles.setActive(key);
    const offset = CONFIG.player.mountOffset[key];
    v.group.add(player.mesh);
    player.mesh.position.set(offset.x, offset.y, offset.z);
    player.mesh.rotation.set(0, 0, 0);
    player.play('drive');
    player.state.mode = 'mounted';
  }

  function dismountPlayer() {
    const active = vehicles.getActive();
    const worldPos = new THREE.Vector3();
    player.mesh.getWorldPosition(worldPos);
    scene.add(player.mesh); // reparent to scene root (drops the vehicle's local transform)

    const heading = active.state.heading;
    player.state.heading = heading;
    player.state.speed = 0;
    player.state.x = worldPos.x + Math.cos(heading) * CONFIG.player.dismountSideOffset;
    player.state.z = worldPos.z - Math.sin(heading) * CONFIG.player.dismountSideOffset;
    player.mesh.position.set(player.state.x, heightAt(player.state.x, player.state.z), player.state.z);
    player.mesh.rotation.set(0, heading, 0);
    player.play('idle');
    player.state.mode = 'walking';
  }

  mountVehicle('car');

  onKeyPress('KeyE', () => {
    if (player.state.mode === 'camping') return;
    if (player.state.mode === 'mounted') {
      dismountPlayer();
      return;
    }
    // remount whichever vehicle is nearest, if close enough
    let nearestKey = null;
    let nearestDist = Infinity;
    for (const [key, v] of vehicles.entries()) {
      const d = Math.hypot(v.state.x - player.state.x, v.state.z - player.state.z);
      if (d < nearestDist) {
        nearestDist = d;
        nearestKey = key;
      }
    }
    if (nearestKey && nearestDist <= CONFIG.player.remountRadius) mountVehicle(nearestKey);
  });

  onKeyPress('Tab', () => {
    if (player.state.mode !== 'mounted') return;
    const keys = vehicles.entries().map(([key]) => key);
    const next = keys[(keys.indexOf(vehicles.getActiveKey()) + 1) % keys.length];
    mountVehicle(next);
  });

  // -- camp / rest mode --------------------------------------------------
  const campHistory = []; // "places I have stayed"
  let timeScaleIndex = 0;
  let elapsedDays = 0.5; // start at noon, not midnight -- friendlier first impression
  let campOrbitAngle = 0;

  function recordCampVisit(x, z) {
    const isKnownSpot = campHistory.some((c) => Math.hypot(c.x - x, c.z - z) < CONFIG.camp.dedupeRadius);
    if (!isKnownSpot) campHistory.push({ x, z });
  }

  let currentBiome = '';
  function updateHud() {
    const dayEl = document.getElementById('hud-day');
    const statusEl = document.getElementById('hud-status');
    const biomeEl = document.getElementById('hud-biome');
    if (!dayEl || !statusEl) return;
    dayEl.textContent = `Day ${Math.floor(elapsedDays) + 1}`;
    statusEl.textContent =
      player.state.mode === 'camping' ? `Camping · ${CONFIG.time.scales[timeScaleIndex]}x time` : '';
    if (biomeEl) biomeEl.textContent = currentBiome;
  }

  // -- score hooks (wired but hidden -- see score.js) ----------------------
  const visitedBiomes = new Set();
  let reachedSummit = false;
  let reachedBeach = false;
  let reachedLakeShore = false;
  let reachedWaterfall = false;
  const visitedTowns = new Set(); // "x,z" of each town center already credited
  const visitedCampsites = new Set(); // "x,z" of each wayside campsite already credited
  let scoreLastX = null;
  let scoreLastZ = null;
  let scoreLastMode = null;
  let distanceAccum = 0;
  let viewpointTimer = 0;
  let viewpointCounted = false;
  let viewpointDrifting = false;
  let viewpointDriftAngle = 0;

  function updateScoreHooks(dt) {
    const cfg = CONFIG.score;
    const mode = player.state.mode;
    const pos = mode === 'walking' ? player.mesh.position : mode === 'mounted' ? vehicles.getActive().group.position : camp.group.position;
    const h = heightAt(pos.x, pos.z);
    const biome = getBiome(pos.x, pos.z, h, CONFIG);

    if (biome !== currentBiome) {
      currentBiome = biome;
      updateHud();
    }
    if (!visitedBiomes.has(biome)) {
      visitedBiomes.add(biome);
      Score.add('biome_discovered', cfg.biomeDiscovery, { biome });
    }
    if (!reachedSummit && h >= CONFIG.terrain.maxHeight * cfg.summitHeightFraction) {
      reachedSummit = true;
      Score.add('summit', cfg.summit, {});
    }
    if (!reachedBeach && biome === 'Beach') {
      reachedBeach = true;
      Score.add('beach', cfg.beach, {});
    }
    if (!reachedLakeShore && biome === 'Lake') {
      reachedLakeShore = true;
      Score.add('lake_shore', cfg.lakeShore, {});
    }
    if (!reachedWaterfall && Math.hypot(pos.x - waterfall.position.x, pos.z - waterfall.position.z) <= cfg.waterfallRadius) {
      reachedWaterfall = true;
      Score.add('waterfall', cfg.waterfall, {});
    }
    for (const t of world.getTownCenters()) {
      const tKey = `${t.x.toFixed(0)},${t.z.toFixed(0)}`;
      if (visitedTowns.has(tKey)) continue;
      if (Math.hypot(pos.x - t.x, pos.z - t.z) <= cfg.townSquareRadius) {
        visitedTowns.add(tKey);
        Score.add('town_square', cfg.townSquare, {});
      }
    }
    for (const c of world.getCampsiteCenters()) {
      const cKey = `${c.x.toFixed(0)},${c.z.toFixed(0)}`;
      if (visitedCampsites.has(cKey)) continue;
      if (Math.hypot(pos.x - c.x, pos.z - c.z) <= cfg.campsiteRadius) {
        visitedCampsites.add(cKey);
        Score.add('campsite_found', cfg.campsiteFound, {});
      }
    }

    // distance traveled, per-mode so switching cars/walking doesn't count
    // the teleport between them as distance
    if (mode !== scoreLastMode) {
      scoreLastMode = mode;
      scoreLastX = pos.x;
      scoreLastZ = pos.z;
    } else if (mode !== 'camping') {
      distanceAccum += Math.hypot(pos.x - scoreLastX, pos.z - scoreLastZ);
      scoreLastX = pos.x;
      scoreLastZ = pos.z;
      while (distanceAccum >= cfg.distanceUnit) {
        distanceAccum -= cfg.distanceUnit;
        Score.add('distance', cfg.distancePoints, { unit: cfg.distanceUnit });
      }
    }

    // staying still at a viewpoint
    if (mode === 'walking' && Math.abs(player.state.speed) < 0.1 && h >= cfg.viewpointMinHeight) {
      viewpointTimer += dt;
      if (viewpointTimer >= cfg.viewpointStaySeconds && !viewpointCounted) {
        viewpointCounted = true;
        Score.add('viewpoint', cfg.viewpointPoints, { biome });
      }
      if (viewpointTimer >= CONFIG.viewpointDrift.delaySeconds && !viewpointDrifting) {
        viewpointDrifting = true;
        viewpointDriftAngle = Math.atan2(camera.position.x - pos.x, camera.position.z - pos.z);
      }
    } else {
      viewpointTimer = 0;
      viewpointCounted = false;
      viewpointDrifting = false;
    }
  }

  function enterCamp() {
    const groundY = heightAt(player.state.x, player.state.z);
    camp.moveTo(player.state.x, player.state.z, groundY);
    recordCampVisit(player.state.x, player.state.z);

    // continue the orbit from wherever the camera already is -- no snap
    campOrbitAngle = Math.atan2(camera.position.x - camp.group.position.x, camera.position.z - camp.group.position.z);

    const offset = CONFIG.camp.sitOffset;
    camp.group.add(player.mesh);
    player.mesh.position.set(offset.x, offset.y, offset.z);
    player.mesh.rotation.set(0, Math.PI, 0); // face the fire at the group origin
    player.play('sit');
    player.state.mode = 'camping';
    timeScaleIndex = 0;
    updateHud();
  }

  function exitCamp() {
    const worldPos = new THREE.Vector3();
    player.mesh.getWorldPosition(worldPos);
    scene.add(player.mesh);
    player.state.x = worldPos.x;
    player.state.z = worldPos.z;
    player.state.speed = 0;
    player.mesh.position.set(player.state.x, heightAt(player.state.x, player.state.z), player.state.z);
    player.mesh.rotation.set(0, player.state.heading, 0);
    player.play('idle');
    player.state.mode = 'walking';
    timeScaleIndex = 0;
    updateHud();
  }

  onKeyPress('KeyR', () => {
    if (player.state.mode === 'mounted') return; // step out of the vehicle first
    if (player.state.mode === 'camping') exitCamp();
    else enterCamp();
  });

  onKeyPress('KeyT', () => {
    if (player.state.mode !== 'camping') return;
    timeScaleIndex = (timeScaleIndex + 1) % CONFIG.time.scales.length;
    updateHud();
  });

  // -- save / load ---------------------------------------------------------
  // Discoveries (biome visits, viewpoints, etc.) aren't tracked yet -- that's
  // the Score module (Stage 9). The field is here now so saves made today
  // still have a place for that data once it exists, instead of needing a
  // migration later.
  function buildSaveData() {
    return {
      name: playerName,
      elapsedDays,
      campHistory,
      currentCamp: camp.group.visible
        ? { x: camp.group.position.x, z: camp.group.position.z, groundY: camp.group.position.y, visible: true }
        : null,
      activeVehicleKey: vehicles.getActiveKey(),
      vehicles: {
        car: { x: vehicles.car.state.x, z: vehicles.car.state.z, heading: vehicles.car.state.heading },
        bike: { x: vehicles.bike.state.x, z: vehicles.bike.state.z, heading: vehicles.bike.state.heading },
        boat: { x: vehicles.boat.state.x, z: vehicles.boat.state.z, heading: vehicles.boat.state.heading },
      },
      player: { mode: player.state.mode, x: player.state.x, z: player.state.z, heading: player.state.heading },
      discoveries: {},
    };
  }

  const existingSave = loadSave(playerName);
  if (existingSave) {
    elapsedDays = existingSave.elapsedDays ?? elapsedDays;
    if (Array.isArray(existingSave.campHistory)) campHistory.push(...existingSave.campHistory);

    if (existingSave.vehicles) {
      for (const key of ['car', 'bike', 'boat']) {
        const vs = existingSave.vehicles[key];
        if (vs) Object.assign(vehicles[key].state, { x: vs.x, z: vs.z, heading: vs.heading });
      }
      vehicles.syncPositions(); // restored state.x/z alone doesn't move a parked vehicle's mesh
    }

    if (existingSave.currentCamp) {
      camp.moveTo(existingSave.currentCamp.x, existingSave.currentCamp.z, existingSave.currentCamp.groundY);
    }

    const p = existingSave.player;
    if (p && p.mode === 'camping' && existingSave.currentCamp) {
      player.state.x = existingSave.currentCamp.x;
      player.state.z = existingSave.currentCamp.z;
      enterCamp();
    } else if (p && p.mode === 'mounted' && existingSave.activeVehicleKey) {
      mountVehicle(existingSave.activeVehicleKey);
    } else if (p) {
      scene.add(player.mesh); // detach from the default car mount
      player.state.x = p.x;
      player.state.z = p.z;
      player.state.heading = p.heading;
      player.mesh.position.set(p.x, heightAt(p.x, p.z), p.z);
      player.mesh.rotation.set(0, p.heading, 0);
      player.state.mode = 'walking';
      player.play('idle');
    }
    updateHud();
    world.update(player.state.x, player.state.z); // a restored position can be far from default spawn
  }

  const saveNow = () => writeSave(playerName, buildSaveData());
  setInterval(saveNow, 20000);
  window.addEventListener('beforeunload', saveNow);

  // free-look debug camera, toggled with C
  const orbitControls = new OrbitControls(camera, renderer.domElement);
  orbitControls.minDistance = 20;
  orbitControls.maxDistance = 400;
  orbitControls.maxPolarAngle = Math.PI * 0.49;
  orbitControls.enabled = false;
  let orbitMode = false;

  function getFollowTarget() {
    if (player.state.mode === 'camping') return { position: camp.group.position, heading: 0, speed: 0 };
    if (player.state.mode === 'walking') {
      return { position: player.mesh.position, heading: player.state.heading, speed: Math.abs(player.state.speed) };
    }
    const active = vehicles.getActive();
    const speed = Math.hypot(active.state.velocity.x, active.state.velocity.z);
    return { position: active.group.position, heading: active.state.heading, speed };
  }

  onKeyPress('KeyC', () => {
    orbitMode = !orbitMode;
    orbitControls.enabled = orbitMode;
    if (orbitMode) {
      orbitControls.target.copy(getFollowTarget().position);
      orbitControls.update();
    }
  });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  const chaseOffset = new THREE.Vector3();
  const chaseCamPos = new THREE.Vector3();
  const chaseLookAt = new THREE.Vector3();
  // The camera's angle around the vehicle only updates while actually
  // moving -- otherwise it orbits in lockstep with any in-place turn and
  // the vehicle never visibly appears to rotate on screen (it's always
  // dead-center, always viewed from directly behind).
  let camDirX = 0;
  let camDirZ = 1;
  const MIN_SPEED_FOR_CAMERA_TURN = 0.6;

  function updateChaseCamera(dt, snap = false) {
    const { position, heading, speed } = getFollowTarget();
    if (snap) {
      camDirX = Math.sin(heading);
      camDirZ = Math.cos(heading);
    } else if (speed > MIN_SPEED_FOR_CAMERA_TURN) {
      const targetDirX = Math.sin(heading);
      const targetDirZ = Math.cos(heading);
      const t = 1 - Math.exp(-CONFIG.camera.headingLerp * dt);
      camDirX += (targetDirX - camDirX) * t;
      camDirZ += (targetDirZ - camDirZ) * t;
      const len = Math.hypot(camDirX, camDirZ) || 1;
      camDirX /= len;
      camDirZ /= len;
    }

    chaseOffset.set(
      -camDirX * CONFIG.camera.chaseDistance,
      CONFIG.camera.chaseHeight,
      -camDirZ * CONFIG.camera.chaseDistance
    );
    chaseCamPos.copy(position).add(chaseOffset);
    if (snap) camera.position.copy(chaseCamPos);
    else camera.position.lerp(chaseCamPos, 1 - Math.exp(-CONFIG.camera.followLerp * dt));
    chaseLookAt.copy(position);
    chaseLookAt.y += CONFIG.camera.lookHeight;
    camera.lookAt(chaseLookAt);
  }
  updateChaseCamera(0, true);

  const campOrbitLookAt = new THREE.Vector3();
  function updateCampOrbitCamera(dt) {
    campOrbitAngle += CONFIG.camp.orbit.speed * dt;
    const o = CONFIG.camp.orbit;
    camera.position.set(
      camp.group.position.x + Math.sin(campOrbitAngle) * o.radius,
      camp.group.position.y + o.height,
      camp.group.position.z + Math.cos(campOrbitAngle) * o.radius
    );
    campOrbitLookAt.copy(camp.group.position);
    campOrbitLookAt.y += 0.6;
    camera.lookAt(campOrbitLookAt);
  }

  const viewpointDriftTarget = new THREE.Vector3();
  const viewpointDriftLookAt = new THREE.Vector3();
  function updateViewpointDriftCamera(dt) {
    const o = CONFIG.viewpointDrift;
    viewpointDriftAngle += o.speed * dt;
    const target = player.mesh.position;
    viewpointDriftTarget.set(target.x + Math.sin(viewpointDriftAngle) * o.radius, target.y + o.height, target.z + Math.cos(viewpointDriftAngle) * o.radius);
    camera.position.lerp(viewpointDriftTarget, 1 - Math.exp(-CONFIG.camera.followLerp * dt));
    viewpointDriftLookAt.copy(target);
    viewpointDriftLookAt.y += 1.2;
    camera.lookAt(viewpointDriftLookAt);
  }

  updateHud(); // reflect Day 1 immediately, before the first frame

  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.1);
    const elapsed = clock.getElapsedTime();
    water.update(elapsed);
    waterfall.update(elapsed);
    player.mixer.update(dt);
    camp.updateFire(elapsed);

    const timeScale = player.state.mode === 'camping' ? CONFIG.time.scales[timeScaleIndex] : 1;
    const prevDay = Math.floor(elapsedDays) + 1;
    elapsedDays += (dt * timeScale) / CONFIG.time.dayLengthSeconds;
    if (Math.floor(elapsedDays) + 1 !== prevDay) {
      updateHud();
      if (player.state.mode === 'camping') Score.add('day_at_camp', CONFIG.score.dayAtCampPoints, {});
    }

    const { fogColor, isDay, isNight } = sky.update(elapsedDays % 1);
    sky.follow(camera.position.x, camera.position.y, camera.position.z);
    vehicles.setHeadlightsOn(!isDay);
    player.torch.setOn(player.state.mode === 'walking' && !isDay);
    const weatherState = weather.update(dt, camera);
    scene.fog.color.copy(fogColor);
    scene.fog.far = THREE.MathUtils.lerp(CONFIG.camera.far, 220, weatherState.mist);
    camp.updateAmbient(elapsed, player.state.mode === 'camping', isDay, isNight);
    updateScoreHooks(dt);

    if (player.state.mode === 'walking') {
      updateWalking(player, CONFIG.player, getDriveInput(), heightAt, dt, CONFIG.minDrivableHeight);
    } else if (player.state.mode === 'mounted') {
      vehicles.update(dt, getDriveInput());
      const active = vehicles.getActive();
      applyRidingPose(player, CONFIG.player.riding, active.state, vehicles.getActiveKey() === 'bike', dt);
    }

    const followTarget = getFollowTarget();
    const trackedPos = followTarget.position;
    world.update(trackedPos.x, trackedPos.z);
    world.updateNpcs(dt);
    world.updateWildlife(dt);
    world.updateCampsites(dt);
    birds.update(dt, elapsed, trackedPos.x, trackedPos.z, heightAt(trackedPos.x, trackedPos.z));
    fishJumps.update(dt, elapsed, trackedPos.x, trackedPos.z);
    water.follow(trackedPos.x, trackedPos.z);
    compassRose.style.transform = `rotate(${THREE.MathUtils.radToDeg(followTarget.heading)}deg)`;
    minimap.draw(elapsed * 1000, trackedPos, followTarget.heading, campHistory, waterfall.position);

    if (orbitMode) orbitControls.update();
    else if (player.state.mode === 'camping') updateCampOrbitCamera(dt);
    else if (viewpointDrifting) updateViewpointDriftCamera(dt);
    else updateChaseCamera(dt);

    renderer.render(scene, camera);
  });

  // exposed for later stages and debugging
  window.__wander = {
    scene,
    camera,
    renderer,
    heightAt,
    CONFIG,
    vehicles,
    player,
    camp,
    campHistory,
    sky,
    weather,
    world,
    waterfall,
    minimap,
    birds,
    fishJumps,
    setElapsedDays: (v) => {
      elapsedDays = v;
    },
    saveNow,
    buildSaveData,
    Score,
  };
}
