#!/usr/bin/env python3
"""Build the crawlable systems view and offline podcast snapshot.

Run with the sibling podcast checkout, or --podcast-root PATH. At runtime the
view refreshes both podcast metadata files together from the canonical site.
"""
import argparse
import json
from datetime import date
from html import escape
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def build(podcast_root):
    catalog = json.loads((podcast_root / 'metadata/systems.json').read_text())
    episodes = json.loads((podcast_root / 'metadata/episodes.json').read_text())
    pages = json.loads((ROOT / 'metadata/system-pages.json').read_text())
    ids = {s['id'] for s in catalog['systems']}
    groups = {g['id']: g for g in catalog['groups']}
    assert len(ids) == len(catalog['systems']), 'Duplicate system IDs'
    for p in pages['pages']:
        date.fromisoformat(p['date'])
        assert set(p['systems']) <= ids, 'Unknown page system ID'
        assert p['url'].startswith('https://')
    rows = []
    for s in catalog['systems']:
        events = [(p['date'], p['title'], p['url']) for p in pages['pages'] if s['id'] in p['systems']]
        for e in episodes:
            rel = e.get('systems', {})
            if s['id'] in rel.get('focus', []) + rel.get('mentions', []) and e.get('release_date'):
                events.append((e['release_date'], f"#{e['number']}: {e['title']}", f"https://podcast.everydaysystems.com/episode/{e['number']}/"))
        events = sorted({(event[2], event[0]): event for event in events}.values())
        first = events[0] if events else None
        url = pages['homepages'].get(s['id'], first[2] if first else f"https://podcast.everydaysystems.com/?systems={s['id']}")
        row = f'<tr><td><a href="{escape(url)}">{escape(s["name"])}</a></td><td>{escape(groups[s["group"]]["label"])}</td>'
        row += '<td class="first-date">'
        row += f'<a href="{escape(first[2])}" title="{escape(first[1])}">{first[0]}</a>' if first else 'Unknown'
        row += f'</td><td class="reference-count">{len(events)}</td><td>Enable JavaScript for the timeline.</td></tr>'
        rows.append((first[0] if first else '9999', s['id'], row))
    payload = json.dumps({'catalog': catalog, 'episodes': episodes, 'pages': pages, 'snapshot_date': date.today().isoformat()}, ensure_ascii=False).replace('</', '<\\/')
    template = (ROOT / 'scripts/systems_template.html').read_text()
    output = template.replace('<!--SYSTEM_ROWS-->', '\n'.join(r[2] for r in sorted(rows))).replace('<!--SYSTEM_DATA-->', payload)
    output = output.replace('<p id="coverage-note"></p>', '<p id="coverage-note">' + escape(pages['coverage_note']) + '</p>')
    (ROOT / 'systems/index.html').write_text(output)
    print(f'Built systems/index.html: {len(rows)} systems, {len(episodes)} episodes, {len(pages["pages"])} web sources')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--podcast-root', type=Path, default=ROOT.parent / 'podcast.everydaysystems.com')
    build(parser.parse_args().podcast_root)
