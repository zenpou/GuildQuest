import dialogueJson from '../data/outcome-dialogue.json';
import type { Rng } from './rng';
import type { Adventurer, ExpeditionResult, ReturnDialogue } from './types';

export type OutcomeDialogueKind = 'success' | 'incomplete' | 'retreated' | 'wiped';

type DialogueVariants = Record<OutcomeDialogueKind, string[]>;

export interface OutcomeDialogueCatalog {
  characters: Record<string, DialogueVariants>;
  personalities: Record<string, DialogueVariants>;
  fallback: DialogueVariants;
}

export const OUTCOME_DIALOGUE = dialogueJson as unknown as OutcomeDialogueCatalog;

const fixedCharacterKeys = new Set(['aldo', 'mina', 'lina', 'bruno']);

const hasLines = (lines: string[] | undefined): lines is string[] => Boolean(lines?.length);

function linesFor(member: Adventurer, kind: OutcomeDialogueKind): { lines: string[]; character?: string } {
  const character = member.profile?.key;
  if (character && fixedCharacterKeys.has(character)) {
    const lines = OUTCOME_DIALOGUE.characters[character]?.[kind];
    if (hasLines(lines)) return { lines, character };
  }

  const personalityLines = OUTCOME_DIALOGUE.personalities[member.personality]?.[kind];
  if (hasLines(personalityLines)) return { lines: personalityLines };

  return { lines: OUTCOME_DIALOGUE.fallback[kind] };
}

export function outcomeDialogueKind(result: Pick<ExpeditionResult, 'success' | 'retreated' | 'wiped'>): OutcomeDialogueKind {
  if (result.wiped) return 'wiped';
  if (result.retreated) return 'retreated';
  if (result.success) return 'success';
  return 'incomplete';
}

export function generateOutcomeDialogue(
  members: readonly Adventurer[],
  kind: OutcomeDialogueKind,
  rng: Rng,
): ReturnDialogue[] {
  return members.map((member) => {
    const selected = linesFor(member, kind);
    const line: ReturnDialogue = { advId: member.id, name: member.name, text: rng.pick(selected.lines) };
    if (selected.character) line.character = selected.character;
    return line;
  });
}
