import { planTown } from './town.js';
import { planCampsite } from './campsite.js';

// Same band thresholds the terrain mesh itself is colored by (terrain.js),
// minus the blending -- a minimap reads better as flat color regions than
// smoothed bands anyway.
function bandColor(h, CONFIG) {
  const p = CONFIG.palette;
  const { sand, grass, rock } = CONFIG.bands;
  if (h < CONFIG.terrain.waterLevel) return p.water;
  if (h < sand) return p.sand;
  if (h < grass) return p.grass;
  if (h < rock) return p.rock;
  return p.snow;
}

function hexToCss(hex) {
  return '#' + hex.toString(16).padStart(6, '0');
}

// planTown() is a pure function of chunk coordinates (same deterministic-per-
// coordinate approach as vegetation), so nearby towns can be found without
// them ever having been loaded or visited.
function findTownsInRange(px, pz, CONFIG, heightAt) {
  const { chunkSize } = CONFIG.world;
  const r = CONFIG.map.rangeWorld;
  const cxMin = Math.floor((px - r) / chunkSize);
  const cxMax = Math.floor((px + r) / chunkSize);
  const czMin = Math.floor((pz - r) / chunkSize);
  const czMax = Math.floor((pz + r) / chunkSize);
  const towns = [];
  for (let cx = cxMin; cx <= cxMax; cx++) {
    for (let cz = czMin; cz <= czMax; cz++) {
      const plan = planTown(cx, cz, CONFIG, heightAt);
      if (plan) towns.push(plan.center);
    }
  }
  return towns;
}

// Same idea as findTownsInRange -- planCampsite is pure, so wayside
// campsites show up on the map even before you've ever driven past one.
function findCampsitesInRange(px, pz, CONFIG, heightAt) {
  const { chunkSize } = CONFIG.world;
  const r = CONFIG.map.rangeWorld;
  const cxMin = Math.floor((px - r) / chunkSize);
  const cxMax = Math.floor((px + r) / chunkSize);
  const czMin = Math.floor((pz - r) / chunkSize);
  const czMax = Math.floor((pz + r) / chunkSize);
  const spots = [];
  for (let cx = cxMin; cx <= cxMax; cx++) {
    for (let cz = czMin; cz <= czMax; cz++) {
      const plan = planCampsite(cx, cz, CONFIG, heightAt);
      if (plan) spots.push(plan);
    }
  }
  return spots;
}

// Towns/campsites are sparse -- ~1 in 8 and 1 in 7 chunks respectively --
// so the nearest one is very often well outside the map's own display
// range (nothing to show is not the same as nothing nearby). This expands
// outward chunk-ring by chunk-ring, well past rangeWorld, and stops at the
// first hit -- cheap in the common case since real-world spacing means it
// rarely needs more than a handful of rings.
function ringSearchNearest(px, pz, CONFIG, planFn, maxRingChunks) {
  const { chunkSize } = CONFIG.world;
  const pcx = Math.floor(px / chunkSize);
  const pcz = Math.floor(pz / chunkSize);
  for (let ring = 0; ring <= maxRingChunks; ring++) {
    for (let dx = -ring; dx <= ring; dx++) {
      for (let dz = -ring; dz <= ring; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
        const result = planFn(pcx + dx, pcz + dz);
        if (result) return result;
      }
    }
  }
  return null;
}

export function createMinimap(CONFIG, heightAt, canvas) {
  const ctx = canvas.getContext('2d');
  const cfg = CONFIG.map;
  canvas.width = cfg.sizePx;
  canvas.height = cfg.sizePx;
  const half = cfg.sizePx / 2;

  let visible = false;
  let lastDraw = -Infinity;

  function toScreen(wx, wz, px, pz) {
    return {
      x: half + ((wx - px) / cfg.rangeWorld) * half,
      y: half - ((wz - pz) / cfg.rangeWorld) * half,
    };
  }

  // Same as toScreen, but a landmark farther away than the map's range gets
  // pinned to the rim instead of vanishing off-screen -- so "which way do I
  // walk" always has an answer, even for a town or the lake hundreds of
  // units past what the map actually renders in detail.
  const EDGE_MARGIN = 10;
  function toScreenClamped(wx, wz, px, pz) {
    const s = toScreen(wx, wz, px, pz);
    const dx = s.x - half;
    const dy = s.y - half;
    const dist = Math.hypot(dx, dy);
    const maxR = half - EDGE_MARGIN;
    if (dist <= maxR || dist === 0) return s;
    const k = maxR / dist;
    return { x: half + dx * k, y: half + dy * k };
  }

  function dot(sx, sy, radius, color) {
    if (sx < -radius || sx > cfg.sizePx + radius || sy < -radius || sy > cfg.sizePx + radius) return;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(sx, sy, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  // A plain dot pinned to the rim reads as "it's right here" just as easily
  // as "walk this way" -- this draws an outward-pointing arrowhead plus a
  // distance readout instead, specifically for landmarks the small in-range
  // scan didn't find at all (see the ringSearchNearest call sites below).
  function drawDirectionIndicator(wx, wz, px, pz, color) {
    const dx = wx - px;
    const dz = wz - pz;
    const dist = Math.hypot(dx, dz);
    const angle = Math.atan2(dx, dz); // same heading convention as the player arrow below (fx=sin, fz=cos)
    const maxR = half - EDGE_MARGIN;
    const tipX = half + Math.sin(angle) * maxR;
    const tipY = half - Math.cos(angle) * maxR;

    ctx.save();
    ctx.translate(tipX, tipY);
    ctx.rotate(angle);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(4.5, 5);
    ctx.lineTo(-4.5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    const labelR = maxR - 15;
    const lx = half + Math.sin(angle) * labelR;
    const ly = half - Math.cos(angle) * labelR;
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.font = '700 9px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.round(dist)}m`, lx, ly + 3);
  }

  function draw(now, playerPos, heading, campHistory, waterfallPos) {
    if (!visible || now - lastDraw < cfg.updateIntervalMs) return;
    lastDraw = now;

    const px = playerPos.x;
    const pz = playerPos.z;

    ctx.clearRect(0, 0, cfg.sizePx, cfg.sizePx);
    ctx.save();
    ctx.beginPath();
    ctx.arc(half, half, half, 0, Math.PI * 2);
    ctx.clip();

    const n = cfg.sampleGrid;
    const cell = cfg.sizePx / n;
    for (let iy = 0; iy < n; iy++) {
      for (let ix = 0; ix < n; ix++) {
        const wx = px + ((ix + 0.5) / n - 0.5) * 2 * cfg.rangeWorld;
        const wz = pz - ((iy + 0.5) / n - 0.5) * 2 * cfg.rangeWorld;
        ctx.fillStyle = hexToCss(bandColor(heightAt(wx, wz, CONFIG), CONFIG));
        ctx.fillRect(ix * cell, iy * cell, cell + 1, cell + 1);
      }
    }

    const towns = findTownsInRange(px, pz, CONFIG, heightAt);
    if (towns.length) {
      for (const t of towns) {
        const s = toScreen(t.x, t.z, px, pz);
        dot(s.x, s.y, 4, '#e0592a');
      }
    } else {
      // nothing in range -- point toward the nearest one instead of just
      // showing an empty map, since real spacing between towns is usually
      // bigger than what the map displays in detail
      const nearest = ringSearchNearest(px, pz, CONFIG, (cx, cz) => planTown(cx, cz, CONFIG, heightAt), 40);
      if (nearest) drawDirectionIndicator(nearest.center.x, nearest.center.z, px, pz, '#e0592a');
    }

    const lake = CONFIG.terrain.lake.center;
    const lakeS = toScreenClamped(lake.x, lake.z, px, pz);
    dot(lakeS.x, lakeS.y, 3, '#2f6560');

    const wf = toScreenClamped(waterfallPos.x, waterfallPos.z, px, pz);
    dot(wf.x, wf.y, 3, '#dfeff0');

    const campsites = findCampsitesInRange(px, pz, CONFIG, heightAt);
    if (campsites.length) {
      for (const c of campsites) {
        const s = toScreen(c.x, c.z, px, pz);
        dot(s.x, s.y, 3, '#c97b3d');
      }
    } else {
      const nearest = ringSearchNearest(px, pz, CONFIG, (cx, cz) => planCampsite(cx, cz, CONFIG, heightAt), 40);
      if (nearest) drawDirectionIndicator(nearest.x, nearest.z, px, pz, '#c97b3d');
    }

    for (const c of campHistory) {
      const s = toScreen(c.x, c.z, px, pz);
      dot(s.x, s.y, 3, '#f2c94c');
    }

    // player, drawn last so it's always on top
    const dx = Math.sin(heading);
    const dz = Math.cos(heading);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(half + dx * 7, half - dz * 7);
    ctx.lineTo(half - dx * 4 + dz * 4, half + dz * 4 + dx * 4);
    ctx.lineTo(half - dx * 4 - dz * 4, half + dz * 4 - dx * 4);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(half, half, half - 1, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('N', half, 13);
  }

  return {
    draw,
    toggle() {
      visible = !visible;
      canvas.style.display = visible ? 'block' : 'none';
      if (visible) lastDraw = -Infinity; // force an immediate redraw
      return visible;
    },
  };
}
