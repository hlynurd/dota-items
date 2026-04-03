// Raw response types from the OpenDota API

export interface OpenDotaHero {
  id: number;
  name: string; // npc_dota_hero_antimage
  localized_name: string;
  primary_attr: "str" | "agi" | "int" | "all";
  attack_type: "Melee" | "Ranged";
  roles: string[];
  legs: number;
}

export interface OpenDotaItem {
  id: number;
  img: string; // /apps/dota2/images/dota_react/items/blink.png?t=...
  dname: string; // display name: "Blink Dagger"
  qual: string;
  cost: number;
  lore?: string;
  components: string[] | null;
  created: boolean;
}

// constants/items returns { [item_name]: OpenDotaItem }
export type OpenDotaItemsMap = Record<string, OpenDotaItem>;

// heroes/{hero_id}/itemPopularity
export interface OpenDotaItemPopularity {
  start_game_items: Record<string, number>; // item_id (string) -> match count
  early_game_items: Record<string, number>;
  mid_game_items: Record<string, number>;
  late_game_items: Record<string, number>;
}

// heroes/{hero_id}/matchups
export interface OpenDotaMatchup {
  hero_id: number;
  games_played: number;
  wins: number;
}
