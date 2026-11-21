// Photo upload, replace, thumbnail and delete
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { startApp, client, makeJpeg, uploadImages } = require('../helpers');

describe('photos', () => {
    let app, api, puzzle, photosDir, tmpDir;
    before(async () => {
        app = await startApp(); api = client(app.base);
        photosDir = path.join(app.root, 'uploads', 'puzzles');
        tmpDir = path.join(app.root, 'tmp');
        puzzle = (await api.post('/puzzles', { name: 'Photos', pieces: 1000 })).data;
    });
    after(() => app.stop());

    const photos = async () => (await api.get(`/puzzles/${puzzle.id}`)).data;

    it('uploads several photos at once and removes the temp copies', async () => {
        const jpeg = await makeJpeg();
        const res = await uploadImages(app.base, puzzle.id, [jpeg, jpeg, jpeg]);
        assert.equal(res.status, 200);
        assert.equal(res.data.images.length, 3);
        assert.equal((await photos()).images.length, 3);
        assert.equal(fs.readdirSync(photosDir).length, 3);
        assert.deepEqual(fs.readdirSync(tmpDir), []);
    });

    it('turns phone photos upright using the camera orientation tag', async () => {
        const { data } = await uploadImages(app.base, puzzle.id, [await makeJpeg(400, 200, 6)]);
        const meta = await sharp(path.join(photosDir, path.basename(data.images[0]))).metadata();
        assert.equal(meta.width, 200);
        assert.equal(meta.height, 400);
    });

    it('shrinks large photos to 1200px', async () => {
        const { data } = await uploadImages(app.base, puzzle.id, [await makeJpeg(3000, 2000)]);
        const meta = await sharp(path.join(photosDir, path.basename(data.images[0]))).metadata();
        assert.equal(Math.max(meta.width, meta.height), 1200);
    });

    it('keeps the same cover when an earlier photo is deleted', async () => {
        await api.put(`/puzzles/${puzzle.id}/thumbnail`, { thumbnailIndex: 2 });
        const cover = (await photos()).images[2];
        await api.del(`/puzzles/${puzzle.id}/images/0`);
        const p = await photos();
        assert.equal(p.images[p.thumbnailIndex], cover);
        assert.equal(fs.readdirSync(photosDir).length, p.images.length, 'deleted file is gone from disk');
    });

    it('rejects an out-of-range cover choice', async () => {
        assert.equal((await api.put(`/puzzles/${puzzle.id}/thumbnail`, { thumbnailIndex: 99 })).status, 400);
    });

    it('replaces a photo in place (rotate) and deletes the old file', async () => {
        const before = await photos();
        const old = before.images[0];
        await uploadImages(app.base, puzzle.id, [await makeJpeg()], { replaceIndex: 0 });
        const after = await photos();
        assert.equal(after.images.length, before.images.length);
        assert.notEqual(after.images[0], old);
        assert.ok(!fs.existsSync(path.join(photosDir, path.basename(old))));
    });

    it('explains unreadable and oversized files, leaving nothing behind', async () => {
        const count = fs.readdirSync(photosDir).length;
        const junk = await uploadImages(app.base, puzzle.id, [Buffer.from('not a picture at all')]);
        assert.equal(junk.status, 400);
        assert.match(junk.data.error, /Could not read/);
        const big = await uploadImages(app.base, puzzle.id, [Buffer.alloc(26 * 1024 * 1024)]);
        assert.equal(big.status, 400);
        assert.match(big.data.error, /too large/);
        assert.equal(fs.readdirSync(photosDir).length, count);
        assert.deepEqual(fs.readdirSync(tmpDir), []);
    });

    it('deleting the puzzle deletes its photos', async () => {
        await api.del(`/puzzles/${puzzle.id}`);
        assert.deepEqual(fs.readdirSync(photosDir), []);
    });
});
