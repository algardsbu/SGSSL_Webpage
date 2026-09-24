import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { parse } from 'yaml';
import { todayInOslo, monthDays, shiftMonth, validateEvents, upcomingEvents, eventsOnDate } from '../src/lib/calendar.mjs';

const event = (overrides = {}) => ({ id: randomUUID(), title: 'Testarrangement', date: '2026-09-24', published: true, ...overrides });

test('calendar dates follow Norway time around midnight and daylight saving', () => {
  assert.equal(todayInOslo(new Date('2026-09-24T22:30:00Z')), '2026-09-25');
  assert.equal(todayInOslo(new Date('2026-01-24T22:30:00Z')), '2026-01-24');
  assert.equal(todayInOslo(new Date('2026-03-29T01:30:00Z')), '2026-03-29');
});

test('Monday-first month grids handle leap years and year boundaries', () => {
  const september = monthDays(2026, 8);
  assert.equal(september.length, 42);
  assert.equal(september[0], null);
  assert.equal(september[1], '2026-09-01');
  assert.equal(september.filter(Boolean).length, 30);
  assert.equal(monthDays(2024, 1).filter(Boolean).length, 29);
  assert.equal(monthDays(2025, 1).filter(Boolean).length, 28);
  assert.deepEqual(shiftMonth(2026, 11, 1), { year: 2027, month: 0 });
  assert.deepEqual(shiftMonth(2026, 0, -1), { year: 2025, month: 11 });
});

test('upcoming calendar excludes drafts and past dates and sorts by date/time', () => {
  const events = validateEvents([
    event({ title: 'Evening', time: '19:00' }), event({ title: 'Morning', time: '09:00' }),
    event({ title: 'All day' }), event({ title: 'Draft', published: false }),
    event({ title: 'Past', date: '2026-09-23' }), event({ title: 'Future', date: '2026-10-01' }),
  ]);
  assert.equal(validateEvents([event({ time: '14:00-16:00' })])[0].time, '14:00-16:00');
  assert.deepEqual(upcomingEvents(events, '2026-09-24').map(item => item.title), ['All day', 'Morning', 'Evening']);
  assert.deepEqual(eventsOnDate(events, '2026-09-24').map(item => item.title), ['All day', 'Morning', 'Evening']);
  assert.equal(upcomingEvents(events, '2027-01-01').length, 0);
});

test('CMS events default to drafts and validate dates, times, metadata and stable IDs', () => {
  const draft = event();
  delete draft.published;
  assert.equal(validateEvents([draft])[0].published, false);
  for (const overrides of [{ date: '2026-02-30' }, { date: '2026-9-2' }, { date: '0000-01-01' }, { time: '25:00' }, { time: '9:30' }, { time: '14:00-' }, { title: '' }, { id: 'bad-id' }, { published: 'false' }, { location: {} }, { description: 'x'.repeat(1001) }, { injected: true }]) {
    assert.throws(() => validateEvents([event(overrides)]));
  }
  const duplicated = event();
  assert.throws(() => validateEvents([duplicated, { ...duplicated, title: 'Another name' }]), /Duplicate/);
  assert.deepEqual(validateEvents([]), []);
});

test('Pages CMS exposes events as a shared editable JSON list with unpublished defaults', async () => {
  const cms = parse(await readFile('.pages.yml', 'utf8'));
  const events = cms.content.find(entry => entry.name === 'events');
  assert.equal(events.label, 'Arrangementer');
  assert.equal(events.type, 'file');
  assert.equal(events.path, 'src/data/events.json');
  assert.equal(events.format, 'json');
  assert.equal(events.list, true);
  assert.equal(events.fields.find(field => field.name === 'published').default, false);
  assert.equal(events.fields.find(field => field.name === 'id').readonly, true);
});
