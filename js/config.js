// All tunable values live here so later stages (vehicles, camps, day/night)
// can be tweaked without hunting through the rest of the code.
export const CONFIG = {
  seed: 1337,

  // Terrain is infinite -- generated chunk by chunk as you drive (world.js),
  // not a single fixed map. heightAt() is pure math over (x, z), so it works
  // anywhere with no notion of an edge.
  terrain: {
    maxHeight: 34,
    waterLevel: 0,
    noise: { scale: 0.006, octaves: 5, lacunarity: 2.0, gain: 0.5 },
    lake: { center: { x: -80, z: 60 }, radius: 45, depth: 10 }, // one fixed landmark lake near spawn
    // a small deliberate cliff right at the lake's edge for the waterfall to
    // fall from -- facing is the unit vector pointing from the cliff top
    // toward the lake (the direction water flows)
    waterfall: { x: -38, z: 75, facingX: -0.9414, facingZ: -0.3363, dropHeight: 9, halfWidth: 4, transition: 3 },
  },

  world: {
    chunkSize: 100,
    segmentsPerChunk: 50, // same vertex density as the old fixed map (0.5 segments/unit)
    loadRadiusChunks: 2, // 5x5 grid always kept loaded around the player
    unloadRadiusChunks: 3, // hysteresis so chunks don't thrash right at the load boundary
    waterSize: 800, // just needs to be bigger than the far clip plane can ever reveal an edge
  },

  // Occasional procedural towns (Kenney City Kit: roads/commercial/suburban)
  // -- planned per chunk in town.js, same deterministic-per-coordinate
  // approach as vegetation. A cross-shaped street (one crossroad + 4 arms),
  // buildings filling the quadrants, a few wandering NPCs.
  town: {
    seed: 51423,
    chance: 0.12, // rolled once per chunk; ~1 in 8 chunks gets a town
    armLength: 4, // road tiles per arm, not counting the center crossroad
    // City Kit's road tiles are 1x1 units raw, but our car is 1.5 units
    // wide -- same cross-kit scale mismatch as the tent/character before.
    tileSize: 2.3,
    buildingScale: 2.3, // keep buildings proportionate to the roads they line
    buildingCollisionRadius: 1.4,
    maxSlope: 2.5, // max height variance tolerated across the footprint
    buildingsMin: 6,
    buildingsMax: 10,
    buildingSpacing: 2.5,
    npc: {
      scale: 0.5, // Blocky Characters kit, same correction as the player
      speed: 1.3,
      wanderRadius: 5,
    },
    npcMin: 3,
    npcMax: 5,
    npcVariants: ['character-b', 'character-h', 'character-m'], // distinct from the player's character-a
  },

  // Decorative wayside campsites (tent + lit fire, campsite.js) scattered
  // like towns -- purely a landmark so the world visibly signals "camp
  // here" spots. Pressing R still makes/packs your own camp anywhere;
  // these aren't functional, just scenery (and a minimap/score landmark).
  campsite: {
    seed: 733921,
    chance: 0.15,
  },

  // height bands used to vertex-color the terrain (see WORLD spec)
  bands: { sand: 2, grass: 14, rock: 28 }, // below 0 reads as sand (seabed), above rock is snow

  // nothing may cross into deep water -- terrain height goes far negative
  // under the sea/lake, and following it down there breaks the camera
  minDrivableHeight: 0.4,

  water: { segments: 100, waveHeight: 0.35, waveSpeed: 0.6, waveFreq: 0.05 },

  // Local radar-style minimap (M) -- the world is infinite so there's no
  // fixed map to draw; instead it live-samples heightAt() in a radius around
  // the player (same band coloring as the terrain itself) and overlays
  // markers for the waterfall, nearby towns (planTown is a pure function of
  // chunk coords, so this works even for towns never actually visited) and
  // past camp spots.
  map: {
    sizePx: 200,
    rangeWorld: 260,
    sampleGrid: 40,
    updateIntervalMs: 300,
  },

  // Points system amounts -- see score.js. Hidden behind SHOW_SCORE=false,
  // so these numbers are just relative weights, not a tuned economy.
  score: {
    biomeDiscovery: 50,
    summit: 100,
    beach: 30,
    lakeShore: 30,
    townSquare: 50,
    townSquareRadius: 6, // how close to a town's center counts as "visiting" it
    waterfall: 40,
    waterfallRadius: 8,
    campsiteFound: 25,
    campsiteRadius: 6,
    // fbm noise output naturally clusters well below its nominal amplitude,
    // so real peaks land around ~0.6 of maxHeight, not close to it -- this
    // is tuned against the actual achievable range, not the theoretical one
    summitHeightFraction: 0.5,
    distanceUnit: 100, // world units per distance-traveled point tick
    distancePoints: 5,
    viewpointMinHeight: 10, // must be at least this high to count as a "viewpoint"
    viewpointStaySeconds: 3,
    viewpointPoints: 40,
    dayAtCampPoints: 60,
  },

  camera: {
    fov: 60,
    near: 0.1,
    far: 1000,
    chaseDistance: 8,
    chaseHeight: 3.5,
    lookHeight: 1.2,
    followLerp: 4,
    headingLerp: 5, // only applied while moving -- see MIN_SPEED_FOR_CAMERA_TURN in main.js
  },

  player: {
    // Blocky Characters kit isn't scaled to match the Car Kit -- correct
    // for it here. Measured: at 0.6 the player stood 1.62m tall next to a
    // car whose roof is only 1.30m above the ground -- noticeably taller
    // and wider than the car itself. 0.5 puts the player closer to the
    // car's own (deliberately compact/stylized) scale.
    scale: 0.5,
    walkSpeed: 3.2,
    sprintSpeed: 6.5,
    turnSpeed: 2.8,
    accel: 10,
    remountRadius: 3.5,
    mountOffset: {
      car: { x: 0, y: 0.05, z: -0.15 },
      bike: { x: 0, y: 0.4, z: -0.1 },
      boat: { x: 0, y: 0.3, z: 0 },
    },
    dismountSideOffset: 1.6,
    // procedural riding pose layered on top of the baked 'drive' clip while
    // mounted -- lean into turns, arms track the wheel/handlebars, legs
    // pedal on the bike (see player.js applyRidingPose)
    riding: {
      leanFactor: 0.35,
      leanSmoothing: 6,
      armFactor: 0.6,
      pedalRate: 0.15,
      pedalAmplitude: 0.5,
    },
    // Handheld flashlight, on while walking/sprinting whenever it's not full
    // daylight (same !isDay threshold as the vehicle headlights). Fixed
    // offset on the character root rather than a hand bone -- this rig has
    // no skeleton to attach to (see the Stage 4 note), and a fixed torch
    // position reads fine at this low-poly scale.
    torch: {
      offset: [0.22, 1.0, 0.3],
      intensity: 3,
      distance: 14,
      angle: 0.5,
    },
  },

  // Ambient wildlife -- movement without threat, no collision, purely
  // decorative. Birds/fish are single landmark-style instances (main.js,
  // same pattern as the waterfall); deer are chunk-scattered like
  // vegetation (world.js/wildlife.js's planDeer, same rejection-sampling
  // approach as scatter.groups).
  wildlife: {
    birds: {
      count: 6,
      radius: 14,
      height: 18,
      speed: 0.6, // radians/sec around the flock's circling path
      followLerp: 0.8, // how quickly the flock's center chases the player
    },
    deer: {
      seed: 20692,
      chance: 0.3, // rolled once per chunk, like town.chance
      countMin: 1,
      countMax: 3,
      wanderRadius: 6,
      speed: 1.0,
    },
    fish: {
      activeRadius: 80, // only jump when the player is this close to the lake
      jumpIntervalMin: 3,
      jumpIntervalMax: 8,
      arcHeight: 1.3,
      arcDuration: 0.8,
    },
  },

  // A slow orbiting drift the camera eases into when standing still at a
  // viewpoint on foot (same condition CONFIG.score.viewpointStaySeconds
  // scores, just a shorter/separate delay since this is ambiance, not a
  // reward) -- breaks back to the normal chase cam the moment you move.
  viewpointDrift: {
    delaySeconds: 2.5,
    radius: 7,
    height: 3.5,
    speed: 0.1,
  },

  time: {
    dayLengthSeconds: 360, // 6 minutes real-time per day at 1x (matches the Stage 7 day/night cycle)
    scales: [1, 4, 10], // cycled with T, only while camped
  },

  camp: {
    sitOffset: { x: 0, y: 0, z: 0.9 }, // player position relative to the fire, facing it
    dedupeRadius: 8, // camping within this distance of a past spot doesn't log a new "place stayed"
    orbit: { radius: 5, height: 2.2, speed: 0.15 },
    fire: { baseIntensity: 1.6, flicker: 0.35 },
    // Nature Kit's tent/campfire aren't scaled to match the rest of our
    // world (same issue as the rider vs. Car Kit) -- correct for it here.
    // Measured bounding boxes: at 2.2 the tent peaked at 1.23m, shorter than
    // the 1.6m player standing right next to it, which read as an oversized
    // player instead of a small tent. 3.0 puts the peak around 1.7m --
    // taller than the player, like an actual tent would be.
    tentScale: 3.0,
    campfireScale: 1.4,
  },

  vehicles: {
    car: {
      maxSpeed: 26,
      reverseSpeed: 8,
      accel: 16,
      grip: 6,
      driftGrip: 1.2,
      handbrakeDecel: 1.8,
      turnSpeed: 1.8,
      turnSpeedRef: 6,
      minTurnFactor: 0.2,
      maxSteerAngle: 0.5,
      steerResponse: 8,
      wheelRadius: 0.3,
      bodyHeight: 0.02,
      tiltLerp: 6,
      collisionRadius: 0.9, // roughly half the car's width -- trees/rocks block at this range
      // headlights: on whenever it's not full daylight (sky.js's !isDay) --
      // a lit lens dot on each side plus one shared forward SpotLight (see
      // vehicles.js addHeadlights). Offsets are tuned against the fallback
      // box body; close enough on the real sedan.glb too.
      headlightOffsets: [[-0.55, 0.55, 1.85], [0.55, 0.55, 1.85]],
      headlightIntensity: 3.5,
      headlightDistance: 24,
      headlightAngle: 0.45,
    },
    bike: {
      maxSpeed: 18,
      reverseSpeed: 5,
      accel: 12,
      grip: 8,
      driftGrip: 2.5,
      handbrakeDecel: 1.4,
      turnSpeed: 2.4,
      turnSpeedRef: 4,
      minTurnFactor: 0.2,
      maxSteerAngle: 0.6,
      steerResponse: 10,
      wheelRadius: 0.32,
      bodyHeight: 0.02,
      tiltLerp: 6,
      collisionRadius: 0.4,
      headlightOffsets: [[0, 0.75, 0.72]],
      headlightIntensity: 2.5,
      headlightDistance: 18,
      headlightAngle: 0.5,
    },
    boat: {
      isBoat: true, // updateOne() in vehicles.js branches on this: floats at waterLevel, blocked by land instead of by deep water
      maxSpeed: 10,
      reverseSpeed: 4,
      accel: 7,
      grip: 3, // loose/heavy compared to the car -- a boat coasts and turns slower
      driftGrip: 2,
      handbrakeDecel: 1.2,
      turnSpeed: 1.4,
      turnSpeedRef: 4,
      minTurnFactor: 0.25,
      maxSteerAngle: 0.4,
      steerResponse: 5,
      wheelRadius: 1, // unused (no wheel meshes), just avoids a /0 in the wheel-roll calc
      bodyHeight: 0.05,
      tiltLerp: 6,
      collisionRadius: 0.7,
      headlightOffsets: [[0, 0.4, 1.3]],
      headlightIntensity: 2,
      headlightDistance: 16,
      headlightAngle: 0.5,
      // near the lake shore closest to spawn -- found by walking spawn ->
      // lake center in terrain.js's own heightAt() until it dips underwater,
      // then a few more units in so it's safely afloat, not beached
      spawn: { x: -77.7, z: 59.1, heading: 2.1 },
    },
  },

  // Scattering: rejection-sampled by height band so each prop type lands in
  // the right biome (see WORLD spec: beach/palms, grassy hills/trees, rocks
  // everywhere, flowers/mushrooms on grass). InstancedMesh per model file,
  // generated per chunk (see vegetation.js/world.js) with a chunk-coordinate
  // seed, so the same chunk always regenerates identically.
  scatter: {
    seed: 9001, // separate RNG stream from the terrain noise
    // Keep a clearing around the vehicle spawn point (0, 30) -- a bare
    // radius isn't enough, since it only guarantees nothing spawns *at*
    // spawn, not a clear path *out* of it (a tree just past the radius,
    // dead ahead, blocks a new player just as effectively). The corridor
    // guarantees a straight runway in the default spawn heading (+z).
    spawnClearing: { x: 0, z: 30, radius: 10, corridorHalfWidth: 5, corridorForward: 100 },
    // counts below are "per chunk" (chunk area = chunkSize^2), carried over
    // from the old whole-map counts at the same density
    groups: [
      {
        name: 'trees',
        urls: ['assets/nature/tree_default.glb', 'assets/nature/tree_oak.glb', 'assets/nature/tree_pineTallA.glb', 'assets/nature/tree_tall.glb'],
        fallbackKind: 'tree',
        countPerChunk: 53,
        minHeight: 1.6,
        maxHeight: 16,
        scaleRange: [0.8, 1.35],
        collisionRadius: 0.35, // trunk width -- vehicles shouldn't drive through it
      },
      {
        name: 'palms',
        urls: ['assets/nature/tree_palm.glb', 'assets/nature/tree_palmTall.glb'],
        fallbackKind: 'palm',
        countPerChunk: 18,
        minHeight: 0.5,
        maxHeight: 2.2,
        scaleRange: [0.8, 1.2],
        collisionRadius: 0.3,
      },
      {
        name: 'rocks',
        urls: ['assets/nature/rock_largeA.glb', 'assets/nature/rock_largeC.glb', 'assets/nature/rock_smallA.glb', 'assets/nature/rock_tallB.glb'],
        fallbackKind: 'rock',
        countPerChunk: 41,
        minHeight: 0.6,
        maxHeight: Infinity,
        scaleRange: [0.7, 1.6],
        collisionRadius: 0.45,
      },
      {
        name: 'accents',
        urls: ['assets/nature/grass.glb', 'assets/nature/flower_redA.glb', 'assets/nature/mushroom_red.glb', 'assets/nature/stump_round.glb'],
        fallbackKind: 'accent',
        countPerChunk: 65,
        minHeight: 1.2,
        maxHeight: 13,
        scaleRange: [0.8, 1.2],
      },
    ],
  },

  // soft teal, sage, sand, slate -- no near-black, no violet
  palette: {
    water: 0x3f7f7a,
    sand: 0xd8c9a3,
    grass: 0x8fae7d,
    rock: 0x818a97,
    snow: 0xe8ede9,
    skyTop: 0x7fa8b8,
    skyBottom: 0xdce9dd,
    fog: 0xaebfc0,
  },
};
