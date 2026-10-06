const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {derive, selectRows, readState, bounds, csv, validate} = require('../systems/app.js');
const catalog = {groups: [{id:'body', label:'Body', color:'#123456'}], systems: [{id:'a', name:'Alpha', group:'body'}, {id:'b', name:'Beta', group:'body'}, {id:'c', name:'Undated', group:'body'}]};
const episodes = [{number:1, title:'First episode', release_date:'2006-01-01', systems:{focus:['a'], mentions:['b']}}, {number:2, title:'Later, "episode"', release_date:'2026-01-01', systems:{focus:['a'], mentions:[]}}];
const pages = {homepages:{}, pages:[{date:'2002-06-11', title:'Early page', url:'https://example.com/early', systems:['a']}]};

test('a web source can precede podcasts; each relationship is counted once', () => {
  const rows = derive(catalog, episodes, pages);
  assert.equal(rows[0].first, '2002-06-11');
  assert.equal(rows[0].events[0].kind, 'web');
  assert.equal(rows[0].activity, 3);
  assert.equal(rows[1].events[0].kind, 'mention');
  assert.equal(rows[2].first, null);
});
test('live additions and corrected tags flow into derived rows', () => {
  const newer = {...catalog, systems:[...catalog.systems, {id:'d', name:'New', group:'body'}]};
  const updated = [...episodes, {number:3, title:'New episode', release_date:'2026-10-06', systems:{focus:['d'], mentions:['b']}}];
  const rows = derive(newer, updated, pages);
  assert.equal(rows.length, 4); assert.equal(rows[3].first, '2026-10-06'); assert.equal(rows[1].activity, 2);
  assert.equal(rows[3].color, '#123456');
});
test('inconsistent live metadata is rejected before replacing a saved pair', () => {
  assert.throws(() => validate(catalog, [{...episodes[0], systems:{focus:['new-id'], mentions:[]}}]));
  assert.throws(() => validate(catalog, [{...episodes[0], systems:{focus:['a'], mentions:['a']}}]));
});
test('missing dates sort last in both directions with deterministic ties', () => {
  const rows = derive(catalog, episodes, pages);
  for (const dir of ['asc','desc']) assert.equal(selectRows(rows, {...readState('', catalog.groups), dir}).at(-1).id, 'c');
});
test('literal search, family, and date filters compose', () => {
  const rows = derive(catalog, episodes, pages), state = readState('?q=early&families=body&to=2003-01-01', catalog.groups);
  assert.deepEqual(selectRows(rows, state).map(r=>r.id), ['a']);
  assert.equal(selectRows(rows, {...state,q:'['}).length, 0);
  assert.equal(selectRows(rows, {...state,from:'2004-01-01'}).length, 0);
});
test('URL state discards invalid keys, dates, families and sizes', () => {
  const state = readState('?sort=__proto__&dir=no&from=2002-02-31&families=body,unknown,body&size=-1&page=-10', catalog.groups);
  assert.equal(state.sort,'first'); assert.equal(state.dir,'asc'); assert.equal(state.from,'');
  assert.deepEqual(state.families,['body']); assert.equal(state.size,25); assert.equal(state.page,1);
});
test('timeline uses earliest indexed year through today, never future publication dates', () => {
  const rows = derive(catalog, [...episodes,{number:3,title:'Future',release_date:'2030-01-01',systems:{focus:['a'],mentions:[]}}], pages);
  const scale = bounds(rows,new Date(2026,9,6));
  assert.equal(scale.start,Date.parse('2002-01-01T00:00:00Z'));
  assert.equal(scale.end,Date.parse('2026-10-06T00:00:00Z'));
});
test('CSV exports every selected row and preserves titles, dates and source URLs', () => {
  const output = csv(derive(catalog,episodes,pages));
  assert.ok(output.includes('Later, ""episode""')); // Part of the timeline cell.
  assert.ok(output.includes('https://example.com/early'));
  assert.ok(output.includes('"Undated"'));
  assert.equal(csv([]).split('\r\n').length,1);
});
test('curated references use real dates and resolve to the saved catalog', () => {
  const root = path.resolve(__dirname,'..');
  const html = fs.readFileSync(path.join(root,'systems/index.html'),'utf8');
  const snapshot = JSON.parse(html.match(/<script id="systems-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
  const rows = derive(snapshot.catalog,snapshot.episodes,snapshot.pages);
  assert.equal(rows.length,snapshot.catalog.systems.length);
  const ids = new Set(rows.map(r=>r.id));
  for (const page of snapshot.pages.pages) {
    assert.ok(page.evidence);
    assert.ok(page.systems.every(id=>ids.has(id)));
    assert.equal(new Date(page.date).toISOString().slice(0,10),page.date);
  }
});
