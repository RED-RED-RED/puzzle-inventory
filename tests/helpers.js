// Shared helpers for the API tests
const { spawn } = require('child_process');
const net = require('net');
const path = require('path');
const sharp = require('sharp');

function freePort() {
    return new Promise((resolve, reject) => {
        const srv = net.createServer();
        srv.unref();
        srv.on('error', reject);
        srv.listen(0, '127.0.0.1', () => {
            const { port } = srv.address();
            srv.close(() => resolve(port));
        });
    });
}

// Starts a fresh app with empty data. Returns { base, api, root, stop }.
async function startApp() {
    const port = await freePort();
    const child = spawn(process.execPath, [path.join(__dirname, 'start-server.js')], {
        env: { ...process.env, PORT: String(port) },
        stdio: ['ignore', 'pipe', 'pipe']
    });
    let output = '';
    child.stdout.on('data', d => { output += d; });
    child.stderr.on('data', d => { output += d; });

    const base = `http://127.0.0.1:${port}`;
    for (let i = 0; i < 100; i++) {
        if (child.exitCode !== null) throw new Error(`Server exited early:\n${output}`);
        try {
            const res = await fetch(base + '/api/health');
            if (res.ok) break;
        } catch { /* not up yet */ }
        await new Promise(r => setTimeout(r, 100));
    }
    const root = (output.match(/TEST_ROOT=(.+)/) || [])[1];
    if (!root) throw new Error(`Server did not start:\n${output}`);

    const stop = () => new Promise(resolve => {
        if (child.exitCode !== null) return resolve();
        child.once('exit', resolve);
        child.kill('SIGTERM');
    });
    return { base, root: root.trim(), stop, output: () => output, child };
}

// Small JSON client: api.get('/puzzles'), api.post('/puzzles', body) ...
function client(base) {
    const call = async (method, url, body) => {
        const res = await fetch(base + '/api' + url, {
            method,
            headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
            body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body))
        });
        const text = await res.text();
        let data;
        try { data = JSON.parse(text); } catch { data = text; }
        return { status: res.status, data, headers: res.headers };
    };
    return {
        get: url => call('GET', url),
        post: (url, body) => call('POST', url, body),
        put: (url, body) => call('PUT', url, body),
        del: (url, body) => call('DELETE', url, body)
    };
}

// A JPEG of the given size, optionally with a camera orientation tag
function makeJpeg(width = 400, height = 300, orientation) {
    let img = sharp({ create: { width, height, channels: 3, background: '#c86b85' } }).jpeg();
    if (orientation) img = img.withMetadata({ orientation });
    return img.toBuffer();
}

async function uploadImages(base, puzzleId, buffers, extra = {}) {
    const form = new FormData();
    buffers.forEach((buf, i) => form.append('images', new Blob([buf], { type: 'image/jpeg' }), `photo${i}.jpg`));
    for (const [k, v] of Object.entries(extra)) form.append(k, String(v));
    const res = await fetch(`${base}/api/puzzles/${puzzleId}/images`, { method: 'POST', body: form });
    return { status: res.status, data: await res.json() };
}

module.exports = { startApp, client, makeJpeg, uploadImages };
