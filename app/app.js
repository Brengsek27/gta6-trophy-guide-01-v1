const STORAGE_KEY = 'leonida-trophy-atlas-v1';
const CATEGORY_ORDER = ['Platinum', 'Story', 'Missable', 'Collectibles', 'Activities', 'Online'];
const GRADES = ['platinum', 'gold', 'silver', 'bronze'];
const POINTS = { bronze: 15, silver: 30, gold: 90, platinum: 300 };
const params = new URLSearchParams(location.search);
const results = document.querySelector('#results');
const escapeHtml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character],
  );
let data;
let earned = new Set();
let storageAvailable = true;
let toastTimeout;
const expanded = new Set();
const revealed = new Set();
const state = {
  view: params.get('view') === 'roadmap' ? 'roadmap' : 'trophies',
  search: '',
  category: 'All',
  grade: GRADES.includes(params.get('grade')) ? params.get('grade') : 'all',
  status: 'all',
  sort: 'list',
  missable: false,
  shield: params.get('spoilers') !== '0',
};

function medallion(grade, small = false) {
  return `<svg class="grade-${grade}" viewBox="0 0 50 58" fill="none" aria-hidden="true"><path d="M25 2 45 13v27L25 55 5 40V13Z" fill="currentColor" opacity=".07"/><path d="M25 3 44 14v25L25 53 6 39V14Z" stroke="currentColor" opacity=".55"/><path d="M25 7 40 16v21L25 48 10 37V16Z" stroke="currentColor" opacity=".18"/><path d="M17 17h16v10c0 6-4 9-8 9s-8-3-8-9V17Z" fill="currentColor"/><path d="M16 20h-4v5c0 4 3 6 7 6m15-11h4v5c0 4-3 6-7 6" stroke="currentColor" stroke-width="2"/><path d="M23 35h4v6h6v3H17v-3h6z" fill="currentColor"/><path d="m25 20 1.1 2.5 2.8.2-2.1 1.8.6 2.8-2.4-1.4-2.4 1.4.6-2.8-2.1-1.8 2.8-.2Z" fill="#16212a" opacity=".7"/>${small ? '' : '<path d="m7 7 1 3 3 1-3 1-1 3-1-3-3-1 3-1Z" fill="currentColor" opacity=".5"/>'}</svg>`;
}

function notify(message) {
  const toast = document.querySelector('#toast');
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove('visible'), 4000);
}

function syncPlatinum() {
  const platinum = data.trophies.find((trophy) => trophy.grade === 'platinum');
  const complete = data.trophies
    .filter((trophy) => trophy.id !== platinum.id)
    .every((trophy) => earned.has(trophy.id));
  if (complete) earned.add(platinum.id);
  else earned.delete(platinum.id);
}

function persist() {
  syncPlatinum();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...earned]));
  } catch {
    storageAvailable = false;
    notify('Browser storage is unavailable. Export a backup before leaving.');
  }
}

function groupProgress(categories) {
  const trophies = data.trophies.filter((trophy) => categories.includes(trophy.category));
  const done = trophies.filter((trophy) => earned.has(trophy.id)).length;
  return {
    done,
    total: trophies.length,
    percent: trophies.length ? Math.round((done / trophies.length) * 100) : 0,
  };
}

function isMasked(trophy) {
  return state.shield && trophy.spoiler && !earned.has(trophy.id) && !revealed.has(trophy.id);
}

function renderStats() {
  const percent = Math.round((earned.size / data.trophies.length) * 100);
  const points = data.trophies.reduce(
    (total, trophy) => total + (earned.has(trophy.id) ? POINTS[trophy.grade] : 0),
    0,
  );
  document.querySelector('#stats').innerHTML =
    `<div class="completion-number">${percent}<small>%</small></div><div class="completion-track"><div class="stat-label"><span>${earned.size} of 55 earned</span><span>YOUR PLATINUM JOURNEY</span></div><div class="progress-bar" role="progressbar" aria-label="Overall completion" aria-valuemin="0" aria-valuemax="55" aria-valuenow="${earned.size}"><span style="width:${percent}%"></span></div></div><div class="points-stat"><strong>${points.toLocaleString()}</strong><span>TROPHY POINTS</span></div><div class="grade-stats">${GRADES.map(
      (grade) => {
        const trophies = data.trophies.filter((trophy) => trophy.grade === grade);
        return `<div class="grade-chip">${medallion(grade, true)}<div><strong class="grade-${grade}">${trophies.filter((trophy) => earned.has(trophy.id)).length}<span style="color:#778b9c"> / ${trophies.length}</span></strong><small>${grade}</small></div></div>`;
      },
    ).join(
      '',
    )}</div>${percent === 100 ? '<div class="platinum-flourish">✦ Platinum unlocked — Leonida Legend</div>' : ''}`;
  const saveState = document.querySelector('.save-state');
  saveState.innerHTML = `<span class="live-dot"></span>${storageAvailable ? 'SAVED ON THIS DEVICE' : 'SESSION ONLY · EXPORT A BACKUP'}`;
}

function sourcesMarkup(sources) {
  return sources
    .map(
      (source) =>
        `<a href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(source.name)} ↗</a>`,
    )
    .join('');
}

function trophyMarkup(trophy) {
  const masked = isMasked(trophy);
  const checked = earned.has(trophy.id);
  const open = expanded.has(trophy.id);
  const name = masked ? 'Hidden trophy' : trophy.name;
  const description = masked ? 'A secret worth discovering. Reveal when you’re ready.' : trophy.description;
  const platinum = trophy.grade === 'platinum';
  return `<article class="trophy-card ${checked ? 'earned' : ''} ${platinum ? 'featured' : ''} ${open && params.get('open') === trophy.id ? 'is-linked' : ''}" id="${trophy.id}" data-id="${trophy.id}">
    <div class="card-summary"><div class="medallion">${medallion(trophy.grade)}</div><div class="card-text"><div class="card-tags"><span class="tag grade-${trophy.grade}">${trophy.grade}</span><span class="tag category-tag">${trophy.category}</span>${trophy.missable ? '<span class="missable-tag">MISSABLE</span>' : ''}${trophy.hidden ? '<span class="hidden-tag">◇ SECRET</span>' : ''}</div><h3>${escapeHtml(name)}</h3><p>${escapeHtml(description)}</p><div class="card-bottom"><button class="guide-button" data-action="guide" aria-expanded="${open}" aria-controls="guide-${trophy.id}" aria-label="${open ? 'Close' : 'Open'} guide for ${escapeHtml(name)}">${open ? 'Close guide' : 'Field guide'} <span>${open ? '−' : '↗'}</span></button>${masked ? `<button class="reveal-button" data-action="reveal" aria-label="Reveal hidden trophy">Reveal trophy</button>` : ''}</div></div><label class="earned-control" title="${platinum ? 'Unlocks automatically when the other trophies are earned' : 'Mark as earned'}"><input type="checkbox" data-earned="${trophy.id}" aria-label="${platinum ? 'Platinum earned automatically' : `Mark ${escapeHtml(name)} as earned`}" ${checked ? 'checked' : ''} ${platinum ? 'disabled' : ''}><span>✓</span></label></div>
    <section class="guide-panel" id="guide-${trophy.id}" aria-label="${escapeHtml(name)} guide" ${open ? '' : 'hidden'}>${masked ? '<div class="guide-label">SPOILER SHIELD ACTIVE</div><p>This guide discusses a secret trophy. Reveal the trophy to read its route and sources.</p><div class="card-bottom"><button class="reveal-button" data-action="reveal">Reveal trophy & guide</button></div>' : `<div class="guide-label"><span>THE FIELD GUIDE</span><span>${trophy.guide.includes('unresolved') || trophy.guide.includes('unknown') || trophy.guide.includes('has not confirmed') || trophy.guide.includes('has not verified') ? 'UNLOCK UNDER REVIEW' : 'SOURCED ROUTE'}</span></div><p class="${trophy.missable ? 'warning-copy' : ''}">${escapeHtml(trophy.guide)}</p>${trophy.tips.map((tip) => `<div class="tips"><b>FIELD NOTE</b>${escapeHtml(tip)}</div>`).join('')}<div class="sources"><span>SOURCES</span>${sourcesMarkup(trophy.sources)}</div>`}</section>
    </article>`;
}

function filteredTrophies() {
  const query = state.search.toLocaleLowerCase().trim();
  return data.trophies
    .filter((trophy) => {
      const searchable = isMasked(trophy)
        ? `Hidden trophy ${trophy.grade} ${trophy.category}`
        : `${trophy.name} ${trophy.description} ${trophy.guide} ${trophy.category}`;
      return (
        (!query || searchable.toLocaleLowerCase().includes(query)) &&
        (state.category === 'All' || trophy.category === state.category) &&
        (state.grade === 'all' || trophy.grade === state.grade) &&
        (state.status === 'all' ||
          (state.status === 'earned' ? earned.has(trophy.id) : !earned.has(trophy.id))) &&
        (!state.missable || trophy.missable)
      );
    })
    .sort((first, second) =>
      state.sort === 'grade'
        ? GRADES.indexOf(first.grade) - GRADES.indexOf(second.grade)
        : state.sort === 'name'
          ? (isMasked(first) ? 'Hidden trophy' : first.name).localeCompare(
              isMasked(second) ? 'Hidden trophy' : second.name,
            )
          : data.trophies.indexOf(first) - data.trophies.indexOf(second),
    );
}

function renderTrophies() {
  const filtered = filteredTrophies();
  results.innerHTML = `<div class="list-heading"><span><strong>${filtered.length}</strong> TROPHIES IN VIEW <span aria-hidden="true">/</span> 55 TOTAL</span><span>Tick it. Save it. Make it yours.</span></div>${CATEGORY_ORDER.map(
    (category) => {
      const trophies = filtered.filter((trophy) => trophy.category === category);
      if (!trophies.length) return '';
      const progress = groupProgress([category]);
      return `<section class="group" aria-label="${category} trophies"><div class="group-header"><h2>${category === 'Platinum' ? 'The ultimate souvenir' : category}</h2><span class="group-line"></span><span class="group-count">${progress.done} / ${progress.total}</span><span class="mini-bar" aria-hidden="true"><span style="width:${progress.percent}%"></span></span></div><div class="trophy-grid">${trophies.map(trophyMarkup).join('')}</div></section>`;
    },
  ).join(
    '',
  )}${!filtered.length ? `<div class="empty-state"><h2>${state.category === 'Online' ? 'A solo road to platinum.' : 'Nothing on this stretch.'}</h2><p>${state.category === 'Online' ? 'This list contains no online trophies. Every award belongs to single-player.' : 'Try another keyword, grade or status to get back on the road.'}</p><button data-action="reset">Clear filters</button></div>` : ''}`;
  results.querySelectorAll('.trophy-card.featured .category-tag').forEach((tag) => {
    tag.textContent = 'Awarded automatically';
  });
  if (
    state.search ||
    state.grade !== 'all' ||
    state.category !== 'All' ||
    state.status !== 'all' ||
    state.missable
  ) {
    const reset = document.createElement('button');
    reset.className = 'filter-reset';
    reset.dataset.action = 'reset';
    reset.textContent = 'Reset filters ↺';
    results.querySelector('.list-heading').lastElementChild.replaceWith(reset);
  }
  const linkedCard = results.querySelector('.trophy-card.is-linked');
  if (linkedCard && expanded.has(linkedCard.id)) linkedCard.parentElement.prepend(linkedCard);
}

function renderRoadmap() {
  const roadmap = data.roadmap;
  const missables = data.trophies.filter((trophy) => trophy.missable);
  results.innerHTML = `<div class="roadmap-intro"><div><h2>THE LONG ROAD TO LEGEND</h2><p>A considered route. A little less backtracking.</p></div><span class="route-stamp">SINGLE-PLAYER ONLY</span></div><div class="roadmap-metrics"><div class="metric"><span>ESTIMATED DIFFICULTY</span><strong>${roadmap.difficulty}</strong><small>${escapeHtml(roadmap.difficultyNote)}</small></div><div class="metric"><span>TIME TO PLATINUM</span><strong>${roadmap.timeToPlatinum}</strong><small>PowerPyx estimate · exploration sets the pace</small></div></div><section class="roadmap-warning"><h3>! MISSABLES FIRST</h3>${missables.map((trophy) => `<p><strong>${escapeHtml(trophy.name)} — Chapter 1, Jason’s house.</strong> After Down to Earth, talk to Lucia in the kitchen in the morning, follow her to the balcony and accept meditation before leaving the chapter. Potentially missable; the requirement is still being verified. <a href="?open=${trophy.id}" data-jump="${trophy.id}">Read the precaution ↗</a></p>`).join('')}</section><div class="timeline">${roadmap.phases
    .map((phase, index) => {
      const progress = groupProgress(phase.categories);
      return `<section class="phase"><span class="phase-number">${String(index + 1).padStart(2, '0')}</span><div class="phase-header"><h3>${escapeHtml(phase.title)}</h3><span class="phase-time">${escapeHtml(phase.hours)}</span></div><p>${escapeHtml(phase.text)}</p><div class="phase-progress"><span>${phase.categories.join(' + ')}</span><div class="progress-bar"><span style="width:${progress.percent}%"></span></div><strong>${progress.done} / ${progress.total} earned</strong></div></section>`;
    })
    .join(
      '',
    )}</div><p class="roadmap-source">Hours overlap: the opening and final audit sit within the story and cleanup estimates. Category bars reflect the same live tracker and may appear in more than one phase.<br>Route & estimates: ${sourcesMarkup(roadmap.sources)}</p>`;
}

function renderRail() {
  const progress = groupProgress(CATEGORY_ORDER);
  document.querySelector('#side-rail').innerHTML =
    `<section class="rail-panel route-panel"><div class="rail-eyebrow"><span>YOUR NEXT MOVE</span><span>↗</span></div><h2>${state.view === 'roadmap' ? 'A plan for the long run.' : 'The city is yours. Make it count.'}</h2><p>${state.view === 'roadmap' ? 'Start with the one chapter-sensitive precaution. Everything else has room to breathe.' : 'Start with the story. Take the scenic route. Keep the Chapter 1 meditation on your radar.'}</p><button class="rail-action" data-view="${state.view === 'roadmap' ? 'trophies' : 'roadmap'}">${state.view === 'roadmap' ? 'Back to your checklist' : 'Explore the roadmap'} <span>↗</span></button></section>
    <section class="rail-panel warning-panel"><div class="rail-eyebrow"><span>! BEFORE YOU LEAVE CH. 1</span></div><h3>Take a moment. Meditate.</h3><p>Positive Mental Attitude has a potentially missable introduction at Jason’s house. Keep a manual save.</p><button class="rail-action" data-jump="trophy-28">Read the missable note <span>↗</span></button></section>
    <section class="rail-panel"><div class="rail-eyebrow"><span>YOUR PROGRESS, YOURS.</span><span class="backup-icon">⇅</span></div><p style="margin-top:12px">${progress.done} earned. One browser. No account.<br>Take a backup for the next device.</p><div class="backup-actions"><button data-action="export">↓ Export progress</button><button data-action="import">↑ Import progress</button></div><p class="rail-footnote" style="margin-top:10px">JSON backup · stored locally · no cloud sync</p></section>
    <section class="rail-panel"><div class="rail-eyebrow"><span>THE HARDWARE</span><span>POINTS</span></div><div class="legend-list">${GRADES.map((grade) => `<div><span class="grade-${grade}"><i></i>${grade[0].toUpperCase() + grade.slice(1)}</span><b>${POINTS[grade]}</b></div>`).join('')}</div></section><p class="rail-footnote">FIELD EDITION / 19 NOV 2026<br>Source-linked advice. Unconfirmed secrets are labelled inside their guides.</p>`;
}

function render() {
  renderStats();
  document.querySelector('#toolbar').hidden = state.view !== 'trophies';
  document.querySelectorAll('.tabs [data-view]').forEach((button) => {
    button.classList.toggle('active', button.dataset.view === state.view);
    button.setAttribute('aria-current', button.dataset.view === state.view ? 'page' : 'false');
  });
  document.querySelector('#categories').innerHTML = ['All', ...CATEGORY_ORDER.slice(1)]
    .map(
      (category) =>
        `<button data-category="${category}" class="${state.category === category ? 'active' : ''}" aria-pressed="${state.category === category}">${category}${category === 'All' ? ' · 55' : ''}</button>`,
    )
    .join('');
  if (state.view === 'roadmap') renderRoadmap();
  else renderTrophies();
  renderRail();
}

function resetFilters() {
  Object.assign(state, {
    search: '',
    category: 'All',
    grade: 'all',
    status: 'all',
    sort: 'list',
    missable: false,
  });
  document.querySelector('#search').value = '';
  document.querySelector('#grade').value = 'all';
  document.querySelector('#status').value = 'all';
  document.querySelector('#sort').value = 'list';
  document.querySelector('#missable').checked = false;
}

function jumpToGuide(id) {
  if (!data.trophies.some((trophy) => trophy.id === id)) return;
  state.view = 'trophies';
  resetFilters();
  expanded.add(id);
  revealed.add(id);
  render();
  document.getElementById(id)?.scrollIntoView({ block: 'start', behavior: 'instant' });
}

function exportProgress() {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify([...earned], null, 2)], { type: 'application/json' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = 'leonida-trophy-atlas-progress.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  notify('Progress exported. Keep this file as your backup.');
}

document.addEventListener('click', (event) => {
  const viewButton = event.target.closest('[data-view]');
  if (viewButton) {
    state.view = viewButton.dataset.view;
    render();
    return;
  }
  const jump = event.target.closest('[data-jump]');
  if (jump) {
    event.preventDefault();
    jumpToGuide(jump.dataset.jump);
    return;
  }
  const category = event.target.closest('[data-category]');
  if (category) {
    state.category = category.dataset.category;
    render();
    return;
  }
  const action = event.target.closest('[data-action]');
  if (action?.dataset.action === 'export') {
    exportProgress();
    return;
  }
  if (action?.dataset.action === 'import') {
    document.querySelector('#import-file').click();
    return;
  }
  if (action?.dataset.action === 'reset') {
    resetFilters();
    render();
    return;
  }
  const card = event.target.closest('.trophy-card');
  if (!card || event.target.closest('.earned-control') || event.target.closest('a')) return;
  const id = card.dataset.id;
  if (action?.dataset.action === 'reveal') {
    revealed.add(id);
    render();
    document.querySelector(`#${id} .guide-button`)?.focus({ preventScroll: true });
  } else if (action?.dataset.action === 'guide' || event.target.closest('.card-summary')) {
    if (expanded.has(id)) expanded.delete(id);
    else expanded.add(id);
    render();
    document.querySelector(`#${id} .guide-button`)?.focus({ preventScroll: true });
  }
});

document.addEventListener('change', (event) => {
  const id = event.target.dataset.earned;
  if (!id) return;
  if (event.target.checked) earned.add(id);
  else earned.delete(id);
  persist();
  render();
  document.querySelector(`[data-earned="${id}"]`)?.focus({ preventScroll: true });
});

for (const key of ['grade', 'status', 'sort', 'missable', 'spoilers']) {
  document.getElementById(key).addEventListener('change', (event) => {
    if (key === 'spoilers') state.shield = event.target.checked;
    else
      state[key] = event.target.type === 'checkbox' ? event.target.checked : event.target.value.toLowerCase();
    render();
  });
}
document.querySelector('#search').addEventListener('input', (event) => {
  state.search = event.target.value;
  renderTrophies();
});
document.querySelector('#import-file').addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    if (file.size > 65536) throw new Error('Backup is too large. Choose a progress JSON file.');
    const imported = JSON.parse(await file.text());
    const valid = new Set(data.trophies.map((trophy) => trophy.id));
    if (!Array.isArray(imported) || imported.some((id) => typeof id !== 'string' || !valid.has(id)))
      throw new Error('Invalid backup. Expected an array of Leonida trophy IDs.');
    earned = new Set(imported);
    persist();
    render();
    notify(`Backup imported: ${earned.size} of 55 earned.`);
  } catch (error) {
    notify(
      error instanceof SyntaxError ? 'That file is not valid JSON. Progress was not changed.' : error.message,
    );
  }
  event.target.value = '';
});

try {
  const response = await fetch('./data/trophies.json');
  if (!response.ok) throw new Error('Trophy data could not be loaded.');
  data = await response.json();
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    if (!Array.isArray(saved)) throw new Error('Invalid saved progress');
    const ids = new Set(data.trophies.map((trophy) => trophy.id));
    earned = new Set(saved.filter((id) => ids.has(id)));
  } catch {
    storageAvailable = false;
    notify('Saved progress could not be read. Import a backup or start a new session.');
  }
  syncPlatinum();
  const linkedTrophy = data.trophies.find((trophy) => trophy.id === params.get('open'));
  if (linkedTrophy && state.view === 'trophies') {
    expanded.add(linkedTrophy.id);
    if (params.get('spoilers') !== '1') revealed.add(linkedTrophy.id);
    if (!params.has('grade') && linkedTrophy.category !== 'Platinum') state.category = linkedTrophy.category;
  }
  document.querySelector('#grade').value =
    state.grade === 'all' ? 'all' : state.grade[0].toUpperCase() + state.grade.slice(1);
  document.querySelector('#spoilers').checked = state.shield;
  render();
  await document.fonts.ready;
  if (params.has('scroll')) {
    const position = Number(params.get('scroll'));
    if (Number.isFinite(position)) window.scrollTo(0, Math.max(0, position));
  }
  document.documentElement.dataset.atlasReady = 'true';
} catch (error) {
  results.innerHTML = `<div class="empty-state"><h2>The atlas could not open.</h2><p>${escapeHtml(error.message)} Serve the app with node serve.ts and reload.</p></div>`;
}
