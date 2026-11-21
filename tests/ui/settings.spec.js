// Settings: managed lists and appearance (tone, accent, dark mode)
const { test, expect, openApp } = require('./fixtures');

const accent = page => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim());

test('brands with quotes are listed safely and can be removed', async ({ page, api }) => {
    await openApp(page);
    await page.click('#settingsNavBtn');
    await page.fill('#newBrandInput', `O'Brien "Puzzles" & <Co>`);
    await page.click('button:has-text("Add brand")');
    await expect(page.locator('#brandsList')).toContainText(`O'Brien "Puzzles" & <Co>`);
    await expect.poll(async () => (await api.get('/settings')).brands).toContain(`O'Brien "Puzzles" & <Co>`);

    await page.locator('#brandsList button:has-text("Remove")').click();
    await expect.poll(async () => (await api.get('/settings')).brands).toEqual([]);
});

test('an install still on the old purple theme moves to the new default', async ({ page, api }) => {
    await api.put('/theme', { primary: '#667eea', secondary: '#764ba2', tone: 'warm' });
    await openApp(page);
    expect(await accent(page)).toBe('#4e5d6c');
});

test('tone and accent are saved for every device; dark mode stays per device', async ({ page, api, browser, baseURL }) => {
    await openApp(page);
    await page.click('#settingsNavBtn');
    await page.click('.tone-option[data-tone="cool"]');
    await page.click('.swatch[title="Sage"]');
    await expect.poll(async () => await api.get('/theme')).toMatchObject({ tone: 'cool', primary: '#5e7a64' });
    await expect(page.locator('.tone-option[data-tone="cool"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#primaryColorPicker')).toHaveValue('#5e7a64');

    await page.click('#darkModeSettingsBtn');
    await expect(page.locator('#darkModeSettingsBtn')).toHaveText('Turn off dark mode');
    await page.reload();
    expect(await page.evaluate(() => document.documentElement.classList.contains('dark-mode'))).toBe(true);

    // A second device picks up tone and accent, but not dark mode
    const other = await browser.newContext({ baseURL });
    const phone = await other.newPage();
    await openApp(phone);
    expect(await phone.evaluate(() => document.documentElement.dataset.tone)).toBe('cool');
    expect(await accent(phone)).toBe('#5e7a64');
    expect(await phone.evaluate(() => document.documentElement.classList.contains('dark-mode'))).toBe(false);
    // Browser bar color matches the app bar
    const [meta, bar] = await phone.evaluate(() => [
        document.querySelector('meta[name=theme-color]').content,
        getComputedStyle(document.querySelector('.app-bar')).backgroundColor
    ]);
    const hex = bar.replace(/rgb\((\d+), (\d+), (\d+)\)/, (_, r, g, b) => '#' + [r, g, b].map(x => (+x).toString(16).padStart(2, '0')).join(''));
    expect(meta).toBe(hex);
    await other.close();
});

test('every page and dialog opens without errors in dark mode', async ({ page, api }) => {
    await api.addPuzzle({ name: 'One', pieces: 100 });
    await openApp(page);
    await page.evaluate(() => toggleDarkMode());
    for (const fn of ['showDashboard', 'showWishlist', 'showSettings']) await page.evaluate(f => window[f](), fn);
    await page.evaluate(() => {
        showAddPuzzleModal(); closeModal('puzzleModal');
        showPickModal(); pickRandomPuzzle(); closeModal('pickModal');
        showAbout(); closeModal('aboutModal');
        showAddWishlistModal(); closeModal('wishlistModal');
    });
});
