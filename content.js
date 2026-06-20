const GIG_PATTERN = /fiverr\.com\/(new-gig|users\/[^/]+\/manage_gigs)/;

let apiKey = '';
chrome.storage.sync.get(['groqApiKey'], ({ groqApiKey }) => { apiKey = groqApiKey || ''; });
chrome.storage.onChanged.addListener(c => { if (c.groqApiKey) apiKey = c.groqApiKey.newValue || ''; });

// ── Keyword Bar ───────────────────────────────────────────────────────────────

function injectBar() {
  if (document.getElementById('fai-bar')) return;

  const bar = document.createElement('div');
  bar.id = 'fai-bar';
  bar.innerHTML = `
    <span class="fai-logo">⚡ AI Fill</span>
    <input id="fai-keywords" type="text" placeholder="Keywords: logo, illustrator, branding, minimal…" autocomplete="off" />
    <button id="fai-fill-all">Fill All</button>
    <div id="fai-spinner" style="display:none">●</div>
    <span id="fai-msg"></span>
  `;
  document.body.prepend(bar);

  document.getElementById('fai-fill-all').addEventListener('click', () => runAll());
  injectFieldButtons();
}

function getKeywords() {
  return (document.getElementById('fai-keywords')?.value || '').trim();
}

function setMsg(text, type = 'info') {
  const el = document.getElementById('fai-msg');
  if (el) { el.textContent = text; el.className = `fai-msg-${type}`; }
}

function setLoading(on) {
  const spinner = document.getElementById('fai-spinner');
  const btn = document.getElementById('fai-fill-all');
  if (spinner) spinner.style.display = on ? 'inline' : 'none';
  if (btn) btn.disabled = on;
  document.querySelectorAll('.fai-field-btn').forEach(b => b.disabled = on);
}

// ── Groq Call ─────────────────────────────────────────────────────────────────

async function ask(prompt, system) {
  const res = await chrome.runtime.sendMessage({
    type: 'GROQ_REQUEST',
    payload: { apiKey, prompt, systemPrompt: system }
  });
  if (res.error) throw new Error(res.error);
  return res.result;
}

// ── Generators ────────────────────────────────────────────────────────────────

async function genTitle(kw) {
  return ask(
    `Keywords: ${kw}`,
    `You are a top-rated Fiverr seller. Write ONE compelling gig title (max 80 chars).
Must start with "I will". Be specific and use strong action words.
Reply with ONLY the title, no quotes, nothing else.`
  );
}

async function genDescription(kw) {
  return ask(
    `Keywords: ${kw}`,
    `You are a top-rated Fiverr seller. Write a professional Fiverr gig description using these keywords.
Format:
- 1-2 sentence opening hook about the value delivered
- 4-6 bullet points starting with ✅ showing what's included
- 2-3 sentences on why clients choose you
- Short call to action
150-300 words. Plain text only, no markdown headers.`
  );
}

async function genPackages(kw) {
  return ask(
    `Keywords: ${kw}`,
    `You are a top-rated Fiverr seller. Create 3 gig packages as JSON only:
{
  "basic":    { "name": "Basic",    "description": "1-2 sentence desc", "price": 15, "delivery": 3, "revisions": 1 },
  "standard": { "name": "Standard", "description": "1-2 sentence desc", "price": 35, "delivery": 5, "revisions": 3 },
  "premium":  { "name": "Premium",  "description": "1-2 sentence desc", "price": 75, "delivery": 7, "revisions": "Unlimited" }
}
Return ONLY the JSON object, nothing else.`
  );
}

async function genFAQs(kw) {
  return ask(
    `Keywords: ${kw}`,
    `You are a top-rated Fiverr seller. Write 4 FAQ entries as JSON array only:
[
  { "question": "...", "answer": "1-2 sentence answer" },
  { "question": "...", "answer": "1-2 sentence answer" },
  { "question": "...", "answer": "1-2 sentence answer" },
  { "question": "...", "answer": "1-2 sentence answer" }
]
Cover: revisions, delivery time, file formats, communication. Return ONLY the JSON array.`
  );
}

async function genTags(kw) {
  return ask(
    `Keywords: ${kw}`,
    `Generate 5 Fiverr search tags for this gig. Tags must be lowercase, 1-3 words each, no duplicates.
Return ONLY a comma-separated list, nothing else. Example: logo design, brand identity, illustrator`
  );
}

// ── Fill Helpers ──────────────────────────────────────────────────────────────

function setField(el, value) {
  if (!el) return false;
  el.focus();

  // Quill rich text editor
  if (el.classList.contains('ql-editor')) {
    el.innerHTML = value.split('\n').map(l => `<p>${l || '<br>'}</p>`).join('');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }

  // React-compatible setter
  const proto = el.tagName === 'INPUT' ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  setter ? setter.call(el, value) : (el.value = value);
  ['input', 'change', 'blur'].forEach(e => el.dispatchEvent(new Event(e, { bubbles: true })));
  return true;
}

function findTitle() {
  const tries = [
    () => document.querySelector('input[data-testid*="title"]'),
    () => document.querySelector('input[placeholder*="title" i]'),
    () => document.querySelector('input[name="title"]'),
    () => [...document.querySelectorAll('input[type="text"]')].find(
      el => el.maxLength >= 60 && el.maxLength <= 100 && isVisible(el)
    ),
  ];
  for (const t of tries) { const el = t(); if (el) return el; }
  return null;
}

function findDescription() {
  return (
    document.querySelector('.ql-editor[contenteditable="true"]') ||
    document.querySelector('textarea[placeholder*="describe" i]') ||
    document.querySelector('textarea[data-testid*="description"]')
  );
}

function findPackageFields() {
  const names = [...document.querySelectorAll('input[placeholder*="package name" i], input[placeholder*="name your" i]')];
  const descs = [...document.querySelectorAll('textarea[placeholder*="describe" i], textarea[placeholder*="what" i]')].slice(0, 3);
  const prices = [...document.querySelectorAll('input[type="number"][min], input[placeholder*="price" i]')].slice(0, 3);
  return { names, descs, prices };
}

function findFAQFields() {
  const questions = [...document.querySelectorAll('input[placeholder*="question" i], input[data-testid*="faq"]')];
  const answers = [...document.querySelectorAll('textarea[placeholder*="answer" i]')];
  return { questions, answers };
}

function findTags() {
  return (
    document.querySelector('input[placeholder*="tag" i]') ||
    document.querySelector('input[placeholder*="keyword" i]') ||
    document.querySelector('input[data-testid*="tag"]')
  );
}

function isVisible(el) {
  return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
}

// ── Fill Actions ──────────────────────────────────────────────────────────────

async function fillTitle() {
  const kw = getKeywords();
  if (!kw) return setMsg('Add keywords first', 'error');
  const el = findTitle();
  if (!el) return setMsg('Title field not found — go to Overview tab', 'error');
  const text = await genTitle(kw);
  setField(el, text.replace(/^["']|["']$/g, ''));
}

async function fillDescription() {
  const kw = getKeywords();
  if (!kw) return setMsg('Add keywords first', 'error');
  const el = findDescription();
  if (!el) return setMsg('Description not found — go to Description & FAQ tab', 'error');
  const text = await genDescription(kw);
  setField(el, text);
}

async function fillPackages() {
  const kw = getKeywords();
  if (!kw) return setMsg('Add keywords first', 'error');
  const text = await genPackages(kw);
  try {
    const json = text.match(/\{[\s\S]*\}/)?.[0];
    const pkgs = JSON.parse(json);
    const { names, descs, prices } = findPackageFields();
    const tiers = ['basic', 'standard', 'premium'];
    let filled = 0;
    tiers.forEach((t, i) => {
      if (names[i]) { setField(names[i], pkgs[t].name); filled++; }
      if (descs[i]) { setField(descs[i], pkgs[t].description); filled++; }
      if (prices[i]) { setField(prices[i], String(pkgs[t].price)); filled++; }
    });
    if (!filled) setMsg('Package fields not found — go to Pricing tab', 'error');
  } catch { setMsg('Could not parse packages, try again', 'error'); }
}

async function fillFAQs() {
  const kw = getKeywords();
  if (!kw) return setMsg('Add keywords first', 'error');
  const text = await genFAQs(kw);
  try {
    const json = text.match(/\[[\s\S]*\]/)?.[0];
    const faqs = JSON.parse(json);
    const { questions, answers } = findFAQFields();
    let filled = 0;
    faqs.forEach((faq, i) => {
      if (questions[i]) { setField(questions[i], faq.question); filled++; }
      if (answers[i]) { setField(answers[i], faq.answer); filled++; }
    });
    if (!filled) setMsg('FAQ fields not found — go to Description & FAQ tab', 'error');
  } catch { setMsg('Could not parse FAQs, try again', 'error'); }
}

async function fillTags() {
  const kw = getKeywords();
  if (!kw) return setMsg('Add keywords first', 'error');
  const el = findTags();
  if (!el) return;
  const text = await genTags(kw);
  const tags = text.split(',').map(t => t.trim()).filter(Boolean);
  for (const tag of tags) {
    setField(el, tag);
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await new Promise(r => setTimeout(r, 300));
  }
}

async function runAll() {
  const kw = getKeywords();
  if (!kw) return setMsg('Add keywords first', 'error');
  setLoading(true);
  setMsg('Generating…', 'info');
  try {
    await Promise.allSettled([
      fillTitle(),
      fillDescription(),
      fillPackages(),
      fillFAQs(),
      fillTags(),
    ]);
    setMsg('Done! Review and save.', 'success');
  } catch (e) {
    setMsg(e.message, 'error');
  } finally {
    setLoading(false);
  }
}

// ── Inline field buttons ──────────────────────────────────────────────────────

const FIELD_ACTIONS = [
  { finder: findTitle,       label: '⚡ Title',       action: fillTitle },
  { finder: findDescription, label: '⚡ Description',  action: fillDescription },
  { finder: findTags,        label: '⚡ Tags',         action: fillTags },
];

function injectFieldButtons() {
  FIELD_ACTIONS.forEach(({ finder, label, action }) => {
    const el = finder();
    if (!el || el.dataset.faiBtnInjected) return;
    el.dataset.faiBtnInjected = '1';

    const btn = document.createElement('button');
    btn.className = 'fai-field-btn';
    btn.textContent = label;
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      const kw = getKeywords();
      if (!kw) { setMsg('Add keywords first', 'error'); return; }
      btn.disabled = true;
      btn.textContent = '…';
      try {
        await action();
        btn.textContent = '✓';
        setTimeout(() => { btn.textContent = label; btn.disabled = false; }, 2000);
      } catch (err) {
        setMsg(err.message, 'error');
        btn.textContent = label;
        btn.disabled = false;
      }
    });

    const wrapper = el.closest('label, div, p') || el.parentElement;
    wrapper?.appendChild(btn);
  });
}

// ── Init & SPA watch ─────────────────────────────────────────────────────────

function init() {
  if (GIG_PATTERN.test(location.href)) {
    setTimeout(injectBar, 800);
  }
}

let lastUrl = location.href;
new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    if (GIG_PATTERN.test(location.href)) {
      setTimeout(() => { injectBar(); injectFieldButtons(); }, 1000);
    } else {
      document.getElementById('fai-bar')?.remove();
    }
  } else {
    // re-inject buttons when tab content changes
    if (GIG_PATTERN.test(location.href)) injectFieldButtons();
  }
}).observe(document.body, { childList: true, subtree: true });

init();
