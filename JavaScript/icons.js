/* icons.js — the app's single icon system.
   Every glyph is a Lucide icon (https://lucide.dev, ISC license — glyph data
   taken from lucide-static 1.48.0), inlined here so the UI never depends on
   a CDN and works offline. 24x24 viewBox, stroke=currentColor, 2px stroke:
   one consistent line weight everywhere.

   Public API is unchanged: Icons.svg(name[, extraClass]) -> SVGElement.
   Names may keep the old "lucide:" prefix. Legacy names from earlier
   versions still resolve through ALIASES, so nothing that references an
   old name breaks. An unknown name falls back to "file-text" and warns in
   the console, so a typo is visible instead of silently wrong. */
(function (global) {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';

  // Inner markup of each 24x24 stroke icon.
  const PATHS = {
    house: '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/> <path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    'wifi-off': '<path d="M12 20h.01"/> <path d="M8.5 16.429a5 5 0 0 1 7 0"/> <path d="M5 12.859a10 10 0 0 1 5.17-2.69"/> <path d="M19 12.859a10 10 0 0 0-2.007-1.523"/> <path d="M2 8.82a15 15 0 0 1 4.177-2.643"/> <path d="M22 8.82a15 15 0 0 0-11.288-3.764"/> <path d="m2 2 20 20"/>',
    smartphone: '<rect width="14" height="20" x="5" y="2" rx="2" ry="2"/> <path d="M12 18h.01"/>',
    'hard-drive': '<line x1="22" x2="2" y1="12" y2="12"/> <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/> <line x1="6" x2="6.01" y1="16" y2="16"/> <line x1="10" x2="10.01" y1="16" y2="16"/>',
    'shield-check': '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/> <path d="m9 12 2 2 4-4"/>',
    sparkles: '<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/> <path d="M20 3v4"/> <path d="M22 5h-4"/> <path d="M4 17v2"/> <path d="M5 18H3"/>',
    database: '<ellipse cx="12" cy="5" rx="9" ry="3"/> <path d="M3 5V19A9 3 0 0 0 21 19V5"/> <path d="M3 12A9 3 0 0 0 21 12"/>',
    'message-circle': '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
    languages: '<path d="m5 8 6 6"/> <path d="m4 14 6-6 2-3"/> <path d="M2 5h12"/> <path d="M7 2h1"/> <path d="m22 22-5-10-5 10"/> <path d="M14 18h6"/>',
    bug: '<path d="m8 2 1.88 1.88"/> <path d="M14.12 3.88 16 2"/> <path d="M9 7.13v-1a3.003 3.003 0 1 1 6 0v1"/> <path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6"/> <path d="M12 20v-9"/> <path d="M6.53 9C4.6 8.8 3 7.1 3 5"/> <path d="M6 13H2"/> <path d="M3 21c0-2.1 1.7-3.9 3.8-4"/> <path d="M20.97 5c0 2.1-1.6 3.8-3.5 4"/> <path d="M22 13h-4"/> <path d="M17.2 17c2.1.1 3.8 1.9 3.8 4"/>',
    tag: '<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/> <circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/>',
    'chart-column': '<path d="M3 3v16a2 2 0 0 0 2 2h16"/> <path d="M18 17V9"/> <path d="M13 17V5"/> <path d="M8 17v-3"/>',
    settings: '<path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"/> <circle cx="12" cy="12" r="3"/>',
    info: '<circle cx="12" cy="12" r="10"/> <path d="M12 16v-4"/> <path d="M12 8h.01"/>',
    search: '<path d="m21 21-4.34-4.34"/> <circle cx="11" cy="11" r="8"/>',
    library: '<path d="m16 6 4 14"/> <path d="M12 6v14"/> <path d="M8 8v12"/> <path d="M4 4v16"/>',
    'notebook-text': '<path d="M2 6h4"/> <path d="M2 10h4"/> <path d="M2 14h4"/> <path d="M2 18h4"/> <rect width="16" height="20" x="4" y="2" rx="2"/> <path d="M9.5 8h5"/> <path d="M9.5 12H16"/> <path d="M9.5 16H14"/>',
    book: '<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20"/>',
    'book-open': '<path d="M12 5v16"/> <path d="M20.001 19A2 2 0 0022 17V5a2 2 0 00-1.999-2L16 3.002A5 5 0 0012 5a5 5 0 00-4-2H4a2 2 0 00-2 2v12a2 2 0 001.999 2H8a5 5 0 014 2 5 5 0 014-2z"/>',
    'book-a': '<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20"/> <path d="m8 13 4-7 4 7"/> <path d="M9.1 11h5.7"/>',
    'arrow-left-right': '<path d="M8 3 4 7l4 4"/> <path d="M4 7h16"/> <path d="m16 21 4-4-4-4"/> <path d="M20 17H4"/>',
    'message-square-quote': '<path d="M14 14a2 2 0 0 0 2-2V8h-2"/> <path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"/> <path d="M8 14a2 2 0 0 0 2-2V8H8"/>',
    'list-tree': '<path d="M8 5h13"/> <path d="M13 12h8"/> <path d="M13 19h8"/> <path d="M3 10a2 2 0 0 0 2 2h3"/> <path d="M3 5v12a2 2 0 0 0 2 2h3"/>',
    'circle-check': '<circle cx="12" cy="12" r="10"/> <path d="m16 9-5.5 5.5L8 12"/>',
    'circle-dashed': '<path d="M10.1 2.182a10 10 0 0 1 3.8 0"/> <path d="M13.9 21.818a10 10 0 0 1-3.8 0"/> <path d="M17.609 3.721a10 10 0 0 1 2.69 2.7"/> <path d="M2.182 13.9a10 10 0 0 1 0-3.8"/> <path d="M20.279 17.609a10 10 0 0 1-2.7 2.69"/> <path d="M21.818 10.1a10 10 0 0 1 0 3.8"/> <path d="M3.721 6.391a10 10 0 0 1 2.7-2.69"/> <path d="M6.391 20.279a10 10 0 0 1-2.69-2.7"/>',
    'circle-x': '<circle cx="12" cy="12" r="10"/> <path d="m15 9-6 6"/> <path d="m9 9 6 6"/>',
    smile: '<path d="M15 10V9"/> <path d="M16.472 15a6 6 0 01-8.943 0"/> <path d="M9 10V9"/> <circle cx="12" cy="12" r="10"/>',
    flame: '<path d="M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0 5 5 0 0 1 1-3 1 1 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4"/>',
    flag: '<path d="M4 22V4a1 1 0 0 1 .4-.8A6 6 0 0 1 8 2c3 0 5 2 7.333 2q2 0 3.067-.8A1 1 0 0 1 20 4v10a1 1 0 0 1-.4.8A6 6 0 0 1 16 16c-3 0-5-2-8-2a6 6 0 0 0-4 1.528"/>',
    equal: '<line x1="5" x2="19" y1="9" y2="9"/> <line x1="5" x2="19" y1="15" y2="15"/>',
    'equal-not': '<line x1="5" x2="19" y1="9" y2="9"/> <line x1="5" x2="19" y1="15" y2="15"/> <line x1="19" x2="5" y1="5" y2="19"/>',
    list: '<path d="M3 5h.01"/> <path d="M3 12h.01"/> <path d="M3 19h.01"/> <path d="M8 5h13"/> <path d="M8 12h13"/> <path d="M8 19h13"/>',
    'list-checks': '<path d="M13 5h8"/> <path d="M13 12h8"/> <path d="M13 19h8"/> <path d="m3 17 2 2 4-4"/> <path d="m3 7 2 2 4-4"/>',
    'clipboard-list': '<rect width="8" height="4" x="8" y="2" rx="1" ry="1"/> <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/> <path d="M12 11h4"/> <path d="M12 16h4"/> <path d="M8 11h.01"/> <path d="M8 16h.01"/>',
    'skip-forward': '<path d="M21 4v16"/> <path d="M6.029 4.285A2 2 0 0 0 3 6v12a2 2 0 0 0 3.029 1.715l9.997-5.998a2 2 0 0 0 .003-3.432z"/>',
    'pencil-line': '<path d="M13 21h8"/> <path d="m15 5 4 4"/> <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/>',
    star: '<path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"/>',
    palette: '<path d="M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z"/> <circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/> <circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/> <circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/> <circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/>',
    'swatch-book': '<path d="M11 17a4 4 0 0 1-8 0V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2Z"/> <path d="M16.7 13H19a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H7"/> <path d="M 7 17h.01"/> <path d="m11 8 2.3-2.3a2.4 2.4 0 0 1 3.404.004L18.6 7.6a2.4 2.4 0 0 1 .026 3.434L9.9 19.8"/>',
    'sun-moon': '<path d="M12 2v2"/> <path d="M14.837 16.385a6 6 0 1 1-7.223-7.222c.624-.147.97.66.715 1.248a4 4 0 0 0 5.26 5.259c.589-.255 1.396.09 1.248.715"/> <path d="M16 12a4 4 0 0 0-4-4"/> <path d="m19 5-1.256 1.256"/> <path d="M20 12h2"/>',
    sun: '<circle cx="12" cy="12" r="4"/> <path d="M12 2v2"/> <path d="M12 20v2"/> <path d="m4.93 4.93 1.41 1.41"/> <path d="m17.66 17.66 1.41 1.41"/> <path d="M2 12h2"/> <path d="M20 12h2"/> <path d="m6.34 17.66-1.41 1.41"/> <path d="m19.07 4.93-1.41 1.41"/>',
    moon: '<path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401"/>',
    monitor: '<rect width="20" height="14" x="2" y="3" rx="2"/> <line x1="8" x2="16" y1="21" y2="21"/> <line x1="12" x2="12" y1="17" y2="21"/>',
    lightbulb: '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/> <path d="M9 18h6"/> <path d="M10 22h4"/>',
    'sliders-horizontal': '<path d="M10 5H3"/> <path d="M12 19H3"/> <path d="M14 3v4"/> <path d="M16 17v4"/> <path d="M21 12h-9"/> <path d="M21 19h-5"/> <path d="M21 5h-7"/> <path d="M8 10v4"/> <path d="M8 12H3"/>',
    'monitor-smartphone': '<path d="M18 8V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h8"/> <path d="M10 19v-3.96 3.15"/> <path d="M7 19h5"/> <rect width="6" height="10" x="16" y="12" rx="2"/>',
    download: '<path d="M12 15V3"/> <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/> <path d="m7 10 5 5 5-5"/>',
    upload: '<path d="M12 3v12"/> <path d="m17 8-5-5-5 5"/> <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>',
    'trash-2': '<path d="M10 11v6"/> <path d="M14 11v6"/> <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/> <path d="M3 6h18"/> <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    'chevron-left': '<path d="m15 18-6-6 6-6"/>',
    'chevron-right': '<path d="m9 18 6-6-6-6"/>',
    'arrow-right': '<path d="M5 12h14"/> <path d="m12 5 7 7-7 7"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    minus: '<path d="M5 12h14"/>',
    x: '<path d="M18 6 6 18"/> <path d="m6 6 12 12"/>',
    clock: '<circle cx="12" cy="12" r="10"/> <path d="M12 6v6l4 2"/>',
    history: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/> <path d="M3 3v5h5"/> <path d="M12 7v5l4 2"/>',
    'triangle-alert': '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/> <path d="M12 9v4"/> <path d="M12 17h.01"/>',
    'server-off': '<path d="M7 2h13a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-5"/> <path d="M10 10 2.5 2.5C2 2 2 2.5 2 5v3a2 2 0 0 0 2 2h6z"/> <path d="M22 17v-1a2 2 0 0 0-2-2h-1"/> <path d="M4 14a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h16.5l1-.5.5.5-8-8H4z"/> <path d="M6 18h.01"/> <path d="m2 2 20 20"/>',
    'file-text': '<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/> <path d="M14 2v5a1 1 0 0 0 1 1h5"/> <path d="M10 9H8"/> <path d="M16 13H8"/> <path d="M16 17H8"/>',
    'book-open-text': '<path d="M12 5v16"/> <path d="M16 13h2"/> <path d="M16 9h2"/> <path d="M20.001 19A2 2 0 0022 17V5a2 2 0 00-1.999-2L16 3.002A5 5 0 0012 5a5 5 0 00-4-2H4a2 2 0 00-2 2v12a2 2 0 001.999 2H8a5 5 0 014 2 5 5 0 014-2z"/> <path d="M6 13h2"/> <path d="M6 9h2"/>',
    'chevron-down': '<path d="m6 9 6 6 6-6"/>',
    'arrow-left': '<path d="m12 19-7-7 7-7"/> <path d="M19 12H5"/>',
    'equal-approximately': '<path d="M5 15a6.5 6.5 0 0 1 7 0 6.5 6.5 0 0 0 7 0"/> <path d="M5 9a6.5 6.5 0 0 1 7 0 6.5 6.5 0 0 0 7 0"/>',
    timer: '<line x1="10" x2="14" y1="2" y2="2"/> <line x1="12" x2="15" y1="14" y2="11"/> <circle cx="12" cy="14" r="8"/>',
    type: '<path d="M12 4v16"/> <path d="M4 7V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2"/> <path d="M9 20h6"/>'
  };

  // Old name -> current Lucide name.
  const ALIASES = {
      "bar-chart-2": "chart-column",
      "home": "house",
      "check-circle": "circle-check",
      "x-circle": "circle-x",
      "minus-circle": "circle-dashed",
      "plus-circle": "equal",
      "alert-triangle": "triangle-alert",
      "quote": "message-square-quote",
      "repeat": "arrow-left-right",
      "git-branch": "list-tree",
      "layers": "library",
      "battery-charging": "lightbulb",
      "cpu": "monitor-smartphone",
      "smartphone": "monitor-smartphone",
      "database": "sliders-horizontal"
  };

  function resolve(name) {
    const key = String(name || '').replace(/^lucide:/, '');
    return ALIASES[key] || key;
  }

  function svg(name, extraClass) {
    const key = resolve(name);
    if (!PATHS[key]) console.warn('[Icons] unknown icon:', name);
    const inner = PATHS[key] || PATHS['file-text'];
    const el = document.createElementNS(NS, 'svg');
    el.setAttribute('viewBox', '0 0 24 24');
    el.setAttribute('fill', 'none');
    el.setAttribute('stroke', 'currentColor');
    el.setAttribute('stroke-width', '2');
    el.setAttribute('stroke-linecap', 'round');
    el.setAttribute('stroke-linejoin', 'round');
    el.setAttribute('aria-hidden', 'true');
    el.classList.add('icon');
    if (extraClass) extraClass.split(' ').forEach(function (c) { if (c) el.classList.add(c); });
    el.innerHTML = inner;
    return el;
  }

  global.Icons = { svg: svg, has: function (name) { return !!PATHS[resolve(name)]; } };
})(window);
