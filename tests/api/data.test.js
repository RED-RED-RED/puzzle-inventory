// Settings, wishlist, theme, restore, health and corrupt-file protection
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { startApp, client } = require('../helpers');

describe('settings lists', () => {
    let app, api;
    before(async () => { app = await startApp(); api = client(app.base); });
    after(() => app.stop());

    it('tidies a full settings save (trim, dedupe, sort)', async () => {
        await api.put('/settings', { brands: [' B ', 'A', 'A', ''], themes: ['x'] });
        assert.deepEqual((await api.get('/settings')).data, { brands: ['A', 'B'], themes: ['x'], series: [] });
    });

    it('keeps every brand added from two devices at once', async () => {
        await Promise.all(Array.from({ length: 25 }, (_, i) => api.post('/settings/brands', { value: `Brand ${i}` })));
        assert.equal((await api.get('/settings')).data.brands.filter(b => b.startsWith('Brand ')).length, 25);
    });

    it('removes one item and rejects unknown lists', async () => {
        await api.del('/settings/brands', { value: 'Brand 3' });
        assert.ok(!(await api.get('/settings')).data.brands.includes('Brand 3'));
        assert.equal((await api.post('/settings/colors', { value: 'x' })).status, 404);
    });
});

describe('wishlist', () => {
    let app, api;
    before(async () => { app = await startApp(); api = client(app.base); });
    after(() => app.stop());

    it('adds, edits and removes items; priority is limited to high, medium or low', async () => {
        const { data: item } = await api.post('/wishlist', { name: 'Covered Bridge', priority: '<b>' });
        assert.equal(item.priority, 'medium');
        await api.put(`/wishlist/${item.id}`, { name: 'Covered Bridge', priority: 'high', price: '$22' });
        assert.equal((await api.get('/wishlist')).data[0].priority, 'high');
        assert.equal((await api.post('/wishlist', { name: '' })).status, 400);
        await api.del(`/wishlist/${item.id}`);
        assert.equal((await api.get('/wishlist')).data.length, 0);
    });
});

describe('appearance', () => {
    let app, api;
    before(async () => { app = await startApp(); api = client(app.base); });
    after(() => app.stop());

    it('defaults to warm gray with the slate accent', async () => {
        assert.deepEqual((await api.get('/theme')).data, { primary: '#4e5d6c', secondary: '#4e5d6c', tone: 'warm' });
    });

    it('saves tone and accent, and rejects bad values', async () => {
        await api.put('/theme', { primary: '#5e7a64', tone: 'cool' });
        assert.equal((await api.get('/theme')).data.tone, 'cool');
        assert.equal((await api.put('/theme', { primary: 'red' })).status, 400);
        assert.equal((await api.put('/theme', { primary: '#123456', tone: 'pink' })).status, 400);
    });
});

describe('restore from backup', () => {
    let app, api;
    before(async () => { app = await startApp(); api = client(app.base); });
    after(() => app.stop());

    it('keeps logs, custom fields, quality and photo references', async () => {
        const { data: p } = await api.post('/puzzles', { name: 'Keeper', pieces: 1000 });
        await api.post(`/puzzles/${p.id}/logs`, { date: '2026-11-01', time: 3.5, rating: 4 });
        await api.post(`/puzzles/${p.id}/custom-fields`, { name: 'Box', value: 'Dented' });
        await api.put(`/puzzles/${p.id}/quality`, { qualityScore: 88 });
        const backup = {
            puzzles: (await api.get('/puzzles')).data,
            settings: (await api.get('/settings')).data,
            wishlist: (await api.get('/wishlist')).data,
            theme: (await api.get('/theme')).data
        };
        await api.del(`/puzzles/${p.id}`);
        const res = await api.post('/restore', backup);
        assert.equal(res.status, 200);
        assert.match(res.data.previousDataSavedTo, /^data\/pre-restore-/);
        const restored = (await api.get(`/puzzles/${p.id}`)).data;
        assert.equal(restored.logs.length, 1);
        assert.equal(restored.customFields[0].name, 'Box');
        assert.equal(restored.quality.qualityScore, 88);
        assert.ok(fs.existsSync(path.join(app.root, res.data.previousDataSavedTo)));
    });

    it('reads older backups and drops unsafe photo paths', async () => {
        const res = await api.post('/restore', {
            puzzles: [{
                id: 5, name: 'Old', pieces: 300,
                logs: [{ id: 1, date: '2026-01-01', time: 1 }],
                customFields: [{ id: 2, label: 'L', value: 'V' }],
                images: ['../../etc/passwd', '/uploads/puzzles/a.jpg']
            }]
        });
        assert.equal(res.data.puzzles, 1);
        const p = (await api.get('/puzzles/5')).data;
        assert.deepEqual(p.images, ['/uploads/puzzles/a.jpg']);
        assert.equal(p.customFields[0].name, 'L', 'old "label" fields become "name"');
    });

    it('keeps the current wishlist when the backup has none', async () => {
        await api.post('/wishlist', { name: 'Keep me' });
        const res = await api.post('/restore', { puzzles: [{ name: 'Only puzzles', pieces: 100 }] });
        assert.equal(res.data.wishlist, null);
        assert.equal((await api.get('/wishlist')).data.length, 1);
    });

    it('rejects files that are not backups', async () => {
        assert.equal((await api.post('/restore', { foo: 1 })).status, 400);
    });
});

describe('health and corrupt data', () => {
    let app, api;
    before(async () => { app = await startApp(); api = client(app.base); });
    after(() => app.stop());

    it('reports healthy with the app version', async () => {
        const { status, data } = await api.get('/health');
        assert.equal(status, 200);
        assert.equal(data.version, require('../../package.json').version);
    });

    it('never saves over a corrupt data file, and health reports it', async () => {
        const file = path.join(app.root, 'data', 'puzzles.json');
        fs.writeFileSync(file, '{broken');
        assert.equal((await api.post('/puzzles', { name: 'New', pieces: 10 })).status, 500);
        assert.equal(fs.readFileSync(file, 'utf8'), '{broken', 'file left untouched');
        const health = await api.get('/health');
        assert.equal(health.status, 503);
        assert.equal(health.data.status, 'error');
    });

    it('refuses to start on a corrupt data file', () => {
        const run = spawnSync(process.execPath, [path.join(__dirname, '..', '..', 'server.js')], {
            env: { ...process.env, DATA_DIR: path.join(app.root, 'data'), UPLOADS_DIR: path.join(app.root, 'uploads'), UPLOAD_TMP_DIR: path.join(app.root, 'tmp2'), PORT: '0' },
            encoding: 'utf8',
            timeout: 10000
        });
        assert.equal(run.status, 1);
        assert.match(run.stderr, /invalid JSON/);
    });
});
