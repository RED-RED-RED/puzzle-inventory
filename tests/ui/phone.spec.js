// Phone layout, home-screen app files and the offline page
const { devices } = require('@playwright/test');
const { test, expect, openApp } = require('./fixtures');

// iPhone screen size and touch, run in Chromium
const { defaultBrowserType, ...iPhone } = devices['iPhone 13'];

test.describe('on a phone', () => {
    test.use(iPhone);

    test('content comes first and the puzzle list folds away', async ({ page, api }) => {
        for (let i = 0; i < 25; i++) await api.addPuzzle({ name: `Phone ${i}`, pieces: 500 + i });
        await openApp(page);

        const layout = await page.evaluate(() => ({
            pageWidth: document.documentElement.scrollWidth,
            screenWidth: innerWidth,
            contentTop: document.querySelector('.content-area').getBoundingClientRect().top,
            barHeight: document.querySelector('.app-bar').offsetHeight,
            fieldFont: getComputedStyle(document.getElementById('sortSelect')).fontSize
        }));
        expect(layout.pageWidth).toBeLessThanOrEqual(layout.screenWidth); // no sideways scrolling
        expect(layout.contentTop).toBeLessThan(330);
        expect(layout.barHeight).toBeLessThan(70);
        expect(layout.fieldFont).toBe('16px'); // stops iPhone zooming into fields

        await expect(page.locator('#puzzleList')).toBeHidden();
        await expect(page.locator('#mobileBrowseToggle')).toContainText('(25)');
        await page.tap('#mobileBrowseToggle');
        await expect(page.locator('#puzzleList')).toBeVisible();
        await page.fill('#searchBox', 'Phone 2');
        await expect(page.locator('#mobileBrowseToggle')).toContainText('of 25');

        await page.locator('#puzzleList .puzzle-item').nth(3).tap();
        await expect(page.locator('#puzzleList')).toBeHidden();
        await expect.poll(() => page.locator('#puzzleTitle').evaluate(e => e.getBoundingClientRect().top)).toBeGreaterThan(50);
        const titleTop = await page.locator('#puzzleTitle').evaluate(e => e.getBoundingClientRect().top);
        expect(titleTop).toBeLessThan(300); // on screen and not under the top bar
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
});

test('home-screen app files are served correctly', async ({ request }) => {
    const manifest = await request.get('/manifest.webmanifest');
    expect(manifest.headers()['content-type']).toMatch(/^application\/manifest\+json/);
    for (const icon of (await manifest.json()).icons) {
        expect((await request.get(icon.src)).status(), icon.src).toBe(200);
    }
    expect((await request.get('/sw.js')).headers()['cache-control']).toBe('no-cache');
    expect((await request.get('/icons/apple-touch-icon.png')).status()).toBe(200);
    for (const font of ['nunito-sans-latin-400-normal', 'nunito-sans-latin-700-normal', 'young-serif-latin-400-normal']) {
        expect((await request.get(`/fonts/${font}.woff2`)).status(), font).toBe(200);
    }
});

test('shows a friendly page when the server cannot be reached', async ({ page, context }) => {
    await openApp(page);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    await context.setOffline(true);
    await page.reload().catch(() => {});
    await expect(page.locator('body')).toContainText("Can't reach the puzzle server");
    await context.setOffline(false);
});
