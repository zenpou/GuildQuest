import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { CHARACTER_IDS, speakerCharacter } from '../src/core/presentation';
import chapters from '../src/data/campaign-story.json';
import prologue from '../src/data/story-prologue.json';
import events from '../src/data/charevents.json';
const scenes = [{ id: 'prologue', lines: prologue }, ...chapters, ...events];
describe('authored scene contracts', () => {
    for (const scene of scenes)
        it(`${scene.id}: complete, repeatable stage directions and installed art`, () => {
            for (const line of scene.lines) {
                expect(line.background).toBeTruthy();
                expect(existsSync(`public/art/backgrounds/${line.background}.webp`)).toBe(true);
                expect(line.cast).toBeDefined();
                if (line.transition)
                    expect(['cut', 'fade', 'wipe', 'blackout']).toContain(line.transition);
                if (line.effect)
                    expect(['shake', 'flash', 'impact']).toContain(line.effect);
                const cast = line.cast;
                expect(cast.length).toBeLessThanOrEqual(3);
                expect(new Set(cast.map(a => a.position)).size).toBe(cast.length);
                expect(new Set(cast.map(a => a.character)).size).toBe(cast.length);
                if (line.still)
                    expect(existsSync(`public/art/${line.still}.webp`)).toBe(true);
                else if (speakerCharacter(line.speaker))
                    expect([...cast.map(a => a.character), line.portrait?.character]).toContain(speakerCharacter(line.speaker));
                if (line.portrait) {
                    expect(line.portrait.character).toBe(speakerCharacter(line.speaker));
                    expect(cast.map(a => a.character)).not.toContain(line.portrait.character);
                    expect(existsSync(`public/art/characters/${line.portrait.character}/${line.portrait.pose}.webp`)).toBe(true);
                }
                for (const actor of cast) {
                    expect(CHARACTER_IDS).toContain(actor.character);
                    expect(['neutral', 'thoughtful', 'happy']).toContain(actor.pose);
                    expect(['left', 'center', 'right']).toContain(actor.position);
                    if (actor.motion) {
                        expect(['enter-left', 'enter-right', 'jump', 'nod', 'shake', 'recoil']).toContain(actor.motion);
                        expect(line.still).toBeUndefined();
                        expect(line.portrait?.character).not.toBe(actor.character);
                    }
                    expect(existsSync(`public/art/characters/${actor.character}/${actor.pose}.webp`)).toBe(true);
                }
            }
        });
    it('all seven identities have a canonical reference and three different poses', () => {
        for (const id of CHARACTER_IDS) {
            expect(existsSync(`public/art/characters/${id}/reference.webp`)).toBe(true);
            const poses = ['neutral', 'thoughtful', 'happy'].map(p => readFileSync(`public/art/characters/${id}/${p}.webp`).toString('base64'));
            expect(new Set(poses).size).toBe(3);
        }
    });
    it('keeps the protagonist off stage until receiving guild clothes, while identifying his early dialogue with a face', () => {
        const lines = prologue;
        const change = lines.findIndex(line => line.text.includes('シャツとベストに着替え'));
        expect(change).toBeGreaterThan(0);
        for (const line of lines.slice(0, change + 1)) {
            expect(line.cast?.some(actor => actor.character === 'yuto')).toBe(false);
            if (line.speaker === '{name}')
                expect(line.portrait?.character).toBe('yuto');
            else
                expect(line.portrait?.character).not.toBe('yuto');
        }
        expect(lines[change + 1].cast?.some(actor => actor.character === 'yuto')).toBe(true);
        expect(lines[change + 1].portrait).toBeUndefined();
    });
    it('preserves both stills as authored story beats, not a background on every line', () => {
        const lines = scenes.flatMap(s => s.lines);
        expect(lines.some(l => l.still === 'guild-dawn')).toBe(true);
        expect(lines.some(l => l.still === 'ruins-vow')).toBe(true);
        expect(lines.filter(l => l.still).length).toBeLessThan(lines.length / 5);
    });
});
