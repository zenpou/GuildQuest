import { CHARACTER_NAMES, speakerCharacter, } from '../core/presentation';
import { createStoryAudio } from './storyAudio';
import './storyPlayer.css';
const BACKGROUND_NAMES = {
    guild: 'ギルド', town: '街', night: '夜', tavern: '酒場', office: '執務室',
};
const POSITION_ORDER = ['left', 'center', 'right'];
const PLAYER_COUNTER = { value: 0 };
const STORY_MOTION_KEY = 'guildquest_story_motion_enabled_v1';
const MOTION_CLASSES = [
    'is-motion-enter-left',
    'is-motion-enter-right',
    'is-motion-jump',
    'is-motion-nod',
    'is-motion-shake',
    'is-motion-recoil',
];
const baseUrl = () => {
    const base = import.meta.env.BASE_URL || '/';
    return base.endsWith('/') ? base : `${base}/`;
};
const artPath = (path) => `${baseUrl()}art/${path}.webp`;
const fillName = (text, playerName) => (text ?? '').replaceAll('{name}', playerName || 'ユウト');
const readMotionSetting = () => {
    try {
        const value = globalThis.localStorage?.getItem(STORY_MOTION_KEY);
        return value === null || value === '1' || value === 'true';
    }
    catch {
        return true;
    }
};
const writeMotionSetting = (enabled) => {
    try {
        globalThis.localStorage?.setItem(STORY_MOTION_KEY, enabled ? '1' : '0');
    }
    catch {
        // Private browsing and disabled storage must not stop story progression.
    }
};
const make = (tag, className) => {
    const element = document.createElement(tag);
    if (className)
        element.className = className;
    return element;
};
const button = (label, className) => {
    const element = make('button', className);
    element.type = 'button';
    element.textContent = label;
    return element;
};
function normalizedActors(line) {
    const used = new Set();
    const out = [];
    for (const actor of line.cast ?? []) {
        if (out.length >= POSITION_ORDER.length || used.has(actor.character))
            continue;
        const requested = POSITION_ORDER.includes(actor.position) ? actor.position : undefined;
        const position = requested && !out.some((item) => item.position === requested)
            ? requested
            : POSITION_ORDER.find((item) => !out.some((current) => current.position === item));
        if (!position)
            break;
        used.add(actor.character);
        out.push({ character: actor.character, pose: actor.pose, position, motion: actor.motion });
    }
    return out;
}
function characterName(id) {
    return CHARACTER_NAMES[id] ?? id;
}
/**
 * A self-contained visual-novel scene. The root and all reusable stage slots
 * are created once; line navigation mutates only their text, attributes and
 * visibility so parent renders cannot reset typewriter or audio state.
 */
export function createStoryPlayer(options) {
    const { id, title, lines, playerName, onClose, prologue = false } = options;
    const root = make('section', 'vn-player');
    root.dataset.storyId = id;
    root.dataset.dialogueHidden = 'false';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', title);
    const cleanups = [];
    const timers = new Set();
    let disposed = false;
    let closed = false;
    let currentIndex = lines.length ? 0 : -1;
    let visibleChars = 0;
    let typingTimer;
    let stageEffectTimer;
    let blackoutSwapTimer;
    let transitionSnapshot;
    let visualRevision = 0;
    let dialogueHidden = false;
    let historyOpen = false;
    let requestedMotionEnabled = readMotionSetting();
    const motionPreference = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : undefined;
    let prefersReducedMotion = Boolean(motionPreference?.matches);
    const playedCueIndices = new Set();
    const audio = createStoryAudio();
    const listen = (target, event, handler) => {
        target.addEventListener(event, handler);
        cleanups.push(() => target.removeEventListener(event, handler));
    };
    const top = make('header', 'vn-player-top');
    const titleElement = make('h2', 'vn-player-title');
    titleElement.textContent = title;
    const progress = make('span', 'vn-player-progress');
    const closeButton = button(prologue ? 'スキップ' : 'スキップ・記録へ', 'vn-player-close');
    top.append(titleElement, progress, closeButton);
    const toolbar = make('div', 'vn-player-toolbar');
    const historyButton = button('会話履歴', 'vn-player-tool-button');
    historyButton.dataset.storyHistoryToggle = '';
    historyButton.setAttribute('aria-expanded', 'false');
    const stageButton = button('台詞を隠す', 'vn-player-tool-button');
    stageButton.dataset.storyStageToggle = '';
    stageButton.setAttribute('aria-pressed', 'false');
    const motionButton = button('演出ON', 'vn-player-tool-button vn-player-motion-toggle');
    motionButton.dataset.storyMotionToggle = '';
    motionButton.setAttribute('aria-pressed', 'true');
    motionButton.setAttribute('aria-label', 'ストーリー演出を有効にする');
    PLAYER_COUNTER.value += 1;
    const controlId = `vn-player-${id.replace(/[^a-zA-Z0-9_-]/g, '-')}-${PLAYER_COUNTER.value}`;
    const audioControls = make('fieldset', 'vn-player-audio');
    const audioLegend = make('legend');
    audioLegend.textContent = '音声設定';
    const muteLabel = make('label', 'vn-player-audio-mute');
    const muteInput = make('input');
    muteInput.type = 'checkbox';
    muteInput.id = `${controlId}-mute`;
    const muteText = make('span');
    muteLabel.htmlFor = muteInput.id;
    muteLabel.append(muteInput, muteText);
    const volumeLabel = make('label', 'vn-player-audio-volume');
    volumeLabel.htmlFor = `${controlId}-volume`;
    volumeLabel.textContent = '音量';
    const volumeInput = make('input');
    volumeInput.type = 'range';
    volumeInput.id = `${controlId}-volume`;
    volumeInput.min = '0';
    volumeInput.max = '1';
    volumeInput.step = '0.05';
    const volumeValue = make('output');
    volumeValue.htmlFor = volumeInput.id;
    audioControls.append(audioLegend, muteLabel, volumeLabel, volumeInput, volumeValue);
    toolbar.append(historyButton, stageButton, motionButton, audioControls);
    const stage = make('div', 'vn-player-stage');
    stage.dataset.storyStage = '';
    stage.setAttribute('aria-label', '舞台');
    const scene = make('div', 'vn-player-scene');
    const sceneContent = make('div', 'vn-player-scene-content');
    const backgroundImage = make('img', 'vn-player-background');
    backgroundImage.alt = '';
    backgroundImage.decoding = 'async';
    const backgroundFallback = make('span', 'vn-player-background-fallback');
    const characters = make('div', 'vn-player-characters');
    const slots = POSITION_ORDER.map((position) => {
        const figure = make('figure', `vn-player-character vn-player-character-${position}`);
        figure.dataset.position = position;
        const motion = make('div', 'vn-player-character-motion');
        const image = make('img', 'vn-player-character-image');
        image.decoding = 'async';
        image.alt = '';
        image.draggable = false;
        const plate = make('span', 'vn-player-character-plate');
        plate.hidden = true;
        const name = make('figcaption', 'vn-player-character-name');
        motion.append(image, plate, name);
        figure.append(motion);
        characters.append(figure);
        return { figure, motion, image, plate, name };
    });
    const stillView = {
        image: make('img', 'vn-player-still'),
        fallback: make('span', 'vn-player-still-fallback'),
    };
    stillView.image.decoding = 'async';
    stillView.image.hidden = true;
    stillView.fallback.hidden = true;
    const flash = make('span', 'vn-player-flash');
    flash.setAttribute('aria-hidden', 'true');
    const blackout = make('span', 'vn-player-blackout');
    blackout.setAttribute('aria-hidden', 'true');
    sceneContent.append(backgroundImage, backgroundFallback, characters, stillView.image, stillView.fallback);
    scene.append(sceneContent);
    stage.append(scene, flash, blackout);
    const dialogue = make('section', 'vn-player-dialogue');
    dialogue.setAttribute('aria-label', '台詞');
    const portrait = make('div', 'vn-player-portrait');
    portrait.dataset.storyPortrait = '';
    portrait.hidden = true;
    portrait.setAttribute('aria-hidden', 'true');
    const portraitImage = make('img', 'vn-player-portrait-image');
    portraitImage.decoding = 'async';
    portraitImage.alt = '';
    portraitImage.hidden = true;
    portraitImage.draggable = false;
    const portraitFallback = make('span', 'vn-player-portrait-fallback');
    portraitFallback.hidden = true;
    portrait.append(portraitImage, portraitFallback);
    const speaker = make('div', 'vn-player-speaker');
    speaker.hidden = true;
    const lineText = make('p', 'vn-player-line');
    lineText.setAttribute('aria-live', 'polite');
    const typingHint = make('span', 'vn-player-typing-hint');
    dialogue.append(portrait, speaker, lineText, typingHint);
    const history = make('section', 'vn-player-history');
    history.hidden = true;
    history.setAttribute('aria-label', '会話履歴');
    const historyTitle = make('h3');
    historyTitle.textContent = '会話履歴';
    const historyList = make('ol');
    const historyRows = lines.map((line, index) => {
        const row = make('li', 'vn-player-history-row');
        row.dataset.line = String(index);
        const rowSpeaker = make('b', 'vn-player-history-speaker');
        rowSpeaker.textContent = fillName(line.speaker, playerName) || '物語';
        const rowText = make('span', 'vn-player-history-text');
        rowText.textContent = fillName(line.text, playerName);
        row.append(rowSpeaker, rowText);
        historyList.append(row);
        return row;
    });
    history.append(historyTitle, historyList);
    const navigation = make('nav', 'vn-player-navigation');
    const backButton = button('← 前へ', 'vn-player-back');
    backButton.dataset.storyBack = '';
    const nextButton = button('全文を表示', 'vn-player-next');
    if (prologue)
        nextButton.dataset.prologueNext = '';
    else
        nextButton.dataset.storyNext = '';
    navigation.append(backButton, nextButton);
    root.append(top, toolbar, stage, dialogue, history, navigation);
    const setStageImageFallback = (image, fallback, fallbackText) => {
        image.hidden = true;
        fallback.hidden = false;
        fallback.textContent = fallbackText;
    };
    listen(backgroundImage, 'load', () => { backgroundImage.hidden = false; backgroundFallback.hidden = true; });
    listen(backgroundImage, 'error', () => setStageImageFallback(backgroundImage, backgroundFallback, `${stage.dataset.background ?? '背景'}（背景画像未配置）`));
    listen(stillView.image, 'load', () => { stillView.image.hidden = false; stillView.fallback.hidden = true; });
    listen(stillView.image, 'error', () => setStageImageFallback(stillView.image, stillView.fallback, 'スチル画像未配置'));
    for (const slot of slots) {
        listen(slot.image, 'load', () => {
            if (slot.image.dataset.src === slot.image.src) {
                slot.image.hidden = false;
                slot.plate.hidden = true;
            }
        });
        listen(slot.image, 'error', () => {
            slot.image.hidden = true;
            slot.plate.hidden = false;
            slot.plate.textContent = slot.name.textContent || '立ち絵未配置';
        });
    }
    listen(portraitImage, 'load', () => {
        if (portraitImage.dataset.src === portraitImage.getAttribute('src')) {
            portraitImage.hidden = false;
            portraitFallback.hidden = true;
        }
    });
    listen(portraitImage, 'error', () => {
        portraitImage.hidden = true;
        portraitFallback.hidden = false;
        portraitFallback.textContent = portrait.dataset.portraitCharacter
            ? `${characterName(portrait.dataset.portraitCharacter)}（顔画像未配置）`
            : '顔画像未配置';
    });
    const updateAudioControls = () => {
        const settings = audio.settings;
        muteInput.checked = settings.muted;
        muteText.textContent = settings.muted ? 'ミュート中' : '音声ON';
        volumeInput.value = String(settings.volume);
        volumeValue.value = `${Math.round(settings.volume * 100)}%`;
        volumeValue.textContent = `${Math.round(settings.volume * 100)}%`;
        volumeInput.setAttribute('aria-label', `音量 ${Math.round(settings.volume * 100)}%`);
    };
    updateAudioControls();
    const motionIsEnabled = () => requestedMotionEnabled && !prefersReducedMotion;
    const updateMotionControl = () => {
        const enabled = motionIsEnabled();
        motionButton.textContent = enabled ? '演出ON' : '演出OFF';
        motionButton.setAttribute('aria-pressed', String(enabled));
        motionButton.setAttribute('aria-label', enabled ? 'ストーリー演出を無効にする' : 'ストーリー演出を有効にする');
        motionButton.title = prefersReducedMotion && requestedMotionEnabled
            ? 'システム設定により演出を抑制中'
            : enabled ? 'ストーリー演出を無効にする' : 'ストーリー演出を有効にする';
    };
    updateMotionControl();
    const stopTyping = () => {
        if (typingTimer !== undefined) {
            clearTimeout(typingTimer);
            typingTimer = undefined;
        }
    };
    const clearActorMotions = () => {
        for (const slot of slots) {
            slot.motion.classList.remove(...MOTION_CLASSES);
        }
    };
    const removeTransitionSnapshot = () => {
        transitionSnapshot?.remove();
        transitionSnapshot = undefined;
    };
    const stopStageEffect = () => {
        if (stageEffectTimer !== undefined) {
            clearTimeout(stageEffectTimer);
            timers.delete(stageEffectTimer);
            stageEffectTimer = undefined;
        }
        if (blackoutSwapTimer !== undefined) {
            clearTimeout(blackoutSwapTimer);
            timers.delete(blackoutSwapTimer);
            blackoutSwapTimer = undefined;
        }
        stage.classList.remove('is-fade', 'is-wipe', 'is-blackout', 'is-shake', 'is-flash', 'is-impact');
        scene.classList.remove('is-reveal-fade', 'is-reveal-wipe');
        sceneContent.classList.remove('is-effect-shake', 'is-effect-impact');
        flash.classList.remove('is-active', 'is-impact');
        blackout.classList.remove('is-active');
        clearActorMotions();
        removeTransitionSnapshot();
    };
    const snapshotClassNames = {
        'vn-player-scene-content': 'vn-player-transition-scene-content',
        'vn-player-characters': 'vn-player-transition-characters',
        'vn-player-character': 'vn-player-transition-character',
        'vn-player-character-motion': 'vn-player-transition-character-motion',
        'vn-player-character-image': 'vn-player-transition-character-image',
        'vn-player-character-plate': 'vn-player-transition-character-plate',
        'vn-player-character-name': 'vn-player-transition-character-name',
        'vn-player-background': 'vn-player-transition-background',
        'vn-player-background-fallback': 'vn-player-transition-background-fallback',
        'vn-player-still': 'vn-player-transition-still',
        'vn-player-still-fallback': 'vn-player-transition-still-fallback',
    };
    const sanitizeSnapshot = (node, isRoot = false) => {
        const originalClasses = [...node.classList];
        if (isRoot) {
            node.className = 'vn-player-scene-snapshot';
        }
        else {
            for (const className of originalClasses) {
                const replacement = snapshotClassNames[className];
                if (replacement) {
                    node.classList.remove(className);
                    node.classList.add(replacement);
                }
            }
        }
        for (const attribute of [...node.attributes]) {
            if (attribute.name.startsWith('data-') || attribute.name === 'id')
                node.removeAttribute(attribute.name);
        }
        node.removeAttribute('aria-label');
        node.setAttribute('aria-hidden', 'true');
        if (node instanceof HTMLImageElement) {
            node.alt = '';
            // Keep each old image source so the snapshot preserves intrinsic sizing
            // and remains a real visual copy of the stage. Semantic data attributes
            // and character class names are stripped above.
        }
        for (const child of [...node.children]) {
            if (child instanceof HTMLElement)
                sanitizeSnapshot(child);
        }
    };
    const captureSceneSnapshot = () => {
        const snapshot = scene.cloneNode(true);
        sanitizeSnapshot(snapshot, true);
        snapshot.classList.add(`vn-player-transition-cast-${stage.dataset.castCount ?? '0'}`);
        snapshot.style.background = getComputedStyle(stage).background;
        return snapshot;
    };
    const cancelVisuals = () => {
        visualRevision += 1;
        stopStageEffect();
    };
    const scheduleVisualCleanup = (duration) => {
        const revision = visualRevision;
        const timer = setTimeout(() => {
            timers.delete(timer);
            if (revision !== visualRevision || disposed || closed)
                return;
            stageEffectTimer = undefined;
            stopStageEffect();
        }, duration);
        stageEffectTimer = timer;
        timers.add(timer);
    };
    const updateHistory = () => {
        for (const [index, row] of historyRows.entries()) {
            row.hidden = index > currentIndex;
            row.classList.toggle('is-current', index === currentIndex);
        }
        historyButton.textContent = currentIndex >= 0 ? `会話履歴 (${currentIndex + 1})` : '会話履歴';
    };
    const applyActorMotion = (line, animate) => {
        clearActorMotions();
        if (!animate || !motionIsEnabled())
            return;
        const portraitCharacter = line.portrait?.character;
        const actors = normalizedActors(line).filter((actor) => actor.character !== portraitCharacter);
        const actorsByPosition = new Map(actors.map((actor) => [actor.position, actor]));
        for (const [slotIndex, slot] of slots.entries()) {
            const motion = actorsByPosition.get(POSITION_ORDER[slotIndex])?.motion;
            if (!motion)
                continue;
            slot.motion.classList.add(`is-motion-${motion}`);
        }
    };
    const applyStageEffect = (line, animate, mode) => {
        const transition = line.transition ?? 'cut';
        stage.dataset.transition = transition;
        stage.dataset.effect = line.effect ?? '';
        if (!animate || !motionIsEnabled())
            return;
        // Force a new animation cycle when moving between two lines with the same effect.
        void stage.offsetWidth;
        if (mode === 'initial') {
            if (transition === 'fade')
                scene.classList.add('is-reveal-fade');
            if (transition === 'wipe')
                scene.classList.add('is-reveal-wipe');
        }
        else if (transition === 'fade' && transitionSnapshot) {
            transitionSnapshot.classList.add('is-transition-fade');
        }
        else if (transition === 'wipe' && transitionSnapshot) {
            transitionSnapshot.classList.add('is-transition-wipe');
        }
        if (transition === 'blackout') {
            stage.classList.add('is-blackout');
            blackout.classList.add('is-active');
            if (transitionSnapshot) {
                const revision = visualRevision;
                const timer = setTimeout(() => {
                    timers.delete(timer);
                    if (revision !== visualRevision || disposed || closed)
                        return;
                    blackoutSwapTimer = undefined;
                    removeTransitionSnapshot();
                }, 400);
                blackoutSwapTimer = timer;
                timers.add(timer);
            }
        }
        switch (line.effect) {
            case 'shake':
                stage.classList.add('is-shake');
                sceneContent.classList.add('is-effect-shake');
                break;
            case 'flash':
                stage.classList.add('is-flash');
                flash.classList.add('is-active');
                break;
            case 'impact':
                stage.classList.add('is-impact');
                sceneContent.classList.add('is-effect-impact');
                flash.classList.add('is-impact');
                break;
            default:
                break;
        }
        const transitionDuration = transition === 'blackout' ? 640 : transition === 'wipe' ? 560 : transition === 'fade' ? 460 : 0;
        const effectDuration = line.effect === 'impact' ? 560 : line.effect === 'shake' ? 420 : line.effect === 'flash' ? 480 : 0;
        const actorDuration = normalizedActors(line).some((actor) => actor.motion) ? 540 : 0;
        const duration = Math.max(transitionDuration, effectDuration, actorDuration);
        if (duration > 0)
            scheduleVisualCleanup(duration + 80);
    };
    const updateStage = (line) => {
        const background = line.background ?? 'guild';
        stage.dataset.background = background;
        stage.dataset.mode = line.still ? 'still' : 'compose';
        backgroundImage.src = artPath(`backgrounds/${background}`);
        backgroundImage.alt = `${BACKGROUND_NAMES[background] ?? background}の背景`;
        backgroundImage.hidden = false;
        backgroundFallback.hidden = true;
        characters.hidden = Boolean(line.still);
        stillView.image.hidden = !line.still;
        stillView.fallback.hidden = true;
        if (line.still) {
            stillView.image.dataset.src = artPath(line.still);
            stillView.image.src = stillView.image.dataset.src;
            stillView.image.alt = `${title}のスチル`;
        }
        else {
            stillView.image.removeAttribute('src');
        }
        const speakerId = speakerCharacter(line.speaker);
        // A portrait-only protagonist must not also appear as a full-body actor.
        // Keep the authored positions of the remaining cast members unchanged.
        const portraitCharacter = line.portrait?.character;
        const actors = normalizedActors(line).filter((actor) => actor.character !== portraitCharacter);
        stage.dataset.castCount = String(actors.length);
        const actorsByPosition = new Map(actors.map((actor) => [actor.position, actor]));
        slots.forEach((slot, slotIndex) => {
            const actor = actorsByPosition.get(POSITION_ORDER[slotIndex]);
            if (!actor) {
                slot.figure.hidden = true;
                slot.figure.dataset.character = '';
                slot.figure.dataset.pose = '';
                slot.figure.dataset.motion = '';
                slot.motion.dataset.motion = '';
                slot.image.removeAttribute('src');
                return;
            }
            const name = actor.character === 'yuto' ? (playerName || 'ユウト') : characterName(actor.character);
            slot.figure.hidden = false;
            slot.figure.dataset.character = actor.character;
            slot.figure.dataset.pose = actor.pose;
            slot.figure.dataset.motion = actor.motion ?? '';
            slot.motion.dataset.motion = actor.motion ?? '';
            slot.figure.classList.toggle('is-speaker', Boolean(speakerId && actor.character === speakerId));
            slot.figure.classList.toggle('is-listener', Boolean(speakerId && actor.character !== speakerId));
            slot.image.dataset.src = artPath(`characters/${actor.character}/${actor.pose}`);
            slot.image.alt = `${name}（${actor.pose}）`;
            slot.image.hidden = false;
            slot.plate.hidden = true;
            slot.plate.textContent = name;
            slot.name.textContent = name;
            slot.image.src = slot.image.dataset.src;
        });
        stageButton.textContent = dialogueHidden ? '台詞を表示' : '台詞を隠す';
    };
    const updatePortrait = (line) => {
        const data = line.portrait;
        const hasPortrait = Boolean(data);
        dialogue.classList.toggle('has-portrait', hasPortrait);
        portrait.hidden = !hasPortrait;
        if (!data) {
            portraitImage.hidden = true;
            portraitImage.removeAttribute('src');
            delete portraitImage.dataset.src;
            portraitImage.alt = '';
            portraitFallback.hidden = true;
            portraitFallback.textContent = '';
            delete portrait.dataset.portraitCharacter;
            delete portrait.dataset.portraitPose;
            return;
        }
        const name = data.character === 'yuto' ? (playerName || 'ユウト') : characterName(data.character);
        const path = artPath(`characters/${data.character}/${data.pose}`);
        portrait.dataset.portraitCharacter = data.character;
        portrait.dataset.portraitPose = data.pose;
        portraitImage.dataset.src = path;
        portraitImage.alt = `${name}の表情`;
        portraitImage.hidden = false;
        portraitFallback.hidden = true;
        portraitFallback.textContent = `${name}（顔画像未配置）`;
        portraitImage.src = path;
    };
    const updateText = (text) => {
        const shown = text.slice(0, visibleChars);
        lineText.textContent = shown || ' ';
        typingHint.textContent = visibleChars < text.length ? 'クリックで全文を表示' : (currentIndex >= lines.length - 1 ? 'クリックで記録へ' : 'クリックで次へ');
        nextButton.textContent = visibleChars < text.length ? '全文を表示' : (currentIndex >= lines.length - 1 ? '記録へ' : '次へ →');
    };
    const playCueOnce = (index, line) => {
        if (!line?.sfx || playedCueIndices.has(index))
            return;
        // Mark it before playback: a muted setting intentionally consumes the cue
        // so enabling audio later does not replay an old scene transition.
        playedCueIndices.add(index);
        audio.play(line.sfx);
    };
    const typeNext = (text) => {
        stopTyping();
        if (visibleChars >= text.length)
            return;
        const advance = () => {
            if (disposed || closed)
                return;
            visibleChars = Math.min(text.length, visibleChars + 1);
            updateText(text);
            if (visibleChars < text.length) {
                typingTimer = setTimeout(advance, 24);
                timers.add(typingTimer);
            }
            else {
                typingTimer = undefined;
            }
        };
        typingTimer = setTimeout(advance, 24);
        timers.add(typingTimer);
    };
    const renderLine = (index, mode) => {
        if (disposed || closed)
            return;
        currentIndex = lines.length ? Math.max(0, Math.min(index, lines.length - 1)) : -1;
        const line = currentIndex >= 0 ? lines[currentIndex] : undefined;
        stopTyping();
        cancelVisuals();
        root.classList.toggle('is-motion-static', mode === 'back' || !motionIsEnabled());
        if (!line) {
            progress.textContent = '0 / 0';
            speaker.hidden = true;
            lineText.textContent = '記録された台詞はありません。';
            typingHint.textContent = '閉じるには「スキップ」を選択';
            nextButton.textContent = '閉じる';
            backButton.disabled = true;
            updateHistory();
            return;
        }
        progress.textContent = `${currentIndex + 1} / ${lines.length}`;
        const speakerText = fillName(line.speaker, playerName);
        speaker.textContent = speakerText;
        speaker.hidden = !speakerText;
        const text = fillName(line.text, playerName);
        visibleChars = mode === 'back' ? text.length : Math.min(1, text.length);
        updateText(text);
        typeNext(text);
        const animate = mode !== 'back' && motionIsEnabled();
        if (animate && mode === 'forward' && (line.transition === 'fade' || line.transition === 'wipe' || line.transition === 'blackout')) {
            transitionSnapshot = captureSceneSnapshot();
            stage.insertBefore(transitionSnapshot, scene);
        }
        updateStage(line);
        updatePortrait(line);
        applyActorMotion(line, animate);
        updateHistory();
        backButton.disabled = dialogueHidden || currentIndex <= 0;
        applyStageEffect(line, animate, mode);
        if (mode === 'forward')
            playCueOnce(currentIndex, line);
    };
    const close = () => {
        if (closed)
            return;
        closed = true;
        dispose();
        onClose();
    };
    const advance = () => {
        if (closed || disposed)
            return;
        audio.activate();
        const line = currentIndex >= 0 ? lines[currentIndex] : undefined;
        const text = line ? fillName(line.text, playerName) : '';
        // The opening line is rendered before a gesture, so its cue gets one
        // chance on the first user advance. Later lines play on forward entry.
        if (currentIndex === 0)
            playCueOnce(currentIndex, line);
        if (visibleChars < text.length) {
            stopTyping();
            visibleChars = text.length;
            updateText(text);
            return;
        }
        if (currentIndex < 0 || currentIndex >= lines.length - 1)
            close();
        else
            renderLine(currentIndex + 1, 'forward');
    };
    const goBack = () => {
        if (closed || disposed || currentIndex <= 0)
            return;
        stopTyping();
        renderLine(currentIndex - 1, 'back');
    };
    listen(closeButton, 'click', (event) => { event.stopPropagation(); close(); });
    listen(nextButton, 'click', (event) => { event.stopPropagation(); advance(); });
    listen(backButton, 'click', (event) => { event.stopPropagation(); goBack(); });
    listen(motionButton, 'click', (event) => {
        event.stopPropagation();
        requestedMotionEnabled = !requestedMotionEnabled;
        writeMotionSetting(requestedMotionEnabled);
        updateMotionControl();
        root.classList.toggle('is-motion-static', !motionIsEnabled());
        if (!motionIsEnabled())
            cancelVisuals();
    });
    listen(stage, 'click', (event) => {
        if (dialogueHidden)
            return;
        if (event.target instanceof HTMLElement && event.target.closest('button, input, label'))
            return;
        advance();
    });
    listen(dialogue, 'click', (event) => {
        if (event.target instanceof HTMLElement && event.target.closest('button, input, label'))
            return;
        advance();
    });
    listen(historyButton, 'click', (event) => {
        event.stopPropagation();
        historyOpen = !historyOpen;
        history.hidden = !historyOpen;
        historyButton.setAttribute('aria-expanded', String(historyOpen));
    });
    listen(stageButton, 'click', (event) => {
        event.stopPropagation();
        dialogueHidden = !dialogueHidden;
        root.classList.toggle('is-dialogue-hidden', dialogueHidden);
        root.dataset.dialogueHidden = String(dialogueHidden);
        dialogue.hidden = dialogueHidden;
        navigation.hidden = dialogueHidden;
        nextButton.disabled = dialogueHidden;
        backButton.disabled = dialogueHidden || currentIndex <= 0;
        stageButton.setAttribute('aria-pressed', String(dialogueHidden));
        stageButton.textContent = dialogueHidden ? '台詞を表示' : '台詞を隠す';
        if (dialogueHidden) {
            historyOpen = false;
            history.hidden = true;
            historyButton.setAttribute('aria-expanded', 'false');
        }
    });
    listen(muteInput, 'change', () => {
        audio.setMuted(muteInput.checked);
        if (!muteInput.checked)
            audio.activate();
        updateAudioControls();
    });
    listen(volumeInput, 'input', () => {
        audio.setVolume(Number(volumeInput.value));
        if (audio.settings.volume > 0 && !audio.settings.muted)
            audio.activate();
        updateAudioControls();
    });
    const handleMotionPreference = (event) => {
        prefersReducedMotion = event.matches;
        updateMotionControl();
        root.classList.toggle('is-motion-static', !motionIsEnabled());
        if (!motionIsEnabled())
            cancelVisuals();
    };
    if (motionPreference && typeof motionPreference.addEventListener === 'function') {
        listen(motionPreference, 'change', handleMotionPreference);
    }
    else if (motionPreference) {
        const legacyPreference = motionPreference;
        legacyPreference.addListener?.(handleMotionPreference);
        cleanups.push(() => legacyPreference.removeListener?.(handleMotionPreference));
    }
    const dispose = () => {
        if (disposed)
            return;
        disposed = true;
        stopTyping();
        cancelVisuals();
        for (const timer of timers)
            clearTimeout(timer);
        timers.clear();
        for (const cleanup of cleanups.splice(0))
            cleanup();
        audio.dispose();
    };
    // Keep the initial line quiet until the player receives a gesture.
    renderLine(0, 'initial');
    return { element: root, dispose };
}
