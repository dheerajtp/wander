// Same height bands terrain.js uses for vertex coloring, reused here to
// name the biome under a given world position -- for the HUD and for the
// score hooks' "first visit to each biome".
export function getBiome(x, z, height, CONFIG) {
  const { sand, grass, rock } = CONFIG.bands;
  const lake = CONFIG.terrain.lake;

  if (height <= 0) {
    const distFromLake = Math.hypot(x - lake.center.x, z - lake.center.z);
    return distFromLake < lake.radius + 15 ? 'Lake' : 'Sea';
  }
  if (height <= sand) return 'Beach';
  if (height <= grass) return 'Hills';
  if (height <= rock) return 'Mountains';
  return 'Snowy Peak';
}
