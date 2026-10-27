/* ux.js — Pure logic / state / behavior layer. NO DOM access.
   Single source of truth for learning state (known words, review state,
   quiz history) and for the event bus every screen listens to. */
(function (global) {
  'use strict';

  /* ---------------- Event Bus ---------------- */
  const listeners = {};
  function on(eventName, cb) {
    if (!listeners[eventName]) listeners[eventName] = [];
    listeners[eventName].push(cb);
  }
  function off(eventName, fn) {
    const arr = listeners[eventName];
    if (!arr) return;
    const i = arr.indexOf(fn);
    if (i !== -1) arr.splice(i, 1);
  }
  function emit(eventName, data) {
    const arr = listeners[eventName];
    if (!arr) return;
    for (let i = 0; i < arr.length; i++) {
      try { arr[i](data); } catch (e) { console.error(e); }
    }
  }

  /* ---------------- Storage Keys ---------------- */
  const LS_KEYS = {
    known: 'eenglish.known',
    manualReview: 'eenglish.manualReview',
    autoReview: 'eenglish.autoReview',
    quizHistory: 'eenglish.quizHistory',
    theme: 'eenglish.theme',
    themeColor: 'eenglish.themeColor',
    keepAwake: 'eenglish.keepAwake',
    fontMode: 'eenglish.fontMode',
    lang: 'eenglish.lang',
    animations: 'eenglish.animations'
  };
  // Font style (Settings): 'o2' = headings Bold + body Regular (default), 'regular', 'bold'.
  const FONT_MODES = ['o2', 'regular', 'bold'];
  const DEFAULT_FONT_MODE = 'o2';
  // Selectable accents (see CSS/root.css): 6 + the neutral Default = 7 choices.
  // "default" is not a palette — it means "no accent picked".
  const THEME_COLORS = ['burgundy', 'lavender', 'sky', 'lime', 'orange', 'teal'];
  // Palettes offered by earlier versions. They are NOT selectable any more, but a
  // saved one is never deleted or remapped: it keeps rendering (its CSS is kept)
  // until the person picks one of the choices above.
  const RETIRED_COLORS = ['midnight', 'plum', 'petrol', 'umber', 'rose', 'sand'];
  const DEFAULT_COLOR = 'default';
  // Accent names saved by earlier versions → nearest new palette (or the
  // default look). Green no longer exists in any form.
  const LEGACY_COLOR_MAP = { blue: 'midnight', purple: 'plum', teal: 'petrol', orange: 'umber', lemon: 'sand', red: 'rose', gray: null, green: null };
  function normalizeColor(c) {
    if (THEME_COLORS.indexOf(c) !== -1 || RETIRED_COLORS.indexOf(c) !== -1) return c;
    if (Object.prototype.hasOwnProperty.call(LEGACY_COLOR_MAP, c)) return LEGACY_COLOR_MAP[c];
    return null; // unknown / removed → default look
  }
  const THEME_PREFS = ['light', 'dark', 'system'];

  function readLS(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }
  function writeLS(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
  }

  /* ---------------- App version / cache migration ----------------
     Two storage worlds, kept strictly apart:

       APP layer  (safe to invalidate)   Cache Storage entries named
                                         "e-english-*" + ONE small marker
                                         key, 'eenglish.app'.
       USER layer (never touched here)   everything in LS_KEYS below:
                                         known words, manual/auto review,
                                         quiz history, theme, accent, ...

     The marker is deliberately NOT in LS_KEYS, so export/import/"delete
     all data" never see it, and this section never reads or writes any
     LS_KEYS entry. There is no clear-all anywhere: cleanup is limited to
     Cache Storage entries with our own prefix.

     On startup, if the stored version differs from EE_MODEL_VERSION
     (JavaScript/version.js) — in ANY direction, 5→6, 6→7 or 8→6 — the old
     app caches are dropped and the marker is updated. The current
     version's cache (if present) keeps its app shell but loses its cached
     lesson content, so content is always re-fetched fresh after a change. */
  const APP_META_KEY = 'eenglish.app';
  // Two DIFFERENT numbers (see version.js): the app release and the JavaScript
  // loading revision. Either one changing means "start from fresh caches".
  const CURRENT_VERSION = String(global.EE_MODEL_VERSION || '');
  const CURRENT_JS = String(global.EE_JS_VERSION || '');
  const CURRENT_SIGNATURE = CURRENT_VERSION + '|' + CURRENT_JS;   // what "the code running right now" is
  const CACHE_PREFIX = global.EE_CACHE_PREFIX || 'e-english-';
  const CACHE_NAME = global.EE_CACHE_NAME || (CACHE_PREFIX + 'v' + CURRENT_VERSION + (CURRENT_JS ? '-js' + CURRENT_JS : ''));
  const versionInfo = { current: CURRENT_VERSION, js: CURRENT_JS, previous: null, previousJs: null, changed: false };

  function readAppMeta() {
    const m = readLS(APP_META_KEY, null);
    if (!m || typeof m !== 'object' || Array.isArray(m)) return { version: null, js: null, history: [] };
    return {
      version: typeof m.version === 'string' ? m.version : null,
      js: typeof m.js === 'string' ? m.js : null,       // markers saved before the JS loading version existed have none
      history: Array.isArray(m.history) ? m.history.slice(-10) : []
    };
  }
  function isContentRequest(req) {
    let path = '';
    try { path = new URL(req.url).pathname; } catch (e) { return false; }
    return path.indexOf('/Files/') !== -1 || /\/app\.json$/.test(path);
  }
  function invalidateAppCaches() {
    if (!global.caches || !global.caches.keys) return Promise.resolve();
    return global.caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k.indexOf(CACHE_PREFIX) === 0; }).map(function (k) {
        if (k !== CACHE_NAME) return global.caches.delete(k); // another version's cache: gone
        return global.caches.open(k).then(function (cache) { // same-named cache: drop only its content entries
          return cache.keys().then(function (reqs) {
            return Promise.all(reqs.filter(isContentRequest).map(function (r) { return cache.delete(r); }));
          });
        });
      }));
    }).catch(function () {});
  }
  // Resolves true when the version changed (caches were invalidated).
  function migrateAppVersion() {
    if (!CURRENT_VERSION) return Promise.resolve(false);
    const meta = readAppMeta();
    versionInfo.previous = meta.version;
    versionInfo.previousJs = meta.js;
    if (meta.version === CURRENT_VERSION && meta.js === CURRENT_JS) return Promise.resolve(false);
    return invalidateAppCaches().then(function () {
      // Only real transitions are recorded. A missing marker means either a
      // first run or an app older than versioning — the previous version is
      // unknown, so nothing is invented for it.
      const history = meta.version !== null
        ? meta.history.concat([{ from: meta.version, to: CURRENT_VERSION, fromJs: meta.js, toJs: CURRENT_JS, at: Date.now() }]).slice(-10)
        : meta.history;
      writeLS(APP_META_KEY, { version: CURRENT_VERSION, js: CURRENT_JS, history: history });
      versionInfo.changed = true;
      return true;
    });
  }

  /* ---------------- Quiz engine + saved history ----------------
     All quiz LOGIC (duration, selection, answer checking, scoring, result
     records) lives in JavaScript/quiz-engine.js, loaded before this file.
     ux.js only keeps the state, saves history and updates Review. */
  const Engine = global.QuizEngine;
  if (!Engine) console.error('[e.english] quiz-engine.js did not load — quizzes are unavailable.');
  const QUIZ_HISTORY_LIMIT = 40;
  // Every stored record is upgraded to the current shape (and malformed ones
  // dropped). Each record is a self-contained snapshot, so it never depends
  // on the lesson files again.
  function normalizeHistory(list) {
    const out = [];
    (Array.isArray(list) ? list : []).forEach(function (rec, i) {
      const n = Engine ? Engine.normalizeRecord(rec, i) : null;
      if (n) out.push(n);
    });
    return out.slice(-QUIZ_HISTORY_LIMIT);
  }

  /* ---------------- State ---------------- */
  const state = {
    units: [],
    known: readLS(LS_KEYS.known, {}),
    manualReview: readLS(LS_KEYS.manualReview, {}),
    autoReview: readLS(LS_KEYS.autoReview, {}),
    quizHistory: normalizeHistory(readLS(LS_KEYS.quizHistory, [])),
    currentScreen: 'home',
    quiz: null,
    searchIndex: [],
    lastSearchQuery: '',
    // Sections whose file was listed in app.json but failed to load —
    // kept so the UI can show "this section didn't load" instead of
    // just silently omitting it (parsed from the filename itself, which
    // doesn't require the fetch to have succeeded).
    missingSections: [],
    freshLoad: false, // true for the load right after a version change → bypass the HTTP cache
    theme: readLS(LS_KEYS.theme, null), // 'light' | 'dark' | 'system' | null (null behaves as 'system')
    themeColor: normalizeColor(readLS(LS_KEYS.themeColor, null)),
    keepAwake: readLS(LS_KEYS.keepAwake, false),
    fontMode: readLS(LS_KEYS.fontMode, null),
    lang: readLS(LS_KEYS.lang, null),  // 'en' | 'ar' | null (null behaves as 'en')
    animations: readLS(LS_KEYS.animations, null)   // false = animations switched off; null/true = on
  };
  // History saved by an earlier version is upgraded once, in storage too.
  (function migrateQuizHistory() {
    const raw = readLS(LS_KEYS.quizHistory, []);
    if (JSON.stringify(raw) !== JSON.stringify(state.quizHistory)) writeLS(LS_KEYS.quizHistory, state.quizHistory);
  })();
  // An accent saved by an earlier version (green, blue, ...) is mapped to its
  // nearest new palette (or the default look) once, and the stored value updated.
  (function migrateStoredColor() {
    const raw = readLS(LS_KEYS.themeColor, null);
    if (raw === null || raw === state.themeColor) return;
    if (state.themeColor) writeLS(LS_KEYS.themeColor, state.themeColor);
    else { try { localStorage.removeItem(LS_KEYS.themeColor); } catch (e) {} }
  })();

  /* ---------------- Word ID ----------------
     Data Contract: a word's identity is (unit, lesson-pair, section type,
     the word text itself) — NEVER its group index or position inside the
     file. So you can move a
     word to a different group, or reorder groups/words freely in the .md
     file, and its saved progress (known / review / quiz history) stays
     attached to it. Only renaming the word text, or moving it to a
     different unit/lesson/section, creates a "new" word — which is
     correct, since at that point it IS a different vocabulary entry.
     Duplicate words inside the same unit/lesson/section (rare) are
     disambiguated with a stable occurrence counter based on first-seen
     order, tracked per-doc by buildUnits below. */
  function slugifyWord(word) {
    return String(word || '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'w';
  }
  function makeWordId(doc, occurrenceIndex, word) {
    const base = 'u' + doc.unit + '_l' + doc.lessons.join('-') + '_' + doc.type + '_' + slugifyWord(word);
    return occurrenceIndex > 0 ? base + '-' + (occurrenceIndex + 1) : base;
  }

  /* ---------------- Filename Parser ----------------
     Current/expected format — ONE file per unit+lesson-pair, containing
     every section (Vocabulary, Synonyms & Antonyms, Idioms, Derivatives...)
     inside it, split by "## " headers (see parseMultiSectionMd):
       U{UNIT}-L{LESSON1}(-{LESSON2})?.md
     A legacy single-section-per-file name (old v3 layout) is still
     recognized so nothing breaks if one is left in Files/:
       U{UNIT}-L{LESSON1}(-{LESSON2})?-{TYPE}.md */
  function parseFilename(name) {
    let m = name.match(/^U(\d+)-L(\d+)(?:-(\d+))?\.md$/);
    if (m) {
      const unit = parseInt(m[1], 10);
      const l1 = parseInt(m[2], 10);
      const l2 = m[3] ? parseInt(m[3], 10) : null;
      return { unit: unit, lessons: l2 ? [l1, l2] : [l1], type: null, legacy: false };
    }
    m = name.match(/^U(\d+)-L(\d+)(?:-(\d+))?-([a-zA-Z_]+)\.md$/);
    if (m) {
      const unit = parseInt(m[1], 10);
      const l1 = parseInt(m[2], 10);
      const l2 = m[3] ? parseInt(m[3], 10) : null;
      return { unit: unit, lessons: l2 ? [l1, l2] : [l1], type: m[4], legacy: true };
    }
    return null;
  }

  /* ---------------- Section type normalization ----------------
     Maps a "## Section Title" heading (English, plus the legacy Arabic
     spellings older content files may still use — parser compatibility
     only, never displayed) to the internal type key the rest of the app already
     keys off of (SECTION_META in ui.js). Anything unrecognized still
     works — it just falls back to a slug of the title itself, and ui.js's
     sectionMeta() shows it with a generic icon/label instead of a
     specifically-styled one. */
  const SECTION_TYPE_ALIASES = {
    vocabulary: ['vocabulary', 'vocab', 'المفردات', 'مفردات'],
    synonyms_antonyms: ['synonyms & antonyms', 'synonyms and antonyms', 'synonyms_antonyms', 'synonyms-antonyms', 'synonyms antonyms', 'مرادفات ومتضادات', 'مرادفات وأضداد', 'المرادفات والمتضادات'],
    idioms: ['idioms', 'idioms & phrasal verbs', 'idioms and phrasal verbs', 'التعبيرات', 'المصطلحات', 'العبارات الاصطلاحية'],
    derivatives: ['derivatives', 'المشتقات']
  };
  function normalizeHeadingKey(title) {
    return String(title || '').toLowerCase().trim().replace(/\s+/g, ' ');
  }
  function normalizeSectionType(title) {
    const key = normalizeHeadingKey(title);
    for (const type in SECTION_TYPE_ALIASES) {
      if (SECTION_TYPE_ALIASES[type].indexOf(key) !== -1) return type;
    }
    const slug = key.replace(/[^a-z0-9\u0600-\u06FF]+/g, '_').replace(/^_+|_+$/g, '');
    return slug || 'section';
  }

  /* ---------------- MD Parser (multi-section: current format) ----------------
     "## Section Title"  -> starts a new section (Vocabulary / Synonyms &
       Antonyms / Idioms / Derivatives / ...), in the order they appear.
     "@fields: A, B"     -> extra columns for the CURRENT section only,
       reset at every new "## " section header.
     any other "#..." heading (###, ##### ...) -> starts a new Group
       inside the current section — unchanged from before.
     🟢 / 🔴 word lines  -> unchanged from before (see README). */
  function parseMultiSectionMd(content, meta) {
    const lines = content.split(/\r?\n/);
    const sections = [];
    let section = null; // { type, fields, groups }
    let currentGroup = null;

    function ensureSection() {
      if (!section) {
        section = { type: 'vocabulary', fields: [], groups: [] };
        sections.push(section);
      }
      return section;
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      if (line.indexOf('@fields:') === 0) {
        const rest = line.slice('@fields:'.length).trim();
        ensureSection().fields = rest.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
        continue;
      }

      const hashMatch = line.match(/^(#+)\s*(.*)$/);
      if (hashMatch) {
        const level = hashMatch[1].length;
        const title = hashMatch[2].trim();
        if (level === 2) {
          // New section.
          section = { type: normalizeSectionType(title), fields: [], groups: [] };
          sections.push(section);
          currentGroup = null;
        } else {
          // New group inside the current (or an implicit default) section.
          currentGroup = { title: title, words: [] };
          ensureSection().groups.push(currentGroup);
        }
        continue;
      }

      if (line.indexOf('🟢') === 0 || line.indexOf('🔴') === 0) {
        ensureSection();
        if (!currentGroup) {
          currentGroup = { title: '', words: [] };
          section.groups.push(currentGroup);
        }
        const status = line.indexOf('🟢') === 0 ? 'easy' : 'hard';
        const body = line.replace(/^(🟢|🔴)\s*/u, '').trim();
        const parts = body.split('|').map(function (p) { return p.trim(); });
        if (parts.length < 2) continue;
        let word = parts[0];
        const meaning = parts[1];
        const extrasArr = parts.slice(2);
        const extras = {};
        if (section.fields.length > 0) {
          for (let k = 0; k < section.fields.length; k++) {
            extras[section.fields[k]] = extrasArr[k] !== undefined ? extrasArr[k] : '';
          }
        } else {
          extras._raw = extrasArr;
        }
        // Part of speech: an optional "[pos]" tag stuck to the end of the
        // word itself, e.g. "waste [v.]" — stripped out here so `word`
        // stays clean everywhere else (ids, quiz answers, search...).
        let pos = null;
        const posMatch = word.match(/^(.*?)\s*\[([^\[\]]{1,12})\]\s*$/);
        if (posMatch) {
          word = posMatch[1].trim();
          pos = posMatch[2].trim();
        }
        currentGroup.words.push({ word: word, meaning: meaning, status: status, extras: extras, pos: pos });
      }
    }

    return sections.map(function (s) {
      return { unit: meta.unit, lessons: meta.lessons, type: s.type, fields: s.fields, groups: s.groups };
    });
  }

  /* ---------------- MD Parser (legacy: one type per file) ---------------- */
  function parseMd(content, meta) {
    return parseMultiSectionMd('## ' + meta.type + '\n' + content, meta)[0] ||
      { unit: meta.unit, lessons: meta.lessons, type: meta.type, fields: [], groups: [] };
  }

  /* ---------------- Build Units Tree ---------------- */
  function buildUnits(docs) {
    const unitMap = {};
    docs.forEach(function (doc) {
      if (!unitMap[doc.unit]) unitMap[doc.unit] = { unit: doc.unit, lessons: {} };
      const lessonsKey = doc.lessons.join('-');
      if (!unitMap[doc.unit].lessons[lessonsKey]) {
        unitMap[doc.unit].lessons[lessonsKey] = { lessons: doc.lessons, sections: [] };
      }
      // Tracks how many times each word text was already seen within this
      // one doc (unit+lessons+type), so a duplicate gets a stable "-2",
      // "-3"... suffix instead of colliding — see makeWordId above.
      const seenCount = {};
      unitMap[doc.unit].lessons[lessonsKey].sections.push({
        type: doc.type,
        fields: doc.fields,
        groups: doc.groups.map(function (g) {
          return {
            title: g.title,
            words: g.words.map(function (w) {
              const slug = slugifyWord(w.word);
              const occurrence = seenCount[slug] || 0;
              seenCount[slug] = occurrence + 1;
              return {
                word: w.word,
                meaning: w.meaning,
                status: w.status,
                extras: w.extras,
                pos: w.pos || null,
                wordId: makeWordId(doc, occurrence, w.word)
              };
            })
          };
        })
      });
    });

    const unitsArr = Object.keys(unitMap).map(function (k) {
      const u = unitMap[k];
      const lessonsArr = Object.keys(u.lessons).map(function (lk) { return u.lessons[lk]; });
      lessonsArr.sort(function (a, b) { return a.lessons[0] - b.lessons[0]; });
      return { unit: u.unit, lessons: lessonsArr };
    });
    unitsArr.sort(function (a, b) { return a.unit - b.unit; });
    return unitsArr;
  }

  /* ---------------- Build Search Index ---------------- */
  function buildSearchIndex() {
    const idx = [];
    state.units.forEach(function (unit) {
      unit.lessons.forEach(function (lesson) {
        lesson.sections.forEach(function (section) {
          section.groups.forEach(function (group, gi) {
            group.words.forEach(function (w) {
              idx.push({
                wordId: w.wordId, word: w.word, meaning: w.meaning, pos: w.pos || null,
                unit: unit.unit, lessons: lesson.lessons, type: section.type,
                groupIdx: gi, groupTitle: group.title
              });
            });
          });
        });
      });
    });
    state.searchIndex = idx;
  }

  /* ---------------- Loading ----------------
     Files are fetched in small throttled batches (not all at once) so a
     larger course (many units) doesn't spike CPU/RAM/startup time parsing
     everything in one synchronous burst — each batch yields back to the
     browser (via a microtask-friendly delay) before the next one starts. */
  const LOAD_BATCH_SIZE = 3;
  const LOAD_BATCH_DELAY_MS = 0; // yields a tick; kept as a named constant so it's easy to tune later
  function yieldTick() {
    return new Promise(function (resolve) {
      if (global.requestIdleCallback) global.requestIdleCallback(function () { resolve(); }, { timeout: 50 });
      else setTimeout(resolve, LOAD_BATCH_DELAY_MS);
    });
  }
  function fetchOpts() { return state.freshLoad ? { cache: 'reload' } : undefined; }
  function fetchFilesThrottled(files) {
    const results = [];
    let i = 0;
    function nextBatch() {
      const batch = files.slice(i, i + LOAD_BATCH_SIZE);
      i += LOAD_BATCH_SIZE;
      if (!batch.length) return Promise.resolve(results);
      const tasks = batch.map(function (fname) {
        return fetch('Files/' + fname, fetchOpts())
          .then(function (res) {
            if (!res.ok) throw new Error('missing');
            return res.text().then(function (txt) { return { fname: fname, text: txt }; });
          })
          .catch(function () {
            console.warn('[Warning] Missing content file:\nFiles/' + fname);
            const meta = parseFilename(fname);
            if (meta) state.missingSections.push({ unit: meta.unit, lessons: meta.lessons, type: meta.type, fname: fname });
            emit('content-file-missing', { fname: fname, meta: meta });
            return null;
          });
      });
      return Promise.all(tasks).then(function (batchResults) {
        results.push.apply(results, batchResults);
        emit('content-load-progress', { loaded: Math.min(i, files.length), total: files.length });
        return yieldTick().then(nextBatch);
      });
    }
    return nextBatch();
  }

  /* ---------------- LocalStorage ↔ content reconciliation ----------------
     Runs on every normal load (and after an import), once the content has
     loaded COMPLETELY. It makes the saved WORD-STATE match what the UI can
     show:
       • known / manualReview / autoReview: entries whose word id no longer
         exists in the content are removed (a quiz-made review entry keeps
         its stored reason: 'wrong' | 'skipped');
       • a word can't be in both review maps (manual wins, duplicate dropped).
     Quiz history is deliberately NOT pruned by word id any more: every
     history record stores its own snapshot of each question (prompt,
     expected answer, your answer, result, points), so it still shows exactly
     what happened after the lesson content changes, and its counts always
     match the rows it displays. Malformed history records are dropped.
     Valid progress is never touched. If any content file failed to load,
     the content is incomplete, so NOTHING is removed. Returns a summary. */
  function reconcileStoredData() {
    const summary = { ran: false, removed: { known: 0, manualReview: 0, autoReview: 0, quizRecords: 0 } };
    if (!state.contentComplete || !state.units.length) return summary;
    summary.ran = true;

    const validIds = {};
    state.units.forEach(function (unit) {
      unit.lessons.forEach(function (lesson) {
        lesson.sections.forEach(function (section) {
          section.groups.forEach(function (group) {
            group.words.forEach(function (w) { validIds[w.wordId] = true; });
          });
        });
      });
    });

    function cleanMap(map, name, keepReasons) {
      if (!isPlainObject(map)) return {};
      const out = {};
      Object.keys(map).forEach(function (id) {
        if (map[id] && validIds[id]) out[id] = (keepReasons && (map[id] === 'wrong' || map[id] === 'skipped' || map[id] === 'quiz')) ? map[id] : true;
        else summary.removed[name]++;
      });
      return out;
    }
    const known = cleanMap(state.known, 'known');
    const manual = cleanMap(state.manualReview, 'manualReview');
    const auto = cleanMap(state.autoReview, 'autoReview', true);
    Object.keys(auto).forEach(function (id) { if (manual[id]) { delete auto[id]; summary.removed.autoReview++; } });

    const history = normalizeHistory(state.quizHistory);
    summary.removed.quizRecords = (Array.isArray(state.quizHistory) ? state.quizHistory.length : 0) - history.length;

    const r = summary.removed;
    const historyChanged = JSON.stringify(history) !== JSON.stringify(state.quizHistory);
    const mapsChanged = r.known + r.manualReview + r.autoReview > 0;
    state.known = known; state.manualReview = manual; state.autoReview = auto; state.quizHistory = history;
    if (mapsChanged) { writeLS(LS_KEYS.known, known); persistReview(); }
    if (historyChanged) writeLS(LS_KEYS.quizHistory, history);
    summary.changed = mapsChanged || historyChanged;
    return summary;
  }

  function loadAll() {
    // Fetching Files/*.md over file:// fails silently (CORS) in every major
    // browser. Detect that up front and tell ui.js exactly why, instead of
    // leaving the app stuck on the skeleton forever.
    if (global.location && global.location.protocol === 'file:') {
      emit('content-load-blocked', { reason: 'file-protocol' });
      return Promise.resolve();
    }

    state.missingSections = [];
    state.contentComplete = false;
    // Version check FIRST: stale app/content caches must be gone before any
    // content is requested. User data is not touched by this step.
    return migrateAppVersion().then(function (changed) {
      state.freshLoad = changed;
      return fetch('app.json', fetchOpts());
    })
      .then(function (r) {
        if (!r.ok) throw new Error('app.json not found');
        return r.json();
      })
      .then(function (cfg) {
        const files = (cfg && cfg.files) || [];
        return fetchFilesThrottled(files);
      })
      .then(function (results) {
        const docs = [];
        let allParsed = true;
        results.forEach(function (r) {
          if (!r) { allParsed = false; return; }
          const meta = parseFilename(r.fname);
          if (!meta) {
            allParsed = false;
            console.warn('[Warning] Filename does not match pattern U{n}-L{n}(-{n})?.md:\n' + r.fname);
            return;
          }
          if (meta.legacy) {
            docs.push(parseMd(r.text, meta));
          } else {
            parseMultiSectionMd(r.text, meta).forEach(function (d) { docs.push(d); });
          }
        });
        state.units = buildUnits(docs);
        buildSearchIndex();
        state.contentComplete = allParsed && docs.length > 0;
        state.freshLoad = false;
        // Make stored progress match the content that actually loaded, BEFORE
        // any screen renders, so no count is ever shown for a word that can't.
        reconcileStoredData();
        emit('content-ready', { units: state.units });
      })
      .catch(function (err) {
        console.error('Load failed:', err);
        state.units = [];
        emit('content-ready', { units: [] });
      });
  }

  /* ---------------- Known / Review ----------------
     ONE canonical review state per word (its stable wordId).
     Two storage maps still exist for backward compatibility with saved
     data — manualReview ("I flagged it") and autoReview ("I got it wrong
     in a quiz") — but they are only ever changed through the functions
     below, which keep two invariants:
       1. a wordId is in AT MOST ONE of the two maps (no duplicates), and
       2. "reviewing" is a single yes/no everywhere: needsReview(id).
     The word card, the Review list, the statistics and the quiz weighting
     all read needsReview(), so they can never disagree. Every change emits
     ONE 'state-changed' event that the screens listen to. */
  function isKnown(wordId) { return !!state.known[wordId]; }
  function isManualReview(wordId) { return !!state.manualReview[wordId]; }
  function isAutoReview(wordId) { return !!state.autoReview[wordId]; }
  function needsReview(wordId) { return isManualReview(wordId) || isAutoReview(wordId); }
  function getReviewSource(wordId) { return isManualReview(wordId) ? 'manual' : (isAutoReview(wordId) ? 'auto' : null); }
  // Why a word is in Review: 'manual' (flagged by hand), 'wrong' / 'skipped'
  // (a quiz answer), 'quiz' (quiz-made, saved before reasons were stored).
  function getReviewReason(wordId) {
    if (isManualReview(wordId)) return 'manual';
    const v = state.autoReview[wordId];
    if (!v) return null;
    return v === 'wrong' || v === 'skipped' ? v : 'quiz';
  }

  function persistReview() {
    writeLS(LS_KEYS.manualReview, state.manualReview);
    writeLS(LS_KEYS.autoReview, state.autoReview);
  }

  // The single review switch used by the Review / Unreview control.
  //   on  → flagged (as manual) unless it is already in review
  //   off → ALL review state for the word is cleared (manual AND auto)
  function setReview(wordId, val) {
    if (val) {
      if (needsReview(wordId)) return; // already in review: never create a duplicate record
      state.manualReview[wordId] = true;
    } else {
      delete state.manualReview[wordId];
      delete state.autoReview[wordId];
    }
    persistReview();
    emit('state-changed', { wordId: wordId, kind: 'review' });
  }
  function toggleReview(wordId) { setReview(wordId, !needsReview(wordId)); }

  // Undo support for removing a word from Review. The snapshot records HOW the
  // word was in Review (the learner's own flag and/or the quiz-made reason);
  // restoring puts back exactly that — records are keyed by wordId, so a
  // restore can never create a duplicate. Learned state is never touched.
  function snapshotReview(wordId) {
    return { wordId: wordId, manual: !!state.manualReview[wordId], auto: state.autoReview[wordId] || null };
  }
  function restoreReview(snap) {
    if (!snap || !snap.wordId) return false;
    if (snap.manual) state.manualReview[snap.wordId] = true;
    if (snap.auto && !state.manualReview[snap.wordId]) state.autoReview[snap.wordId] = snap.auto;
    persistReview();
    emit('state-changed', { wordId: snap.wordId, kind: 'review' });
    return true;
  }

  // Kept for API compatibility: the manual toggle IS the canonical toggle.
  function setManualReview(wordId, val) { setReview(wordId, val); }
  function toggleManualReview(wordId) { toggleReview(wordId); }

  // Quiz-driven flag. Never duplicates a manual flag (the learner's own flag
  // wins); clearing only touches the quiz-made record. `val` is false, or the
  // reason: 'wrong' | 'skipped' (any other truthy value is stored as 'quiz').
  // Returns true when something changed. Does not save or emit — callers do,
  // so a whole quiz can be applied with one write and one event.
  function setAutoReviewQuiet(wordId, val) {
    if (val) {
      if (isManualReview(wordId)) return false;
      const reason = (val === 'wrong' || val === 'skipped') ? val : 'quiz';
      if (state.autoReview[wordId] === reason) return false;
      state.autoReview[wordId] = reason;
      return true;
    }
    if (!state.autoReview[wordId]) return false;
    delete state.autoReview[wordId];
    return true;
  }
  function setAutoReview(wordId, val) {
    if (!setAutoReviewQuiet(wordId, val)) return;
    persistReview();
    emit('state-changed', { wordId: wordId, kind: 'autoReview' });
  }

  // Marking a word learned (or answering it correctly) makes its quiz-made
  // review flag obsolete. A flag the user set by hand stays: it's theirs.
  function clearObsoleteAutoReview(wordIds) {
    let changed = false;
    wordIds.forEach(function (id) { if (state.autoReview[id]) { delete state.autoReview[id]; changed = true; } });
    if (changed) writeLS(LS_KEYS.autoReview, state.autoReview);
    return changed;
  }

  function setKnown(wordId, val) {
    if (val) state.known[wordId] = true; else delete state.known[wordId];
    writeLS(LS_KEYS.known, state.known);
    const reviewChanged = val ? clearObsoleteAutoReview([wordId]) : false;
    emit('state-changed', { wordId: wordId, kind: 'known', reviewChanged: reviewChanged });
  }
  function toggleKnown(wordId) { setKnown(wordId, !isKnown(wordId)); }

  function setGroupKnown(wordIds, val) {
    wordIds.forEach(function (id) { if (val) state.known[id] = true; else delete state.known[id]; });
    writeLS(LS_KEYS.known, state.known);
    const reviewChanged = val ? clearObsoleteAutoReview(wordIds) : false;
    emit('state-changed', { kind: 'group-known', wordIds: wordIds, reviewChanged: reviewChanged });
  }
  function getGroupTriState(wordIds) {
    let count = 0;
    for (let i = 0; i < wordIds.length; i++) { if (state.known[wordIds[i]]) count++; }
    if (count === 0) return 'unchecked';
    if (count === wordIds.length) return 'checked';
    return 'indeterminate';
  }

  // Every word that is in review AND actually exists in the loaded content.
  // The one place the Review list and every count come from.
  function getReviewWords() {
    const out = [];
    state.units.forEach(function (unit) {
      unit.lessons.forEach(function (lesson) {
        lesson.sections.forEach(function (section) {
          section.groups.forEach(function (group, gi) {
            group.words.forEach(function (w) {
              if (!needsReview(w.wordId)) return;
              out.push({
                wordId: w.wordId, word: w.word, meaning: w.meaning, pos: w.pos || null,
                unit: unit.unit, lessons: lesson.lessons, type: section.type,
                groupIdx: gi, groupTitle: group.title
              });
            });
          });
        });
      });
    });
    return out;
  }

  /* ---------------- Quiz (state + glue; the logic is in quiz-engine.js) ----------------
     Both quiz modes open from inside the current lesson's Vocabulary
     section only — never a cross-unit/global quiz.
     state.quiz = { session, timerId, timeLeft }. `session` is plain data owned
     by the engine (questions, answers, estimate, time limit). ux.js starts a
     timer, forwards answers to the engine, applies the engine's Review rules
     to the real Review state, and saves the finished record. */
  function collectVocabularyFor(unitNum, lessonKey) {
    const out = [];
    const unit = state.units.find(function (u) { return u.unit === unitNum; });
    if (!unit) return out;
    const lesson = unit.lessons.find(function (l) { return l.lessons.join('-') === lessonKey; });
    if (!lesson) return out;
    lesson.sections.forEach(function (section) {
      if (section.type !== 'vocabulary') return;
      section.groups.forEach(function (group, gi) {
        group.words.forEach(function (w) {
          out.push({
            wordId: w.wordId, word: w.word, meaning: w.meaning, pos: w.pos || null,
            unit: unitNum, lessons: lesson.lessons, groupIdx: gi, groupTitle: group.title
          });
        });
      });
    });
    return out;
  }

  function quizContext() { return { isKnown: isKnown, needsReview: needsReview }; }

  // What a quiz WOULD look like right now — shown on the launch buttons
  // before starting: word count, estimated duration / range / time limit.
  function getQuizPreview(unitNum, lessonKey, mode) {
    const pool = Engine.poolForMode(collectVocabularyFor(unitNum, lessonKey), mode, quizContext());
    const est = Engine.estimateDuration(Engine.buildQuestions(pool));
    return Object.assign({ mode: mode, count: pool.length }, est);
  }

  function startFullQuiz(unitNum, lessonKey) { return beginQuiz('full', { unit: unitNum, lessonKey: lessonKey }); }
  function canStartSelectedQuiz(unitNum, lessonKey) {
    return collectVocabularyFor(unitNum, lessonKey).some(function (w) { return isKnown(w.wordId); });
  }
  function startSelectedQuiz(unitNum, lessonKey) { return beginQuiz('selected', { unit: unitNum, lessonKey: lessonKey }); }

  function tickPayload() {
    const q = state.quiz;
    const limit = q.session.estimate.timeLimit;
    return { timeLeft: q.timeLeft, timeLimit: limit, state: Engine.timerState(q.timeLeft, limit) };
  }

  /* A quiz is a SESSION: the questions are picked at random ONCE, their order
     is then fixed, and the learner moves freely between them (Previous / Next /
     the number indicator). Each question is unanswered, answered (the learner
     typed something — not "correct") or skipped (left empty). Nothing is judged
     until finishQuiz(), so the quiz stays blind until the results. */
  function beginQuiz(mode, ref) {
    if (!Engine) return false;
    const questions = Engine.selectQuestions(collectVocabularyFor(ref.unit, ref.lessonKey), mode, quizContext());
    if (questions.length === 0) return false;
    if (state.quiz && state.quiz.timerId) clearInterval(state.quiz.timerId);
    const session = Engine.createSession({ mode: mode, ref: ref, questions: questions, now: Date.now() });
    state.quiz = { session: session, timerId: null, timeLeft: session.estimate.timeLimit };
    emit('quiz-started', { mode: mode, total: questions.length, timeLeft: state.quiz.timeLeft, estimate: session.estimate });
    emit('quiz-tick', tickPayload());

    // The clock is the real time since the start (not "minus one per tick"),
    // so a throttled background tab can't stretch the time limit.
    state.quiz.timerId = setInterval(function () {
      if (!state.quiz) return;
      state.quiz.timeLeft = Engine.remainingSeconds(state.quiz.session, Date.now());
      emit('quiz-tick', tickPayload());
      if (state.quiz.timeLeft <= 0) finishQuiz(true);
    }, 1000);
    return true;
  }

  function quizOverview() {
    if (!state.quiz) return null;
    const ov = Engine.overview(state.quiz.session);
    // `label` is what the desktop word panel shows (the prompt by default —
    // see QuizEngine.PANEL); the expected English word is never handed to the UI otherwise.
    ov.items.forEach(function (it) { it.label = Engine.panelLabel(state.quiz.session.questions[it.index]); });
    ov.index = state.quiz.session.index;
    return ov;
  }

  // Read-only view for the UI. The question carries its prompt and the
  // learner's own answer — never the expected word.
  function getCurrentQuiz() {
    const q = state.quiz;
    if (!q) return null;
    const s = q.session;
    const cur = Engine.currentQuestion(s);
    const ov = quizOverview();
    return {
      mode: s.mode, ref: s.ref, index: s.index, total: s.questions.length,
      question: cur ? { id: cur.id, wordId: cur.wordId, meaning: cur.meaning, pos: cur.pos, answer: cur.answer, state: cur.state } : null,
      items: ov.items, answered: ov.answered, skipped: ov.skipped, unanswered: ov.unanswered, unresolved: ov.unresolved,
      timeLeft: q.timeLeft, timeLimit: s.estimate.timeLimit, estimate: s.estimate,
      timerState: Engine.timerState(q.timeLeft, s.estimate.timeLimit)
    };
  }

  // The learner typed (or cleared) something in the CURRENT question.
  function setQuizAnswer(text) {
    if (!state.quiz) return null;
    const s = state.quiz.session;
    const before = s.questions[s.index].state;
    Engine.setAnswer(s, s.index, text);
    if (s.questions[s.index].state !== before) emit('quiz-overview', quizOverview());
    return s.questions[s.index].state;
  }

  // Go to any question (number indicator, Previous/Next, desktop panel).
  // Leaving an empty question skips it automatically; answers are never cleared.
  function goToQuestion(index) {
    if (!state.quiz) return null;
    const r = Engine.goTo(state.quiz.session, index);
    if (r.moved) { emit('quiz-question', getCurrentQuiz()); emit('quiz-overview', quizOverview()); }
    return state.quiz.session.index;
  }
  function nextQuizQuestion() {
    if (!state.quiz) return null;
    const s = state.quiz.session;
    if (s.index >= s.questions.length - 1) return null;       // the UI shows the completion summary instead
    return goToQuestion(s.index + 1);
  }
  function previousQuizQuestion() {
    if (!state.quiz) return null;
    const s = state.quiz.session;
    if (s.index <= 0) return null;
    return goToQuestion(s.index - 1);
  }
  // Leaving the question screen for the completion summary also leaves the
  // current question (an empty one becomes skipped, like any other move).
  function leaveCurrentQuestion() {
    if (!state.quiz) return;
    if (Engine.leaveQuestion(state.quiz.session, state.quiz.session.index)) emit('quiz-overview', quizOverview());
  }

  // The Review rule for one graded question comes from the engine
  // (correct → clear the quiz-made flag, near miss → leave Review alone,
  // wrong / skipped → add with that reason). Applied here because Review
  // state lives here. Returns true if Review changed (not yet saved).
  function applyReviewRule(entry) {
    if (!entry.wordId) return false;
    const rule = Engine.REVIEW_RULES[entry.result];
    if (rule === 'add') return setAutoReviewQuiet(entry.wordId, entry.result);
    if (rule === 'clear') return setAutoReviewQuiet(entry.wordId, false);
    return false;
  }

  function finishQuiz(timedOut) {
    if (!state.quiz) return null;
    const q = state.quiz;
    if (q.timerId) { clearInterval(q.timerId); q.timerId = null; }
    Engine.leaveQuestion(q.session, q.session.index);

    // Grading happens here, once, for the whole session: only now does a
    // question become correct / near miss / wrong, and wrong + skipped questions
    // enter Review (one save, one event).
    const record = Engine.buildRecord(q.session, { now: Date.now(), timedOut: !!timedOut });
    const reviewChanged = record.answers.map(applyReviewRule).some(Boolean);
    if (reviewChanged) { persistReview(); emit('state-changed', { kind: 'quiz-review' }); }

    state.quizHistory.push(record);
    if (state.quizHistory.length > QUIZ_HISTORY_LIMIT) state.quizHistory = state.quizHistory.slice(-QUIZ_HISTORY_LIMIT);
    writeLS(LS_KEYS.quizHistory, state.quizHistory);

    state.quiz = null;
    emit('quiz-finished', record);
    return record;
  }

  function abortQuiz() {
    if (state.quiz && state.quiz.timerId) clearInterval(state.quiz.timerId);
    state.quiz = null;
  }

  /* ---------------- Search ---------------- */
  function debounce(fn, ms) {
    let t = null;
    return function () {
      const args = arguments;
      const self = this;
      if (t) clearTimeout(t);
      t = setTimeout(function () { t = null; fn.apply(self, args); }, ms);
    };
  }
  // Text used to compare a search query with a word or a meaning. (This helper
  // was lost when the quiz logic moved to quiz-engine.js, which silently broke
  // Search — a ReferenceError inside the debounced callback.) It is deliberately
  // forgiving: case, extra spaces, and for Arabic meanings the diacritics,
  // tatweel and the common spelling variants of alef / yeh / teh marbuta.
  function normalize(s) {
    if (s == null) return '';
    return String(s).normalize('NFC').toLowerCase().trim()
      .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
      .replace(/[\u0622\u0623\u0625\u0671]/g, '\u0627')
      .replace(/\u0649/g, '\u064A')
      .replace(/\u0629/g, '\u0647')
      .replace(/\s+/g, ' ');
  }
  const SEARCH_DEBOUNCE_MS = 300;
  const runSearch = debounce(function (query) {
    state.lastSearchQuery = query;
    const q = normalize(query);
    if (!q) { emit('search-results', { query: query, results: [] }); return; }
    const exact = [], starts = [], includes = [];
    for (let i = 0; i < state.searchIndex.length; i++) {
      const item = state.searchIndex[i];
      const w = normalize(item.word), m = normalize(item.meaning);
      if (w === q || m === q) exact.push(item);
      else if (w.indexOf(q) === 0 || m.indexOf(q) === 0) starts.push(item);
      else if (w.indexOf(q) !== -1 || m.indexOf(q) !== -1) includes.push(item);
    }
    emit('search-results', { query: query, results: exact.concat(starts, includes).slice(0, 100) });
  }, SEARCH_DEBOUNCE_MS);
  function search(query) { runSearch(query); }

  /* ---------------- Navigation Resolution ---------------- */
  function resolveWordLocation(wordId) {
    for (let ui = 0; ui < state.units.length; ui++) {
      const unit = state.units[ui];
      for (let li = 0; li < unit.lessons.length; li++) {
        const lesson = unit.lessons[li];
        for (let si = 0; si < lesson.sections.length; si++) {
          const section = lesson.sections[si];
          for (let gi = 0; gi < section.groups.length; gi++) {
            const group = section.groups[gi];
            for (let wi = 0; wi < group.words.length; wi++) {
              if (group.words[wi].wordId === wordId) {
                return { unit: unit.unit, lessonKey: lesson.lessons.join('-'), type: section.type, groupIdx: gi, wordId: wordId };
              }
            }
          }
        }
      }
    }
    return null;
  }

  /* ---------------- Statistics ----------------
     Vocabulary progress is tracked separately from overall/global study
     stats, so Synonyms/Idioms/Derivatives words never dilute the
     "Vocabulary" percentage — they're still counted in the overall
     figure, since known/review state is generic across every section type. */
  // The ONE place that counts learnable words: every word of every section
  // (Vocabulary, Synonyms & Antonyms, Idioms & Phrasal Verbs, Derivatives and
  // any future type) in every lesson of the unit, with its learned state.
  function tallyUnit(unit) {
    const t = { total: 0, known: 0, byType: {} };
    unit.lessons.forEach(function (lesson) {
      lesson.sections.forEach(function (section) {
        const bt = t.byType[section.type] || (t.byType[section.type] = { total: 0, known: 0 });
        section.groups.forEach(function (group) {
          group.words.forEach(function (w) {
            t.total++; bt.total++;
            if (state.known[w.wordId]) { t.known++; bt.known++; }
          });
        });
      });
    });
    return t;
  }
  function progressOf(t) { return { total: t.total, known: t.known, progress: t.total > 0 ? t.known / t.total : 0 }; }

  // Progress of a whole unit (all its lessons and all word types) — used by
  // the Home unit cards. Same counting as Statistics, so they always agree.
  // Vocabulary-only count for one unit: ONLY sections of type 'vocabulary',
  // each word counted once (by its stable wordId) even if the same entry is
  // listed twice. "known" keeps its existing meaning (the learned checkbox).
  function getUnitVocabulary(unitNum) {
    const unit = state.units.find(function (u) { return u.unit === unitNum; });
    const seen = {};
    let total = 0, known = 0;
    if (unit) unit.lessons.forEach(function (lesson) {
      lesson.sections.forEach(function (section) {
        if (section.type !== 'vocabulary') return;
        section.groups.forEach(function (group) {
          group.words.forEach(function (w) {
            if (seen[w.wordId]) return;
            seen[w.wordId] = true; total++;
            if (state.known[w.wordId]) known++;
          });
        });
      });
    });
    return { total: total, known: known };
  }

  function getUnitProgress(unitNum) {
    const unit = state.units.find(function (u) { return u.unit === unitNum; });
    return unit ? progressOf(tallyUnit(unit)) : { total: 0, known: 0, progress: 0 };
  }

  function getStatistics() {
    let overallTotal = 0, overallKnown = 0;
    // Per content type (vocabulary, synonyms_antonyms, idioms, derivatives,
    // and any future/unknown type): { total, known, progress }; per unit too.
    const byType = {}, byUnit = {};
    state.units.forEach(function (unit) {
      const t = tallyUnit(unit);
      byUnit[unit.unit] = progressOf(t);
      overallTotal += t.total; overallKnown += t.known;
      Object.keys(t.byType).forEach(function (type) {
        const b = byType[type] || (byType[type] = { total: 0, known: 0, progress: 0 });
        b.total += t.byType[type].total; b.known += t.byType[type].known;
      });
    });
    Object.keys(byType).forEach(function (t) {
      byType[t].progress = byType[t].total > 0 ? byType[t].known / byType[t].total : 0;
    });
    const vocab = byType.vocabulary || { total: 0, known: 0, progress: 0 };
    return {
      byType: byType,
      byUnit: byUnit,
      vocabulary: { total: vocab.total, known: vocab.known, progress: vocab.progress },
      overall: { total: overallTotal, known: overallKnown, progress: overallTotal > 0 ? overallKnown / overallTotal : 0 },
      reviewWords: getReviewWords()
    };
  }

  // Vocabulary progress scoped to one lesson only (used for the small
  // progress indicator inside a lesson's Vocabulary section header).
  function getLessonVocabularyProgress(unitNum, lessonKey) {
    const words = collectVocabularyFor(unitNum, lessonKey);
    const known = words.filter(function (w) { return isKnown(w.wordId); }).length;
    return { total: words.length, known: known, progress: words.length > 0 ? known / words.length : 0 };
  }

  /* ---------------- Theme ----------------
     Three persisted preferences: 'light' | 'dark' | 'system'.
       getThemePreference() → what the user picked (default 'system')
       getTheme()           → the EFFECTIVE 'light' | 'dark' right now
                              (existing callers keep working unchanged)
       setTheme(pref)       → accepts all three values
     With 'system' the effective theme follows prefers-color-scheme and
     updates live when the OS/browser theme changes. */
  function systemPrefersDark() {
    try { return !!(global.matchMedia && global.matchMedia('(prefers-color-scheme: dark)').matches); } catch (e) { return false; }
  }
  function getThemePreference() {
    return THEME_PREFS.indexOf(state.theme) !== -1 ? state.theme : 'system';
  }
  function getTheme() {
    const pref = getThemePreference();
    if (pref === 'system') return systemPrefersDark() ? 'dark' : 'light';
    return pref;
  }
  function setTheme(pref) {
    if (THEME_PREFS.indexOf(pref) === -1) return;
    state.theme = pref;
    writeLS(LS_KEYS.theme, pref);
    emit('theme-preference-changed', pref);
    emit('theme-changed', getTheme());
  }
  (function watchSystemTheme() {
    try {
      const mq = global.matchMedia('(prefers-color-scheme: dark)');
      const onChange = function () { if (getThemePreference() === 'system') emit('theme-changed', getTheme()); };
      if (mq.addEventListener) mq.addEventListener('change', onChange);
      else if (mq.addListener) mq.addListener(onChange);
    } catch (e) {}
  })();

  /* ---------------- Font style ----------------
     One persisted preference, applied by ui.js as <html data-font="…">. The
     CSS (root.css) turns the mode into two weight roles — body and heading —
     so every screen follows it without any per-page font code. */
  function getFontMode() {
    return FONT_MODES.indexOf(state.fontMode) !== -1 ? state.fontMode : DEFAULT_FONT_MODE;
  }
  function setFontMode(mode) {
    if (FONT_MODES.indexOf(mode) === -1) return;
    state.fontMode = mode;
    writeLS(LS_KEYS.fontMode, mode);
    emit('font-mode-changed', mode);
  }

  /* ---------------- Theme color (Settings: 6 accents + default) ---------------- */
  // Returns a palette name, or 'default' when no accent is picked.
  function getThemeColor() {
    return state.themeColor && (THEME_COLORS.indexOf(state.themeColor) !== -1 || RETIRED_COLORS.indexOf(state.themeColor) !== -1) ? state.themeColor : DEFAULT_COLOR;
  }
  // Accepts a palette name, or 'default' to go back to the calm default look.
  function setThemeColor(color) {
    if (color === DEFAULT_COLOR) {
      state.themeColor = null;
      try { localStorage.removeItem(LS_KEYS.themeColor); } catch (e) {}
    } else if (THEME_COLORS.indexOf(color) !== -1) {
      state.themeColor = color;
      writeLS(LS_KEYS.themeColor, color);
    } else {
      return;
    }
    emit('theme-color-changed', getThemeColor());
  }

  /* ---------------- Interface language (Settings + floating button) ----------------
     One persisted preference ('en' | 'ar'). The words themselves live in
     JavaScript/i18n.js; this only stores the choice and announces changes.
     Learning data, quiz progress and the other preferences are never touched. */
  const LANGS = ['en', 'ar'];
  function getLanguage() { return LANGS.indexOf(state.lang) !== -1 ? state.lang : 'en'; }
  function setLanguage(lang) {
    if (LANGS.indexOf(lang) === -1) return;
    state.lang = lang;
    writeLS(LS_KEYS.lang, lang);
    if (global.I18n) global.I18n.setLang(lang);
    emit('language-changed', lang);
  }
  if (global.I18n) global.I18n.setLang(getLanguage());   // before the first paint

  /* ---------------- Animations on/off (Settings) ----------------
     One persisted preference. On by default. The device's reduced-motion
     setting is checked separately (CSS media query + animationsActive()). */
  function getAnimationsEnabled() { return state.animations !== false; }
  function setAnimationsEnabled(on) {
    state.animations = !!on;
    writeLS(LS_KEYS.animations, !!on);
    emit('animations-changed', !!on);
  }

  /* ---------------- Keep screen awake (Settings) ---------------- */
  function getKeepAwake() { return !!state.keepAwake; }
  function setKeepAwake(val) {
    state.keepAwake = !!val;
    writeLS(LS_KEYS.keepAwake, state.keepAwake);
    emit('keep-awake-changed', state.keepAwake);
  }

  /* ---------------- Quiz history lookup (for the quiz-detail screen) ---------------- */
  function getQuizRecord(id) {
    for (let i = 0; i < state.quizHistory.length; i++) {
      if (state.quizHistory[i].id === id) return state.quizHistory[i];
    }
    return null;
  }

  /* ---------------- Local data: export / import / delete-all ----------------
     Everything the app stores is plain JSON in localStorage, so this is a
     straight dump/restore of the known keys — used by the Settings screen's
     Export / Import / Delete All Data buttons. */
  function exportAllData() {
    return {
      appVersion: 1,               // backup FORMAT version (unchanged)
      modelVersion: CURRENT_VERSION, // app model version that wrote it (informational; never blocks an import)
      exportedAt: Date.now(),
      known: state.known,
      manualReview: state.manualReview,
      autoReview: state.autoReview,
      quizHistory: state.quizHistory,
      theme: getThemePreference(),
      themeColor: getThemeColor(),
      fontMode: getFontMode(),
      lang: getLanguage(),
      animations: getAnimationsEnabled(),
      keepAwake: state.keepAwake
    };
  }
  function isPlainObject(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
  function importAllData(obj) {
    if (!obj || typeof obj !== 'object') return false;
    const recognized = ['known', 'manualReview', 'autoReview', 'quizHistory', 'theme', 'themeColor', 'fontMode', 'keepAwake', 'lang', 'animations'];
    if (!recognized.some(function (k) { return obj[k] !== undefined; })) return false;
    try {
      let applied = false; // only report success if something valid was actually imported
      if (isPlainObject(obj.known)) { state.known = obj.known; writeLS(LS_KEYS.known, state.known); applied = true; }
      if (isPlainObject(obj.manualReview)) { state.manualReview = obj.manualReview; writeLS(LS_KEYS.manualReview, state.manualReview); applied = true; }
      if (isPlainObject(obj.autoReview)) { state.autoReview = obj.autoReview; writeLS(LS_KEYS.autoReview, state.autoReview); applied = true; }
      if (Array.isArray(obj.quizHistory)) { state.quizHistory = normalizeHistory(obj.quizHistory); writeLS(LS_KEYS.quizHistory, state.quizHistory); applied = true; }
      const themeChanged = THEME_PREFS.indexOf(obj.theme) !== -1;
      const importedColor = obj.themeColor === DEFAULT_COLOR ? null : normalizeColor(obj.themeColor);
      const colorChanged = obj.themeColor === DEFAULT_COLOR || importedColor !== null;
      if (themeChanged) { state.theme = obj.theme; writeLS(LS_KEYS.theme, state.theme); applied = true; }
      if (colorChanged) {
        state.themeColor = importedColor;
        if (importedColor) writeLS(LS_KEYS.themeColor, importedColor); else { try { localStorage.removeItem(LS_KEYS.themeColor); } catch (e) {} }
        applied = true;
      }
      const fontChanged = FONT_MODES.indexOf(obj.fontMode) !== -1;
      if (fontChanged) { state.fontMode = obj.fontMode; writeLS(LS_KEYS.fontMode, state.fontMode); applied = true; }
      if (typeof obj.animations === 'boolean') { state.animations = obj.animations; writeLS(LS_KEYS.animations, obj.animations); applied = true; emit('animations-changed', obj.animations); }
      const langChanged = LANGS.indexOf(obj.lang) !== -1;
      if (langChanged) { state.lang = obj.lang; writeLS(LS_KEYS.lang, state.lang); if (global.I18n) global.I18n.setLang(state.lang); applied = true; }
      if (typeof obj.keepAwake === 'boolean') { state.keepAwake = obj.keepAwake; writeLS(LS_KEYS.keepAwake, state.keepAwake); applied = true; }
      // Same rule as at startup: stored progress must match the content.
      reconcileStoredData();
      if (themeChanged) { emit('theme-preference-changed', getThemePreference()); emit('theme-changed', getTheme()); }
      if (colorChanged) emit('theme-color-changed', getThemeColor());
      if (fontChanged) emit('font-mode-changed', getFontMode());
      if (langChanged) emit('language-changed', getLanguage());
      if (!applied) return false;
      emit('data-imported', {});
      return true;
    } catch (e) {
      return false;
    }
  }
  function resetAllData() {
    state.known = {};
    state.manualReview = {};
    state.autoReview = {};
    state.quizHistory = [];
    state.theme = null;
    state.themeColor = null;
    state.fontMode = null;
    state.lang = null;
    state.animations = null;
    state.keepAwake = false;
    Object.keys(LS_KEYS).forEach(function (k) {
      try { localStorage.removeItem(LS_KEYS[k]); } catch (e) {}
    });
    emit('data-reset', {});
  }

  /* ---------------- Update refresh cycle ----------------
     Builds on the version system above (version.js → EE_MODEL_VERSION, the
     'eenglish.app' marker, versioned caches in sw.js). It adds the missing
     piece: noticing that the SERVER has a different version than the one
     this page is running, and refreshing onto it — safely.

       running  = the version of the code executing now (EE_MODEL_VERSION)
       latest   = the version in a freshly fetched version.js (network-first
                  in sw.js for the "?check=" request; never served from cache)

     When latest !== running (newer OR older — 5→6, 6→7, 7→5 all count):
       1. a NEW update (a latest we have not tried to reach yet) resets
          refreshTimes to 0 and remembers it as the target;
       2. if refreshTimes is already 3 → STOP (nothing is deleted or reset);
       3. otherwise wait UPDATE_WAIT_MS so the service worker can fetch and
          activate the new files, then — never during a quiz — count the
          attempt (refreshTimes + 1, saved BEFORE reloading) and reload.
     After the reload the check runs again: if the page now runs the latest
     version it simply stops; if not, it retries — at most 3 times in total.

     refreshTimes (a fixed localStorage key) is only ever
       • set to 0 when a new update is detected,
       • set to 0 when the learner refreshes the page by hand (a reload that
         this code did not start — see detectManualRefresh),
       • incremented right before an automatic reload.
     It is never reset merely because the page reloaded, and never deleted.

     Offline (or an unreadable version.js): nothing happens and no attempt is
     used; when the connection returns the check runs again. A per-tab-session
     hard cap (SESSION_HARD_CAP) is a second, independent brake.

     This touches only app-layer keys ('refreshTimes', 'eenglish.updateTarget')
     — never the learner's progress, review lists, history or preferences. */
  const REFRESH_KEY = 'refreshTimes';
  const UPDATE_TARGET_KEY = 'eenglish.updateTarget';
  const AUTO_RELOAD_FLAG = 'eenglish.autoReload';        // sessionStorage: "this reload was ours"
  const SESSION_RELOADS_KEY = 'eenglish.sessionReloads'; // sessionStorage: hard cap per tab session
  const MAX_REFRESH_ATTEMPTS = 3;
  const SESSION_HARD_CAP = 6;
  const UPDATE_WAIT_MS = 3000;       // time for the new files to arrive before a refresh attempt
  const QUIZ_IDLE_POLL_MS = 2000;    // a refresh never interrupts a running quiz
  const VERSION_FILE = 'JavaScript/version.js';

  const updater = {
    running: false,
    hooks: {
      reload: function () { global.location.reload(); },
      isOnline: function () { return !global.navigator || global.navigator.onLine !== false; },
      fetchText: function (url) {
        return global.fetch(url, { cache: 'no-store' }).then(function (r) { return r && r.ok ? r.text() : null; });
      },
      navigationType: function () {
        try {
          const e = global.performance && global.performance.getEntriesByType && global.performance.getEntriesByType('navigation')[0];
          if (e && e.type) return e.type;
          if (global.performance && global.performance.navigation) return global.performance.navigation.type === 1 ? 'reload' : 'navigate';
        } catch (e) {}
        return 'navigate';
      },
      waitMs: UPDATE_WAIT_MS
    }
  };

  function readRefreshTimes() {
    let n = NaN;
    try { n = parseInt(localStorage.getItem(REFRESH_KEY), 10); } catch (e) {}
    return isFinite(n) && n >= 0 ? n : 0;
  }
  function writeRefreshTimes(n) {
    try { localStorage.setItem(REFRESH_KEY, String(n)); } catch (e) {}
  }
  function readUpdateTarget() {
    try { return localStorage.getItem(UPDATE_TARGET_KEY); } catch (e) { return null; }
  }
  function writeUpdateTarget(v) {
    try { localStorage.setItem(UPDATE_TARGET_KEY, String(v)); } catch (e) {}
  }
  // "10|2" = app version 10 + JavaScript loading version 2. A change in EITHER
  // part is an update. (A version.js without EE_JS_VERSION compares the app
  // version only.)
  function parseVersionText(text) {
    const t = String(text || '');
    const m = /EE_MODEL_VERSION\s*=\s*['"]([^'"]+)['"]/.exec(t);
    if (!m) return null;
    const j = /EE_JS_VERSION\s*=\s*['"]([^'"]+)['"]/.exec(t);
    return m[1] + '|' + (j ? j[1] : CURRENT_JS);
  }

  // PURE decision. No storage, no network, no reload — easy to test.
  //   in : { running, latest, online, refreshTimes, target }
  //   out: { action: 'none' | 'refresh' | 'stop', reason, newUpdate,
  //          refreshTimes (value to store), attempt (1..max) when refreshing, target }
  function planUpdate(input) {
    const running = input.running, latest = input.latest;
    const times = input.refreshTimes, target = input.target;
    if (!input.online) return { action: 'none', reason: 'offline', newUpdate: false, refreshTimes: times, target: target };
    if (!latest) return { action: 'none', reason: 'unknown-version', newUpdate: false, refreshTimes: times, target: target };
    if (latest === running) return { action: 'none', reason: 'up-to-date', newUpdate: false, refreshTimes: times, target: latest };
    const newUpdate = target !== latest;
    const used = newUpdate ? 0 : times;
    if (used >= MAX_REFRESH_ATTEMPTS) return { action: 'stop', reason: 'max-attempts', newUpdate: newUpdate, refreshTimes: used, target: latest };
    return { action: 'refresh', reason: newUpdate ? 'new-update' : 'retry', newUpdate: newUpdate, refreshTimes: used, attempt: used + 1, target: latest };
  }

  // A reload that the learner started (pull-to-refresh, F5, the browser's
  // button) gives them a fresh set of attempts. Our own automatic reloads
  // leave a one-shot flag in sessionStorage so they are not mistaken for it.
  function detectManualRefresh() {
    let ours = false;
    try { ours = sessionStorage.getItem(AUTO_RELOAD_FLAG) === '1'; sessionStorage.removeItem(AUTO_RELOAD_FLAG); } catch (e) {}
    const manual = !ours && updater.hooks.navigationType() === 'reload';
    if (manual) writeRefreshTimes(0);
    return manual;
  }

  function fetchLatestVersion() {
    if (!updater.hooks.isOnline()) return Promise.resolve(null);
    // "?check=" is what makes sw.js go to the network for this one request.
    return Promise.resolve().then(function () {
      return updater.hooks.fetchText(VERSION_FILE + '?check=' + Date.now());
    }).then(parseVersionText).catch(function () { return null; });
  }

  // Wait up to ms for the new files; resolves early when the service worker
  // reports it has activated them.
  function waitForNewFiles(ms) {
    if (!ms) return Promise.resolve();
    return new Promise(function (resolve) {
      let done = false;
      let timer = null;
      function finish() { if (done) return; done = true; clearTimeout(timer); off('update-files-ready', finish); resolve(); }
      timer = setTimeout(finish, ms);
      on('update-files-ready', finish);
      try {
        const sw = global.navigator && global.navigator.serviceWorker;
        if (sw && sw.getRegistration) sw.getRegistration().then(function (r) { if (r && r.update) r.update(); }).catch(function () {});
      } catch (e) {}
    });
  }
  function waitForQuizIdle() {
    return new Promise(function (resolve) {
      (function poll() { if (state.quiz) setTimeout(poll, QUIZ_IDLE_POLL_MS); else resolve(); })();
    });
  }
  function sessionReloads() {
    try { return parseInt(sessionStorage.getItem(SESSION_RELOADS_KEY), 10) || 0; } catch (e) { return 0; }
  }

  // One full check. `opts.latest` (from the service worker's message) skips
  // the network fetch; `opts.skipWait` skips the wait for new files.
  function checkForUpdate(opts) {
    opts = opts || {};
    if (updater.running) return Promise.resolve({ action: 'none', reason: 'busy' });
    if (!CURRENT_VERSION) return Promise.resolve({ action: 'none', reason: 'no-version' });
    updater.running = true;
    return (opts.latest ? Promise.resolve(String(opts.latest).indexOf('|') === -1 ? String(opts.latest) + '|' + CURRENT_JS : String(opts.latest)) : fetchLatestVersion()).then(function (latest) {
      const plan = planUpdate({
        running: CURRENT_SIGNATURE, latest: latest, online: updater.hooks.isOnline(),
        refreshTimes: readRefreshTimes(), target: readUpdateTarget()
      });
      if (plan.target && plan.target !== readUpdateTarget()) writeUpdateTarget(plan.target);
      if (plan.newUpdate) writeRefreshTimes(0);                 // new update → a fresh cycle
      if (plan.action === 'stop') emit('update-stopped', plan);
      if (plan.action !== 'refresh') { updater.running = false; return plan; }
      if (sessionReloads() >= SESSION_HARD_CAP) { updater.running = false; return Object.assign({}, plan, { action: 'stop', reason: 'session-cap' }); }
      emit('update-pending', plan);
      return waitForNewFiles(opts.skipWait ? 0 : updater.hooks.waitMs).then(waitForQuizIdle).then(function () {
        writeRefreshTimes(plan.attempt);                         // counted BEFORE reloading
        try {
          sessionStorage.setItem(AUTO_RELOAD_FLAG, '1');
          sessionStorage.setItem(SESSION_RELOADS_KEY, String(sessionReloads() + 1));
        } catch (e) {}
        emit('update-refreshing', plan);
        updater.running = false;
        updater.hooks.reload();
        return plan;
      });
    }).catch(function (e) { updater.running = false; console.error(e); return { action: 'none', reason: 'error' }; });
  }

  // Called once at startup (ui.js) and wires the two later triggers: the
  // service worker announcing a new cache, and the connection coming back.
  let updateWatcherStarted = false;
  function startUpdateWatcher() {
    if (updateWatcherStarted) return Promise.resolve(null);
    updateWatcherStarted = true;
    try { if (localStorage.getItem(REFRESH_KEY) === null) writeRefreshTimes(0); } catch (e) {}   // the key always exists
    detectManualRefresh();
    try {
      const sw = global.navigator && global.navigator.serviceWorker;
      if (sw && sw.addEventListener) {
        sw.addEventListener('message', function (ev) {
          const d = ev && ev.data;
          if (!d || d.type !== 'EE_CACHE_ACTIVATED') return;
          emit('update-files-ready', d);
          checkForUpdate({ latest: d.version, skipWait: true });
        });
        if (sw.startMessages) sw.startMessages();   // make sure messages queued before this listener are delivered
      }
    } catch (e) {}
    try { global.addEventListener('online', function () { checkForUpdate(); }); } catch (e) {}
    return checkForUpdate();
  }

  /* ---------------- Public API ---------------- */
  global.UX = {
    on: on, emit: emit,
    loadAll: loadAll,
    getUnits: function () { return state.units; },
    getStatistics: getStatistics, getUnitProgress: getUnitProgress,
    getLessonVocabularyProgress: getLessonVocabularyProgress,
    getMissingSections: function () { return state.missingSections.slice(); },
    getTheme: getTheme, getThemePreference: getThemePreference, setTheme: setTheme,
    getAppVersionInfo: function () { return { current: versionInfo.current, js: versionInfo.js, previous: versionInfo.previous, previousJs: versionInfo.previousJs, changed: versionInfo.changed, history: readAppMeta().history }; },
    reconcileStoredData: reconcileStoredData, getReviewWords: getReviewWords, getReviewSource: getReviewSource,
    getFontMode: getFontMode, setFontMode: setFontMode, getFontModes: function () { return FONT_MODES.slice(); },
    getThemeColor: getThemeColor, setThemeColor: setThemeColor, getThemeColors: function () { return THEME_COLORS.slice(); },
    getLanguage: getLanguage, setLanguage: setLanguage,
    getAnimationsEnabled: getAnimationsEnabled, setAnimationsEnabled: setAnimationsEnabled,
    getUnitVocabulary: getUnitVocabulary, snapshotReview: snapshotReview, restoreReview: restoreReview,
    getKeepAwake: getKeepAwake, setKeepAwake: setKeepAwake,
    getQuizHistory: function () { return state.quizHistory.slice(); },
    getQuizPreview: getQuizPreview, getReviewReason: getReviewReason,
    getQuizRecord: getQuizRecord,
    exportAllData: exportAllData, importAllData: importAllData, resetAllData: resetAllData,
    isKnown: isKnown, isManualReview: isManualReview, isAutoReview: isAutoReview, needsReview: needsReview,
    toggleKnown: toggleKnown, toggleManualReview: toggleManualReview, toggleReview: toggleReview, setReview: setReview, setAutoReview: setAutoReview,
    setKnown: setKnown, setGroupKnown: setGroupKnown, getGroupTriState: getGroupTriState,
    startFullQuiz: startFullQuiz, startSelectedQuiz: startSelectedQuiz, canStartSelectedQuiz: canStartSelectedQuiz,
    setQuizAnswer: setQuizAnswer, goToQuestion: goToQuestion, nextQuizQuestion: nextQuizQuestion, previousQuizQuestion: previousQuizQuestion,
    leaveCurrentQuestion: leaveCurrentQuestion, getQuizOverview: quizOverview,
    finishQuiz: finishQuiz, abortQuiz: abortQuiz, getCurrentQuiz: getCurrentQuiz,
    search: search, resolveWordLocation: resolveWordLocation,
    // Update refresh cycle (see the section above). planUpdate is pure; `updater`
    // exposes the hooks (reload / network / navigation type) for tests.
    startUpdateWatcher: startUpdateWatcher, checkForUpdate: checkForUpdate, planUpdate: planUpdate,
    updater: updater, UPDATE_CONSTANTS: { REFRESH_KEY: REFRESH_KEY, MAX_REFRESH_ATTEMPTS: MAX_REFRESH_ATTEMPTS, UPDATE_WAIT_MS: UPDATE_WAIT_MS, SESSION_HARD_CAP: SESSION_HARD_CAP }
  };
})(window);
