let puzzles = [];
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
}

function showAddWishlistModal() {
    editingWishlistId = null;
    document.getElementById('wishlistModalTitle').textContent = 'Add to Wishlist';
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
    document.getElementById('wishlistModalTitle').textContent = 'Edit Wishlist Item';
    document.getElementById('wishlistName').value = item.name;
    document.getElementById('wishlistBrand').value = item.brand || '';
    document.getElementById('wishlistPieces').value = item.pieces || '';
    document.getElementById('wishlistTheme').value = item.theme || '';
    document.getElementById('wishlistWhereToBuy').value = item.whereToBuy || '';
    document.getElementById('wishlistUrl').value = item.url || '';
    document.getElementById('wishlistPrice').value = item.price || '';
    document.getElementById('wishlistPriority').value = item.priority;
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
            <div style="grid-column: 1/-1; text-align: center; padding: 60px; color: #666;">
                <h3 style="font-size: 1.5em; margin-bottom: 10px;">No items in wishlist</h3>
                <p>Add puzzles you want to your wishlist!</p>
            </div>
        `;
        return;
    }
    
    // Sort by priority
    const sorted = [...wishlistItems].sort((a, b) => {
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
    
    container.innerHTML = sorted.map(item => {
        const priorityClass = `priority-${item.priority}`;
        const priorityText = item.priority.charAt(0).toUpperCase() + item.priority.slice(1);
        const priceFormatted = item.price ? `$${parseFloat(item.price).toFixed(2)} USD` : '';
        const safeUrl = item.url && /^https?:\/\//i.test(item.url) ? item.url : null;
        const urlLink = safeUrl ? `<p><strong>Link:</strong> <a href="${escapeHtml(safeUrl)}" target="_blank" style="color: var(--primary-color); text-decoration: underline;">View Product</a></p>` : '';

        return `
            <div class="wishlist-card">
                <h3>${escapeHtml(item.name)}</h3>
                ${item.brand ? `<p><strong>Brand:</strong> ${escapeHtml(item.brand)}</p>` : ''}
                ${item.pieces ? `<p><strong>Pieces:</strong> ${escapeHtml(String(item.pieces))}</p>` : ''}
                ${item.theme ? `<p><strong>Theme:</strong> ${escapeHtml(item.theme)}</p>` : ''}
                ${item.whereToBuy ? `<p><strong>Where to Buy:</strong> ${escapeHtml(item.whereToBuy)}</p>` : ''}
                ${urlLink}
                ${priceFormatted ? `<p><strong>Price:</strong> ${escapeHtml(priceFormatted)}</p>` : ''}
                ${item.notes ? `<p style="margin-top: 10px;"><em>${escapeHtml(item.notes)}</em></p>` : ''}
                <div style="margin-top: 15px; display: flex; gap: 10px; flex-wrap: wrap;">
                    <button class="btn btn-success" style="padding: 8px 16px; font-size: 14px;" onclick="convertWishlistItem(${item.id})" title="Move this puzzle into your collection">✓ Got It</button>
                    <button class="btn btn-secondary" style="padding: 8px 16px; font-size: 14px;" onclick="editWishlistItem(${item.id})">Edit</button>
                    <button class="btn btn-danger" style="padding: 8px 16px; font-size: 14px;" onclick="deleteWishlistItem(${item.id})">Remove</button>
                </div>
                <span class="priority ${priorityClass}">${escapeHtml(priorityText)} Priority</span>
            </div>
        `;
    }).join('');
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

// Settings saves are chained so rapid adds (brand + theme + series in one
// save) reach the server in order and none get lost.
let settingsSaveChain = Promise.resolve();
function saveSettings() {
    settingsSaveChain = settingsSaveChain
        .then(() => apiRequest("/api/settings", { method: "PUT", body: JSON.stringify(settings) }))
        .catch(error => console.error("Failed to save settings:", error));
    return settingsSaveChain;
}

function addManagedItem(kind, value) {
    const item = (value || "").trim();
    if (!settings[kind]) settings[kind] = [];
    if (!item || settings[kind].includes(item)) return false;
    settings[kind].push(item);
    settings[kind].sort((a, b) => a.localeCompare(b));
    saveSettings();
    return true;
}

function removeManagedItem(kind, value) {
    settings[kind] = (settings[kind] || []).filter(v => v !== value);
    saveSettings();
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
        container.innerHTML = `<p style="color: #666;">${emptyText}</p>`;
        return;
    }
    container.innerHTML = items.map((item, index) => `
        <div class="custom-field-item">
            <div><strong>${escapeHtml(item)}</strong></div>
            <button class="btn btn-danger" style="padding: 6px 12px; font-size: 14px;" onclick="deleteManagedItem('${kind}', ${index})">Delete</button>
        </div>
    `).join("");
}

function renderBrandsList() { renderManagedList("brandsList", "brands", "No brands defined yet."); }
function renderThemesList() { renderManagedList("themesList", "themes", "No themes defined yet."); }

function fillManagedDropdown(selectId, kind, addLabel) {
    const select = document.getElementById(selectId);
    if (!select) return;
    const currentValue = select.value;
    const items = settings[kind] || [];
    select.innerHTML = `
        <option value="">Select or type new...</option>
        ${items.map(item => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join("")}
        <option value="__new__">${addLabel}</option>
    `;
    if (currentValue && currentValue !== "__new__" && items.includes(currentValue)) {
        select.value = currentValue;
    }
}

function updateBrandDropdowns() { fillManagedDropdown("puzzleBrand", "brands", "+ Add New Brand"); }
function updateThemeDropdowns() { fillManagedDropdown("puzzleTheme", "themes", "+ Add New Theme"); }

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
        a.click();
        URL.revokeObjectURL(url);
        
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
        showAlert(`Restored ${result.puzzles} puzzles and ${result.wishlist} wishlist items. Previous data was saved to ${result.previousDataSavedTo} on the server.`);
    } catch (error) {
        console.error("Restore failed:", error);
    }
}

// Theme management
async function loadTheme() {
    try {
        const theme = await apiRequest('/api/theme');
        applyThemeStyles(theme.primary, theme.secondary);
    } catch (error) {
        console.error('Failed to load theme:', error);
        applyThemeStyles('#667eea', '#764ba2');
    }
    // Restore dark mode from localStorage
    if (localStorage.getItem('darkMode') === '1') {
        document.body.classList.add('dark-mode');
        updateDarkModeButtons(true);
    }
}

function toggleDarkMode() {
    const isDark = document.body.classList.toggle('dark-mode');
    localStorage.setItem('darkMode', isDark ? '1' : '0');
    updateDarkModeButtons(isDark);
}

function updateDarkModeButtons(isDark) {
    const settingsBtn = document.getElementById('darkModeSettingsBtn');
    if (settingsBtn) settingsBtn.textContent = isDark ? '☀️ Disable Dark Mode' : '🌙 Enable Dark Mode';
}

function applyThemeStyles(primaryColor, secondaryColor) {
    // Convert hex to RGB
    const hexToRgb = (hex) => {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : null;
    };

    const primaryRgb = hexToRgb(primaryColor);
    const secondaryRgb = hexToRgb(secondaryColor);

    document.documentElement.style.setProperty('--primary-color', primaryColor);
    document.documentElement.style.setProperty('--secondary-color', secondaryColor);
    document.documentElement.style.setProperty('--primary-rgb', `${primaryRgb.r}, ${primaryRgb.g}, ${primaryRgb.b}`);
    document.documentElement.style.setProperty('--secondary-rgb', `${secondaryRgb.r}, ${secondaryRgb.g}, ${secondaryRgb.b}`);

    // Update color pickers if they exist
    const primaryPicker = document.getElementById('primaryColorPicker');
    const primaryText = document.getElementById('primaryColorText');
    const secondaryPicker = document.getElementById('secondaryColorPicker');
    const secondaryText = document.getElementById('secondaryColorText');
    
    if (primaryPicker) primaryPicker.value = primaryColor;
    if (primaryText) primaryText.value = primaryColor;
    if (secondaryPicker) secondaryPicker.value = secondaryColor;
    if (secondaryText) secondaryText.value = secondaryColor;
}

async function applyTheme(primaryColor, secondaryColor) {
    applyThemeStyles(primaryColor, secondaryColor);
    
    // Save to server
    try {
        await apiRequest('/api/theme', {
            method: 'PUT',
            body: JSON.stringify({ primary: primaryColor, secondary: secondaryColor })
        });
    } catch (error) {
        console.error('Failed to save theme:', error);
    }
}

function updateThemeColor(type, color) {
    if (!color.startsWith('#')) {
        color = '#' + color.replace(/[^0-9a-f]/gi, '');
    }
    
    const primaryColor = type === 'primary' ? color : document.getElementById('primaryColorPicker').value;
    const secondaryColor = type === 'secondary' ? color : document.getElementById('secondaryColorPicker').value;
    
    applyTheme(primaryColor, secondaryColor);
}

function applyPresetTheme(primary, secondary) {
    applyTheme(primary, secondary);
    showAlert('Theme applied successfully!');
}

function resetTheme() {
    applyTheme('#667eea', '#764ba2');
    showAlert('Theme reset to default!');
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
}

// Render dashboard
function renderDashboard() {
    
    const totalPuzzles = puzzles.length;
    const totalPieces = puzzles.reduce((sum, p) => sum + (p.pieces || 0), 0);
    const allLogs = puzzles.flatMap(p => p.logs || []);
    const totalCompletions = allLogs.length;
    const totalHours = allLogs.reduce((sum, log) => sum + (log.time || 0), 0);
    const ratedPuzzles = puzzles.filter(p => p.rating > 0);
    const avgRating = ratedPuzzles.length
        ? (ratedPuzzles.reduce((sum, p) => sum + p.rating, 0) / ratedPuzzles.length).toFixed(1)
        : 0;
    const donatedCount = puzzles.filter(p => p.donated).length;

    const statsContainer = document.getElementById('dashboardStats');
    if (statsContainer) {
        statsContainer.innerHTML = `
            <div class="dashboard-stat-card">
                <h3>${totalPuzzles}</h3>
                <p>Total Puzzles</p>
            </div>
            <div class="dashboard-stat-card">
                <h3>${totalPieces.toLocaleString()}</h3>
                <p>Total Pieces</p>
            </div>
            <div class="dashboard-stat-card">
                <h3>${totalCompletions}</h3>
                <p>Completions</p>
            </div>
            <div class="dashboard-stat-card">
                <h3>${formatTime(totalHours)}</h3>
                <p>Time Spent</p>
            </div>
            <div class="dashboard-stat-card">
                <h3>${avgRating || 'N/A'}</h3>
                <p>Avg Rating</p>
            </div>
            <div class="dashboard-stat-card">
                <h3>${donatedCount}</h3>
                <p>Donated Puzzles</p>
            </div>
        `;
    }

    // Show recent puzzles (last 6)
    const recentPuzzles = [...puzzles].reverse().slice(0, 6);
    
    const gridContainer = document.getElementById('recentPuzzleGrid');
    if (gridContainer) {
        if (recentPuzzles.length === 0) {
            gridContainer.innerHTML = `
                <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: #666;">
                    <p>No puzzles yet. Add your first puzzle to get started!</p>
                </div>
            `;
        } else {
            gridContainer.innerHTML = recentPuzzles.map(puzzle => {
                const thumbnailIndex = Math.min(puzzle.thumbnailIndex || 0, (puzzle.images && puzzle.images.length > 0 ? puzzle.images.length - 1 : 0));
                const thumbnail = puzzle.images && puzzle.images.length > 0
                    ? `<img src="${escapeHtml(puzzle.images[thumbnailIndex])}" alt="${escapeHtml(puzzle.name)}" class="recent-puzzle-image">`
                    : `<div class="recent-puzzle-image">🧩</div>`;

                const stars = '★'.repeat(puzzle.rating || 0) + '☆'.repeat(5 - (puzzle.rating || 0));
                const donatedBadge = puzzle.donated ? '<span style="background: #28a745; color: white; padding: 4px 8px; border-radius: 4px; font-size: 0.8em; margin-top: 5px; display: inline-block;">✓ Donated</span>' : '';

                return `
                    <div class="recent-puzzle-card" onclick="showPuzzleDetail(${puzzle.id})">
                        ${thumbnail}
                        <div class="recent-puzzle-info">
                            <h4>${escapeHtml(puzzle.name)}</h4>
                            <p><strong>${escapeHtml(String(puzzle.pieces))} pieces</strong></p>
                            ${puzzle.brand ? `<p>${escapeHtml(puzzle.brand)}</p>` : ''}
                            <p style="color: #ffc107; font-size: 1.1em; margin-top: 5px;">${stars}</p>
                            ${donatedBadge}
                        </div>
                    </div>
                `;
            }).join('');
        }
    }
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
        renderPuzzleList();
    } catch (error) {
        console.error('Failed to load puzzles:', error);
    }
}

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
    document.getElementById('puzzleModalTitle').textContent = 'Add New Puzzle';
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
    document.getElementById('puzzleModalTitle').textContent = 'Edit Puzzle';
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
    document.getElementById('puzzleModalCondition').value = puzzle.condition || '';
    document.getElementById('puzzleModalPassesPickup').checked = puzzle.passesPickup || false;
    document.getElementById('puzzleModalMissingPieces').checked = puzzle.missingPieces || false;
    document.getElementById('puzzleModalDust').value = puzzle.puzzleDust || '';
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
async function uploadImages(puzzleId, files) {
    const formData = new FormData();
    for (const file of files) formData.append("images", file);
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
        btn.textContent = "Save Puzzle";
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
    if (!images.length) return `<div class="${className}">🧩</div>`;
    const index = Math.min(puzzle.thumbnailIndex || 0, images.length - 1);
    return `<img src="${escapeHtml(images[index])}" alt="${escapeHtml(puzzle.name)}" class="${className}" loading="lazy">`;
}

function renderPuzzleList() {
    const listContainer = document.getElementById("puzzleList");
    const countEl = document.getElementById("listCount");
    refreshBrandFilterOptions();

    if (!puzzles || puzzles.length === 0) {
        countEl.textContent = "";
        listContainer.innerHTML = `
            <div class="empty-state">
                <h3>No puzzles yet</h3>
                <p>Add your first puzzle to get started!</p>
            </div>
        `;
        return;
    }

    const list = getVisiblePuzzles();
    countEl.textContent = list.length === puzzles.length
        ? `${puzzles.length} puzzle${puzzles.length === 1 ? "" : "s"}`
        : `Showing ${list.length} of ${puzzles.length}`;

    if (list.length === 0) {
        listContainer.innerHTML = `
            <div class="empty-state">
                <h3>No matches found</h3>
                <p>Try a different search or filter</p>
            </div>
        `;
        return;
    }

    listContainer.innerHTML = list.map(puzzle => `
        <div class="puzzle-item ${puzzle.id === currentPuzzleId ? "active" : ""}" onclick="showPuzzleDetail(${puzzle.id})">
            ${puzzleThumbnail(puzzle, "puzzle-item-thumbnail")}
            <div class="puzzle-item-info">
                <h3>${escapeHtml(puzzle.name)}</h3>
                <p>${escapeHtml(String(puzzle.pieces))} pieces${puzzle.brand ? " • " + escapeHtml(puzzle.brand) : ""}</p>
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
    } catch (error) {
        console.error('Failed to load puzzle details:', error);
    }
}

// Render overview
function renderOverview(puzzle) {
    const stars = '★'.repeat(puzzle.rating || 0) + '☆'.repeat(5 - (puzzle.rating || 0));
    const donated = puzzle.donated ? '<span style="color: #28a745; font-weight: 600;">✓ Donated</span>' : '<span style="color: #666;">Not donated</span>';
    const condition = puzzle.condition ? puzzle.condition.charAt(0).toUpperCase() + puzzle.condition.slice(1) : 'Not specified';
    const passesPickup = puzzle.passesPickup ? '<span style="color: #28a745; font-weight: 600;">✓ Yes</span>' : '<span style="color: #666;">Not tested</span>';
    const missingCountText = puzzle.missingPieceCount > 0 ? ` (${puzzle.missingPieceCount} missing)` : '';
    const missingPieces = puzzle.missingPieces ? `<span style="color: #dc3545; font-weight: 600;">⚠ Yes${missingCountText}</span>` : '<span style="color: #28a745;">✓ Complete</span>';
    const qualityScore = puzzle.quality?.qualityScore || 'Not rated';
    const qualityDisplay = typeof qualityScore === 'number' ? 
        `<span style="font-size: 24px; font-weight: bold; color: var(--primary-color);">${qualityScore}/100</span>` : 
        qualityScore;
    
    document.getElementById('puzzleOverview').innerHTML = `
        <div style="font-size: 18px; line-height: 1.8;">
            <p><strong>Brand:</strong> ${puzzle.brand ? escapeHtml(puzzle.brand) : 'Not specified'}</p>
            <p><strong>Pieces:</strong> ${escapeHtml(String(puzzle.pieces))}</p>
            <p><strong>Theme:</strong> ${puzzle.theme ? escapeHtml(puzzle.theme) : 'Not specified'}</p>
            ${puzzle.series ? `<p><strong>Series/Set:</strong> ${escapeHtml(puzzle.series)}</p>` : ''}
            ${puzzle.artist ? `<p><strong>Artist:</strong> ${escapeHtml(puzzle.artist)}</p>` : ''}
            ${puzzle.size ? `<p><strong>Finished Size:</strong> ${escapeHtml(puzzle.size)}</p>` : ''}
            ${puzzle.cutStyle ? `<p><strong>Cut Style:</strong> ${escapeHtml(puzzle.cutStyle)}</p>` : ''}
            <p><strong>Storage Location:</strong> ${puzzle.location ? escapeHtml(puzzle.location) : 'Not specified'}</p>
            <p><strong>Source:</strong> ${puzzle.purchasedFrom ? escapeHtml(puzzle.purchasedFrom) : 'Not specified'}</p>
            <p><strong>Overall Rating:</strong> <span style="color: #ffc107; font-size: 24px;">${stars}</span></p>
            <p><strong>Times Completed:</strong> ${(puzzle.logs || []).length}</p>
            <p><strong>Condition:</strong> ${escapeHtml(condition)}</p>
            <p><strong>Passes Pickup Test:</strong> ${passesPickup}</p>
            <p><strong>Missing Pieces:</strong> ${missingPieces}</p>
            <p><strong>Puzzle Dust Level:</strong> ${puzzle.puzzleDust ? escapeHtml(puzzle.puzzleDust) : 'Not specified'}</p>
            <p><strong>Donation Status:</strong> ${donated}</p>
            <p><strong>Puzzle Quality Score:</strong> ${qualityDisplay}</p>
        </div>
    `;
}

// Handle image upload
async function handleImageUpload(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (files.length === 0) return;

    try {
        await uploadImages(currentPuzzleId, files);
        showAlert(`${files.length} image(s) uploaded successfully!`);
        const puzzle = await refreshPuzzle();
        renderImages(puzzle);
        renderStats(puzzle);
        renderPuzzleList();
    } catch (error) {
        console.error("Failed to upload images:", error);
        showAlert(`Failed to upload images: ${error.message}`, "error");
    }
}

// Render images
function renderImages(puzzle) {
    const gallery = document.getElementById('imageGallery');
    
    if (!puzzle.images || puzzle.images.length === 0) {
        gallery.innerHTML = '<p style="color: #666; margin-top: 20px;">No images added yet.</p>';
        return;
    }

    gallery.innerHTML = puzzle.images.map((img, index) => {
        const isThumbnail = index === (puzzle.thumbnailIndex || 0);
        const thumbnailBadge = isThumbnail ? '<div style="position: absolute; top: 5px; left: 5px; background: #28a745; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: 600;">THUMBNAIL</div>' : '';

        return `
            <div class="image-item" data-img-index="${index}" onclick="openLightboxByIndex(${index})">
                ${thumbnailBadge}
                <img src="${escapeHtml(img)}" alt="Puzzle image ${index + 1}">
                <div class="image-actions">
                    ${!isThumbnail ? `<button class="image-btn" onclick="event.stopPropagation(); setThumbnail(${index})" title="Set as thumbnail">⭐</button>` : ''}
                    <button class="image-btn" onclick="event.stopPropagation(); openImageEditorByIndex(${index})" title="Edit">✎</button>
                    <button class="image-btn delete-image" onclick="event.stopPropagation(); deleteImage(${index})" title="Delete">&times;</button>
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

        showAlert('Image deleted successfully!');
        const puzzle = await refreshPuzzle();
        renderImages(puzzle);
        renderStats(puzzle);
        renderPuzzleList();
    } catch (error) {
        console.error('Failed to delete image:', error);
    }
}

// Show add log modal
function showAddLogModal() {
    editingLogId = null;
    document.getElementById('logModalTitle').textContent = 'Add Completion Log';
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
    const hours = Math.floor(totalHours);
    const remainingMinutes = (totalHours - hours) * 60;
    const minutes = Math.floor(remainingMinutes);
    const seconds = Math.round((remainingMinutes - minutes) * 60);
    return { hours, minutes, seconds };
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
        logList.innerHTML = '<p style="color: #666; margin-top: 20px;">No completion logs yet.</p>';
        return;
    }

    const sortedLogs = [...puzzle.logs].sort((a, b) => b.date.localeCompare(a.date));

    logList.innerHTML = sortedLogs.map(log => {
        const timeFormatted = log.time > 0 ? formatTime(log.time) : "Not timed";
        
        return `
            <div class="log-item">
                <div class="log-item-header">
                    <div class="log-item-date">${parseLocalDate(log.date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
                    <div class="log-item-time">${timeFormatted}</div>
                </div>
                ${log.notes ? `<p style="color: #666; margin-top: 10px;">${escapeHtml(log.notes)}</p>` : ''}
                <div style="margin-top: 10px; display: flex; gap: 10px;">
                    <button class="btn btn-secondary" style="padding: 8px 16px; font-size: 14px;" onclick="editLog(${log.id})">Edit</button>
                    <button class="btn btn-danger" style="padding: 8px 16px; font-size: 14px;" onclick="deleteLog(${log.id})">Delete</button>
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
    document.getElementById('puzzleCondition').value = puzzle.condition || '';
    document.getElementById('puzzlePassesPickup').checked = puzzle.passesPickup || false;
    document.getElementById('puzzleMissingPieces').checked = puzzle.missingPieces || false;
    document.getElementById('puzzleMissingCount').value = puzzle.missingPieceCount || '';
    document.getElementById('puzzleMissingCountWrap').style.display = puzzle.missingPieces ? 'flex' : 'none';
    document.getElementById('puzzleNotes').value = puzzle.notes || '';
    document.getElementById('puzzleDust').value = puzzle.puzzleDust || '';
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

        showAlert('Custom field added successfully!');
        const puzzle = await refreshPuzzle();
        renderCustomFields(puzzle);
        closeModal('customFieldModal');
    } catch (error) {
        console.error('Failed to save custom field:', error);
    }
}

// Render custom fields
function renderCustomFields(puzzle) {
    const container = document.getElementById('customFields');
    
    if (!puzzle.customFields || puzzle.customFields.length === 0) {
        container.innerHTML = '<p style="color: #666; margin-top: 15px;">No custom fields added yet.</p>';
        return;
    }

    container.innerHTML = puzzle.customFields.map(field => `
        <div class="custom-field-item">
            <div>
                <strong>${escapeHtml(field.name)}:</strong> ${escapeHtml(field.value)}
            </div>
            <button class="btn btn-danger" style="padding: 6px 12px; font-size: 14px;" onclick="deleteCustomField(${field.id})">Delete</button>
        </div>
    `).join('');
}

// Delete custom field
async function deleteCustomField(fieldId) {
    try {
        await apiRequest(`/api/puzzles/${currentPuzzleId}/custom-fields/${fieldId}`, {
            method: 'DELETE'
        });

        showAlert('Custom field deleted successfully!');
        const puzzle = await refreshPuzzle();
        renderCustomFields(puzzle);
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

    document.getElementById("statsGrid").innerHTML = `
        <div class="stat-card"><h3>${logs.length}</h3><p>Times Completed</p></div>
        <div class="stat-card"><h3>${timed.length ? formatTime(totalTime) : "N/A"}</h3><p>Total Time</p></div>
        <div class="stat-card"><h3>${avgTime ? formatTime(avgTime) : "N/A"}</h3><p>Average Time</p></div>
        <div class="stat-card"><h3>${fastestTime ? formatTime(fastestTime) : "N/A"}</h3><p>Fastest Time</p></div>
        <div class="stat-card"><h3>${avgRating || "N/A"}</h3><p>Average Rating</p></div>
        <div class="stat-card"><h3>${(puzzle.images || []).length}</h3><p>Images</p></div>
        <div class="stat-card"><h3>${puzzle.donated ? "Yes" : "No"}</h3><p>Donated</p></div>
        <div class="stat-card"><h3>${puzzle.puzzleDust ? escapeHtml(puzzle.puzzleDust) : "N/A"}</h3><p>Puzzle Dust</p></div>
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

Promise.all([
    loadTheme().catch(err => console.error('Theme load error:', err)),
    loadSettings().catch(err => console.error('Settings load error:', err)),
    loadWishlist().catch(err => console.error('Wishlist load error:', err)),
    loadPuzzles().catch(err => console.error('Puzzles load error:', err))
]).then(() => {
    renderDashboard();
}).catch(error => {
    console.error('Critical initialization error:', error);
    // Show error in UI
    document.getElementById('puzzleList').innerHTML = `
        <div class="empty-state">
            <h3 style="color: #dc3545;">Error Loading Data</h3>
            <p>Check console for details</p>
        </div>
    `;
});

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
        
        // Upload the edited image
        const formData = new FormData();
        formData.append('images', blob, 'edited.jpg');
        formData.append('replaceIndex', currentEditingImageIndex);
        
        const response = await fetch(`/api/puzzles/${currentPuzzleId}/images`, {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) throw new Error('Failed to save edited image');
        
        showAlert('Image updated successfully!');
        closeImageEditor();
        
        // Refresh images
        const puzzle = await refreshPuzzle();
        renderImages(puzzle);
        renderPuzzleList();
    } catch (error) {
        console.error('Failed to save edited image:', error);
        showAlert('Failed to save edited image', 'error');
    }
}

// Set thumbnail
async function setThumbnail(imageIndex) {
    try {
        await apiRequest(`/api/puzzles/${currentPuzzleId}/thumbnail`, {
            method: 'PUT',
            body: JSON.stringify({ thumbnailIndex: imageIndex })
        });
        
        showAlert('Thumbnail updated!');
        
        const puzzle = await refreshPuzzle();
        renderImages(puzzle);
        renderPuzzleList();
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
    document.getElementById('logModalTitle').textContent = 'Edit Completion Log';
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

function updateSeriesDropdowns() { fillManagedDropdown("puzzleSeries", "series", "+ Add New Series/Set"); }
const addSeries = series => addManagedItem("series", series);
const removeSeries = series => removeManagedItem("series", series);
function renderSeriesList() { renderManagedList("seriesList", "series", "No series/sets added yet."); }


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
    document.getElementById("puzzleModalTitle").textContent = "Add to Collection";
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
        result.innerHTML = `<p style="text-align: center; color: #666;">No puzzles match those choices. Try loosening them.</p>`;
        return;
    }

    // Avoid picking the same puzzle twice in a row when there is a choice
    const pool = candidates.length > 1 ? candidates.filter(p => p.id !== lastPickedId) : candidates;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    lastPickedId = pick.id;

    const timesDone = (pick.logs || []).length;
    result.innerHTML = `
        <div class="pick-card">
            ${puzzleThumbnail(pick, "pick-placeholder")}
            <div style="flex: 1; min-width: 0;">
                <h3 style="margin-bottom: 4px;">${escapeHtml(pick.name)}</h3>
                <p style="color: #666;">${escapeHtml(String(pick.pieces))} pieces${pick.brand ? " • " + escapeHtml(pick.brand) : ""}</p>
                <p style="color: #666; font-size: 14px;">${timesDone ? `Done ${timesDone} time${timesDone === 1 ? "" : "s"}` : "Not done yet"}${pick.location ? " • " + escapeHtml(pick.location) : ""}</p>
            </div>
        </div>
        <p style="text-align: center; color: #888; font-size: 13px; margin: 8px 0;">Picked from ${candidates.length} matching puzzle${candidates.length === 1 ? "" : "s"}</p>
        <div style="display: flex; gap: 10px;">
            <button class="btn btn-secondary" style="flex: 1;" onclick="pickRandomPuzzle()">🎲 Pick Again</button>
            <button class="btn btn-primary" style="flex: 1;" onclick="closeModal('pickModal'); showPuzzleDetail(${pick.id})">Open Puzzle</button>
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
