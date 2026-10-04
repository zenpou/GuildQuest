import { MISUNDERSTANDINGS } from './data';
export const REP_LEVELS = [0, 8, 20, 35, 55];
export const REP_NAMES = ['無名のギルド', '近所で話題', '街で評判', '地域で有名', '噂のギルド'];
export function repLevel(rep) {
    let lv = 1;
    REP_LEVELS.forEach((t, i) => { if (rep >= t)
        lv = i + 1; });
    return lv;
}
/** 勘違いイベント: 行動の翌日に「噂」として広まる */
export function resolveScenes(state, tags, rng, max = 2) {
    const out = [];
    for (const tag of [...new Set(tags)]) {
        if (out.length >= max)
            break;
        const pool = MISUNDERSTANDINGS.filter((m) => m.tag === tag && !state.seenScenes.includes(m.id));
        if (!pool.length)
            continue;
        const m = rng.pick(pool);
        state.seenScenes.push(m.id);
        out.push({ id: m.id, day: state.day, lines: m.scene, thought: m.thought, rep: Math.max(1, Math.round(m.rep * 0.4)) });
    }
    return out;
}
