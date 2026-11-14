/* pages.js — the Feedback screen and the "About" part of the Info screen
   (version, changelog, purpose). Presentation only, same pattern as readme.js /
   settings.js: it attaches UI.renderFeedback and UI.infoCards onto the shared UI
   object, and ui.js looks them up when they are needed (load order does not matter).

   Text: short labels go through I18n.t (the one translation mechanism); the longer
   bilingual content below is kept as data, one list per language, so the
   10-sentence description and the changelog can be checked at a glance. */
(function (global) {
  'use strict';

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
        node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
      });
    }
    return node;
  }
  function icon(name, extraClass) { return Icons.svg(name, extraClass); }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  const T = global.I18n.t;
  function pick(content) { return content[global.I18n.getLang()] || content.en; }

  /* Interface labels used only here. */
  global.I18n.extend({
    'Feedback and contact': 'الملاحظات والتواصل',
    'Help make E.English better': 'ساعدنا في تحسين E.English',
    'You can contact the developer to report a bug, suggest an improvement, share your opinion, or send any other feedback.': 'يمكنك التواصل مع المطوّر للإبلاغ عن خطأ، أو اقتراح تحسين، أو مشاركة رأيك، أو إرسال أي ملاحظات أخرى.',
    'What you can send': 'ما الذي يمكنك إرساله',
    'Bug reports': 'بلاغات الأخطاء', 'Something does not work or looks wrong.': 'شيء لا يعمل أو يظهر بشكل خاطئ.',
    'Suggestions': 'اقتراحات', 'An idea for a new feature or an improvement.': 'فكرة لميزة جديدة أو تحسين.',
    'Opinions': 'آراء', 'What you like and what could be better.': 'ما يعجبك وما يمكن أن يكون أفضل.',
    'General feedback': 'ملاحظات عامة', 'Anything else you want the developer to know.': 'أي شيء آخر تريد أن يعرفه المطوّر.',
    'Describing a problem': 'كيف تصف المشكلة',
    'Which feature or screen is affected (for example Quiz, Search, Settings).': 'ما الميزة أو الشاشة المتأثرة (مثل الاختبار أو البحث أو الإعدادات).',
    'The steps to repeat the problem, one by one.': 'خطوات تكرار المشكلة واحدة تلو الأخرى.',
    'What you expected to happen and what happened instead.': 'ما الذي كنت تتوقع حدوثه وما الذي حدث فعلًا.',
    'Your device and browser, and the app version shown on the Info page.': 'جهازك والمتصفح، ورقم إصدار التطبيق الظاهر في صفحة المعلومات.',
    'Contact me on WhatsApp': 'تواصل معي عبر واتساب',
    'WhatsApp username': 'اسم المستخدم على واتساب',
    'The button opens a WhatsApp chat with the developer. This website does not send, collect or store your message.': 'يفتح الزر محادثة واتساب مع المطوّر. هذا الموقع لا يرسل رسالتك ولا يجمعها ولا يخزّنها.',
    'If the button does not open WhatsApp, search for this username in WhatsApp.': 'إذا لم يفتح الزر واتساب، ابحث عن اسم المستخدم هذا داخل واتساب.',
    'Version': 'الإصدار', 'Information': 'المعلومات', "What's New": 'الجديد', 'Features': 'المزايا', 'Icon Legend': 'دليل الأيقونات', 'Keyboard Shortcuts': 'اختصارات لوحة المفاتيح', 'Feature status': 'حالة الميزة', 'Word status': 'حالة الكلمة', 'Quiz answers': 'إجابات الاختبار',
    'New, or dependent on your device or browser, and still open to change. A feature with no mark is considered stable.': 'جديدة، أو تعتمد على جهازك أو متصفحك، وقد تتغير. والميزة التي لا علامة عليها تُعدّ مستقرة.',
    'You marked the word as learned.': 'حدّدت الكلمة كمحفوظة.', 'The word is in Review: you flagged it, or a quiz answer put it there.': 'الكلمة في المراجعة: إما علّمتها بنفسك أو وضعتها فيها إجابة في اختبار.',
    'You have not marked the word either way.': 'لم تحدّد الكلمة بأي من الحالتين.', 'The answer matched the word.': 'طابقت الإجابة الكلمة.', 'Almost right \u2014 a small typing mistake (half a point).': 'شبه صحيحة \u2014 خطأ كتابي صغير (نصف نقطة).',
    'The answer did not match.': 'لم تطابق الإجابة.', 'The question was left empty.': 'تُرك السؤال فارغًا.',
    'Open search (goes to Home first)': 'فتح البحث (ينتقل إلى الرئيسية أولًا)', 'Go to Home, Statistics, History, Settings, Info, Feedback, README': 'الانتقال إلى الرئيسية والإحصائيات والسجل والإعدادات والمعلومات والملاحظات واقرأني',
    'Clear the search box, or close the More menu': 'مسح مربع البحث، أو إغلاق قائمة المزيد', 'In a quiz answer box: next question': 'في مربع إجابة الاختبار: السؤال التالي',
    'In Settings option groups (language, theme, font, color): move and select': 'في مجموعات خيارات الإعدادات (اللغة والمظهر والخط واللون): تنقّل واختيار',
    'Shortcuts do not work while you type in a field or during a quiz, and are ignored when Ctrl, Alt or Cmd is held.': 'لا تعمل الاختصارات أثناء الكتابة في حقل أو أثناء الاختبار، وتُتجاهل عند الضغط على Ctrl أو Alt أو Cmd.', 'Bugs Fixed': 'الأخطاء التي أُصلحت', 'Version 11 series': 'سلسلة الإصدار 11', 'Beta': 'تجريبي',
    'marks Beta features: new, or dependent on your device or browser, and still open to change.': 'تميّز الخصائص التجريبية: الجديدة أو المعتمدة على جهازك أو متصفحك، وقد تتغير.',
    'Offline-first': 'يعمل بدون إنترنت', 'Installable web app': 'تطبيق ويب قابل للتثبيت', 'Local data': 'بيانات محلية',
    'Local learning data': 'بيانات تعلّم محلية', 'Progress tracking': 'تتبّع التقدّم',
    'English + Arabic': 'إنجليزي + عربي', 'Light & dark': 'فاتح وداكن'
  });

  /* ---------------- Feedback ---------------- */
  // The contact link is the exact username link generated by WhatsApp for the
  // developer's account. It is used as given — no phone number, no username key.
  const WHATSAPP_URL = 'https://wa.me/Ma7mee7o?s=t';
  const WHATSAPP_USERNAME = '@Ma7mee7o';

  function infoItem(iconName, title, text) {
    return h('li', { class: 'fb-item' }, [
      h('span', { class: 'fb-item-icon' }, [icon(iconName)]),
      h('div', { class: 'fb-item-body' }, [
        h('div', { class: 'fb-item-title', text: T(title) }),
        h('div', { class: 'text-muted', text: T(text) })
      ])
    ]);
  }

  function renderFeedback() {
    const screen = document.getElementById('screen-container');
    if (!screen) return;
    clear(screen);
    if (global.UI && global.UI.showNav) global.UI.showNav('feedback');
    if (global.UI && global.UI.setRoute) global.UI.setRoute({ screen: 'feedback' });

    const page = h('div', { class: 'feedback-page' });
    page.appendChild(h('header', { class: 'app-header' }, [h('h1', { class: 'title-lg', text: T('Feedback') })]));

    // 1) Intro + the contact action (first, so it is visible without scrolling).
    const contact = h('section', { class: 'card fb-contact tone-blue', 'aria-label': T('Feedback and contact') }, [
      h('span', { class: 'fb-contact-icon' }, [icon('message-circle')]),
      h('h2', { class: 'info-card-title', text: T('Help make E.English better') }),
      h('p', { class: 'fb-lead', text: T('You can contact the developer to report a bug, suggest an improvement, share your opinion, or send any other feedback.') }),
      h('a', { class: 'btn btn-primary fb-wa-btn', href: WHATSAPP_URL, target: '_blank', rel: 'noopener noreferrer' }, [
        icon('message-circle'), h('span', { text: T('Contact me on WhatsApp') })
      ]),
      h('div', { class: 'fb-username' }, [
        h('span', { class: 'text-muted', text: T('WhatsApp username') + ':' }),
        h('strong', { class: 'fb-username-text', dir: 'ltr', text: WHATSAPP_USERNAME })
      ]),
      h('p', { class: 'text-muted fb-note', text: T('If the button does not open WhatsApp, search for this username in WhatsApp.') }),
      h('p', { class: 'text-muted fb-note', text: T('The button opens a WhatsApp chat with the developer. This website does not send, collect or store your message.') })
    ]);
    page.appendChild(contact);

    const grid = h('div', { class: 'fb-grid masonry' });
    // 2) What can be sent.
    grid.appendChild(h('section', { class: 'card info-card' }, [
      titleWithIcon('message-circle', T('What you can send')),
      h('ul', { class: 'fb-list' }, [
        infoItem('bug', 'Bug reports', 'Something does not work or looks wrong.'),
        infoItem('lightbulb', 'Suggestions', 'An idea for a new feature or an improvement.'),
        infoItem('message-circle', 'Opinions', 'What you like and what could be better.'),
        infoItem('info', 'General feedback', 'Anything else you want the developer to know.')
      ])
    ]));
    // 3) How to describe a problem.
    grid.appendChild(h('section', { class: 'card info-card' }, [
      titleWithIcon('list-checks', T('Describing a problem')),
      h('ol', { class: 'fb-steps' }, [
        'Which feature or screen is affected (for example Quiz, Search, Settings).',
        'The steps to repeat the problem, one by one.',
        'What you expected to happen and what happened instead.',
        'Your device and browser, and the app version shown on the Info page.'
      ].map(function (k) { return h('li', { text: T(k) }); }))
    ]));
    page.appendChild(grid);
    screen.appendChild(page);
  }

  /* ---------------- Info: version, changelog, purpose ---------------- */
  // What's New — the whole Version 11 series, oldest first. Every line comes from the release
  // notes of that version (nothing is guessed); versions without a record are not listed.
  const SERIES = {
    en: [
      ['11.0', 'Arabic and English interface with right-to-left layout; your language choice is saved.'],
      ['11.0', 'Feedback section with a WhatsApp contact button; Info shows the version and what is new.'],
      ['11.0', 'Seven color choices for Light, Dark and System modes, and a Read Me organised in sections, with an Arabic version.'],
      ['11.2', 'Units 4 to 6 added; Home shows each unit\u2019s word count; Review grouped by unit with each word\u2019s Arabic translation.'],
      ['11.2', 'Settings: compact selectors, an animations switch with a preview, a local storage indicator, and the font option named Auto.'],
      ['11.3', 'Pill-shaped navigation with a More menu; language and theme as separate buttons; Info and Settings redesigned in cards.'],
      ['11.3', 'Review uses the flag button and keeps a removed word for 3 seconds; language switching also works on the screen shown when lessons cannot load from a file.'],
      ['11.3.1', 'Cards size to their own content, the palette colors the whole app, palette options show their names, progress bars and navigation animate, and a Keep screen awake quick button joins the controls.'],
      ['11.3.2', 'One central color system (ColorSystem.css and ColorSystem.js); Word Review and Quiz History as cards; Study Method separates ordered steps from tips.'],
      ['11.3.2', 'Offline start is stricter: the app is only installed offline when every essential file is saved, and both Read Me files work without a connection. Keyboard shortcuts added (Beta).'],
      ['11.3.4', 'A word is either Learned or Needs review, never both; Home, lessons and groups show how many words are in each state, and Review says why a word is there.'],
      ['11.3.4', 'New Home heading with overall progress, a cleaner search box, refined cards, a natural highlighter look, an English Study Method, and an Info page with an Icon Legend and the keyboard shortcuts. Grey is the default palette.']
    ],
    ar: [
      ['11.0', 'واجهة بالعربية والإنجليزية مع تخطيط من اليمين إلى اليسار، ويُحفظ اختيار اللغة.'],
      ['11.0', 'قسم للملاحظات مع زر واتساب للتواصل؛ وتعرض المعلومات الإصدار والجديد.'],
      ['11.0', 'سبعة خيارات للألوان في الوضع الفاتح والداكن والنظام، وصفحة اقرأني منظمة في أقسام مع نسخة عربية.'],
      ['11.2', 'إضافة الوحدات من 4 إلى 6؛ وتعرض الشاشة الرئيسية عدد كلمات كل وحدة؛ والمراجعة مجمّعة حسب الوحدة مع الترجمة العربية لكل كلمة.'],
      ['11.2', 'الإعدادات: أزرار اختيار مدمجة، ومفتاح للحركة مع معاينة، ومؤشر للتخزين المحلي، وخيار الخط باسم تلقائي.'],
      ['11.3', 'تنقل بشكل حبة دائرية كاملة مع قائمة المزيد؛ واللغة والمظهر كزرّين منفصلين؛ وإعادة تصميم المعلومات والإعدادات في بطاقات.'],
      ['11.3', 'تستخدم المراجعة زر العلم وتُبقي الكلمة المُزالة 3 ثوانٍ؛ ويعمل تبديل اللغة أيضًا في الشاشة التي تظهر عند تعذّر تحميل الدروس من ملف.'],
      ['11.3.1', 'تتحدد أحجام البطاقات بمحتواها، وتلوّن اللوحة التطبيق كله، وتعرض خيارات اللوحات أسماءها، وتتحرك أشرطة التقدم والتنقل، وينضم زر سريع لإبقاء الشاشة مضاءة.'],
      ['11.3.2', 'نظام ألوان مركزي واحد (ColorSystem.css وColorSystem.js)؛ ومراجعة الكلمات وسجل الاختبارات في بطاقات؛ وطريقة مذاكرة تفصل الخطوات المرتبة عن النصائح.'],
      ['11.3.2', 'بدء أدق بدون إنترنت: لا يُثبَّت التطبيق إلا بعد حفظ كل الملفات الأساسية، وتعمل نسختا اقرأني بدون اتصال. وأُضيفت اختصارات لوحة المفاتيح (تجريبي).'],
      ['11.3.4', 'الكلمة إما محفوظة أو تحتاج مراجعة، ولا تكون الاثنتين معًا؛ وتعرض الرئيسية والدروس والمجموعات عدد الكلمات في كل حالة، وتوضح المراجعة سبب وجود الكلمة فيها.'],
      ['11.3.4', 'عنوان جديد للشاشة الرئيسية مع التقدّم الكلي، ومربع بحث أنظف، وبطاقات مصقولة، وتظليل بمظهر طبيعي، وطريقة مذاكرة بالإنجليزية، وصفحة معلومات بدليل للأيقونات واختصارات لوحة المفاتيح. والرمادي هو اللوحة الافتراضية.']
    ]
  };

  // Bugs Fixed — only fixes made in THIS release (11.3.4).
  const BUGS = {
    en: [
      'The search box drew a second rectangular outline inside its rounded border when focused; it now has one clear focus ring.',
      'The search results list could take up most of the screen; it now has a limited height and scrolls.',
      'A word could be both Learned and flagged for Review at the same time. They now replace each other; for old data that held both, the Review flag is kept.',
      'What\u2019s New and Bugs Fixed looked stuck together; they are now separate cards.',
      'Highlighted text looked like rigid rectangles; it now looks like a real highlighter stroke.',
      'The Study Method existed only in Arabic; the English interface now has its own English version.'
    ],
    ar: [
      'كان مربع البحث يرسم إطارًا مستطيلًا ثانيًا داخل حدّه المستدير عند التركيز؛ وله الآن حلقة تركيز واحدة واضحة.',
      'كانت قائمة نتائج البحث قد تستحوذ على معظم الشاشة؛ وصار لها الآن ارتفاع محدود مع تمرير.',
      'كانت الكلمة قد تكون محفوظة ومعلَّمة للمراجعة في الوقت نفسه. صارتا الآن تحلّان محل بعضهما؛ وفي البيانات القديمة التي جمعت الاثنتين يُحتفظ بعلامة المراجعة.',
      'كان الجديد والأخطاء التي أُصلحت يبدوان ملتصقين؛ وصارا الآن بطاقتين منفصلتين.',
      'كان النص المظلَّل يبدو كمستطيلات جامدة؛ وصار الآن بمظهر ضربة قلم تظليل حقيقية.',
      'كانت طريقة المذاكرة بالعربية فقط؛ وللواجهة الإنجليزية الآن نسختها الإنجليزية.'
    ]
  };

  // Exactly 3 sentences per language (one sentence per array item).
  const PURPOSE = {
    en: [
      'E.English is a free study website that helps you learn English vocabulary step by step, with lessons organized into units.',
      'You can practice with quizzes, review the words you missed, and follow your progress and quiz history in Statistics.',
      'Everything is saved on your own device, works offline after your first visit, and can be used in English or Arabic.'
    ],
    ar: [
      'E.English موقع مجاني لمذاكرة مفردات اللغة الإنجليزية خطوة بخطوة، ودروسه منظمة في وحدات.',
      'يمكنك التدرّب بالاختبارات ومراجعة الكلمات التي أخطأت فيها ومتابعة تقدّمك وسجل اختباراتك في الإحصائيات.',
      'يُحفظ كل شيء على جهازك، ويعمل بدون إنترنت بعد زيارتك الأولى، ويمكن استخدامه بالعربية أو الإنجليزية.'
    ]
  };

  // Six feature tags — each one is something the code really does:
  // offline = service worker caches the app + lessons; installable = web manifest
  // (standalone) + service worker; local data = progress kept in the browser only;
  // no account = there is no sign-in anywhere; languages = i18n; themes = Light/Dark/System.
  const FEATURES = [
    ['wifi-off', 'Offline-first', 'offline'], ['smartphone', 'Installable web app', 'install'], ['hard-drive', 'Local learning data', 'local'],
    ['languages', 'English + Arabic', 'lang'], ['chart-column', 'Progress tracking', 'progress'], ['sun-moon', 'Light & dark', 'theme']
  ];

  function betaMark() { return h('span', { class: 'beta-mark', role: 'img', 'aria-label': T('Beta'), title: T('Beta') }, [icon('flask-conical')]); }

  function titleWithIcon(iconName, text) {
    return h('h2', { class: 'info-card-title' }, [h('span', { class: 'card-title-icon', 'aria-hidden': 'true' }, [icon(iconName)]), h('span', { text: text })]);
  }

  function currentVersion() {
    try { return String((global.UX && global.UX.getAppVersionInfo().current) || ''); } catch (e) { return ''; }
  }

  // Information: version + six identity tags + the three-sentence description.
  function informationCard() {
    const version = currentVersion();
    return h('section', { class: 'card info-card about-card', 'aria-label': T('Information') }, [
      h('div', { class: 'about-head' }, [
        titleWithIcon('info', T('Information')),
        version ? h('span', { class: 'version-badge' }, [h('span', { class: 'version-badge-label', text: T('Version') }), h('strong', { text: version })]) : null
      ]),
      h('ul', { class: 'feature-tags', 'aria-label': T('Features') }, FEATURES.map(function (f) {
        return h('li', { class: 'feature-tag', 'data-tag': f[2] }, [icon(f[0]), h('span', { text: T(f[1]) }), f[2] === 'install' ? betaMark() : null]);
      })),
      h('p', { class: 'about-purpose', text: pick(PURPOSE).join(' ') })
    ]);
  }

  // What's New and Bugs Fixed are two independent cards (long lists flow in two columns on wide screens).
  function whatsNewCard() {
    return h('section', { class: 'card info-card info-wide', 'aria-label': T("What's New") }, [
      h('div', { class: 'about-head' }, [titleWithIcon('sparkles', T("What's New")), h('span', { class: 'series-note', text: T('Version 11 series') })]),
      h('ol', { class: 'changelog' }, pick(SERIES).map(function (r) {
        return h('li', {}, [h('span', { class: 'cl-ver', text: r[0] }), h('span', { text: ' ' + r[1] })]);
      }))
    ]);
  }
  function bugsCard() {
    return h('section', { class: 'card info-card info-wide', 'aria-label': T('Bugs Fixed') }, [
      h('div', { class: 'about-head' }, [titleWithIcon('bug', T('Bugs Fixed')), h('span', { class: 'series-note', text: T('Version') + ' ' + currentVersion() })]),
      h('ul', { class: 'bugs-list' }, pick(BUGS).map(function (line) { return h('li', { text: line }); }))
    ]);
  }

  // Icon Legend — only symbols that really appear in the app.
  function legendRow(iconName, name, text, cls) {
    return h('li', { class: 'legend-row' }, [
      h('span', { class: 'legend-icon ' + (cls || ''), 'aria-hidden': 'true' }, [icon(iconName)]),
      h('div', { class: 'legend-text' }, [h('div', { class: 'legend-name', text: T(name) }), h('div', { class: 'text-muted', text: T(text) })])
    ]);
  }
  function legendCard() {
    return h('section', { class: 'card info-card', 'aria-label': T('Icon Legend') }, [
      titleWithIcon('list', T('Icon Legend')),
      h('h3', { class: 'legend-group', text: T('Feature status') }),
      h('ul', { class: 'legend-list' }, [
        legendRow('flask-conical', 'Beta', 'New, or dependent on your device or browser, and still open to change. A feature with no mark is considered stable.', 'lg-beta')
      ]),
      h('h3', { class: 'legend-group', text: T('Word status') }),
      h('ul', { class: 'legend-list' }, [
        legendRow('circle-check', 'Learned', 'You marked the word as learned.', 'lg-learned'),
        legendRow('flag', 'Needs review', 'The word is in Review: you flagged it, or a quiz answer put it there.', 'lg-review'),
        legendRow('circle-dashed', 'Not classified', 'You have not marked the word either way.', 'lg-none')
      ]),
      h('h3', { class: 'legend-group', text: T('Quiz answers') }),
      h('ul', { class: 'legend-list' }, [
        legendRow('check', 'Correct', 'The answer matched the word.', 'lg-correct'),
        legendRow('equal-approximately', 'Near Miss', 'Almost right \u2014 a small typing mistake (half a point).', 'lg-near'),
        legendRow('x', 'Wrong', 'The answer did not match.', 'lg-wrong'),
        legendRow('minus', 'Skipped', 'The question was left empty.', 'lg-skipped')
      ])
    ]);
  }

  // Keyboard Shortcuts — exactly the ones the app implements.
  function shortcutRow(keys, action) {
    return h('li', { class: 'sc-row' }, [
      h('span', { class: 'sc-keys' }, keys.map(function (k) { return h('kbd', { text: k }); })),
      h('span', { class: 'sc-action', text: T(action) })
    ]);
  }
  function shortcutsCard() {
    return h('section', { class: 'card info-card', 'aria-label': T('Keyboard Shortcuts') }, [
      h('h2', { class: 'info-card-title' }, [h('span', { class: 'card-title-icon', 'aria-hidden': 'true' }, [icon('keyboard')]), h('span', { text: T('Keyboard Shortcuts') }), betaMark()]),
      h('ul', { class: 'sc-list' }, [
        shortcutRow(['/'], 'Open search (goes to Home first)'),
        shortcutRow(['1', '\u2013', '7'], 'Go to Home, Statistics, History, Settings, Info, Feedback, README'),
        shortcutRow(['Esc'], 'Clear the search box, or close the More menu'),
        shortcutRow(['Enter'], 'In a quiz answer box: next question'),
        shortcutRow(['\u2190', '\u2192'], 'In Settings option groups (language, theme, font, color): move and select')
      ]),
      h('p', { class: 'text-muted sc-note', text: T('Shortcuts do not work while you type in a field or during a quiz, and are ignored when Ctrl, Alt or Cmd is held.') })
    ]);
  }

  global.UI = global.UI || {};
  global.UI.renderFeedback = renderFeedback;
  global.UI.infoCards = { information: informationCard, whatsNew: whatsNewCard, bugs: bugsCard, legend: legendCard, shortcuts: shortcutsCard };
  global.UI.betaMark = betaMark;
  // Exposed (read-only) so the sentence count can be verified.
  global.UI.aboutContent = { purpose: PURPOSE, series: SERIES, bugs: BUGS, whatsappUrl: WHATSAPP_URL };
})(window);
