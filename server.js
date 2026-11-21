const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs').promises;

const PORT = parseInt(process.env.PORT, 10) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

const PUBLIC_DIR = path.join(__dirname, 'public');
const UPLOADS_ROOT = path.join(__dirname, 'uploads');
const UPLOADS_DIR = path.join(UPLOADS_ROOT, 'puzzles');
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'puzzles.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const WISHLIST_FILE = path.join(DATA_DIR, 'wishlist.json');
const THEME_FILE = path.join(DATA_DIR, 'theme.json');

const DEFAULT_SETTINGS = { brands: [], themes: [], series: [] };
const DEFAULT_THEME = { primary: '#667eea', secondary: '#764ba2' };

const MAX_IMAGE_MB = 25;
const MAX_IMAGES_PER_UPLOAD = 20;

const app = express();
app.disable('x-powered-by');
app.use(express.static(PUBLIC_DIR));
// Image filenames are unique and never reused, so browsers can cache them long-term
app.use('/uploads', express.static(UPLOADS_ROOT, { maxAge: '30d', immutable: true }));

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

class HttpError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

function sendError(res, err, fallbackMessage) {
    if (err instanceof HttpError) {
        return res.status(err.status).json({ error: err.message });
    }
    console.error(`${fallbackMessage}:`, err);
    res.status(500).json({ error: fallbackMessage });
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

// All reads-then-writes go through this queue so two requests can never
// interleave and overwrite each other's changes.
let writeQueue = Promise.resolve();
function withLock(fn) {
    const run = writeQueue.then(() => fn());
    writeQueue = run.catch(() => {});
    return run;
}

// Missing file -> default value. Unreadable or corrupt file -> throw, so we
// never "fix" a corrupt file by saving an empty list over it.
async function readJson(file, fallback) {
    let text;
    try {
        text = await fs.readFile(file, 'utf8');
    } catch (err) {
        if (err.code === 'ENOENT') return structuredClone(fallback);
        throw err;
    }
    try {
        return JSON.parse(text);
    } catch (err) {
        throw new Error(`${path.basename(file)} contains invalid JSON and was not modified`);
    }
}

// Write to a temp file, flush it to disk, then rename over the target.
// rename() is atomic on Linux, so the file always holds either the old or
// the new contents, even across a crash or power loss.
async function atomicWrite(file, data) {
    const tmp = `${file}.${process.pid}.tmp`;
    const handle = await fs.open(tmp, 'w');
    try {
        await handle.writeFile(JSON.stringify(data, null, 2));
        await handle.sync();
    } finally {
        await handle.close();
    }
    await fs.rename(tmp, file);
}

const readPuzzles = () => readJson(DATA_FILE, []);
const readWishlist = () => readJson(WISHLIST_FILE, []);
const readTheme = () => readJson(THEME_FILE, DEFAULT_THEME);
async function readSettings() {
    return normalizeSettings(await readJson(SETTINGS_FILE, DEFAULT_SETTINGS));
}

// IDs are timestamps, but guaranteed unique even when created in the same millisecond
let lastId = 0;
function nextId() {
    const now = Date.now();
    lastId = now > lastId ? now : lastId + 1;
    return lastId;
}

async function ensureStorage() {
    await fs.mkdir(UPLOADS_DIR, { recursive: true });
    await fs.mkdir(DATA_DIR, { recursive: true });

    const files = [
        [DATA_FILE, []],
        [SETTINGS_FILE, DEFAULT_SETTINGS],
        [WISHLIST_FILE, []],
        [THEME_FILE, DEFAULT_THEME]
    ];
    for (const [file, fallback] of files) {
        try {
            await fs.access(file);
        } catch {
            await atomicWrite(file, fallback);
        }
        // Refuse to start on a corrupt file rather than risk overwriting it
        await readJson(file, fallback);
    }

    // Leftover temp files from a crash are safe to remove
    for (const name of await fs.readdir(DATA_DIR)) {
        if (name.endsWith('.tmp')) await fs.unlink(path.join(DATA_DIR, name)).catch(() => {});
    }
}

// ---------------------------------------------------------------------------
// Validation and normalization
// ---------------------------------------------------------------------------

const str = v => (v == null ? '' : String(v)).trim();
const bool = v => v === true || v === 'true';

function intInRange(v, min, max, fallback) {
    const n = Number(v);
    if (!Number.isInteger(n) || n < min || n > max) return fallback;
    return n;
}

function isValidDateString(v) {
    if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
    const [y, m, d] = v.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

const STRING_FIELDS = ['brand', 'theme', 'series', 'artist', 'size', 'cutStyle', 'location', 'purchasedFrom', 'condition', 'puzzleDust'];
const BOOLEAN_FIELDS = ['passesPickup', 'missingPieces', 'donated'];

// Only known fields are accepted from the client. With partial=true, only
// the fields present in the body are validated and returned.
function cleanPuzzleFields(body, partial) {
    const out = {};
    const has = key => !partial || Object.prototype.hasOwnProperty.call(body, key);

    if (has('name')) {
        out.name = str(body.name);
        if (!out.name) throw new HttpError(400, 'Puzzle name is required');
    }
    if (has('pieces')) {
        out.pieces = intInRange(body.pieces, 1, 1000000, null);
        if (out.pieces === null) throw new HttpError(400, 'Piece count must be a whole number of 1 or more');
    }
    if (has('rating')) out.rating = intInRange(body.rating, 0, 5, 0);
    if (has('missingPieceCount')) out.missingPieceCount = intInRange(body.missingPieceCount, 0, 1000000, 0);
    if (has('notes')) out.notes = body.notes == null ? '' : String(body.notes);
    for (const key of STRING_FIELDS) if (has(key)) out[key] = str(body[key]);
    for (const key of BOOLEAN_FIELDS) if (has(key)) out[key] = bool(body[key]);
    return out;
}

function cleanLog(body) {
    if (!isValidDateString(body.date)) {
        throw new HttpError(400, 'A valid completion date is required');
    }
    const time = Number(body.time ?? 0);
    if (!Number.isFinite(time) || time < 0) {
        throw new HttpError(400, 'Time cannot be negative');
    }
    return {
        date: body.date,
        time, // hours; 0 means "not timed"
        rating: intInRange(body.rating, 0, 5, 0),
        notes: body.notes == null ? '' : String(body.notes)
    };
}

function uniqueStrings(list) {
    if (!Array.isArray(list)) return [];
    return [...new Set(list.map(str).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function normalizeSettings(s) {
    s = s && typeof s === 'object' ? s : {};
    return { ...s, brands: uniqueStrings(s.brands), themes: uniqueStrings(s.themes), series: uniqueStrings(s.series) };
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

const WISHLIST_PRIORITIES = ['high', 'medium', 'low'];
function cleanWishlistItem(body) {
    const name = str(body.name);
    if (!name) throw new HttpError(400, 'Wishlist item name is required');
    return {
        name,
        brand: str(body.brand),
        pieces: str(body.pieces),
        theme: str(body.theme),
        whereToBuy: str(body.whereToBuy),
        url: str(body.url),
        price: str(body.price),
        priority: WISHLIST_PRIORITIES.includes(body.priority) ? body.priority : 'medium',
        notes: body.notes == null ? '' : String(body.notes)
    };
}

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_IMAGE_MB * 1024 * 1024, files: MAX_IMAGES_PER_UPLOAD },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) cb(null, true);
        else cb(new HttpError(400, `"${file.originalname}" is not an image`));
    }
});

const isOurImage = url => typeof url === 'string' && /^\/uploads\/puzzles\/[\w.-]+$/.test(url);

// Only ever deletes files inside uploads/puzzles, no matter what the data says
async function deleteImageFile(url) {
    if (!isOurImage(url)) return;
    try {
        await fs.unlink(path.join(UPLOADS_DIR, path.basename(url)));
    } catch (err) {
        if (err.code !== 'ENOENT') console.error('Error deleting image file:', err);
    }
}

// Resize, auto-rotate from the camera's orientation tag, and save as JPEG.
// Returns the public URLs. If any file fails, every file written so far is removed.
async function processImages(puzzleId, files) {
    const urls = [];
    try {
        for (const file of files) {
            const filename = `${puzzleId}_${nextId()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
            try {
                await sharp(file.buffer)
                    .rotate()
                    .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
                    .jpeg({ quality: 85 })
                    .toFile(path.join(UPLOADS_DIR, filename));
            } catch (err) {
                console.error('Image processing failed:', err.message);
                throw new HttpError(400, `Could not read "${file.originalname}". Use JPEG, PNG, WebP or GIF.`);
            }
            urls.push(`/uploads/puzzles/${filename}`);
        }
        return urls;
    } catch (err) {
        await Promise.all(urls.map(deleteImageFile));
        throw err;
    }
}

// ---------------------------------------------------------------------------
// Puzzle helpers
// ---------------------------------------------------------------------------

const parseId = v => Number(v);

// Locked read-modify-write of a single puzzle. fn may throw HttpError to abort
// without writing anything.
function mutatePuzzle(id, fn) {
    return withLock(async () => {
        const puzzles = await readPuzzles();
        const puzzle = puzzles.find(p => p.id === id);
        if (!puzzle) throw new HttpError(404, 'Puzzle not found');
        const result = await fn(puzzle, puzzles);
        await writePuzzles(puzzles);
        return result;
    });
}

const writePuzzles = puzzles => atomicWrite(DATA_FILE, puzzles);

function clampThumbnail(puzzle) {
    const count = puzzle.images.length;
    if (!Number.isInteger(puzzle.thumbnailIndex) || puzzle.thumbnailIndex < 0 || puzzle.thumbnailIndex >= count) {
        puzzle.thumbnailIndex = 0;
    }
}

// Makes a puzzle from a backup file safe to store
function normalizeRestoredPuzzle(p, usedIds) {
    if (!p || typeof p !== 'object') throw new HttpError(400, 'Backup contains an invalid puzzle entry');
    let fields;
    try {
        fields = cleanPuzzleFields({ rating: 0, notes: '', ...p }, false);
    } catch (err) {
        throw new HttpError(400, `Backup puzzle "${str(p.name) || 'unnamed'}": ${err.message}`);
    }

    let id = Number(p.id);
    if (!Number.isFinite(id) || usedIds.has(id)) id = nextId();
    usedIds.add(id);
    if (id > lastId) lastId = id;

    const images = Array.isArray(p.images) ? p.images.filter(isOurImage) : [];
    const logs = (Array.isArray(p.logs) ? p.logs : []).map(log => {
        let clean;
        try {
            clean = cleanLog(log || {});
        } catch {
            return null; // skip unreadable log entries rather than fail the whole restore
        }
        return { ...clean, id: Number.isFinite(Number(log.id)) ? Number(log.id) : nextId(), createdAt: log.createdAt || new Date().toISOString() };
    }).filter(Boolean);
    const customFields = (Array.isArray(p.customFields) ? p.customFields : [])
        .filter(f => f && str(f.name || f.label) && str(f.value))
        .map(f => ({ id: Number.isFinite(Number(f.id)) ? Number(f.id) : nextId(), name: str(f.name || f.label), value: str(f.value) }));

    const restored = {
        ...fields,
        id,
        images,
        logs,
        customFields,
        thumbnailIndex: Number(p.thumbnailIndex) || 0,
        createdAt: p.createdAt || new Date().toISOString()
    };
    if (p.quality && typeof p.quality === 'object') restored.quality = p.quality;
    clampThumbnail(restored);
    return restored;
}

// ---------------------------------------------------------------------------
// Puzzle routes
// ---------------------------------------------------------------------------

app.get('/api/puzzles', async (req, res) => {
    try {
        res.json(await readPuzzles());
    } catch (err) {
        sendError(res, err, 'Failed to retrieve puzzles');
    }
});

app.get('/api/puzzles/:id', async (req, res) => {
    try {
        const puzzle = (await readPuzzles()).find(p => p.id === parseId(req.params.id));
        if (!puzzle) throw new HttpError(404, 'Puzzle not found');
        res.json(puzzle);
    } catch (err) {
        sendError(res, err, 'Failed to retrieve puzzle');
    }
});

app.post('/api/puzzles', express.json(), async (req, res) => {
    try {
        const fields = cleanPuzzleFields({ rating: 0, notes: '', ...req.body }, false);
        const puzzle = await withLock(async () => {
            const puzzles = await readPuzzles();
            const newPuzzle = {
                id: nextId(),
                ...fields,
                images: [],
                logs: [],
                customFields: [],
                thumbnailIndex: 0,
                createdAt: new Date().toISOString()
            };
            puzzles.push(newPuzzle);
            await writePuzzles(puzzles);
            return newPuzzle;
        });
        res.json(puzzle);
    } catch (err) {
        sendError(res, err, 'Failed to create puzzle');
    }
});

app.put('/api/puzzles/:id', express.json(), async (req, res) => {
    try {
        const fields = cleanPuzzleFields(req.body || {}, true);
        const puzzle = await mutatePuzzle(parseId(req.params.id), p => {
            Object.assign(p, fields);
            return p;
        });
        res.json(puzzle);
    } catch (err) {
        sendError(res, err, 'Failed to update puzzle');
    }
});

app.delete('/api/puzzles/:id', async (req, res) => {
    try {
        const id = parseId(req.params.id);
        const removed = await withLock(async () => {
            const puzzles = await readPuzzles();
            const puzzle = puzzles.find(p => p.id === id);
            if (!puzzle) throw new HttpError(404, 'Puzzle not found');
            await writePuzzles(puzzles.filter(p => p.id !== id));
            return puzzle;
        });
        // Only remove image files once the puzzle is safely gone from the data file
        await Promise.all((removed.images || []).map(deleteImageFile));
        res.json({ success: true });
    } catch (err) {
        sendError(res, err, 'Failed to delete puzzle');
    }
});

// Single-field updates from the detail view
function fieldRoute(route, field, coerce, label) {
    app.put(`/api/puzzles/:id/${route}`, express.json(), async (req, res) => {
        try {
            await mutatePuzzle(parseId(req.params.id), p => {
                p[field] = coerce((req.body || {})[field]);
            });
            res.json({ success: true });
        } catch (err) {
            sendError(res, err, `Failed to update ${label}`);
        }
    });
}
fieldRoute('notes', 'notes', v => (v == null ? '' : String(v)), 'notes');
fieldRoute('condition', 'condition', str, 'condition');
fieldRoute('puzzle-dust', 'puzzleDust', str, 'puzzle dust');
fieldRoute('passes-pickup', 'passesPickup', bool, 'pickup test status');
fieldRoute('donated', 'donated', bool, 'donation status');

app.put('/api/puzzles/:id/missing-pieces', express.json(), async (req, res) => {
    try {
        const body = req.body || {};
        await mutatePuzzle(parseId(req.params.id), p => {
            p.missingPieces = bool(body.missingPieces);
            if (!p.missingPieces) p.missingPieceCount = 0;
            else if (body.missingPieceCount !== undefined) p.missingPieceCount = intInRange(body.missingPieceCount, 0, 1000000, 0);
        });
        res.json({ success: true });
    } catch (err) {
        sendError(res, err, 'Failed to update missing pieces status');
    }
});

app.put('/api/puzzles/:id/thumbnail', express.json(), async (req, res) => {
    try {
        await mutatePuzzle(parseId(req.params.id), p => {
            const index = intInRange((req.body || {}).thumbnailIndex, 0, p.images.length - 1, null);
            if (index === null) throw new HttpError(400, 'Invalid image index');
            p.thumbnailIndex = index;
        });
        res.json({ success: true });
    } catch (err) {
        sendError(res, err, 'Failed to update thumbnail');
    }
});

app.put('/api/puzzles/:id/quality', express.json(), async (req, res) => {
    try {
        const body = req.body;
        if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'Invalid quality data');
        await mutatePuzzle(parseId(req.params.id), p => {
            p.quality = body;
        });
        res.json({ success: true });
    } catch (err) {
        sendError(res, err, 'Failed to update quality data');
    }
});

// --- Images ---

app.post('/api/puzzles/:id/images', upload.array('images', MAX_IMAGES_PER_UPLOAD), async (req, res) => {
    const id = parseId(req.params.id);
    const files = req.files || [];
    let urls = [];
    try {
        if (files.length === 0) throw new HttpError(400, 'No images were uploaded');
        if (!(await readPuzzles()).some(p => p.id === id)) throw new HttpError(404, 'Puzzle not found');

        // Slow image processing happens outside the lock
        urls = await processImages(id, files);

        const replaced = await mutatePuzzle(id, p => {
            const replaceIndex = req.body.replaceIndex !== undefined ? Number(req.body.replaceIndex) : null;
            if (replaceIndex !== null && urls.length === 1 && Number.isInteger(replaceIndex) && replaceIndex >= 0 && replaceIndex < p.images.length) {
                const old = p.images[replaceIndex];
                p.images[replaceIndex] = urls[0];
                return old;
            }
            p.images.push(...urls);
            return null;
        });
        if (replaced) await deleteImageFile(replaced);
        res.json({ images: urls });
    } catch (err) {
        await Promise.all(urls.map(deleteImageFile));
        sendError(res, err, 'Failed to upload images');
    }
});

app.delete('/api/puzzles/:id/images/:imageIndex', async (req, res) => {
    try {
        const removed = await mutatePuzzle(parseId(req.params.id), p => {
            const index = intInRange(req.params.imageIndex, 0, p.images.length - 1, null);
            if (index === null) throw new HttpError(404, 'Image not found');
            const [url] = p.images.splice(index, 1);
            // Keep the same image as thumbnail when an earlier image is removed
            if (index < p.thumbnailIndex) p.thumbnailIndex -= 1;
            clampThumbnail(p);
            return url;
        });
        await deleteImageFile(removed);
        res.json({ success: true });
    } catch (err) {
        sendError(res, err, 'Failed to delete image');
    }
});

// --- Completion logs ---

app.post('/api/puzzles/:id/logs', express.json(), async (req, res) => {
    try {
        const log = { id: nextId(), ...cleanLog(req.body || {}), createdAt: new Date().toISOString() };
        await mutatePuzzle(parseId(req.params.id), p => {
            p.logs.push(log);
        });
        res.json(log);
    } catch (err) {
        sendError(res, err, 'Failed to add log');
    }
});

app.put('/api/puzzles/:id/logs/:logId', express.json(), async (req, res) => {
    try {
        const changes = cleanLog(req.body || {});
        const updated = await mutatePuzzle(parseId(req.params.id), p => {
            const log = p.logs.find(l => l.id === parseId(req.params.logId));
            if (!log) throw new HttpError(404, 'Log not found');
            Object.assign(log, changes);
            return log;
        });
        res.json(updated);
    } catch (err) {
        sendError(res, err, 'Failed to update log');
    }
});

app.delete('/api/puzzles/:id/logs/:logId', async (req, res) => {
    try {
        await mutatePuzzle(parseId(req.params.id), p => {
            p.logs = p.logs.filter(l => l.id !== parseId(req.params.logId));
        });
        res.json({ success: true });
    } catch (err) {
        sendError(res, err, 'Failed to delete log');
    }
});

// --- Custom fields ---

app.post('/api/puzzles/:id/custom-fields', express.json(), async (req, res) => {
    try {
        const name = str((req.body || {}).name);
        const value = str((req.body || {}).value);
        if (!name) throw new HttpError(400, 'Custom field name is required');
        if (!value) throw new HttpError(400, 'Custom field value is required');
        const field = { id: nextId(), name, value };
        await mutatePuzzle(parseId(req.params.id), p => {
            p.customFields.push(field);
        });
        res.json(field);
    } catch (err) {
        sendError(res, err, 'Failed to add custom field');
    }
});

app.delete('/api/puzzles/:id/custom-fields/:fieldId', async (req, res) => {
    try {
        await mutatePuzzle(parseId(req.params.id), p => {
            p.customFields = p.customFields.filter(f => f.id !== parseId(req.params.fieldId));
        });
        res.json({ success: true });
    } catch (err) {
        sendError(res, err, 'Failed to delete custom field');
    }
});

// ---------------------------------------------------------------------------
// Settings, wishlist, theme
// ---------------------------------------------------------------------------

app.get('/api/settings', async (req, res) => {
    try {
        res.json(await readSettings());
    } catch (err) {
        sendError(res, err, 'Failed to retrieve settings');
    }
});

app.put('/api/settings', express.json(), async (req, res) => {
    try {
        const settings = normalizeSettings(req.body);
        await withLock(() => atomicWrite(SETTINGS_FILE, settings));
        res.json(settings);
    } catch (err) {
        sendError(res, err, 'Failed to update settings');
    }
});

app.get('/api/wishlist', async (req, res) => {
    try {
        res.json(await readWishlist());
    } catch (err) {
        sendError(res, err, 'Failed to retrieve wishlist');
    }
});

app.post('/api/wishlist', express.json(), async (req, res) => {
    try {
        const item = { id: nextId(), ...cleanWishlistItem(req.body || {}), addedDate: new Date().toISOString() };
        await withLock(async () => {
            const wishlist = await readWishlist();
            wishlist.push(item);
            await atomicWrite(WISHLIST_FILE, wishlist);
        });
        res.json(item);
    } catch (err) {
        sendError(res, err, 'Failed to add wishlist item');
    }
});

app.put('/api/wishlist/:id', express.json(), async (req, res) => {
    try {
        const changes = cleanWishlistItem(req.body || {});
        const item = await withLock(async () => {
            const wishlist = await readWishlist();
            const existing = wishlist.find(w => w.id === parseId(req.params.id));
            if (!existing) throw new HttpError(404, 'Wishlist item not found');
            Object.assign(existing, changes);
            await atomicWrite(WISHLIST_FILE, wishlist);
            return existing;
        });
        res.json(item);
    } catch (err) {
        sendError(res, err, 'Failed to update wishlist item');
    }
});

app.delete('/api/wishlist/:id', async (req, res) => {
    try {
        await withLock(async () => {
            const wishlist = await readWishlist();
            await atomicWrite(WISHLIST_FILE, wishlist.filter(w => w.id !== parseId(req.params.id)));
        });
        res.json({ success: true });
    } catch (err) {
        sendError(res, err, 'Failed to delete wishlist item');
    }
});

app.get('/api/theme', async (req, res) => {
    try {
        res.json(await readTheme());
    } catch (err) {
        sendError(res, err, 'Failed to retrieve theme');
    }
});

app.put('/api/theme', express.json(), async (req, res) => {
    try {
        const { primary, secondary } = req.body || {};
        if (!HEX_COLOR.test(primary) || !HEX_COLOR.test(secondary)) {
            throw new HttpError(400, 'Colors must be in #rrggbb format');
        }
        await withLock(() => atomicWrite(THEME_FILE, { primary, secondary }));
        res.json({ success: true });
    } catch (err) {
        sendError(res, err, 'Failed to update theme');
    }
});

// ---------------------------------------------------------------------------
// Restore from backup
// ---------------------------------------------------------------------------

// Replaces all data in one locked step. Keeps logs, custom fields, quality
// scores and image references. Never deletes image files. A copy of the
// current data is saved to data/pre-restore-<timestamp>/ first.
app.post('/api/restore', express.json({ limit: '50mb' }), async (req, res) => {
    try {
        const backup = req.body || {};
        if (!Array.isArray(backup.puzzles)) throw new HttpError(400, 'This does not look like a Puzzle Inventory backup file');

        const usedIds = new Set();
        const puzzles = backup.puzzles.map(p => normalizeRestoredPuzzle(p, usedIds));
        const wishlist = (Array.isArray(backup.wishlist) ? backup.wishlist : [])
            .filter(w => w && str(w.name))
            .map(w => ({
                id: Number.isFinite(Number(w.id)) ? Number(w.id) : nextId(),
                ...cleanWishlistItem(w),
                addedDate: w.addedDate || new Date().toISOString()
            }));
        const settings = backup.settings ? normalizeSettings(backup.settings) : null;
        const theme = backup.theme && HEX_COLOR.test(backup.theme.primary) && HEX_COLOR.test(backup.theme.secondary)
            ? { primary: backup.theme.primary, secondary: backup.theme.secondary }
            : null;

        const savedTo = await withLock(async () => {
            const stamp = new Date().toISOString().replace(/[:.]/g, '-');
            const safetyDir = path.join(DATA_DIR, `pre-restore-${stamp}`);
            await fs.mkdir(safetyDir);
            for (const file of [DATA_FILE, SETTINGS_FILE, WISHLIST_FILE, THEME_FILE]) {
                await fs.copyFile(file, path.join(safetyDir, path.basename(file))).catch(() => {});
            }

            await atomicWrite(DATA_FILE, puzzles);
            await atomicWrite(WISHLIST_FILE, wishlist);
            if (settings) await atomicWrite(SETTINGS_FILE, settings);
            if (theme) await atomicWrite(THEME_FILE, theme);
            return path.basename(safetyDir);
        });

        res.json({ success: true, puzzles: puzzles.length, wishlist: wishlist.length, previousDataSavedTo: `data/${savedTo}` });
    } catch (err) {
        sendError(res, err, 'Failed to restore backup');
    }
});

// ---------------------------------------------------------------------------
// Fallback handlers
// ---------------------------------------------------------------------------

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// Turns upload and body-parsing errors into readable JSON instead of an HTML stack trace
app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        const messages = {
            LIMIT_FILE_SIZE: `An image is too large (max ${MAX_IMAGE_MB} MB each)`,
            LIMIT_FILE_COUNT: `Too many images at once (max ${MAX_IMAGES_PER_UPLOAD})`,
            LIMIT_UNEXPECTED_FILE: `Too many images at once (max ${MAX_IMAGES_PER_UPLOAD})`
        };
        return res.status(400).json({ error: messages[err.code] || err.message });
    }
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request is too large' });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Request body is not valid JSON' });
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// ---------------------------------------------------------------------------
// Startup and shutdown
// ---------------------------------------------------------------------------

let server;

// systemd sends SIGTERM on stop/restart. Stop taking requests, let any
// queued writes finish, then exit.
function shutdown(signal) {
    console.log(`Received ${signal}, finishing pending writes...`);
    setTimeout(() => {
        console.error('Shutdown timed out, exiting anyway.');
        process.exit(1);
    }, 8000).unref();
    if (server) server.close();
    writeQueue.then(() => {
        console.log('Shutdown complete.');
        process.exit(0);
    });
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

ensureStorage()
    .then(() => {
        server = app.listen(PORT, HOST, () => {
            console.log(`Puzzle Inventory running on http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
            console.log(`Data: ${DATA_DIR}`);
            console.log(`Images: ${UPLOADS_DIR}`);
        });
    })
    .catch(err => {
        console.error('Startup failed:', err.message);
        console.error('Fix or restore the file above, then start the service again. Nothing was overwritten.');
        process.exit(1);
    });
