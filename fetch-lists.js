// Paste into DevTools console on fiverr.com/sellers/.../edit
// Uses Fiverr's own autocomplete API — fast, no UI interaction needed.

(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  async function autocomplete(type, query) {
    try {
      const res = await fetch(
        `/sellers/autocomplete/${type}?query=${encodeURIComponent(query)}&type=${type}`,
        { credentials: 'include', headers: { 'accept': 'application/json', 'x-requested-with': 'XMLHttpRequest' } }
      );
      if (!res.ok) return [];
      const json = await res.json();
      // Try common response shapes
      const list = json.results ?? json.data ?? json.skills ?? json.companies ?? json.items ?? json;
      if (!Array.isArray(list)) return [];
      return list.map(i => typeof i === 'string' ? i : (i.name ?? i.label ?? i.value ?? i.title ?? '')).filter(Boolean);
    } catch { return []; }
  }

  // ── SKILLS ──────────────────────────────────────────────────────────────────
  console.log('[FAI] Fetching skills via API…');
  const allSkills = new Set();

  for (const letter of 'abcdefghijklmnopqrstuvwxyz') {
    const results = await autocomplete('skill', letter);
    results.forEach(s => allSkills.add(s));
    console.log(`[FAI] Skills: ${allSkills.size} (query '${letter}', +${results.length})`);
    await sleep(120);
  }

  // Also query common multi-word terms to catch results not returned by single letters
  const EXTRA = ['trading bot','forex','algorithmic','metatrader','machine learning','deep learning',
    'virtual assistant','data entry','social media','video editing','graphic design',
    'web scraping','react native','node js','next js','pine script','expert advisor'];
  for (const term of EXTRA) {
    const results = await autocomplete('skill', term);
    results.forEach(s => allSkills.add(s));
    await sleep(80);
  }
  console.log(`[FAI] Total skills: ${allSkills.size}`);

  // ── COMPANIES ───────────────────────────────────────────────────────────────
  console.log('[FAI] Fetching companies via API…');
  const allCompanies = new Set();

  // Try possible endpoint names for companies
  const COMPANY_TYPES = ['employer', 'company', 'organization', 'workplace'];
  let workingType = null;

  for (const type of COMPANY_TYPES) {
    const test = await autocomplete(type, 'a');
    if (test.length > 0) { workingType = type; console.log(`[FAI] Company endpoint: /sellers/autocomplete/${type}`); break; }
    await sleep(100);
  }

  if (workingType) {
    for (const letter of 'abcdefghijklmnopqrstuvwxyz') {
      const results = await autocomplete(workingType, letter);
      results.forEach(s => allCompanies.add(s));
      console.log(`[FAI] Companies: ${allCompanies.size} (query '${letter}', +${results.length})`);
      await sleep(100);
    }
  } else {
    console.warn('[FAI] Company API endpoint not found — companies will be empty');
  }

  // ── Download ─────────────────────────────────────────────────────────────────
  const skills    = [...allSkills];
  const companies = [...allCompanies];

  localStorage.setItem('faiSkills',    JSON.stringify(skills));
  localStorage.setItem('faiCompanies', JSON.stringify(companies));

  function download(filename, data) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  download('skills.json', skills);
  await sleep(500);
  download('companies.json', companies);

  console.log(`[FAI] ✓ ${skills.length} skills · ${companies.length} companies`);
  console.log('[FAI] Move skills.json + companies.json → fiverr-ai-autofill/data/ and push.');
})();
