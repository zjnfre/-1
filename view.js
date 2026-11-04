const modes = {
    scene: {
        label: 'Сцена',
        goal: 'Что нужно сделать?',
        example: 'Например, открыть дверь и не привлечь внимание',
    },
    duel: {
        label: 'Дуэль',
        goal: 'Что важно в дуэли?',
        example: 'Например, обезоружить противника без травм',
    },
    lesson: {
        label: 'Урок',
        goal: 'Какое задание дал преподаватель?',
        example: 'Например, поднять перо над партой',
    },
    potions: {
        label: 'Зелья',
        goal: 'Какое зелье нужно сварить?',
        example: 'Например, Оборотное зелье',
    },
};

function element(tag, className, content) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content) node.textContent = content;
    return node;
}

function renderCard(card) {
    const item = element('article', 'hsg-card');
    const header = element('div', 'hsg-card-heading');
    header.append(element('h4', '', card.name));
    if (card.status) header.append(element('span', 'hsg-badge', card.status));
    item.append(header);
    if (card.actor) item.append(element('p', 'hsg-actor', card.actor));
    if (card.description) item.append(element('p', '', card.description));
    if (card.reason) item.append(element('p', 'hsg-detail', card.reason));
    if (card.evidence) item.append(element('blockquote', 'hsg-evidence', card.evidence));
    if (card.steps?.length) {
        const steps = element('ol', 'hsg-steps');
        for (const step of card.steps) steps.append(element('li', '', step));
        item.append(steps);
    }
    if (card.caution) item.append(element('p', 'hsg-caution', card.caution));
    if (card.source) item.append(element('p', 'hsg-source', `Источник · ${card.source}`));
    return item;
}

function appendCards(section, title, cards) {
    if (!cards?.length) return;
    section.append(element('h3', 'hsg-group-title', title));
    const grid = element('div', 'hsg-cards');
    for (const card of cards) grid.append(renderCard(card));
    section.append(grid);
}

function extraCards(cards, modelCards) {
    const shown = new Set(modelCards?.map(card => card.name.toLowerCase()));
    return cards?.filter(card => !shown.has(card.name.toLowerCase()));
}

function renderResults(results, { hasScene, local, model, mode, busy, goal }) {
    const sections = [];
    if (model) {
        const section = element('section', 'hsg-result');
        section.append(element('h2', 'hsg-result-title', 'Разбор модели'));
        if (model.summary) section.append(element('p', 'hsg-summary', model.summary));
        appendCards(section, 'Заклинания персонажей', model.used);
        appendCards(section, 'Варианты действий', model.suggestions);
        appendCards(section, 'Зелья и приготовление', model.potions);
        sections.push(section);
    }
    if (local?.used?.length || local?.suggestions?.length || local?.potions?.length) {
        const section = element('section', 'hsg-result');
        section.append(element('h2', 'hsg-result-title', 'Подсказки из справочника'));
        appendCards(section, 'Упоминания в сцене', local.used);
        appendCards(section, 'Варианты действий', extraCards(local.suggestions, model?.suggestions));
        appendCards(section, 'Зелья и приготовление', extraCards(local.potions, model?.potions));
        if (section.childElementCount > 1) sections.push(section);
    }
    if (!sections.length) {
        let message = 'В последних репликах не нашлось совпадений со справочником. Опиши цель или разбери сцену с моделью.';
        if (!hasScene) message = 'Открой ролевой чат с репликами. Поиск по справочнику доступен и по введённой цели.';
        if (mode === 'potions' && (hasScene || goal?.trim())) message = 'Попробуй ввести точное название зелья или попроси модель разобрать сцену.';
        if (busy) message = 'Здесь появится разбор текущей сцены.';
        sections.push(element('p', 'hsg-empty', message));
    }
    results.replaceChildren(...sections);
}

export function mountGuide({ onAnalyze, onGoal, onMode }) {
    const launcher = element('button', 'hsg-launcher');
    launcher.type = 'button';
    launcher.title = 'Помощник по магии';
    launcher.setAttribute('aria-label', launcher.title);
    launcher.setAttribute('aria-haspopup', 'dialog');
    launcher.setAttribute('aria-controls', 'hsg-dialog');
    launcher.setAttribute('aria-expanded', 'false');
    const icon = element('span', 'hsg-launcher-icon', '✦');
    icon.setAttribute('aria-hidden', 'true');
    launcher.append(icon);
    const toolbar = document.querySelector('#leftSendForm') ?? document.querySelector('#send_form');
    if (!toolbar) launcher.classList.add('hsg-launcher-floating');
    (toolbar ?? document.body).append(launcher);

    const dialog = element('dialog', 'hsg-dialog');
    dialog.id = 'hsg-dialog';
    dialog.setAttribute('aria-labelledby', 'hsg-title');
    // All dynamic text is added with textContent or assigned to a form control.
    dialog.innerHTML = `
        <header class="hsg-header">
            <div>
                <p class="hsg-kicker">✧ Подсказки для ролевой</p>
                <h1 id="hsg-title">Хогвартс · Помощник по магии</h1>
                <p class="hsg-intro">Заклинания, магические дуэли и зелья по текущей сцене.</p>
            </div>
            <button class="hsg-close" type="button" aria-label="Закрыть помощник" autofocus>×</button>
        </header>
        <div class="hsg-body">
            <div class="hsg-modes" role="group" aria-label="Режим подсказок"></div>
            <form class="hsg-query">
                <label for="hsg-goal"><span class="hsg-goal-label"></span> <small>По желанию</small></label>
                <input id="hsg-goal" class="hsg-goal" type="text" maxlength="300" autocomplete="off">
                <div class="hsg-actions">
                    <p class="hsg-note">Справочник обновляется по репликам. Разбор модели отправляет ей последние реплики чата.</p>
                    <button class="hsg-analyze" type="submit">Разобрать с моделью</button>
                </div>
            </form>
            <p class="hsg-status" role="status"></p>
            <div class="hsg-results"></div>
        </div>`;
    document.body.append(dialog);

    const close = dialog.querySelector('.hsg-close');
    const modeGroup = dialog.querySelector('.hsg-modes');
    const goal = dialog.querySelector('.hsg-goal');
    const goalLabel = dialog.querySelector('.hsg-goal-label');
    const analyze = dialog.querySelector('.hsg-analyze');
    const status = dialog.querySelector('.hsg-status');
    const results = dialog.querySelector('.hsg-results');
    const modeButtons = Object.entries(modes).map(([mode, details]) => {
        const button = element('button', 'hsg-mode', details.label);
        button.type = 'button';
        button.addEventListener('click', () => onMode(mode));
        modeGroup.append(button);
        return [mode, button];
    });

    let state = {};
    function paint() {
        const mode = Object.hasOwn(modes, state.mode) ? state.mode : 'scene';
        for (const [key, button] of modeButtons) button.setAttribute('aria-pressed', String(key === mode));
        goalLabel.textContent = modes[mode].goal;
        goal.placeholder = modes[mode].example;
        const value = state.goal ?? '';
        if (goal.value !== value) goal.value = value;
        analyze.disabled = !state.canAnalyze || state.busy;
        analyze.textContent = state.busy ? 'Разбираю сцену…' : 'Разобрать с моделью';
        const message = state.status || (state.busy ? 'Жду ответ модели.' : '');
        if (status.textContent !== message) status.textContent = message;
        results.setAttribute('aria-busy', String(Boolean(state.busy)));
        renderResults(results, state);
    }

    function open() {
        if (dialog.open) return;
        paint();
        dialog.showModal();
        launcher.setAttribute('aria-expanded', 'true');
        close.focus();
    }

    launcher.addEventListener('click', open);
    close.addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => {
        launcher.setAttribute('aria-expanded', 'false');
        launcher.focus();
    });
    goal.addEventListener('input', () => onGoal(goal.value));
    dialog.querySelector('.hsg-query').addEventListener('submit', event => {
        event.preventDefault();
        if (!analyze.disabled) onAnalyze();
    });

    return {
        open,
        isOpen: () => dialog.open,
        render(nextState) {
            state = nextState;
            if (dialog.open) paint();
        },
    };
}
