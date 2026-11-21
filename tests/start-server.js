// Starts the app against throwaway data, photo and temp folders, so tests never
// touch real puzzles. Used by the API tests (as a child process) and by
// Playwright (as its webServer).
//
//   node tests/start-server.js            port from PORT, default 3100
//
// The folders live under the system temp folder and are deleted on exit.

const fs = require('fs');
const os = require('os');
const path = require('path');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'puzzle-inventory-test-'));
process.env.DATA_DIR = path.join(root, 'data');
process.env.UPLOADS_DIR = path.join(root, 'uploads');
process.env.UPLOAD_TMP_DIR = path.join(root, 'tmp');
process.env.PORT = process.env.PORT || '3100';
process.env.HOST = '127.0.0.1';

const cleanUp = () => fs.rmSync(root, { recursive: true, force: true });
process.on('exit', cleanUp);

// Let the parent find the folders (the corrupt-file tests write to them)
console.log(`TEST_ROOT=${root}`);

require('../server.js');
