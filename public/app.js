// ── State ──────────────────────────────────────────────────────────────────
let me = null;
let myProfile = null;       // current user's profile (or null)
let allEntries = [];
const charts = {};

// Colour palette per user
const PALETTE = ['#6c8ef5','#f56ca8','#4cbb8a','#f5a623','#a78bfa','#38bdf8','#fb923c','#e879f9'];
const userColors = {};
let colorIdx = 0;
function colorFor(name) {
  if (!userColors[name]) { userColors[name] = PALETTE[colorIdx % PALETTE.length]; colorIdx++; }
  return userColors[name];
}

// ── Boot ───────────────────────────────────────────────────────────────────
async function boot() {
  try {
    const [meRes, profileRes] = await Promise.all([fetch('/api/me'), fetch('/api/profile')]);
    if (!meRes.ok) { window.location.reload(); return; }
    me = await meRes.json();
    myProfile = profileRes.ok ? await profileRes.json() : null;

    document.getElementById('headerName').textContent = me.name;
    document.getElementById('avatar').textContent = (me.name || '?')[0].toUpperCase();
    document.getElementById('f_date').value = todayISO();
    updateBmiNotes();

    // Auto-open profile modal if not complete
    if (!myProfile || !myProfile.height_cm || !myProfile.date_of_birth || !myProfile.sex) {
      openProfileModal(true);
    }

    await loadData();
  } catch (e) { console.error(e); }
}

function todayISO() { return new Date().toISOString().split('T')[0]; }

async function loadData() {
  const filter = document.getElementById('userFilter').value;
  const url = filter ? `/api/entries?user=${encodeURIComponent(filter)}` : '/api/entries';
  const r = await fetch(url);
  allEntries = await r.json();
  await refreshUserFilter();
  renderStats();
  renderCharts();
  renderTable();
}

async function refreshUserFilter() {
  const sel = document.getElementById('userFilter');
  const current = sel.value;
  const r = await fetch('/api/users');
  const users = await r.json();
  sel.innerHTML = '<option value="">All profiles</option>';
  users.forEach(u => {
    const opt = document.createElement('option');
    opt.value = u;
    opt.textContent = u === me?.name ? `${u} (you)` : u;
    if (u === current) opt.selected = true;
    sel.appendChild(opt);
  });
}

function onFilterChange() { loadData(); }

// ── Auth ───────────────────────────────────────────────────────────────────
async function logout() {
  await fetch('/api/logout', { method: 'POST' });
  window.location.href = '/';
}

// ── Profile modal ──────────────────────────────────────────────────────────
let profileModalMandatory = false;

function openProfileModal(mandatory = false) {
  profileModalMandatory = mandatory;
  if (myProfile) {
    document.getElementById('p_dob').value    = myProfile.date_of_birth || '';
    document.getElementById('p_height').value = myProfile.height_cm     || '';
    document.getElementById('p_sex').value    = myProfile.sex           || '';
  }
  document.getElementById('profileModal').classList.remove('hidden');
}

function closeProfileModal() {
  if (profileModalMandatory) return; // can't dismiss until saved
  document.getElementById('profileModal').classList.add('hidden');
}

async function submitProfile(e) {
  e.preventDefault();
  const body = {
    date_of_birth: document.getElementById('p_dob').value,
    height_cm:     document.getElementById('p_height').value,
    sex:           document.getElementById('p_sex').value,
  };
  const r = await fetch('/api/profile', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (r.ok) {
    myProfile = await r.json();
    profileModalMandatory = false;
    document.getElementById('profileModal').classList.add('hidden');
    updateBmiNotes();
    renderStats();
    renderCharts(); // re-render to apply/remove reference bands
  } else {
    const err = await r.json();
    alert(err.error || 'Failed to save profile');
  }
}

document.getElementById('profileModal').addEventListener('click', (e) => {
  if (e.target === document.getElementById('profileModal')) closeProfileModal();
});

// ── BMI auto-fill ──────────────────────────────────────────────────────────
function updateBmiNotes() {
  const note = myProfile?.height_cm ? 'auto' : '';
  const fn = document.getElementById('f_bmi_note');
  const en = document.getElementById('e_bmi_note');
  if (fn) fn.textContent = note;
  if (en) en.textContent = note;
}

function autoFillBmi(prefix) {
  if (!myProfile?.height_cm) return;
  const weightEl = document.getElementById(`${prefix}_weight_kg`);
  const bmiEl    = document.getElementById(`${prefix}_bmi`);
  const w = parseFloat(weightEl.value);
  if (!isNaN(w) && w > 0) {
    const h = myProfile.height_cm / 100;
    bmiEl.value = (w / (h * h)).toFixed(1);
  } else {
    bmiEl.value = '';
  }
}

// ── Derived metric helpers ─────────────────────────────────────────────────

// Age in decimal years from a YYYY-MM-DD string
function ageFromDob(dob) {
  const birth = new Date(dob);
  const now   = new Date();
  return (now - birth) / (365.25 * 24 * 3600 * 1000);
}

// BMI category
function bmiCategory(bmi) {
  if (bmi < 18.5) return { label: 'Underweight', cls: 'warn' };
  if (bmi < 25)   return { label: 'Normal',      cls: 'good' };
  if (bmi < 30)   return { label: 'Overweight',  cls: 'warn' };
  return               { label: 'Obese',         cls: 'bad'  };
}

// ACE body fat ranges — returns { fitness: [lo,hi], acceptable: [lo,hi] }
function aceRanges(sex, age) {
  // Base ranges
  const ranges = sex === 'female'
    ? { fitness: [21, 24], acceptable: [25, 31] }
    : { fitness: [14, 17], acceptable: [18, 24] };
  // ACE guidelines: shift upper acceptable bound +2% per decade over 60
  if (age >= 60) {
    const decades = Math.floor((age - 60) / 10) + 1;
    ranges.acceptable[1] += decades * 2;
    ranges.fitness[1]    += decades;
  }
  return ranges;
}

// ACE body fat category label
function fatCategory(fatPct, sex, age) {
  const r = aceRanges(sex, age);
  if (sex === 'female') {
    if (fatPct < 10)           return { label: 'Essential fat', cls: 'warn' };
    if (fatPct < 14)           return { label: 'Athletes',      cls: 'good' };
    if (fatPct <= r.fitness[1])return { label: 'Fitness',       cls: 'good' };
    if (fatPct <= r.acceptable[1]) return { label: 'Acceptable', cls: 'neutral' };
    return                          { label: 'Obese',           cls: 'bad' };
  } else {
    if (fatPct < 2)            return { label: 'Essential fat', cls: 'warn' };
    if (fatPct < 6)            return { label: 'Athletes',      cls: 'good' };
    if (fatPct <= r.fitness[1])return { label: 'Fitness',       cls: 'good' };
    if (fatPct <= r.acceptable[1]) return { label: 'Acceptable', cls: 'neutral' };
    return                          { label: 'Obese',           cls: 'bad' };
  }
}

// Mifflin-St Jeor BMR  (kcal/day)
function mifflinBmr(weightKg, heightCm, age, sex) {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return sex === 'male' ? base + 5 : base - 161;
}

// Physique rating 1–9 (Tanita/Omron scale)
const PHYSIQUE_LABELS = {
  1: { label: 'Hidden obese',      cls: 'bad'     },
  2: { label: 'Obese',             cls: 'bad'     },
  3: { label: 'Overfat',           cls: 'bad'     },
  4: { label: 'High fat + muscle', cls: 'warn'    },
  5: { label: 'Standard',          cls: 'neutral' },
  6: { label: 'Standard + muscle', cls: 'neutral' },
  7: { label: 'Thin',              cls: 'warn'    },
  8: { label: 'Thin + muscle',     cls: 'good'    },
  9: { label: 'Very muscular',     cls: 'good'    },
};
function physiqueLabel(rating) {
  return PHYSIQUE_LABELS[rating] ?? { label: 'Unknown', cls: 'neutral' };
}

// ── Stats row ──────────────────────────────────────────────────────────────
function renderStats() {
  const statsRow      = document.getElementById('statsRow');
  const profilePrompt = document.getElementById('profilePrompt');
  const filter        = document.getElementById('userFilter').value;

  // Only show stats for a single user (the logged-in one)
  const viewingOwn = !filter || filter === me?.name;
  if (!viewingOwn) {
    statsRow.classList.add('hidden');
    profilePrompt.classList.add('hidden');
    return;
  }

  // Get own entries sorted by date desc
  const ownEntries = allEntries
    .filter(e => e.user_id === me?.id)
    .sort((a, b) => b.date.localeCompare(a.date));

  if (!ownEntries.length) {
    statsRow.classList.add('hidden');
    profilePrompt.classList.add('hidden');
    return;
  }

  const last = ownEntries[0];
  const prev = ownEntries[1] || null;

  if (!myProfile?.height_cm || !myProfile?.date_of_birth || !myProfile?.sex) {
    statsRow.classList.add('hidden');
    profilePrompt.classList.remove('hidden');
    return;
  }
  profilePrompt.classList.add('hidden');

  const age        = ageFromDob(myProfile.date_of_birth);
  const heightCm   = myProfile.height_cm;
  const sex        = myProfile.sex;
  const heightM    = heightCm / 100;

  const cards = [];

  // 1. Weight
  if (last.weight_kg != null) {
    const trend = prev?.weight_kg != null
      ? `${last.weight_kg - prev.weight_kg >= 0 ? '▲' : '▼'} ${Math.abs(last.weight_kg - prev.weight_kg).toFixed(1)} kg vs prev`
      : '';
    cards.push(`
      <div class="stat-card">
        <div class="stat-label">Weight</div>
        <div class="stat-value neutral">${last.weight_kg} <small style="font-size:.9rem;font-weight:400">kg</small></div>
        ${trend ? `<div class="stat-sub">${trend}</div>` : ''}
      </div>`);
  }

  // 2. BMI
  const bmiVal = last.bmi ?? (last.weight_kg ? +(last.weight_kg / (heightM * heightM)).toFixed(1) : null);
  if (bmiVal != null) {
    const cat = bmiCategory(bmiVal);
    cards.push(`
      <div class="stat-card">
        <div class="stat-label">BMI</div>
        <div class="stat-value ${cat.cls}">${bmiVal.toFixed(1)}</div>
        <div class="stat-sub"><b>${cat.label}</b></div>
      </div>`);
  }

  // 3. Body fat %
  if (last.body_fat_pct != null) {
    const cat = fatCategory(last.body_fat_pct, sex, age);
    cards.push(`
      <div class="stat-card">
        <div class="stat-label">Body fat</div>
        <div class="stat-value ${cat.cls}">${last.body_fat_pct.toFixed(1)}<small style="font-size:.9rem;font-weight:400">%</small></div>
        <div class="stat-sub"><b>${cat.label}</b></div>
      </div>`);
  }

  // 4. Metabolic age delta
  if (last.metabolic_age != null) {
    const actualAge = Math.floor(age);
    const delta     = last.metabolic_age - actualAge;
    const cls       = delta <= 0 ? 'good' : delta <= 5 ? 'warn' : 'bad';
    const sign      = delta >= 0 ? '+' : '';
    cards.push(`
      <div class="stat-card">
        <div class="stat-label">Metabolic age</div>
        <div class="stat-value ${cls}">${last.metabolic_age} <small style="font-size:.9rem;font-weight:400">yrs</small></div>
        <div class="stat-sub">Actual: ${actualAge} yrs &mdash; <b class="${cls}">${sign}${delta} yrs</b></div>
      </div>`);
  }

  // 5. BMR comparison (only if weight is available)
  if (last.bmr_kcal != null && last.weight_kg != null) {
    const formula = Math.round(mifflinBmr(last.weight_kg, heightCm, age, sex));
    const delta   = last.bmr_kcal - formula;
    const sign    = delta >= 0 ? '+' : '';
    const cls     = Math.abs(delta) < 150 ? 'good' : Math.abs(delta) < 300 ? 'warn' : 'bad';
    cards.push(`
      <div class="stat-card">
        <div class="stat-label">BMR</div>
        <div class="stat-value neutral">${last.bmr_kcal} <small style="font-size:.9rem;font-weight:400">kcal</small></div>
        <div class="stat-sub">Formula: ${formula} kcal &mdash; <b class="${cls}">${sign}${delta}</b></div>
      </div>`);
  }

  // 6. Physique rating
  if (last.physique_rating != null) {
    const p = physiqueLabel(last.physique_rating);
    cards.push(`
      <div class="stat-card">
        <div class="stat-label">Physique</div>
        <div class="stat-value ${p.cls}">${last.physique_rating} <small style="font-size:.9rem;font-weight:400">/ 9</small></div>
        <div class="stat-sub"><b>${p.label}</b></div>
      </div>`);
  }

  if (cards.length) {
    statsRow.innerHTML = cards.join('');
    statsRow.classList.remove('hidden');
  } else {
    statsRow.classList.add('hidden');
  }
}

// ── Form ───────────────────────────────────────────────────────────────────
function toggleForm() {
  const formCard = document.getElementById('formCard');
  const isHidden = formCard.classList.contains('hidden');
  if (isHidden) {
    // Opening: reset form and set today's date
    document.getElementById('entryForm').reset();
    document.getElementById('f_date').value = todayISO();
  }
  formCard.classList.toggle('hidden');
}

const FIELDS = [
  'weight_kg','bmi','metabolic_age','bmr_kcal','physique_rating',
  'body_fat_pct','body_water_pct','muscle_mass_kg','bone_mass_kg','visceral_fat',
  'left_arm_muscle_kg','left_arm_fat_pct','right_arm_muscle_kg','right_arm_fat_pct',
  'left_leg_muscle_kg','left_leg_fat_pct','right_leg_muscle_kg','right_leg_fat_pct',
  'trunk_muscle_kg','trunk_fat_pct',
];

function collectForm(prefix) {
  const data = { date: document.getElementById(`${prefix}_date`).value };
  FIELDS.forEach(f => {
    const val = document.getElementById(`${prefix}_${f}`)?.value;
    data[f] = val === '' ? null : val;
  });
  return data;
}

async function submitEntry(e) {
  e.preventDefault();
  const data = collectForm('f');
  const r = await fetch('/api/entries', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (r.ok) {
    document.getElementById('entryForm').reset();
    document.getElementById('f_date').value = todayISO();
    document.getElementById('formCard').classList.add('hidden');
    await loadData();
  } else {
    const err = await r.json();
    alert(err.error || 'Failed to save entry');
  }
}

// ── Edit modal ─────────────────────────────────────────────────────────────
function openEditModal(entry) {
  document.getElementById('e_id').value   = entry.id;
  document.getElementById('e_date').value = entry.date;
  FIELDS.forEach(f => {
    const el = document.getElementById(`e_${f}`);
    if (el) el.value = entry[f] ?? '';
  });
  document.getElementById('editModal').classList.remove('hidden');
}
function closeEditModal() { document.getElementById('editModal').classList.add('hidden'); }

async function submitEdit(e) {
  e.preventDefault();
  const id   = document.getElementById('e_id').value;
  const data = collectForm('e');
  const r = await fetch(`/api/entries/${id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (r.ok) { closeEditModal(); await loadData(); }
  else { const err = await r.json(); alert(err.error || 'Failed to update entry'); }
}

async function deleteEntry(id) {
  if (!confirm('Delete this measurement? This cannot be undone.')) return;
  const r = await fetch(`/api/entries/${id}`, { method: 'DELETE' });
  if (r.ok) await loadData();
  else alert('Failed to delete entry');
}

document.getElementById('editModal').addEventListener('click', (e) => {
  if (e.target === document.getElementById('editModal')) closeEditModal();
});

// ── Charts ─────────────────────────────────────────────────────────────────
const CHART_SCALE_DEFAULTS = {
  x: {
    type: 'time',
    time: { unit: 'month', displayFormats: { month: 'MMM yy' } },
    grid: { color: '#2e3148' },
    ticks: { color: '#7b82a0', font: { size: 11 } },
  },
  y: {
    grid: { color: '#2e3148' },
    ticks: { color: '#7b82a0', font: { size: 11 } },
  },
};

const CHART_PLUGIN_DEFAULTS = {
  legend: { labels: { color: '#7b82a0', boxWidth: 12, font: { size: 11 } } },
  tooltip: { backgroundColor: '#1a1d27', borderColor: '#2e3148', borderWidth: 1 },
  annotation: { annotations: {} },
};

const LABELS = {
  weight_kg: 'Weight (kg)', bmi: 'BMI',
  body_fat_pct: 'Body fat (%)', body_water_pct: 'Body water (%)',
  muscle_mass_kg: 'Muscle (kg)', bone_mass_kg: 'Bone (kg)',
  visceral_fat: 'Visceral fat', metabolic_age: 'Metabolic age', bmr_kcal: 'BMR (kcal)',
  physique_rating: 'Physique rating',
  left_arm_muscle_kg: 'L arm muscle', right_arm_muscle_kg: 'R arm muscle',
  left_leg_muscle_kg: 'L leg muscle', right_leg_muscle_kg: 'R leg muscle',
  trunk_muscle_kg: 'Trunk muscle',
  left_arm_fat_pct: 'L arm fat', right_arm_fat_pct: 'R arm fat',
  left_leg_fat_pct: 'L leg fat', right_leg_fat_pct: 'R leg fat',
  trunk_fat_pct: 'Trunk fat',
};

const FIELD_COLORS = ['#6c8ef5','#f56ca8','#4cbb8a','#f5a623','#a78bfa'];

function makeDatasetsMulti(fields, entries) {
  const filter = document.getElementById('userFilter').value;
  const datasets = [];

  if (filter) {
    fields.forEach((f, i) => {
      const data = entries.filter(e => e[f] != null).map(e => ({ x: e.date, y: e[f] }));
      datasets.push({
        label: LABELS[f] || f, data,
        borderColor: FIELD_COLORS[i % FIELD_COLORS.length],
        backgroundColor: FIELD_COLORS[i % FIELD_COLORS.length] + '33',
        pointBackgroundColor: FIELD_COLORS[i % FIELD_COLORS.length],
        pointRadius: 4, pointHoverRadius: 6, tension: 0.3, fill: false,
      });
    });
  } else {
    const byUser = {};
    entries.forEach(e => { if (!byUser[e.user_name]) byUser[e.user_name] = []; byUser[e.user_name].push(e); });
    Object.entries(byUser).forEach(([name, ue]) => {
      fields.forEach((f, i) => {
        const data = ue.filter(e => e[f] != null).map(e => ({ x: e.date, y: e[f] }));
        const base = colorFor(name);
        datasets.push({
          label: `${name} — ${LABELS[f] || f}`, data,
          borderColor: base, backgroundColor: base + '33', pointBackgroundColor: base,
          pointRadius: 4, pointHoverRadius: 6, tension: 0.3, fill: false,
          borderDash: i % 2 === 1 ? [5, 3] : [],
        });
      });
    });
  }
  return datasets;
}

// Build annotation object for weight chart (ideal weight band)
function weightAnnotations() {
  const filter   = document.getElementById('userFilter').value;
  const viewOwn  = !filter || filter === me?.name;
  if (!viewOwn || !myProfile?.height_cm) return {};

  const h   = myProfile.height_cm / 100;
  const lo  = +(h * h * 18.5).toFixed(1);
  const hi  = +(h * h * 24.9).toFixed(1);

  return {
    idealBand: {
      type: 'box',
      yMin: lo, yMax: hi,
      backgroundColor: 'rgba(76,187,138,0.10)',
      borderColor:     'rgba(76,187,138,0.35)',
      borderWidth: 1,
      label: {
        display: true, content: `Ideal weight ${lo}–${hi} kg`,
        position: 'end', color: '#4cbb8a',
        font: { size: 10 }, yAdjust: -6,
      },
    },
  };
}

// Build annotation object for body fat chart (ACE fitness + acceptable bands)
function fatAnnotations() {
  const filter   = document.getElementById('userFilter').value;
  const viewOwn  = !filter || filter === me?.name;
  if (!viewOwn || !myProfile?.sex || !myProfile?.date_of_birth) return {};

  const age    = ageFromDob(myProfile.date_of_birth);
  const ranges = aceRanges(myProfile.sex, age);

  return {
    fitnessBand: {
      type: 'box',
      yMin: ranges.fitness[0], yMax: ranges.fitness[1],
      backgroundColor: 'rgba(76,187,138,0.15)',
      borderColor:     'rgba(76,187,138,0.4)',
      borderWidth: 1,
      label: {
        display: true, content: `Fitness ${ranges.fitness[0]}–${ranges.fitness[1]}%`,
        position: 'end', color: '#4cbb8a',
        font: { size: 10 }, yAdjust: -6,
      },
    },
    acceptableBand: {
      type: 'box',
      yMin: ranges.acceptable[0], yMax: ranges.acceptable[1],
      backgroundColor: 'rgba(245,166,35,0.10)',
      borderColor:     'rgba(245,166,35,0.35)',
      borderWidth: 1,
      label: {
        display: true, content: `Acceptable ${ranges.acceptable[0]}–${ranges.acceptable[1]}%`,
        position: 'end', color: '#f5a623',
        font: { size: 10 }, yAdjust: 12,
      },
    },
  };
}

function buildChartOptions(yLabel, annotations = {}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      ...CHART_PLUGIN_DEFAULTS,
      annotation: { annotations },
    },
    scales: {
      x: { ...CHART_SCALE_DEFAULTS.x },
      y: {
        ...CHART_SCALE_DEFAULTS.y,
        title: yLabel
          ? { display: true, text: yLabel, color: '#7b82a0', font: { size: 10 } }
          : { display: false },
      },
    },
  };
}

function initOrUpdateChart(id, datasets, yLabel, annotations = {}) {
  if (charts[id]) {
    charts[id].data.datasets = datasets;
    charts[id].options.plugins.annotation.annotations = annotations;
    charts[id].update();
    return;
  }
  const ctx = document.getElementById(id).getContext('2d');
  charts[id] = new Chart(ctx, {
    type: 'line',
    data: { datasets },
    options: buildChartOptions(yLabel, annotations),
  });
}

function renderLegend(containerId, items) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = items.map(i =>
    `<span class="legend-dot"><span class="dot" style="background:${i.color};opacity:${i.opacity ?? 1}"></span>${i.label}</span>`
  ).join('');
}

function renderCharts() {
  const e = allEntries;

  // Weight chart with ideal band annotation
  const wAnnotations = weightAnnotations();
  initOrUpdateChart('chart_weight', makeDatasetsMulti(['weight_kg','bmi'], e), 'kg / BMI', wAnnotations);

  const wLegend = [{ color: '#6c8ef5', label: 'Weight (kg)' }, { color: '#f56ca8', label: 'BMI' }];
  if (Object.keys(wAnnotations).length) {
    wLegend.push({ color: 'rgba(76,187,138,0.5)', label: 'Ideal weight (BMI 18.5–24.9)' });
  }
  renderLegend('legend_weight', wLegend);

  // Body fat chart with ACE bands
  const fAnnotations = fatAnnotations();
  initOrUpdateChart('chart_fat_water', makeDatasetsMulti(['body_fat_pct','body_water_pct'], e), '%', fAnnotations);

  const fLegend = [{ color: '#6c8ef5', label: 'Body fat (%)' }, { color: '#f56ca8', label: 'Body water (%)' }];
  if (Object.keys(fAnnotations).length) {
    fLegend.push({ color: 'rgba(76,187,138,0.5)', label: 'Fitness range' });
    fLegend.push({ color: 'rgba(245,166,35,0.5)', label: 'Acceptable range' });
  }
  renderLegend('legend_fat_water', fLegend);

  initOrUpdateChart('chart_muscle_bone', makeDatasetsMulti(['muscle_mass_kg','bone_mass_kg'], e), 'kg');
  initOrUpdateChart('chart_misc', makeDatasetsMulti(['visceral_fat','metabolic_age','bmr_kcal','physique_rating'], e));
  initOrUpdateChart('chart_limb_muscle', makeDatasetsMulti([
    'left_arm_muscle_kg','right_arm_muscle_kg','left_leg_muscle_kg','right_leg_muscle_kg','trunk_muscle_kg',
  ], e), 'kg');
  initOrUpdateChart('chart_limb_fat', makeDatasetsMulti([
    'left_arm_fat_pct','right_arm_fat_pct','left_leg_fat_pct','right_leg_fat_pct','trunk_fat_pct',
  ], e), '%');
}

// ── Table ──────────────────────────────────────────────────────────────────
function fmt(v, decimals = 1) { return v == null ? '—' : Number(v).toFixed(decimals); }

function renderTable() {
  const tbody = document.getElementById('tableBody');
  if (!allEntries.length) {
    tbody.innerHTML = `<tr><td colspan="13"><div class="empty-state">No data yet. Add your first measurement above.</div></td></tr>`;
    return;
  }
  const sorted = [...allEntries].sort((a, b) => b.date.localeCompare(a.date));
  tbody.innerHTML = sorted.map(e => {
    const isMe = e.user_id === me?.id;
    return `<tr>
      <td>${e.date}</td>
      <td><span class="user-badge">${e.user_name}</span>${isMe ? '<span class="tag-you">you</span>' : ''}</td>
      <td>${fmt(e.weight_kg)} kg</td>
      <td>${fmt(e.bmi)}</td>
      <td>${fmt(e.body_fat_pct)}%</td>
      <td>${fmt(e.body_water_pct)}%</td>
      <td>${fmt(e.muscle_mass_kg)} kg</td>
      <td>${fmt(e.bone_mass_kg)} kg</td>
      <td>${fmt(e.visceral_fat)}</td>
      <td>${fmt(e.metabolic_age, 0)}</td>
      <td>${fmt(e.bmr_kcal, 0)}</td>
      <td>${e.physique_rating != null ? e.physique_rating : '—'}</td>
      <td><div class="td-actions">${isMe ? `
        <button class="btn-sm btn-edit" onclick='openEditModal(${JSON.stringify(e)})'>Edit</button>
        <button class="btn-sm btn-del"  onclick="deleteEntry(${e.id})">Delete</button>` : ''}
      </div></td>
    </tr>`;
  }).join('');
}

// ── Start ──────────────────────────────────────────────────────────────────
boot();
