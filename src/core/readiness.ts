import { AREA } from './data';
import { simulateExpedition } from './expedition';
import { rngFor } from './rng';
import type { Adventurer, QuestDef } from './types';

/**
 * Quest-specific benchmark for a full party; fewer adventurers do not make
 * an enemy weaker.  Quests whose real risk differs from their area average
 * (wolves hit harder than the forest suggests, ruins surveys are gentler than
 * the dragon next door) carry their own measured value in quests.json.
 */
export function questRecommendedPower(quest: QuestDef): number {
  if (quest.recommended) return quest.recommended;
  return Math.round(AREA[quest.area].recommended * (quest.type === 'boss' ? 1.1 : 1));
}

export interface ForecastInput {
  questId: string; members: Adventurer[]; leaderId: string; policy: string; potions: number;
  relations: Record<string, number>; expMult: number; clinicLevel: number;
}
/** Rates are 0..1; injuries is the mean number of injured members per run. */
export interface Forecast {
  samples: number; success: number; timeout: number; retreat: number; wipe: number; injuries: number;
}
export type ForecastVerdict = '余裕' | '適正' | '厳しい' | '危険';
export const FORECAST_SAMPLES = 80;

/**
 * Dry-runs the real expedition with throwaway dice so the preview reflects
 * everything a power total cannot: gathering skill, policy, potions, the
 * leader's nerve and fatigue.  The seeds are fixed and unrelated to the
 * save, so the same plan always shows the same forecast and it can neither
 * reveal nor alter the result a dispatch will actually roll.
 */
export function forecastExpedition(input: ForecastInput, samples = FORECAST_SAMPLES): Forecast {
  let success = 0, retreat = 0, wipe = 0, injuries = 0;
  for (let i = 0; i < samples; i++) {
    const r = simulateExpedition({ ...input, rng: rngFor(0, 'forecast', i), startDay: 1 });
    if (r.success) success++;
    else if (r.wiped) wipe++;
    else if (r.retreated) retreat++;
    injuries += Object.keys(r.injuries).length;
  }
  return {
    samples, success: success / samples, retreat: retreat / samples, wipe: wipe / samples,
    timeout: (samples - success - retreat - wipe) / samples, injuries: injuries / samples,
  };
}

/** A win that sends a member to the clinic every time is not a comfortable job. */
export function forecastVerdict(f: Forecast): ForecastVerdict {
  if (f.success < 0.35) return '危険';
  if (f.success < 0.65 || f.injuries >= 1) return '厳しい';
  if (f.success >= 0.85 && f.injuries <= 0.3) return '余裕';
  return '適正';
}
