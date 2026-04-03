const CDN = "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react";

// hero.name = "npc_dota_hero_antimage" → "antimage"
export function heroImgUrl(heroInternalName: string): string {
  const shortName = heroInternalName.replace("npc_dota_hero_", "");
  return `${CDN}/heroes/${shortName}.png`;
}

// item_name = "blink" → full CDN URL
export function itemImgUrl(itemName: string): string {
  return `${CDN}/items/${itemName}.png`;
}
