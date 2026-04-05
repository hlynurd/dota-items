/**
 * Hero nickname/alias map for search. Keys are lowercase aliases,
 * values are hero IDs (OpenDota). Multiple aliases can map to the same hero.
 */
export const HERO_ALIASES: Record<string, number> = {
  // Anti-Mage
  am: 1, magina: 1,
  // Axe
  mogul: 2,
  // Bane
  atropos: 3,
  // Bloodseeker
  bs: 4, strygwyr: 4,
  // Crystal Maiden
  cm: 5, rylai: 5,
  // Drow Ranger
  drow: 6, traxex: 6,
  // Earthshaker
  es: 7, shaker: 7, raigor: 7,
  // Juggernaut
  jugg: 8, yurnero: 8,
  // Mirana
  potm: 9, mirrana: 9,
  // Morphling
  morph: 10,
  // Shadow Fiend
  sf: 11, nevermore: 11,
  // Phantom Lancer
  pl: 12, azwraith: 12,
  // Puck
  faerie: 13,
  // Pudge
  butcher: 14,
  // Razor
  lightning: 15,
  // Sand King
  sk: 16, crix: 16, sandking: 16,
  // Storm Spirit
  storm: 17, raijin: 17, ss: 17,
  // Sven
  rogue: 18,
  // Tiny
  stone: 19,
  // Vengeful Spirit
  vs: 20, venge: 20, shendelzare: 20,
  // Windranger
  wr: 21, windrunner: 21, lyralei: 21,
  // Zeus
  zuus: 22, thundergod: 22,
  // Kunkka
  admiral: 23,
  // Lina
  slayer: 25,
  // Lion
  demon: 26,
  // Shadow Shaman
  rhasta: 27, shaman: 27,
  // Slardar
  slithereen: 28,
  // Tidehunter
  tide: 29, leviathan: 29,
  // Witch Doctor
  wd: 30, zharvakko: 30,
  // Lich
  ethreain: 31,
  // Riki
  sa: 32, stealth: 32,
  // Enigma
  eidolon: 33,
  // Tinker
  boush: 34,
  // Sniper
  kardel: 35,
  // Necrophos
  necro: 36, rotundjere: 36, necrolyte: 36,
  // Warlock
  demnok: 37,
  // Beastmaster
  bm: 38, karroch: 38, beast: 38,
  // Queen of Pain
  qop: 39, akasha: 39,
  // Venomancer
  veno: 40, lesale: 40,
  // Faceless Void
  void: 41, fv: 41, darkterror: 41,
  // Wraith King
  wk: 42, skeleton: 42, leoric: 42, sk2: 42,
  // Death Prophet
  dp: 43, krobelus: 43,
  // Phantom Assassin
  pa: 44, mortred: 44,
  // Pugna
  oblivion: 45, nether: 45,
  // Templar Assassin
  ta: 46, lanaya: 46,
  // Viper
  netherdrake: 47,
  // Luna
  nova: 48,
  // Dragon Knight
  dk: 49, davion: 49,
  // Dazzle
  shadow: 50,
  // Clockwerk
  clock: 51, rattletrap: 51, cw: 51,
  // Leshrac
  lesh: 52, tormented: 52,
  // Nature's Prophet
  np: 53, furion: 53, prophet: 53, natures: 53,
  // Lifestealer
  ls: 54, naix: 54, ls2: 54,
  // Dark Seer
  ds: 55, ish: 55,
  // Clinkz
  bone: 56, fletcher: 56,
  // Omniknight
  omni: 57, purist: 57,
  // Enchantress
  ench: 58, aiushtha: 58, bambi: 58,
  // Huskar
  sacred: 59,
  // Night Stalker
  ns: 60, balanar: 60,
  // Broodmother
  brood: 61, bm2: 61,
  // Bounty Hunter
  bh: 62, gondar: 62,
  // Weaver
  skitskurr: 63, bug: 63,
  // Jakiro
  jak: 64, twin: 64,
  // Batrider
  bat: 65,
  // Chen
  holy: 66,
  // Spectre
  spec: 67, mercurial: 67,
  // Ancient Apparition
  aa: 68, kaldr: 68,
  // Doom
  lucifer: 69,
  // Ursa
  fuzzy: 70, ulfsaar: 70, bear: 70,
  // Spirit Breaker
  sb: 71, barathrum: 71, bara: 71, cow: 71,
  // Gyrocopter
  gyro: 72, aurel: 72,
  // Alchemist
  alch: 73, razzil: 73,
  // Invoker
  invo: 74, carl: 74, voker: 74,
  // Silencer
  nortrom: 75,
  // Outworld Destroyer
  od: 76, obsidian: 76, outworld: 76, harbinger: 76,
  // Lycan
  banehallow: 77,
  // Brewmaster
  brew: 78, mangix: 78, panda: 78,
  // Shadow Demon
  sd: 79,
  // Lone Druid
  ld: 80, sylla: 80,
  // Chaos Knight
  ck: 81,
  // Meepo
  geomancer: 82, geo: 82,
  // Treant Protector
  treant: 83, tree: 83, rooftrellen: 83,
  // Ogre Magi
  ogre: 84,
  // Undying
  dirge: 85, zombies: 85,
  // Rubick
  grand: 86, magus: 86,
  // Disruptor
  disrupt: 87, thrall: 87,
  // Nyx Assassin
  nyx: 88, nerubian: 88, na: 88,
  // Naga Siren
  naga: 89, slithice: 89,
  // Keeper of the Light
  kotl: 90, ezalor: 90, gandalf: 90,
  // Io
  wisp: 91,
  // Visage
  familiar: 92, gargoyle: 92,
  // Slark
  murloc: 93,
  // Medusa
  dusa: 94, gorgon: 94,
  // Troll Warlord
  troll: 95, jah: 95, tw: 95,
  // Centaur Warrunner
  centaur: 96, bradwarden: 96,
  // Magnus
  mag: 97, magnataur: 97, empower: 97,
  // Timbersaw
  timber: 98, shredder: 98, rizzrack: 98,
  // Bristleback
  bb: 99, bristle: 99, rigwarl: 99,
  // Tusk
  ymir: 100, snowball: 100,
  // Skywrath Mage
  sky: 101, dragonus: 101, skywrath: 101,
  // Abaddon
  aba: 102, lord: 102,
  // Elder Titan
  et: 103, titan: 103, worldsmith: 103,
  // Legion Commander
  lc: 104, legion: 104, tresdin: 104,
  // Techies
  squee: 105, spleen: 105, spoon: 105,
  // Ember Spirit
  ember: 106, xin: 106,
  // Earth Spirit
  kaolin: 107, ebola: 107,
  // Underlord
  pitlord: 108, pit: 108, vrogros: 108,
  // Terrorblade
  tb: 109, terror: 109,
  // Phoenix
  icarus: 110, bird: 110,
  // Oracle
  nerif: 111,
  // Winter Wyvern
  ww: 112, wyvern: 112, auroth: 112,
  // Arc Warden
  arc: 113, zet: 113,
  // Monkey King
  mk: 114, wukong: 114, monkey: 114,
  // Dark Willow
  willow: 119, dw: 119, mireska: 119,
  // Pangolier
  pango: 120, donté: 120, pangolier: 120,
  // Grimstroke
  grim: 121,
  // Hoodwink
  hood: 123, squirrel: 123,
  // Void Spirit
  inai: 126, voidspirit: 126,
  // Snapfire
  snap: 128, beatrix: 128, cookie: 128, grandma: 128,
  // Mars
  ares: 129,
  // Dawnbreaker
  dawn: 135, valora: 135, db: 135,
  // Marci
  sidekick: 136,
  // Primal Beast
  pb: 137, primal: 137, beast2: 137,
  // Muerta
  gunslinger: 138,
  // Ringmaster
  rm: 145,
  // Kez
  assassin: 146,
  // Largo
  // (hero 155 — very new, may lack data)
};

/**
 * Check if a query matches a hero via aliases.
 * Returns true if the query is a prefix of any alias for this hero.
 */
export function matchesAlias(heroId: number, query: string): boolean {
  const q = query.toLowerCase();
  for (const [alias, id] of Object.entries(HERO_ALIASES)) {
    if (id === heroId && alias.startsWith(q)) return true;
  }
  return false;
}
