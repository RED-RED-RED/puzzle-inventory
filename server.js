const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');

const app = express();
const PORT = 3000;

// Middleware
app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// Ensure directories exist
const UPLOADS_DIR = path.join(__dirname, 'uploads', 'puzzles');
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'puzzles.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const WISHLIST_FILE = path.join(DATA_DIR, 'wishlist.json');
const THEME_FILE = path.join(DATA_DIR, 'theme.json');

async function ensureDirectories() {
    try {
        await fs.mkdir(UPLOADS_DIR, { recursive: true });
        await fs.mkdir(DATA_DIR, { recursive: true });
        
        // Create empty data files if they don't exist
        try {
            await fs.access(DATA_FILE);
        } catch {
            await fs.writeFile(DATA_FILE, JSON.stringify([]));
        }
        
        try {
            await fs.access(SETTINGS_FILE);
        } catch {
            await fs.writeFile(SETTINGS_FILE, JSON.stringify({ brands: [], themes: [], series: [] }));
        }
        
        try {
            await fs.access(WISHLIST_FILE);
        } catch {
            await fs.writeFile(WISHLIST_FILE, JSON.stringify([]));
        }
        
        try {
            await fs.access(THEME_FILE);
        } catch {
            await fs.writeFile(THEME_FILE, JSON.stringify({ primary: '#667eea', secondary: '#764ba2' }));
        }
    } catch (error) {
        console.error('Error creating directories:', error);
    }
}

// Configure multer for memory storage (we'll process before saving)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed'));
        }
    }
});

// Atomic write: writes to a .tmp file then renames over the target.
// On Linux, rename() is atomic — the target either has the old content or the new content, never a partial write.
let pendingWrites = 0;

async function atomicWrite(filePath, data) {
    const tmpPath = filePath + '.tmp';
    pendingWrites++;
    try {
        await fs.writeFile(tmpPath, data);
        await fs.rename(tmpPath, filePath);
    } finally {
        pendingWrites--;
    }
}

// Read puzzles data
async function readPuzzles() {
    try {
        const data = await fs.readFile(DATA_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error reading puzzles:', error);
        return [];
    }
}

// Write puzzles data
async function writePuzzles(puzzles) {
    try {
        await atomicWrite(DATA_FILE, JSON.stringify(puzzles, null, 2));
    } catch (error) {
        console.error('Error writing puzzles:', error);
        throw error;
    }
}

// Read settings data
async function readSettings() {
    try {
        const data = await fs.readFile(SETTINGS_FILE, 'utf8');
        const settings = JSON.parse(data);
        // Ensure series array exists for older settings files
        if (!settings.series) settings.series = [];
        return settings;
    } catch (error) {
        console.error('Error reading settings:', error);
        return { brands: [], themes: [], series: [] };
    }
}

// Write settings data
async function writeSettings(settings) {
    try {
        await atomicWrite(SETTINGS_FILE, JSON.stringify(settings, null, 2));
    } catch (error) {
        console.error('Error writing settings:', error);
        throw error;
    }
}

// Read wishlist data
async function readWishlist() {
    try {
        const data = await fs.readFile(WISHLIST_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error reading wishlist:', error);
        return [];
    }
}

// Write wishlist data
async function writeWishlist(wishlist) {
    try {
        await atomicWrite(WISHLIST_FILE, JSON.stringify(wishlist, null, 2));
    } catch (error) {
        console.error('Error writing wishlist:', error);
        throw error;
    }
}

// Read theme data
async function readTheme() {
    try {
        const data = await fs.readFile(THEME_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error reading theme:', error);
        return { primary: '#667eea', secondary: '#764ba2' };
    }
}

// Write theme data
async function writeTheme(theme) {
    try {
        await atomicWrite(THEME_FILE, JSON.stringify(theme, null, 2));
    } catch (error) {
        console.error('Error writing theme:', error);
        throw error;
    }
}

// API Routes

// Get all puzzles
app.get('/api/puzzles', async (req, res) => {
    try {
        const puzzles = await readPuzzles();
        res.json(puzzles);
    } catch (error) {
        res.status(500).json({ error: 'Failed to retrieve puzzles' });
    }
});

// Get single puzzle
app.get('/api/puzzles/:id', async (req, res) => {
    try {
        const puzzles = await readPuzzles();
        const puzzle = puzzles.find(p => p.id === parseInt(req.params.id));
        if (!puzzle) {
            return res.status(404).json({ error: 'Puzzle not found' });
        }
        res.json(puzzle);
    } catch (error) {
        res.status(500).json({ error: 'Failed to retrieve puzzle' });
    }
});

// Create puzzle
app.post('/api/puzzles', async (req, res) => {
    try {
        // Validation
        const name = (req.body.name || '').trim();
        if (!name) {
            return res.status(400).json({ error: 'Puzzle name is required' });
        }
        const pieces = parseInt(req.body.pieces);
        if (isNaN(pieces) || pieces < 1) {
            return res.status(400).json({ error: 'Piece count must be a positive number' });
        }

        const puzzles = await readPuzzles();
        const newPuzzle = {
            id: Date.now(),
            ...req.body,
            name: name,
            pieces: pieces,
            images: [],
            logs: [],
            customFields: [],
            thumbnailIndex: 0,
            createdAt: new Date().toISOString()
        };
        puzzles.push(newPuzzle);
        await writePuzzles(puzzles);
        res.json(newPuzzle);
    } catch (error) {
        console.error('Failed to create puzzle:', error);
        res.status(500).json({ error: 'Failed to create puzzle: ' + error.message });
    }
});

// Update puzzle
app.put('/api/puzzles/:id', async (req, res) => {
    try {
        const puzzles = await readPuzzles();
        const index = puzzles.findIndex(p => p.id === parseInt(req.params.id));
        if (index === -1) {
            return res.status(404).json({ error: 'Puzzle not found' });
        }
        
        // Update puzzle while preserving complex data structures (images, logs, customFields, quality)
        puzzles[index] = {
            ...puzzles[index],
            ...req.body,
            id: puzzles[index].id, // Don't allow ID changes
            images: puzzles[index].images, // Preserve images
            logs: puzzles[index].logs, // Preserve logs
            customFields: puzzles[index].customFields, // Preserve custom fields
            quality: puzzles[index].quality, // Preserve quality data
            thumbnailIndex: puzzles[index].thumbnailIndex // Preserve thumbnail
        };
        
        await writePuzzles(puzzles);
        res.json(puzzles[index]);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update puzzle' });
    }
});

// Delete puzzle
app.delete('/api/puzzles/:id', async (req, res) => {
    try {
        const puzzles = await readPuzzles();
        const puzzle = puzzles.find(p => p.id === parseInt(req.params.id));
        
        if (!puzzle) {
            return res.status(404).json({ error: 'Puzzle not found' });
        }
        
        // Delete associated images
        for (const image of puzzle.images) {
            const imagePath = path.join(__dirname, image);
            try {
                await fs.unlink(imagePath);
            } catch (err) {
                console.error('Error deleting image:', err);
            }
        }
        
        const filteredPuzzles = puzzles.filter(p => p.id !== parseInt(req.params.id));
        await writePuzzles(filteredPuzzles);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete puzzle' });
    }
});

// Upload images for a puzzle
app.post('/api/puzzles/:id/images', upload.array('images', 10), async (req, res) => {
    try {
        const puzzles = await readPuzzles();
        const puzzle = puzzles.find(p => p.id === parseInt(req.params.id));
        
        if (!puzzle) {
            return res.status(404).json({ error: 'Puzzle not found' });
        }
        
        const replaceIndex = req.body.replaceIndex !== undefined ? parseInt(req.body.replaceIndex) : null;
        const imageUrls = [];
        
        for (const file of req.files) {
            const filename = `${puzzle.id}_${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`;
            const filepath = path.join(UPLOADS_DIR, filename);
            
            // Process image: resize to max 1200px width/height, compress
            await sharp(file.buffer)
                .resize(1200, 1200, {
                    fit: 'inside',
                    withoutEnlargement: true
                })
                .jpeg({ quality: 85 })
                .toFile(filepath);
            
            const imageUrl = `/uploads/puzzles/${filename}`;
            imageUrls.push(imageUrl);
            
            // If replaceIndex is specified, replace that image
            if (replaceIndex !== null && replaceIndex >= 0 && replaceIndex < puzzle.images.length) {
                // Delete old image file
                const oldImagePath = path.join(__dirname, puzzle.images[replaceIndex]);
                try {
                    await fs.unlink(oldImagePath);
                } catch (err) {
                    console.error('Error deleting old image file:', err);
                }
                
                // Replace the image at that index
                puzzle.images[replaceIndex] = imageUrl;
            } else {
                // Otherwise add as new image
                puzzle.images.push(imageUrl);
            }
        }
        
        await writePuzzles(puzzles);
        res.json({ images: imageUrls });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: 'Failed to upload images' });
    }
});

// Delete an image
app.delete('/api/puzzles/:id/images/:imageIndex', async (req, res) => {
    try {
        const puzzles = await readPuzzles();
        const puzzle = puzzles.find(p => p.id === parseInt(req.params.id));
        
        if (!puzzle) {
            return res.status(404).json({ error: 'Puzzle not found' });
        }
        
        const imageIndex = parseInt(req.params.imageIndex);
        if (imageIndex < 0 || imageIndex >= puzzle.images.length) {
            return res.status(404).json({ error: 'Image not found' });
        }
        
        const imagePath = path.join(__dirname, puzzle.images[imageIndex]);
        try {
            await fs.unlink(imagePath);
        } catch (err) {
            console.error('Error deleting image file:', err);
        }
        
        puzzle.images.splice(imageIndex, 1);
        await writePuzzles(puzzles);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete image' });
    }
});

// Add completion log
app.post('/api/puzzles/:id/logs', async (req, res) => {
    try {
        const puzzles = await readPuzzles();
        const puzzle = puzzles.find(p => p.id === parseInt(req.params.id));
        
        if (!puzzle) {
            return res.status(404).json({ error: 'Puzzle not found' });
        }

        // Validation
        if (!req.body.date || isNaN(Date.parse(req.body.date))) {
            return res.status(400).json({ error: 'A valid completion date is required' });
        }
        const time = parseFloat(req.body.time);
        if (isNaN(time) || time <= 0) {
            return res.status(400).json({ error: 'Time must be a positive number' });
        }
        
        const newLog = {
            id: Date.now(),
            ...req.body,
            time: time,
            createdAt: new Date().toISOString()
        };
        
        puzzle.logs.push(newLog);
        await writePuzzles(puzzles);
        res.json(newLog);
    } catch (error) {
        res.status(500).json({ error: 'Failed to add log' });
    }
});

// Delete completion log
app.delete('/api/puzzles/:id/logs/:logId', async (req, res) => {
    try {
        const puzzles = await readPuzzles();
        const puzzle = puzzles.find(p => p.id === parseInt(req.params.id));
        
        if (!puzzle) {
            return res.status(404).json({ error: 'Puzzle not found' });
        }
        
        puzzle.logs = puzzle.logs.filter(l => l.id !== parseInt(req.params.logId));
        await writePuzzles(puzzles);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete log' });
    }
});

// Update log
app.put('/api/puzzles/:id/logs/:logId', async (req, res) => {
    try {
        const puzzles = await readPuzzles();
        const puzzle = puzzles.find(p => p.id === parseInt(req.params.id));
        
        if (!puzzle) {
            return res.status(404).json({ error: 'Puzzle not found' });
        }
        
        const logIndex = puzzle.logs.findIndex(l => l.id === parseInt(req.params.logId));
        if (logIndex === -1) {
            return res.status(404).json({ error: 'Log not found' });
        }
        
        puzzle.logs[logIndex] = {
            ...puzzle.logs[logIndex],
            ...req.body
        };
        
        await writePuzzles(puzzles);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update log' });
    }
});

// Update notes
app.put('/api/puzzles/:id/notes', async (req, res) => {
    try {
        const puzzles = await readPuzzles();
        const puzzle = puzzles.find(p => p.id === parseInt(req.params.id));
        
        if (!puzzle) {
            return res.status(404).json({ error: 'Puzzle not found' });
        }
        
        puzzle.notes = req.body.notes;
        await writePuzzles(puzzles);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update notes' });
    }
});

// Update puzzle dust
app.put('/api/puzzles/:id/puzzle-dust', async (req, res) => {
    try {
        const puzzles = await readPuzzles();
        const puzzle = puzzles.find(p => p.id === parseInt(req.params.id));
        
        if (!puzzle) {
            return res.status(404).json({ error: 'Puzzle not found' });
        }
        
        puzzle.puzzleDust = req.body.puzzleDust;
        await writePuzzles(puzzles);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update puzzle dust' });
    }
});

// Update donation status
app.put('/api/puzzles/:id/donated', async (req, res) => {
    try {
        const puzzles = await readPuzzles();
        const puzzle = puzzles.find(p => p.id === parseInt(req.params.id));
        
        if (!puzzle) {
            return res.status(404).json({ error: 'Puzzle not found' });
        }
        
        puzzle.donated = req.body.donated;
        await writePuzzles(puzzles);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update donation status' });
    }
});

// Update condition
app.put('/api/puzzles/:id/condition', async (req, res) => {
    try {
        const puzzles = await readPuzzles();
        const puzzle = puzzles.find(p => p.id === parseInt(req.params.id));
        
        if (!puzzle) {
            return res.status(404).json({ error: 'Puzzle not found' });
        }
        
        puzzle.condition = req.body.condition;
        await writePuzzles(puzzles);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update condition' });
    }
});

// Update passes pickup test
app.put('/api/puzzles/:id/passes-pickup', async (req, res) => {
    try {
        const puzzles = await readPuzzles();
        const puzzle = puzzles.find(p => p.id === parseInt(req.params.id));
        
        if (!puzzle) {
            return res.status(404).json({ error: 'Puzzle not found' });
        }
        
        puzzle.passesPickup = req.body.passesPickup;
        await writePuzzles(puzzles);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update passes pickup status' });
    }
});

// Update thumbnail
app.put('/api/puzzles/:id/thumbnail', async (req, res) => {
    try {
        const puzzles = await readPuzzles();
        const puzzle = puzzles.find(p => p.id === parseInt(req.params.id));
        
        if (!puzzle) {
            return res.status(404).json({ error: 'Puzzle not found' });
        }
        
        puzzle.thumbnailIndex = req.body.thumbnailIndex;
        await writePuzzles(puzzles);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update thumbnail' });
    }
});

// Update missing pieces
app.put('/api/puzzles/:id/missing-pieces', async (req, res) => {
    try {
        const puzzles = await readPuzzles();
        const puzzle = puzzles.find(p => p.id === parseInt(req.params.id));
        
        if (!puzzle) {
            return res.status(404).json({ error: 'Puzzle not found' });
        }
        
        puzzle.missingPieces = req.body.missingPieces;
        await writePuzzles(puzzles);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update missing pieces status' });
    }
});

// Update PQI
app.put('/api/puzzles/:id/pqi', async (req, res) => {
    try {
        const puzzles = await readPuzzles();
        const puzzle = puzzles.find(p => p.id === parseInt(req.params.id));
        
        if (!puzzle) {
            return res.status(404).json({ error: 'Puzzle not found' });
        }
        
        puzzle.pqi = req.body;
        await writePuzzles(puzzles);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update PQI' });
    }
});

// Update quality data
app.put('/api/puzzles/:id/quality', async (req, res) => {
    try {
        const puzzles = await readPuzzles();
        const puzzle = puzzles.find(p => p.id === parseInt(req.params.id));
        
        if (!puzzle) {
            return res.status(404).json({ error: 'Puzzle not found' });
        }
        
        puzzle.quality = req.body;
        await writePuzzles(puzzles);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update quality data' });
    }
});

// Add custom field
app.post('/api/puzzles/:id/custom-fields', async (req, res) => {
    try {
        const puzzles = await readPuzzles();
        const puzzle = puzzles.find(p => p.id === parseInt(req.params.id));
        
        if (!puzzle) {
            return res.status(404).json({ error: 'Puzzle not found' });
        }

        // Validation
        const label = (req.body.label || '').trim();
        const value = (req.body.value || '').trim();
        if (!label) {
            return res.status(400).json({ error: 'Custom field label is required' });
        }
        if (!value) {
            return res.status(400).json({ error: 'Custom field value is required' });
        }
        
        const newField = {
            id: Date.now(),
            ...req.body,
            label: label,
            value: value
        };
        
        puzzle.customFields.push(newField);
        await writePuzzles(puzzles);
        res.json(newField);
    } catch (error) {
        res.status(500).json({ error: 'Failed to add custom field' });
    }
});

// Delete custom field
app.delete('/api/puzzles/:id/custom-fields/:fieldId', async (req, res) => {
    try {
        const puzzles = await readPuzzles();
        const puzzle = puzzles.find(p => p.id === parseInt(req.params.id));
        
        if (!puzzle) {
            return res.status(404).json({ error: 'Puzzle not found' });
        }
        
        puzzle.customFields = puzzle.customFields.filter(f => f.id !== parseInt(req.params.fieldId));
        await writePuzzles(puzzles);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete custom field' });
    }
});

// Settings endpoints
app.get('/api/settings', async (req, res) => {
    try {
        const settings = await readSettings();
        res.json(settings);
    } catch (error) {
        res.status(500).json({ error: 'Failed to retrieve settings' });
    }
});

app.put('/api/settings', async (req, res) => {
    try {
        await writeSettings(req.body);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update settings' });
    }
});

// Wishlist endpoints
app.get('/api/wishlist', async (req, res) => {
    try {
        const wishlist = await readWishlist();
        res.json(wishlist);
    } catch (error) {
        res.status(500).json({ error: 'Failed to retrieve wishlist' });
    }
});

app.post('/api/wishlist', async (req, res) => {
    try {
        // Validation
        const name = (req.body.name || '').trim();
        if (!name) {
            return res.status(400).json({ error: 'Wishlist item name is required' });
        }

        const wishlist = await readWishlist();
        const newItem = {
            id: Date.now(),
            ...req.body,
            name: name,
            addedDate: new Date().toISOString()
        };
        wishlist.push(newItem);
        await writeWishlist(wishlist);
        res.json(newItem);
    } catch (error) {
        res.status(500).json({ error: 'Failed to add wishlist item' });
    }
});

app.put('/api/wishlist/:id', async (req, res) => {
    try {
        const wishlist = await readWishlist();
        const index = wishlist.findIndex(w => w.id === parseInt(req.params.id));
        
        if (index === -1) {
            return res.status(404).json({ error: 'Wishlist item not found' });
        }
        
        wishlist[index] = {
            ...wishlist[index],
            ...req.body,
            id: wishlist[index].id,
            addedDate: wishlist[index].addedDate
        };
        
        await writeWishlist(wishlist);
        res.json(wishlist[index]);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update wishlist item' });
    }
});

app.delete('/api/wishlist/:id', async (req, res) => {
    try {
        const wishlist = await readWishlist();
        const filtered = wishlist.filter(w => w.id !== parseInt(req.params.id));
        await writeWishlist(filtered);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete wishlist item' });
    }
});

// Theme endpoints
app.get('/api/theme', async (req, res) => {
    try {
        const theme = await readTheme();
        res.json(theme);
    } catch (error) {
        res.status(500).json({ error: 'Failed to retrieve theme' });
    }
});

app.put('/api/theme', async (req, res) => {
    try {
        await writeTheme(req.body);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update theme' });
    }
});

// Graceful shutdown: wait for any in-flight atomic writes to finish before exiting.
// systemd sends SIGTERM on `systemctl stop` — without this, a write could be interrupted
// mid-rename and we'd lose data.
function shutdown(signal) {
    console.log(`Received ${signal}. Waiting for pending writes to complete...`);
    const check = () => {
        if (pendingWrites > 0) {
            setTimeout(check, 50);
        } else {
            console.log('All writes complete. Exiting.');
            process.exit(0);
        }
    };
    check();
    // Safety timeout: force exit after 5 seconds regardless
    setTimeout(() => {
        console.error('Shutdown timeout reached. Forcing exit.');
        process.exit(1);
    }, 5000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

// Start server
ensureDirectories().then(() => {
    const server = app.listen(PORT, () => {
        console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║     🧩  Puzzle Inventory Server Running!  🧩             ║
║                                                           ║
║     Server: http://localhost:${PORT}                        ║
║     Data files:                                           ║
║       - Puzzles: ./data/puzzles.json                     ║
║       - Settings: ./data/settings.json                   ║
║       - Wishlist: ./data/wishlist.json                   ║
║       - Theme: ./data/theme.json                         ║
║     Images: ./uploads/puzzles/                           ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
        `);
    });
});
