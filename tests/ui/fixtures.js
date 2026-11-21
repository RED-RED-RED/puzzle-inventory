// Shared setup for the browser tests: every test starts with empty data
const base = require('@playwright/test');

const DEFAULT_THEME = { primary: '#4e5d6c', secondary: '#4e5d6c', tone: 'warm' };

const test = base.test.extend({
    // Wipes all data before each test (uses the app's own restore endpoint)
    api: [async ({ request }, use) => {
        const reset = await request.post('/api/restore', {
            data: { puzzles: [], wishlist: [], settings: { brands: [], themes: [], series: [] }, theme: DEFAULT_THEME }
        });
        if (!reset.ok()) throw new Error('Could not reset test data');

        const api = {
            get: async url => (await request.get('/api' + url)).json(),
            post: async (url, data) => (await request.post('/api' + url, { data })).json(),
            put: async (url, data) => (await request.put('/api' + url, { data })).json(),
            addPuzzle: data => api.post('/puzzles', data),
            addLog: (id, data) => api.post(`/puzzles/${id}/logs`, data)
        };
        await use(api);
    }, { auto: true }],

    // Fails the test if the page throws an error
    page: async ({ page }, use) => {
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        page.on('dialog', d => d.accept());
        await use(page);
        base.expect(errors, 'page errors').toEqual([]);
    }
});

// Opens the app and waits for the puzzle list to load
async function openApp(page) {
    await page.goto('/');
    await page.waitForFunction(() => typeof puzzles !== 'undefined' && document.getElementById('listCount') !== null);
    await page.waitForLoadState('networkidle');
}

// Today's date in the browser's time zone, as YYYY-MM-DD
const todayIn = page => page.evaluate(() => todayLocal());

module.exports = { test, expect: base.expect, openApp, todayIn };
