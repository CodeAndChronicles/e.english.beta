/* ui.js — Presentation layer only. NO business logic, NO direct localStorage.
   Everything here reads/writes state exclusively through window.UX. */
(function (global) {
  'use strict';

  /* ---------------- DOM helpers ---------------- */
  function h(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.indexOf('on') === 0 && typeof attrs[k] === 'function') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== false && attrs[k] != null) node.setAttribute(k, attrs[k]);
      }
    }
    if (children) {
      (Array.isArray(children) ? children : [children]).forEach(function (c) {
        if (c == null) return;
        if (typeof c === 'string') node.appendChild(document.createTextNode(c));
        else node.appendChild(c);
      });
    }
    return node;
  }
  function icon(name, extraClass) {
    return Icons.svg(name, extraClass);
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  // Text comes from JavaScript/i18n.js (English text is the key; Arabic when selected).
  const T = global.I18n.t;
  function plural(n, one, many) { return n + ' ' + global.I18n.plural(n, one, many); }
  // Motion gate: the app's own Animations setting AND the device's reduced-motion request.
  function motionOK() {
    return UX.getAnimationsEnabled() && !(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }
  // A NEW progress fill grows from 0 to its value once; later updates are plain width
  // changes (the CSS transition animates those), so unrelated rerenders never replay it.
  function growFill(fill, widthStr) {
    if (!motionOK()) { fill.style.width = widthStr; return; }
    fill.style.width = '0%';
    requestAnimationFrame(function () { requestAnimationFrame(function () { fill.style.width = widthStr; }); });
  }
  function tmin(s) { return String(s).replace(/\bmin\b/, T('min')); }   // "14–20 min" → Arabic unit
  // Pure formatting / labels only (no logic, no state) come from the quiz
  // engine so a score, a percentage or a clock is written the same everywhere.
  const QE = global.QuizEngine;

  const el = { screen: null, nav: null, sideNav: null, themeBtn: null, langBtn: null, awakeBtn: null };
  const NAV_ICONS = { home: 'house', statistics: 'chart-column', history: 'history', settings: 'settings', info: 'info', readme: 'book-open-text', feedback: 'message-circle' };
  let route = { screen: 'home' };
  let lessonProgressRef = null; // { unit, lessonKey, fillEl, textEl } — live-updated, not rebuilt
  let lessonQuizRef = null; // { unit, lessonKey, selectedBtn, selectedMeta, hintEl } — Selected Quiz availability + estimate, live-updated
  let statsRefs = null; // live-updatable stats DOM refs, set by renderStatistics()
  let unitProgressRefs = null; // unitNum → { fill, pct, bar } for the Home unit cards

  // Both nav bars (bottom nav for phones, side nav for large screens) are
  // always kept in the same state — CSS alone decides which one is
  // actually visible at a given viewport width (see responsive.css).
  function eachNav(fn) {
    [el.nav, el.sideNav].forEach(function (n) { if (n) fn(n); });
  }
  function showNav(active) {
    // The floating theme button would sit on top of the quiz timer, and a theme
    // switch mid-quiz is a distraction: hide it while a quiz is running.
    document.body.classList.toggle('quiz-active', !!UX.getCurrentQuiz());
    eachNav(function (n) {
      n.hidden = false;
      n.querySelectorAll('.nav-btn').forEach(function (b) {
        if (b.dataset.nav) b.classList.toggle('active', b.dataset.nav === active);
      });
    });
    layoutNav();
  }
  function wireNav(navEl) {
    if (!navEl) return;
    navEl.querySelectorAll('.nav-btn').forEach(function (b) {
      const iconName = NAV_ICONS[b.dataset.nav];
      if (iconName && !b.querySelector('.icon')) b.insertBefore(icon(iconName), b.firstChild);
      b.addEventListener('click', function () {
        if (b.dataset.nav === 'home') renderHome();
        else if (b.dataset.nav === 'statistics') renderStatistics();
        else if (b.dataset.nav === 'history') renderHistory();
        // 'settings' is implemented in JavaScript/settings.js (loaded
        // after this file) which attaches UI.renderSettings — resolved
        // dynamically here so load order between the two doesn't matter.
        else if (b.dataset.nav === 'settings' && global.UI && global.UI.renderSettings) global.UI.renderSettings();
        else if (b.dataset.nav === 'info') renderInfo();
        else if (b.dataset.nav === 'readme' && global.UI && global.UI.renderReadme) global.UI.renderReadme();
        else if (b.dataset.nav === 'feedback' && global.UI && global.UI.renderFeedback) global.UI.renderFeedback();
        closeMore();
      });
    });
  }

  /* "More" overflow: every item is shown directly when it fits. When the bar is too
     narrow, the items that do not fit move (the same buttons, same handlers) into a
     small menu opened by a "More" button. Re-measured on resize and language change. */
  let navButtons = [];
  let moreBtn = null, moreMenu = null;
  function closeMore(returnFocus) {
    if (!moreMenu || moreMenu.hidden) return;
    moreMenu.hidden = true;
    moreBtn.setAttribute('aria-expanded', 'false');
    if (returnFocus) moreBtn.focus();
  }
  function setupMore() {
    if (!el.nav || moreBtn) return;
    navButtons = Array.prototype.slice.call(el.nav.querySelectorAll('.nav-btn'));
    moreBtn = h('button', { type: 'button', class: 'nav-btn nav-more', 'aria-haspopup': 'true', 'aria-expanded': 'false', 'aria-controls': 'nav-more-menu', hidden: 'hidden' }, [
      icon('list'), h('span', { text: T('More') })
    ]);
    moreMenu = h('div', { class: 'nav-more-menu', id: 'nav-more-menu', hidden: 'hidden' });
    el.nav.appendChild(moreBtn);
    el.nav.appendChild(moreMenu);
    moreBtn.addEventListener('click', function () {
      const open = moreMenu.hidden;
      moreMenu.hidden = !open;
      moreBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) { const f = moreMenu.querySelector('.nav-btn'); if (f) f.focus(); }
    });
    el.nav.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { closeMore(true); return; }
      if (moreMenu.hidden || !moreMenu.contains(document.activeElement)) return;
      const items = Array.prototype.slice.call(moreMenu.querySelectorAll('.nav-btn'));
      const i = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { items[(i + 1) % items.length].focus(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { items[(i - 1 + items.length) % items.length].focus(); e.preventDefault(); }
    });
    document.addEventListener('click', function (e) { if (!el.nav.contains(e.target)) closeMore(); });
    global.addEventListener('resize', layoutNav);
  }
  function layoutNav() {
    if (!el.nav || !moreBtn || el.nav.hidden) return;
    closeMore();
    navButtons.forEach(function (b) { el.nav.insertBefore(b, moreBtn); });   // all back in order, then measure
    moreBtn.hidden = true;
    const cs = global.getComputedStyle(el.nav);
    const avail = el.nav.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const minW = global.innerWidth >= 1024 ? 84 : 56;             // smallest comfortable item
    if (navButtons.length * minW <= avail) { syncMoreActive(); return; }
    const fit = Math.max(1, Math.floor(avail / minW) - 1);          // leave room for "More"
    navButtons.slice(fit).forEach(function (b) { moreMenu.appendChild(b); });
    moreBtn.hidden = false;
    syncMoreActive();
  }
  /* One sliding pill marks the active item (or "More" when the active item is inside it). */
  let navInd = null;
  function setupNavIndicator() {
    if (!el.nav || navInd) return;
    navInd = h('span', { class: 'nav-indicator', 'aria-hidden': 'true' });
    el.nav.insertBefore(navInd, el.nav.firstChild);
  }
  function positionIndicator() {
    if (!navInd || el.nav.hidden) return;
    let target = el.nav.querySelector(':scope > .nav-btn.active:not([hidden])');
    if (!target && moreBtn && !moreBtn.hidden && moreBtn.classList.contains('active')) target = moreBtn;
    if (!target) { navInd.style.opacity = '0'; return; }
    const n = el.nav.getBoundingClientRect(), r = target.getBoundingClientRect();
    navInd.style.setProperty('--ix', (r.left - n.left) + 'px');
    navInd.style.setProperty('--iy', (r.top - n.top) + 'px');
    navInd.style.width = r.width + 'px';
    navInd.style.height = r.height + 'px';
    navInd.style.opacity = '1';
    // first placement must not slide in from the corner
    if (!navInd.dataset.placed) { navInd.classList.add('no-anim'); void navInd.offsetWidth; navInd.dataset.placed = '1'; requestAnimationFrame(function () { navInd.classList.remove('no-anim'); }); }
  }

  /* Screen motion: entrance classes only when a screen is really (re)drawn, and a small
     FLIP routine so cards glide to their new places when the window is resized. */
  const flip = { rects: new Map(), timer: 0, rec: 0 };
  function flipItems() { return el.screen.querySelectorAll('.masonry > *, .card-grid > *'); }
  function docRect(e) { const r = e.getBoundingClientRect(); return { x: r.left + global.scrollX, y: r.top + global.scrollY }; }
  function flipRecord() {
    flip.rects = new Map();
    flipItems().forEach(function (e) { flip.rects.set(e, docRect(e)); });
  }
  function flipPlay() {
    flipItems().forEach(function (e) { e.getAnimations().forEach(function (a) { if (a.id === 'flip') a.cancel(); }); });
    const ok = motionOK();
    const next = new Map();
    flipItems().forEach(function (e) {
      const n = docRect(e), o = flip.rects.get(e);
      next.set(e, n);
      if (ok && o && (Math.abs(o.x - n.x) > 2 || Math.abs(o.y - n.y) > 2) && e.animate) {
        const a = e.animate([{ transform: 'translate(' + (o.x - n.x) + 'px,' + (o.y - n.y) + 'px)' }, { transform: 'none' }], { duration: 320, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' });
        a.id = 'flip';
      }
    });
    flip.rects = next;
  }
  function setupScreenMotion() {
    let enterTimer = 0;
    const mo = new MutationObserver(function (list) {
      let direct = false;
      list.forEach(function (m) { if (m.target === el.screen) direct = true; });
      if (direct && motionOK()) {
        el.screen.classList.add('is-entering');
        clearTimeout(enterTimer);
        enterTimer = setTimeout(function () { el.screen.classList.remove('is-entering'); }, 900);
      }
      clearTimeout(flip.rec);                       // remember where cards sit once things settle
      flip.rec = setTimeout(flipRecord, 120);
    });
    mo.observe(el.screen, { childList: true, subtree: true });
    global.addEventListener('resize', function () {
      clearTimeout(flip.timer);
      flip.timer = setTimeout(flipPlay, 90);       // once the resize settles — never per frame
    });
  }

  /* Quick "keep screen awake" button in the floating group: same state and same routine as Settings. */
  function setupAwakeButton() {
    el.awakeBtn = document.getElementById('awake-toggle-btn');
    if (!el.awakeBtn) return;
    if (!el.awakeBtn.querySelector('.icon')) el.awakeBtn.appendChild(icon('lightbulb'));
    el.awakeBtn.addEventListener('click', function () {
      if (global.UI && global.UI.applyKeepAwake) global.UI.applyKeepAwake(!UX.getKeepAwake());
    });
    UX.on('keep-awake-changed', syncAwakeButton);
    syncAwakeButton();
  }
  function syncAwakeButton() {
    if (!el.awakeBtn) return;
    const on = UX.getKeepAwake();
    el.awakeBtn.classList.toggle('active', on);
    el.awakeBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    const label = T('Keep screen awake') + ': ' + (on ? T('On') : T('Off'));
    el.awakeBtn.setAttribute('title', label);
    el.awakeBtn.setAttribute('aria-label', label);
  }

  function syncMoreActive() {
    if (!moreBtn) return;
    moreBtn.classList.toggle('active', !!moreMenu.querySelector('.nav-btn.active'));
    positionIndicator();
  }

  /* ---------------- Theme ----------------
     ONE source of truth: UX.getThemePreference() ('light' | 'dark' | 'system').
     The floating button and the Settings selector both read it and both
     write it through UX.setTheme(), so they can never disagree. */
  const THEME_CYCLE = ['light', 'dark', 'system'];
  const THEME_META = {
    light: { icon: 'sun', label: 'Light' },
    dark: { icon: 'moon', label: 'Dark' },
    system: { icon: 'monitor', label: 'System' }
  };
  // The icon shows the CURRENT preference (so "System" is visibly "System");
  // the label tells what a tap does next: Light → Dark → System → Light.
  function syncThemeButton() {
    if (!el.themeBtn) return;
    const pref = UX.getThemePreference();
    const next = THEME_CYCLE[(THEME_CYCLE.indexOf(pref) + 1) % THEME_CYCLE.length];
    clear(el.themeBtn);
    el.themeBtn.appendChild(icon(THEME_META[pref].icon));
    el.themeBtn.setAttribute('data-mode', pref);
    el.themeBtn.setAttribute('title', T('Theme') + ': ' + T(THEME_META[pref].label));
    el.themeBtn.setAttribute('aria-label', T('Theme') + ': ' + T(THEME_META[pref].label) + '. ' + T('Switch to') + ' ' + T(THEME_META[next].label) + '.');
  }
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    syncThemeButton();
    syncMetaThemeColor();
  }
  // Font style (O2 / Regular / Bold) — one <html data-font> attribute; root.css turns
  // it into the two weight roles every screen already uses.
  function applyFontMode(mode) {
    document.documentElement.setAttribute('data-font', mode || 'o2');
  }

  // Accent palette — independent from light/dark; see CSS/root.css. The
  // default look (no accent picked) has NO data-color attribute at all, so
  // nothing can leak a forced accent into it.
  function applyThemeColor(color) {
    if (!color || color === 'default') document.documentElement.removeAttribute('data-color');
    else document.documentElement.setAttribute('data-color', color);
    syncMetaThemeColor();
  }
  // Browser/mobile toolbar color follows the active theme + accent: the
  // page background in the default look and in dark mode, the palette's
  // accent fill in light mode when an accent has been picked.
  function syncMetaThemeColor() {
    const meta = document.getElementById('meta-theme-color');
    if (!meta) return;
    const root = document.documentElement;
    const cs = getComputedStyle(root);
    const dark = root.getAttribute('data-theme') === 'dark';
    const useAccent = !dark && root.hasAttribute('data-color');
    const val = (useAccent ? cs.getPropertyValue('--color-primary') : cs.getPropertyValue('--color-bg')).trim();
    if (val) meta.setAttribute('content', val);
  }

  /* ---------------- Part of speech ----------------
     Contract (unchanged): a word line may end in "[n.]", "[v.]", "[adj.]",
     "[adv.]", "[n./v.]", "[phr.v.]" ... The parser in ux.js strips it into
     word.pos; this is presentation only. Each part of speech maps to ONE
     color category (CSS: .pos-noun … .pos-other); a slash-separated tag
     ("n./v.") is drawn as one badge per part, each in its own color. */
  function posCategory(tag) {
    const t = String(tag || '').toLowerCase().replace(/\s+/g, '').replace(/\.+$/, '');
    const base = t.replace(/\.?phr$/, '');            // n.phr → n, adj.phr → adj
    const key = t === 'phr.v' ? 'v' : (t === 'phr' ? 'phr' : base);
    switch (key) {
      case 'n': case 'noun': return 'noun';
      case 'v': case 'vb': case 'verb': return 'verb';
      case 'adj': case 'adjective': return 'adj';
      case 'adv': case 'adverb': return 'adv';
      case 'pron': case 'pronoun': return 'pron';
      case 'prep': case 'preposition': return 'prep';
      case 'conj': case 'conjunction': return 'conj';
      default: return 'other';
    }
  }
  function renderPosBadges(pos) {
    const wrap = h('span', { class: 'pos-group' });
    String(pos).split('/').forEach(function (part) {
      part = part.trim();
      if (part) wrap.appendChild(h('span', { class: 'pos-badge pos-' + posCategory(part), text: part }));
    });
    return wrap;
  }
  // Every tag the app colors, for the Info screen. Order = display order.
  const POS_INFO = [
    { tag: 'n.', name: 'Noun', text: 'A word used to name a person, place, thing, or idea.', example: 'teacher, city, freedom' },
    { tag: 'v.', name: 'Verb', text: 'A word that describes an action, a state, or something that happens.', example: 'write, seem, happen' },
    { tag: 'adj.', name: 'Adjective', text: 'A word that describes a noun or gives more information about it.', example: 'careful, modern, heavy' },
    { tag: 'adv.', name: 'Adverb', text: 'A word that describes a verb, an adjective, or another adverb.', example: 'quickly, very, often' },
    { tag: 'pron.', name: 'Pronoun', text: 'A word used in place of a noun so you do not have to repeat it.', example: 'she, them, this' },
    { tag: 'prep.', name: 'Preposition', text: 'A word that shows how a noun relates to another word, such as place, time, or direction.', example: 'in, between, during' },
    { tag: 'conj.', name: 'Conjunction', text: 'A word that joins words, phrases, or sentences together.', example: 'and, but, because' },
    { tag: 'phr.v.', name: 'Phrasal verb', text: 'A verb combined with a small word (a particle) that gives it a new meaning. It works as one verb.', example: 'turn off, take over' },
    { tag: 'n.phr.', name: 'Noun phrase', text: 'A group of words that works together as a noun.', example: 'private sector, renewable energy' },
    { tag: 'adj.phr.', name: 'Adjective phrase', text: 'A group of words that works together as an adjective.', example: 'connected to' },
    { tag: 'phr.', name: 'Phrase', text: 'A fixed group of words that is learned as one unit and does not fit the other groups.', example: '' },
    { tag: 'other', name: 'Other', text: 'Any tag that is not listed above. It is shown in a neutral color.', example: '' }
  ];

  /* Custom checkbox: hidden native input (for real change events + a11y)
     plus a styled box with check/minus local SVG icons toggled by CSS
     (:checked / :indeterminate), per "checkbox state must be obvious". */
  function customCheckbox(opts) {
    const input = h('input', { type: 'checkbox', class: 'cb-input visually-hidden' });
    if (opts.ariaLabel) input.setAttribute('aria-label', opts.ariaLabel);
    if (opts.checked) input.checked = true;
    if (opts.onchange) input.addEventListener('change', function () { opts.onchange(input.checked); });
    const box = h('span', { class: 'cb-box' }, [
      icon('check', 'cb-icon-checked'),
      icon('minus', 'cb-icon-indeterminate')
    ]);
    const label = h('label', { class: 'cb-wrap' + (opts.extraClass ? ' ' + opts.extraClass : '') }, [input, box]);
    if (opts.trailing) label.appendChild(opts.trailing);
    label._input = input;
    return label;
  }

  /* ---------------- Section metadata (icons + labels only — presentation) ----------------
     Dynamic by design: an unknown section type still renders via the
     fallback in sectionMeta() below, so a new file type (e.g. a future
     Derivatives-like section) works without a JS change — this map only
     upgrades the icon/label once someone wants a nicer one. */
  const SECTION_META = {
    vocabulary: { label: 'Vocabulary', icon: 'book-a', className: 'sec-vocabulary' },
    synonyms_antonyms: { label: 'Synonyms & Antonyms', icon: 'arrow-left-right', className: 'sec-synonyms' },
    idioms: { label: 'Idioms & Phrasal Verbs', icon: 'message-square-quote', className: 'sec-idioms' },
    derivatives: { label: 'Derivatives', icon: 'list-tree', className: 'sec-derivatives' }
  };
  function sectionMeta(type) {
    const m = SECTION_META[type] || { label: String(type).replace(/_/g, ' '), icon: 'file-text', className: 'sec-generic' };
    return { label: T(m.label), icon: m.icon, className: m.className };
  }

  /* ================= Skeleton ================= */
  // Shown only while the lessons are really being loaded (see init). Same structure and
  // sizes as Home (header, search, unit-card grid), so nothing jumps when it is replaced.
  function renderSkeleton() {
    route = { screen: 'skeleton' };
    clear(el.screen);
    eachNav(function (n) { n.hidden = true; });
    const wrap = h('div', { class: 'skeleton-wrap', 'aria-busy': 'true', 'aria-label': T('Loading') });
    wrap.appendChild(h('div', { class: 'sk sk-header' }));
    wrap.appendChild(h('div', { class: 'sk sk-search' }));
    const grid = h('div', { class: 'card-grid sk-grid' });
    for (let i = 0; i < 6; i++) grid.appendChild(h('div', { class: 'sk sk-unit' }));
    wrap.appendChild(grid);
    el.screen.appendChild(wrap);
  }

  /* ================= Load-blocked (file://) ================= */
  function renderLoadBlocked() {
    route = { screen: 'load-blocked' };
    clear(el.screen);
    eachNav(function (n) { n.hidden = true; });
    const wrap = h('div', { class: 'card blocked-card' }, [
      icon('server-off', 'blocked-icon'),
      h('h1', { class: 'title-lg', text: T('Run the site from a local server') }),
      h('p', { class: 'text-muted', text: T('Browsers block reading the Files/*.md lessons when index.html is opened directly by double-click.') }),
      h('ol', { class: 'blocked-steps' }, [
        h('li', { text: T('With VS Code: install the Live Server extension and open index.html with it.') }),
        h('li', { text: T('Or open a terminal in the project folder and run: python -m http.server 8000') }),
        h('li', { text: T('Then open http://localhost:8000 in your browser.') })
      ])
    ]);
    el.screen.appendChild(wrap);
  }

  /* ================= Home ================= */
  function renderHome() {
    route = { screen: 'home' };
    clear(el.screen);
    const units = UX.getUnits();

    el.screen.appendChild(h('header', { class: 'app-header' }, [
      h('div', {}, [
        h('h1', { class: 'title-xl', text: 'E.English' }),
        h('p', { class: 'text-muted', text: T('Choose a unit to start studying') })
      ])
    ]));

    const searchBox = h('div', { class: 'search-box' });
    searchBox.appendChild(icon('search', 'search-icon'));
    const searchInput = h('input', { type: 'text', class: 'search-input', dir: 'auto', placeholder: T('Search for a word...'), 'aria-label': T('Search words') });
    searchInput.addEventListener('input', function () { UX.search(searchInput.value); });
    searchBox.appendChild(searchInput);
    el.screen.appendChild(searchBox);
    el.screen.appendChild(h('div', { class: 'search-results', id: 'search-results' }));

    unitProgressRefs = null;
    const list = h('div', { class: 'card-grid' });
    if (!units.length) {
      list.appendChild(h('p', { class: 'empty-note', text: T('No content is available right now.') }));
    } else {
      unitProgressRefs = {};
      units.forEach(function (unit) {
        // Whole-unit progress: every lesson, every word type (UX.getUnitProgress
        // uses the same counting as Statistics). One bar per UNIT — not per lesson.
        const prog = UX.getUnitProgress(unit.unit);
        const fill = h('div', { class: 'progress-fill' });
        growFill(fill, pct(prog.progress));
        const bar = h('div', { class: 'progress-bar progress-sm', role: 'progressbar', 'aria-label': T('Unit ') + unit.unit + ' ' + T('progress'), 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.round(prog.progress * 100)) }, [fill]);
        const pctEl = h('span', { class: 'unit-progress-pct', text: pctLabel(prog.progress) });
        const vocabEl = h('div', { class: 'nav-card-sub unit-vocab' });
        unitProgressRefs[unit.unit] = { fill: fill, pct: pctEl, bar: bar, vocab: vocabEl };
        setVocabText(vocabEl, prog);
        list.appendChild(h('button', { class: 'nav-card nav-card-unit tone-blue', onclick: function () { renderUnit(unit.unit); } }, [
          icon('library', 'nav-card-icon'),
          h('div', { class: 'nav-card-text' }, [
            h('div', { class: 'nav-card-title', text: T('Unit ') + unit.unit }),
            h('div', { class: 'nav-card-sub', text: plural(unit.lessons.length, 'lesson set', 'lesson sets') }),
            vocabEl,
            h('div', { class: 'unit-progress' }, [bar, pctEl])
          ]),
          icon('chevron-right', 'nav-card-chevron')
        ]));
      });
    }
    el.screen.appendChild(list);
    showNav('home');
    renderSearchResults({ results: [] });
  }

  function renderSearchResults(payload) {
    const container = document.getElementById('search-results');
    if (!container) return;
    clear(container);
    const results = (payload && payload.results) || [];
    if (!results.length) {
      // Say so when a search finds nothing (instead of silently showing nothing).
      const q = payload && payload.query ? String(payload.query).trim() : '';
      if (q) container.appendChild(h('p', { class: 'empty-note search-empty', text: T('No words found for \u201C') + q + '\u201D.' }));
      return;
    }
    container.appendChild(h('div', { class: 'search-results-head', text: plural(results.length, 'result', 'results') }));
    results.forEach(function (r) {
      container.appendChild(h('button', { class: 'result-row', onclick: function () { navigateToWord(r.wordId); } }, [
        icon(sectionMeta(r.type).icon, 'result-icon ' + sectionMeta(r.type).className),
        h('div', { class: 'result-text' }, [
          h('span', { class: 'result-word', text: r.word }),
          h('span', { class: 'result-meaning', dir: 'auto', text: r.meaning })
        ]),
        h('span', { class: 'result-loc', text: 'U' + r.unit + ' · L' + r.lessons.join('-') })
      ]));
    });
  }

  /* ================= Unit ================= */
  function renderUnit(unitNum) {
    route = { screen: 'unit', unit: unitNum };
    clear(el.screen);
    const unit = UX.getUnits().find(function (u) { return u.unit === unitNum; });
    if (!unit) { renderHome(); return; }

    el.screen.appendChild(h('header', { class: 'app-header' }, [
      h('button', { class: 'icon-btn back-btn', 'aria-label': T('Back'), onclick: renderHome }, [icon('arrow-left')]),
      h('h1', { class: 'title-lg', text: T('Unit ') + unitNum })
    ]));

    const list = h('div', { class: 'card-grid' });
    unit.lessons.forEach(function (lesson) {
      const key = lesson.lessons.join('-');
      list.appendChild(h('button', { class: 'nav-card', onclick: function () { renderLesson(unitNum, key); } }, [
        icon('notebook-text', 'nav-card-icon tone-blue'),
        h('div', { class: 'nav-card-text' }, [
          h('div', { class: 'nav-card-title', text: T('Lesson ') + lesson.lessons.join('-') }),
          h('div', { class: 'nav-card-sub', text: plural(lesson.sections.length, 'section', 'sections') })
        ]),
        icon('chevron-right', 'nav-card-chevron')
      ]));
    });
    el.screen.appendChild(list);
    showNav('home');
  }

  /* ================= Lesson ================= */
  function renderLesson(unitNum, lessonKey, opts) {
    route = { screen: 'lesson', unit: unitNum, lessonKey: lessonKey };
    opts = opts || {};
    clear(el.screen);
    const unit = UX.getUnits().find(function (u) { return u.unit === unitNum; });
    if (!unit) { renderHome(); return; }
    const lesson = unit.lessons.find(function (l) { return l.lessons.join('-') === lessonKey; });
    if (!lesson) { renderUnit(unitNum); return; }

    el.screen.appendChild(h('header', { class: 'app-header' }, [
      h('button', { class: 'icon-btn back-btn', 'aria-label': T('Back to the unit'), onclick: function () { renderUnit(unitNum); } }, [icon('arrow-left')]),
      h('h1', { class: 'title-lg', text: T('Unit ') + unitNum + ' · ' + T('Lesson ') + lessonKey })
    ]));

    const groupOfFocus = opts.focusWordId ? findGroupIndexForWord(lesson, opts.focusWordId) : null;
    lessonProgressRef = null;
    lessonQuizRef = null;

    const sectionsWrap = h('div', { class: 'sections-wrap' });

    // Sections whose file failed to load (per app.json) get a visible
    // warning card instead of silently disappearing.
    UX.getMissingSections().forEach(function (m) {
      if (m.unit !== unitNum || m.lessons.join('-') !== lessonKey) return;
      const meta = sectionMeta(m.type);
      sectionsWrap.appendChild(h('section', { class: 'section-card section-missing' }, [
        h('div', { class: 'section-card-head' }, [
          h('span', { class: 'section-icon-badge section-icon-warning' }, [icon('triangle-alert')]),
          h('div', { class: 'section-head-text' }, [
            h('h2', { class: 'section-title', text: meta.label }),
            h('span', { class: 'section-count text-warning', text: T('This section could not be loaded') })
          ])
        ])
      ]));
    });

    lesson.sections.forEach(function (section) {
      const meta = sectionMeta(section.type);
      const wordCount = section.groups.reduce(function (a, g) { return a + g.words.length; }, 0);

      const card = h('section', { class: 'section-card ' + meta.className });
      const headText = h('div', { class: 'section-head-text' }, [
        h('h2', { class: 'section-title', text: meta.label }),
        h('span', { class: 'section-count', text: plural(wordCount, 'word', 'words') })
      ]);
      card.appendChild(h('div', { class: 'section-card-head' }, [
        h('span', { class: 'section-icon-badge' }, [icon(meta.icon)]),
        headText
      ]));

      if (section.type === 'vocabulary') {
        // Vocabulary-only progress for this lesson (kept separate from
        // Synonyms/Idioms/Derivatives — see UX.getLessonVocabularyProgress).
        const vp = UX.getLessonVocabularyProgress(unitNum, lessonKey);
        const progressWrap = h('div', { class: 'mini-progress' });
        const progressFill = h('div', { class: 'mini-progress-fill' });
        progressFill.style.width = Math.round(vp.progress * 100) + '%';
        progressWrap.appendChild(progressFill);
        const progressText = h('span', { class: 'mini-progress-text', text: vp.known + '/' + vp.total + ' (' + Math.round(vp.progress * 100) + '%)' });
        headText.appendChild(h('div', { class: 'mini-progress-row' }, [progressWrap, progressText]));
        lessonProgressRef = { unit: unitNum, lessonKey: lessonKey, fillEl: progressFill, textEl: progressText };

        const canSelected = UX.canStartSelectedQuiz(unitNum, lessonKey);
        const row = h('div', { class: 'quiz-launch-row' });
        const fullMeta = h('span', { class: 'quiz-launch-meta' });
        const selectedMeta = h('span', { class: 'quiz-launch-meta' });
        const fullBtn = h('button', {
          class: 'btn btn-primary quiz-launch',
          onclick: function () { if (UX.startFullQuiz(unitNum, lessonKey)) renderQuiz(); }
        }, [icon('clipboard-list'), h('span', { class: 'quiz-launch-text' }, [h('span', { class: 'quiz-launch-title', text: T('Full Quiz') }), fullMeta])]);
        const selectedBtn = h('button', {
          class: 'btn btn-secondary quiz-launch' + (canSelected ? '' : ' is-disabled'),
          disabled: !canSelected,
          onclick: function () { if (UX.canStartSelectedQuiz(unitNum, lessonKey) && UX.startSelectedQuiz(unitNum, lessonKey)) renderQuiz(); }
        }, [icon('list-checks'), h('span', { class: 'quiz-launch-text' }, [h('span', { class: 'quiz-launch-title', text: T('Selected Quiz') }), selectedMeta])]);
        row.appendChild(fullBtn);
        row.appendChild(selectedBtn);
        card.appendChild(row);
        const hintEl = h('p', { class: 'hint-note', text: T('Mark some words as learned first to unlock the Selected Quiz.') });
        hintEl.hidden = canSelected;
        card.appendChild(hintEl);
        lessonQuizRef = { unit: unitNum, lessonKey: lessonKey, selectedBtn: selectedBtn, selectedMeta: selectedMeta, hintEl: hintEl };
        fullMeta.textContent = quizMetaText(UX.getQuizPreview(unitNum, lessonKey, 'full'));
        refreshQuizButtons();
      }

      const groupsWrap = h('div', { class: 'groups-wrap' });
      section.groups.forEach(function (group, gi) {
        const forceOpen = !!(groupOfFocus && groupOfFocus.type === section.type && groupOfFocus.groupIdx === gi);
        groupsWrap.appendChild(renderGroup(group, gi, forceOpen, section.type));
      });
      card.appendChild(groupsWrap);

      sectionsWrap.appendChild(card);
    });
    el.screen.appendChild(sectionsWrap);

    if (opts.focusWordId) {
      setTimeout(function () {
        const node = document.querySelector('[data-word-id="' + cssEscape(opts.focusWordId) + '"]');
        if (node) {
          if (typeof node.scrollIntoView === 'function') node.scrollIntoView({ behavior: 'smooth', block: 'center' });
          node.classList.add('highlight-flash');
          setTimeout(function () { node.classList.remove('highlight-flash'); }, 2200);
        }
      }, 80);
    }
    showNav('home');
  }

  function cssEscape(s) {
    return String(s).replace(/[^a-zA-Z0-9_\-]/g, function (c) { return '\\' + c; });
  }

  function findGroupIndexForWord(lesson, wordId) {
    for (let si = 0; si < lesson.sections.length; si++) {
      const section = lesson.sections[si];
      for (let gi = 0; gi < section.groups.length; gi++) {
        if (section.groups[gi].words.some(function (w) { return w.wordId === wordId; })) {
          return { type: section.type, groupIdx: gi };
        }
      }
    }
    return null;
  }

  /* ================= Group (collapsible) ================= */
  function renderGroup(group, groupIdx, forceOpen, sectionType) {
    const wordIds = group.words.map(function (w) { return w.wordId; });
    const wrap = h('div', { class: 'group' + (forceOpen ? ' open' : '') });

    const known = wordIds.filter(function (id) { return UX.isKnown(id); }).length;

    const cb = customCheckbox({
      checked: UX.getGroupTriState(wordIds) === 'checked',
      extraClass: 'group-cb',
      ariaLabel: T('Mark every word in this group as learned'),
      onchange: function (checked) { UX.setGroupKnown(wordIds, checked); }
    });
    applyTriState(cb._input, UX.getGroupTriState(wordIds));

    const toggleBtn = h('button', { class: 'group-toggle', 'aria-label': T('Expand or collapse group'), 'aria-expanded': forceOpen ? 'true' : 'false' }, [
      icon('chevron-right', 'group-chevron')
    ]);

    const head = h('div', { class: 'group-head' }, [
      cb,
      h('span', { class: 'group-title', text: group.title || (T('Group ') + (groupIdx + 1)) }),
      h('span', { class: 'group-count', text: known + '/' + wordIds.length }),
      toggleBtn
    ]);

    const body = h('div', { class: 'group-body' });
    group.words.forEach(function (w) { body.appendChild(renderWord(w, sectionType)); });

    function toggleOpen() {
      const isOpen = wrap.classList.toggle('open');
      toggleBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    }
    toggleBtn.addEventListener('click', toggleOpen);
    head.querySelector('.group-title').addEventListener('click', toggleOpen);
    head.querySelector('.group-count').addEventListener('click', toggleOpen);

    wrap.appendChild(head);
    wrap.appendChild(body);
    return wrap;
  }

  function applyTriState(input, tri) {
    if (tri === 'checked') { input.checked = true; input.indeterminate = false; }
    else if (tri === 'unchecked') { input.checked = false; input.indeterminate = false; }
    else { input.checked = false; input.indeterminate = true; }
  }

  /* ================= Word Card =================
     article.word-card
       header.word-card-head  → [checkbox] [word + POS] [difficulty]
       p.word-meaning
       div.word-extras        → only when the word has extras
       footer.word-card-foot  → [known state text] [manual-review flag]
     Presentation only: wordId, UX.isKnown / toggleKnown /
     isManualReview / toggleManualReview are used exactly as before. */
  // "mix - combine - merge" (or "a / b", "a, b") → ["mix", "combine", "merge"].
  // Each synonym / antonym becomes its own chip: easier to read and to tap.
  function splitRelated(text) {
    return String(text).split(/\s+[-\u2013\u2014]\s+|\s*[\/\u060C,;]\s*/).map(function (x) { return x.trim(); }).filter(Boolean);
  }

  function renderWordExtras(w) {
    const keys = Object.keys(w.extras || {}).filter(function (k) { return k !== '_raw' && w.extras[k]; });
    if (keys.length) {
      const chips = h('div', { class: 'word-extras' });
      keys.forEach(function (k) {
        const isSyn = /syn/i.test(k);
        chips.appendChild(h('span', { class: 'extra-chip' }, [
          icon(isSyn ? 'equal' : 'equal-not', 'extra-chip-icon'),
          h('span', { class: 'visually-hidden', text: T(k) + ': ' }),
          h('span', { class: 'extra-chip-text', dir: 'auto', text: w.extras[k] })
        ]));
      });
      return chips;
    }
    if (w.extras && w.extras._raw && w.extras._raw.length) {
      return h('div', { class: 'word-extras word-extras-raw', text: w.extras._raw.join(' · ') });
    }
    return null;
  }

  // Synonyms & Antonyms are studied, not just looked at, so they get their own
  // roomier layout: two clearly separate groups, each with a plain-text title,
  // a small icon (the icon is only a hint — the TITLE carries the meaning) and
  // one large, tappable chip per word. Group styles differ by outline as well
  // as by tone (solid vs dashed), so they never rely on color alone.
  function renderRelatedGroups(w) {
    const keys = Object.keys(w.extras || {}).filter(function (k) { return k !== '_raw' && w.extras[k]; });
    const wrap = h('div', { class: 'related' });
    keys.forEach(function (k) {
      const isSyn = /syn/i.test(k);
      const words = splitRelated(w.extras[k]);
      if (!words.length) return;
      const list = h('ul', { class: 'related-list' });
      words.forEach(function (x) { list.appendChild(h('li', { class: 'related-chip', text: x })); });
      wrap.appendChild(h('section', { class: 'related-group ' + (isSyn ? 'related-syn' : 'related-ant'), 'aria-label': isSyn ? T('Synonyms') : T('Antonyms') }, [
        h('h3', { class: 'related-title' }, [icon(isSyn ? 'equal' : 'arrow-left-right', 'related-icon'), h('span', { text: isSyn ? 'Synonyms' : 'Antonyms' })]),
        list
      ]));
    });
    if (!wrap.children.length) return null;
    return wrap;
  }

  function renderWord(w, sectionType) {
    const study = sectionType === 'synonyms_antonyms';
    const card = h('article', { class: 'word-card ' + (w.status === 'easy' ? 'is-easy' : 'is-hard') + (study ? ' word-card-study' : ''), 'data-word-id': w.wordId });

    const cb = customCheckbox({
      checked: UX.isKnown(w.wordId),
      extraClass: 'word-cb',
      onchange: function () { UX.toggleKnown(w.wordId); }
    });
    cb._input.setAttribute('aria-label', T('Mark as learned: ') + w.word);

    const identity = h('div', { class: 'word-identity' }, [h('span', { class: 'word-text', text: w.word })]);
    if (w.pos) identity.appendChild(renderPosBadges(w.pos));

    const easy = w.status === 'easy';
    const diff = h('span', { class: 'diff-badge ' + (easy ? 'diff-easy' : 'diff-hard') }, [
      icon(easy ? 'smile' : 'flame'),
      h('span', { text: easy ? T('Easy') : T('Hard') })
    ]);
    card.appendChild(h('header', { class: 'word-card-head' }, [cb, identity, diff]));
    card.appendChild(h('p', { class: 'word-meaning', dir: 'auto', text: w.meaning }));

    const extras = study ? (renderRelatedGroups(w) || renderWordExtras(w)) : renderWordExtras(w);
    if (extras) card.appendChild(extras);

    const stateIcon = h('span', { class: 'word-state-icon' });
    const stateText = h('span', { class: 'word-state-text' });
    const flagLabel = h('span', { class: 'flag-label' });
    const flag = h('button', {
      type: 'button',
      class: 'flag-btn',
      onclick: function () { UX.toggleReview(w.wordId); }
    }, [icon('flag'), flagLabel]);
    card.appendChild(h('footer', { class: 'word-card-foot' }, [
      h('span', { class: 'word-state' }, [stateIcon, stateText]),
      flag
    ]));

    syncWordCard(card, w.wordId);
    return card;
  }

  // Single place that maps UX state → card DOM (used on first render and
  // on every live refresh, so the two can never drift apart).
  function syncWordCard(card, id) {
    const known = UX.isKnown(id);
    // ONE review state: manual and quiz-made flags both count, so this card
    // always agrees with the Review list.
    const review = UX.needsReview(id);
    card.classList.toggle('is-known', known);
    card.classList.toggle('is-review', review);
    const source = UX.getReviewSource(id);
    if (source) card.setAttribute('data-review-source', source); else card.removeAttribute('data-review-source');

    const cb = card.querySelector('.cb-input');
    if (cb) cb.checked = known;

    const stateIcon = card.querySelector('.word-state-icon');
    if (stateIcon && stateIcon.dataset.known !== String(known)) {
      stateIcon.dataset.known = String(known);
      clear(stateIcon);
      stateIcon.appendChild(icon(known ? 'circle-check' : 'circle-dashed'));
    }
    const stateText = card.querySelector('.word-state-text');
    if (stateText) stateText.textContent = known ? T('Learned') : T('Not learned');

    const flag = card.querySelector('.flag-btn');
    if (flag) {
      flag.classList.toggle('active', review);
      flag.setAttribute('aria-pressed', review ? 'true' : 'false');
      flag.setAttribute('aria-label', review ? T('Remove from review') : T('Add to review'));
      const label = flag.querySelector('.flag-label');
      if (label) label.textContent = review ? T('In review') : T('Review');
    }
  }

  function refreshWordStates() {
    document.querySelectorAll('.word-card').forEach(function (card) {
      syncWordCard(card, card.dataset.wordId);
    });
    document.querySelectorAll('.group').forEach(function (g) {
      const wordIds = [];
      g.querySelectorAll('.word-card').forEach(function (r) { wordIds.push(r.dataset.wordId); });
      const cb = g.querySelector('.group-cb .cb-input');
      if (cb) applyTriState(cb, UX.getGroupTriState(wordIds));
      const countEl = g.querySelector('.group-count');
      if (countEl) {
        const known = wordIds.filter(function (id) { return UX.isKnown(id); }).length;
        countEl.textContent = known + '/' + wordIds.length;
      }
    });
    refreshLessonProgress();
    refreshQuizButtons();
  }

  // Shown on a launch button BEFORE the quiz starts: word count and the
  // estimated range (see QuizEngine.estimateDuration). The range is an
  // estimate; the timer's real limit is deliberately higher.
  function quizMetaText(preview) {
    if (!preview.count) return T('No words yet');
    return T('Estimated time: ') + tmin(preview.label) + ' \u00B7 ' + plural(preview.count, 'word', 'words');
  }
  // The Selected Quiz needs at least one learned word — follow the state
  // live, including its word count and estimated time.
  function refreshQuizButtons() {
    if (!lessonQuizRef) return;
    const can = UX.canStartSelectedQuiz(lessonQuizRef.unit, lessonQuizRef.lessonKey);
    lessonQuizRef.selectedBtn.disabled = !can;
    lessonQuizRef.selectedBtn.classList.toggle('is-disabled', !can);
    lessonQuizRef.hintEl.hidden = can;
    lessonQuizRef.selectedMeta.textContent = can
      ? quizMetaText(UX.getQuizPreview(lessonQuizRef.unit, lessonQuizRef.lessonKey, 'selected'))
      : T('Learn some words to unlock');
  }

  // Vocabulary-only progress bar inside the lesson's Vocabulary section
  // header — updated in place, never triggers a screen rebuild.
  function refreshLessonProgress() {
    if (!lessonProgressRef) return;
    const vp = UX.getLessonVocabularyProgress(lessonProgressRef.unit, lessonProgressRef.lessonKey);
    lessonProgressRef.fillEl.style.width = Math.round(vp.progress * 100) + '%';
    lessonProgressRef.textEl.textContent = vp.known + '/' + vp.total + ' (' + Math.round(vp.progress * 100) + '%)';
  }

  // Word Review: one group per unit. Every item has the SAME flag button as the
  // word cards (same icon, same state from UX.needsReview). Un-flagging keeps the
  // item on screen for 3 seconds so it can be flagged again; only then does it
  // leave the list. Review state itself lives only in UX (toggleReview /
  // needsReview); `pendingReview` just remembers which rows are still showing.
  const pendingReview = {};   // wordId -> { rec, snap, timer }
  const reviewOrder = {};     // wordId -> last list index (so a pending row keeps its place)
  function clearPending(id) {
    const p = pendingReview[id];
    if (p) { clearTimeout(p.timer); delete pendingReview[id]; }
  }
  function onReviewFlag(r) {
    const id = r.wordId;
    const p = pendingReview[id];
    if (p) {                                   // flagged again within 3 s: cancel the removal
      clearPending(id);
      if (p.snap.manual || p.snap.auto) UX.restoreReview(p.snap); else UX.toggleReview(id);
      return;
    }
    if (!UX.needsReview(id)) { UX.toggleReview(id); return; }
    const entry = { rec: r, snap: UX.snapshotReview(id), timer: null };
    pendingReview[id] = entry;                 // registered BEFORE the state change redraws the list
    entry.timer = setTimeout(function () {
      if (pendingReview[id] !== entry) return; // already cancelled / replaced
      delete pendingReview[id];
      if (route.screen === 'statistics') refreshStatsLive();
    }, 3000);
    UX.toggleReview(id);
  }
  function reviewItem(r, flagged) {
    const meta = sectionMeta(r.type);
    const has = r.meaning && String(r.meaning).trim();
    const flag = h('button', {
      type: 'button', class: 'flag-btn review-flag' + (flagged ? ' active' : ''),
      'aria-pressed': flagged ? 'true' : 'false',
      'aria-label': (flagged ? T('Remove from review') : T('Add to review')) + ': ' + r.word,
      title: flagged ? T('Remove from review') : T('Add to review'),
      onclick: function (e) { e.stopPropagation(); onReviewFlag(r); }
    }, [icon('flag')]);
    return h('div', { class: 'review-item' + (flagged ? '' : ' is-pending') }, [
      h('button', { type: 'button', class: 'result-row review-row', onclick: function () { navigateToWord(r.wordId); } }, [
        icon(meta.icon, 'result-icon ' + meta.className),
        h('div', { class: 'result-text' }, [
          h('span', { class: 'result-word', dir: 'ltr', text: r.word }),
          h('span', { class: 'result-meaning' + (has ? '' : ' text-muted'), dir: 'auto', text: has ? r.meaning : T('No translation') })
        ]),
        h('span', { class: 'result-loc', text: 'L' + r.lessons.join('-') })
      ]),
      flag
    ]);
  }
  function renderReviewInto(container, stats) {
    clear(container);
    const rows = stats.reviewWords.slice();
    const live = {};
    rows.forEach(function (r, i) { live[r.wordId] = true; reviewOrder[r.wordId] = i; });
    Object.keys(pendingReview).forEach(function (id) {
      if (live[id]) { clearPending(id); return; }    // back in Review by another route: no stale timer
      const at = Math.min(reviewOrder[id] == null ? rows.length : reviewOrder[id], rows.length);
      rows.splice(at, 0, pendingReview[id].rec);
    });
    if (!rows.length) {
      container.appendChild(h('p', { class: 'empty-note', text: T('Nothing to review right now. Nice work!') }));
      return;
    }
    const byUnit = {}, order = [];
    rows.forEach(function (r) {
      if (!byUnit[r.unit]) { byUnit[r.unit] = []; order.push(r.unit); }
      byUnit[r.unit].push(r);
    });
    order.sort(function (a, b) { return a - b; }).forEach(function (u) {
      container.appendChild(h('section', { class: 'review-group', 'aria-label': T('Unit ') + u }, [
        h('h3', { class: 'review-group-title' }, [
          h('span', { text: T('Unit ') + u }),
          h('span', { class: 'review-group-count', text: String(byUnit[u].length) })
        ]),
        h('div', { class: 'review-group-items' }, byUnit[u].map(function (r) { return reviewItem(r, !pendingReview[r.wordId]); }))
      ]));
    });
  }

  // Home: keep the unit bars in step with the learned state (no re-render).
  // Total words of the unit across all four content types, and how many are learned:
  // straight from UX.getUnitProgress — the same numbers Statistics uses.
  function setVocabText(node, p) {
    node.hidden = !p.total;
    node.textContent = T('{n} words in total \u00B7 {k} learned', { k: p.known, n: p.total });
  }
  function refreshUnitProgress() {
    if (!unitProgressRefs) return;
    Object.keys(unitProgressRefs).forEach(function (u) {
      const r = unitProgressRefs[u], p = UX.getUnitProgress(Number(u));
      r.fill.style.width = pct(p.progress);
      r.pct.textContent = pctLabel(p.progress);
      r.bar.setAttribute('aria-valuenow', String(Math.round(p.progress * 100)));
      if (r.vocab) setVocabText(r.vocab, p);
    });
  }

  // Statistics screen: patch just the numbers/lists that changed instead
  // of clearing and rebuilding the whole screen (keeps scroll position).
  function pct(p) { return Math.round(p * 100) + '%'; }   // used for bar WIDTHS
  // Text label for a progress value: a little progress never reads as "0%".
  function pctLabel(p) { return p > 0 && p < 0.01 ? '<1%' : Math.round(p * 100) + '%'; }
  function typeStat(stats, type) {
    return (stats.byType && stats.byType[type]) || { total: 0, known: 0, progress: 0 };
  }
  function refreshStatsLive() {
    if (!statsRefs) return;
    const stats = UX.getStatistics();
    Object.keys(statsRefs.types).forEach(function (type) {
      const t = typeStat(stats, type), r = statsRefs.types[type];
      r.fill.style.width = pct(t.progress);
      r.pct.textContent = pctLabel(t.progress);
      r.count.textContent = t.known + ' / ' + t.total + ' ' + T('words');
    });
    statsRefs.overallFill.style.width = pct(stats.overall.progress);
    statsRefs.overallPct.textContent = pctLabel(stats.overall.progress);
    statsRefs.overallText.textContent = T('{k} of {n} words learned', { k: stats.overall.known, n: stats.overall.total });
    statsRefs.reviewHead.textContent = T('Words to review (') + stats.reviewWords.length + ')';
    renderReviewInto(statsRefs.reviewListEl, stats);
  }

  function statLabel(type) {
    return type === 'vocabulary' ? T('Vocabulary progress') : sectionMeta(type).label;
  }

  /* ================= Statistics ================= */
  function renderStatistics() {
    route = { screen: 'statistics' };
    clear(el.screen);
    const stats = UX.getStatistics();

    el.screen.appendChild(h('header', { class: 'app-header' }, [h('h1', { class: 'title-lg', text: T('Statistics') })]));

    // 1) Overall progress first: one big number, one bar.
    const overallPct = h('span', { class: 'stats-hero-pct', text: pctLabel(stats.overall.progress) });
    const overallText = h('span', { class: 'stats-hero-count', text: T('{k} of {n} words learned', { k: stats.overall.known, n: stats.overall.total }) });
    const overallFill = h('div', { class: 'progress-fill' });
    growFill(overallFill, pct(stats.overall.progress));
    el.screen.appendChild(h('section', { class: 'card stats-hero tone-blue', 'aria-label': T('Overall progress') }, [
      h('div', { class: 'stats-hero-label', text: T('Overall progress') }),
      h('div', { class: 'stats-hero-main' }, [overallPct, overallText]),
      h('div', { class: 'progress-bar progress-lg', role: 'progressbar', 'aria-label': T('Overall progress') }, [overallFill])
    ]));

    // 2) Progress per content type, grouped in ONE card (rows, not four cards).
    // Order follows SECTION_META; each type is counted on its own, so one
    // never dilutes another.
    el.screen.appendChild(h('h2', { class: 'stats-section-title', text: T('By content type') }));
    const typeRefs = {};
    const typesList = h('div', { class: 'card stats-types' });
    Object.keys(SECTION_META).forEach(function (type) {
      const t = typeStat(stats, type);
      const meta = sectionMeta(type);
      const fill = h('div', { class: 'progress-fill' });
      growFill(fill, pct(t.progress));
      const count = h('span', { class: 'stats-type-count', text: t.known + ' / ' + t.total + ' ' + T('words') });
      const pctEl = h('span', { class: 'stats-type-pct', text: pctLabel(t.progress) });
      typesList.appendChild(h('div', { class: 'stats-type stats-card-' + type + ' ' + meta.className }, [
        h('span', { class: 'stats-type-badge' }, [icon(meta.icon)]),
        h('div', { class: 'stats-type-text' }, [h('span', { class: 'stats-type-label', text: statLabel(type) }), count]),
        pctEl,
        h('div', { class: 'progress-bar stats-type-bar', role: 'progressbar', 'aria-label': statLabel(type) }, [fill])
      ]));
      typeRefs[type] = { fill: fill, pct: pctEl, count: count };
    });
    el.screen.appendChild(typesList);

    const reviewHead = h('h2', { class: 'stats-section-title stats-review-title' }, [
      icon('flag'), h('span', { text: T('Words to review (') + stats.reviewWords.length + ')' })
    ]);
    el.screen.appendChild(reviewHead);
    const reviewListEl = h('div', { class: 'review-list masonry' });
    renderReviewInto(reviewListEl, stats);
    el.screen.appendChild(reviewListEl);

    statsRefs = {
      types: typeRefs,
      overallFill: overallFill, overallPct: overallPct, overallText: overallText,
      reviewHead: reviewHead.querySelector('span:last-child'),
      reviewListEl: reviewListEl
    };

    showNav('statistics');
  }

  /* ================= Quiz ================= */
  const RESULT_ICONS = { correct: 'check', near: 'equal-approximately', wrong: 'x', skipped: 'minus' };
  let lastTimerState = 'normal';
  let quizView = 'question';     // 'question' | 'summary' (the "ready to finish?" step)
  let quizRefs = null;           // DOM handles of the running quiz, so live updates never rebuild the screen

  // During a quiz the site chrome disappears: no bottom bar, no side rail, no
  // floating theme button — the quiz owns the whole screen (see .quiz-fs).
  function setQuizChrome(on) {
    document.body.classList.toggle('quiz-active', on);
    eachNav(function (n) { n.hidden = on; });
  }

  // A question's state is never colour-only: each state has its own marker
  // (check / dash / empty) and outline style as well as its colour.
  const QSTATE = {
    answered: { icon: 'check', label: 'answered' },
    skipped: { icon: 'minus', label: 'skipped' },
    unanswered: { icon: null, label: 'not answered yet' }
  };
  function qLabel(state) { return T(QSTATE[state].label); }
  function setMarker(host, state) {
    clear(host);
    if (QSTATE[state].icon) host.appendChild(icon(QSTATE[state].icon));
  }

  function renderQuiz() {
    route = { screen: 'quiz' };
    clear(el.screen);
    const quiz = UX.getCurrentQuiz();
    if (!quiz) { setQuizChrome(false); renderHome(); return; }
    setQuizChrome(true);
    quizView = 'question';
    lastTimerState = 'normal';

    const refs = quizRefs = { pills: [], rows: [] };
    refs.title = h('div', { class: 'quiz-title', 'aria-live': 'polite' });
    refs.sub = h('div', { class: 'quiz-sub' });
    refs.timerText = h('span', { id: 'quiz-timer-text', text: QE.formatClock(quiz.timeLeft) });

    const bar = h('header', { class: 'quiz-bar' }, [
      h('button', {
        type: 'button', class: 'icon-btn quiz-close', 'aria-label': T('Cancel quiz'),
        onclick: function () { if (confirm('Cancel this quiz? Your answers will be discarded.')) { UX.abortQuiz(); renderHome(); } }
      }, [icon('x')]),
      h('div', { class: 'quiz-heading' }, [refs.title, refs.sub]),
      h('div', { class: 'quiz-timer', id: 'quiz-timer', role: 'timer', 'aria-label': T('Time left') }, [icon('timer'), refs.timerText]),
      h('button', { type: 'button', class: 'icon-btn quiz-review-btn', 'aria-label': T('Review answers and finish'), title: T('Review and finish'), onclick: openQuizSummary }, [icon('list-checks')])
    ]);

    // Mobile: a strip with one numbered button per question.
    const strip = h('nav', { class: 'quiz-numbers', 'aria-label': T('Questions') });
    quiz.items.forEach(function (it) {
      const marker = h('span', { class: 'qn-marker', 'aria-hidden': 'true' });
      const b = h('button', { type: 'button', class: 'qn', onclick: function () { quizGo(it.index); } }, [h('span', { class: 'qn-num', text: String(it.index + 1) }), marker]);
      refs.pills.push({ el: b, marker: marker });
      strip.appendChild(b);
    });

    // Desktop: a compact panel listing every question of this session.
    const panelTitle = QE.PANEL && QE.PANEL.SHOW_ENGLISH_WORDS ? T('Quiz words') : T('Questions');
    const list = h('ol', { class: 'qp-list' });
    quiz.items.forEach(function (it) {
      const marker = h('span', { class: 'qp-marker', 'aria-hidden': 'true' });
      const b = h('button', { type: 'button', class: 'qp-row', onclick: function () { quizGo(it.index); } }, [
        h('span', { class: 'qp-num', text: String(it.index + 1) }),
        h('span', { class: 'qp-label', dir: 'auto', text: it.label }),
        marker
      ]);
      refs.rows.push({ el: b, marker: marker });
      list.appendChild(h('li', {}, [b]));
    });
    const panel = h('aside', { class: 'quiz-panel', 'aria-label': panelTitle }, [h('h2', { class: 'qp-title', text: panelTitle }), list]);

    refs.stage = h('div', { class: 'quiz-stage-wrap' });
    refs.main = h('div', { class: 'quiz-main' }, [refs.stage]);
    const body = h('div', { class: 'quiz-body' }, [refs.main, panel]);

    const fs = h('div', { class: 'quiz-fs', id: 'quiz-fs', role: 'dialog', 'aria-modal': 'true', 'aria-label': T('Quiz') }, [
      bar, strip,
      h('div', { class: 'quiz-timebar', 'aria-hidden': 'true' }, [h('div', { class: 'quiz-timebar-fill', id: 'quiz-timebar-fill' })]),
      h('div', { class: 'visually-hidden', id: 'quiz-announce', 'aria-live': 'polite' }),
      body
    ]);
    fs.addEventListener('keydown', function (e) {
      if (!e.altKey) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); quizNext(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); quizPrev(); }
    });
    el.screen.appendChild(fs);
    updateQuizTimer({ timeLeft: quiz.timeLeft, timeLimit: quiz.timeLimit, state: quiz.timerState });
    refreshQuizIndicators();
    renderQuizStage(true);
  }

  // Keeps the counter, the number buttons and the desktop panel in step with
  // the session (cheap: only classes / markers change, nothing is rebuilt).
  function refreshQuizIndicators() {
    const quiz = UX.getCurrentQuiz();
    if (!quiz || !quizRefs) return;
    quizRefs.title.textContent = quizView === 'summary' ? T('Review & finish') : T('Question {i} of {n}', { i: quiz.index + 1, n: quiz.total });
    quizRefs.sub.textContent = quiz.answered + ' ' + T('answered') + (quiz.skipped ? ' \u00B7 ' + quiz.skipped + ' ' + T('skipped') : '');
    quiz.items.forEach(function (it) {
      const cur = quizView === 'question' && it.index === quiz.index;
      const name = T('Question ') + (it.index + 1) + ', ' + qLabel(it.state) + (cur ? ', ' + T('current question') : '');
      [quizRefs.pills[it.index], quizRefs.rows[it.index]].forEach(function (r, k) {
        const base = k === 0 ? 'qn' : 'qp-row';
        r.el.className = base + ' ' + base + '-' + it.state + (cur ? ' ' + base + '-current' : '');
        r.el.setAttribute('aria-label', name + (k === 1 ? ': ' + it.label : ''));
        if (cur) r.el.setAttribute('aria-current', 'step'); else r.el.removeAttribute('aria-current');
        setMarker(r.marker, it.state);
      });
    });
    if (quizView === 'question') {
      [quizRefs.pills[quiz.index], quizRefs.rows[quiz.index]].forEach(function (r) {
        if (r && r.el.scrollIntoView) r.el.scrollIntoView({ block: 'nearest', inline: 'center' });
      });
    }
  }

  function quizGo(i) {
    const quiz = UX.getCurrentQuiz();
    if (!quiz) return;
    const wasSummary = quizView === 'summary';
    quizView = 'question';
    if (i === quiz.index || wasSummary) { UX.goToQuestion(i); renderQuizStage(true); refreshQuizIndicators(); }
    else UX.goToQuestion(i);          // 'quiz-question' event redraws
  }
  function quizNext() {
    const quiz = UX.getCurrentQuiz();
    if (!quiz) return;
    if (quiz.index >= quiz.total - 1) openQuizSummary(); else UX.nextQuizQuestion();
  }
  function quizPrev() { UX.previousQuizQuestion(); }
  function openQuizSummary() {
    if (!UX.getCurrentQuiz()) return;
    UX.leaveCurrentQuestion();          // an empty question you leave is skipped, like any other move
    quizView = 'summary';
    renderQuizStage(false);
    refreshQuizIndicators();
  }

  function renderQuizStage(focusInput) {
    if (!quizRefs) return;
    const quiz = UX.getCurrentQuiz();
    if (!quiz) return;
    clear(quizRefs.stage);
    if (quizView === 'summary') { quizRefs.stage.appendChild(renderQuizSummary(quiz)); return; }

    const q = quiz.question;
    const input = h('input', {
      type: 'text', class: 'quiz-input', id: 'quiz-answer', dir: 'ltr', placeholder: T('Your answer'), value: q.answer || '',
      autocomplete: 'off', autocapitalize: 'none', autocorrect: 'off', spellcheck: 'false', enterkeyhint: 'next',
      'aria-label': T('Your answer for question ') + (quiz.index + 1)
    });
    input.value = q.answer || '';
    const stateLine = h('div', { class: 'quiz-state-line', role: 'status' });
    function paintState(state) {
      clear(stateLine);
      stateLine.className = 'quiz-state-line quiz-state-' + state;
      const text = state === 'answered' ? T('Answer saved \u2014 you can change it any time')
        : state === 'skipped' ? T('Skipped \u2014 you can still answer it')
        : T('Not answered yet');
      if (QSTATE[state].icon) stateLine.appendChild(icon(QSTATE[state].icon));
      stateLine.appendChild(h('span', { text: text }));
    }
    paintState(q.state);
    input.addEventListener('input', function () { paintState(UX.setQuizAnswer(input.value) || 'unanswered'); });
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); quizNext(); } });

    const last = quiz.index >= quiz.total - 1;
    const prevBtn = h('button', { type: 'button', class: 'btn btn-secondary quiz-nav-btn', 'aria-label': T('Previous question'), onclick: quizPrev }, [icon('arrow-left'), h('span', { text: T('Previous') })]);
    prevBtn.disabled = quiz.index === 0;
    const nextBtn = h('button', { type: 'button', class: 'btn btn-primary quiz-nav-btn', 'aria-label': last ? 'Review answers and finish' : 'Next question', onclick: quizNext }, [
      h('span', { text: last ? 'Review & finish' : 'Next' }), icon(last ? 'list-checks' : 'arrow-right')
    ]);

    quizRefs.stage.appendChild(h('section', { class: 'quiz-stage' }, [
      h('div', { class: 'card quiz-card quiz-enter' }, [
        h('div', { class: 'quiz-card-label', text: T('Type the English word') }),
        h('div', { class: 'quiz-meaning', dir: 'auto', text: q.meaning })
      ]),
      h('div', { class: 'quiz-answer' }, [input, stateLine]),
      h('div', { class: 'quiz-foot' }, [prevBtn, nextBtn])
    ]));
    if (focusInput) setTimeout(function () { if (document.body.contains(input)) input.focus(); }, 30);
  }

  // The "ready to finish?" step: how many questions have an answer, and a way
  // back to every one that does not. Grading only happens after "Finish quiz".
  function renderQuizSummary(quiz) {
    const tile = function (kind, n, label) {
      return h('div', { class: 'qs-tile qs-' + kind }, [
        h('span', { class: 'qs-icon' }, [icon(QSTATE[kind].icon || 'circle-dashed')]),
        h('span', { class: 'qs-label', text: label }),
        h('span', { class: 'qs-value', text: String(n) })
      ]);
    };
    const children = [
      h('h2', { class: 'qs-heading', text: T('Ready to finish?') }),
      h('div', { class: 'qs-tiles' }, [
        tile('answered', quiz.answered, T('Answered')), tile('skipped', quiz.skipped, T('Skipped')), tile('unanswered', quiz.unanswered, T('Unanswered'))
      ])
    ];
    if (quiz.unresolved.length) {
      const chips = h('div', { class: 'qs-chips', role: 'group', 'aria-label': T('Questions without an answer') });
      quiz.unresolved.forEach(function (i) {
        const st = quiz.items[i].state;
        chips.appendChild(h('button', { type: 'button', class: 'qn qn-' + st, 'aria-label': T('Go to question ') + (i + 1) + ', ' + qLabel(st), onclick: function () { quizGo(i); } }, [
          h('span', { class: 'qn-num', text: String(i + 1) }), h('span', { class: 'qn-marker', 'aria-hidden': 'true' }, QSTATE[st].icon ? [icon(QSTATE[st].icon)] : [])
        ]));
      });
      children.push(h('div', { class: 'callout' }, [
        h('p', { class: 'callout-text', text: T('{n} no answer yet. Tap a number to go back to it. If you finish now, they count as skipped.', { n: plural(quiz.unresolved.length, 'question has', 'questions have') }) }),
        chips
      ]));
    } else {
      children.push(h('div', { class: 'callout callout-ok' }, [h('p', { class: 'callout-text', text: T('Every question has an answer.') })]));
    }
    children.push(h('div', { class: 'qs-actions' }, [
      h('button', { type: 'button', class: 'btn btn-secondary quiz-nav-btn', onclick: function () { quizGo(Math.min(quiz.index, quiz.total - 1)); } }, [icon('arrow-left'), h('span', { text: T('Back to questions') })]),
      h('button', { type: 'button', class: 'btn btn-primary quiz-nav-btn', onclick: function () { UX.finishQuiz(false); } }, [icon('circle-check'), h('span', { text: T('Finish quiz') })])
    ]));
    return h('section', { class: 'quiz-stage quiz-summary' }, children);
  }

  // Near-expiry: the clock and the thin time bar change color as the limit
  // approaches (warning, then critical); only the critical state pulses, and
  // only gently. The state is decided by the engine, not here.
  function updateQuizTimer(p) {
    const text = document.getElementById('quiz-timer-text');
    const wrap = document.getElementById('quiz-timer');
    const bar = document.getElementById('quiz-timebar-fill');
    if (!text) return;
    text.textContent = QE.formatClock(p.timeLeft);
    if (wrap) {
      wrap.classList.toggle('timer-warning', p.state === 'warning');
      wrap.classList.toggle('timer-critical', p.state === 'critical');
    }
    if (bar) {
      bar.style.width = Math.max(0, Math.min(100, (p.timeLeft / p.timeLimit) * 100)) + '%';
      bar.setAttribute('data-state', p.state);
    }
    if (p.state !== lastTimerState) {
      lastTimerState = p.state;
      const say = document.getElementById('quiz-announce');
      if (say && p.state !== 'normal') say.textContent = p.state === 'critical' ? T('Time is almost up.') : T('Time is running low.');
    }
  }

  /* ---------------- Result view (shared) ----------------
     The same view shows a quiz that just finished AND any past quiz opened
     from Quiz History — both are the same self-contained record. */
  function contextLabel(record) {
    const r = record.ref || {};
    if (r.unit == null) return T('Vocabulary quiz');
    return T('Unit ') + r.unit + (r.lessonKey ? ' \u00B7 ' + T('Lesson ') + r.lessonKey : '');
  }
  function modeLabel(record) { return T((QE.MODES[record.mode] || QE.MODES.full).label); }
  function dateLabel(ts) {
    const d = new Date(ts);
    return d.toLocaleDateString(global.I18n.locale(), { year: 'numeric', month: 'short', day: 'numeric' }) + ' \u00B7 ' + d.toLocaleTimeString(global.I18n.locale(), { hour: '2-digit', minute: '2-digit' });
  }
  function rangeLabel(record) {
    return record.estimatedRange ? tmin(QE.formatRange(record.estimatedRange.min, record.estimatedRange.max)) : '\u2014';
  }
  function pointsText(n) { return n > 0 ? '+' + QE.formatScore(n) : '0'; }

  function renderQuizResultView(record) {
    const view = h('div', { class: 'quiz-result' });

    // 1) The result, at a glance.
    const hero = h('section', { class: 'card result-hero' }, [
      h('div', { class: 'result-hero-label', text: T('Score') }),
      h('div', { class: 'result-score', 'aria-label': T('Score ') + QE.formatScore(record.score) + ' / ' + QE.formatScore(record.maxScore) }, [
        h('span', { class: 'result-score-value', text: QE.formatScore(record.score) }),
        h('span', { class: 'result-score-max', text: ' / ' + QE.formatScore(record.maxScore) })
      ]),
      h('div', { class: 'result-percent' }, [
        h('span', { class: 'result-percent-label', text: T('Percentage') }),
        h('span', { class: 'result-percent-value', text: QE.formatPercent(record.percentage) })
      ]),
      h('div', { class: 'result-bar', 'aria-hidden': 'true' }, [h('div', { class: 'result-bar-fill', style: 'width:' + Math.max(0, Math.min(100, record.percentage)) + '%' })])
    ]);
    if (record.timedOut) hero.appendChild(h('div', { class: 'result-timedout' }, [icon('clock'), h('span', { text: T('Time ran out') })]));
    view.appendChild(hero);

    // 2) Four compact categories.
    const cats = h('div', { class: 'result-cats' });
    QE.CATEGORIES.forEach(function (c) {
      cats.appendChild(h('div', { class: 'result-cat result-cat-' + c }, [
        h('span', { class: 'result-cat-icon' }, [icon(RESULT_ICONS[c])]),
        h('span', { class: 'result-cat-label', text: T(QE.LABELS[c]) }),
        h('span', { class: 'result-cat-value', text: String(record[c]) })
      ]));
    });
    view.appendChild(cats);

    // 3) Everything else lives behind one control.
    const panel = h('div', { class: 'result-details', id: 'result-details-' + record.id });
    panel.hidden = true;
    let built = false;
    const toggle = h('button', {
      type: 'button', class: 'details-toggle', 'aria-expanded': 'false', 'aria-controls': panel.id,
      onclick: function () {
        const open = panel.hidden;
        panel.hidden = !open;
        toggle.classList.toggle('open', open);
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (open && !built) { built = true; buildDetails(panel, record); }
      }
    }, [
      icon('list-checks', 'details-toggle-icon'),
      h('span', { class: 'details-toggle-label', text: T('Advanced Details') }),
      icon('chevron-down', 'details-chevron')
    ]);
    view.appendChild(toggle);
    view.appendChild(panel);
    return view;
  }

  function buildDetails(panel, record) {
    const answered = record.correct + record.near + record.wrong; // skipped questions are not "answered"
    const stats = [
      [T('Exact score'), QE.formatScore(record.score)],
      [T('Maximum score'), QE.formatScore(record.maxScore)],
      [T('Percentage'), QE.formatPercent(record.percentage)],
      [T('Accuracy (answered)'), answered > 0 ? QE.formatPercent((record.score / answered) * 100) : '\u2014'],
      [T('Correct'), String(record.correct)],
      [T('Near Miss'), String(record.near)],
      [T('Wrong'), String(record.wrong)],
      [T('Skipped'), String(record.skipped)],
      [T('Time spent'), record.durationSeconds != null ? QE.formatClock(record.durationSeconds) : '\u2014'],
      [T('Estimated time'), rangeLabel(record)],
      [T('Time limit'), record.timeLimit != null ? QE.formatClock(record.timeLimit) : '\u2014']
    ];
    const dl = h('dl', { class: 'details-grid' });
    stats.forEach(function (r) {
      dl.appendChild(h('div', { class: 'details-item' }, [h('dt', { text: r[0] }), h('dd', { text: r[1] })]));
    });
    panel.appendChild(dl);

    panel.appendChild(h('h3', { class: 'details-subtitle', text: T('Question breakdown') }));
    if (!record.answers.length) {
      panel.appendChild(h('p', { class: 'empty-note', text: T('Question details were not saved for this quiz.') }));
      return;
    }
    const filters = h('div', { class: 'details-filters', role: 'group', 'aria-label': T('Filter questions') });
    const list = h('div', { class: 'qd-list' });
    let active = 'all';
    const defs = [{ key: 'all', label: T('All'), n: record.answers.length }].concat(QE.CATEGORIES.map(function (c) {
      return { key: c, label: T(QE.LABELS[c]), n: record[c] };
    }));
    function drawList() {
      clear(list);
      const rows = record.answers.filter(function (a) { return active === 'all' || a.result === active; });
      if (!rows.length) { list.appendChild(h('p', { class: 'empty-note', text: T('Nothing here.') })); return; }
      rows.forEach(function (a) {
        const main = [
          h('span', { class: 'qd-expected', text: a.expected }),
          h('span', { class: 'qd-prompt', dir: 'auto', text: a.prompt })
        ];
        if (a.userAnswer && a.result !== 'correct') main.push(h('span', { class: 'qd-yours' }, [h('span', { class: 'text-muted', text: T('You wrote: ') }), a.userAnswer]));
        list.appendChild(h('div', { class: 'qd-row qd-' + a.result }, [
          h('span', { class: 'qd-badge', title: T(QE.LABELS[a.result]), 'aria-label': T(QE.LABELS[a.result]) }, [icon(RESULT_ICONS[a.result])]),
          h('div', { class: 'qd-main' }, main),
          h('span', { class: 'qd-points', text: pointsText(a.score) })
        ]));
      });
    }
    defs.forEach(function (d) {
      const b = h('button', {
        type: 'button', class: 'details-filter' + (d.key === active ? ' active' : ''),
        'aria-pressed': d.key === active ? 'true' : 'false',
        onclick: function () {
          active = d.key;
          filters.querySelectorAll('.details-filter').forEach(function (x) {
            const on = x.dataset.key === active;
            x.classList.toggle('active', on); x.setAttribute('aria-pressed', on ? 'true' : 'false');
          });
          drawList();
        }
      }, [h('span', { text: d.label }), h('span', { class: 'details-filter-count', text: String(d.n) })]);
      b.dataset.key = d.key;
      if (d.key !== 'all' && d.n === 0) b.classList.add('is-empty');
      filters.appendChild(b);
    });
    panel.appendChild(filters);
    panel.appendChild(list);
    drawList();
  }

  function renderQuizFinished(record) {
    route = { screen: 'quiz-result', record: record };
    clear(el.screen);
    el.screen.appendChild(h('header', { class: 'app-header' }, [
      h('div', {}, [
        h('h1', { class: 'title-lg', text: T('Quiz results') }),
        h('p', { class: 'text-muted', text: modeLabel(record) + ' \u00B7 ' + contextLabel(record) })
      ])
    ]));
    el.screen.appendChild(renderQuizResultView(record));
    el.screen.appendChild(h('div', { class: 'result-actions' }, [
      h('button', { class: 'btn btn-primary', onclick: renderHome }, [icon('house'), h('span', { text: T('Back to home') })]),
      h('button', { class: 'btn btn-secondary', onclick: renderHistory }, [icon('history'), h('span', { text: T('Quiz History') })])
    ]));
    showNav('home');
  }

  /* ================= Quiz History (its own tab) ================= */
  function renderHistoryItem(rec) {
    const counts = h('div', { class: 'qh-counts' });
    QE.CATEGORIES.forEach(function (c) {
      counts.appendChild(h('span', { class: 'qh-count qh-count-' + c, title: T(QE.LABELS[c]) + ': ' + rec[c], 'aria-label': T(QE.LABELS[c]) + ' ' + rec[c] }, [icon(RESULT_ICONS[c]), h('span', { text: String(rec[c]) })]));
    });
    return h('button', {
      type: 'button', class: 'qh-item',
      'aria-label': modeLabel(rec) + ', ' + contextLabel(rec) + ', ' + T('Score ') + QE.formatScore(rec.score) + ' / ' + QE.formatScore(rec.maxScore),
      onclick: function () { renderQuizDetail(rec.id); }
    }, [
      h('div', { class: 'qh-top' }, [
        h('div', { class: 'qh-title' }, [
          h('span', { class: 'qh-mode', text: modeLabel(rec) }),
          h('span', { class: 'qh-context', text: contextLabel(rec) })
        ]),
        h('div', { class: 'qh-score' }, [
          h('span', { class: 'qh-score-value', text: QE.formatScore(rec.score) }),
          h('span', { class: 'qh-score-max', text: ' / ' + QE.formatScore(rec.maxScore) })
        ])
      ]),
      h('div', { class: 'qh-meta' }, [
        h('span', { class: 'qh-pct', text: QE.formatPercent(rec.percentage) }),
        h('span', { class: 'qh-dot', text: '\u00B7', 'aria-hidden': 'true' }),
        h('span', { class: 'qh-duration' }, [icon('timer'), h('span', { text: rec.durationSeconds != null ? QE.formatClock(rec.durationSeconds) : '\u2014' })]),
        h('span', { class: 'qh-date', text: dateLabel(rec.ts) })
      ]),
      counts,
      icon('chevron-right', 'qh-chevron')
    ]);
  }

  function renderHistory() {
    route = { screen: 'history' };
    clear(el.screen);
    el.screen.appendChild(h('header', { class: 'app-header' }, [
      h('div', {}, [
        h('h1', { class: 'title-lg', text: T('Quiz History') }),
        h('p', { class: 'text-muted', text: T('Your last 40 quizzes, newest first') })
      ])
    ]));
    const records = UX.getQuizHistory().reverse();
    if (!records.length) {
      el.screen.appendChild(h('div', { class: 'card history-empty' }, [
        icon('history', 'history-empty-icon'),
        h('p', { class: 'empty-note', text: T('No quizzes yet. Finish a quiz and it will appear here.') })
      ]));
    } else {
      const list = h('div', { class: 'quiz-history-list' });
      records.forEach(function (rec) { list.appendChild(renderHistoryItem(rec)); });
      el.screen.appendChild(list);
    }
    showNav('history');
  }

  // Reopening a past quiz — same view as right after finishing it.
  function renderQuizDetail(recordId) {
    const record = UX.getQuizRecord(recordId);
    if (!record) { renderHistory(); return; }
    route = { screen: 'quiz-detail', recordId: recordId };
    clear(el.screen);
    el.screen.appendChild(h('header', { class: 'app-header' }, [
      h('button', { class: 'icon-btn back-btn', 'aria-label': T('Back to Quiz History'), onclick: renderHistory }, [icon('arrow-left')]),
      h('div', {}, [
        h('h1', { class: 'title-lg', text: modeLabel(record) }),
        h('p', { class: 'text-muted', text: contextLabel(record) + ' \u00B7 ' + dateLabel(record.ts) })
      ])
    ]));
    el.screen.appendChild(renderQuizResultView(record));
    showNav('history');
  }

  /* ================= Info =================
     Part-of-speech reference + the owner's study method + a small footer credit. */

  /* ---------- Study method ----------
     The text below is the OWNER'S OWN wording, in his own Egyptian-Arabic
     style. It is shown word for word — never rewritten, shortened or
     "formalised". Only its presentation is organised: paragraphs, transition
     lines, example lines, and highlighted phrases. The markup tokens wrap
     phrases that are already in the text (they add no words):
       {y|…} {g|…} {v|…} {p|…}  highlighter chips: yellow / green / purple / pink.
                                The colors are only for the eye — a color never
                                carries a meaning by itself (see the note in the
                                legend: don't reuse a color for different ideas).
       {pb|…} {pr|…} {pk|…}      the PEN colors named in the text (blue / red / black):
                                coloured ink on the word, no highlighter background,
                                so pens and highlighters can't be confused.
       {s1|…} {s2|…}            the two parts of a split word (two different chips)
     Block kinds: lead (intro) · p (paragraph) · t (transition line) ·
     ex / exen (example sentence, Arabic / English) · aside (side remark). */
  const STUDY_METHOD = [
    { k: 'lead', x: 'دي بعض طرق المذاكرة و الي حابب يجربها اهي قدامه' },
    { k: 'p', x: 'هات ورقة و أقلام ({pr|أحمر} - {pk|أسود} - {pb|أزرق}) لي بقى الكلمة السهلة و دي هتحفظها باللون {pb|الأزرق} عادي هتكتب {y|3 كلمات عربي} و تبدأ تقرأ النطق و تكتب اول ما توصل للصعبة أكتبها باللون {pr|الأحمر} علشان تكون مميزة' },
    { k: 'p', x: 'و بعديها اكتبها جنبها او تحتها مرتين بـ شكل مقاطع كل مقطع لوحده زي مثلا كلمة (Individuals) هتكتب {s1|indivi} بلون و {s2|duals} بلون مختلف جمب بعض و كررها مرتين مثلا' },
    { k: 'p', x: 'و بعديها احفظ {v|3 مجاميع او 4 مجاميع} بالشكل ده بس بعد ما تحفظ ريح عقلك {v|5 دقايق} مش اكتر ولا أقل من كدة' },
    { k: 'p', x: 'و بعديها تجيب بعدها {p|ورقة فاضية} و تبدأ تكتب العربي كله مرة واحدة مثلا هيكونوا 18 كلمة او 24 ع حسب عدد المجاميع الي حفظتها و تبدأ بقى {g|تسمع ل نفسك} طبيعي اول مرة هتنسى نطق كلمة او اتنين و م هتعرف تكتب بعد ما تصحح {g|تسمع تاني} و تخبي الي سمعته القديم و اختبر نفسك تاني' },
    { k: 'p', x: 'و بعد ما تسمع لو لقيت كلمات غلط علم عليها ب قلم {p|Highlight} يكون واضح قدامك و علم برضو ع الكلمة من {p|زر الـمراجعة} الي تحت كل كلمة و ابدأ احفظ 3 او 4 مجاميع تاني و سمعهم لوحدهم برضو و لما تخلص تسميع و تعلم ع الي غلطت فيه بنفس الطريقة {g|تدخل كويز} ع المجاميع الي حفظتها كلها' },
    { k: 'p', x: 'بس قبل الكويز تعمل {g|مراجعة سريعة نطق} للكلمة و اختبر نفسك و امشي هكذا ع الطريقة دي' },
    { k: 't', x: 'طب لو لقيت نفسك ف بعض الكلمات بتنسى المعنى؟ تعمل اي ؟..' },
    { k: 'p', x: 'تبدأ تجيب الكلمة دي و تحطها فـ جملة بالعربي الاول زي مثلا:' },
    { k: 'ex', x: '(أنا ابدأ بلعب الكرة)' },
    { k: 'p', x: 'فـ هتكتبها:' },
    { k: 'exen', x: "(I'm kick off playing ball)" },
    { k: 'aside', x: 'هو مجرد مثال حتى لو غلط بفهمكم بس 🙄' },
    { k: 'p', x: 'و بعديها تختبر نفسك اختبار صغير تاني من الموقع بـ كويز ع الكلمات الي حددتها' },
    { k: 'p', x: 'و {v|قسم الحفظ على 4 أيام} و لو حفظت فـ اقل من 4 ايام هيكون احسن بكتير جدا' },
    { k: 't', x: 'يعني طب نراجع ازاي؟...' },
    { k: 'p', x: 'هنبدأ نجيب الكلمة {y|نخبي العربي} و نقرأ انجليزي و نشوف افتكرتها بالعربي ولا لأ' },
    { k: 'p', x: 'و بعد ما تخلص اعكس {y|خبي الانجليزي} و شوف هتفتكرها ولا لأ' },
    { k: 'p', x: 'لو افتكرتها و نطقت صح تبقى تمام' },
    { k: 't', x: 'طب لو مش فاكرها؟..' },
    { k: 'p', x: '{y|حطها فـ جملة عربي و انجليزي} برضو فـ الكراسة و اعمل عليها {p|Highlight} برضو بس لون مختلف و ابدأ {y|قسمها لـ مقاطع} و اقرأها علطول' },
    { k: 'p', x: 'و بس كدة يعني دي افضل طريقة ممكن تحفظ بيها الكلمات' },
    { k: 'p', x: 'و طبعا كل شخص بيختلف عن التاني ف الطريقة فـ م مجبر تحفظ بنفس الطريقة لو عندك طريقة بتريحك فـ الحفظ اعملها المهم ان احنا رتبنا ليك الكلمات و سهلناها عليك بشكل كبير جدا عن الأول..' }
  ];
  // The owner's note under the legend — his own words, kept exactly.
  const HL_NOTE = 'لا تستخدم نفس أو ألوانًا متشابهة بشكل متكرر لمفاهيم مختلفة، لأن ذلك قد يجعل العقل يخلط بينها. مثال: إذا كنت تستخدم القلم الأحمر للكلمات الصعبة، فمن الأفضل ألا تستخدم Highlighter أحمر لنفس الكلمات. استخدم مثلًا الأصفر أو الأخضر أو البنفسجي بدلًا منه.';
  const HL_CLASS = { y: 'hl hl-yellow', g: 'hl hl-green', v: 'hl hl-purple', p: 'hl hl-pink', pb: 'pen pen-blue', pr: 'pen pen-red', pk: 'pen pen-black', s1: 'hl hl-yellow hl-syl', s2: 'hl hl-purple hl-syl' };

  // Adds `text` to `parent`, turning {tag|phrase} tokens into highlight chips.
  function appendRich(parent, text) {
    const re = /\{(y|g|v|p|pb|pr|pk|s1|s2)\|([^}]*)\}/g;
    let last = 0, m;
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) parent.appendChild(document.createTextNode(text.slice(last, m.index)));
      const chip = h('span', { class: HL_CLASS[m[1]], text: m[2] });
      if (m[1] === 's1' || m[1] === 's2') chip.setAttribute('dir', 'ltr'); // a Latin syllable inside the Arabic line
      parent.appendChild(chip);
      last = m.index + m[0].length;
    }
    if (last < text.length) parent.appendChild(document.createTextNode(text.slice(last)));
    return parent;
  }

  function cardTitle(iconName, text) {
    return h('h2', { class: 'info-card-title' }, [h('span', { class: 'card-title-icon', 'aria-hidden': 'true' }, [icon(iconName)]), h('span', { text: text })]);
  }

  // Study Method: the text is unchanged — only its presentation. No outer container:
  // a section heading, the lead as its own callout card, then each stage as an
  // independent card (they flow into columns when there is room). Steps are rows with a
  // designed, palette-coordinated number badge (CSS counter) — not a default list.
  function renderStudyMethod() {
    const stages = [];
    let stage = null, steps = null, last = null, lead = null;
    function openStage(title) {
      stage = h('section', { class: 'card study-stage' });
      if (title) stage.appendChild(appendRich(h('h3', { class: 'study-transition', dir: 'rtl', lang: 'ar' }), title));
      steps = h('ol', { class: 'study-steps', dir: 'rtl', lang: 'ar' });
      stage.appendChild(steps);
      stages.push(stage);
      last = null;
    }
    STUDY_METHOD.forEach(function (b) {
      if (b.k === 'lead') { lead = appendRich(h('p', { class: 'study-lead' }), b.x); return; }
      if (b.k === 't') { openStage(b.x); return; }
      if (!stage) openStage(null);
      if (b.k === 'p') {
        last = h('li', { class: 'study-step' }, [appendRich(h('p', { class: 'study-p' }), b.x)]);
        steps.appendChild(last);
        return;
      }
      const attrs = { class: b.k === 'aside' ? 'study-aside' : (b.k === 'exen' ? 'study-example study-example-en' : 'study-example') };
      if (b.k === 'exen') { attrs.dir = 'ltr'; attrs.lang = 'en'; }
      const node = appendRich(h('p', attrs), b.x);
      if (last) last.appendChild(node); else steps.appendChild(h('li', { class: 'study-step' }, [node]));
    });
    const kids = [h('h2', { class: 'section-heading' }, [
      h('span', { class: 'card-title-icon', 'aria-hidden': 'true' }, [icon('notebook-text')]), h('span', { text: T('Study method') })
    ])];
    if (lead) kids.push(h('div', { class: 'card study-lead-card', dir: 'rtl', lang: 'ar' }, [lead]));
    kids.push(h('div', { class: 'study-grid masonry' }, stages));
    // The educational note (the highlighter-colour legend/selector was removed).
    kids.push(h('div', { class: 'card study-note-card', dir: 'rtl', lang: 'ar' }, [h('p', { class: 'hl-note', text: HL_NOTE })]));
    return h('section', { class: 'study-section', 'aria-label': T('Study method') }, kids);
  }

  function renderInfo() {
    route = { screen: 'info' };
    clear(el.screen);
    const page = h('div', { class: 'info-page' });
    page.appendChild(h('header', { class: 'app-header' }, [h('h1', { class: 'title-lg', text: T('Info') })]));

    const card = h('section', { class: 'card info-card pos-card-wrap' });
    card.appendChild(cardTitle('tag', T('Parts of speech')));
    card.appendChild(h('p', { class: 'text-muted info-card-intro', text: T('Every word has a tag such as n. or v. next to it. It tells you what job the word does in a sentence. Each tag has its own color.') }));
    const list = h('ul', { class: 'pos-list pos-grid' });
    POS_INFO.forEach(function (p) {
      const cat = p.tag === 'other' ? 'other' : posCategory(p.tag);
      const body = [
        h('div', { class: 'pos-item-name', text: T(p.name) }),
        h('p', { class: 'pos-item-text', text: T(p.text) })
      ];
      if (p.example) body.push(h('p', { class: 'pos-item-example' }, [h('span', { class: 'text-muted', text: T('Examples: ') }), p.example]));
      list.appendChild(h('li', { class: 'pos-item' }, [
        h('span', { class: 'pos-badge pos-' + cat + ' pos-badge-lg', text: p.tag === 'other' ? T('Other') : p.tag.charAt(0).toUpperCase() + p.tag.slice(1) }),
        h('div', { class: 'pos-item-body' }, body)
      ]));
    });
    card.appendChild(list);
    card.appendChild(h('p', { class: 'text-muted pos-note', text: T('Some words have two tags separated by a slash, such as n./v. That means the word can work as either one.') }));
    // Version, changelog and the purpose of the site live in JavaScript/pages.js.
    if (global.UI && global.UI.buildAbout) page.appendChild(global.UI.buildAbout());
    page.appendChild(renderStudyMethod());   // Study Method
    page.appendChild(card);                  // Parts of Speech

    page.appendChild(h('footer', { class: 'info-footer' }, [
      h('p', { class: 'info-copyright', text: T('\u00A9 2026 Mohamed & Anas. All rights reserved.') }),
      h('p', { class: 'info-terms', text: T('The original code, design and content of E.English belong to their credited authors. Copying, republishing, reusing them, or presenting them as your own work requires the authors\u2019 permission, to the extent permitted by applicable law.') })
    ]));
    el.screen.appendChild(page);
    showNav('info');
  }

  /* ================= Navigation / boot ================= */
  function navigateToWord(wordId) {
    const loc = UX.resolveWordLocation(wordId);
    if (loc) renderLesson(loc.unit, loc.lessonKey, { focusWordId: wordId });
  }

  function init() {
    el.screen = document.getElementById('screen-container');
    el.nav = document.getElementById('bottom-nav');
    el.sideNav = document.getElementById('side-nav');   // (none any more: one floating bar at every width)
    el.themeBtn = document.getElementById('theme-toggle-btn');
    el.langBtn = document.getElementById('lang-toggle-btn');

    wireNav(el.nav);
    setupMore();
    setupNavIndicator();
    setupScreenMotion();
    setupAwakeButton();

    // Theme: applied at boot from the persisted preference (light / dark /
    // system), then driven by the 'theme-changed' event. UX emits that event
    // on every preference change AND, while the preference is 'system',
    // whenever the OS/browser theme flips — no reload needed.
    applyTheme(UX.getTheme());
    applyThemeColor(UX.getThemeColor());
    document.documentElement.setAttribute('lang', UX.getLanguage());
    document.documentElement.setAttribute('dir', UX.getLanguage() === 'ar' ? 'rtl' : 'ltr');
    if (el.themeBtn) {
      el.themeBtn.addEventListener('click', function () {
        const pref = UX.getThemePreference();
        UX.setTheme(THEME_CYCLE[(THEME_CYCLE.indexOf(pref) + 1) % THEME_CYCLE.length]);
      });
    }
    if (el.langBtn) el.langBtn.addEventListener('click', function () { UX.setLanguage(UX.getLanguage() === 'ar' ? 'en' : 'ar'); });
    // Animations: one attribute on <html>; CSS removes every transition/animation
    // when it is "off". (The device's reduced-motion setting is honoured in CSS too.)
    function applyMotion() { document.documentElement.setAttribute('data-motion', UX.getAnimationsEnabled() ? 'on' : 'off'); }
    applyMotion();
    UX.on('animations-changed', applyMotion);
    // While a text field has focus the on-screen keyboard takes the bottom of the
    // screen: hide the floating bars so they never sit on top of what is typed.
    document.addEventListener('focusin', function (e) {
      if (e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName) && e.target.type !== 'checkbox' && e.target.type !== 'file') document.body.classList.add('kbd-open');
    });
    document.addEventListener('focusout', function () { document.body.classList.remove('kbd-open'); });
    UX.on('theme-preference-changed', syncThemeButton);
    // Colors fade briefly when the theme or palette changes (only while Animations are on).
    let fadeTimer = null;
    function pulseThemeFade() {
      const reduce = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (!UX.getAnimationsEnabled() || reduce) return;
      document.documentElement.classList.add('theme-fade');
      clearTimeout(fadeTimer);
      fadeTimer = setTimeout(function () { document.documentElement.classList.remove('theme-fade'); }, 340);
    }
    UX.on('theme-changed', function (t) { pulseThemeFade(); applyTheme(t); });
    UX.on('theme-color-changed', function (c) { pulseThemeFade(); applyThemeColor(c); });
    applyFontMode(UX.getFontMode());
    UX.on('font-mode-changed', applyFontMode);

    UX.on('content-ready', renderHome);
    UX.on('content-load-blocked', renderLoadBlocked);

    // Live updates: patch only the DOM affected by this change — never a
    // full-screen rebuild — so scroll position, open/closed groups, and
    // input focus are never disturbed by toggling a checkbox.
    UX.on('state-changed', function () {
      if (route.screen === 'lesson') refreshWordStates();
      else if (route.screen === 'statistics') refreshStatsLive();
      else if (route.screen === 'home') refreshUnitProgress();
    });
    // Import / delete-all replace the whole learning state: redraw whatever
    // screen is open from the new state (Settings redraws itself).
    function rerenderCurrent() {
      if (route.screen === 'home') renderHome();
      else if (route.screen === 'lesson') renderLesson(route.unit, route.lessonKey);
      else if (route.screen === 'statistics') renderStatistics();
      else if (route.screen === 'history') renderHistory();
      else if (route.screen === 'unit') renderUnit(route.unit);
    }
    // Language switch: translate the fixed labels, then redraw the open screen from
    // the same state (a running quiz is never redrawn — the switcher is hidden then).
    function applyLanguage() {
      const lang = UX.getLanguage();
      document.documentElement.setAttribute('lang', lang);
      document.documentElement.setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
      eachNav(function (n) {
        n.querySelectorAll('.nav-btn').forEach(function (b) {
          const sp = b.querySelector('span');
          if (!sp || !b.dataset.nav) { if (sp && b === moreBtn) sp.textContent = T('More'); return; }
          if (!sp.dataset.en) sp.dataset.en = sp.textContent;
          sp.textContent = T(sp.dataset.en);
          b.setAttribute('aria-label', T(b.dataset.nav === 'history' ? 'Quiz History' : sp.dataset.en));
        });
      });
      syncThemeButton();
      syncLangButton();
      syncAwakeButton();
      layoutNav();
    }
    function syncLangButton() {
      if (!el.langBtn) return;
      const lang = UX.getLanguage();
      el.langBtn.textContent = lang === 'ar' ? 'EN' : '\u0639';
      el.langBtn.setAttribute('lang', lang === 'ar' ? 'en' : 'ar');
      el.langBtn.setAttribute('title', lang === 'ar' ? 'English' : '\u0627\u0644\u0639\u0631\u0628\u064A\u0629');
      el.langBtn.setAttribute('aria-label', lang === 'ar' ? 'Switch to English' : '\u0627\u0644\u062A\u0628\u062F\u064A\u0644 \u0625\u0644\u0649 \u0627\u0644\u0639\u0631\u0628\u064A\u0629');
    }
    function rerenderForLanguage() {
      applyLanguage();
      const r = route;
      if (r.screen === 'settings' && global.UI.renderSettings) global.UI.renderSettings();
      else if (r.screen === 'info') renderInfo();
      else if (r.screen === 'readme' && global.UI.renderReadme) global.UI.renderReadme();
      else if (r.screen === 'feedback' && global.UI.renderFeedback) global.UI.renderFeedback();
      else if (r.screen === 'quiz-result' && r.record) renderQuizFinished(r.record);
      else if (r.screen === 'quiz-detail' && r.recordId) renderQuizDetail(r.recordId);
      else if (r.screen === 'load-blocked') renderLoadBlocked();
      else if (r.screen === 'quiz') { /* never redrawn mid-quiz */ }
      else rerenderCurrent();
    }
    UX.on('language-changed', rerenderForLanguage);
    UX.on('data-imported', rerenderCurrent);
    UX.on('data-reset', rerenderCurrent);

    UX.on('quiz-tick', updateQuizTimer);
    UX.on('quiz-question', function () { if (route.screen === 'quiz') { renderQuizStage(true); refreshQuizIndicators(); } });
    UX.on('quiz-overview', function () { if (route.screen === 'quiz') refreshQuizIndicators(); });
    UX.on('quiz-finished', renderQuizFinished);
    UX.on('search-results', renderSearchResults);

    applyLanguage();
    renderSkeleton();
    UX.loadAll();
    // Notice a different model version on the server (newer OR older) and
    // refresh onto it, with the refreshTimes anti-loop guard (see ux.js).
    UX.startUpdateWatcher();
  }

  global.UI = {
    init: init,
    renderHome: renderHome,
    renderInfo: renderInfo,
    studyMethod: STUDY_METHOD,
    posCategory: posCategory,
    posInfo: POS_INFO,
    renderUnit: renderUnit,
    renderLesson: renderLesson,
    renderStatistics: renderStatistics,
    renderHistory: renderHistory,
    renderQuizDetail: renderQuizDetail,
    renderQuiz: renderQuiz,
    navigateToWord: navigateToWord,
    showNav: showNav,
    // Lets the other screen modules (Settings, README) tell the router which
    // screen is open, so live-refresh handlers never redraw a different one.
    setRoute: function (r) { route = r; }
  };
})(window);
