let puzzles = [];
let puzzlesLoadFailed = false; // true when the server could not be reached or returned an error
let currentPuzzleId = null;
let currentRating = 0;
let currentLogRating = 0;
let initialLogRating = 0;

function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Dates are stored as "YYYY-MM-DD" in local time. new Date("YYYY-MM-DD") parses
// as UTC midnight, which shows the previous day in US time zones, so never use it.
function todayLocal() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseLocalDate(value) {
    const [y, m, d] = String(value).split('-').map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
}

// Fetch one puzzle and keep the local cache in sync. Anything that changes a
// puzzle should refresh through here so the Edit modal never shows stale data.
async function refreshPuzzle(id = currentPuzzleId) {
    const puzzle = await apiRequest(`/api/puzzles/${id}`);
    const index = puzzles.findIndex(p => p.id === id);
    if (index !== -1) puzzles[index] = puzzle;
    else puzzles.push(puzzle);
    return puzzle;
}

// ---------------------------------------------------------------------------
// Phone layout: the search/filter/list panel folds away so content shows first
// ---------------------------------------------------------------------------

const isPhoneLayout = () => window.matchMedia("(max-width: 768px)").matches;

function setBrowsePanel(open) {
    document.body.classList.toggle("browse-open", open);
    const toggle = document.getElementById("mobileBrowseToggle");
    if (toggle) toggle.setAttribute("aria-expanded", String(open));
}

function toggleBrowsePanel() {
    setBrowsePanel(!document.body.classList.contains("browse-open"));
}

// After switching pages on a phone, close the list and bring the content into view
function revealContent() {
    if (!isPhoneLayout()) return;
    setBrowsePanel(false);
    const content = document.querySelector(".content-area");
    const bar = document.querySelector(".app-bar");
    const offset = (bar ? bar.offsetHeight : 0) + 4;
    if (content) window.scrollTo({ top: Math.max(0, content.getBoundingClientRect().top + window.scrollY - offset), behavior: "smooth" });
}

function toggleMissingCount(checkboxId, wrapId) {
    const checked = document.getElementById(checkboxId).checked;
    document.getElementById(wrapId).style.display = checked ? 'flex' : 'none';
}

// Selects a value in a fixed dropdown, adding it as an option if an older
// value is not in the list so it is never silently lost on save.
function setSelectValue(selectId, value) {
    const select = document.getElementById(selectId);
    if (value && ![...select.options].some(o => o.value === value)) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = value;
        select.appendChild(option);
    }
    select.value = value;
}

// Small shared pieces of markup
const pieceIcon = () => '<svg viewBox="0 0 512 512" aria-hidden="true"><use href="#piece"/></svg>';

function starsHtml(rating) {
    const n = Math.max(0, Math.min(5, rating || 0));
    return `<span class="stars" role="img" aria-label="${n} of 5 stars">${"★".repeat(n)}<span class="off">${"★".repeat(5 - n)}</span></span>`;
}

const formatPieces = n => Number(n || 0).toLocaleString();
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

function longDate(value) {
    return parseLocalDate(value).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

let editingPuzzleId = null;
let editingWishlistId = null;
let convertingWishlistId = null; // wishlist item being moved into the collection
let lastPickedId = null;        // last "Pick One for Me" result
let wishlistItems = [];
let settings = {
    brands: [],
    themes: [],
    series: []
};
let currentEditingImage = null;
let currentEditingImageIndex = null;
let editorRotation = 0;

// Wishlist management
async function loadWishlist() {
    try {
        wishlistItems = await apiRequest('/api/wishlist');
    } catch (error) {
        console.error('Failed to load wishlist:', error);
        wishlistItems = [];
    }
}

async function saveWishlistItem(event) {
    event.preventDefault();
    
    const itemData = {
        name: document.getElementById('wishlistName').value,
        brand: document.getElementById('wishlistBrand').value,
        pieces: document.getElementById('wishlistPieces').value,
        theme: document.getElementById('wishlistTheme').value,
        whereToBuy: document.getElementById('wishlistWhereToBuy').value,
        url: document.getElementById('wishlistUrl').value,
        price: document.getElementById('wishlistPrice').value,
        priority: document.getElementById('wishlistPriority').value,
        notes: document.getElementById('wishlistNotes').value
    };
    
    try {
        if (editingWishlistId) {
            await apiRequest(`/api/wishlist/${editingWishlistId}`, {
                method: 'PUT',
                body: JSON.stringify(itemData)
            });
            showAlert('Wishlist item updated!');
        } else {
            await apiRequest('/api/wishlist', {
                method: 'POST',
                body: JSON.stringify(itemData)
            });
            showAlert('Added to wishlist!');
        }
        
        await loadWishlist();
        renderWishlist();
        closeModal('wishlistModal');
    } catch (error) {
        console.error('Failed to save wishlist item:', error);
    }
}

function showWishlist() {
    document.getElementById('dashboard').classList.remove('active');
    document.getElementById('settingsPage').classList.remove('active');
    document.getElementById('puzzleDetail').classList.remove('active');
    document.getElementById('wishlistPage').classList.add('active');
    document.getElementById('welcomeScreen').style.display = 'none';
    
    document.getElementById('homeNavBtn').classList.remove('active');
    document.getElementById('settingsNavBtn').classList.remove('active');
    document.getElementById('wishlistNavBtn').classList.add('active');
    
    currentPuzzleId = null;
    renderPuzzleList();
    renderWishlist();
    revealContent();
}

function showAddWishlistModal() {
    editingWishlistId = null;
    document.getElementById('wishlistModalTitle').textContent = 'Add to wishlist';
    document.getElementById('wishlistName').value = '';
    document.getElementById('wishlistBrand').value = '';
    document.getElementById('wishlistPieces').value = '';
    document.getElementById('wishlistTheme').value = '';
    document.getElementById('wishlistWhereToBuy').value = '';
    document.getElementById('wishlistUrl').value = '';
    document.getElementById('wishlistPrice').value = '';
    document.getElementById('wishlistPriority').value = 'medium';
    document.getElementById('wishlistNotes').value = '';
    showModal('wishlistModal');
}

function editWishlistItem(id) {
    const item = wishlistItems.find(w => w.id === id);
    if (!item) return;
    
    editingWishlistId = id;
    document.getElementById('wishlistModalTitle').textContent = 'Edit wishlist item';
    document.getElementById('wishlistName').value = item.name;
    document.getElementById('wishlistBrand').value = item.brand || '';
    document.getElementById('wishlistPieces').value = item.pieces || '';
    document.getElementById('wishlistTheme').value = item.theme || '';
    document.getElementById('wishlistWhereToBuy').value = item.whereToBuy || '';
    document.getElementById('wishlistUrl').value = item.url || '';
    document.getElementById('wishlistPrice').value = item.price || '';
    document.getElementById('wishlistPriority').value = item.priority || 'medium';
    document.getElementById('wishlistNotes').value = item.notes || '';
    showModal('wishlistModal');
}

async function deleteWishlistItem(id) {
    if (!confirm('Remove this item from wishlist?')) return;
    
    try {
        await apiRequest(`/api/wishlist/${id}`, {
            method: 'DELETE'
        });
        
        await loadWishlist();
        renderWishlist();
        showAlert('Removed from wishlist');
    } catch (error) {
        console.error('Failed to delete wishlist item:', error);
    }
}

function renderWishlist() {
    const container = document.getElementById('wishlistGrid');

    if (wishlistItems.length === 0) {
        container.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1;">
                <h3>Nothing on the wishlist yet</h3>
                <p>Add puzzles you'd like to find, so you have them handy at the store.</p>
            </div>
        `;
        return;
    }

    const priorityOrder = { high: 0, medium: 1, low: 2 };
    const sorted = [...wishlistItems].sort((a, b) => (priorityOrder[a.priority] ?? 1) - (priorityOrder[b.priority] ?? 1));

    container.innerHTML = sorted.map(item => {
        const priority = ['high', 'medium', 'low'].includes(item.priority) ? item.priority : 'medium';
        const priorityText = priority.charAt(0).toUpperCase() + priority.slice(1) + ' priority';
        const price = formatPrice(item.price);
        const safeUrl = item.url && /^https?:\/\//i.test(item.url) ? item.url : null;
        const meta = [item.brand, item.pieces ? `${formatPieces(item.pieces)} pieces` : '', item.theme].filter(Boolean).map(escapeHtml).join(', ');
        const where = item.whereToBuy ? `<p class="meta">From ${escapeHtml(item.whereToBuy)}</p>` : '';

        return `
            <div class="wishlist-card">
                <div><span class="tag priority-${priority}">${priorityText}</span></div>
                <h3>${escapeHtml(item.name)}</h3>
                ${meta ? `<p class="meta">${meta}</p>` : ''}
                ${where}
                ${price ? `<p class="price">${escapeHtml(price)}</p>` : ''}
                ${safeUrl ? `<p><a href="${escapeHtml(safeUrl)}" target="_blank" rel="noopener">View product</a></p>` : ''}
                ${item.notes ? `<p class="notes">${escapeHtml(item.notes)}</p>` : ''}
                <div class="btn-row">
                    <button class="btn btn-primary btn-small" onclick="convertWishlistItem(${item.id})" title="Move this puzzle into your collection">Got it</button>
                    <button class="btn btn-secondary btn-small" onclick="editWishlistItem(${item.id})">Edit</button>
                    <button class="btn btn-danger btn-small" onclick="deleteWishlistItem(${item.id})">Remove</button>
                </div>
            </div>
        `;
    }).join('');
}

// Plain numbers ("25", "$25.5", "25.00") show as $25.50; anything else shows as typed
function formatPrice(price) {
    const text = String(price || '').trim();
    if (!text) return '';
    const plain = text.replace(/^\$\s*/, '').replace(/,/g, '');
    return /^\d+(\.\d+)?$/.test(plain) ? "$" + Number(plain).toFixed(2) : text;
}

// Settings management
async function loadSettings() {
    try {
        settings = await apiRequest('/api/settings');
    } catch (error) {
        console.error('Failed to load settings:', error);
        settings = { brands: [], themes: [], series: [] };
    }
}

// Brand/theme/series changes are sent one item at a time and merged on the
// server, so two devices adding at the same time cannot overwrite each other.
// Requests are chained so they reach the server in order.
let settingsSaveChain = Promise.resolve();
function sendSettingsChange(kind, value, method) {
    settingsSaveChain = settingsSaveChain
        .then(() => apiRequest(`/api/settings/${kind}`, { method, body: JSON.stringify({ value }) }))
        .then(updated => {
            settings = updated;
            if (document.getElementById("settingsPage").classList.contains("active")) {
                renderBrandsList(); renderThemesList(); renderSeriesList();
            }
        })
        .catch(error => console.error("Failed to save settings:", error));
    return settingsSaveChain;
}

function addManagedItem(kind, value) {
    const item = (value || "").trim();
    if (!settings[kind]) settings[kind] = [];
    if (!item || settings[kind].includes(item)) return false;
    settings[kind].push(item); // show it right away; the server reply replaces the list
    settings[kind].sort((a, b) => a.localeCompare(b));
    sendSettingsChange(kind, item, "POST");
    return true;
}

function removeManagedItem(kind, value) {
    settings[kind] = (settings[kind] || []).filter(v => v !== value);
    sendSettingsChange(kind, value, "DELETE");
}

const addBrand = brand => addManagedItem("brands", brand);
const removeBrand = brand => removeManagedItem("brands", brand);
const addTheme = theme => addManagedItem("themes", theme);
const removeTheme = theme => removeManagedItem("themes", theme);

// Delete buttons pass the list index rather than the name, so names with
// quotes or other special characters cannot break the HTML.
function deleteManagedItem(kind, index) {
    const value = (settings[kind] || [])[index];
    if (value === undefined) return;
    removeManagedItem(kind, value);
    if (kind === "brands") { renderBrandsList(); updateBrandDropdowns(); }
    if (kind === "themes") { renderThemesList(); updateThemeDropdowns(); }
    if (kind === "series") { renderSeriesList(); updateSeriesDropdowns(); }
}

function renderManagedList(containerId, kind, emptyText) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const items = settings[kind] || [];
    if (items.length === 0) {
        container.innerHTML = `<p class="muted">${emptyText}</p>`;
        return;
    }
    container.innerHTML = items.map((item, index) => `
        <div class="custom-field-item">
            <div>${escapeHtml(item)}</div>
            <button class="btn btn-danger btn-small" onclick="deleteManagedItem('${kind}', ${index})">Remove</button>
        </div>
    `).join("");
}

function renderBrandsList() { renderManagedList("brandsList", "brands", "No brands yet. They also get added when you type a new one on a puzzle."); }
function renderThemesList() { renderManagedList("themesList", "themes", "No themes yet."); }

function fillManagedDropdown(selectId, kind, addLabel) {
    const select = document.getElementById(selectId);
    if (!select) return;
    const currentValue = select.value;
    const items = settings[kind] || [];
    select.innerHTML = `
        <option value="">Not specified</option>
        ${items.map(item => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join("")}
        <option value="__new__">${addLabel}</option>
    `;
    if (currentValue && currentValue !== "__new__" && items.includes(currentValue)) {
        select.value = currentValue;
    }
}

function updateBrandDropdowns() { fillManagedDropdown("puzzleBrand", "brands", "Add a new brand…"); }
function updateThemeDropdowns() { fillManagedDropdown("puzzleTheme", "themes", "Add a new theme…"); }

function handleBrandChange() {
    const select = document.getElementById('puzzleBrand');
    const customInput = document.getElementById('puzzleBrandCustom');
    
    if (select.value === '__new__') {
        customInput.style.display = 'block';
        customInput.focus();
    } else {
        customInput.style.display = 'none';
        customInput.value = '';
    }
}

function handleThemeChange() {
    const select = document.getElementById('puzzleTheme');
    const customInput = document.getElementById('puzzleThemeCustom');
    
    if (select.value === '__new__') {
        customInput.style.display = 'block';
        customInput.focus();
    } else {
        customInput.style.display = 'none';
        customInput.value = '';
    }
}

// Backup and Restore
async function backupData() {
    try {
        const [puzzlesData, settingsData, wishlistData, themeData] = await Promise.all([
            apiRequest('/api/puzzles'),
            apiRequest('/api/settings'),
            apiRequest('/api/wishlist'),
            apiRequest('/api/theme')
        ]);
        
        const data = {
            puzzles: puzzlesData,
            settings: settingsData,
            wishlist: wishlistData,
            theme: themeData,
            exportDate: new Date().toISOString()
        };
        
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `puzzle-inventory-backup-${todayLocal()}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        // Revoking straight away cancels the download in Safari
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        
        showAlert('Backup created successfully!');
    } catch (error) {
        console.error('Backup failed:', error);
        showAlert('Backup failed: ' + error.message, 'error');
    }
}

function restoreData() {
    document.getElementById('restoreFileInput').click();
}

async function handleRestoreFile(event) {
    const file = event.target.files[0];
    event.target.value = "";
    if (!file) return;

    let data;
    try {
        data = JSON.parse(await file.text());
    } catch {
        showAlert("That file could not be read as a backup (invalid JSON)", "error");
        return;
    }
    if (!data || !Array.isArray(data.puzzles)) {
        showAlert("That file does not look like a Puzzle Inventory backup", "error");
        return;
    }

    const wishlistCount = Array.isArray(data.wishlist) ? data.wishlist.length : 0;
    if (!confirm(`Replace ALL current data with this backup?\n\nThe backup has ${data.puzzles.length} puzzles and ${wishlistCount} wishlist items.\nA copy of your current data is saved on the server first.`)) {
        return;
    }

    try {
        const result = await apiRequest("/api/restore", { method: "POST", body: JSON.stringify(data) });
        await Promise.all([loadSettings(), loadTheme(), loadWishlist(), loadPuzzles()]);
        showDashboard();
        const wishlistText = result.wishlist === null ? "your current wishlist was kept (the backup had none)" : `${result.wishlist} wishlist items`;
        showAlert(`Restored ${result.puzzles} puzzles and ${wishlistText}. Previous data was saved to ${result.previousDataSavedTo} on the server.`);
    } catch (error) {
        console.error("Restore failed:", error);
    }
}

// ---------------------------------------------------------------------------
// Appearance: gray tone + accent color (saved on the server so every device
// matches) and dark mode (per device).
// ---------------------------------------------------------------------------

const DEFAULT_ACCENT = '#4e5d6c';
// Colors from the old purple/gradient themes; anyone still on one gets the new default
const LEGACY_THEME_COLORS = ['#667eea', '#f093fb', '#4facfe', '#43e97b', '#fa709a', '#30cfd0', '#a8edea', '#ff9a56'];

let appearance = { accent: DEFAULT_ACCENT, tone: 'warm' };

async function loadTheme() {
    try {
        const theme = await apiRequest('/api/theme');
        const accent = /^#[0-9a-f]{6}$/i.test(theme.primary || '') ? theme.primary.toLowerCase() : DEFAULT_ACCENT;
        appearance = {
            accent: LEGACY_THEME_COLORS.includes(accent) ? DEFAULT_ACCENT : accent,
            tone: theme.tone === 'cool' ? 'cool' : 'warm'
        };
    } catch (error) {
        console.error('Failed to load theme:', error);
    }
    applyAppearance();
    updateDarkModeButtons(document.documentElement.classList.contains('dark-mode'));
}

function applyAppearance() {
    const root = document.documentElement;
    root.style.setProperty('--accent', appearance.accent);
    if (appearance.tone === 'cool') root.dataset.tone = 'cool';
    else delete root.dataset.tone;
    try { localStorage.setItem('tone', appearance.tone); } catch (e) { /* ignore */ }

    document.querySelectorAll('#toneOptions .tone-option').forEach(btn => {
        btn.setAttribute('aria-pressed', String(btn.dataset.tone === appearance.tone));
    });
    document.querySelectorAll('#accentSwatches .swatch').forEach(btn => {
        btn.setAttribute('aria-pressed', String(btn.dataset.accent === appearance.accent));
    });
    const picker = document.getElementById('primaryColorPicker');
    if (picker) picker.value = appearance.accent;
    updateThemeColorMeta();
}

// Phone browser bars match the app bar
function updateThemeColorMeta() {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = getComputedStyle(document.documentElement).getPropertyValue('--surface').trim() || '#f5f4f2';
}

async function saveAppearance() {
    try {
        await apiRequest('/api/theme', {
            method: 'PUT',
            body: JSON.stringify({ primary: appearance.accent, secondary: appearance.accent, tone: appearance.tone })
        });
    } catch (error) {
        console.error('Failed to save appearance:', error);
    }
}

function setTone(tone) {
    appearance.tone = tone === 'cool' ? 'cool' : 'warm';
    applyAppearance();
    saveAppearance();
}

function setAccent(color) {
    if (!/^#[0-9a-f]{6}$/i.test(color)) return;
    appearance.accent = color.toLowerCase();
    applyAppearance();
    saveAppearance();
}

function toggleDarkMode() {
    const isDark = document.documentElement.classList.toggle('dark-mode');
    try { localStorage.setItem('darkMode', isDark ? '1' : '0'); } catch (e) { /* ignore */ }
    updateDarkModeButtons(isDark);
    updateThemeColorMeta();
}

function updateDarkModeButtons(isDark) {
    const settingsBtn = document.getElementById('darkModeSettingsBtn');
    if (settingsBtn) settingsBtn.textContent = isDark ? 'Turn off dark mode' : 'Turn on dark mode';
}

// Navigation functions
function showDashboard() {
    document.getElementById('dashboard').classList.add('active');
    document.getElementById('settingsPage').classList.remove('active');
    document.getElementById('puzzleDetail').classList.remove('active');
    document.getElementById('wishlistPage').classList.remove('active');
    document.getElementById('welcomeScreen').style.display = 'none';
    
    document.getElementById('homeNavBtn').classList.add('active');
    document.getElementById('settingsNavBtn').classList.remove('active');
    document.getElementById('wishlistNavBtn').classList.remove('active');
    
    currentPuzzleId = null;
    renderPuzzleList();
    renderDashboard();
    revealContent();
}

function showSettings() {
    document.getElementById('dashboard').classList.remove('active');
    document.getElementById('settingsPage').classList.add('active');
    document.getElementById('puzzleDetail').classList.remove('active');
    document.getElementById('wishlistPage').classList.remove('active');
    document.getElementById('welcomeScreen').style.display = 'none';
    
    document.getElementById('homeNavBtn').classList.remove('active');
    document.getElementById('settingsNavBtn').classList.add('active');
    document.getElementById('wishlistNavBtn').classList.remove('active');
    
    currentPuzzleId = null;
    renderPuzzleList();
    
    // Render settings lists
    renderBrandsList();
    renderThemesList();
    renderSeriesList();
    revealContent();
}

// Render dashboard
function renderDashboard() {
    if (puzzlesLoadFailed) {
        document.getElementById('dashboardStats').innerHTML = '';
        document.getElementById('recentPuzzleGrid').innerHTML = LOAD_FAILED_HTML;
        return;
    }
    const allLogs = puzzles.flatMap(p => p.logs || []);
    const totalHours = allLogs.reduce((sum, log) => sum + (log.time || 0), 0);
    const ratedPuzzles = puzzles.filter(p => p.rating > 0);
    const avgRating = ratedPuzzles.length
        ? (ratedPuzzles.reduce((sum, p) => sum + p.rating, 0) / ratedPuzzles.length).toFixed(1)
        : '–';

    const stats = [
        [puzzles.length, puzzles.length === 1 ? 'puzzle' : 'puzzles'],
        [formatPieces(puzzles.reduce((sum, p) => sum + (p.pieces || 0), 0)), 'pieces'],
        [allLogs.length, allLogs.length === 1 ? 'completion' : 'completions'],
        [totalHours > 0 ? formatTime(totalHours).split(' ').slice(0, 2).join(' ') : '–', 'spent puzzling'],
        [avgRating, 'average rating'],
        [puzzles.filter(p => p.donated).length, 'donated']
    ];
    const statsContainer = document.getElementById('dashboardStats');
    if (statsContainer) {
        statsContainer.innerHTML = stats.map(([value, label]) => `
            <div class="stat"><span class="value">${value}</span><span class="label">${label}</span></div>
        `).join('');
    }

    const gridContainer = document.getElementById('recentPuzzleGrid');
    if (!gridContainer) return;
    const recent = [...puzzles].sort((a, b) => b.id - a.id).slice(0, 8);
    if (recent.length === 0) {
        gridContainer.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1;">
                <h3>No puzzles yet</h3>
                <p>Add your first one and it will show up here.</p>
                <button class="btn btn-primary" style="margin-top: 12px;" onclick="showAddPuzzleModal()">Add puzzle</button>
            </div>
        `;
        return;
    }
    gridContainer.innerHTML = recent.map(puzzle => `
        <button type="button" class="puzzle-card" onclick="showPuzzleDetail(${puzzle.id})">
            ${puzzleThumbnail(puzzle, 'photo')}
            <h4>${escapeHtml(puzzle.name)}</h4>
            <p class="meta">${formatPieces(puzzle.pieces)} pieces${puzzle.brand ? ', ' + escapeHtml(puzzle.brand) : ''}</p>
            ${puzzle.rating > 0 ? starsHtml(puzzle.rating) : ''}
            ${puzzle.donated ? '<div><span class="tag">Donated</span></div>' : ''}
        </button>
    `).join('');
}


// API helper functions
async function apiRequest(url, options = {}) {
    try {
        const response = await fetch(url, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            }
        });

        if (!response.ok) {
            let errorMessage = 'Request failed';
            try {
                const error = await response.json();
                errorMessage = error.error || errorMessage;
            } catch (e) {
                errorMessage = `${response.status} ${response.statusText}`;
            }
            throw new Error(errorMessage);
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('API Error:', url, error);
        showAlert('Error: ' + error.message, 'error');
        throw error;
    }
}

// Show alert
function showAlert(message, type = 'success') {
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type}`;
    alertDiv.textContent = message;
    
    const contentArea = document.querySelector('.content-area');
    contentArea.insertBefore(alertDiv, contentArea.firstChild);
    
    setTimeout(() => alertDiv.remove(), 5000);
}

// Load all puzzles
async function loadPuzzles() {
    try {
        puzzles = await apiRequest('/api/puzzles');
        puzzlesLoadFailed = false;
    } catch (error) {
        console.error('Failed to load puzzles:', error);
        puzzlesLoadFailed = true;
    }
    renderPuzzleList();
}

const LOAD_FAILED_HTML = `
    <div class="empty-state" style="grid-column: 1 / -1;">
        <h3>Couldn't load your puzzles</h3>
        <p>Your puzzles are safe, but the server didn't send them. Check that it's running, then reload the page.</p>
    </div>
`;

// Show modal
function showModal(modalId) {
    document.getElementById(modalId).classList.add('active');
}

// Close modal
function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

// Show add puzzle modal
function showAddPuzzleModal() {
    editingPuzzleId = null;
    convertingWishlistId = null;
    document.getElementById('puzzleModalTitle').textContent = 'Add puzzle';
    document.getElementById('puzzleName').value = '';
    
    updateBrandDropdowns();
    document.getElementById('puzzleBrand').value = '';
    document.getElementById('puzzleBrandCustom').value = '';
    document.getElementById('puzzleBrandCustom').style.display = 'none';
    
    document.getElementById('puzzlePieces').value = '';
    
    updateThemeDropdowns();
    document.getElementById('puzzleTheme').value = '';
    document.getElementById('puzzleThemeCustom').value = '';
    document.getElementById('puzzleThemeCustom').style.display = 'none';
    
    updateSeriesDropdowns();
    document.getElementById('puzzleSeries').value = '';
    document.getElementById('puzzleSeriesCustom').value = '';
    document.getElementById('puzzleSeriesCustom').style.display = 'none';
    
    document.getElementById('puzzleLocation').value = '';
    document.getElementById('puzzlePurchasedFrom').value = '';
    document.getElementById('puzzleArtist').value = '';
    document.getElementById('puzzleSize').value = '';
    document.getElementById('puzzleCutStyle').value = '';
    document.getElementById('puzzleModalMissingCount').value = '';
    document.getElementById('puzzleModalMissingCountWrap').style.display = 'none';
    document.getElementById('puzzleModalNotes').value = '';
    document.getElementById('puzzleModalCondition').value = '';
    document.getElementById('puzzleModalPassesPickup').checked = false;
    document.getElementById('puzzleModalMissingPieces').checked = false;
    document.getElementById('puzzleModalDust').value = '';
    document.getElementById('puzzleModalDonated').checked = false;
    currentRating = 0;
    updateModalRatingDisplay();
    
    // Reset image upload
    document.getElementById('puzzleModalImage').value = '';
    document.getElementById('initialLogSection').style.display = '';
    
    // Reset initial log fields
    document.getElementById('addInitialLog').checked = false;
    document.getElementById('initialLogFields').style.display = 'none';
    document.getElementById('initialLogDate').value = '';
    document.getElementById('initialLogHours').value = '0';
    document.getElementById('initialLogMinutes').value = '0';
    document.getElementById('initialLogSeconds').value = '0';
    document.getElementById('initialLogNotes').value = '';
    initialLogRating = 0;
    updateInitialLogRatingDisplay();

    showModal('puzzleModal');
}

// Edit puzzle
function editPuzzle() {
    const puzzle = puzzles.find(p => p.id === currentPuzzleId);
    if (!puzzle) return;

    editingPuzzleId = currentPuzzleId;
    convertingWishlistId = null;
    document.getElementById('puzzleModalTitle').textContent = 'Edit puzzle';
    ['puzzleBrandCustom', 'puzzleThemeCustom', 'puzzleSeriesCustom'].forEach(id => {
        document.getElementById(id).value = '';
        document.getElementById(id).style.display = 'none';
    });
    document.getElementById('puzzleName').value = puzzle.name;
    
    // Handle brand dropdown
    updateBrandDropdowns();
    if (puzzle.brand && settings.brands.includes(puzzle.brand)) {
        document.getElementById('puzzleBrand').value = puzzle.brand;
    } else if (puzzle.brand) {
        document.getElementById('puzzleBrand').value = '__new__';
        document.getElementById('puzzleBrandCustom').value = puzzle.brand;
        document.getElementById('puzzleBrandCustom').style.display = 'block';
    }
    
    document.getElementById('puzzlePieces').value = puzzle.pieces;
    
    // Handle theme dropdown
    updateThemeDropdowns();
    if (puzzle.theme && settings.themes.includes(puzzle.theme)) {
        document.getElementById('puzzleTheme').value = puzzle.theme;
    } else if (puzzle.theme) {
        document.getElementById('puzzleTheme').value = '__new__';
        document.getElementById('puzzleThemeCustom').value = puzzle.theme;
        document.getElementById('puzzleThemeCustom').style.display = 'block';
    }
    
    // Handle series dropdown
    updateSeriesDropdowns();
    if (puzzle.series && settings.series && settings.series.includes(puzzle.series)) {
        document.getElementById('puzzleSeries').value = puzzle.series;
    } else if (puzzle.series) {
        document.getElementById('puzzleSeries').value = '__new__';
        document.getElementById('puzzleSeriesCustom').value = puzzle.series;
        document.getElementById('puzzleSeriesCustom').style.display = 'block';
    }
    
    document.getElementById('puzzleLocation').value = puzzle.location || '';
    document.getElementById('puzzlePurchasedFrom').value = puzzle.purchasedFrom || '';
    document.getElementById('puzzleArtist').value = puzzle.artist || '';
    document.getElementById('puzzleSize').value = puzzle.size || '';
    setSelectValue('puzzleCutStyle', puzzle.cutStyle || '');
    document.getElementById('puzzleModalMissingCount').value = puzzle.missingPieceCount || '';
    document.getElementById('puzzleModalMissingCountWrap').style.display = puzzle.missingPieces ? 'flex' : 'none';
    document.getElementById('puzzleModalNotes').value = puzzle.notes || '';
    setSelectValue('puzzleModalCondition', puzzle.condition || '');
    document.getElementById('puzzleModalPassesPickup').checked = puzzle.passesPickup || false;
    document.getElementById('puzzleModalMissingPieces').checked = puzzle.missingPieces || false;
    setSelectValue('puzzleModalDust', puzzle.puzzleDust || '');
    document.getElementById('puzzleModalDonated').checked = puzzle.donated || false;
    currentRating = puzzle.rating || 0;
    updateModalRatingDisplay();

    // Photos chosen here are added to the puzzle; the initial log only applies to new puzzles
    document.getElementById('puzzleModalImage').value = '';
    document.getElementById('initialLogSection').style.display = 'none';
    document.getElementById('addInitialLog').checked = false;
    showModal('puzzleModal');
}

// Upload image files to a puzzle. Throws with the server's message on failure.
async function uploadImages(puzzleId, files, extraFields = {}) {
    const formData = new FormData();
    for (const file of files) formData.append("images", file, file.name || "photo.jpg");
    for (const [key, value] of Object.entries(extraFields)) formData.append(key, value);
    const response = await fetch(`/api/puzzles/${puzzleId}/images`, { method: "POST", body: formData });
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || `${response.status} ${response.statusText}`);
    }
    return response.json();
}

function readManagedSelect(selectId, customId, addFn) {
    let value = document.getElementById(selectId).value;
    if (value === "__new__") {
        value = document.getElementById(customId).value.trim();
        if (value) addFn(value);
    }
    return value || "";
}

// Save puzzle
async function savePuzzle(event) {
    event.preventDefault();

    const isEdit = Boolean(editingPuzzleId);
    const wasConversion = !isEdit && Boolean(convertingWishlistId);
    const addLog = !isEdit && document.getElementById("addInitialLog").checked;
    if (addLog && !document.getElementById("initialLogDate").value) {
        showAlert("Please enter a completion date for the initial log", "error");
        return;
    }

    const btn = document.getElementById("savePuzzleBtn");
    btn.disabled = true;
    btn.innerHTML = "<span class=\"loading\"></span> Saving...";

    const puzzleData = {
        name: document.getElementById("puzzleName").value.trim(),
        brand: readManagedSelect("puzzleBrand", "puzzleBrandCustom", addBrand),
        pieces: parseInt(document.getElementById("puzzlePieces").value, 10),
        theme: readManagedSelect("puzzleTheme", "puzzleThemeCustom", addTheme),
        series: readManagedSelect("puzzleSeries", "puzzleSeriesCustom", addSeries),
        location: document.getElementById("puzzleLocation").value,
        purchasedFrom: document.getElementById("puzzlePurchasedFrom").value,
        artist: document.getElementById("puzzleArtist").value,
        size: document.getElementById("puzzleSize").value,
        cutStyle: document.getElementById("puzzleCutStyle").value,
        missingPieceCount: document.getElementById("puzzleModalMissingPieces").checked
            ? parseInt(document.getElementById("puzzleModalMissingCount").value, 10) || 0
            : 0,
        rating: currentRating,
        notes: document.getElementById("puzzleModalNotes").value,
        condition: document.getElementById("puzzleModalCondition").value,
        passesPickup: document.getElementById("puzzleModalPassesPickup").checked,
        missingPieces: document.getElementById("puzzleModalMissingPieces").checked,
        puzzleDust: document.getElementById("puzzleModalDust").value,
        donated: document.getElementById("puzzleModalDonated").checked
    };
    const imageFiles = Array.from(document.getElementById("puzzleModalImage").files || []);

    try {
        let puzzleId;
        if (isEdit) {
            await apiRequest(`/api/puzzles/${editingPuzzleId}`, { method: "PUT", body: JSON.stringify(puzzleData) });
            puzzleId = editingPuzzleId;
        } else {
            const created = await apiRequest("/api/puzzles", { method: "POST", body: JSON.stringify(puzzleData) });
            puzzleId = created.id;
        }
        currentPuzzleId = puzzleId;

        // The puzzle is saved at this point. Problems with photos or the initial
        // log are reported, but the modal still closes so saving again cannot
        // create a duplicate puzzle.
        const problems = [];
        if (imageFiles.length) {
            try {
                await uploadImages(puzzleId, imageFiles);
            } catch (error) {
                problems.push(`Photos were not saved: ${error.message}`);
            }
        }
        if (!isEdit && convertingWishlistId) {
            try {
                await apiRequest(`/api/wishlist/${convertingWishlistId}`, { method: "DELETE" });
                await loadWishlist();
            } catch (error) {
                problems.push(`It is still on the wishlist (${error.message}).`);
            }
            convertingWishlistId = null;
        }
        if (addLog) {
            const logData = {
                date: document.getElementById("initialLogDate").value,
                time: timeToHours(
                    parseInt(document.getElementById("initialLogHours").value, 10) || 0,
                    parseInt(document.getElementById("initialLogMinutes").value, 10) || 0,
                    parseInt(document.getElementById("initialLogSeconds").value, 10) || 0
                ),
                rating: initialLogRating,
                notes: document.getElementById("initialLogNotes").value
            };
            try {
                await apiRequest(`/api/puzzles/${puzzleId}/logs`, { method: "POST", body: JSON.stringify(logData) });
            } catch (error) {
                problems.push(`The completion log was not saved: ${error.message}`);
            }
        }

        await loadPuzzles();
        closeModal("puzzleModal");
        await showPuzzleDetail(puzzleId);

        if (problems.length) {
            showAlert(`Puzzle saved, but: ${problems.join(" ")} You can add them from the puzzle page.`, "error");
        } else {
            showAlert(isEdit ? "Puzzle updated successfully!" : (wasConversion ? "Moved from wishlist to your collection!" : "Puzzle created successfully!"));
        }
    } catch (error) {
        // The puzzle itself was not saved; leave the modal open so nothing typed is lost
        console.error("Failed to save puzzle:", error);
    } finally {
        btn.disabled = false;
        btn.textContent = "Save puzzle";
    }
}

// Delete puzzle
async function deletePuzzle() {
    if (!confirm('Are you sure you want to delete this puzzle? This will also delete all associated images and logs.')) return;

    try {
        await apiRequest(`/api/puzzles/${currentPuzzleId}`, {
            method: 'DELETE'
        });

        showAlert('Puzzle deleted successfully!');
        await loadPuzzles();
        
        // Return to dashboard
        showDashboard();
    } catch (error) {
        console.error('Failed to delete puzzle:', error);
    }
}

// ---------------------------------------------------------------------------
// Puzzle list: search, filter and sort
// ---------------------------------------------------------------------------

const lastCompleted = p => (p.logs || []).reduce((max, l) => (l.date > max ? l.date : max), "");

const PUZZLE_SORTS = {
    newest: (a, b) => b.id - a.id,
    oldest: (a, b) => a.id - b.id,
    name: (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true }),
    piecesAsc: (a, b) => (a.pieces || 0) - (b.pieces || 0),
    piecesDesc: (a, b) => (b.pieces || 0) - (a.pieces || 0),
    rating: (a, b) => (b.rating || 0) - (a.rating || 0),
    quality: (a, b) => ((b.quality && b.quality.qualityScore) || -1) - ((a.quality && a.quality.qualityScore) || -1),
    lastDone: (a, b) => lastCompleted(b).localeCompare(lastCompleted(a)),
    timesDone: (a, b) => (b.logs || []).length - (a.logs || []).length
};

const PUZZLE_FILTERS = {
    all: () => true,
    notDone: p => !(p.logs || []).length,
    done: p => (p.logs || []).length > 0,
    kept: p => !p.donated,
    donated: p => Boolean(p.donated),
    missing: p => Boolean(p.missingPieces),
    pickup: p => Boolean(p.passesPickup)
};

// Remember sort/filter choices in this browser (storage can be unavailable)
function loadListControls() {
    try {
        const saved = JSON.parse(localStorage.getItem("listControls") || "{}");
        if (saved.sort && PUZZLE_SORTS[saved.sort]) document.getElementById("sortSelect").value = saved.sort;
        if (saved.filter && PUZZLE_FILTERS[saved.filter]) document.getElementById("filterSelect").value = saved.filter;
        if (saved.brand) document.getElementById("brandFilterSelect").dataset.pending = saved.brand;
    } catch (e) { /* ignore */ }
}

function onListControlsChange() {
    try {
        localStorage.setItem("listControls", JSON.stringify({
            sort: document.getElementById("sortSelect").value,
            filter: document.getElementById("filterSelect").value,
            brand: document.getElementById("brandFilterSelect").value
        }));
    } catch (e) { /* ignore */ }
    renderPuzzleList();
}

// Brand filter lists the brands actually used in the collection
function refreshBrandFilterOptions() {
    const select = document.getElementById("brandFilterSelect");
    const wanted = select.dataset.pending || select.value;
    delete select.dataset.pending;
    const brands = [...new Set(puzzles.map(p => p.brand).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    select.innerHTML = `<option value="">All brands</option>` +
        brands.map(b => `<option value="${escapeHtml(b)}">${escapeHtml(b)}</option>`).join("");
    select.value = brands.includes(wanted) ? wanted : "";
}

function getVisiblePuzzles() {
    const query = document.getElementById("searchBox").value.trim().toLowerCase();
    const filter = PUZZLE_FILTERS[document.getElementById("filterSelect").value] || PUZZLE_FILTERS.all;
    const sort = PUZZLE_SORTS[document.getElementById("sortSelect").value] || PUZZLE_SORTS.newest;
    const brand = document.getElementById("brandFilterSelect").value;

    return puzzles
        .filter(p => !query || [p.name, p.brand, p.theme, p.series, p.artist].some(v => v && String(v).toLowerCase().includes(query)))
        .filter(p => !brand || p.brand === brand)
        .filter(filter)
        .sort(sort);
}

function puzzleThumbnail(puzzle, className) {
    const images = puzzle.images || [];
    if (!images.length) return `<div class="${className}">${pieceIcon()}</div>`;
    const index = Math.min(puzzle.thumbnailIndex || 0, images.length - 1);
    return `<img src="${escapeHtml(images[index])}" alt="" class="${className}" loading="lazy">`;
}

function renderPuzzleList() {
    const listContainer = document.getElementById("puzzleList");
    const countEl = document.getElementById("listCount");
    refreshBrandFilterOptions();

    if (puzzlesLoadFailed) {
        countEl.textContent = "";
        listContainer.innerHTML = LOAD_FAILED_HTML;
        return;
    }

    if (!puzzles || puzzles.length === 0) {
        countEl.textContent = "";
        listContainer.innerHTML = `
            <div class="empty-state">
                <h3>No puzzles yet</h3>
                <p>Use Add puzzle to start your collection.</p>
            </div>
        `;
        return;
    }

    const list = getVisiblePuzzles();
    const browseCount = document.getElementById("mobileBrowseCount");
    if (browseCount) browseCount.textContent = list.length === puzzles.length ? `(${puzzles.length})` : `(${list.length} of ${puzzles.length})`;
    countEl.textContent = list.length === puzzles.length
        ? `${puzzles.length} puzzle${puzzles.length === 1 ? "" : "s"}`
        : `Showing ${list.length} of ${puzzles.length}`;

    if (list.length === 0) {
        listContainer.innerHTML = `
            <div class="empty-state">
                <h3>No matches</h3>
                <p>Try a different search, or set the filters back to All.</p>
            </div>
        `;
        return;
    }

    listContainer.innerHTML = list.map(puzzle => `
        <div class="puzzle-item ${puzzle.id === currentPuzzleId ? "active" : ""}" onclick="showPuzzleDetail(${puzzle.id})">
            ${puzzleThumbnail(puzzle, "puzzle-item-thumbnail")}
            <div class="puzzle-item-info">
                <h3>${escapeHtml(puzzle.name)}</h3>
                <p>${formatPieces(puzzle.pieces)} pieces${puzzle.brand ? ", " + escapeHtml(puzzle.brand) : ""}</p>
            </div>
        </div>
    `).join("");
}

// Show puzzle detail
async function showPuzzleDetail(puzzleId) {
    currentPuzzleId = puzzleId;
    
    try {
        const puzzle = await apiRequest(`/api/puzzles/${puzzleId}`);
        
        // Update puzzles array
        const index = puzzles.findIndex(p => p.id === puzzleId);
        if (index !== -1) {
            puzzles[index] = puzzle;
        }

        // Hide dashboard, wishlist and settings, show detail
        document.getElementById('dashboard').classList.remove('active');
        document.getElementById('settingsPage').classList.remove('active');
        document.getElementById('wishlistPage').classList.remove('active');
        document.getElementById('welcomeScreen').style.display = 'none';
        document.getElementById('puzzleDetail').classList.add('active');
        
        // Update nav buttons
        document.getElementById('homeNavBtn').classList.remove('active');
        document.getElementById('settingsNavBtn').classList.remove('active');
        document.getElementById('wishlistNavBtn').classList.remove('active');

        document.getElementById('puzzleTitle').textContent = puzzle.name;

        renderOverview(puzzle);
        renderImages(puzzle);
        renderLogs(puzzle);
        renderNotes(puzzle);
        renderStats(puzzle);
        renderPuzzleList();
        revealContent();
    } catch (error) {
        console.error('Failed to load puzzle details:', error);
    }
}

// Render overview: the photo on the left, the key facts beside it, details below
function renderOverview(puzzle) {
    const images = puzzle.images || [];
    const cover = images.length ? images[Math.min(puzzle.thumbnailIndex || 0, images.length - 1)] : null;
    const photo = cover
        ? `<img src="${escapeHtml(cover)}" alt="${escapeHtml(puzzle.name)}" class="overview-photo" onclick="openLightbox(this.src)">`
        : `<div class="overview-photo">${pieceIcon()}<p>No photos yet</p><label for="imageInput" class="btn btn-secondary btn-small">Add photos</label></div>`;

    const logs = puzzle.logs || [];
    const last = lastCompleted(puzzle);
    const doneLine = logs.length
        ? `Done ${logs.length === 1 ? 'once' : logs.length + ' times'}, most recently ${longDate(last)}`
        : 'Not done yet';

    const tags = [];
    if (puzzle.missingPieces) tags.push(`<span class="tag tag-danger">${puzzle.missingPieceCount > 0 ? plural(puzzle.missingPieceCount, 'piece') + ' missing' : 'Missing pieces'}</span>`);
    if (puzzle.passesPickup) tags.push('<span class="tag tag-ok">Passes pickup test</span>');
    if (puzzle.donated) tags.push('<span class="tag">Donated</span>');
    const qualityScore = Number(puzzle.quality && puzzle.quality.qualityScore) || 0;
    if (qualityScore > 0) tags.push(`<span class="tag">Quality ${qualityScore} of 100</span>`);

    const row = (label, value) => value ? `<dt>${label}</dt><dd>${escapeHtml(value)}</dd>` : '';
    const about = [
        row('Brand', puzzle.brand),
        row('Theme', puzzle.theme),
        row('Series', puzzle.series),
        row('Artist', puzzle.artist),
        row('Finished size', puzzle.size),
        row('Cut style', puzzle.cutStyle)
    ].join('');
    const condition = puzzle.condition ? puzzle.condition.charAt(0).toUpperCase() + puzzle.condition.slice(1) : '';
    const keeping = [
        row('Stored in', puzzle.location),
        row('Got it from', puzzle.purchasedFrom),
        row('Condition', condition),
        row('Puzzle dust', puzzle.puzzleDust),
        row('Added', puzzle.createdAt ? new Date(puzzle.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '')
    ].join('');
    const custom = (puzzle.customFields || []).map(f => row(escapeHtml(f.name), f.value)).join('');

    document.getElementById('puzzleOverview').innerHTML = `
        <div class="overview">
            ${photo}
            <div class="overview-key">
                <div class="pieces">${formatPieces(puzzle.pieces)}</div>
                <div class="pieces-label">pieces</div>
                ${puzzle.rating > 0 ? starsHtml(puzzle.rating) : '<p class="muted" style="margin-top: 14px;">Not rated yet</p>'}
                <p class="done-line">${doneLine}</p>
                ${tags.length ? `<div class="status-tags">${tags.join('')}</div>` : ''}
                ${about ? `<dl class="details-list">${about}</dl>` : ''}
                ${keeping || custom ? `<dl class="details-list">${keeping}${custom}</dl>` : ''}
                ${puzzle.notes ? `<p class="overview-notes">${escapeHtml(puzzle.notes)}</p>` : ''}
            </div>
        </div>
    `;
}

// After a photo change, refresh everything that shows photos
function renderPhotos(puzzle) {
    renderOverview(puzzle);
    renderImages(puzzle);
    renderStats(puzzle);
    renderPuzzleList();
}

// Handle image upload
async function handleImageUpload(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (files.length === 0) return;

    try {
        await uploadImages(currentPuzzleId, files);
        showAlert(files.length === 1 ? 'Photo added' : `${files.length} photos added`);
        renderPhotos(await refreshPuzzle());
    } catch (error) {
        console.error("Failed to upload images:", error);
        showAlert(`Failed to upload images: ${error.message}`, "error");
    }
}

// Render images
function renderImages(puzzle) {
    const gallery = document.getElementById('imageGallery');
    
    if (!puzzle.images || puzzle.images.length === 0) {
        gallery.innerHTML = '<p class="muted">No photos yet. The first one you add becomes the cover.</p>';
        return;
    }

    gallery.innerHTML = puzzle.images.map((img, index) => {
        const isThumbnail = index === (puzzle.thumbnailIndex || 0);
        const thumbnailBadge = isThumbnail ? '<span class="badge-thumb">Cover</span>' : '';

        return `
            <div class="image-item" data-img-index="${index}" onclick="openLightboxByIndex(${index})">
                ${thumbnailBadge}
                <img src="${escapeHtml(img)}" alt="Puzzle image ${index + 1}">
                <div class="image-actions">
                    ${!isThumbnail ? `<button class="image-btn" onclick="event.stopPropagation(); setThumbnail(${index})" title="Use as cover" aria-label="Use as cover">★</button>` : ''}
                    <button class="image-btn" onclick="event.stopPropagation(); openImageEditorByIndex(${index})" title="Rotate" aria-label="Rotate">↻</button>
                    <button class="image-btn delete-image" onclick="event.stopPropagation(); deleteImage(${index})" title="Delete" aria-label="Delete photo">&times;</button>
                </div>
            </div>
        `;
    }).join('');
    // Store image URLs for safe access from onclick handlers
    gallery._imageUrls = puzzle.images.slice();
}

// Delete image
async function deleteImage(index) {
    if (!confirm('Delete this image?')) return;
    
    try {
        await apiRequest(`/api/puzzles/${currentPuzzleId}/images/${index}`, {
            method: 'DELETE'
        });

        showAlert('Photo deleted');
        renderPhotos(await refreshPuzzle());
    } catch (error) {
        console.error('Failed to delete image:', error);
    }
}

// Show add log modal
function showAddLogModal() {
    editingLogId = null;
    document.getElementById('logModalTitle').textContent = 'Log a completion';
    document.getElementById('logDate').value = todayLocal();
    document.getElementById('logHours').value = '0';
    document.getElementById('logMinutes').value = '0';
    document.getElementById('logSeconds').value = '0';
    document.getElementById('logNotes').value = '';
    currentLogRating = 0;
    updateLogRatingDisplay();
    showModal('logModal');
}

// Helper function to convert hours/minutes/seconds to total hours
function timeToHours(hours, minutes, seconds) {
    return parseFloat(hours) + (parseFloat(minutes) / 60) + (parseFloat(seconds) / 3600);
}

// Helper function to convert total hours to hours/minutes/seconds
function hoursToTime(totalHours) {
    // Round to whole seconds first; splitting the float directly can give "0m 60s"
    const totalSeconds = Math.round((Number(totalHours) || 0) * 3600);
    return {
        hours: Math.floor(totalSeconds / 3600),
        minutes: Math.floor((totalSeconds % 3600) / 60),
        seconds: totalSeconds % 60
    };
}

// Format time for display
function formatTime(totalHours) {
    const { hours, minutes, seconds } = hoursToTime(totalHours);
    const parts = [];
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);
    return parts.join(' ');
}

// Save log
async function saveLog(event) {
    event.preventDefault();

    const hours = parseInt(document.getElementById('logHours').value) || 0;
    const minutes = parseInt(document.getElementById('logMinutes').value) || 0;
    const seconds = parseInt(document.getElementById('logSeconds').value) || 0;
    
    const totalHours = timeToHours(hours, minutes, seconds);

    const logData = {
        date: document.getElementById('logDate').value,
        time: totalHours,
        rating: currentLogRating,
        notes: document.getElementById('logNotes').value
    };

    try {
        if (editingLogId) {
            // Update existing log
            await apiRequest(`/api/puzzles/${currentPuzzleId}/logs/${editingLogId}`, {
                method: 'PUT',
                body: JSON.stringify(logData)
            });
            showAlert('Completion log updated successfully!');
            editingLogId = null;
        } else {
            // Create new log
            await apiRequest(`/api/puzzles/${currentPuzzleId}/logs`, {
                method: 'POST',
                body: JSON.stringify(logData)
            });
            showAlert('Completion log added successfully!');
        }

        const puzzle = await refreshPuzzle();
        renderLogs(puzzle);
        renderStats(puzzle);
        closeModal('logModal');
    } catch (error) {
        console.error('Failed to save log:', error);
    }
}

// Render logs
function renderLogs(puzzle) {
    const logList = document.getElementById('logList');
    
    if (!puzzle.logs || puzzle.logs.length === 0) {
        logList.innerHTML = '<p class="muted">No completions yet. Log one each time you finish it.</p>';
        return;
    }

    const sortedLogs = [...puzzle.logs].sort((a, b) => b.date.localeCompare(a.date));

    logList.innerHTML = sortedLogs.map(log => {
        const timeFormatted = log.time > 0 ? formatTime(log.time) : "Not timed";
        const logStars = log.rating > 0
            ? `<span class="log-stars">${starsHtml(log.rating)}</span>`
            : "";
        
        return `
            <div class="log-item">
                <div class="log-item-header">
                    <div class="log-item-date">${parseLocalDate(log.date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
                    <div class="log-item-time">${timeFormatted}</div>
                </div>
                ${logStars}
                ${log.notes ? `<p class="log-notes">${escapeHtml(log.notes)}</p>` : ''}
                <div class="log-actions">
                    <button class="btn btn-secondary btn-small" onclick="editLog(${log.id})">Edit</button>
                    <button class="btn btn-danger btn-small" onclick="deleteLog(${log.id})">Delete</button>
                </div>
            </div>
        `;
    }).join('');
}

// Delete log
async function deleteLog(logId) {
    if (!confirm('Delete this log?')) return;
    
    try {
        await apiRequest(`/api/puzzles/${currentPuzzleId}/logs/${logId}`, {
            method: 'DELETE'
        });

        showAlert('Log deleted successfully!');
        const puzzle = await refreshPuzzle();
        renderLogs(puzzle);
        renderStats(puzzle);
    } catch (error) {
        console.error('Failed to delete log:', error);
    }
}

// Update puzzle notes
async function updatePuzzleNotes() {
    const notes = document.getElementById('puzzleNotes').value;

    try {
        await apiRequest(`/api/puzzles/${currentPuzzleId}/notes`, {
            method: 'PUT',
            body: JSON.stringify({ notes })
        });

        showAlert('Notes updated successfully!');
        renderOverview(await refreshPuzzle());
    } catch (error) {
        console.error('Failed to update notes:', error);
    }
}

// Update puzzle dust
async function updatePuzzleDust() {
    const puzzleDust = document.getElementById('puzzleDust').value;

    try {
        await apiRequest(`/api/puzzles/${currentPuzzleId}/puzzle-dust`, {
            method: 'PUT',
            body: JSON.stringify({ puzzleDust })
        });

        showAlert('Puzzle dust level updated!');
        
        // Refresh puzzle data
        const puzzle = await refreshPuzzle();
        renderOverview(puzzle);
    } catch (error) {
        console.error('Failed to update puzzle dust:', error);
    }
}

// Update donation status
async function updateDonationStatus() {
    const donated = document.getElementById('puzzleDonated').checked;

    try {
        await apiRequest(`/api/puzzles/${currentPuzzleId}/donated`, {
            method: 'PUT',
            body: JSON.stringify({ donated })
        });

        showAlert(donated ? 'Marked as donated!' : 'Donation status removed');
        
        // Refresh puzzle data
        const puzzle = await refreshPuzzle();
        renderOverview(puzzle);
        renderStats(puzzle);
    } catch (error) {
        console.error('Failed to update donation status:', error);
    }
}

// Render notes
function renderNotes(puzzle) {
    setSelectValue('puzzleCondition', puzzle.condition || '');
    document.getElementById('puzzlePassesPickup').checked = puzzle.passesPickup || false;
    document.getElementById('puzzleMissingPieces').checked = puzzle.missingPieces || false;
    document.getElementById('puzzleMissingCount').value = puzzle.missingPieceCount || '';
    document.getElementById('puzzleMissingCountWrap').style.display = puzzle.missingPieces ? 'flex' : 'none';
    document.getElementById('puzzleNotes').value = puzzle.notes || '';
    setSelectValue('puzzleDust', puzzle.puzzleDust || '');
    document.getElementById('puzzleDonated').checked = puzzle.donated || false;
    loadQualityData(puzzle);
    renderCustomFields(puzzle);
}

// Show add custom field modal
function showAddCustomFieldModal() {
    document.getElementById('customFieldName').value = '';
    document.getElementById('customFieldValue').value = '';
    showModal('customFieldModal');
}

// Save custom field
async function saveCustomField(event) {
    event.preventDefault();

    const fieldData = {
        name: document.getElementById('customFieldName').value,
        value: document.getElementById('customFieldValue').value
    };

    try {
        await apiRequest(`/api/puzzles/${currentPuzzleId}/custom-fields`, {
            method: 'POST',
            body: JSON.stringify(fieldData)
        });

        showAlert('Custom field added');
        const puzzle = await refreshPuzzle();
        renderCustomFields(puzzle);
        renderOverview(puzzle);
        closeModal('customFieldModal');
    } catch (error) {
        console.error('Failed to save custom field:', error);
    }
}

// Render custom fields
function renderCustomFields(puzzle) {
    const container = document.getElementById('customFields');
    
    if (!puzzle.customFields || puzzle.customFields.length === 0) {
        container.innerHTML = '<p class="muted">None yet. Use these for anything the form doesn\'t cover.</p>';
        return;
    }

    container.innerHTML = puzzle.customFields.map(field => `
        <div class="custom-field-item">
            <div>
                <span class="name">${escapeHtml(field.name)}</span>${escapeHtml(field.value)}
            </div>
            <button class="btn btn-danger btn-small" onclick="deleteCustomField(${field.id})">Remove</button>
        </div>
    `).join('');
}

// Delete custom field
async function deleteCustomField(fieldId) {
    try {
        await apiRequest(`/api/puzzles/${currentPuzzleId}/custom-fields/${fieldId}`, {
            method: 'DELETE'
        });

        showAlert('Custom field removed');
        const puzzle = await refreshPuzzle();
        renderCustomFields(puzzle);
        renderOverview(puzzle);
    } catch (error) {
        console.error('Failed to delete custom field:', error);
    }
}

// Render statistics
function renderStats(puzzle) {
    const logs = puzzle.logs || [];
    const timed = logs.filter(l => l.time > 0);
    const rated = logs.filter(l => l.rating > 0);
    const totalTime = timed.reduce((sum, log) => sum + log.time, 0);
    const avgTime = timed.length ? totalTime / timed.length : 0;
    const fastestTime = timed.length ? Math.min(...timed.map(l => l.time)) : 0;
    const avgRating = rated.length ? (rated.reduce((sum, l) => sum + l.rating, 0) / rated.length).toFixed(1) : null;

    const none = "–";
    document.getElementById("statsGrid").innerHTML = `
        <div class="stat-card"><h3>${logs.length}</h3><p>Times completed</p></div>
        <div class="stat-card"><h3>${timed.length ? formatTime(totalTime) : none}</h3><p>Total time</p></div>
        <div class="stat-card"><h3>${avgTime ? formatTime(avgTime) : none}</h3><p>Average time</p></div>
        <div class="stat-card"><h3>${fastestTime ? formatTime(fastestTime) : none}</h3><p>Fastest time</p></div>
        <div class="stat-card"><h3>${avgRating || none}</h3><p>Average rating</p></div>
        <div class="stat-card"><h3>${(puzzle.images || []).length}</h3><p>Photos</p></div>
        <div class="stat-card"><h3>${puzzle.donated ? "Yes" : "No"}</h3><p>Donated</p></div>
        <div class="stat-card"><h3>${puzzle.puzzleDust ? escapeHtml(puzzle.puzzleDust) : none}</h3><p>Puzzle dust</p></div>
    `;
}

// Switch tab
function switchTab(tabName) {
    document.querySelectorAll(".tab").forEach(tab => {
        tab.classList.toggle("active", tab.getAttribute("onclick") === `switchTab('${tabName}')`);
    });
    document.querySelectorAll(".tab-content").forEach(content => content.classList.remove("active"));
    document.getElementById(tabName + "Tab").classList.add("active");
}

// Set modal rating
function setModalRating(rating) {
    currentRating = rating;
    updateModalRatingDisplay();
}

function updateModalRatingDisplay() {
    document.querySelectorAll('#modalRating .star').forEach((star, index) => {
        star.classList.toggle('filled', index < currentRating);
    });
}

// Set log rating
function setLogRating(rating) {
    currentLogRating = rating;
    updateLogRatingDisplay();
}

function updateLogRatingDisplay() {
    document.querySelectorAll('#logRating .star').forEach((star, index) => {
        star.classList.toggle('filled', index < currentLogRating);
    });
}

// Search puzzles
function searchPuzzles() {
    renderPuzzleList();
}

// Initialize app
loadListControls();

if ("serviceWorker" in navigator && window.isSecureContext) {
    navigator.serviceWorker.register("/sw.js").catch(err => console.warn("Service worker not registered:", err));
}

// Each loader handles its own errors, so one failure doesn't stop the rest
Promise.all([loadTheme(), loadSettings(), loadWishlist(), loadPuzzles()]).then(renderDashboard);

// Toggle initial log fields
function toggleInitialLogFields() {
    const checkbox = document.getElementById('addInitialLog');
    const fields = document.getElementById('initialLogFields');
    fields.style.display = checkbox.checked ? 'block' : 'none';
    
    if (checkbox.checked) {
        document.getElementById('initialLogDate').value = todayLocal();
    }
}

// Set initial log rating
function setInitialLogRating(rating) {
    initialLogRating = rating;
    updateInitialLogRatingDisplay();
}

function updateInitialLogRatingDisplay() {
    document.querySelectorAll('#initialLogRating .star').forEach((star, index) => {
        star.classList.toggle('filled', index < initialLogRating);
    });
}

// Update condition
async function updatePuzzleCondition() {
    const condition = document.getElementById('puzzleCondition').value;

    try {
        await apiRequest(`/api/puzzles/${currentPuzzleId}/condition`, {
            method: 'PUT',
            body: JSON.stringify({ condition })
        });

        showAlert('Condition updated!');
        
        const puzzle = await refreshPuzzle();
        renderOverview(puzzle);
    } catch (error) {
        console.error('Failed to update condition:', error);
    }
}

// Update passes pickup test
async function updatePassesPickup() {
    const passesPickup = document.getElementById('puzzlePassesPickup').checked;

    try {
        await apiRequest(`/api/puzzles/${currentPuzzleId}/passes-pickup`, {
            method: 'PUT',
            body: JSON.stringify({ passesPickup })
        });

        showAlert(passesPickup ? 'Marked as passing pickup test!' : 'Pickup test status removed');
        
        const puzzle = await refreshPuzzle();
        renderOverview(puzzle);
    } catch (error) {
        console.error('Failed to update passes pickup:', error);
    }
}

// Image lightbox functions
function openLightbox(imageSrc) {
    document.getElementById('lightboxImage').src = imageSrc;
    document.getElementById('imageLightbox').classList.add('active');
}

function openLightboxByIndex(index) {
    const gallery = document.getElementById('imageGallery');
    const src = gallery._imageUrls && gallery._imageUrls[index];
    if (src) openLightbox(src);
}

function openImageEditorByIndex(index) {
    const gallery = document.getElementById('imageGallery');
    const src = gallery._imageUrls && gallery._imageUrls[index];
    if (src) openImageEditor(src, index);
}

function closeLightbox() {
    document.getElementById('imageLightbox').classList.remove('active');
}

// Image editor functions
function openImageEditor(imageSrc, imageIndex) {
    currentEditingImage = imageSrc;
    currentEditingImageIndex = imageIndex;
    editorRotation = 0;
    
    const canvas = document.getElementById('editorCanvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    
    img.onload = function() {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
    };
    
    img.src = imageSrc;
    document.getElementById('imageEditor').classList.add('active');
}

function closeImageEditor() {
    document.getElementById('imageEditor').classList.remove('active');
    currentEditingImage = null;
    currentEditingImageIndex = null;
    editorRotation = 0;
}

function rotateImage(degrees) {
    editorRotation += degrees;
    const canvas = document.getElementById('editorCanvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    
    img.onload = function() {
        // Swap dimensions if rotating 90 or 270 degrees
        if (Math.abs(editorRotation % 180) === 90) {
            canvas.width = img.height;
            canvas.height = img.width;
        } else {
            canvas.width = img.width;
            canvas.height = img.height;
        }
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.save();
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate((editorRotation * Math.PI) / 180);
        ctx.drawImage(img, -img.width / 2, -img.height / 2);
        ctx.restore();
    };
    
    img.src = currentEditingImage;
}

async function saveEditedImage() {
    const canvas = document.getElementById('editorCanvas');
    
    try {
        // Convert canvas to blob
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
        
        await uploadImages(currentPuzzleId, [blob], { replaceIndex: currentEditingImageIndex });
        showAlert('Photo saved');
        closeImageEditor();
        renderPhotos(await refreshPuzzle());
    } catch (error) {
        console.error('Failed to save edited image:', error);
        showAlert(`Could not save the photo: ${error.message}`, 'error');
    }
}

// Set thumbnail
async function setThumbnail(imageIndex) {
    try {
        await apiRequest(`/api/puzzles/${currentPuzzleId}/thumbnail`, {
            method: 'PUT',
            body: JSON.stringify({ thumbnailIndex: imageIndex })
        });
        
        showAlert('Cover photo changed');
        renderPhotos(await refreshPuzzle());
    } catch (error) {
        console.error('Failed to set thumbnail:', error);
    }
}

// Toggle quality section
function toggleQualitySection() {
    const section = document.getElementById('qualitySection');
    const toggle = document.getElementById('qualityToggle');
    if (section.style.display === 'none') {
        section.style.display = 'block';
        toggle.textContent = '▼';
    } else {
        section.style.display = 'none';
        toggle.textContent = '►';
    }
}

// Calculate and update quality score
async function updateQualityScore() {
    const getRadioValue = (name) => {
        const radio = document.querySelector(`input[name="${name}"]:checked`);
        return radio ? parseInt(radio.value) : 0;
    };
    
    const fit = getRadioValue('pieceFit');
    const cut = getRadioValue('cutQuality');
    const image = parseInt(document.getElementById('imageSharpness').value);
    const thickness = getRadioValue('thickness');
    const finish = getRadioValue('finish');
    const shapeVariety = getRadioValue('shapeVariety');
    const falseFits = getRadioValue('falseFits');
    const color = getRadioValue('colorQuality');
    const alignment = getRadioValue('alignment');
    const packaging = parseInt(document.getElementById('packaging').value);
    
    const qualityScore = Math.round(
        (fit / 5) * 20 +
        (cut / 5) * 15 +
        (image / 5) * 15 +
        (thickness / 5) * 10 +
        (finish / 5) * 10 +
        (shapeVariety / 5) * 10 +
        (falseFits / 5) * 10 +
        (color / 5) * 5 +
        (alignment / 5) * 3 +
        (packaging / 5) * 2
    );
    
    document.getElementById('qualityScoreDisplay').textContent = qualityScore;
    
    // Save to server if we're viewing a puzzle
    if (currentPuzzleId) {
        const qualityData = {
            pieceFit: fit,
            cutQuality: cut,
            imageSharpness: image,
            thickness: thickness,
            finish: finish,
            shapeVariety: shapeVariety,
            falseFits: falseFits,
            colorQuality: color,
            alignment: alignment,
            packaging: packaging,
            qualityScore: qualityScore
        };
        
        try {
            await apiRequest(`/api/puzzles/${currentPuzzleId}/quality`, {
                method: 'PUT',
                body: JSON.stringify(qualityData)
            });
            renderOverview(await refreshPuzzle());
        } catch (error) {
            console.error('Failed to save quality data:', error);
        }
    }
}

// Load quality data into form. Always resets first so values from the
// previously viewed puzzle never carry over and get saved to this one.
function loadQualityData(puzzle) {
    const q = puzzle.quality || {};
    document.querySelectorAll("#qualitySection input[type=radio]").forEach(r => { r.checked = false; });
    ["pieceFit", "cutQuality", "thickness", "finish", "shapeVariety", "falseFits", "colorQuality", "alignment"].forEach(name => {
        if (!q[name]) return;
        const radio = document.querySelector(`input[name="${name}"][value="${q[name]}"]`);
        if (radio) radio.checked = true;
    });
    const sharpness = q.imageSharpness || 3;
    const packaging = q.packaging || 3;
    document.getElementById("imageSharpness").value = sharpness;
    document.getElementById("imageSharpnessValue").textContent = sharpness;
    document.getElementById("packaging").value = packaging;
    document.getElementById("packagingValue").textContent = packaging;
    document.getElementById("qualityScoreDisplay").textContent = q.qualityScore || 0;
}

// Show About modal
function showAbout() {
    showModal('aboutModal');
}

// Update missing pieces
async function updateMissingPieces() {
    const missingPieces = document.getElementById('puzzleMissingPieces').checked;
    const missingPieceCount = parseInt(document.getElementById('puzzleMissingCount').value, 10) || 0;

    try {
        await apiRequest(`/api/puzzles/${currentPuzzleId}/missing-pieces`, {
            method: 'PUT',
            body: JSON.stringify({ missingPieces, missingPieceCount })
        });

        showAlert(missingPieces ? 'Marked as having missing pieces' : 'Missing pieces status removed');
        
        const puzzle = await refreshPuzzle();
        renderOverview(puzzle);
    } catch (error) {
        console.error('Failed to update missing pieces:', error);
    }
}

// Edit log
let editingLogId = null;

function editLog(logId) {
    const puzzle = puzzles.find(p => p.id === currentPuzzleId);
    const log = puzzle.logs.find(l => l.id === logId);
    if (!log) return;
    
    editingLogId = logId;
    
    // Populate form with existing data
    document.getElementById('logModalTitle').textContent = 'Edit completion';
    document.getElementById('logDate').value = log.date;
    
    const { hours, minutes, seconds } = hoursToTime(log.time);
    document.getElementById('logHours').value = hours;
    document.getElementById('logMinutes').value = minutes;
    document.getElementById('logSeconds').value = seconds;
    document.getElementById('logNotes').value = log.notes || '';
    currentLogRating = log.rating || 0;
    updateLogRatingDisplay();

    showModal('logModal');
}

// Handle series dropdown change
function handleSeriesChange() {
    const seriesSelect = document.getElementById('puzzleSeries');
    const customInput = document.getElementById('puzzleSeriesCustom');
    
    if (seriesSelect.value === '__new__') {
        customInput.style.display = 'block';
        customInput.focus();
    } else {
        customInput.style.display = 'none';
    }
}

function updateSeriesDropdowns() { fillManagedDropdown("puzzleSeries", "series", "Add a new series…"); }
const addSeries = series => addManagedItem("series", series);
const removeSeries = series => removeManagedItem("series", series);
function renderSeriesList() { renderManagedList("seriesList", "series", "No series yet."); }


// ---------------------------------------------------------------------------
// Wishlist: "Got it" moves an item into the collection
// ---------------------------------------------------------------------------


// Sets a brand/theme/series dropdown, using the "new" box for values not in the list
function setManagedSelect(selectId, customId, value) {
    const select = document.getElementById(selectId);
    const custom = document.getElementById(customId);
    const inList = value && [...select.options].some(o => o.value === value && o.value !== "__new__");
    select.value = inList ? value : (value ? "__new__" : "");
    custom.value = inList ? "" : (value || "");
    custom.style.display = !inList && value ? "block" : "none";
}

function convertWishlistItem(id) {
    const item = wishlistItems.find(w => w.id === id);
    if (!item) return;

    showAddPuzzleModal();
    convertingWishlistId = id;
    document.getElementById("puzzleModalTitle").textContent = "Add to collection";
    document.getElementById("puzzleName").value = item.name || "";
    document.getElementById("puzzlePieces").value = parseInt(item.pieces, 10) || "";
    setManagedSelect("puzzleBrand", "puzzleBrandCustom", item.brand || "");
    setManagedSelect("puzzleTheme", "puzzleThemeCustom", item.theme || "");
    document.getElementById("puzzlePurchasedFrom").value = item.whereToBuy || "";
    document.getElementById("puzzleModalNotes").value = item.notes || "";
}

// ---------------------------------------------------------------------------
// Pick one for me
// ---------------------------------------------------------------------------


function showPickModal() {
    document.getElementById("pickResult").innerHTML = "";
    showModal("pickModal");
}

function pickRandomPuzzle() {
    const min = parseInt(document.getElementById("pickMin").value, 10) || 0;
    const max = parseInt(document.getElementById("pickMax").value, 10) || Infinity;
    const notDone = document.getElementById("pickNotDone").checked;
    const skipDonated = document.getElementById("pickSkipDonated").checked;
    const skipMissing = document.getElementById("pickSkipMissing").checked;

    const candidates = puzzles.filter(p =>
        (p.pieces || 0) >= min &&
        (p.pieces || 0) <= max &&
        (!notDone || !(p.logs || []).length) &&
        (!skipDonated || !p.donated) &&
        (!skipMissing || !p.missingPieces)
    );

    const result = document.getElementById("pickResult");
    if (candidates.length === 0) {
        result.innerHTML = `<p class="pick-count">No puzzles match. Try a wider piece range or untick a box.</p>`;
        return;
    }

    // Avoid picking the same puzzle twice in a row when there is a choice
    const pool = candidates.length > 1 ? candidates.filter(p => p.id !== lastPickedId) : candidates;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    lastPickedId = pick.id;

    const timesDone = (pick.logs || []).length;
    result.innerHTML = `
        <div class="pick-card">
            ${puzzleThumbnail(pick, "pick-photo")}
            <div style="min-width: 0;">
                <h3>${escapeHtml(pick.name)}</h3>
                <p>${formatPieces(pick.pieces)} pieces${pick.brand ? ", " + escapeHtml(pick.brand) : ""}</p>
                <p>${timesDone ? `Done ${timesDone === 1 ? "once" : timesDone + " times"}` : "Not done yet"}${pick.location ? `. In the ${escapeHtml(pick.location)}` : ""}</p>
            </div>
        </div>
        <p class="pick-count">Picked from ${plural(candidates.length, "matching puzzle")}</p>
        <div class="form-row">
            <button class="btn btn-secondary" onclick="pickRandomPuzzle()">Pick again</button>
            <button class="btn btn-primary" onclick="closeModal('pickModal'); showPuzzleDetail(${pick.id})">Open puzzle</button>
        </div>
    `;
}

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------

function csvCell(value) {
    let text = value == null ? "" : String(value);
    // Stop spreadsheet apps from treating text as a formula
    if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadCsv(filename, headers, rows) {
    const lines = [headers, ...rows].map(row => row.map(csvCell).join(","));
    // Byte order mark so Excel opens UTF-8 (accents, emoji) correctly
    const blob = new Blob(["\ufeff" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const csvTime = hours => (hours > 0 ? formatTime(hours) : "");
const yesNo = v => (v ? "Yes" : "No");

async function exportPuzzlesCsv() {
    try {
        const data = await apiRequest("/api/puzzles");
        const headers = [
            "Name", "Brand", "Pieces", "Theme", "Series/Set", "Artist", "Finished Size", "Cut Style",
            "Storage Location", "Source", "Rating", "Condition", "Passes Pickup Test", "Missing Pieces",
            "Missing Piece Count", "Puzzle Dust", "Donated", "Quality Score", "Times Completed",
            "Last Completed", "Fastest Time", "Average Time", "Images", "Notes", "Date Added"
        ];
        const rows = data.map(p => {
            const timed = (p.logs || []).filter(l => l.time > 0);
            const fastest = timed.length ? Math.min(...timed.map(l => l.time)) : 0;
            const average = timed.length ? timed.reduce((s, l) => s + l.time, 0) / timed.length : 0;
            return [
                p.name, p.brand, p.pieces, p.theme, p.series, p.artist, p.size, p.cutStyle,
                p.location, p.purchasedFrom, p.rating || "", p.condition, yesNo(p.passesPickup), yesNo(p.missingPieces),
                p.missingPieceCount || "", p.puzzleDust, yesNo(p.donated), (p.quality && p.quality.qualityScore) || "",
                (p.logs || []).length, lastCompleted(p), csvTime(fastest), csvTime(average), (p.images || []).length,
                p.notes, p.createdAt ? p.createdAt.slice(0, 10) : ""
            ];
        });
        downloadCsv(`puzzles-${todayLocal()}.csv`, headers, rows);
        showAlert(`Exported ${rows.length} puzzles`);
    } catch (error) {
        console.error("CSV export failed:", error);
    }
}

async function exportWishlistCsv() {
    try {
        const data = await apiRequest("/api/wishlist");
        const headers = ["Name", "Brand", "Pieces", "Theme", "Priority", "Price", "Where to Buy", "Link", "Notes", "Date Added"];
        const rows = data.map(w => [
            w.name, w.brand, w.pieces, w.theme, w.priority, w.price, w.whereToBuy, w.url, w.notes,
            w.addedDate ? w.addedDate.slice(0, 10) : ""
        ]);
        downloadCsv(`wishlist-${todayLocal()}.csv`, headers, rows);
        showAlert(`Exported ${rows.length} wishlist items`);
    } catch (error) {
        console.error("CSV export failed:", error);
    }
}
