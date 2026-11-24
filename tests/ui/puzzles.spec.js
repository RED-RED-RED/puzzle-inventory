// Adding, editing and viewing puzzles; completion logs; quality score
const { test, expect, openApp, todayIn } = require('./fixtures');

test('add a puzzle with a new brand and an untimed completion', async ({ page, api }) => {
    await openApp(page);
    await page.getByRole('button', { name: 'Add puzzle' }).first().click();
    await page.fill('#puzzleName', 'Harbor Lights');
    await page.fill('#puzzlePieces', '1000');
    await page.selectOption('#puzzleBrand', '__new__');
    await page.fill('#puzzleBrandCustom', `Bob's "Best"`);
    await page.check('#addInitialLog');
    await expect(page.locator('#initialLogDate')).toHaveValue(await todayIn(page));
    await page.click('#savePuzzleBtn');

    await expect(page.locator('#puzzleModal')).not.toHaveClass(/active/);
    await expect(page.locator('#puzzleTitle')).toHaveText('Harbor Lights');
    const [saved] = await api.get('/puzzles');
    expect(saved.brand).toBe(`Bob's "Best"`);
    expect(saved.logs).toHaveLength(1);
    expect((await api.get('/settings')).brands).toContain(`Bob's "Best"`);

    // Shown as today (not yesterday) and as not timed
    await page.click('.tab:has-text("Completions")');
    const expected = await page.evaluate(() => new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }));
    await expect(page.locator('#logList')).toContainText(expected);
    await expect(page.locator('#logList')).toContainText('Not timed');
});

test('a missing completion date stops the save without creating anything', async ({ page, api }) => {
    await openApp(page);
    await page.evaluate(() => showAddPuzzleModal());
    await page.fill('#puzzleName', 'Should Not Exist');
    await page.fill('#puzzlePieces', '100');
    await page.check('#addInitialLog');
    await page.fill('#initialLogDate', '');
    await page.click('#savePuzzleBtn');
    await expect(page.locator('#puzzleModal')).toHaveClass(/active/);
    expect(await api.get('/puzzles')).toHaveLength(0);
});

test('edit keeps notes saved from the Details tab and hides the first-completion section', async ({ page, api }) => {
    const p = await api.addPuzzle({ name: 'Notes Test', pieces: 500 });
    await openApp(page);
    await page.evaluate(id => showPuzzleDetail(id), p.id);
    await page.click('.tab:has-text("Details")');
    await page.fill('#puzzleNotes', 'Two edge pieces bent');
    await page.click('button:has-text("Save notes")');
    await expect.poll(async () => (await api.get(`/puzzles/${p.id}`)).notes).toBe('Two edge pieces bent');

    await page.click('button:has-text("Edit")');
    await expect(page.locator('#puzzleModalNotes')).toHaveValue('Two edge pieces bent');
    await expect(page.locator('#addInitialLog')).toBeHidden();
    await page.click('#savePuzzleBtn');
    await expect(page.locator('#puzzleModal')).not.toHaveClass(/active/);
    expect((await api.get(`/puzzles/${p.id}`)).notes).toBe('Two edge pieces bent');
    expect(await api.get('/puzzles')).toHaveLength(1);
});

test('newer fields save and show on the overview', async ({ page, api }) => {
    await openApp(page);
    await page.evaluate(() => showAddPuzzleModal());
    await page.fill('#puzzleName', 'Fields');
    await page.fill('#puzzlePieces', '1500');
    await page.fill('#puzzleArtist', 'A. Painter');
    await page.fill('#puzzleSize', '33 x 23 in');
    await page.selectOption('#puzzleCutStyle', 'Ribbon / grid cut');
    await expect(page.locator('#puzzleModalMissingCount')).toBeHidden();
    await page.check('#puzzleModalMissingPieces');
    await page.fill('#puzzleModalMissingCount', '3');
    await page.click('#savePuzzleBtn');

    const overview = page.locator('#puzzleOverview');
    for (const text of ['1,500', 'A. Painter', '33 x 23 in', 'Ribbon / grid cut', '3 pieces missing']) {
        await expect(overview).toContainText(text);
    }
    await page.click('button:has-text("Edit")');
    await expect(page.locator('#puzzleArtist')).toHaveValue('A. Painter');
    await expect(page.locator('#puzzleModalMissingCount')).toHaveValue('3');
});

test('a stored value missing from a dropdown still shows', async ({ page, api }) => {
    const p = await api.addPuzzle({ name: 'Odd Dust', pieces: 500, puzzleDust: 'Low' });
    await openApp(page);
    await page.evaluate(id => showPuzzleDetail(id), p.id);
    await page.click('.tab:has-text("Details")');
    await expect(page.locator('#puzzleDust')).toHaveValue('Low');
});

test('completion times display exactly and can be edited right after adding', async ({ page, api }) => {
    const p = await api.addPuzzle({ name: 'Times', pieces: 500 });
    for (const [h, m] of [[1, 1], [1, 4], [2, 7]]) await api.addLog(p.id, { date: '2026-11-20', time: h + m / 60, rating: 4 });
    await openApp(page);

    // Every duration under 4 hours survives the round trip to hours and back
    const wrong = await page.evaluate(() => {
        let bad = 0;
        for (let h = 0; h < 4; h++) for (let m = 0; m < 60; m++) for (let s = 0; s < 60; s++) {
            const r = hoursToTime(timeToHours(h, m, s));
            if (r.hours !== h || r.minutes !== m || r.seconds !== s) bad++;
        }
        return bad;
    });
    expect(wrong).toBe(0);

    await page.evaluate(id => showPuzzleDetail(id), p.id);
    await page.click('.tab:has-text("Completions")');
    const list = page.locator('#logList');
    await expect(list).toContainText('1h 1m');
    await expect(list).toContainText('2h 7m');
    await expect(list).not.toContainText('60s');
    await expect(page.locator('.log-stars')).toHaveCount(3);

    // Add one in the UI and edit it straight away
    await page.click('button:has-text("Log a completion")');
    await page.fill('#logHours', '3');
    await page.click('#logModal button[type=submit]');
    await page.locator('#logList button:has-text("Edit")').first().click();
    await expect(page.locator('#logModal')).toHaveClass(/active/);
    await expect(page.locator('#logModalTitle')).toHaveText('Edit completion');
});

test('quality choices from one puzzle do not carry over to the next', async ({ page, api }) => {
    const a = await api.addPuzzle({ name: 'First', pieces: 500 });
    const b = await api.addPuzzle({ name: 'Second', pieces: 500 });
    await openApp(page);
    await page.evaluate(id => showPuzzleDetail(id), a.id);
    await page.click('.tab:has-text("Details")');
    await page.check('input[name="pieceFit"][value="5"]');
    await expect.poll(async () => (await api.get(`/puzzles/${a.id}`)).quality?.pieceFit).toBe(5);

    await page.evaluate(id => showPuzzleDetail(id), b.id);
    expect(await page.locator('#qualitySection input[type=radio]:checked').count()).toBe(0);
    expect((await api.get(`/puzzles/${b.id}`)).quality).toBeUndefined();
});

test('puzzle page leads with the cover photo, or offers to add one', async ({ page, api }) => {
    const p = await api.addPuzzle({ name: 'No Photo', pieces: 300, notes: 'Line one\nLine two' });
    await openApp(page);
    await page.evaluate(id => showPuzzleDetail(id), p.id);
    await expect(page.locator('#puzzleOverview')).toContainText('No photos yet');
    const chooser = page.waitForEvent('filechooser');
    await page.click('#puzzleOverview label[for=imageInput]');
    await chooser;
    const notesHeight = await page.locator('.overview-notes').evaluate(e => e.getBoundingClientRect().height);
    expect(notesHeight).toBeGreaterThan(30); // line breaks kept
});

test('adding, changing and deleting photos updates the puzzle page', async ({ page, api }) => {
    const { makeJpeg } = require('../helpers');
    const p = await api.addPuzzle({ name: 'Photo Page', pieces: 500 });
    await openApp(page);
    await page.evaluate(id => showPuzzleDetail(id), p.id);
    await expect(page.locator('#puzzleOverview')).toContainText('No photos yet');

    // Add photos from the overview's own button
    const chooser = page.waitForEvent('filechooser');
    await page.click('#puzzleOverview label[for=imageInput]');
    await (await chooser).setFiles([
        { name: 'a.jpg', mimeType: 'image/jpeg', buffer: await makeJpeg(300, 200) },
        { name: 'b.jpg', mimeType: 'image/jpeg', buffer: await makeJpeg(200, 300) }
    ]);
    const cover = page.locator('#puzzleOverview img.overview-photo');
    await expect(cover).toHaveCount(1);
    await expect(page.locator('#puzzleOverview')).not.toContainText('No photos yet');
    const first = await cover.getAttribute('src');

    await page.click('.tab:has-text("Photos")');
    await page.locator('.image-item').nth(1).locator('button[title="Use as cover"]').click();
    await expect(cover).not.toHaveAttribute('src', first);
    await expect(page.locator('#puzzleList .puzzle-item.active img')).toHaveAttribute('src', await cover.getAttribute('src'));

    await page.locator('.image-item').nth(1).locator('.delete-image').click();
    await expect(page.locator('.image-item')).toHaveCount(1);
    await expect(cover).toHaveAttribute('src', first);

    // Rotating a photo replaces the cover with the rotated copy
    await page.locator('.image-item').first().locator('button[title="Rotate"]').click();
    await page.evaluate(() => rotateImage(90));
    await page.click('#imageEditor button:has-text("Save")');
    await expect(cover).not.toHaveAttribute('src', first);
    const size = await cover.evaluate(img => img.complete ? [img.naturalWidth, img.naturalHeight] : null);
    expect(size === null || size[0] < size[1]).toBe(true);
});

test('a server problem says so instead of showing an empty collection', async ({ page }) => {
    await page.route('**/api/puzzles', route => route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"Failed to retrieve puzzles"}' }));
    await openApp(page);
    await expect(page.locator('#recentPuzzleGrid')).toContainText("Couldn't load your puzzles");
    await expect(page.locator('#puzzleList')).toContainText("Couldn't load your puzzles");
    await expect(page.locator('#recentPuzzleGrid')).not.toContainText('No puzzles yet');
});
