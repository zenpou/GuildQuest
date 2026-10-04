import { PERSONALITY } from './data';
export function pairKey(a, b) {
    return a < b ? `${a}|${b}` : `${b}|${a}`;
}
/** 性格相性による初期関係値 */
export function compatBase(pa, pb) {
    const a = PERSONALITY[pa];
    const b = PERSONALITY[pb];
    let v = 0;
    if (a.likes.includes(pb))
        v += 8;
    if (b.likes.includes(pa))
        v += 8;
    if (a.dislikes.includes(pb))
        v -= 8;
    if (b.dislikes.includes(pa))
        v -= 8;
    return v;
}
export function getRelation(rel, a, b) {
    return rel[pairKey(a.id, b.id)] ?? compatBase(a.personality, b.personality);
}
export function addRelation(rel, a, b, delta) {
    const v = Math.max(-100, Math.min(100, getRelation(rel, a, b) + delta));
    rel[pairKey(a.id, b.id)] = v;
    return v;
}
export function relationLabel(v) {
    if (v >= 60)
        return '親友';
    if (v >= 30)
        return '仲良し';
    if (v >= 8)
        return '良好';
    if (v > -8)
        return '普通';
    if (v > -30)
        return '不仲';
    return '犬猿の仲';
}
/** 相性の簡易記号(派遣画面用) */
export function relationMark(v) {
    return v >= 30 ? '◎' : v >= 8 ? '○' : v > -8 ? '－' : v > -30 ? '△' : '×';
}
