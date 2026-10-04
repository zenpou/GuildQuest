export type StatKey = 'hp' | 'atk' | 'def' | 'mag' | 'spd' | 'dex' | 'scout' | 'gather';
export type Stats = Record<StatKey, number>;
export const STAT_KEYS: StatKey[] = ['hp', 'atk', 'def', 'mag', 'spd', 'dex', 'scout', 'gather'];
export const STAT_LABEL: Record<StatKey, string> = {
  hp: 'HP', atk: '腕力', def: '守備', mag: '魔力', spd: '素早さ', dex: '器用さ', scout: '探索', gather: '採取',
};

// ---- データ定義(JSON) ----
export interface JobDef {
  id: string; name: string; desc: string; attackStat: 'atk' | 'mag';
  statMult: Stats;
  skill: { id: string; name: string; mult: number; cd: number; neverMiss: boolean; ignoreDef: number };
  heal?: { name: string; ratio: number };
}
export interface PersonalityDef {
  id: string; name: string; desc: string;
  retreatBias: number; fightBias: number; lootBias: number; trapCare: number; cover: number;
  likes: string[]; dislikes: string[];
}
export interface TraitDef {
  id: string; name: string; desc: string; mods: Partial<Stats>;
  luck?: number; lostBias?: number; expRate?: number; fatigueRate?: number; salaryMult?: number; hiddenChance: number;
}
export interface EnemyDef {
  id: string; name: string; hp: number; atk: number; def: number; mag: number; spd: number; exp: number;
  gold: [number, number]; loot: { item: string; chance: number }; ai: 'random' | 'weakest' | 'strongest';
  boss?: boolean; skill?: { name: string; mult: number; cd: number; aoe: boolean };
}
export interface ItemDef { id: string; name: string; price: number }
export interface AreaDef {
  id: string; name: string; desc: string; recommended: number;
  enemies: { id: string; weight: number; group: [number, number] }[];
}
export interface QuestDef {
  id: string; name: string; area: string; type: 'gather' | 'hunt' | 'explore' | 'boss';
  target: { item?: string; enemy?: string; n?: number };
  days: number; reward: number; exp: number; unlockRep: number; desc: string; final?: boolean;
  /** 4人編成での戦力目安。未指定なら探索地の推奨戦力から求める。 */
  recommended?: number;
}
export interface FacilityDef { id: string; name: string; desc: string; maxLevel: number; costs: number[]; effectText: string[] }
export interface PolicyDef {
  id: string; name: string; desc: string; retreat: number; combat: number; treasure: number; avoid: number;
  goldMult: number; groupBonus: number; expMult: number;
}
export interface EventDef {
  id: string; kind: string; weight: number; areas: string[] | null; params: Record<string, any>;
  texts: string[]; ok?: string[]; ng?: string[];
}
export interface MisunderstandingDef {
  id: string; tag: string; rep: number; scene: string[]; thought: string;
}

// ---- 実行時データ ----
export interface TraitInstance { id: string; revealed: boolean }

export interface Adventurer {
  id: string; name: string; age: number; level: number; exp: number;
  job: string; base: Stats; apt: Record<string, number>; growth: number;
  personality: string; traits: TraitInstance[];
  fatigue: number; injuryDays: number; salary: number; loyalty: number;
  status: 'idle' | 'away';
  hiredDay: number; expeditions: number; kills: number;
  profile?: { key: string; bio: string; quote: string; icon: string }; // 固定メンバーのみ
}

export interface Candidate { adv: Adventurer; arrivedDay: number; expiresDay: number }

export type LogKind = 'narration' | 'combat' | 'talk' | 'event' | 'relation' | 'result';
export interface LogEntry { day: number; kind: LogKind; text: string }

export interface ReturnDialogue {
  advId: string;
  name: string;
  text: string;
  character?: string;
}

export interface RelationDelta { a: string; b: string; delta: number; reason: string }

export interface ExpeditionResult {
  questId: string; partyIds: string[]; leaderId: string; policy: string; potions: number;
  days: number; startDay: number; returnDay: number;
  success: boolean; retreated: boolean; wiped: boolean;
  log: LogEntry[];
  questGold: number; lootGold: number; materials: Record<string, number>; materialGold: number;
  injuries: Record<string, number>;
  expGain: Record<string, number>;
  fatigue: Record<string, number>;
  relationDeltas: RelationDelta[];
  revealedTraits: { advId: string; traitId: string }[];
  kills: Record<string, number>;
  potionsUsed: number;
  repGain: number;
  names: Record<string, string>;
  returnDialogue?: ReturnDialogue[];
  claimed?: boolean;
}

export interface Scene { id: string; day: number; lines: string[]; thought: string; rep: number }
export interface LedgerEntry { day: number; label: string; amount: number }

/**
 * New games carry this small, versioned progression marker.  It is optional
 * on GameState so saves written before the campaign tutorial continue to run
 * in the original, unrestricted ruleset.
 */
export interface CampaignState {
  version: 1;
  jobChanged: boolean;
  seenChapters: string[];
  introComplete: boolean;
  prologueSeen?: boolean;
  /** Days on which the tutorial operating grant was already paid. */
  supportPaidDays?: number[];
}

export interface GameState {
  playerName: string;
  seed: number; day: number; gold: number; rep: number;
  campaign?: CampaignState;
  adventurers: Adventurer[];
  candidates: Candidate[];
  relations: Record<string, number>;
  facilities: Record<string, number>;
  expeditions: ExpeditionResult[];       // 進行中
  history: ExpeditionResult[];           // 帰還済み(新しい順)
  scenes: Scene[];                       // 勘違いイベント履歴(新しい順)
  seenScenes: string[];
  ledger: LedgerEntry[];
  notices: { day: number; text: string }[];
  counters: { nextId: number; dispatches: number };
  clears: Record<string, number>;
  finalCleared: boolean;
  debt: boolean;
  repMilestones: number[];
  pendingTags: string[];
  seenCharEvents?: string[];
  dispatchedToday: boolean;
  hiredToday: boolean;
}

export const MAX_DAY = 30;
export const PARTY_MAX = 4;
export const POTION_PRICE = 30;
export const UPKEEP_PER_DAY = 30;

