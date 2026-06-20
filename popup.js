// Tabs
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab, .panel').forEach(el => el.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
  });
});

// Toast
function toast(msg, err = false) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.style.background = err ? '#1f0d0d' : '#0d1f0d';
  el.style.borderColor = err ? '#3f1a1a' : '#1a4a1a';
  el.style.color       = err ? '#f87171' : '#4ade80';
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2200);
}

// Eye toggle
document.querySelectorAll('.eye-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const inp = document.getElementById(btn.dataset.t);
    inp.type = inp.type === 'password' ? 'text' : 'password';
    btn.textContent = inp.type === 'password' ? '◉' : '○';
  });
});

// Load saved values
chrome.storage.sync.get(['groqKeys', 'model', 'temperature'], ({ groqKeys, model, temperature }) => {
  const keys = groqKeys || [];
  ['k1', 'k2', 'k3'].forEach((id, i) => {
    if (keys[i]) document.getElementById(id).value = keys[i];
  });
  if (model) document.getElementById('modelSelect').value = model;
  if (temperature !== undefined) {
    const t = Math.round(temperature * 10);
    document.getElementById('tempRange').value = t;
    document.getElementById('tempVal').textContent = temperature.toFixed(1);
  }
});

// Save keys
document.getElementById('saveKeys').addEventListener('click', () => {
  const keys = ['k1', 'k2', 'k3']
    .map(id => document.getElementById(id).value.trim())
    .filter(Boolean);
  if (!keys.length) { toast('Enter at least one API key', true); return; }
  // Also keep backward-compat: save first key as groqApiKey
  chrome.storage.sync.set({ groqKeys: keys, groqApiKey: keys[0] }, () => {
    toast('◆ Keys saved');
  });
});

// Test connection
document.getElementById('testBtn').addEventListener('click', async () => {
  const keys = ['k1', 'k2', 'k3']
    .map(id => document.getElementById(id).value.trim())
    .filter(Boolean);
  if (!keys.length) { toast('Enter an API key first', true); return; }

  document.getElementById('testBtn').textContent = '…';
  const res = await chrome.runtime.sendMessage({
    type: 'GROQ_REQUEST',
    payload: {
      apiKey: keys[0],
      prompt: 'Say "OK" only.',
      systemPrompt: 'Reply with only "OK".'
    }
  });
  document.getElementById('testBtn').textContent = '▸ Test';
  if (res.error) toast('Error: ' + res.error, true);
  else toast('▸ Connection OK');
});

// Temperature slider
document.getElementById('tempRange').addEventListener('input', function () {
  document.getElementById('tempVal').textContent = (this.value / 10).toFixed(1);
});

// Save model
document.getElementById('saveModel').addEventListener('click', () => {
  const model = document.getElementById('modelSelect').value;
  const temperature = parseFloat(document.getElementById('tempRange').value) / 10;
  chrome.storage.sync.set({ model, temperature }, () => toast('◆ Model saved'));
});
