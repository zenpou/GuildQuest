import { CHAR_EVENTS, TRAIT } from './data';
import { addRelation } from './relations';
/** 条件を満たす未発生の個人エピソードを、1日1件まで発生させて効果を適用する。 */
export function runCharEvents(s, max = 1) {
    s.seenCharEvents ??= [];
    const out = [];
    for (const ev of CHAR_EVENTS) {
        if (out.length >= max)
            break;
        if (s.seenCharEvents.includes(ev.id) || !conditionMet(s, ev))
            continue;
        s.seenCharEvents.push(ev.id);
        out.push({ id: ev.id, title: ev.title, lines: ev.lines, effects: applyEffects(s, ev) });
    }
    return out;
}
function conditionMet(s, ev) {
    const a = s.adventurers.find((x) => x.profile?.key === ev.char);
    if (!a || a.status !== 'idle')
        return false;
    const c = ev.cond;
    if (c.minDay !== undefined && s.day < c.minDay)
        return false;
    if (c.minExpeditions !== undefined && a.expeditions < c.minExpeditions)
        return false;
    if (c.minLevel !== undefined && a.level < c.minLevel)
        return false;
    if (c.job && a.job !== c.job)
        return false;
    if (c.allyInjured && !s.adventurers.some((x) => x.id !== a.id && x.injuryDays > 0))
        return false;
    return true;
}
function applyEffects(s, ev) {
    const a = s.adventurers.find((x) => x.profile?.key === ev.char);
    const e = ev.effects;
    const notes = [];
    if (e.loyalty) {
        a.loyalty = Math.max(0, Math.min(100, a.loyalty + e.loyalty));
        notes.push(`${a.name}の忠誠度 +${e.loyalty}`);
    }
    if (e.rep) {
        s.rep += e.rep;
        notes.push(`ギルドの評判 +${e.rep}`);
    }
    if (e.relation) {
        const o = s.adventurers.find((x) => x.profile?.key === e.relation.with);
        if (o) {
            addRelation(s.relations, a, o, e.relation.delta);
            notes.push(`${a.name}と${o.name}の関係値 ${e.relation.delta > 0 ? '+' : ''}${e.relation.delta}`);
        }
    }
    if (e.revealTrait) {
        const t = a.traits.find((x) => x.id === e.revealTrait);
        if (t && !t.revealed) {
            t.revealed = true;
            notes.push(`${a.name}の特性「${TRAIT[t.id].name}」が判明`);
        }
    }
    return notes;
}
