// ============================================================
// ВКЛАДКА «📊 Статистика» (statistics) — топ пісень/віршів, тижневий графік
// активності, хронологічний журнал ефіру, експорт в Excel.
//
// Винесено з src/extras-1.js — продовження модуляризації (typo.js →
// animations.js/fonts.js → playlist.js/powerpoint.js → ця пара). Мусить
// завантажуватись ДО extras-4.js — pv2Init() звертається до
// updateStatistics/saveStatistics/loadStatistics одразу при старті
// застосунку (масив steps).
// ============================================================

function renderStatisticsTab() {
return `<div class="grid2"><div> <div class="card"><div class="card-title">📊 Статистика</div> <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:2px;margin-bottom:3px"><div style="background:var(--bg);border-radius:2px;padding:2px;text-align:center"><div style="font-size:11px;color:var(--text2)">Всього</div><div id="statTotalOutputs" style="font-size:12px;font-weight:700;color:var(--accent)">0</div></div><div style="background:var(--bg);border-radius:2px;padding:2px;text-align:center"><div style="font-size:11px;color:var(--text2)">Найчастіше</div><div id="statMostUsed" style="font-size:12px;font-weight:700;color:var(--gold)">—</div></div><div style="background:var(--bg);border-radius:2px;padding:2px;text-align:center"><div style="font-size:11px;color:var(--text2)">Активність</div><div id="statActivity" style="font-size:12px;font-weight:700;color:var(--green)">0%</div></div></div> <div class="flex" style="margin-bottom:2px"><button class="btn btn-ghost btn-sm" onclick="updateStatistics()">🔄</button><button class="btn btn-ghost btn-sm" onclick="exportStatisticsExcel()">⬇ Excel</button><select id="statPeriod" style="background:var(--bg);border:1px solid var(--border);border-radius:2px;padding:1px 2px;color:var(--text);font-size:11px;outline:none" onchange="updateStatistics()"><option value="day">День</option><option value="week">Тиждень</option><option value="month">Місяць</option><option value="year">Рік</option></select></div> <div id="statChart" style="background:var(--bg);border-radius:2px;padding:3px;height:35px;display:flex;align-items:flex-end;gap:1px;justify-content:space-between"><div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:1px"><div style="width:100%;height:6px;background:var(--accent);border-radius:1px;opacity:0.3"></div><div style="font-size:11px;color:var(--text2)">Пн</div></div><div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:1px"><div style="width:100%;height:12px;background:var(--accent);border-radius:1px;opacity:0.5"></div><div style="font-size:11px;color:var(--text2)">Вт</div></div><div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:1px"><div style="width:100%;height:18px;background:var(--accent);border-radius:1px;opacity:0.7"></div><div style="font-size:11px;color:var(--text2)">Ср</div></div><div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:1px"><div style="width:100%;height:24px;background:var(--accent);border-radius:1px;opacity:0.9"></div><div style="font-size:11px;color:var(--text2)">Чт</div></div><div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:1px"><div style="width:100%;height:30px;background:var(--accent);border-radius:1px;opacity:1"></div><div style="font-size:11px;color:var(--text2)">Пт</div></div><div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:1px"><div style="width:100%;height:18px;background:var(--gold);border-radius:1px;opacity:0.7"></div><div style="font-size:11px;color:var(--text2)">Сб</div></div><div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:1px"><div style="width:100%;height:8px;background:var(--gold);border-radius:1px;opacity:0.4"></div><div style="font-size:11px;color:var(--text2)">Нд</div></div></div> </div></div><div> <div class="card"><div class="card-title">🎵 Топ пісень</div><div id="statTopSongs"><p class="text-muted">Немає</p></div></div> <div class="card"><div class="card-title">📖 Топ віршів</div><div id="statTopBible"><p class="text-muted">Немає</p></div></div> </div></div>` +
  `<div class="card" style="border-color:var(--accent)"><div class="card-title">📜 Журнал ефіру</div><div class="card-sub">Хронологічний список — що саме йшло на екран і коли (той самий період, що вибрано вище). Окремо від «Топ пісень» — тут можна відновити, що показувалось о такій-то хвилині.</div><div id="liveJournalList" style="margin-top:6px;max-height:260px;overflow-y:auto"><p class="text-muted">Немає</p></div><button class="btn btn-ghost btn-sm" style="margin-top:6px;color:var(--red)" onclick="clearLiveJournal()">🗑 Очистити журнал</button></div>`;
}

function _journalIcon(kind) {
  return kind === 'song' ? '🎵' : kind === 'bible' ? '📖' : '📺';
}

function renderLiveJournal() {
  const el = $('#liveJournalList');
  if (!el) return;
  const period = ($('#statPeriod') && $('#statPeriod').value) || 'month';
  const spanMs = period === 'day' ? 24 * 3600 * 1000 : period === 'week' ? 7 * 24 * 3600 * 1000 : period === 'year' ? 365 * 24 * 3600 * 1000 : 30 * 24 * 3600 * 1000;
  const cutoff = Date.now() - spanMs;
  const entries = (state.statsData.log || []).filter(e => e.t >= cutoff).slice(-200).reverse();
  if (!entries.length) { el.innerHTML = '<p class="text-muted">Немає</p>'; return; }
  el.innerHTML = entries.map(e => {
    const d = new Date(e.t);
    const time = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    return `<div style="display:flex;gap:6px;padding:3px 0;border-bottom:1px solid var(--border);font-size:11px">` +
      `<span style="color:var(--text2);min-width:36px">${time}</span>` +
      `<span>${_journalIcon(e.kind)}</span>` +
      `<span style="color:var(--text);flex:1">${esc(e.name || '—')}</span>` +
      `</div>`;
  }).join('');
}

function clearLiveJournal() {
  if (!confirm('Очистити журнал ефіру? Це не зачепить «Топ пісень»/«Топ віршів» — лише хронологічний список.')) return;
  state.statsData.log = [];
  saveStatistics();
  renderLiveJournal();
  notify('🗑 Журнал ефіру очищено');
}

function updateStatistics() {
const period = ($('#statPeriod') && $('#statPeriod').value) || 'month';
const spanMs = period === 'day' ? 24 * 3600 * 1000 : period === 'week' ? 7 * 24 * 3600 * 1000 : period === 'year' ? 365 * 24 * 3600 * 1000 : 30 * 24 * 3600 * 1000;
const cutoff = Date.now() - spanMs;
const logInPeriod = (state.statsData.log || []).filter(e => e.t >= cutoff);

const total = logInPeriod.length;
const totalEl = $('#statTotalOutputs');
if(totalEl) totalEl.textContent = total;

let most = '', max = 0;
const songUsageInPeriod = {}, bibleUsageInPeriod = {};
logInPeriod.forEach(e => {
  if (!e.name) return;
  if (e.kind === 'song') songUsageInPeriod[e.name] = (songUsageInPeriod[e.name] || 0) + 1;
  if (e.kind === 'bible') bibleUsageInPeriod[e.name] = (bibleUsageInPeriod[e.name] || 0) + 1;
});
Object.keys(songUsageInPeriod).forEach(k => {
if(songUsageInPeriod[k] > max) { max = songUsageInPeriod[k]; most = k; }
});
Object.keys(bibleUsageInPeriod).forEach(k => {
if(bibleUsageInPeriod[k] > max) { max = bibleUsageInPeriod[k]; most = k; }
});
const mostEl = $('#statMostUsed');
if(mostEl) mostEl.textContent = most || '—';

const days = 30;
let active = 0;
const dayKeys = Object.keys(state.statsData.dailyActivity || {});
for(let i = 0; i < Math.min(dayKeys.length, days); i++) {
if(state.statsData.dailyActivity[dayKeys[i]] > 0) active;
}
const activityEl = $('#statActivity');
if(activityEl) activityEl.textContent = Math.round(active / days * 100) + '%';

renderTopSongs(songUsageInPeriod);
renderTopBible(bibleUsageInPeriod);
renderLiveJournal();
}

function exportStatisticsExcel() {
  const period = ($('#statPeriod') && $('#statPeriod').value) || 'month';
  const spanMs = period === 'day' ? 24 * 3600 * 1000 : period === 'week' ? 7 * 24 * 3600 * 1000 : period === 'year' ? 365 * 24 * 3600 * 1000 : 30 * 24 * 3600 * 1000;
  const cutoff = Date.now() - spanMs;
  const log = (state.statsData.log || []).filter(e => e.t >= cutoff);

  const songDates = {};
  log.forEach(e => {
    if (e.kind !== 'song' || !e.name) return;
    const day = new Date(e.t).toISOString().split('T')[0];
    (songDates[e.name] = songDates[e.name] || new Set()).add(day);
  });
  const names = Object.keys(songDates).sort();
  const rows = ['Назва пісні,Кількість використань,Дати використання'];
  names.forEach(name => {
    const dates = Array.from(songDates[name]).sort();
    rows.push(`"${name}",${dates.length},"${dates.join('; ')}"`);
  });
  rows.push('');
  rows.push('Період:,' + ({ day: 'День', week: 'Тиждень', month: 'Місяць', year: 'Рік' }[period]));
  rows.push('Усього різних пісень:,' + names.length);
  if (!names.length) { notify('⚠️ За цей період пісень не надсилалось'); return; }
  downloadFile(rows.join('\n'), 'ccli_pisni_' + new Date().toISOString().split('T')[0] + '.csv', 'text/csv');
  notify('📊 Звіт по піснях: ' + names.length);
}

function saveStatistics() { saveJSON(STORAGE_KEYS.statistics, state.statsData); }

function loadStatistics() {
try { const d = loadJSON(STORAGE_KEYS.statistics); if(d) state.statsData = d; } catch(e) {}
updateStatistics();
}
