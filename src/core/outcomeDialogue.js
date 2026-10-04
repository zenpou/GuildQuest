import dialogueJson from '../data/outcome-dialogue.json';
export const OUTCOME_DIALOGUE = dialogueJson;
const fixedCharacterKeys = new Set(['aldo', 'mina', 'lina', 'bruno']);
const hasLines = (lines) => Boolean(lines?.length);
function linesFor(member, kind) {
    const character = member.profile?.key;
    if (character && fixedCharacterKeys.has(character)) {
        const lines = OUTCOME_DIALOGUE.characters[character]?.[kind];
        if (hasLines(lines))
            return { lines, character };
    }
    const personalityLines = OUTCOME_DIALOGUE.personalities[member.personality]?.[kind];
    if (hasLines(personalityLines))
        return { lines: personalityLines };
    return { lines: OUTCOME_DIALOGUE.fallback[kind] };
}
export function outcomeDialogueKind(result) {
    if (result.wiped)
        return 'wiped';
    if (result.retreated)
        return 'retreated';
    if (result.success)
        return 'success';
    return 'incomplete';
}
export function generateOutcomeDialogue(members, kind, rng) {
    return members.map((member) => {
        const selected = linesFor(member, kind);
        const line = { advId: member.id, name: member.name, text: rng.pick(selected.lines) };
        if (selected.character)
            line.character = selected.character;
        return line;
    });
}
