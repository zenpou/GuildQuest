import { describe, expect, it } from 'vitest';
import { newGame } from '../src/core/game';
import { generateOutcomeDialogue, outcomeDialogueKind, OUTCOME_DIALOGUE, type OutcomeDialogueKind } from '../src/core/outcomeDialogue';
import { simulateExpedition } from '../src/core/expedition';
import { rngFor } from '../src/core/rng';
import type { Adventurer } from '../src/core/types';

const KINDS: OutcomeDialogueKind[] = ['success', 'incomplete', 'retreated', 'wiped'];
const PERSONALITIES = ['cautious', 'brave', 'greedy', 'caring', 'proud', 'timid'];

const fixedMembers = () => newGame(11).adventurers.map((member) => structuredClone(member));

function recruitedLike(base: Adventurer, personality: string): Adventurer {
  const member = structuredClone(base);
  member.id = `recruit-${personality}`;
  member.name = `${personality}候補`;
  member.personality = personality;
  delete member.profile;
  return member;
}

describe('帰還時台詞', () => {
  it('固定4人は結果4種それぞれでプロフィール別の台詞を持つ', () => {
    for (const kind of KINDS) {
      const members = fixedMembers();
      const lines = generateOutcomeDialogue(members, kind, rngFor(31, 'return-dialogue-test', kind));
      expect(lines).toHaveLength(4);
      for (const [index, line] of lines.entries()) {
        const member = members[index];
        expect(line).toMatchObject({ advId: member.id, name: member.name, character: member.profile!.key });
        expect(OUTCOME_DIALOGUE.characters[member.profile!.key][kind]).toContain(line.text);
      }
    }
  });

  it('募集6性格と未知性格は必ずフォールバック台詞を持つ', () => {
    const base = fixedMembers()[0];
    const members = [...PERSONALITIES, 'unknown'].map((personality) => recruitedLike(base, personality));
    for (const kind of KINDS) {
      const lines = generateOutcomeDialogue(members, kind, rngFor(32, 'fallback-test', kind));
      expect(lines).toHaveLength(members.length);
      expect(lines.every((line) => line.text.length > 0 && !line.character)).toBe(true);
      for (const [index, line] of lines.entries()) {
        const source = index < PERSONALITIES.length
          ? OUTCOME_DIALOGUE.personalities[PERSONALITIES[index]][kind]
          : OUTCOME_DIALOGUE.fallback[kind];
        expect(source).toContain(line.text);
      }
    }
  });

  it('結果フラグの優先順位が成功・未達成・撤退・全滅に対応する', () => {
    expect(outcomeDialogueKind({ success: true, retreated: false, wiped: false })).toBe('success');
    expect(outcomeDialogueKind({ success: false, retreated: false, wiped: false })).toBe('incomplete');
    expect(outcomeDialogueKind({ success: false, retreated: true, wiped: false })).toBe('retreated');
    expect(outcomeDialogueKind({ success: false, retreated: true, wiped: true })).toBe('wiped');
  });

  it('simulateExpeditionの結果に一度だけ保存され、talkログにも同じ順で残る', () => {
    const members = fixedMembers();
    const result = simulateExpedition({
      rng: rngFor(33, 'simulation'), questId: 'q_patrol', members, leaderId: members[0].id,
      policy: 'standard', potions: 0, relations: {}, startDay: 1, expMult: 1, clinicLevel: 0,
    });
    const lines = result.returnDialogue ?? [];
    expect(lines).toHaveLength(members.length);
    expect(result.log.slice(-lines.length).map((entry) => entry.text)).toEqual(lines.map((line) => `${line.name}「${line.text}」`));
    expect(result.log.slice(-lines.length).every((entry) => entry.kind === 'talk')).toBe(true);
  });

  it('同じ結果を再計算すると台詞も同じになる', () => {
    const makeInput = (rng: ReturnType<typeof rngFor>) => {
      const members = fixedMembers();
      return {
        rng, questId: 'q_patrol', members, leaderId: members[0].id, policy: 'standard', potions: 0,
        relations: {}, startDay: 1, expMult: 1, clinicLevel: 0,
      };
    };
    const rngA = rngFor(34, 'simulation');
    const rngB = rngFor(34, 'simulation');
    const a = simulateExpedition(makeInput(rngA));
    const b = simulateExpedition(makeInput(rngB));
    expect(a).toEqual(b);
    expect(rngA.next()).toBe(rngB.next());
  });

  it('保存復元で既存の台詞を維持し、旧セーブの欠落フィールドも許容する', () => {
    const members = fixedMembers();
    const result = simulateExpedition({
      rng: rngFor(35, 'simulation'), questId: 'q_patrol', members, leaderId: members[0].id,
      policy: 'standard', potions: 0, relations: {}, startDay: 1, expMult: 1, clinicLevel: 0,
    });
    const restored = JSON.parse(JSON.stringify(result));
    expect(restored.returnDialogue).toEqual(result.returnDialogue);
    delete restored.returnDialogue;
    expect(restored.returnDialogue).toBeUndefined();
  });
});
