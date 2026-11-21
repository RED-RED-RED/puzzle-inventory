// Puzzle list (search, sort, filter), wishlist, Pick one for me, CSV export
const fs = require('fs');
const { test, expect, openApp } = require('./fixtures');

async function seed(api) {
    const ids = [];
    for (const p of [
        { name: 'Alpha Lighthouse', pieces: 1000, brand: 'Ravensburger', rating: 4 },
        { name: 'Beta Barn', pieces: 300, brand: 'Buffalo', rating: 2 },
        { name: 'Gamma Garden', pieces: 500, brand: 'Ravensburger', donated: true },
        { name: 'Delta Diner', pieces: 750, brand: 'Cobble Hill', missingPieces: true, artist: 'A. Painter', series: 'Diners' },
        { name: '=SUM(A1) "Quoted, Name"', pieces: 200, brand: 'Buffalo', notes: 'line1\nline2' }
    ]) ids.push((await api.addPuzzle(p)).id);
    await api.addLog(ids[0], { date: '2026-11-01', time: 4 });
    await api.addLog(ids[1], { date: '2026-11-10', time: 1.5 });
    return ids;
}

const listNames = page => page.locator('#puzzleList .puzzle-item h3').allTextContents();

test('sort, filter and search the puzzle list', async ({ page, api }) => {
    await seed(api);
    await openApp(page);
    await expect(page.locator('#listCount')).toHaveText('5 puzzles');

    await page.selectOption('#sortSelect', 'piecesAsc');
    expect((await listNames(page))[0]).toMatch(/^=SUM/);
    await page.selectOption('#sortSelect', 'name');
    expect((await listNames(page))[1]).toBe('Alpha Lighthouse');
    await page.selectOption('#sortSelect', 'lastDone');
    expect((await listNames(page))[0]).toBe('Beta Barn');

    await page.selectOption('#filterSelect', 'notDone');
    await expect(page.locator('#listCount')).toHaveText('Showing 3 of 5');
    await page.selectOption('#filterSelect', 'donated');
    expect(await listNames(page)).toEqual(['Gamma Garden']);
    await page.selectOption('#filterSelect', 'all');

    const brands = await page.locator('#brandFilterSelect option').evaluateAll(o => o.map(x => x.value));
    expect(brands).toEqual(['', 'Buffalo', 'Cobble Hill', 'Ravensburger']);
    await page.selectOption('#brandFilterSelect', 'Ravensburger');
    expect(await listNames(page)).toHaveLength(2);

    // Choices are remembered on this device
    await page.reload();
    await expect(page.locator('#brandFilterSelect')).toHaveValue('Ravensburger');
    await expect(page.locator('#sortSelect')).toHaveValue('lastDone');
    await page.selectOption('#brandFilterSelect', '');

    await page.fill('#searchBox', 'painter');
    expect(await listNames(page)).toEqual(['Delta Diner']);
    await page.fill('#searchBox', 'diners');
    expect(await listNames(page)).toEqual(['Delta Diner']);
});

test('wishlist "Got it" moves an item into the collection', async ({ page, api }) => {
    await api.post('/wishlist', { name: 'Zeta Zoo', brand: 'Eurographics', pieces: '1000', theme: 'Animals', whereToBuy: 'Target', notes: 'Birthday idea', price: '22.99', priority: 'high' });
    await api.post('/wishlist', { name: 'Vague Price', price: 'about 20 at Target' });
    await openApp(page);
    await page.click('#wishlistNavBtn');

    const grid = page.locator('#wishlistGrid');
    await expect(grid).toContainText('$22.99');
    await expect(grid).toContainText('about 20 at Target');
    await expect(grid).not.toContainText('NaN');

    await page.locator('.wishlist-card', { hasText: 'Zeta Zoo' }).getByRole('button', { name: 'Got it' }).click();
    await expect(page.locator('#puzzleModalTitle')).toHaveText('Add to collection');
    await expect(page.locator('#puzzleName')).toHaveValue('Zeta Zoo');
    await expect(page.locator('#puzzlePieces')).toHaveValue('1000');
    await expect(page.locator('#puzzleBrandCustom')).toHaveValue('Eurographics');
    await expect(page.locator('#puzzlePurchasedFrom')).toHaveValue('Target');
    await page.click('#savePuzzleBtn');

    await expect(page.locator('#puzzleTitle')).toHaveText('Zeta Zoo');
    const [zoo] = await api.get('/puzzles');
    expect(zoo).toMatchObject({ brand: 'Eurographics', theme: 'Animals', notes: 'Birthday idea' });
    expect((await api.get('/wishlist')).map(w => w.name)).toEqual(['Vague Price']);
    expect((await api.get('/settings')).brands).toContain('Eurographics');
});

test('Pick one for me respects the choices and never repeats twice in a row', async ({ page, api }) => {
    await seed(api);
    await openApp(page);
    await page.click('button:has-text("Pick one for me")');

    // 400 to 800 pieces, not done, not donated, no missing pieces: nothing qualifies
    await page.fill('#pickMin', '400');
    await page.fill('#pickMax', '800');
    await page.click('button:has-text("Pick a puzzle")');
    await expect(page.locator('#pickResult')).toContainText('No puzzles match');

    await page.uncheck('#pickSkipMissing');
    await page.click('button:has-text("Pick a puzzle")');
    await expect(page.locator('#pickResult h3')).toHaveText('Delta Diner');

    await page.fill('#pickMin', '');
    await page.fill('#pickMax', '');
    let previous = null;
    const seen = new Set();
    for (let i = 0; i < 15; i++) {
        await page.click('#pickModal button:has-text("Pick a puzzle")');
        const name = await page.locator('#pickResult h3').textContent();
        expect(name).not.toBe(previous);
        seen.add(name);
        previous = name;
    }
    expect(seen.size).toBeGreaterThan(1);

    await page.click('#pickResult button:has-text("Open puzzle")');
    await expect(page.locator('#puzzleTitle')).toHaveText(previous);
});

test('CSV exports open cleanly in spreadsheets', async ({ page, api }) => {
    await seed(api);
    await api.post('/wishlist', { name: 'Wish', priority: 'low' });
    await openApp(page);
    await page.click('#settingsNavBtn');

    const [download] = await Promise.all([page.waitForEvent('download'), page.click('button:has-text("Export puzzles (CSV)")')]);
    expect(download.suggestedFilename()).toMatch(/^puzzles-\d{4}-\d{2}-\d{2}\.csv$/);
    const csv = fs.readFileSync(await download.path(), 'utf8');
    expect(csv.charCodeAt(0)).toBe(0xfeff); // so Excel reads accents correctly
    expect(csv.slice(1)).toMatch(/^Name,Brand,Pieces/);
    expect(csv).toContain(`"'=SUM(A1) ""Quoted, Name"""`); // quoted, and can't run as a formula
    expect(csv).toContain('"line1\nline2"');
    expect(csv.trim().split('\r\n')).toHaveLength(6);
    expect(csv.split('\r\n').find(l => l.startsWith('Alpha'))).toContain(',1,2026-11-01,4h,4h,');

    const [wish] = await Promise.all([page.waitForEvent('download'), page.click('button:has-text("Export wishlist (CSV)")')]);
    expect(fs.readFileSync(await wish.path(), 'utf8')).toContain('Name,Brand,Pieces,Theme,Priority');

    const [backup] = await Promise.all([page.waitForEvent('download'), page.click('button:has-text("Download backup")')]);
    expect(JSON.parse(fs.readFileSync(await backup.path(), 'utf8')).puzzles).toHaveLength(5);
});
