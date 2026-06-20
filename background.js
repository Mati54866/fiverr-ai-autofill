importScripts('config.js');

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'llama-3.3-70b-versatile';

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'GROQ_REQUEST') {
    handleGroqRequest(msg.payload).then(sendResponse).catch(err => {
      sendResponse({ error: err.message });
    });
    return true;
  }
});

async function callWithKey(apiKey, prompt, systemPrompt) {
  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.7,
      max_tokens: 8000,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
      ]
    })
  });

  if (res.status === 429 || res.status === 401) return null; // try next key
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Groq API error ${res.status}`);
  }

  const data = await res.json();
  return data.choices[0].message.content.trim();
}

async function handleGroqRequest({ apiKey, prompt, systemPrompt }) {
  // Build key list: config keys first, then popup key as fallback
  const keys = [...(GROQ_KEYS || [])];
  if (apiKey && !keys.includes(apiKey)) keys.push(apiKey);

  for (const key of keys) {
    const result = await callWithKey(key, prompt, systemPrompt);
    if (result !== null) return { result };
  }

  throw new Error('All Groq API keys exhausted or rate limited. Try again shortly.');
}
