/* ColorSystem.js — applies the chosen theme + palette to the whole site, in ONE place.

   What it does
   • The choice itself is NOT stored here. It lives in UX (UX.setTheme / UX.setThemeColor,
     the same two localStorage keys as before), so there is exactly one source of truth
     and no new storage key. This file only listens to UX and applies the result.
   • "Applying" means setting two attributes on <html> — data-theme and data-color — and
     updating the browser toolbar color. Every color on the site (CSS/ColorSystem.css) is
     derived from those two attributes, so nothing is re-rendered and no per-element
     style is written.
   • Applying the same values twice does nothing (no attribute write, no style recalc).
   • When the browser supports View Transitions and animations are on, the change is a
     short cross-fade of one snapshot of the page. That costs the same however many
     elements the page has — unlike a CSS transition on every element, which made the
     whole page run a transition per property per element and felt like a very low frame
     rate. Without support, or with animations off / reduced motion, the change is instant.

   Load order: after ux.js (needs UX), before ui.js. It applies the saved choice as soon as
   it loads, so the first screen is already in the right colors. */
(function (global) {
  'use strict';
  const UX = global.UX;
  const root = document.documentElement;
  if (!UX) { return; }

  // Palettes that can be picked (Default = no data-color). Saved palettes from older
  // versions are still accepted and applied; they are just not offered any more.
  const OFFERED = ['default', 'burgundy', 'lavender', 'sky', 'lime', 'orange', 'teal'];
  const state = { theme: null, color: undefined };   // what is currently applied
  let busy = false;                                  // a view transition is running

  function setAttr(name, value) {
    if (value == null) { if (root.hasAttribute(name)) root.removeAttribute(name); }
    else if (root.getAttribute(name) !== value) root.setAttribute(name, value);
  }

  // Browser/mobile toolbar color follows the active theme + palette: the page background
  // in the default look and in dark mode, the palette's accent fill in light mode.
  function syncMeta() {
    const meta = document.getElementById('meta-theme-color');
    if (!meta) return;
    const cs = global.getComputedStyle(root);
    const useAccent = state.theme !== 'dark' && state.color != null;
    const val = (useAccent ? cs.getPropertyValue('--color-primary') : cs.getPropertyValue('--color-background')).trim();
    if (val && meta.getAttribute('content') !== val) meta.setAttribute('content', val);
  }

  function commit(theme, color) {
    setAttr('data-theme', theme);
    setAttr('data-color', color);
    state.theme = theme;
    state.color = color;
    syncMeta();
  }

  function motionAllowed() {
    return UX.getAnimationsEnabled() && !(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  // theme: 'light' | 'dark' (the EFFECTIVE theme); color: palette id, 'default' or null.
  // Returns true when something changed.
  function apply(theme, color, animate) {
    const nextTheme = theme === 'dark' ? 'dark' : 'light';
    const nextColor = (!color || color === 'default') ? null : String(color);
    if (state.theme === nextTheme && state.color === nextColor) return false;
    if (animate && !busy && typeof document.startViewTransition === 'function' && motionAllowed()) {
      busy = true;
      let t;
      try { t = document.startViewTransition(function () { commit(nextTheme, nextColor); }); }
      catch (e) { busy = false; commit(nextTheme, nextColor); return true; }
      const done = function () { busy = false; };
      t.finished.then(done, done);
    } else {
      commit(nextTheme, nextColor);
    }
    return true;
  }

  function init() {
    apply(UX.getTheme(), UX.getThemeColor(), false);
    UX.on('theme-changed', function (theme) { apply(theme, UX.getThemeColor(), true); });
    UX.on('theme-color-changed', function (color) { apply(UX.getTheme(), color, true); });
  }

  global.ColorSystem = {
    OFFERED: OFFERED.slice(),
    apply: function (theme, color) { return apply(theme, color, true); },
    current: function () { return { theme: state.theme, color: state.color || 'default' }; }
  };
  init();
})(window);
