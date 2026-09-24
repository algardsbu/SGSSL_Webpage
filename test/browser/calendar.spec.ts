import { test, expect, type Page } from '@playwright/test';

type CalendarEvent = {
  id: string;
  title: string;
  date: string;
  time?: string;
  location?: string;
  description?: string;
  published: boolean;
};
const fixtureId = (number: number) => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`;

// These events exist only in the browser's isolated document. CMS data stays untouched.
async function mountFixture(page: Page, events: CalendarEvent[] = [], route = '/') {
  await page.clock.setFixedTime(new Date('2026-12-15T12:00:00Z'));
  await page.goto(route);
  await page.evaluate(async fixtureEvents => {
    await customElements.whenDefined('sgssl-event-calendar');
    const source = document.querySelector('sgssl-event-calendar');
    if (!source) throw new Error('The homepage calendar is missing.');
    const replacement = source.cloneNode(true) as HTMLElement;
    replacement.setAttribute('data-events', JSON.stringify(fixtureEvents));
    source.replaceWith(replacement);
  }, events);
  return page.locator('[data-event-calendar]');
}

test('calendar starts in the current Oslo month and navigates across a year boundary', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const calendar = await mountFixture(page);
  const month = calendar.locator('[data-month-label]');
  await expect(month).toHaveText(/desember 2026/i);
  await expect(calendar.locator('[data-date]')).toHaveCount(31);
  await expect(calendar.locator('[data-date="2026-12-15"]')).toHaveAttribute('aria-current', 'date');
  await expect(calendar.locator('[data-calendar-grid] > :nth-child(2)')).toHaveAttribute('data-date', '2026-12-01');

  await calendar.getByRole('button', { name: 'Forrige måned' }).click();
  await expect(month).toHaveText(/november 2026/i);
  await expect(calendar.locator('[data-date]')).toHaveCount(30);
  await calendar.getByRole('button', { name: 'Neste måned' }).click();
  await calendar.getByRole('button', { name: 'Neste måned' }).click();
  await expect(month).toHaveText(/januar 2027/i);
  await expect(calendar.locator('[data-date="2027-01-01"]')).toBeVisible();
  await calendar.getByRole('button', { name: 'Forrige måned' }).click();
  await expect(month).toHaveText(/desember 2026/i);
  await calendar.locator('[data-date="2026-12-31"]').focus();
  await page.keyboard.press('ArrowRight');
  await expect(month).toHaveText(/januar 2027/i);
  await expect(calendar.locator('[data-date="2027-01-01"]')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(calendar.locator('[data-date="2027-01-01"]')).toHaveAttribute('aria-pressed', 'true');
  expect(errors).toEqual([]);
});

test('selecting an empty day has useful feedback and I dag restores the current month', async ({ page }) => {
  const calendar = await mountFixture(page);
  const details = calendar.locator('[data-event-details]');
  await expect(details).toContainText('Ingen kommende arrangementer er publisert ennå.');
  await calendar.locator('[data-date="2026-12-16"]').click();
  await expect(calendar.locator('[data-date="2026-12-16"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(details).toContainText('Ingen arrangementer denne dagen.');
  await expect(details.locator('[data-events-heading]')).toContainText(/16.*desember.*2026/i);

  await calendar.getByRole('button', { name: 'Neste måned' }).click();
  await expect(calendar.locator('[data-month-label]')).toHaveText(/januar 2027/i);
  await calendar.getByRole('button', { name: 'I dag', exact: true }).click();
  await expect(calendar.locator('[data-month-label]')).toHaveText(/desember 2026/i);
  await expect(calendar.locator('[data-date="2026-12-15"]')).toHaveAttribute('aria-current', 'date');
  await expect(calendar.locator('[data-date="2026-12-15"]')).toHaveAttribute('aria-pressed', 'true');
});

test('calendar lists upcoming published events and treats event text as plain text', async ({ page }) => {
  const title = '<img src=x onerror="window.__calendarXss=true">';
  const description = '<script>window.__calendarXss=true</script>';
  const location = '"><svg onload="window.__calendarXss=true">';
  const calendar = await mountFixture(page, [
    { id: fixtureId(1), title: 'Tidligere arrangement', date: '2026-12-14', published: true },
    { id: fixtureId(2), title, description, location, date: '2026-12-15', time: '18:00', published: true },
    { id: fixtureId(3), title: 'Andre arrangement', date: '2026-12-16', time: '17:30', published: true },
    { id: fixtureId(4), title: 'Tredje arrangement', date: '2026-12-17', published: true },
    { id: fixtureId(5), title: 'Fjerde arrangement', date: '2026-12-18', published: true },
    { id: fixtureId(6), title: 'HEMMELIG UTKAST I TEST', date: '2026-12-15', published: false },
  ]);
  const details = calendar.locator('[data-event-details]');
  await expect(details.getByRole('listitem')).toHaveCount(3);
  await expect(details.getByText(title, { exact: true })).toBeVisible();
  await expect(details).toContainText('Andre arrangement');
  await expect(details).toContainText('Tredje arrangement');
  await expect(details).not.toContainText('Tidligere arrangement');
  await expect(details).not.toContainText('Fjerde arrangement');
  await expect(details).not.toContainText('HEMMELIG UTKAST I TEST');

  await calendar.locator('[data-date="2026-12-15"]').click();
  await expect(details.getByRole('listitem')).toHaveCount(1);
  await expect(details).toContainText(title);
  await expect(details).toContainText(description);
  await expect(details).toContainText(location);
  await expect(details.locator('img, script, svg, iframe')).toHaveCount(0);
  expect(await page.evaluate(() => Reflect.get(window, '__calendarXss'))).toBeUndefined();

  await calendar.locator('[data-date="2026-12-16"]').click();
  await expect(details.getByRole('listitem')).toHaveCount(1);
  await expect(details).toContainText('Andre arrangement');
  await expect(details).toContainText('17:30');
});

test('the full calendar shows event titles in their days and navigates to next year', async ({ page }) => {
  const calendar = await mountFixture(page, [
    { id: fixtureId(1), title: 'Desemberarrangement', date: '2026-12-15', published: true },
    { id: fixtureId(2), title: 'Januararrangement', date: '2027-01-08', published: true },
  ], '/events/');
  await expect(calendar.locator('[data-date="2026-12-15"]')).toContainText('Desemberarrangement');
  await calendar.getByRole('button', { name: 'Neste måned' }).click();
  await expect(calendar.locator('[data-month-label]')).toHaveText(/januar 2027/i);
  await expect(calendar.locator('[data-date="2027-01-08"]')).toContainText('Januararrangement');
  await calendar.locator('[data-date="2027-01-08"]').click();
  await expect(calendar.locator('[data-event-details]')).toContainText('Januararrangement');
  const picker = calendar.locator('[data-month-picker]');
  await expect(picker).toHaveAccessibleName('Velg måned');
  await picker.fill('2028-02');
  await expect(calendar.locator('[data-month-label]')).toHaveText(/februar 2028/i);
  await expect(calendar.locator('[data-date]')).toHaveCount(29);
  await calendar.getByRole('button', { name: 'I dag', exact: true }).click();
  await expect(calendar.locator('[data-month-label]')).toHaveText(/desember 2026/i);
  await expect(picker).toHaveValue('2026-12');
});

test('full calendar navigation stays inside the supported year range', async ({ page }) => {
  const calendar = await mountFixture(page, [], '/events/');
  const picker = calendar.locator('[data-month-picker]');
  await picker.fill('9999-12');
  await expect(calendar.getByRole('button', { name: 'Neste måned' })).toBeDisabled();
  await calendar.locator('[data-date="9999-12-31"]').focus();
  await page.keyboard.press('ArrowRight');
  await expect(calendar.locator('[data-date="9999-12-31"]')).toBeFocused();
  await picker.fill('0001-01');
  await expect(calendar.getByRole('button', { name: 'Forrige måned' })).toBeDisabled();
  await calendar.locator('[data-date="0001-01-01"]').focus();
  await page.keyboard.press('ArrowLeft');
  await expect(calendar.locator('[data-date="0001-01-01"]')).toBeFocused();
  await calendar.getByRole('button', { name: 'I dag', exact: true }).click();
  await expect(picker).toHaveValue('2026-12');
  await expect(calendar.getByRole('button', { name: 'Forrige måned' })).toBeEnabled();
  await expect(calendar.getByRole('button', { name: 'Neste måned' })).toBeEnabled();
});

for (const route of ['/', '/events/']) {
  test(`calendar controls and long event details fit the viewport on ${route}`, async ({ page }) => {
    const calendar = await mountFixture(page, [
      { id: fixtureId(1), title: 'Arrangement'.repeat(14), date: '2026-12-15',
        location: 'Sted'.repeat(30), description: 'Beskrivelse'.repeat(40), published: true },
    ], route);
    await calendar.locator('[data-date="2026-12-15"]').click();
    await expect(calendar.getByRole('button', { name: 'Forrige måned' })).toBeVisible();
    await expect(calendar.getByRole('button', { name: 'Neste måned' })).toBeVisible();
    await expect(calendar.getByRole('button', { name: 'I dag', exact: true })).toBeVisible();
    expect(await calendar.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}
