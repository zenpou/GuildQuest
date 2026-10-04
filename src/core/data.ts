import jobsJson from '../data/jobs.json';
import personalitiesJson from '../data/personalities.json';
import traitsJson from '../data/traits.json';
import enemiesJson from '../data/enemies.json';
import itemsJson from '../data/items.json';
import areasJson from '../data/areas.json';
import questsJson from '../data/quests.json';
import facilitiesJson from '../data/facilities.json';
import policiesJson from '../data/policies.json';
import eventsJson from '../data/events.json';
import dialogueJson from '../data/dialogue.json';
import misJson from '../data/misunderstandings.json';
import namesJson from '../data/names.json';
import charactersJson from '../data/characters.json';
import charEventsJson from '../data/charevents.json';
import type {
  JobDef, PersonalityDef, TraitDef, EnemyDef, ItemDef, AreaDef, QuestDef, FacilityDef, PolicyDef, EventDef,
  MisunderstandingDef,
} from './types';

const byId = <T extends { id: string }>(arr: T[]): Record<string, T> => Object.fromEntries(arr.map((x) => [x.id, x]));

export const JOBS = jobsJson as unknown as JobDef[];
export const PERSONALITIES = personalitiesJson as unknown as PersonalityDef[];
export const TRAITS = traitsJson as unknown as TraitDef[];
export const ENEMIES = enemiesJson as unknown as EnemyDef[];
export const ITEMS = itemsJson as unknown as ItemDef[];
export const AREAS = areasJson as unknown as AreaDef[];
export const QUESTS = questsJson as unknown as QuestDef[];
export const FACILITIES = facilitiesJson as unknown as FacilityDef[];
export const POLICIES = policiesJson as unknown as PolicyDef[];
export const EVENTS = eventsJson as unknown as EventDef[];
export const MISUNDERSTANDINGS = misJson as unknown as MisunderstandingDef[];
export const DIALOGUE = dialogueJson as unknown as Record<string, any>;
export const NAMES = namesJson as { given: string[] };

export const JOB = byId(JOBS);
export const PERSONALITY = byId(PERSONALITIES);
export const TRAIT = byId(TRAITS);
export const ENEMY = byId(ENEMIES);
export const ITEM = byId(ITEMS);
export const AREA = byId(AREAS);
export const QUEST = byId(QUESTS);
export const FACILITY = byId(FACILITIES);
export const POLICY = byId(POLICIES);

export const PROTAGONIST = 'ユウト';

export interface CharacterDef {
  key: string; name: string; age: number; level: number; job: string; icon: string;
  base: Record<string, number>; apt: Record<string, number>; growth: number; personality: string;
  traits: { id: string; revealed: boolean }[]; loyalty: number; bio: string; quote: string;
}
export const CHARACTERS = (charactersJson as unknown as { members: CharacterDef[]; relations: { a: string; b: string; value: number }[] });
export interface CharEventDef {
  id: string; char: string; title: string;
  cond: { minDay?: number; minExpeditions?: number; minLevel?: number; job?: string; allyInjured?: boolean };
  lines: { speaker: string; text: string }[];
  effects: { loyalty?: number; rep?: number; relation?: { with: string; delta: number }; revealTrait?: string };
}
export const CHAR_EVENTS = charEventsJson as unknown as CharEventDef[];
