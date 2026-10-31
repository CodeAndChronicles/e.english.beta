/* settings.js — Presentation layer for the Settings screen ONLY.
   Same rules as ui.js: no direct localStorage, everything goes through
   window.UX. Loaded after ui.js and attaches UI.renderSettings onto the
   same global UI object (order-independent — ui.js's nav handler looks
   this property up at click time, not at load time). */
(function (global) {
  'use strict';

  /* ---------------- tiny local DOM helpers (mirrors ui.js's h/icon) ---------------- */
  function h(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
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
  const T = global.I18n.t;   // English text is the key; Arabic when selected (JavaScript/i18n.js)
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  // Seven choices: Default + six palettes (see CSS/root.css). Palettes from earlier
  // versions keep working (and keep their name here) but are not offered any more.
  const COLOR_LABELS = { burgundy: 'Burgundy', lavender: 'Lavender', sky: 'Sky Blue', lime: 'Lime', orange: 'Orange', teal: 'Teal',
    midnight: 'Midnight', plum: 'Plum', petrol: 'Petrol', umber: 'Umber', rose: 'Rose', sand: 'Sand' };
  const COLOR_ORDER = ['burgundy', 'lavender', 'sky', 'lime', 'orange', 'teal'];

  // Advanced is collapsed every time Settings is opened from the nav; it only
  // stays open across the re-render that follows a successful import.

  /* ---------------- Wake Lock (keep screen on) ----------------
     Best-effort only: unsupported browsers just keep the toggle off and
     the app still works normally without it. Re-acquired on tab return
     since the OS/browser silently drops the lock when the tab is hidden. */
  let wakeLock = null;
  function releaseWakeLock() {
    if (wakeLock) { try { wakeLock.release(); } catch (e) {} wakeLock = null; }
  }
  function requestWakeLock() {
    if (!navigator.wakeLock || typeof navigator.wakeLock.request !== 'function') return Promise.reject(new Error('unsupported'));
    return navigator.wakeLock.request('screen').then(function (wl) {
      wakeLock = wl;
      wl.addEventListener('release', function () { wakeLock = null; });
    });
  }
  // ONE routine for both controls (the quick button in the floating group and the
  // Settings switch). The saved state lives only in UX; this just applies it.
  // Resolves true when the lock is held, false when switched off or unsupported.
  function applyKeepAwake(on) {
    UX.setKeepAwake(on);                       // emits 'keep-awake-changed' -> every control re-syncs
    if (!on) { releaseWakeLock(); return Promise.resolve(false); }
    return requestWakeLock().then(function () { return true; }).catch(function () {
      UX.setKeepAwake(false);                  // never show "on" when the lock could not be taken
      showToast('This browser does not support keeping the screen awake', 'warn');
      return false;
    });
  }
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && UX.getKeepAwake() && !wakeLock) {
      requestWakeLock().catch(function () {});
    }
  });

  /* ---------------- Local data: export / import / delete ---------------- */
  function downloadJSON(obj, filename) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function showToast(msg, kind) {
    const t = h('div', { class: 'settings-toast settings-toast-' + (kind || 'ok'), text: T(msg) });
    document.body.appendChild(t);
    requestAnimationFrame(function () { t.classList.add('show'); });
    setTimeout(function () {
      t.classList.remove('show');
      setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 250);
    }, 2200);
  }

  /* ---------------- Small reusable row builders ---------------- */

  // A segmented control is a radio group: one option selected, arrow keys move
  // (and select), only the selected option is in the tab order. The pill slides.
  function segmented(options, activeValue, onChange) {
    const wrap = h('div', { class: 'segmented', role: 'radiogroup' });
    wrap.appendChild(h('span', { class: 'seg-thumb', 'aria-hidden': 'true' }));
    wrap.style.setProperty('--n', String(options.length));
    function select(btn, fire) {
      setSegActive(wrap, btn.dataset.value);
      if (fire) onChange(btn.dataset.value);
    }
    options.forEach(function (opt) {
      const btn = h('button', {
        type: 'button', class: 'segmented-btn', role: 'radio',
        onclick: function () { select(btn, true); },
        onkeydown: function (e) {
          const rtl = document.documentElement.dir === 'rtl';
          let step = 0;
          if (e.key === 'ArrowRight') step = rtl ? -1 : 1;
          else if (e.key === 'ArrowLeft') step = rtl ? 1 : -1;
          else if (e.key === 'ArrowDown') step = 1;
          else if (e.key === 'ArrowUp') step = -1;
          if (!step) return;
          e.preventDefault();
          const all = Array.prototype.slice.call(wrap.querySelectorAll('.segmented-btn'));
          const next = all[(all.indexOf(btn) + step + all.length) % all.length];
          next.focus(); select(next, true);
        }
      }, [
        opt.icon ? icon(opt.icon, 'segmented-icon') : null,
        h('span', { class: 'segmented-label', text: opt.label }),
        opt.sub ? h('span', { class: 'segmented-sub', text: opt.sub }) : null
      ]);
      btn.dataset.value = opt.value;
      if (opt.title) btn.setAttribute('title', opt.title);
      wrap.appendChild(btn);
    });
    setSegActive(wrap, activeValue);
    return wrap;
  }
  function setSegActive(wrap, value) {
    wrap.querySelectorAll('.segmented-btn').forEach(function (b) {
      const on = b.dataset.value === value;
      b.classList.toggle('active', on);
      b.setAttribute('aria-checked', on ? 'true' : 'false');
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.tabIndex = on ? 0 : -1;
    });
    syncThumb(wrap);
  }
  // The selected-state pill slides to the active option (CSS transition on --i).
  function syncThumb(wrap) {
    const btns = Array.prototype.slice.call(wrap.querySelectorAll('.segmented-btn'));
    const i = Math.max(0, btns.findIndex(function (b) { return b.classList.contains('active'); }));
    wrap.style.setProperty('--i', String(i));
  }

  function toggleSwitch(checked, onChange, label) {
    const input = h('input', { type: 'checkbox', class: 'switch-input visually-hidden', role: 'switch', 'aria-label': label ? T(label) : T('Toggle') });
    const state = h('span', { class: 'switch-state', 'aria-hidden': 'true' });
    input.checked = !!checked;
    function paint() { state.textContent = input.checked ? T('On') : T('Off'); }
    paint();
    input.addEventListener('change', function () { paint(); onChange(input.checked); });
    const lab = h('label', { class: 'switch' }, [state, input, h('span', { class: 'switch-track' })]);
    lab._input = input; lab._paint = paint;
    return lab;
  }
  // A labelled option row: title + hint on the start side, the control on the end side.
  function switchRow(title, sub, control) {
    return h('div', { class: 'switch-row' }, [
      h('div', { class: 'settings-row-text' }, [
        h('div', { class: 'settings-row-title', text: T(title) }),
        sub ? h('div', { class: 'settings-row-sub', text: T(sub) }) : null
      ]),
      control
    ]);
  }
  // A stacked field: title + hint, then the control underneath (segmented / chips).
  function field(title, sub, control, extra) {
    return h('div', { class: 'field' }, [
      h('div', { class: 'field-head' }, [
        h('div', { class: 'settings-row-title', text: T(title) }),
        sub ? h('div', { class: 'settings-row-sub', text: T(sub) }) : null
      ]),
      control, extra || null
    ]);
  }

  /* ================= Settings screen ================= */
  function render(opts) {
    const screen = document.getElementById('screen-container');
    if (!screen) return;
    clear(screen);
    if (global.UI && global.UI.showNav) global.UI.showNav('settings');
    if (global.UI && global.UI.setRoute) global.UI.setRoute({ screen: 'settings' });

    screen.appendChild(h('header', { class: 'app-header' }, [h('h1', { class: 'title-lg', text: T('Settings') })]));

    /* ---- Cards: Appearance, Behavior, Storage — then Data management last ---- */
    function groupCard(iconName, title, extra) {
      const c = h('section', { class: 'card settings-card' + (extra ? ' ' + extra : ''), 'aria-label': T(title) });
      c.appendChild(h('h2', { class: 'info-card-title settings-card-title' }, [
        h('span', { class: 'card-title-icon', 'aria-hidden': 'true' }, [icon(iconName)]), h('span', { text: T(title) })
      ]));
      return c;
    }
    const appearanceCard = groupCard('palette', 'Appearance');
    const motionCard = groupCard('sliders-horizontal', 'Behavior');
    const studyCard = motionCard;            // keep-awake lives in the same Behavior card
    const storageCard = groupCard('database', 'Local storage');
    const dataCard = groupCard('download', 'Data management', 'settings-data-card');

    // Language
    const langSeg = segmented(
      [{ value: 'ar', label: '\u0627\u0644\u0639\u0631\u0628\u064A\u0629' }, { value: 'en', label: 'English' }],
      UX.getLanguage(),
      function (val) { UX.setLanguage(val); }
    );
    langSeg.classList.add('segmented-full', 'segmented-lang');
    langSeg.setAttribute('aria-label', T('Language'));
    appearanceCard.appendChild(field('Language', 'Choose the language of the whole interface', langSeg));

    // Theme mode
    const themeSeg = segmented(
      [
        { value: 'light', label: T('Light'), icon: 'sun' },
        { value: 'dark', label: T('Dark'), icon: 'moon' },
        { value: 'system', label: T('System'), icon: 'monitor' }
      ],
      UX.getThemePreference(),
      function (val) { UX.setTheme(val); }
    );
    themeSeg.classList.add('segmented-full', 'segmented-theme');
    themeSeg.setAttribute('aria-label', T('Theme mode'));
    appearanceCard.appendChild(field('Theme mode', 'Light, dark, or follow your device', themeSeg));

    /* Font style: Auto (stored value 'o2', default) / Regular / Bold. One preference
       (UX.getFontMode); ui.js turns it into <html data-font>. */
    const fontSeg = segmented(
      [
        { value: 'o2', label: T('Auto') },
        { value: 'regular', label: T('Regular') },
        { value: 'bold', label: T('Bold') }
      ],
      UX.getFontMode(),
      function (val) { UX.setFontMode(val); }
    );
    fontSeg.classList.add('segmented-full', 'segmented-font');
    fontSeg.setAttribute('aria-label', T('Font style'));
    const fontHelp = h('ul', { class: 'font-help' }, [
      h('li', {}, [h('strong', { text: T('Auto') }), h('span', { class: 'font-help-tag', text: T('Recommended') }), ' \u2014 ' + T('Bold headings, Regular text.')]),
      h('li', {}, [h('strong', { text: T('Regular') }), ' \u2014 ' + T('All text Regular.')]),
      h('li', {}, [h('strong', { text: T('Bold') }), ' \u2014 ' + T('All text Bold.')])
    ]);
    appearanceCard.appendChild(field('Font style', null, fontSeg, fontHelp));

    // Accent color: compact capsules, each = round swatch + visible name (real radio inputs)
    const colorPicker = h('div', { class: 'palette-chips', role: 'radiogroup', 'aria-label': T('Accent color') });
    function markActiveColor() {
      const cur = UX.getThemeColor();
      colorPicker.querySelectorAll('.palette-chip').forEach(function (c) {
        const on = c.dataset.color === cur;
        c.classList.toggle('active', on);
        c.querySelector('input').checked = on;
      });
    }
    function paletteChip(color, label, dotClass) {
      const input = h('input', { type: 'radio', name: 'palette', value: color, class: 'chip-input visually-hidden', 'aria-label': label });
      input.addEventListener('change', function () { UX.setThemeColor(color); markActiveColor(); });
      return h('label', { class: 'palette-chip', 'data-color': color }, [
        input, h('span', { class: 'swatch-dot ' + dotClass }), h('span', { class: 'palette-chip-name', text: label }), h('span', { class: 'radio-mark', 'aria-hidden': 'true' })
      ]);
    }
    // "Default" is not a palette: it is the neutral look with no accent picked.
    colorPicker.appendChild(paletteChip('default', T('Default'), 'swatch-default'));
    COLOR_ORDER.forEach(function (c) { colorPicker.appendChild(paletteChip(c, T(COLOR_LABELS[c]), 'swatch-' + c)); });
    // A saved palette from an earlier version is never removed or remapped behind
    // the person's back: it keeps working until they pick one of the seven.
    const cur0 = UX.getThemeColor();
    let retiredNote = null;
    if (cur0 !== 'default' && COLOR_ORDER.indexOf(cur0) === -1) {
      retiredNote = h('p', { class: 'palette-retired-note' }, [
        h('span', { class: 'swatch-dot swatch-' + cur0 }),
        h('span', { text: T('Your current palette ({name}) is no longer offered. Pick one of the seven.', { name: T(COLOR_LABELS[cur0] || cur0) }) })
      ]);
    }
    appearanceCard.appendChild(field('Accent color', 'Default is a neutral graphite. Pick a palette to use one accent everywhere.', colorPicker, retiredNote));
    markActiveColor();

    // Keep screen awake: ONE state (UX) + ONE routine (applyKeepAwake), also driven by
    // the quick button; this switch just mirrors 'keep-awake-changed'.
    const awakeSwitch = toggleSwitch(UX.getKeepAwake(), function (checked) { applyKeepAwake(checked); }, 'Keep screen awake');
    awakeSwitch.classList.add('awake-switch');
    studyCard.appendChild(switchRow('Keep screen awake', 'Stops the screen from turning off while you study', awakeSwitch));
    /* ---- Animations: on/off + a tiny preview. Off (or the device's reduced-motion
       setting) means no movement anywhere; the preview just stays still. ---- */
    const motionActive = function () { return UX.getAnimationsEnabled() && !(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches); };
    const demoBox = h('span', { class: 'anim-demo', 'aria-hidden': 'true' }, [h('span', { class: 'anim-demo-dot' })]);
    const reducedNote = h('div', { class: 'settings-row-sub anim-note', text: T('Your device asks for reduced motion, so animations stay off.') });
    reducedNote.hidden = !(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
    function syncDemo() { demoBox.classList.toggle('playing', motionActive()); }
    motionCard.appendChild(switchRow('Animations', 'Smooth movement and transitions', h('span', { class: 'anim-controls' }, [demoBox, toggleSwitch(
      UX.getAnimationsEnabled(),
      function (checked) { UX.setAnimationsEnabled(checked); syncDemo(); },
      'Animations'
    )])));
    motionCard.appendChild(reducedNote);
    syncDemo();

    /* ---- Local storage indicator (real browser estimate only) ---- */
    const storageBar = h('div', { class: 'progress-bar storage-bar', role: 'progressbar', 'aria-label': T('Local storage') }, [h('div', { class: 'progress-fill' })]);
    const storageText = h('div', { class: 'storage-text text-muted', text: T('Calculating...') });
    const storageNote = h('div', { class: 'settings-row-sub storage-note', text: T('The bar compares usage with a 1 GB reference scale. Browsers do not all guarantee 1 GB.') });
    storageBar.hidden = true;
    storageCard.appendChild(h('div', { class: 'storage-row' }, [storageBar, storageText, storageNote]));
    function fmtBytes(n) {
      if (n < 1024) return n + ' B';
      const u = ['KB', 'MB', 'GB', 'TB']; let v = n, i = -1;
      do { v /= 1024; i++; } while (v >= 1024 && i < u.length - 1);
      return v.toFixed(v < 10 ? 2 : 1) + ' ' + u[i];
    }
    (function measureStorage() {
      const st = global.navigator && global.navigator.storage;
      if (!st || typeof st.estimate !== 'function') { storageText.textContent = T('Storage usage is unavailable in this browser.'); storageNote.hidden = true; return; }
      st.estimate().then(function (est) {
        if (!est || typeof est.usage !== 'number' || !isFinite(est.usage)) throw new Error('no usage');
        const ref = 1024 * 1024 * 1024;
        const share = Math.min(est.usage / ref, 1);
        storageBar.hidden = false;
        storageBar.firstChild.style.width = Math.max(share * 100, est.usage > 0 ? 1 : 0) + '%';
        storageBar.setAttribute('aria-valuenow', String(Math.round(share * 1000) / 10));
        const pctTxt = share * 100 < 0.1 ? '<0.1%' : (share * 100).toFixed(1) + '%';
        storageText.textContent = T('Used {used} \u00B7 {pct} of the 1 GB scale', { used: fmtBytes(est.usage), pct: pctTxt });
      }).catch(function () { storageBar.hidden = true; storageNote.hidden = true; storageText.textContent = T('Storage usage is unavailable in this browser.'); });
    })();

    screen.appendChild(h('div', { class: 'settings-grid masonry' }, [appearanceCard, motionCard, storageCard]));

    /* ---- Data management: always visible, last section on the page ---- */
    dataCard.appendChild(h('p', { class: 'settings-row-sub settings-card-sub', text: T('Back up your progress, restore it, or erase it from this device.') }));
    const dataActions = h('div', { class: 'settings-data-actions' });
    dataCard.appendChild(dataActions);
    dataActions.appendChild(h('button', {
      class: 'btn btn-secondary settings-action-btn',
      onclick: function () {
        const data = UX.exportAllData();
        const stamp = new Date(data.exportedAt).toISOString().slice(0, 10);
        downloadJSON(data, 'eenglish-backup-' + stamp + '.json');
        showToast('Your data was exported', 'ok');
      }
    }, [icon('download'), h('span', { text: T('Export Data') })]));

    const importInput = h('input', { type: 'file', accept: 'application/json', class: 'visually-hidden', 'aria-label': T('Choose a backup file to import'), tabindex: '-1' });
    importInput.addEventListener('change', function () {
      const file = importInput.files && importInput.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function () {
        let parsed = null;
        try { parsed = JSON.parse(String(reader.result)); } catch (e) { parsed = null; }
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          if (!confirm(T('Importing will replace your current progress with the data in this file. Continue?'))) return;
        }
        if (parsed && UX.importAllData(parsed)) {
          showToast('Data imported successfully', 'ok');
          render();
        } else {
          showToast('This file is not a valid E.English backup', 'warn');
        }
      };
      reader.readAsText(file);
      importInput.value = '';
    });
    dataActions.appendChild(importInput);
    dataActions.appendChild(h('button', {
      class: 'btn btn-secondary settings-action-btn',
      onclick: function () { importInput.click(); }
    }, [icon('upload'), h('span', { text: T('Import Data') })]));

    dataActions.appendChild(h('button', {
      class: 'btn btn-danger settings-action-btn',
      onclick: function () {
        if (confirm(T('Are you sure? All your progress (learned words, review lists, and quiz history) will be deleted permanently.'))) {
          releaseWakeLock();
          UX.resetAllData();
          global.location.reload();
        }
      }
    }, [icon('trash-2'), h('span', { text: T('Delete All Data') })]));
    screen.appendChild(dataCard);

  }

  // ONE theme preference (UX.getThemePreference), two controls: this selector
  // and the floating button. Whenever the preference changes — from either —
  // the selector (if Settings is open) just reflects it; it keeps no state.
  UX.on('theme-preference-changed', function (pref) {
    document.querySelectorAll('.segmented-theme').forEach(function (w) { setSegActive(w, pref); });
  });
  // Same idea for the font style (it can also change through an import) and the language.
  UX.on('font-mode-changed', function (mode) {
    document.querySelectorAll('.segmented-font').forEach(function (w) { setSegActive(w, mode); });
  });
  // Keep screen awake: whichever control changed it, the Settings switch just mirrors UX.
  UX.on('keep-awake-changed', function (on) {
    document.querySelectorAll('.awake-switch').forEach(function (sw) { sw._input.checked = !!on; sw._paint(); });
  });

  global.UI = global.UI || {};
  global.UI.renderSettings = render;
  global.UI.applyKeepAwake = applyKeepAwake;
  global.UI.keepAwakeHeld = function () { return !!wakeLock; };   // read-only (used to verify real behaviour)

  // Best-effort re-acquire on boot if the user had it on last time — most
  // browsers require a user gesture, so this may silently fail and that's
  // fine; the visibilitychange listener above tries again once the person
  // actually interacts with the tab.
  if (UX.getKeepAwake()) requestWakeLock().catch(function () {});
})(window);
