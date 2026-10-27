/* quiz-engine.js — all quiz-specific LOGIC, with no side effects.

   What lives here:  question selection · quiz modes · question generation ·
   the QUIZ SESSION (a fixed question order, an answer per question, and the
   unanswered / answered / skipped state of each) · dynamic duration (estimate /
   range / time limit) · timer maths · answer normalisation · grading
   (exact / near-miss / wrong / skipped) · scoring · category counts · result
   records (and upgrading old ones).

   What does NOT live here (it stays in ux.js): application state,
   localStorage, the event bus, navigation, saving history, and changing the
   Review lists. This file never touches the DOM, localStorage, timers or
   events: it receives plain data (plus the current time / a random function
   when it needs them) and returns plain data. ux.js drives it and applies
   its decisions; ui.js only draws what ux.js hands over.

   Load order: this file is loaded BEFORE ux.js and depends on nothing.
   Public API: window.QuizEngine (also module.exports, for tests). */
(function (root) {
  'use strict';

  /* =====================================================================
     TUNABLE CONSTANTS — change numbers here, never the algorithms below.
     ===================================================================== */

  // Points per answer category.
  const SCORING = { correct: 1, near: 0.5, wrong: 0, skipped: 0 };
  const CATEGORIES = ['correct', 'near', 'wrong', 'skipped'];
  const LABELS = { correct: 'Correct', near: 'Near Miss', wrong: 'Wrong', skipped: 'Skipped' };

  // What each category does to the Review list.
  //   add   → word enters Review (reason is stored: 'wrong' | 'skipped')
  //   clear → word's quiz-made review flag is obsolete and is removed
  //   none  → Review is left exactly as it was
  // A near miss must NEVER enter Review.
  const REVIEW_RULES = { correct: 'clear', near: 'none', wrong: 'add', skipped: 'add' };

  // Near-miss detection. A near miss means "clearly meant the right word,
  // with a small typo" — it must not accept a different word that merely
  // looks similar, so short words are exact-match only.
  const NEAR_MISS = {
    MIN_EXPECTED_LENGTH: 5,              // expected word shorter than this → exact match only
    TWO_EDIT_MIN_LENGTH: 9,              // this long or longer → up to MAX_EDITS_LONG edits
    MAX_EDITS_MEDIUM: 1,                 // MIN_EXPECTED_LENGTH .. TWO_EDIT_MIN_LENGTH-1 letters
    MAX_EDITS_LONG: 2,                   // TWO_EDIT_MIN_LENGTH+ letters
    MIN_SIMILARITY: 0.75,                // 1 - edits / longer length; below this it is a different word
    FIRST_LETTER_MUST_MATCH_BELOW: 9     // shorter words must keep their first letter (bright ≠ fright)
  };

  // Time model (seconds). The estimate is built per question from reading,
  // recall (thinking), typing and UI overhead, then scaled for fatigue on
  // long quizzes. It is NOT words × a fixed number.
  const DURATION = {
    STARTUP_SECONDS: 10,                 // reading the first prompt, focusing the field
    READ_BASE: 0.8,                      // reading a prompt: base + per word of the meaning
    READ_PER_TOKEN: 0.3,
    READ_MAX: 6,
    RECALL_BASE: 2.5,                    // thinking / recall: base + per letter of the answer
    RECALL_PER_CHAR: 0.1,
    TYPING_CHARS_PER_SECOND: 3,          // casual phone typing
    TYPING_CORRECTION_FACTOR: 1.25,      // backspaces and fixes
    TYPING_START: 0.6,                   // first keystroke
    TRANSITION: 0.8,                     // submit tap, feedback, next question
    FATIGUE_PER_QUESTION: 0.002,         // people slow down in long quizzes …
    FATIGUE_MAX: 0.2,                    // … by at most 20 %
    RANGE_LOW: 0.85,                     // fast end of the range shown to the user
    RANGE_HIGH: 1.2,                     // careful end of the range
    LIMIT_MULTIPLIER: 1.75,              // the timer allows this much of the estimate …
    LIMIT_BUFFER_SECONDS: 60,            // … plus this flat buffer, so it never feels rushed
    LIMIT_OVER_RANGE_MAX: 1.15,          // and always clears the slow end of the range
    LIMIT_ROUND_SECONDS: 30,             // limits are rounded up to this step
    MIN_LIMIT_SECONDS: 120,
    MAX_LIMIT_SECONDS: 3 * 60 * 60
  };

  // Timer feedback: the visual state changes before the limit is reached.
  const TIMER = {
    WARNING_FRACTION: 0.15, WARNING_MIN_SECONDS: 60,    // last 15 % (at least the last minute)
    CRITICAL_FRACTION: 0.05, CRITICAL_MIN_SECONDS: 30   // last 5 % (at least the last 30 s)
  };

  // About 70 % of a quiz is drawn from the words in Review (when there are any).
  const REVIEW_SHARE = 0.7;

  // Quiz modes. `filter: 'known'` = only words marked as learned.
  const MODES = {
    full: { label: 'Full Quiz', filter: null },
    selected: { label: 'Selected Quiz', filter: 'known' }
  };

  const RECORD_VERSION = 2;

  // The state of a question DURING the quiz. It only says whether the learner
  // wrote something — never whether it is right. Correct / near / wrong exist
  // only after grading (grade() below), when the learner finishes.
  //   unanswered  not visited yet, or visited and still empty
  //   answered    the learner has typed something (right or wrong: unknown)
  //   skipped     the learner left the question with nothing written
  const QUESTION_STATES = ['unanswered', 'answered', 'skipped'];

  // What the compact "Quiz Words" panel (desktop) lists for each question.
  // The quiz asks for the ENGLISH word from its meaning, so listing the
  // English words in question order would hand over every answer. By default
  // the panel therefore lists the question prompt (the meaning). Set this to
  // true only if the panel really should show the English words.
  const PANEL = { SHOW_ENGLISH_WORDS: false };

  /* =====================================================================
     Answer normalisation + classification
     ===================================================================== */

  // Trim · lowercase · collapse repeated spaces · unify apostrophes · drop
  // harmless punctuation at the END only ("word." / "word!" → "word").
  function normalizeAnswer(s) {
    if (s == null) return '';
    let t = String(s).normalize('NFC').toLowerCase().trim();
    t = t.replace(/[\u2018\u2019\u02BC]/g, "'");
    t = t.replace(/\s+/g, ' ');
    t = t.replace(/[.,!?;:'"`~()\[\]{}<>\u060C\u061B\u061F]+$/g, '').trim();
    return t;
  }

  // Levenshtein edit distance (insert / delete / replace), with one extension:
  // swapping two neighbouring letters ("recieve") counts as ONE edit, because
  // that is the most common real typo.
  function levenshtein(a, b) {
    if (a === b) return 0;
    const al = a.length, bl = b.length;
    if (al === 0) return bl;
    if (bl === 0) return al;
    let prev2 = null;
    let prev = new Array(bl + 1);
    let curr = new Array(bl + 1);
    for (let j = 0; j <= bl; j++) prev[j] = j;
    for (let i = 1; i <= al; i++) {
      curr[0] = i;
      for (let j = 1; j <= bl; j++) {
        const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
        let v = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
        if (prev2 && i > 1 && j > 1 &&
            a.charCodeAt(i - 1) === b.charCodeAt(j - 2) &&
            a.charCodeAt(i - 2) === b.charCodeAt(j - 1)) {
          v = Math.min(v, prev2[j - 2] + 1);
        }
        curr[j] = v;
      }
      const spare = prev2;          // rotate rows: (i-2, i-1, i) → (i-1, i, reuse)
      prev2 = prev; prev = curr; curr = spare || new Array(bl + 1);
    }
    return prev[bl];
  }

  // How many edits an answer may be away from the expected word and still be
  // a near miss. 0 means "exact match only".
  function allowedEdits(expectedLength) {
    if (expectedLength < NEAR_MISS.MIN_EXPECTED_LENGTH) return 0;
    if (expectedLength < NEAR_MISS.TWO_EDIT_MIN_LENGTH) return NEAR_MISS.MAX_EDITS_MEDIUM;
    return NEAR_MISS.MAX_EDITS_LONG;
  }

  function similarity(a, b) {
    const longest = Math.max(a.length, b.length);
    return longest === 0 ? 1 : 1 - levenshtein(a, b) / longest;
  }

  // → { result: 'correct'|'near'|'wrong'|'skipped', score, distance, similarity }
  function classifyAnswer(userAnswer, expectedWord) {
    const u = normalizeAnswer(userAnswer);
    const e = normalizeAnswer(expectedWord);
    if (u === '') return { result: 'skipped', score: SCORING.skipped, distance: null, similarity: null };
    if (u === e) return { result: 'correct', score: SCORING.correct, distance: 0, similarity: 1 };

    const distance = levenshtein(u, e);
    const sim = similarity(u, e);
    const maxEdits = allowedEdits(e.length);
    let near = maxEdits > 0 && distance <= maxEdits && sim >= NEAR_MISS.MIN_SIMILARITY;
    if (near && e.length < NEAR_MISS.FIRST_LETTER_MUST_MATCH_BELOW && u.charAt(0) !== e.charAt(0)) near = false;
    return near
      ? { result: 'near', score: SCORING.near, distance: distance, similarity: sim }
      : { result: 'wrong', score: SCORING.wrong, distance: distance, similarity: sim };
  }

  /* =====================================================================
     Dynamic duration
     ===================================================================== */

  function round1(n) { return Math.round(n * 10) / 10; }

  // Seconds one question is expected to take (before fatigue).
  function questionSeconds(question) {
    const answerLen = normalizeAnswer(question.word).length;
    const tokens = String(question.meaning || '').split(/[\s/,;\u060C\u061B]+/).filter(Boolean).length;
    const read = Math.min(DURATION.READ_MAX, DURATION.READ_BASE + DURATION.READ_PER_TOKEN * tokens);
    const recall = DURATION.RECALL_BASE + DURATION.RECALL_PER_CHAR * answerLen;
    const typing = (answerLen / DURATION.TYPING_CHARS_PER_SECOND) * DURATION.TYPING_CORRECTION_FACTOR + DURATION.TYPING_START;
    return read + recall + typing + DURATION.TRANSITION;
  }

  function formatRange(minSeconds, maxSeconds) {
    const lo = Math.max(1, Math.floor(minSeconds / 60));
    const hi = Math.max(lo, Math.ceil(maxSeconds / 60));
    return lo === hi ? '~' + lo + ' min' : lo + '\u2013' + hi + ' min';
  }

  /* Three separate numbers (seconds), as requested:
       estimatedDuration  what a typical attempt should take
       estimatedRange     {min, max}: fast … careful, shown before starting
       timeLimit          what the timer really allows — deliberately above
                          the estimate so the quiz never feels rushed
     `label` is the ready-to-show range, e.g. "14–20 min". */
  function estimateDuration(questions) {
    const n = questions.length;
    if (n === 0) {
      return { questionCount: 0, estimatedDuration: 0, estimatedRange: { min: 0, max: 0 }, timeLimit: DURATION.MIN_LIMIT_SECONDS, label: '0 min' };
    }
    let sum = 0;
    for (let i = 0; i < n; i++) sum += questionSeconds(questions[i]);
    const fatigue = 1 + Math.min(DURATION.FATIGUE_MAX, n * DURATION.FATIGUE_PER_QUESTION);
    const estimated = Math.ceil(DURATION.STARTUP_SECONDS + sum * fatigue);
    const rangeMin = Math.max(1, Math.round(estimated * DURATION.RANGE_LOW));
    const rangeMax = Math.max(rangeMin, Math.round(estimated * DURATION.RANGE_HIGH));

    let limit = Math.max(
      DURATION.MIN_LIMIT_SECONDS,
      estimated * DURATION.LIMIT_MULTIPLIER + DURATION.LIMIT_BUFFER_SECONDS,
      rangeMax * DURATION.LIMIT_OVER_RANGE_MAX
    );
    limit = Math.ceil(limit / DURATION.LIMIT_ROUND_SECONDS) * DURATION.LIMIT_ROUND_SECONDS;
    limit = Math.min(limit, DURATION.MAX_LIMIT_SECONDS);

    return {
      questionCount: n,
      estimatedDuration: estimated,
      estimatedRange: { min: rangeMin, max: rangeMax },
      timeLimit: limit,
      label: formatRange(rangeMin, rangeMax)
    };
  }

  /* ---------------- Timer maths ---------------- */
  function remainingSeconds(session, now) {
    const used = Math.floor((now - session.startedAt) / 1000);
    return Math.max(0, session.estimate.timeLimit - Math.max(0, used));
  }
  // 'normal' | 'warning' | 'critical' — drives the visual near-expiry state.
  function timerState(remaining, limit) {
    if (remaining <= Math.max(TIMER.CRITICAL_MIN_SECONDS, limit * TIMER.CRITICAL_FRACTION)) return 'critical';
    if (remaining <= Math.max(TIMER.WARNING_MIN_SECONDS, limit * TIMER.WARNING_FRACTION)) return 'warning';
    return 'normal';
  }

  /* =====================================================================
     Question selection + generation
     ===================================================================== */

  function shuffle(arr, rng) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  // Which words a mode uses. `ctx.isKnown(wordId)` tells it what is learned.
  function poolForMode(words, mode, ctx) {
    const def = MODES[mode];
    if (!def) return [];
    if (def.filter === 'known') return words.filter(function (w) { return ctx.isKnown(w.wordId); });
    return words.slice();
  }

  // Every word appears exactly once. ~REVIEW_SHARE of the early draws come
  // from words in Review, interleaved at random with the rest.
  function orderWithReviewWeighting(pool, needsReview, rng) {
    const reviewPool = shuffle(pool.filter(function (w) { return needsReview(w.wordId); }), rng);
    const freshPool = shuffle(pool.filter(function (w) { return !needsReview(w.wordId); }), rng);
    const ordered = [];
    let ri = 0, fi = 0;
    while (ri < reviewPool.length || fi < freshPool.length) {
      let takeReview;
      if (ri >= reviewPool.length) takeReview = false;
      else if (fi >= freshPool.length) takeReview = true;
      else takeReview = rng() < REVIEW_SHARE;
      if (takeReview) ordered.push(reviewPool[ri++]); else ordered.push(freshPool[fi++]);
    }
    return ordered;
  }

  // Turns content words into quiz questions. `word` is the expected answer,
  // `meaning` is the prompt shown to the learner, `answer` is what the learner
  // has typed so far and `state` is unanswered | answered | skipped.
  function buildQuestions(words) {
    return words.map(function (w, i) {
      return { id: 'q' + (i + 1), wordId: w.wordId, word: w.word, meaning: w.meaning, pos: w.pos || null, answer: '', state: 'unanswered' };
    });
  }

  // ctx: { isKnown(id), needsReview(id), rng? }  → ordered questions
  function selectQuestions(words, mode, ctx) {
    const rng = ctx.rng || Math.random;
    const pool = poolForMode(words, mode, ctx);
    return buildQuestions(orderWithReviewWeighting(pool, ctx.needsReview, rng));
  }

  /* =====================================================================
     Session (plain data) — ux.js owns it, the functions below change it.
     The question ORDER is fixed when the session is created: random
     selection happens once (selectQuestions), and moving between questions
     never shuffles anything.
     ===================================================================== */

  function createSession(opts) {
    const questions = opts.questions;
    return {
      id: 'q_' + opts.now + '_' + Math.floor((opts.rng || Math.random)() * 1e6),
      mode: opts.mode,
      ref: opts.ref || {},
      startedAt: opts.now,
      questions: questions,
      index: 0,
      estimate: estimateDuration(questions)
    };
  }

  function currentQuestion(session) { return session.questions[session.index] || null; }
  function hasText(answer) { return normalizeAnswer(answer) !== ''; }

  // Stores what the learner typed for question `i`. Typing marks it answered;
  // clearing the box takes it back to unanswered (it becomes skipped only
  // when the learner leaves the question empty). Returns false for a bad index.
  function setAnswer(session, i, text) {
    const q = session.questions[i];
    if (!q) return false;
    q.answer = String(text == null ? '' : text);
    if (hasText(q.answer)) q.state = 'answered';
    else if (q.state === 'answered') q.state = 'unanswered';
    return true;
  }

  // Called when the learner moves AWAY from question `i`: an empty question
  // becomes skipped (automatically — there is no Skip button). A question that
  // has text stays answered. Returns true if the state changed.
  function leaveQuestion(session, i) {
    const q = session.questions[i];
    if (!q) return false;
    if (!hasText(q.answer) && q.state !== 'skipped') { q.state = 'skipped'; return true; }
    return false;
  }

  // Moves to question `target` (clamped to the quiz). Nothing is erased: the
  // answers of the question left and of the one reached are kept exactly.
  // Returns { moved, index, changedState }.
  function goTo(session, target) {
    const n = session.questions.length;
    const t = Math.max(0, Math.min(n - 1, Math.floor(Number(target) || 0)));
    if (t === session.index) return { moved: false, index: t, changedState: false };
    const changed = leaveQuestion(session, session.index);
    session.index = t;
    return { moved: true, index: t, changedState: changed };
  }

  // Counts for the completion summary + the number indicator.
  function overview(session) {
    const counts = { answered: 0, skipped: 0, unanswered: 0 };
    const items = session.questions.map(function (q, i) {
      counts[q.state]++;
      return { id: q.id, index: i, state: q.state };
    });
    return {
      total: session.questions.length, answered: counts.answered, skipped: counts.skipped, unanswered: counts.unanswered,
      unresolved: items.filter(function (it) { return it.state !== 'answered'; }).map(function (it) { return it.index; }),
      items: items
    };
  }

  // The text the desktop "Quiz Words" panel shows for a question (see PANEL).
  function panelLabel(question) { return PANEL.SHOW_ENGLISH_WORDS ? question.word : question.meaning; }

  // Immutable per-question snapshot: it carries everything needed to show
  // this answer later, even if the lesson content has changed since.
  function snapshot(question, userAnswer, verdict) {
    return {
      qid: question.id, wordId: question.wordId,
      prompt: question.meaning, expected: question.word,
      userAnswer: String(userAnswer == null ? '' : userAnswer),
      result: verdict.result, score: verdict.score
    };
  }

  // GRADING — the only place a question becomes correct / near / wrong.
  // Something typed → classified against the expected word. Nothing typed
  // (unanswered or skipped) → skipped. Does not change the session.
  function grade(session) {
    return session.questions.map(function (q) {
      const verdict = hasText(q.answer)
        ? classifyAnswer(q.answer, q.word)
        : { result: 'skipped', score: SCORING.skipped };
      return snapshot(q, hasText(q.answer) ? q.answer : '', verdict);
    });
  }

  /* =====================================================================
     Results
     ===================================================================== */

  // Counts + score from a list of answers. `total` is the number of questions.
  function summarize(answers, total) {
    const counts = { correct: 0, near: 0, wrong: 0, skipped: 0 };
    let score = 0;
    answers.forEach(function (a) {
      if (counts[a.result] !== undefined) counts[a.result]++;
      score += (typeof a.score === 'number' ? a.score : (SCORING[a.result] || 0));
    });
    const maxScore = total * SCORING.correct;
    const answered = counts.correct + counts.near + counts.wrong;
    return {
      counts: counts,
      score: score,
      maxScore: maxScore,
      percentage: maxScore > 0 ? (score / maxScore) * 100 : 0,
      answered: answered,
      accuracy: answered > 0 ? (score / answered) * 100 : null   // skipped questions excluded
    };
  }

  // The record ux.js saves to history. Self-contained: it keeps the question
  // text, expected answer, user answer, category and points for every
  // question, so it never needs the lesson files again.
  function buildRecord(session, opts) {
    const graded = grade(session);
    const s = summarize(graded, session.questions.length);
    const durationSeconds = Math.max(0, Math.min(
      Math.round((opts.now - session.startedAt) / 1000),
      session.estimate.timeLimit
    ));
    return {
      v: RECORD_VERSION,
      id: session.id,
      ts: opts.now,
      startedAt: session.startedAt,
      mode: session.mode,
      ref: session.ref,
      total: session.questions.length,
      correct: s.counts.correct, near: s.counts.near, wrong: s.counts.wrong, skipped: s.counts.skipped,
      score: s.score, maxScore: s.maxScore, percentage: s.percentage,
      durationSeconds: durationSeconds,
      estimatedDuration: session.estimate.estimatedDuration,
      estimatedRange: { min: session.estimate.estimatedRange.min, max: session.estimate.estimatedRange.max },
      timeLimit: session.estimate.timeLimit,
      timedOut: !!opts.timedOut,
      answers: graded
    };
  }

  function finiteOr(v, fallback) { return typeof v === 'number' && isFinite(v) ? v : fallback; }

  // Accepts ANY stored history record (current shape, v7 shape with
  // correctWord/meaning, older summary-only records) and returns a valid
  // current-shape record — or null if it is unusable. Counts are always
  // recomputed from the answers, so a record can never disagree with itself.
  function normalizeRecord(raw, fallbackIndex) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const ts = finiteOr(raw.ts, null);
    if (ts === null) return null;

    let answers = null;
    if (Array.isArray(raw.answers)) {
      answers = [];
      raw.answers.forEach(function (a, i) {
        if (!a || typeof a !== 'object') return;
        const result = a.result === 'close' ? 'wrong' : a.result;   // legacy: a near miss was stored as 'close' and scored as wrong
        if (CATEGORIES.indexOf(result) === -1) return;
        answers.push({
          qid: typeof a.qid === 'string' ? a.qid : 'q' + (i + 1),
          wordId: typeof a.wordId === 'string' ? a.wordId : null,
          prompt: String(a.prompt != null ? a.prompt : (a.meaning != null ? a.meaning : '')),
          expected: String(a.expected != null ? a.expected : (a.correctWord != null ? a.correctWord : '')),
          userAnswer: String(a.userAnswer != null ? a.userAnswer : ''),
          result: result,
          score: SCORING[result]
        });
      });
      if (!answers.length) answers = null;
    }

    let counts, total, score;
    if (answers) {
      const s = summarize(answers, answers.length);
      counts = s.counts; total = answers.length; score = s.score;
    } else {
      counts = {
        correct: Math.max(0, finiteOr(raw.correct, 0)), near: Math.max(0, finiteOr(raw.near, 0)),
        wrong: Math.max(0, finiteOr(raw.wrong, 0)), skipped: Math.max(0, finiteOr(raw.skipped, 0))
      };
      total = Math.max(finiteOr(raw.total, 0), counts.correct + counts.near + counts.wrong + counts.skipped);
      score = counts.correct * SCORING.correct + counts.near * SCORING.near;
      answers = [];
    }
    if (total <= 0) return null;

    const range = raw.estimatedRange && typeof raw.estimatedRange === 'object' ? raw.estimatedRange : null;
    return {
      v: RECORD_VERSION,
      id: typeof raw.id === 'string' && raw.id ? raw.id : 'q_' + ts + '_' + (fallbackIndex || 0),
      ts: ts,
      startedAt: finiteOr(raw.startedAt, null),
      mode: raw.mode === 'selected' ? 'selected' : 'full',
      ref: raw.ref && typeof raw.ref === 'object' ? { unit: raw.ref.unit, lessonKey: raw.ref.lessonKey } : {},
      total: total,
      correct: counts.correct, near: counts.near, wrong: counts.wrong, skipped: counts.skipped,
      score: score, maxScore: total * SCORING.correct, percentage: (score / (total * SCORING.correct)) * 100,
      durationSeconds: finiteOr(raw.durationSeconds, null),
      estimatedDuration: finiteOr(raw.estimatedDuration, null),
      estimatedRange: range && finiteOr(range.min, null) !== null && finiteOr(range.max, null) !== null ? { min: range.min, max: range.max } : null,
      timeLimit: finiteOr(raw.timeLimit, null),
      timedOut: !!raw.timedOut,
      answers: answers
    };
  }

  /* ---------------- Formatting helpers (pure) ---------------- */
  function formatScore(n) {
    const r = round1(n);
    return Number.isInteger(r) ? String(r) : r.toFixed(1);
  }
  function formatPercent(p) {
    const r = round1(p);
    return (Number.isInteger(r) ? String(r) : r.toFixed(1)) + '%';
  }
  function formatClock(totalSeconds) {
    let s = Math.max(0, Math.round(totalSeconds));
    const h = Math.floor(s / 3600); s -= h * 3600;
    const m = Math.floor(s / 60); s -= m * 60;
    const two = function (n) { return (n < 10 ? '0' : '') + n; };
    return h > 0 ? h + ':' + two(m) + ':' + two(s) : two(m) + ':' + two(s);
  }

  const api = {
    // constants (read-only by convention; exposed so tests and docs can cite them)
    SCORING: SCORING, CATEGORIES: CATEGORIES, LABELS: LABELS, REVIEW_RULES: REVIEW_RULES,
    NEAR_MISS: NEAR_MISS, DURATION: DURATION, TIMER: TIMER, REVIEW_SHARE: REVIEW_SHARE, MODES: MODES,
    RECORD_VERSION: RECORD_VERSION, QUESTION_STATES: QUESTION_STATES, PANEL: PANEL,
    // answers
    normalizeAnswer: normalizeAnswer, levenshtein: levenshtein, classifyAnswer: classifyAnswer, allowedEdits: allowedEdits,
    // duration + timer
    estimateDuration: estimateDuration, questionSeconds: questionSeconds, formatRange: formatRange,
    remainingSeconds: remainingSeconds, timerState: timerState,
    // questions
    poolForMode: poolForMode, orderWithReviewWeighting: orderWithReviewWeighting, buildQuestions: buildQuestions, selectQuestions: selectQuestions,
    // session
    createSession: createSession, currentQuestion: currentQuestion, setAnswer: setAnswer, leaveQuestion: leaveQuestion,
    goTo: goTo, overview: overview, panelLabel: panelLabel, grade: grade, hasText: hasText,
    // results
    summarize: summarize, buildRecord: buildRecord, normalizeRecord: normalizeRecord,
    // formatting
    formatScore: formatScore, formatPercent: formatPercent, formatClock: formatClock
  };

  root.QuizEngine = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);
