/* Shared metadata in, one row per system out. No separate taxonomy. */
(function () {
  'use strict';
  const PODCAST = 'https://podcast.everydaysystems.com';
  const keys = ['name', 'family', 'first', 'source', 'activity'];
  const defaults = {q: '', families: [], from: '', to: '', sort: 'first', dir: 'asc', page: 1, size: 25};
  const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  const safeURL = value => { try { return ['https:', 'http:'].includes(new URL(value).protocol); } catch { return false; } };
  const escape = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[ch]));
  const color = value => /^#[0-9a-f]{6}$/i.test(value || '') ? value : '#666666';
  const day = value => Date.parse(value + 'T00:00:00Z');

  function validate(catalog, episodes) {
    if (!Array.isArray(catalog.groups) || !Array.isArray(catalog.systems) || !catalog.systems.length || !Array.isArray(episodes) || !episodes.length) throw Error('Incomplete metadata');
    const groups = new Set(catalog.groups.map(g => g.id));
    const systems = new Set(catalog.systems.map(s => s.id));
    if (systems.size !== catalog.systems.length || catalog.systems.some(s => !s.id || typeof s.name !== 'string' || !groups.has(s.group))) throw Error('Invalid catalog');
    const numbers = new Set();
    for (const ep of episodes) {
      if (!Number.isInteger(ep.number) || numbers.has(ep.number) || (ep.release_date && !validDate(ep.release_date))) throw Error('Invalid episode');
      numbers.add(ep.number);
      const focus = ep.systems?.focus || [], mentions = ep.systems?.mentions || [];
      if (!Array.isArray(focus) || !Array.isArray(mentions) || [...focus, ...mentions].some(id => !systems.has(id)) || focus.some(id => mentions.includes(id))) throw Error('Inconsistent episode tags');
    }
  }

  function derive(catalog, episodes, pages) {
    validate(catalog, episodes);
    return catalog.systems.map(system => {
      const family = catalog.groups.find(g => g.id === system.group);
      const events = [];
      for (const ep of episodes) {
        const relation = ep.systems?.focus?.includes(system.id) ? 'focus' : ep.systems?.mentions?.includes(system.id) ? 'mention' : null;
        if (relation && validDate(ep.release_date)) events.push({date: ep.release_date, title: `#${ep.number}: ${ep.title}`, url: `${PODCAST}/episode/${ep.number}/`, kind: relation});
      }
      for (const p of pages.pages) if (p.systems.includes(system.id) && validDate(p.date) && safeURL(p.url)) events.push({date: p.date, title: p.title, url: p.url, kind: 'web'});
      events.sort((a, b) => a.date.localeCompare(b.date) || a.url.localeCompare(b.url));
      const unique = events.filter((e, i) => !events.slice(0, i).some(p => p.url === e.url && p.date === e.date));
      const homepage = pages.homepages[system.id];
      return {...system, family: family.label, color: color(family.color), events: unique, first: unique[0]?.date || null, source: unique[0]?.title || null, activity: unique.length, url: safeURL(homepage) ? homepage : `${PODCAST}/?systems=${encodeURIComponent(system.id)}`};
    });
  }

  function readState(search, groups) {
    const p = new URLSearchParams(search), state = {...defaults};
    state.q = (p.get('q') || '').slice(0, 200);
    state.families = [...new Set((p.get('families') || '').split(','))].filter(id => groups.some(g => g.id === id));
    for (const key of ['from', 'to']) state[key] = validDate(p.get(key)) ? p.get(key) : '';
    // Old links that sorted the separate source-title column now sort its date.
    state.sort = keys.includes(p.get('sort')) && p.get('sort') !== 'source' ? p.get('sort') : defaults.sort;
    state.dir = ['asc', 'desc'].includes(p.get('dir')) ? p.get('dir') : state.sort === 'activity' ? 'desc' : 'asc';
    state.size = [25, 50, 100].includes(Number(p.get('size'))) ? Number(p.get('size')) : defaults.size;
    state.page = Math.min(10000, Math.max(1, parseInt(p.get('page'), 10) || 1));
    return state;
  }

  function selectRows(rows, state) {
    const q = state.q.toLocaleLowerCase();
    return rows.filter(r => (!state.families.length || state.families.includes(r.group)) && (!state.from || r.first && r.first >= state.from) && (!state.to || r.first && r.first <= state.to) && (!q || [r.name, r.family, ...r.events.map(e => e.title)].join(' ').toLocaleLowerCase().includes(q))).sort((a, b) => {
      const av = a[state.sort], bv = b[state.sort];
      if (av == null || bv == null) return av == null && bv == null ? a.id.localeCompare(b.id) : av == null ? 1 : -1;
      const cmp = typeof av === 'number' ? av - bv : av.localeCompare(bv);
      return cmp * (state.dir === 'asc' ? 1 : -1) || a.id.localeCompare(b.id);
    });
  }

  function bounds(rows, now = new Date()) {
    const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    const dates = rows.flatMap(r => r.events.map(e => e.date)).filter(d => day(d) <= +today).sort();
    const start = dates.length ? `${dates[0].slice(0, 4)}-01-01` : `${today.getUTCFullYear()}-01-01`;
    return {start: day(start), end: +today, year: Number(start.slice(0, 4))};
  }

  function csv(rows) {
    const cell = value => '"' + String(value ?? '').replace(/"/g, '""') + '"';
    return [['System', 'System Family', 'First Mentioned', 'References', 'Podcast & Page Timeline'], ...rows.map(r => [r.name, r.family, r.first ? `${r.first} | ${r.events[0].url}` : '', r.activity, r.events.map(e => `${e.date} | ${e.kind} | ${e.title} | ${e.url}`).join('\n')])].map(row => row.map(cell).join(',')).join('\r\n');
  }
  if (typeof module !== 'undefined' && module.exports) { module.exports = {derive, selectRows, readState, bounds, csv, validate}; return; }

  const $ = id => document.getElementById(id);
  let data = JSON.parse($('systems-data').textContent), rows = derive(data.catalog, data.episodes, data.pages);
  let state = readState(location.search, data.catalog.groups), filtered = [], scale;
  const clusters = new Map();
  const kindLabels = {focus: 'Podcast focus', mention: 'Podcast mention', web: 'Web page / archive'};

  function timeline(row) {
    const buckets = new Map(), marks = [];
    const visible = row.events.filter(e => day(e.date) <= scale.end);
    const position = date => 2 + 96 * (day(date) - scale.start) / Math.max(1, scale.end - scale.start);
    for (const kind of ['focus', 'mention', 'web']) {
      let group = [], index = 0;
      for (const e of visible.filter(item => item.kind === kind)) {
        const average = group.reduce((sum, item) => sum + position(item.date), 0) / group.length;
        if (group.length && position(e.date) - average >= 4.6) { buckets.set(`${kind}-${index++}`, group); group = []; }
        group.push(e);
      }
      if (group.length) buckets.set(`${kind}-${index}`, group);
    }
    for (const [key, events] of buckets) {
      const e = events[0], x = events.reduce((sum, item) => sum + position(item.date), 0) / events.length;
      const lane = {focus: 0, mention: 1, web: 2}[e.kind];
      if (events.length > 1) {
        const id = `${row.id}-${key}`;
        clusters.set(id, events);
        marks.push(`<button type="button" class="mark cluster ${e.kind}" style="left:${x}%;top:${7 + lane * 16}px" data-cluster="${escape(id)}" aria-haspopup="dialog" aria-expanded="false" aria-label="${events.length} ${kindLabels[e.kind]} references, ${events[0].date} to ${events.at(-1).date}; open source links">${events.length}</button>`);
        continue;
      }
      const label = `${e.title} · ${e.date} · ${kindLabels[e.kind]}`;
      marks.push(`<a class="mark ${e.kind}" href="${escape(e.url)}" style="left:${x}%;top:${7 + lane * 16}px" data-tooltip="${escape(label)}" aria-label="${escape(label)}"></a>`);
    }
    const span = visible.length ? `<span class="life-span" aria-hidden="true" style="left:${position(visible[0].date)}%;width:${position(visible.at(-1).date) - position(visible[0].date)}%"></span>` : '';
    const activityLabel = visible.length ? `; indexed activity ${visible[0].date} to ${visible.at(-1).date}` : '; no dated activity through today';
    return `<div class="timeline" aria-label="${escape(row.name)} reference timeline${activityLabel}">${span}${marks.join('')}</div><section id="sources-${escape(row.id)}" class="references" aria-label="Sources for ${escape(row.name)}" tabindex="-1" hidden><div class="source-heading"><strong>${escape(row.name)} · ${row.activity} sources</strong><button type="button" data-close-sources="${escape(row.id)}">Close</button></div><a class="podcast-drill" href="${PODCAST}/?systems=${encodeURIComponent(row.id)}">Filter podcast to this system ↗</a><ol>${row.events.map(e => `<li><a href="${escape(e.url)}">${escape(e.title)}</a><small>${e.date} · ${kindLabels[e.kind]}</small></li>`).join('')}</ol></section>`;
  }

  function syncURL() {
    const p = new URLSearchParams();
    for (const key of ['q', 'from', 'to', 'sort', 'dir', 'size', 'page']) if (state[key] !== defaults[key]) p.set(key, state[key]);
    if (state.families.length) p.set('families', state.families.join(','));
    history.replaceState(null, '', location.pathname + (p.size ? '?' + p : '') + location.hash);
  }

  function render(sync = true) {
    hideTooltip();
    clusters.clear();
    scale = bounds(rows);
    filtered = selectRows(rows, state);
    const totalPages = Math.max(1, Math.ceil(filtered.length / state.size));
    state.page = Math.min(state.page, totalPages);
    $('search').value = state.q; $('from').value = state.from; $('to').value = state.to; $('page-size').value = state.size;
    $('families').innerHTML = '<span class="filter-label">Families</span>' + data.catalog.groups.map(g => `<button class="family" data-family="${escape(g.id)}" style="--tag-color:${color(g.color)}" aria-pressed="${state.families.includes(g.id)}">${escape(g.label)} <span>${rows.filter(r => r.group === g.id).length}</span></button>`).join('');
    const chips = [['q', state.q && `Search: ${state.q}`], ['from', state.from && `From: ${state.from}`], ['to', state.to && `To: ${state.to}`], ...state.families.map(id => [id, data.catalog.groups.find(g => g.id === id).label])].filter(([, label]) => label);
    $('chips').innerHTML = chips.map(([key, label]) => `<button data-remove="${escape(key)}" aria-label="Remove filter ${escape(label)}">${escape(label)} ×</button>`).join('');
    $('clear').disabled = chips.length === 0;
    $('results').textContent = `${filtered.length} of ${rows.length} systems` + (filtered.length ? ` · ${1 + (state.page - 1) * state.size}–${Math.min(state.page * state.size, filtered.length)}` : ' · No matches');
    const years = [scale.year];
    for (let y = Math.ceil((scale.year + 1) / 5) * 5; y < new Date(scale.end).getUTCFullYear() - 1; y += 5) years.push(y);
    $('axis').innerHTML = years.map(y => `<span style="left:${2 + 96 * (day(`${y}-01-01`) - scale.start) / (scale.end - scale.start || 1)}%">${y}</span>`).join('') + '<span style="left:98%">Today</span>';
    document.querySelectorAll('th[data-key]').forEach(th => {
      const active = th.dataset.key === state.sort;
      th.setAttribute('aria-sort', active ? state.dir === 'asc' ? 'ascending' : 'descending' : 'none');
      th.querySelector('.sort-indicator').textContent = active ? state.dir === 'asc' ? '▲' : '▼' : '↕';
    });
    $('rows').innerHTML = filtered.slice((state.page - 1) * state.size, state.page * state.size).map(r => `<tr id="${escape(r.id)}" style="--tag-color:${r.color}"><td class="system-name"><a href="${escape(r.url)}">${escape(r.name)}</a></td><td><button class="family row-family" data-family="${escape(r.group)}" aria-pressed="${state.families.includes(r.group)}">${escape(r.family)}</button></td><td class="first-date">${r.first ? `<a href="${escape(r.events[0].url)}" title="${escape(r.events[0].title)} · ${kindLabels[r.events[0].kind]}">${r.first}</a>` : 'Unknown'}</td><td class="reference-count">${r.activity ? `<a href="#sources-${escape(r.id)}" data-sources="${escape(r.id)}" aria-controls="sources-${escape(r.id)}" aria-expanded="false" aria-label="View ${r.activity} sources for ${escape(r.name)}">${r.activity.toLocaleString()}</a>` : '0'}</td><td class="timeline-cell">${timeline(r)}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">No systems match these filters. Try clearing a filter.</td></tr>';
    const linkedSources = document.getElementById(location.hash.slice(1));
    if (linkedSources?.classList.contains('references')) setSources(linkedSources, true, false);
    $('pagination').hidden = totalPages <= 1;
    $('page-label').textContent = `Page ${state.page} of ${totalPages}`;
    document.querySelectorAll('[data-page]').forEach(b => { b.disabled = ['first', 'prev'].includes(b.dataset.page) ? state.page === 1 : state.page === totalPages; });
    if (sync) syncURL();
  }
  function change() { state.page = 1; render(); }
  function setSources(panel, open, focus = true) {
    panel.hidden = !open;
    const link = document.querySelector(`[data-sources][aria-controls="${CSS.escape(panel.id)}"]`);
    link?.setAttribute('aria-expanded', String(open));
    if (!open && location.hash === '#' + panel.id) history.replaceState(null, '', location.pathname + location.search);
    if (focus) {
      const target = open ? panel : link;
      target?.focus({preventScroll:true});
      target?.scrollIntoView({block:'nearest', inline:'nearest'});
    }
  }
  document.addEventListener('click', e => {
    const link = e.target.closest('[data-sources]'), close = e.target.closest('[data-close-sources]');
    if (link && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) { e.preventDefault(); const panel = $(link.getAttribute('aria-controls')); setSources(panel, panel.hidden); }
    if (close) setSources(close.closest('.references'), false);
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { const panel = e.target.closest('.references'); if (panel) setSources(panel, false); } });
  $('controls').hidden = false; $('actions').hidden = false;
  $('coverage-note').textContent = data.pages.coverage_note;
  $('search').addEventListener('input', e => { state.q = e.target.value.slice(0, 200); change(); });
  for (const key of ['from', 'to']) $(key).addEventListener('change', e => { state[key] = validDate(e.target.value) ? e.target.value : ''; change(); });
  $('page-size').addEventListener('change', e => { state.size = Number(e.target.value); change(); });
  $('clear').addEventListener('click', () => { state = {...state, q: '', families: [], from: '', to: ''}; change(); });
  document.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.family) {
      const id = b.dataset.family;
      state.families = state.families.includes(id) ? state.families.filter(x => x !== id) : [...state.families, id]; change();
      document.querySelector(`#families [data-family="${CSS.escape(id)}"]`)?.focus();
    }
    if (b.dataset.remove) { const key = b.dataset.remove; if (['q', 'from', 'to'].includes(key)) state[key] = ''; else state.families = state.families.filter(x => x !== key); change(); $('clear').focus(); }
    if (b.dataset.sort) { const key = b.dataset.sort; state.dir = state.sort === key ? state.dir === 'asc' ? 'desc' : 'asc' : key === 'activity' ? 'desc' : 'asc'; state.sort = key; change(); }
    if (b.dataset.page) { const last = Math.max(1, Math.ceil(filtered.length / state.size)); state.page = ({first: 1, prev: state.page - 1, next: state.page + 1, last})[b.dataset.page]; render(); }
  });
  $('download').addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob(['\uFEFF' + csv(filtered)], {type: 'text/csv;charset=utf-8'}));
    const a = document.createElement('a'); a.href = url; a.download = 'everyday-systems.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  let activeMark = null, hideTimer = null;
  function hideTooltip() {
    $('tooltip').hidden = true;
    activeMark?.setAttribute('aria-expanded', 'false');
    activeMark?.removeAttribute('aria-describedby');
  }
  function showTooltip(e) {
    const mark = e.target.closest('[data-tooltip], [data-cluster], [data-legend]'); if (!mark) return;
    clearTimeout(hideTimer);
    if (activeMark !== mark) hideTooltip();
    activeMark = mark;
    const tip = $('tooltip'), events = clusters.get(mark.dataset.cluster);
    tip.setAttribute('role', events ? 'dialog' : 'tooltip');
    tip.setAttribute('aria-label', events ? 'Nearby references' : mark.hasAttribute('data-legend') ? 'Timeline legend' : 'Source information');
    if (events) {
      tip.innerHTML = `<strong>${events.length} nearby references</strong><ul>${events.map(item => `<li><a href="${escape(item.url)}">${escape(item.title)}</a><small>${item.date} · ${kindLabels[item.kind]}</small></li>`).join('')}</ul>`;
      mark.setAttribute('aria-expanded', 'true');
    } else if (mark.hasAttribute('data-legend')) {
      tip.replaceChildren($('timeline-legend').content.cloneNode(true));
      tip.querySelector('[data-scale-label]').textContent = `${scale.year}–today`;
      mark.setAttribute('aria-describedby', 'tooltip');
      mark.setAttribute('aria-expanded', 'true');
    } else { tip.textContent = mark.dataset.tooltip; mark.setAttribute('aria-describedby', 'tooltip'); }
    tip.hidden = false;
    const rect = mark.getBoundingClientRect();
    tip.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - tip.offsetWidth - 8))}px`;
    tip.style.top = `${Math.max(8, Math.min(rect.bottom + 5, innerHeight - tip.offsetHeight - 8))}px`;
  }
  document.addEventListener('pointerover', showTooltip); document.addEventListener('focusin', showTooltip);
  document.addEventListener('click', e => { if (e.target.closest('[data-cluster]')) { showTooltip(e); $('tooltip').querySelector('a')?.focus(); } else if (e.target.closest('[data-legend]')) showTooltip(e); else if (!e.target.closest('#tooltip')) hideTooltip(); });
  for (const type of ['pointerout', 'focusout']) document.addEventListener(type, e => {
    if (e.target.closest('[data-tooltip], [data-cluster], [data-legend], #tooltip') && !e.relatedTarget?.closest?.('#tooltip')) hideTimer = setTimeout(hideTooltip, 180);
  });
  $('tooltip').addEventListener('pointerover', () => clearTimeout(hideTimer));
  $('tooltip').addEventListener('focusin', () => clearTimeout(hideTimer));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { if ($('tooltip').contains(document.activeElement)) activeMark?.focus(); hideTooltip(); } });
  document.addEventListener('scroll', e => { if (!e.target.closest?.('#tooltip')) hideTooltip(); }, true);
  window.addEventListener('popstate', () => { state = readState(location.search, data.catalog.groups); render(false); });
  render();
  $('data-status').textContent = 'Saved metadata snapshot. Checking for podcast updates…';
  // A failed or inconsistent update never replaces the complete saved pair.
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 8000);
  Promise.all(['systems', 'episodes'].map(name => fetch(`${PODCAST}/metadata/${name}.json`, {signal: controller.signal, cache: 'no-cache'}).then(r => { if (!r.ok) throw Error('Metadata unavailable'); return r.json(); })))
    .then(([catalog, episodes]) => {
      const updated = derive(catalog, episodes, data.pages);
      data = {...data, catalog, episodes}; rows = updated;
      state.families = state.families.filter(id => catalog.groups.some(g => g.id === id)); render();
      $('data-status').textContent = 'Podcast metadata refreshed from the podcast site. Web references are curated separately.';
    }).catch(() => { $('data-status').textContent = `Live podcast metadata unavailable; showing the saved snapshot from ${data.snapshot_date}.`; })
    .finally(() => clearTimeout(timer));
})();
