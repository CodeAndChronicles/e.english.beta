/* readme.js — README screen. Presentation only.
   Loads the real README.md file (never hard-coded here) and renders it with a
   small built-in Markdown renderer. No innerHTML and no external library:
   every node is built with createElement/textContent, so nothing in a
   Markdown file can inject markup or script.

   Supported Markdown: # headings (with anchor ids), paragraphs, bullet and
   numbered lists, tables, fenced code, block quotes, horizontal rules,
   **bold**, *italic*, `inline code`, [links](url) and ![images](local/path).
   Attaches UI.renderReadme onto the shared UI object (order-independent —
   ui.js looks it up when the tab is clicked). */
(function (global) {
  'use strict';

  function h(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (attrs[k] !== false && attrs[k] != null) node.setAttribute(k, attrs[k]);
      }
    }
    if (children) {
      (Array.isArray(children) ? children : [children]).forEach(function (c) {
        if (c == null) return;
        node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
      });
    }
    return node;
  }

  /* ---------------- Inline ---------------- */
  // Only http(s), mailto, same-page "#" anchors and relative paths are
  // allowed in links; anything else (javascript:, data:, ...) becomes text.
  function safeUrl(url) {
    const u = String(url || '').trim();
    if (/^(https?:|mailto:|#)/i.test(u)) return u;
    if (/^[a-z][a-z0-9+.-]*:/i.test(u)) return null; // any other scheme
    if (u.indexOf('//') === 0) return null;
    return u;
  }
  function slugify(text) {
    return String(text).toLowerCase().trim()
      .replace(/[^\p{L}\p{N}_\s-]/gu, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  }

  const INLINE = /(`[^`]+`)|(!\[[^\]]*\]\([^)\s]+\))|(\[[^\]]+\]\([^)\s]+\))|(\*\*[^*]+\*\*)|(\*[^*\s][^*]*\*)/;
  function inline(text, parent) {
    let rest = String(text);
    while (rest) {
      const m = INLINE.exec(rest);
      if (!m) { parent.appendChild(document.createTextNode(rest)); return; }
      if (m.index > 0) parent.appendChild(document.createTextNode(rest.slice(0, m.index)));
      const tok = m[0];
      if (m[1]) {
        parent.appendChild(h('code', { text: tok.slice(1, -1) }));
      } else if (m[2]) {
        const im = /^!\[([^\]]*)\]\(([^)\s]+)\)$/.exec(tok);
        const src = safeUrl(im[2]);
        if (src && !/^https?:|^mailto:|^#/i.test(src)) parent.appendChild(h('img', { src: src, alt: im[1], class: 'md-img' }));
        else parent.appendChild(document.createTextNode(im[1]));
      } else if (m[3]) {
        const lm = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(tok);
        const href = safeUrl(lm[2]);
        if (!href) parent.appendChild(document.createTextNode(lm[1]));
        else {
          const a = h('a', { href: href });
          inline(lm[1], a);
          if (/^https?:/i.test(href)) { a.setAttribute('target', '_blank'); a.setAttribute('rel', 'noopener noreferrer'); }
          parent.appendChild(a);
        }
      } else if (m[4]) {
        const b = h('strong'); inline(tok.slice(2, -2), b); parent.appendChild(b);
      } else if (m[5]) {
        const i = h('em'); inline(tok.slice(1, -1), i); parent.appendChild(i);
      }
      rest = rest.slice(m.index + tok.length);
    }
  }

  /* ---------------- Blocks ---------------- */
  function splitRow(line) {
    let t = line.trim();
    if (t.charAt(0) === '|') t = t.slice(1);
    if (t.charAt(t.length - 1) === '|') t = t.slice(0, -1);
    return t.split('|').map(function (c) { return c.trim(); });
  }
  const isTableSep = function (l) { return /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l) && l.indexOf('-') !== -1; };

  function render(md) {
    const root = h('div', { class: 'md-body' });
    const lines = String(md).replace(/\r\n?/g, '\n').split('\n');
    const usedIds = {};
    let i = 0;

    function uniqueId(text) {
      let base = slugify(text) || 'section', id = base, n = 1;
      while (usedIds[id]) { n++; id = base + '-' + n; }
      usedIds[id] = true;
      return id;
    }
    function startsBlock(l) {
      return /^\s*(#{1,6}\s|```|>|[-*+]\s|\d+\.\s|(-{3,}|\*{3,}|_{3,})\s*$)/.test(l);
    }

    while (i < lines.length) {
      const line = lines[i];
      if (!line.trim()) { i++; continue; }

      // fenced code
      const fence = /^\s*```\s*([\w-]*)\s*$/.exec(line);
      if (fence) {
        const buf = [];
        i++;
        while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) { buf.push(lines[i]); i++; }
        i++; // closing fence
        const pre = h('pre', { class: 'md-pre', tabindex: '0' });
        pre.appendChild(h('code', { text: buf.join('\n') }));
        root.appendChild(pre);
        continue;
      }
      // heading
      const hm = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
      if (hm) {
        const level = hm[1].length;
        // The screen already has its own <h1> ("README"), so the document's headings sit one level
        // lower (# → h2, ## → h3 …). The look still follows the Markdown level (md-h1, md-h2 …).
        const el = h('h' + Math.min(6, level + 1), { class: 'md-h md-h' + level });
        inline(hm[2], el);
        el.id = uniqueId(el.textContent);
        root.appendChild(el);
        i++;
        continue;
      }
      // horizontal rule
      if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { root.appendChild(h('hr', { class: 'md-hr' })); i++; continue; }
      // table
      if (line.indexOf('|') !== -1 && i + 1 < lines.length && isTableSep(lines[i + 1])) {
        const head = splitRow(line);
        const aligns = splitRow(lines[i + 1]).map(function (c) {
          return /^:-+:$/.test(c) ? 'center' : (/-+:$/.test(c) ? 'right' : 'start');
        });
        i += 2;
        const table = h('table', { class: 'md-table' });
        const thead = h('thead'), trh = h('tr');
        head.forEach(function (c, k) { const th = h('th'); inline(c, th); th.style.textAlign = aligns[k] || 'start'; trh.appendChild(th); });
        thead.appendChild(trh); table.appendChild(thead);
        const tbody = h('tbody');
        while (i < lines.length && lines[i].trim() && lines[i].indexOf('|') !== -1) {
          const tr = h('tr');
          splitRow(lines[i]).forEach(function (c, k) { const td = h('td'); inline(c, td); td.style.textAlign = aligns[k] || 'start'; tr.appendChild(td); });
          tbody.appendChild(tr);
          i++;
        }
        table.appendChild(tbody);
        root.appendChild(h('div', { class: 'md-table-wrap' }, [table])); // wide tables scroll inside their own box
        continue;
      }
      // block quote
      if (/^\s*>/.test(line)) {
        const buf = [];
        while (i < lines.length && /^\s*>/.test(lines[i])) { buf.push(lines[i].replace(/^\s*>\s?/, '')); i++; }
        const bq = h('blockquote', { class: 'md-quote' });
        const p = h('p'); inline(buf.join(' ').trim(), p); bq.appendChild(p);
        root.appendChild(bq);
        continue;
      }
      // lists (flat, plus one level of indented sub-items)
      const lm = /^(\s*)([-*+]|\d+\.)\s+(.*)$/.exec(line);
      if (lm) {
        const ordered = /\d/.test(lm[2]);
        const list = h(ordered ? 'ol' : 'ul', { class: 'md-list' });
        let lastLi = null;
        while (i < lines.length) {
          const m = /^(\s*)([-*+]|\d+\.)\s+(.*)$/.exec(lines[i]);
          if (!m) {
            // continuation line of the previous item
            if (lines[i].trim() && /^\s{2,}\S/.test(lines[i]) && lastLi) { lastLi.appendChild(document.createTextNode(' ')); inline(lines[i].trim(), lastLi); i++; continue; }
            break;
          }
          if (m[1].length >= 2 && lastLi) {
            let sub = lastLi.querySelector(':scope > ul, :scope > ol');
            if (!sub) { sub = h(/\d/.test(m[2]) ? 'ol' : 'ul', { class: 'md-list' }); lastLi.appendChild(sub); }
            const sli = h('li'); inline(m[3], sli); sub.appendChild(sli);
          } else {
            lastLi = h('li'); inline(m[3], lastLi); list.appendChild(lastLi);
          }
          i++;
        }
        root.appendChild(list);
        continue;
      }
      // paragraph
      const buf = [line.trim()];
      i++;
      while (i < lines.length && lines[i].trim() && !startsBlock(lines[i]) && !(lines[i].indexOf('|') !== -1 && i + 1 < lines.length && isTableSep(lines[i + 1]))) {
        buf.push(lines[i].trim()); i++;
      }
      const p = h('p', { class: 'md-p' });
      inline(buf.join(' '), p);
      root.appendChild(p);
    }

    // Same-page anchors scroll inside the app instead of changing the URL.
    root.addEventListener('click', function (e) {
      const a = e.target.closest && e.target.closest('a[href^="#"]');
      if (!a) return;
      e.preventDefault();
      const target = root.querySelector('#' + (global.CSS && CSS.escape ? CSS.escape(a.getAttribute('href').slice(1)) : a.getAttribute('href').slice(1)));
      if (target && target.scrollIntoView) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    return root;
  }

  /* ---------------- Screen ---------------- */
  const T = global.I18n.t;
  const cache = {};   // text per language, kept in memory for this session only

  function loadReadme(lang) {
    if (cache[lang] != null) return Promise.resolve(cache[lang]);
    const file = lang === 'ar' ? 'README.ar.md' : 'README.md';
    return fetch(file).then(function (res) {
      if (!res.ok) throw new Error(file + ' not found');
      return res.text();
    }).then(function (txt) { cache[lang] = txt; return txt; });
  }

  // The rendered Markdown is one flat list of blocks. Reorganize it into the
  // same card design as the rest of the app: an intro card, a row of jump
  // chips, and one card per "##" section (same content, same order).
  function toSections(body) {
    const kids = Array.prototype.slice.call(body.children);
    const wrap = h('div', { class: 'readme-wrap' });
    const hero = h('section', { class: 'card readme-hero' });
    const chips = h('nav', { class: 'readme-toc', 'aria-label': T('Contents') });
    const sections = h('div', { class: 'readme-sections' });
    let current = hero;
    kids.forEach(function (node) {
      if (node.classList && node.classList.contains('md-h2')) {
        const id = node.id;
        const title = node.textContent;
        // A hand-written "Contents" list is replaced by the chips below.
        if (/^(contents|المحتويات)$/i.test(title.trim())) { current = null; return; }
        current = h('section', { class: 'card readme-section' });
        sections.appendChild(current);
        current.appendChild(node);
        chips.appendChild(h('a', { class: 'readme-chip', href: '#' + id, text: title }));
        return;
      }
      if (current) current.appendChild(node);
    });
    wrap.appendChild(hero);
    if (chips.children.length) wrap.appendChild(chips);
    wrap.appendChild(sections);
    wrap.addEventListener('click', function (e) {
      const a = e.target.closest && e.target.closest('a.readme-chip');
      if (!a) return;
      e.preventDefault();
      const target = wrap.querySelector('#' + (global.CSS && CSS.escape ? CSS.escape(a.getAttribute('href').slice(1)) : a.getAttribute('href').slice(1)));
      if (target && target.scrollIntoView) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    return wrap;
  }

  function renderReadme() {
    const screen = document.getElementById('screen-container');
    if (!screen) return;
    while (screen.firstChild) screen.removeChild(screen.firstChild);
    if (global.UI && global.UI.showNav) global.UI.showNav('readme');
    if (global.UI && global.UI.setRoute) global.UI.setRoute({ screen: 'readme' });

    screen.appendChild(h('header', { class: 'app-header' }, [h('h1', { class: 'title-lg', text: T('README') })]));
    const holder = h('div', { class: 'readme-holder' });
    holder.appendChild(h('p', { class: 'text-muted', text: T('Loading README...') }));
    screen.appendChild(holder);
    const lang = global.I18n.getLang();

    loadReadme(lang).catch(function () {
      // No Arabic file reachable: fall back to the English README rather than nothing.
      return lang === 'ar' ? loadReadme('en') : Promise.reject(new Error('readme'));
    }).then(function (txt) {
      if (!holder.isConnected) return; // user already left this screen
      while (holder.firstChild) holder.removeChild(holder.firstChild);
      const body = render(txt);
      holder.appendChild(toSections(body));
    }).catch(function () {
      if (!holder.isConnected) return;
      while (holder.firstChild) holder.removeChild(holder.firstChild);
      holder.appendChild(h('p', { class: 'empty-note', text: T('Could not load README.md. Check your connection and try again.') }));
    });
  }

  global.I18n.extend({
    'Loading README...': 'جارٍ تحميل اقرأني...',
    'Could not load README.md. Check your connection and try again.': 'تعذّر تحميل ملف README. تحقق من اتصالك وحاول مرة أخرى.',
    'Contents': 'المحتويات'
  });

  global.UI = global.UI || {};
  global.UI.renderReadme = renderReadme;
  global.UI.renderMarkdown = render; // exposed so tests / other screens can reuse the renderer
})(window);
