import { localHints, modelRequest, parseModelResult, readScene } from './scene.js';
import { mountGuide } from './view.js';

const sceneEvents = [
    'CHAT_CHANGED', 'MESSAGE_SENT', 'MESSAGE_RECEIVED', 'MESSAGE_EDITED',
    'MESSAGE_DELETED', 'MESSAGE_SWIPED', 'MESSAGE_UPDATED', 'CHARACTER_MESSAGE_RENDERED',
    'GENERATION_STARTED', 'GENERATION_ENDED', 'GENERATION_STOPPED',
];

function context() {
    return globalThis.SillyTavern?.getContext();
}

function start() {
    const { eventSource, eventTypes } = context() ?? {};
    let activeChat;
    let sceneKey;
    let mode = 'scene';
    let goal = '';
    let revision = 0;
    let pending = false;
    let model = null;
    let notice = '';
    let refreshScheduled = false;

    function invalidate() {
        revision++;
        model = null;
        notice = '';
    }

    const guide = mountGuide({
        onAnalyze: analyze,
        onGoal(value) {
            goal = value.slice(0, 300);
            invalidate();
            refresh();
        },
        onMode(value) {
            if (mode === value) return;
            mode = value;
            invalidate();
            refresh();
        },
    });

    function refresh() {
        const ctx = context();
        const id = ctx?.chatId ?? ctx?.getCurrentChatId?.();
        const chat = id == null || id === '' ? null : JSON.stringify([ctx.groupId, ctx.characterId, id]);
        if (chat !== activeChat) {
            activeChat = chat;
            mode = 'scene';
            goal = '';
            invalidate();
        }
        const rows = chat === null ? [] : readScene(ctx.chat);
        const key = JSON.stringify(rows);
        if (key !== sceneKey) {
            sceneKey = key;
            invalidate();
        }

        const generating = document.body.dataset.generating === 'true';
        const hasRaw = typeof ctx?.generateRaw === 'function';
        const canAnalyze = hasRaw && !pending && !generating && Boolean(rows.length || goal.trim());
        const local = localHints(rows, mode, goal);
        let status = notice;
        if (pending) status = 'Модель разбирает сцену…';
        else if (generating) status = 'Дождись окончания ролевого ответа.';
        else if (!hasRaw) status = 'В этой версии SillyTavern доступен справочник. Для разбора с моделью обнови приложение.';
        guide.render({ mode, goal, hasScene: rows.length > 0, busy: pending, canAnalyze, status, local, model });
        return { ctx, rows, local, canAnalyze };
    }

    function scheduleRefresh() {
        if (refreshScheduled) return;
        refreshScheduled = true;
        setTimeout(() => {
            refreshScheduled = false;
            refresh();
        }, 0);
    }

    async function analyze() {
        const { ctx, rows, local, canAnalyze } = refresh();
        if (!canAnalyze) return;
        const request = modelRequest(rows, mode, goal.trim(), local);
        const startedAt = revision;
        pending = true;
        model = null;
        notice = '';
        refresh();
        try {
            const raw = await ctx.generateRaw(request);
            refresh();
            if (revision !== startedAt) return;
            model = parseModelResult(raw, rows);
            if (!model.summary && !model.used.length && !model.suggestions.length && !model.potions.length) {
                notice = 'Модель не нашла достаточно сведений о магии в сцене. Можно уточнить задачу.';
            }
        } catch (error) {
            refresh();
            if (revision !== startedAt) return;
            console.warn('[Hogwarts Scene Guide] Analysis failed:', error);
            notice = 'Разбор не получился. Проверь подключение модели или повтори запрос. Справочник доступен.';
        } finally {
            pending = false;
            refresh();
        }
    }

    for (const name of sceneEvents) {
        const event = eventTypes?.[name];
        if (event) eventSource?.on(event, scheduleRefresh);
    }

    // The UI lock is also changed when a generation is stopped or fails.
    new MutationObserver(scheduleRefresh).observe(document.body, {
        attributes: true,
        attributeFilter: ['data-generating'],
    });
    refresh();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
} else {
    start();
}
