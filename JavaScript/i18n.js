/* i18n.js — the ONE translation mechanism for E.English (English ⇄ Arabic).

   How it works
   • The English text itself is the key: I18n.t('Settings') returns "Settings" in
     English and the Arabic text from the dictionary below when Arabic is selected.
     A text with no Arabic entry simply stays English, so nothing can ever break.
   • Dynamic text uses {placeholders}: I18n.t('Question {i} of {n}', { i: 2, n: 10 }).
   • Other files (pages.js, readme.js) add their own entries with I18n.extend({...}),
     so every screen goes through this same function.
   • Only the INTERFACE is translated. Vocabulary words, their meanings, answers and
     the Arabic study text are content and are never passed through here.

   This file keeps NO storage of its own: the chosen language is saved by ux.js
   (UX.setLanguage → 'eenglish.lang'), which calls I18n.setLang(). Direction
   (<html dir>) and language (<html lang>) are applied by ui.js. */
(function (global) {
  'use strict';

  let lang = 'en';

  /* ---------------- Arabic dictionary (key = the English text) ---------------- */
  const AR = {
    /* Navigation */
    'Home': 'الرئيسية', 'Statistics': 'الإحصائيات', 'Quiz History': 'سجل الاختبارات', 'History': 'السجل',
    'Settings': 'الإعدادات', 'Info': 'معلومات', 'README': 'اقرأني', 'Feedback': 'ملاحظات', 'Back': 'رجوع',
    'Theme': 'المظهر', 'Switch to': 'التبديل إلى', 'Light': 'فاتح', 'Dark': 'داكن', 'System': 'النظام',
    'min': 'د',

    /* Home / units / lessons */
    'Choose a unit to start studying': 'اختر وحدة لتبدأ الدراسة',
    'Search for a word...': 'ابحث عن كلمة...', 'Search words': 'البحث في الكلمات',
    'No content is available right now.': 'لا يوجد محتوى متاح حاليًا.',
    'Unit ': 'الوحدة ', 'Lesson ': 'الدرس ', 'Group ': 'المجموعة ', 'progress': 'التقدم',
    'No words found for \u201C': 'لا توجد كلمات مطابقة لـ \u201C',
    'Back to the unit': 'الرجوع إلى الوحدة', 'This section could not be loaded': 'تعذّر تحميل هذا القسم',
    'lesson set': 'مجموعة دروس', 'lesson sets': 'مجموعات دروس', 'section': 'قسم', 'sections': 'أقسام',
    'result': 'نتيجة', 'results': 'نتائج', 'word': 'كلمة', 'words': 'كلمات',
    'Vocabulary': 'المفردات', 'Synonyms & Antonyms': 'المترادفات والأضداد', 'Idioms & Phrasal Verbs': 'التعابير والأفعال المركّبة',
    'Derivatives': 'المشتقات', 'Synonyms': 'المترادفات', 'Antonyms': 'الأضداد',
    'Mark every word in this group as learned': 'تحديد كل كلمات هذه المجموعة كمحفوظة',
    'Expand or collapse group': 'فتح المجموعة أو طيّها', 'Mark as learned: ': 'تحديد كمحفوظة: ',
    'Easy': 'سهلة', 'Hard': 'صعبة', 'Learned': 'محفوظة', 'Not learned': 'غير محفوظة',
    'Remove from review': 'إزالة من المراجعة', 'Add to review': 'إضافة إلى المراجعة', 'In review': 'في المراجعة', 'Review': 'مراجعة',

    /* Quiz launch */
    'Full Quiz': 'اختبار كامل', 'Selected Quiz': 'اختبار المحفوظات',
    'Mark some words as learned first to unlock the Selected Quiz.': 'حدّد بعض الكلمات كمحفوظة أولًا لتفعيل اختبار المحفوظات.',
    'No words yet': 'لا توجد كلمات بعد', 'Estimated time: ': 'الوقت المتوقع: ', 'Learn some words to unlock': 'احفظ بعض الكلمات للتفعيل',

    /* Statistics */
    'Nothing to review right now. Nice work!': 'لا شيء للمراجعة الآن. أحسنت!',
    '{k} of {n} words learned': '{k} من {n} كلمة محفوظة', 'Words to review (': 'كلمات للمراجعة (',
    'Vocabulary progress': 'تقدّم المفردات', 'Overall progress': 'التقدّم الكلي', 'By content type': 'حسب نوع المحتوى',

    /* Quiz */
    'Cancel quiz': 'إلغاء الاختبار', 'Time left': 'الوقت المتبقي', 'Review answers and finish': 'مراجعة الإجابات والإنهاء',
    'Review and finish': 'مراجعة وإنهاء', 'Questions': 'الأسئلة', 'Quiz words': 'كلمات الاختبار', 'Quiz': 'الاختبار',
    'Review & finish': 'مراجعة وإنهاء', 'Question {i} of {n}': 'السؤال {i} من {n}',
    'answered': 'تمت الإجابة', 'skipped': 'تم التخطي', 'not answered yet': 'بدون إجابة بعد',
    'Question ': 'السؤال ', 'current question': 'السؤال الحالي',
    'Your answer': 'إجابتك', 'Your answer for question ': 'إجابتك للسؤال ',
    'Answer saved \u2014 you can change it any time': 'تم حفظ الإجابة \u2014 يمكنك تغييرها في أي وقت',
    'Skipped \u2014 you can still answer it': 'تم التخطي \u2014 يمكنك الإجابة عنه لاحقًا',
    'Not answered yet': 'لم تتم الإجابة بعد', 'Previous question': 'السؤال السابق', 'Previous': 'السابق',
    'Type the English word': 'اكتب الكلمة الإنجليزية', 'Ready to finish?': 'هل أنت مستعد للإنهاء؟',
    'Answered': 'تمت الإجابة', 'Skipped': 'تم التخطي', 'Unanswered': 'بدون إجابة',
    'Questions without an answer': 'أسئلة بدون إجابة', 'Go to question ': 'الانتقال إلى السؤال ',
    '{n} no answer yet. Tap a number to go back to it. If you finish now, they count as skipped.': '{n} بدون إجابة حتى الآن. اضغط على رقم للعودة إليه. إذا أنهيت الآن فسيُحسب ما بلا إجابة كمتخطّى.',
    'question has': 'سؤال', 'questions have': 'أسئلة',
    'Every question has an answer.': 'كل الأسئلة لها إجابة.', 'Back to questions': 'الرجوع إلى الأسئلة', 'Finish quiz': 'إنهاء الاختبار',
    'Time is almost up.': 'الوقت يوشك على الانتهاء.', 'Time is running low.': 'الوقت يقترب من النهاية.',

    /* Results / history */
    'Vocabulary quiz': 'اختبار مفردات', 'Score': 'الدرجة', 'Score ': 'الدرجة ', 'Percentage': 'النسبة المئوية', 'Time ran out': 'انتهى الوقت',
    'Advanced Details': 'تفاصيل متقدمة', 'Exact score': 'الدرجة الدقيقة', 'Maximum score': 'الدرجة القصوى',
    'Accuracy (answered)': 'الدقة (للأسئلة المجاب عنها)', 'Correct': 'صحيحة', 'Near Miss': 'قريبة', 'Wrong': 'خاطئة',
    'Time spent': 'الوقت المستغرق', 'Estimated time': 'الوقت المتوقع', 'Time limit': 'الحد الزمني',
    'Question breakdown': 'تفصيل الأسئلة', 'Question details were not saved for this quiz.': 'لم تُحفظ تفاصيل الأسئلة لهذا الاختبار.',
    'Filter questions': 'تصفية الأسئلة', 'All': 'الكل', 'Nothing here.': 'لا شيء هنا.', 'You wrote: ': 'كتبتَ: ',
    'Quiz results': 'نتيجة الاختبار', 'Back to home': 'العودة إلى الرئيسية',
    'Your last 40 quizzes, newest first': 'آخر 40 اختبارًا، الأحدث أولًا',
    'No quizzes yet. Finish a quiz and it will appear here.': 'لا توجد اختبارات بعد. أنهِ اختبارًا وسيظهر هنا.',
    'Back to Quiz History': 'الرجوع إلى سجل الاختبارات',

    /* Blocked screen */
    'Run the site from a local server': 'شغّل الموقع من خادم محلي',
    'Browsers block reading the Files/*.md lessons when index.html is opened directly by double-click.': 'تمنع المتصفحات قراءة دروس Files/*.md عند فتح index.html مباشرةً بالنقر المزدوج.',
    'With VS Code: install the Live Server extension and open index.html with it.': 'مع VS Code: ثبّت إضافة Live Server وافتح index.html بها.',
    'Or open a terminal in the project folder and run: python -m http.server 8000': 'أو افتح الطرفية في مجلد المشروع ونفّذ: python -m http.server 8000',
    'Then open http://localhost:8000 in your browser.': 'ثم افتح http://localhost:8000 في المتصفح.',

    /* Info */
    'Highlighter colors': 'ألوان التظليل', 'Study method': 'طريقة المذاكرة', 'Parts of speech': 'أقسام الكلام',
    'Every word has a tag such as n. or v. next to it. It tells you what job the word does in a sentence. Each tag has its own color.': 'بجانب كل كلمة وسم مثل n. أو v. يوضح وظيفة الكلمة في الجملة، ولكل وسم لونه الخاص.',
    'Examples: ': 'أمثلة: ', 'Other': 'أخرى',
    'Some words have two tags separated by a slash, such as n./v. That means the word can work as either one.': 'بعض الكلمات لها وسمان تفصل بينهما شرطة مائلة مثل n./v.، أي أن الكلمة تعمل بأحد الدورين.',
    '\u00A9 2026 E.English. All rights reserved.': '\u00A9 2026 E.English. جميع الحقوق محفوظة.',
    'Noun': 'اسم', 'Verb': 'فعل', 'Adjective': 'صفة', 'Adverb': 'ظرف', 'Pronoun': 'ضمير', 'Preposition': 'حرف جر', 'Conjunction': 'أداة ربط',
    'Phrasal verb': 'فعل مركّب', 'Noun phrase': 'عبارة اسمية', 'Adjective phrase': 'عبارة وصفية', 'Phrase': 'عبارة',
    'A word used to name a person, place, thing, or idea.': 'كلمة تسمّي شخصًا أو مكانًا أو شيئًا أو فكرة.',
    'A word that describes an action, a state, or something that happens.': 'كلمة تصف فعلًا أو حالة أو شيئًا يحدث.',
    'A word that describes a noun or gives more information about it.': 'كلمة تصف الاسم أو تعطي معلومات أكثر عنه.',
    'A word that describes a verb, an adjective, or another adverb.': 'كلمة تصف فعلًا أو صفة أو ظرفًا آخر.',
    'A word used in place of a noun so you do not have to repeat it.': 'كلمة تحل محل الاسم حتى لا تكرره.',
    'A word that shows how a noun relates to another word, such as place, time, or direction.': 'كلمة توضح علاقة الاسم بكلمة أخرى، مثل المكان أو الزمان أو الاتجاه.',
    'A word that joins words, phrases, or sentences together.': 'كلمة تربط بين كلمات أو عبارات أو جمل.',
    'A verb combined with a small word (a particle) that gives it a new meaning. It works as one verb.': 'فعل يرتبط بكلمة صغيرة (أداة) تعطيه معنى جديدًا، ويعمل كفعل واحد.',
    'A group of words that works together as a noun.': 'مجموعة كلمات تعمل معًا كاسم.',
    'A group of words that works together as an adjective.': 'مجموعة كلمات تعمل معًا كصفة.',
    'A fixed group of words that is learned as one unit and does not fit the other groups.': 'مجموعة كلمات ثابتة تُحفظ كوحدة واحدة ولا تنتمي إلى المجموعات الأخرى.',
    'Any tag that is not listed above. It is shown in a neutral color.': 'أي وسم غير مذكور أعلاه، ويظهر بلون محايد.',
    'Yellow': 'أصفر', 'Green': 'أخضر', 'Purple': 'بنفسجي', 'Pink': 'وردي',

    /* Settings */
    'Appearance': 'المظهر', 'Language': 'اللغة', 'Choose the language of the whole interface': 'اختر لغة الواجهة كاملةً',
    'Theme mode': 'وضع المظهر', 'Light, dark, or follow your device': 'فاتح أو داكن أو حسب جهازك',
    'Font style': 'نمط الخط', 'Regular': 'عادي', 'Bold': 'عريض', 'Recommended': 'موصى به',
    'Bold headings, Regular text.': 'عناوين عريضة ونص عادي.', 'All text Regular.': 'كل النص عادي.', 'All text Bold.': 'كل النص عريض.',
    'Accent color': 'لون التمييز', 'Default': 'الافتراضي',
    'Default is a neutral graphite. Pick a palette to use one accent everywhere.': 'الافتراضي رمادي فحمي محايد. اختر لوحة ألوان لاستخدام لون تمييز واحد في كل مكان.',
    'Burgundy': 'عنابي', 'Lavender': 'لافندر', 'Sky Blue': 'أزرق سماوي', 'Lime': 'ليموني', 'Orange': 'برتقالي', 'Teal': 'أزرق مخضر',
    'Midnight': 'أزرق ليلي', 'Plum': 'برقوقي', 'Petrol': 'بترولي', 'Umber': 'بني', 'Rose': 'وردي فاتح', 'Sand': 'رملي',
    'Your current palette ({name}) is no longer offered. Pick one of the seven.': 'لوحة الألوان الحالية ({name}) لم تعد متاحة. اختر واحدة من الألوان السبعة.',
    'Keep screen awake': 'إبقاء الشاشة مضاءة', 'Stops the screen from turning off while you study': 'يمنع انطفاء الشاشة أثناء المذاكرة',
    'This browser does not support keeping the screen awake': 'هذا المتصفح لا يدعم إبقاء الشاشة مضاءة', 'Toggle': 'تبديل', 'Export Data': 'تصدير البيانات', 'Import Data': 'استيراد البيانات', 'Delete All Data': 'حذف كل البيانات',
    'Choose a backup file to import': 'اختر ملف نسخة احتياطية للاستيراد',
    'Importing will replace your current progress with the data in this file. Continue?': 'سيستبدل الاستيراد تقدمك الحالي ببيانات هذا الملف. هل تريد المتابعة؟',
    'Are you sure? All your progress (learned words, review lists, and quiz history) will be deleted permanently.': 'هل أنت متأكد؟ سيُحذف كل تقدمك (الكلمات المحفوظة وقوائم المراجعة وسجل الاختبارات) نهائيًا.',
    'Your data was exported': 'تم تصدير بياناتك', 'Data imported successfully': 'تم استيراد البيانات بنجاح',
    'This file is not a valid E.English backup': 'هذا الملف ليس نسخة احتياطية صالحة لـ E.English',
    'Calculating...': 'جارٍ الحساب...',

    /* 11.2 */
    'Auto': 'تلقائي', 'On': 'مفعّل', 'Off': 'متوقف', 'Behavior': 'السلوك', 'Loading': 'جارٍ التحميل', 'More': 'المزيد', 'Study': 'المذاكرة', 'Data management': 'إدارة البيانات',
    'Back up your progress, restore it, or erase it from this device.': 'انسخ تقدمك احتياطيًا أو استعده أو امسحه من هذا الجهاز.',
    '{n} words in total \u00B7 {k} learned': 'إجمالي {n} كلمة \u00B7 المحفوظ {k}', 'Animations': 'الحركة', 'Smooth movement and transitions': 'حركة وانتقالات سلسة',
    'Your device asks for reduced motion, so animations stay off.': 'جهازك يطلب تقليل الحركة، لذلك تبقى الحركة متوقفة.',
    'Local storage': 'التخزين المحلي',
    'The bar compares usage with a 1 GB reference scale. Browsers do not all guarantee 1 GB.': 'يقارن الشريط الاستخدام بمقياس مرجعي قدره 1 جيجابايت. لا تضمن كل المتصفحات هذه المساحة.',
    'Storage usage is unavailable in this browser.': 'قياس مساحة التخزين غير متاح في هذا المتصفح.',
    'Used {used} \u00B7 {pct} of the 1 GB scale': 'المستخدم {used} \u00B7 {pct} من مقياس 1 جيجابايت', 'No translation': 'لا توجد ترجمة',
    '\u00A9 2026 Mohamed & Anas. All rights reserved.': '\u00A9 2026 Mohamed & Anas. جميع الحقوق محفوظة.',
    'The original code, design and content of E.English belong to their credited authors. Copying, republishing, reusing them, or presenting them as your own work requires the authors\u2019 permission, to the extent permitted by applicable law.': 'الكود والتصميم والمحتوى الأصلي في E.English ملك لأصحابها المذكورين. ونسخها أو إعادة نشرها أو إعادة استخدامها أو نسبتها لغير أصحابها يتطلب إذنهم، في حدود ما يسمح به القانون المعمول به.'
  };

  /* ---------------- API ---------------- */
  function fill(str, params) {
    if (!params) return str;
    return str.replace(/\{(\w+)\}/g, function (m, k) { return params[k] != null ? String(params[k]) : m; });
  }
  function t(key, params) {
    const s = (lang === 'ar' && Object.prototype.hasOwnProperty.call(AR, key)) ? AR[key] : key;
    return fill(String(s), params);
  }
  // "3 words" / "٣ كلمات": English picks one/many by n === 1; Arabic follows its own
  // rule (1 → singular, 2 → dual when the dictionary has "<many>|2", 3–10 → plural,
  // 11+ → singular).
  function plural(n, one, many) {
    if (lang !== 'ar') return n === 1 ? one : many;
    if (n === 1) return t(one);
    if (n === 2 && Object.prototype.hasOwnProperty.call(AR, many + '|2')) return t(many + '|2');
    if (n >= 3 && n <= 10) return t(many);
    if (n === 2) return t(many);
    return t(one);
  }
  function setLang(next) { lang = next === 'ar' ? 'ar' : 'en'; }

  global.I18n = {
    t: t,
    plural: plural,
    setLang: setLang,
    getLang: function () { return lang; },
    isRTL: function () { return lang === 'ar'; },
    // Western digits in Arabic too, so scores and dates read the same in both languages.
    locale: function () { return lang === 'ar' ? 'ar-u-nu-latn' : 'en-US'; },
    // Lets another file add its own entries (never replaces an existing one).
    extend: function (entries) {
      for (const k in entries) if (!Object.prototype.hasOwnProperty.call(AR, k)) AR[k] = entries[k];
    }
  };
})(window);
