// Puzzles, completion logs, custom fields and data safety
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startApp, client } = require('../helpers');

describe('puzzles', () => {
    let app, api;
    before(async () => { app = await startApp(); api = client(app.base); });
    after(() => app.stop());

    it('creates a puzzle, cleaning up the input', async () => {
        const res = await api.post('/puzzles', { name: '  Harbor Lights  ', pieces: '1000', rating: 9, evil: 'x' });
        assert.equal(res.status, 200);
        assert.equal(res.data.name, 'Harbor Lights');
        assert.equal(res.data.pieces, 1000);
        assert.equal(res.data.rating, 0, 'out-of-range rating falls back to 0');
        assert.equal(res.data.evil, undefined, 'unknown fields are dropped');
        assert.deepEqual(res.data.images, []);
        assert.deepEqual(res.data.logs, []);
    });

    it('rejects a missing name or bad piece count', async () => {
        assert.equal((await api.post('/puzzles', { name: '', pieces: 100 })).status, 400);
        assert.equal((await api.post('/puzzles', { name: 'X', pieces: 0 })).status, 400);
        assert.equal((await api.post('/puzzles', { name: 'X', pieces: 1.5 })).status, 400);
    });

    it('stores the newer fields', async () => {
        const { data } = await api.post('/puzzles', {
            name: 'Fields', pieces: 500, artist: 'A. Painter', size: '27 x 20 in', cutStyle: 'Random cut',
            missingPieces: true, missingPieceCount: 3, series: 'Lighthouses'
        });
        assert.equal(data.artist, 'A. Painter');
        assert.equal(data.size, '27 x 20 in');
        assert.equal(data.cutStyle, 'Random cut');
        assert.equal(data.missingPieceCount, 3);
        assert.equal(data.series, 'Lighthouses');
    });

    it('updates only the fields sent', async () => {
        const { data: p } = await api.post('/puzzles', { name: 'Partial', pieces: 300, notes: 'keep me' });
        await api.put(`/puzzles/${p.id}`, { brand: 'Ravensburger' });
        const { data } = await api.get(`/puzzles/${p.id}`);
        assert.equal(data.notes, 'keep me');
        assert.equal(data.brand, 'Ravensburger');
        assert.equal((await api.put(`/puzzles/${p.id}`, { name: '' })).status, 400);
    });

    it('single-field updates work, and unticking missing pieces clears the count', async () => {
        const { data: p } = await api.post('/puzzles', { name: 'Flags', pieces: 300 });
        await api.put(`/puzzles/${p.id}/notes`, { notes: 'line1\nline2' });
        await api.put(`/puzzles/${p.id}/donated`, { donated: true });
        await api.put(`/puzzles/${p.id}/missing-pieces`, { missingPieces: true, missingPieceCount: 2 });
        let { data } = await api.get(`/puzzles/${p.id}`);
        assert.equal(data.notes, 'line1\nline2');
        assert.equal(data.donated, true);
        assert.equal(data.missingPieceCount, 2);
        await api.put(`/puzzles/${p.id}/missing-pieces`, { missingPieces: false });
        ({ data } = await api.get(`/puzzles/${p.id}`));
        assert.equal(data.missingPieces, false);
        assert.equal(data.missingPieceCount, 0);
    });

    it('keeps only valid quality ratings', async () => {
        const { data: p } = await api.post('/puzzles', { name: 'Quality', pieces: 500 });
        const res = await api.put(`/puzzles/${p.id}/quality`, {
            pieceFit: 5, cutQuality: '4', thickness: 9, qualityScore: '<img src=x onerror=alert(1)>', extra: 'x'
        });
        assert.equal(res.status, 200);
        const { quality } = (await api.get(`/puzzles/${p.id}`)).data;
        assert.equal(quality.pieceFit, 5);
        assert.equal(quality.cutQuality, 4);
        assert.equal(quality.thickness, 0, 'out of range becomes not rated');
        assert.equal(quality.qualityScore, 0, 'a non-number score is not stored');
        assert.equal(quality.extra, undefined);
        assert.equal((await api.put(`/puzzles/${p.id}/quality`, [1, 2])).status, 400);
    });

    it('returns 404 for unknown puzzles and API paths', async () => {
        assert.equal((await api.get('/puzzles/123')).status, 404);
        assert.equal((await api.get('/nope')).status, 404);
    });

    it('rejects a body that is not valid JSON with a readable message', async () => {
        const res = await api.post('/puzzles', '{bad');
        assert.equal(res.status, 400);
        assert.equal(res.data.error, 'Request body is not valid JSON');
    });
});

describe('completion logs', () => {
    let app, api, puzzle;
    before(async () => {
        app = await startApp(); api = client(app.base);
        puzzle = (await api.post('/puzzles', { name: 'Logs', pieces: 1000 })).data;
    });
    after(() => app.stop());

    it('adds, edits and deletes a log; the server picks the id', async () => {
        const { data: log } = await api.post(`/puzzles/${puzzle.id}/logs`, { date: '2026-11-15', time: 2, rating: 5, id: 1 });
        assert.notEqual(log.id, 1);
        const edited = await api.put(`/puzzles/${puzzle.id}/logs/${log.id}`, { date: '2026-11-14', time: 1.5, rating: 3, id: 5 });
        assert.equal(edited.data.id, log.id);
        assert.equal(edited.data.time, 1.5);
        await api.del(`/puzzles/${puzzle.id}/logs/${log.id}`);
        assert.equal((await api.get(`/puzzles/${puzzle.id}`)).data.logs.length, 0);
    });

    it('accepts an untimed log but rejects bad dates and negative times', async () => {
        assert.equal((await api.post(`/puzzles/${puzzle.id}/logs`, { date: '2026-11-15' })).data.time, 0);
        assert.equal((await api.post(`/puzzles/${puzzle.id}/logs`, { date: '2026-02-30', time: 1 })).status, 400);
        assert.equal((await api.post(`/puzzles/${puzzle.id}/logs`, { date: '2026-11-15', time: -1 })).status, 400);
    });
});

describe('simultaneous saves', () => {
    let app, api;
    before(async () => { app = await startApp(); api = client(app.base); });
    after(() => app.stop());

    it('keeps all 50 logs saved at the same moment, with unique ids', async () => {
        const { data: p } = await api.post('/puzzles', { name: 'Race', pieces: 500 });
        const results = await Promise.all(Array.from({ length: 50 }, (_, i) =>
            api.post(`/puzzles/${p.id}/logs`, { date: '2026-11-15', time: i + 1 })));
        assert.ok(results.every(r => r.status === 200));
        const { logs } = (await api.get(`/puzzles/${p.id}`)).data;
        assert.equal(logs.length, 50);
        assert.equal(new Set(logs.map(l => l.id)).size, 50);
    });

    it('keeps every puzzle created at once', async () => {
        await Promise.all(Array.from({ length: 30 }, (_, i) => api.post('/puzzles', { name: `P${i}`, pieces: 100 })));
        const all = (await api.get('/puzzles')).data;
        assert.equal(all.filter(p => /^P\d+$/.test(p.name)).length, 30);
        assert.equal(new Set(all.map(p => p.id)).size, all.length);
    });
});

describe('custom fields', () => {
    let app, api;
    before(async () => { app = await startApp(); api = client(app.base); });
    after(() => app.stop());

    it('adds and removes a field; both name and value are required', async () => {
        const { data: p } = await api.post('/puzzles', { name: 'Custom', pieces: 100 });
        assert.equal((await api.post(`/puzzles/${p.id}/custom-fields`, { name: 'Box', value: '' })).status, 400);
        const { data: f } = await api.post(`/puzzles/${p.id}/custom-fields`, { name: 'Box', value: 'Dented' });
        assert.equal((await api.get(`/puzzles/${p.id}`)).data.customFields[0].value, 'Dented');
        await api.del(`/puzzles/${p.id}/custom-fields/${f.id}`);
        assert.equal((await api.get(`/puzzles/${p.id}`)).data.customFields.length, 0);
    });
});
