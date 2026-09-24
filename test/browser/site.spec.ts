import { test, expect } from '@playwright/test';

test('homepage preserves branding, has working navigation and fits the viewport', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Sammen om skiskyttergleden.' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Bli medlem/ })).toHaveAttribute('href', '/member-application/');
  await expect(page.getByRole('link', { name: 'Admin Login' })).toHaveAttribute('href', /^https:\/\//);
  if (testInfo.project.name === 'mobile') {
    const menu = page.getByRole('button', { name: 'Åpne meny' });
    await expect(menu).toBeVisible();
    await menu.click();
    await expect(page.getByRole('button', { name: 'Lukk meny' })).toHaveAttribute('aria-expanded', 'true');
  }
  await page.getByRole('navigation').getByRole('link', { name: 'Treninger' }).click();
  await expect(page).toHaveURL(/\/trainings\/$/);
  await expect(page.getByRole('heading', { name: 'Treninger', exact: true })).toBeVisible();
  await expect(page.getByText('Under utvikling')).toBeVisible();
  if (testInfo.project.name === 'mobile') await page.getByRole('button', { name: 'Åpne meny' }).click();
  await expect(page.getByRole('navigation').getByRole('link', { name: 'Treninger' })).toHaveAttribute('aria-current', 'page');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('news listing, local links and all images work', async ({ page, request }) => {
  await page.goto('/news/');
  await expect(page.getByRole('heading', { name: 'Nyheter', exact: true })).toBeVisible();
  const articles = page.locator('main article');
  if (await articles.count() === 0) await expect(page.locator('main')).toContainText(/ingen|kommer|publisert/i);
  await page.goto('/');
  const assets = await page.locator('img').evaluateAll(images => images.map(image => image.getAttribute('src')!));
  for (const src of new Set(assets)) expect((await request.get(src)).status(), src).toBe(200);
  const paths = await page.locator('a[href^="/"]').evaluateAll(anchors => anchors.map(anchor => anchor.getAttribute('href')!));
  for (const href of new Set(paths)) expect((await request.get(href)).status(), href).toBe(200);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('legacy redirects reach clean pages and hosted CMS', async ({ page }) => {
  for (const name of ['about', 'trainings', 'events', 'results', 'contact', 'member-application']) {
    await page.goto(`/${name}.html`);
    await expect(page).toHaveURL(new RegExp(`/${name}/$`));
  }
  await page.route('https://app.pagescms.org/**', route => route.fulfill({ contentType: 'text/html', body: '<h1>Hosted CMS fixture</h1>' }));
  await page.goto('/admin/login/');
  await expect(page).toHaveURL(/^https:\/\/app.pagescms.org\//);
  await expect(page.getByRole('heading')).toHaveText('Hosted CMS fixture');
});
