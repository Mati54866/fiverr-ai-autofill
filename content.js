const GIG_PATTERN = /fiverr\.com\/users\/[^/]+\/manage_gigs/;

let apiKey = '';
chrome.storage.sync.get(['groqApiKey'], ({ groqApiKey }) => { apiKey = groqApiKey || ''; });
chrome.storage.onChanged.addListener(c => { if (c.groqApiKey) apiKey = c.groqApiKey.newValue || ''; });

// ── Utilities ─────────────────────────────────────────────────────────────────

function getCurrentTab() {
  return new URL(location.href).searchParams.get('tab') || 'general';
}

function setField(el, value) {
  if (!el) return false;
  el.focus();
  if (el.isContentEditable || el.classList.contains('ql-editor')) {
    el.innerHTML = value.split('\n').map(l => `<p>${l || '<br>'}</p>`).join('');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }
  const proto = el.tagName === 'INPUT' ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  setter ? setter.call(el, value) : (el.value = value);
  ['input', 'change', 'blur'].forEach(e => el.dispatchEvent(new Event(e, { bubbles: true })));
  return true;
}

async function typeTag(input, tag) {
  input.focus();
  setField(input, tag);
  await sleep(150);
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
  input.dispatchEvent(new KeyboardEvent('keyup',  { key: 'Enter', keyCode: 13, bubbles: true }));
  // also try comma
  input.dispatchEvent(new KeyboardEvent('keydown', { key: ',', keyCode: 188, bubbles: true }));
  await sleep(300);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function setMsg(text, type = 'info') {
  const el = document.getElementById('fai-msg');
  if (el) { el.textContent = text; el.className = `fai-msg-${type}`; }
}

function setLoading(on) {
  const spinner = document.getElementById('fai-spinner');
  const btn = document.getElementById('fai-fill-all');
  if (spinner) spinner.style.display = on ? 'inline-block' : 'none';
  if (btn) btn.disabled = on;
  document.querySelectorAll('.fai-field-btn').forEach(b => b.disabled = on);
}

// ── Groq ──────────────────────────────────────────────────────────────────────

async function ask(prompt, system) {
  const res = await chrome.runtime.sendMessage({
    type: 'GROQ_REQUEST',
    payload: { apiKey, prompt, systemPrompt: system }
  });
  if (res.error) throw new Error(res.error);
  return res.result;
}

// ── Page 1: Overview (tab=general) ───────────────────────────────────────────

const PAGE1 = {
  // Gig title: textarea with "I will" placeholder, 80 char max
  titleInput() {
    return (
      document.querySelector('textarea[placeholder*="I will"]') ||
      document.querySelector('input[placeholder*="I will"]') ||
      document.querySelector('textarea[maxlength="80"]') ||
      document.querySelector('input[maxlength="80"]')
    );
  },

  // Positive keywords tag input — under "Search tags" / "Positive keywords" section
  tagInput() {
    // Fiverr renders tag inputs as plain inputs inside a tag container
    const byLabel = [...document.querySelectorAll('input')].find(el => {
      const section = el.closest('section, div[class*="tag"], div[class*="keyword"]');
      return section && /positive|search tag/i.test(section.textContent);
    });
    if (byLabel) return byLabel;

    return (
      document.querySelector('input[placeholder*="positive" i]') ||
      document.querySelector('input[placeholder*="tag" i]') ||
      // fallback: input that's NOT the title (not maxlength 80) and is visible
      [...document.querySelectorAll('input[type="text"]')].find(el =>
        el.maxLength !== 80 && isVisible(el) && !el.id?.includes('title')
      )
    );
  },

  async fillTitle(kw) {
    const el = this.titleInput();
    if (!el) throw new Error('Title field not found');
    setMsg('Generating title…', 'info');
    const text = await ask(
      `Keywords: ${kw}`,
      `You are a top-rated Fiverr seller. Write ONE compelling gig title (max 80 chars).
Must start with "I will". Be very specific, use action words, include main keyword naturally.
Reply with ONLY the title, no quotes, no extra text.`
    );
    setField(el, text.replace(/^["']|["']$/g, '').trim().slice(0, 80));
  },

  async fillTags(kw) {
    const input = this.tagInput();
    if (!input) throw new Error('Tag input not found');
    setMsg('Adding tags…', 'info');

    const raw = await ask(
      `Keywords: ${kw}`,
      `Generate exactly 5 Fiverr search tags for this gig.
Rules: lowercase only, 1-3 words each, letters and numbers only (no special chars), no duplicates.
Return ONLY a comma-separated list of 5 tags, nothing else.
Example: logo design, brand identity, illustrator, minimalist logo, business logo`
    );

    const tags = raw.split(',').map(t => t.trim().toLowerCase().replace(/[^a-z0-9 ]/g, '')).filter(Boolean).slice(0, 5);
    for (const tag of tags) {
      await typeTag(input, tag);
    }
  },

  async fillAll(kw) {
    await this.fillTitle(kw);
    setMsg('Generating tags…', 'info');
    await this.fillTags(kw);
    setMsg('Overview done! Click Save & Continue.', 'success');
  }
};

// ── Bar UI ────────────────────────────────────────────────────────────────────

function injectBar() {
  if (document.getElementById('fai-bar')) return;

  const bar = document.createElement('div');
  bar.id = 'fai-bar';
  bar.innerHTML = `
    <span class="fai-logo">⚡ AI Fill</span>
    <input id="fai-keywords" type="text" placeholder="Keywords: algo trading, mt5, expert advisor…" autocomplete="off" />
    <button id="fai-fill-all">Fill All</button>
    <div id="fai-spinner"></div>
    <span id="fai-msg"></span>
  `;
  document.body.prepend(bar);

  document.getElementById('fai-fill-all').addEventListener('click', runFillAll);

  // also inject inline buttons for page 1
  setTimeout(injectPage1Buttons, 800);
}

function injectPage1Buttons() {
  if (getCurrentTab() !== 'general') return;

  // Title button
  const titleEl = PAGE1.titleInput();
  if (titleEl && !titleEl.dataset.faiBtnDone) {
    titleEl.dataset.faiBtnDone = '1';
    const btn = makeFieldBtn('⚡ Title', async () => {
      const kw = getKeywords();
      if (!kw) { setMsg('Add keywords first', 'error'); return; }
      await PAGE1.fillTitle(kw);
      setMsg('Title filled!', 'success');
    });
    titleEl.closest('div')?.appendChild(btn);
  }

  // Tags button
  const tagEl = PAGE1.tagInput();
  if (tagEl && !tagEl.dataset.faiBtnDone) {
    tagEl.dataset.faiBtnDone = '1';
    const btn = makeFieldBtn('⚡ Tags', async () => {
      const kw = getKeywords();
      if (!kw) { setMsg('Add keywords first', 'error'); return; }
      await PAGE1.fillTags(kw);
      setMsg('Tags added!', 'success');
    });
    tagEl.closest('div')?.appendChild(btn);
  }
}

function makeFieldBtn(label, onClick) {
  const btn = document.createElement('button');
  btn.className = 'fai-field-btn';
  btn.textContent = label;
  btn.addEventListener('click', async (e) => {
    e.preventDefault();
    btn.disabled = true;
    const orig = btn.textContent;
    btn.textContent = '…';
    try {
      await onClick();
      btn.textContent = '✓';
      setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 2000);
    } catch (err) {
      setMsg(err.message, 'error');
      btn.textContent = orig;
      btn.disabled = false;
    }
  });
  return btn;
}

function getKeywords() {
  return (document.getElementById('fai-keywords')?.value || '').trim();
}

async function runFillAll() {
  const kw = getKeywords();
  if (!kw) return setMsg('Enter keywords first', 'error');
  setLoading(true);
  try {
    const tab = getCurrentTab();
    if (tab === 'general')     await PAGE1.fillAll(kw);
    // pages 2-5 will be added next
    else setMsg(`Tab "${tab}" coming soon`, 'info');
  } catch (e) {
    setMsg(e.message, 'error');
  } finally {
    setLoading(false);
  }
}

function isVisible(el) {
  return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
}

// ── Init & SPA watch ─────────────────────────────────────────────────────────

function init() {
  if (GIG_PATTERN.test(location.href)) setTimeout(injectBar, 900);
}

let lastUrl = location.href;
new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    if (GIG_PATTERN.test(location.href)) {
      document.getElementById('fai-bar')?.remove();
      setTimeout(() => { injectBar(); }, 1000);
    } else {
      document.getElementById('fai-bar')?.remove();
    }
  }
}).observe(document.body, { childList: true, subtree: true });

init();
