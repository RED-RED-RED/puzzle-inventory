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
let editingPuzzleId = null;
let editingWishlistId = null;
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
                <div style="margin-top: 15px; display: flex; gap: 10px;">
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

async function saveSettings() {
    try {
        await apiRequest('/api/settings', {
            method: 'PUT',
            body: JSON.stringify(settings)
        });
    } catch (error) {
        console.error('Failed to save settings:', error);
    }
}

function addBrand(brand) {
    if (brand && !settings.brands.includes(brand)) {
        settings.brands.push(brand);
        settings.brands.sort();
        saveSettings();
        return true;
    }
    return false;
}

function removeBrand(brand) {
    settings.brands = settings.brands.filter(b => b !== brand);
    saveSettings();
}

function addTheme(theme) {
    if (theme && !settings.themes.includes(theme)) {
        settings.themes.push(theme);
        settings.themes.sort();
        saveSettings();
        return true;
    }
    return false;
}

function removeTheme(theme) {
    settings.themes = settings.themes.filter(t => t !== theme);
    saveSettings();
}

function renderBrandsList() {
    const container = document.getElementById('brandsList');
    if (settings.brands.length === 0) {
        container.innerHTML = '<p style="color: #666;">No brands defined yet.</p>';
    } else {
        container.innerHTML = settings.brands.map(brand => `
            <div class="custom-field-item">
                <div><strong>${brand}</strong></div>
                <button class="btn btn-danger" style="padding: 6px 12px; font-size: 14px;" onclick="removeBrand('${brand.replace(/'/g, "\\'")}'); renderBrandsList(); updateBrandDropdowns();">Delete</button>
            </div>
        `).join('');
    }
}

function renderThemesList() {
    const container = document.getElementById('themesList');
    if (settings.themes.length === 0) {
        container.innerHTML = '<p style="color: #666;">No themes defined yet.</p>';
    } else {
        container.innerHTML = settings.themes.map(theme => `
            <div class="custom-field-item">
                <div><strong>${theme}</strong></div>
                <button class="btn btn-danger" style="padding: 6px 12px; font-size: 14px;" onclick="removeTheme('${theme.replace(/'/g, "\\'")}'); renderThemesList(); updateThemeDropdowns();">Delete</button>
            </div>
        `).join('');
    }
}

function updateBrandDropdowns() {
    const select = document.getElementById('puzzleBrand');
    const currentValue = select.value;
    
    select.innerHTML = `
        <option value="">Select or type new...</option>
        ${settings.brands.map(brand => `<option value="${brand}">${brand}</option>`).join('')}
        <option value="__new__">+ Add New Brand</option>
    `;
    
    if (currentValue && currentValue !== '__new__') {
        select.value = currentValue;
    }
}

function updateThemeDropdowns() {
    const select = document.getElementById('puzzleTheme');
    const currentValue = select.value;
    
    select.innerHTML = `
        <option value="">Select or type new...</option>
        ${settings.themes.map(theme => `<option value="${theme}">${theme}</option>`).join('')}
        <option value="__new__">+ Add New Theme</option>
    `;
    
    if (currentValue && currentValue !== '__new__') {
        select.value = currentValue;
    }
}

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
        a.download = `puzzle-inventory-backup-${new Date().toISOString().split('T')[0]}.json`;
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
    if (!file) return;
    
    if (!confirm('This will replace all current data. Are you sure you want to restore from this backup?')) {
        event.target.value = '';
        return;
    }
    
    try {
        const text = await file.text();
        const data = JSON.parse(text);
        
        // Restore settings
        if (data.settings) {
            await apiRequest('/api/settings', {
                method: 'PUT',
                body: JSON.stringify(data.settings)
            });
            settings = data.settings;
        }
        
        // Restore theme
        if (data.theme && data.theme.primary && data.theme.secondary) {
            await applyTheme(data.theme.primary, data.theme.secondary);
        }
        
        // Restore wishlist
        if (data.wishlist && Array.isArray(data.wishlist)) {
            // Delete all existing wishlist items
            const existingWishlist = await apiRequest('/api/wishlist');
            for (const item of existingWishlist) {
                await apiRequest(`/api/wishlist/${item.id}`, { method: 'DELETE' });
            }
            
            // Create new wishlist items from backup
            for (const item of data.wishlist) {
                const { id, addedDate, ...itemData } = item;
                await apiRequest('/api/wishlist', {
                    method: 'POST',
                    body: JSON.stringify(itemData)
                });
            }
        }
        
        // Restore puzzles (note: this won't restore images, those need to be backed up separately)
        if (data.puzzles && Array.isArray(data.puzzles)) {
            // Delete all existing puzzles first
            const existingPuzzles = await apiRequest('/api/puzzles');
            for (const puzzle of existingPuzzles) {
                await apiRequest(`/api/puzzles/${puzzle.id}`, { method: 'DELETE' });
            }
            
            // Create new puzzles from backup
            for (const puzzle of data.puzzles) {
                const { id, images, createdAt, ...puzzleData } = puzzle;
                await apiRequest('/api/puzzles', {
                    method: 'POST',
                    body: JSON.stringify(puzzleData)
                });
            }
        }
        
        await loadPuzzles();
        await loadWishlist();
        showDashboard();
        showAlert('Data restored successfully! Note: Images need to be re-uploaded.', 'success');
    } catch (error) {
        console.error('Restore failed:', error);
        showAlert('Restore failed: ' + error.message, 'error');
    }
    
    event.target.value = '';
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
    const avgRating = puzzles.length > 0 
        ? (puzzles.reduce((sum, p) => sum + (p.rating || 0), 0) / puzzles.length).toFixed(1)
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
    document.getElementById('puzzleModalTitle').textContent = 'Edit Puzzle';
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
    document.getElementById('puzzleModalNotes').value = puzzle.notes || '';
    document.getElementById('puzzleModalCondition').value = puzzle.condition || '';
    document.getElementById('puzzleModalPassesPickup').checked = puzzle.passesPickup || false;
    document.getElementById('puzzleModalMissingPieces').checked = puzzle.missingPieces || false;
    document.getElementById('puzzleModalDust').value = puzzle.puzzleDust || '';
    document.getElementById('puzzleModalDonated').checked = puzzle.donated || false;
    currentRating = puzzle.rating || 0;
    updateModalRatingDisplay();
    showModal('puzzleModal');
}

// Save puzzle
async function savePuzzle(event) {
    event.preventDefault();

    const btn = document.getElementById('savePuzzleBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="loading"></span> Saving...';

    // Get brand value
    let brandValue = document.getElementById('puzzleBrand').value;
    if (brandValue === '__new__') {
        brandValue = document.getElementById('puzzleBrandCustom').value.trim();
        if (brandValue) {
            addBrand(brandValue);
            updateBrandDropdowns();
        } else {
            brandValue = '';
        }
    }
    
    // Get theme value
    let themeValue = document.getElementById('puzzleTheme').value;
    if (themeValue === '__new__') {
        themeValue = document.getElementById('puzzleThemeCustom').value.trim();
        if (themeValue) {
            addTheme(themeValue);
            updateThemeDropdowns();
        } else {
            themeValue = '';
        }
    }
    
    // Get series value
    let seriesValue = document.getElementById('puzzleSeries').value;
    if (seriesValue === '__new__') {
        seriesValue = document.getElementById('puzzleSeriesCustom').value.trim();
        if (seriesValue) {
            addSeries(seriesValue);
            updateSeriesDropdowns();
        } else {
            seriesValue = '';
        }
    }

    const puzzleData = {
        name: document.getElementById('puzzleName').value,
        brand: brandValue || '',
        pieces: parseInt(document.getElementById('puzzlePieces').value),
        theme: themeValue || '',
        series: seriesValue || '',
        location: document.getElementById('puzzleLocation').value || '',
        purchasedFrom: document.getElementById('puzzlePurchasedFrom').value || '',
        rating: currentRating,
        notes: document.getElementById('puzzleModalNotes').value || '',
        condition: document.getElementById('puzzleModalCondition').value || '',
        passesPickup: document.getElementById('puzzleModalPassesPickup').checked,
        missingPieces: document.getElementById('puzzleModalMissingPieces').checked,
        puzzleDust: document.getElementById('puzzleModalDust').value || '',
        donated: document.getElementById('puzzleModalDonated').checked
    };



    try {
        let savedPuzzle;
        
        if (editingPuzzleId) {
            savedPuzzle = await apiRequest(`/api/puzzles/${editingPuzzleId}`, {
                method: 'PUT',
                body: JSON.stringify(puzzleData)
            });
            showAlert('Puzzle updated successfully!');
            currentPuzzleId = editingPuzzleId;
        } else {
            savedPuzzle = await apiRequest('/api/puzzles', {
                method: 'POST',
                body: JSON.stringify(puzzleData)
            });
            currentPuzzleId = savedPuzzle.id;
            
            // Handle multiple image uploads if provided
            const imageFiles = document.getElementById('puzzleModalImage').files;
            if (imageFiles && imageFiles.length > 0) {
                const formData = new FormData();
                
                // Append all selected images
                for (let i = 0; i < imageFiles.length; i++) {
                    formData.append('images', imageFiles[i]);
                }
                
                const imageResponse = await fetch(`/api/puzzles/${savedPuzzle.id}/images`, {
                    method: 'POST',
                    body: formData
                });
                
                if (!imageResponse.ok) {
                    console.error('Failed to upload images');
                }
            }
            
            // Handle initial log if checkbox is checked
            const addLog = document.getElementById('addInitialLog').checked;
            if (addLog) {
                const hours = parseInt(document.getElementById('initialLogHours').value) || 0;
                const minutes = parseInt(document.getElementById('initialLogMinutes').value) || 0;
                const seconds = parseInt(document.getElementById('initialLogSeconds').value) || 0;
                const totalHours = timeToHours(hours, minutes, seconds);
                
                const logData = {
                    date: document.getElementById('initialLogDate').value,
                    time: totalHours,
                    rating: initialLogRating,
                    notes: document.getElementById('initialLogNotes').value
                };
                
                
                const logResponse = await apiRequest(`/api/puzzles/${savedPuzzle.id}/logs`, {
                    method: 'POST',
                    body: JSON.stringify(logData)
                });
                
            }
            
            showAlert('Puzzle created successfully!');
        }

        // Reload puzzles to get fresh data including images and logs
        await loadPuzzles();
        closeModal('puzzleModal');

        if (currentPuzzleId) {
            showPuzzleDetail(currentPuzzleId);
        } else {
            renderDashboard();
        }
    } catch (error) {
        console.error('Failed to save puzzle:', error);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Save Puzzle';
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

// Render puzzle list
function renderPuzzleList() {
    const listContainer = document.getElementById('puzzleList');
    
    if (!puzzles || puzzles.length === 0) {
        listContainer.innerHTML = `
            <div class="empty-state">
                <h3>No puzzles yet</h3>
                <p>Add your first puzzle to get started!</p>
            </div>
        `;
        return;
    }

    listContainer.innerHTML = puzzles.map(puzzle => {
        const thumbnailIndex = Math.min(puzzle.thumbnailIndex || 0, (puzzle.images && puzzle.images.length > 0 ? puzzle.images.length - 1 : 0));
        const thumbnail = puzzle.images && puzzle.images.length > 0
            ? `<img src="${escapeHtml(puzzle.images[thumbnailIndex])}" alt="${escapeHtml(puzzle.name)}" class="puzzle-item-thumbnail">`
            : `<div class="puzzle-item-thumbnail">🧩</div>`;

        return `
            <div class="puzzle-item ${puzzle.id === currentPuzzleId ? 'active' : ''}" onclick="showPuzzleDetail(${puzzle.id})">
                ${thumbnail}
                <div class="puzzle-item-info">
                    <h3>${escapeHtml(puzzle.name)}</h3>
                    <p>${escapeHtml(String(puzzle.pieces))} pieces${puzzle.brand ? ' • ' + escapeHtml(puzzle.brand) : ''}</p>
                </div>
            </div>
        `;
    }).join('');
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
    const missingPieces = puzzle.missingPieces ? '<span style="color: #dc3545; font-weight: 600;">⚠ Yes</span>' : '<span style="color: #28a745;">✓ Complete</span>';
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
            <p><strong>Storage Location:</strong> ${puzzle.location ? escapeHtml(puzzle.location) : 'Not specified'}</p>
            <p><strong>Source:</strong> ${puzzle.purchasedFrom ? escapeHtml(puzzle.purchasedFrom) : 'Not specified'}</p>
            <p><strong>Overall Rating:</strong> <span style="color: #ffc107; font-size: 24px;">${stars}</span></p>
            <p><strong>Times Completed:</strong> ${puzzle.logs.length}</p>
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
    const files = event.target.files;
    if (files.length === 0) return;

    const formData = new FormData();
    for (let file of files) {
        formData.append('images', file);
    }

    try {
        const response = await fetch(`/api/puzzles/${currentPuzzleId}/images`, {
            method: 'POST',
            body: formData
        });
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            showAlert('Failed to upload images: ' + (err.error || response.statusText), 'error');
            return;
        }

        showAlert(`${files.length} image(s) uploaded successfully!`);
        const puzzle = await apiRequest(`/api/puzzles/${currentPuzzleId}`);
        renderImages(puzzle);
    } catch (error) {
        console.error('Failed to upload images:', error);
        showAlert('Failed to upload images', 'error');
    }

    event.target.value = '';
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
        const puzzle = await apiRequest(`/api/puzzles/${currentPuzzleId}`);
        renderImages(puzzle);
    } catch (error) {
        console.error('Failed to delete image:', error);
    }
}

// Show add log modal
function showAddLogModal() {
    editingLogId = null;
    document.getElementById('logModalTitle').textContent = 'Add Completion Log';
    document.getElementById('logDate').value = new Date().toISOString().split('T')[0];
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

        const puzzle = await apiRequest(`/api/puzzles/${currentPuzzleId}`);
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

    const sortedLogs = [...puzzle.logs].sort((a, b) => new Date(b.date) - new Date(a.date));

    logList.innerHTML = sortedLogs.map(log => {
        const timeFormatted = formatTime(log.time);
        
        return `
            <div class="log-item">
                <div class="log-item-header">
                    <div class="log-item-date">${new Date(log.date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
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
        const puzzle = await apiRequest(`/api/puzzles/${currentPuzzleId}`);
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
        const puzzle = await apiRequest(`/api/puzzles/${currentPuzzleId}`);
        const index = puzzles.findIndex(p => p.id === currentPuzzleId);
        if (index !== -1) {
            puzzles[index] = puzzle;
        }
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
        const puzzle = await apiRequest(`/api/puzzles/${currentPuzzleId}`);
        const index = puzzles.findIndex(p => p.id === currentPuzzleId);
        if (index !== -1) {
            puzzles[index] = puzzle;
        }
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
        const puzzle = await apiRequest(`/api/puzzles/${currentPuzzleId}`);
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
        const puzzle = await apiRequest(`/api/puzzles/${currentPuzzleId}`);
        renderCustomFields(puzzle);
    } catch (error) {
        console.error('Failed to delete custom field:', error);
    }
}

// Render statistics
function renderStats(puzzle) {
    const logs = puzzle.logs || [];
    const totalCompletions = logs.length;
    const totalTime = logs.reduce((sum, log) => sum + log.time, 0);
    const avgTime = totalCompletions > 0 ? (totalTime / totalCompletions) : 0;
    const fastestTime = totalCompletions > 0 ? Math.min(...logs.map(l => l.time)) : 0;
    const avgRating = logs.length > 0 ? (logs.reduce((sum, log) => sum + (log.rating || 0), 0) / logs.length).toFixed(1) : 0;
    const donationStatus = puzzle.donated ? 'Yes' : 'No';

    document.getElementById('statsGrid').innerHTML = `
        <div class="stat-card">
            <h3>${totalCompletions}</h3>
            <p>Times Completed</p>
        </div>
        <div class="stat-card">
            <h3>${formatTime(totalTime)}</h3>
            <p>Total Time</p>
        </div>
        <div class="stat-card">
            <h3>${avgTime > 0 ? formatTime(avgTime) : 'N/A'}</h3>
            <p>Average Time</p>
        </div>
        <div class="stat-card">
            <h3>${fastestTime > 0 ? formatTime(fastestTime) : 'N/A'}</h3>
            <p>Fastest Time</p>
        </div>
        <div class="stat-card">
            <h3>${avgRating || 'N/A'}</h3>
            <p>Average Rating</p>
        </div>
        <div class="stat-card">
            <h3>${puzzle.images.length}</h3>
            <p>Images</p>
        </div>
        <div class="stat-card">
            <h3>${donationStatus}</h3>
            <p>Donated</p>
        </div>
        <div class="stat-card">
            <h3>${puzzle.puzzleDust || 'N/A'}</h3>
            <p>Puzzle Dust</p>
        </div>
    `;
}

// Switch tab
function switchTab(tabName) {
    document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

    event.target.classList.add('active');
    document.getElementById(tabName + 'Tab').classList.add('active');
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
    const query = document.getElementById('searchBox').value.toLowerCase();
    const filtered = puzzles.filter(p => 
        p.name.toLowerCase().includes(query) ||
        (p.brand && p.brand.toLowerCase().includes(query)) ||
        (p.theme && p.theme.toLowerCase().includes(query))
    );

    const listContainer = document.getElementById('puzzleList');
    
    if (filtered.length === 0) {
        listContainer.innerHTML = `
            <div class="empty-state">
                <h3>No matches found</h3>
                <p>Try a different search term</p>
            </div>
        `;
        return;
    }

    listContainer.innerHTML = filtered.map(puzzle => {
        const thumbnail = puzzle.images && puzzle.images.length > 0
            ? `<img src="${escapeHtml(puzzle.images[0])}" alt="${escapeHtml(puzzle.name)}" class="puzzle-item-thumbnail">`
            : `<div class="puzzle-item-thumbnail">🧩</div>`;

        return `
            <div class="puzzle-item ${puzzle.id === currentPuzzleId ? 'active' : ''}" onclick="showPuzzleDetail(${puzzle.id})">
                ${thumbnail}
                <div class="puzzle-item-info">
                    <h3>${escapeHtml(puzzle.name)}</h3>
                    <p>${escapeHtml(String(puzzle.pieces))} pieces${puzzle.brand ? ' • ' + escapeHtml(puzzle.brand) : ''}</p>
                </div>
            </div>
        `;
    }).join('');
}

// Initialize app

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
        document.getElementById('initialLogDate').value = new Date().toISOString().split('T')[0];
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
        
        const puzzle = await apiRequest(`/api/puzzles/${currentPuzzleId}`);
        const index = puzzles.findIndex(p => p.id === currentPuzzleId);
        if (index !== -1) {
            puzzles[index] = puzzle;
        }
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
        
        const puzzle = await apiRequest(`/api/puzzles/${currentPuzzleId}`);
        const index = puzzles.findIndex(p => p.id === currentPuzzleId);
        if (index !== -1) {
            puzzles[index] = puzzle;
        }
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
        const puzzle = await apiRequest(`/api/puzzles/${currentPuzzleId}`);
        renderImages(puzzle);
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
        
        const puzzle = await apiRequest(`/api/puzzles/${currentPuzzleId}`);
        const index = puzzles.findIndex(p => p.id === currentPuzzleId);
        if (index !== -1) {
            puzzles[index] = puzzle;
        }
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
        } catch (error) {
            console.error('Failed to save quality data:', error);
        }
    }
}

// Load quality data into form
function loadQualityData(puzzle) {
    if (!puzzle.quality) return;
    
    const setRadio = (name, value) => {
        const radio = document.querySelector(`input[name="${name}"][value="${value}"]`);
        if (radio) radio.checked = true;
    };
    
    setRadio('pieceFit', puzzle.quality.pieceFit || 0);
    setRadio('cutQuality', puzzle.quality.cutQuality || 0);
    setRadio('thickness', puzzle.quality.thickness || 0);
    setRadio('finish', puzzle.quality.finish || 0);
    setRadio('shapeVariety', puzzle.quality.shapeVariety || 0);
    setRadio('falseFits', puzzle.quality.falseFits || 0);
    setRadio('colorQuality', puzzle.quality.colorQuality || 0);
    setRadio('alignment', puzzle.quality.alignment || 0);
    
    if (puzzle.quality.imageSharpness) {
        document.getElementById('imageSharpness').value = puzzle.quality.imageSharpness;
        document.getElementById('imageSharpnessValue').textContent = puzzle.quality.imageSharpness;
    }
    
    if (puzzle.quality.packaging) {
        document.getElementById('packaging').value = puzzle.quality.packaging;
        document.getElementById('packagingValue').textContent = puzzle.quality.packaging;
    }
    
    document.getElementById('qualityScoreDisplay').textContent = puzzle.quality.qualityScore || 0;
}

// Show About modal
function showAbout() {
    showModal('aboutModal');
}

// Update missing pieces
async function updateMissingPieces() {
    const missingPieces = document.getElementById('puzzleMissingPieces').checked;

    try {
        await apiRequest(`/api/puzzles/${currentPuzzleId}/missing-pieces`, {
            method: 'PUT',
            body: JSON.stringify({ missingPieces })
        });

        showAlert(missingPieces ? 'Marked as having missing pieces' : 'Missing pieces status removed');
        
        const puzzle = await apiRequest(`/api/puzzles/${currentPuzzleId}`);
        const index = puzzles.findIndex(p => p.id === currentPuzzleId);
        if (index !== -1) {
            puzzles[index] = puzzle;
        }
        renderOverview(puzzle);
    } catch (error) {
        console.error('Failed to update missing pieces:', error);
    }
}

// Calculate PQI
function calculatePQI() {
    const fit = parseInt(document.getElementById('pqiFit').value) || 0;
    const cut = parseInt(document.getElementById('pqiCut').value) || 0;
    const image = parseInt(document.getElementById('pqiImage').value) || 0;
    const thickness = parseInt(document.getElementById('pqiThickness').value) || 0;
    const finish = parseInt(document.getElementById('pqiFinish').value) || 0;
    const shape = parseInt(document.getElementById('pqiShape').value) || 0;
    const falseFits = parseInt(document.getElementById('pqiFalseFits').value) || 0;
    const color = parseInt(document.getElementById('pqiColor').value) || 0;
    const alignment = parseInt(document.getElementById('pqiAlignment').value) || 0;
    const packaging = parseInt(document.getElementById('pqiPackaging').value) || 0;
    
    const score = (
        (fit / 5) * 20 +
        (cut / 5) * 15 +
        (image / 5) * 15 +
        (thickness / 5) * 10 +
        (finish / 5) * 10 +
        (shape / 5) * 10 +
        (falseFits / 5) * 10 +
        (color / 5) * 5 +
        (alignment / 5) * 3 +
        (packaging / 5) * 2
    );
    
    return Math.round(score);
}

// Calculate and save PQI
async function calculateAndSavePQI() {
    const pqiData = {
        fit: parseInt(document.getElementById('pqiFit').value) || 0,
        cut: parseInt(document.getElementById('pqiCut').value) || 0,
        image: parseInt(document.getElementById('pqiImage').value) || 0,
        thickness: parseInt(document.getElementById('pqiThickness').value) || 0,
        finish: parseInt(document.getElementById('pqiFinish').value) || 0,
        shape: parseInt(document.getElementById('pqiShape').value) || 0,
        falseFits: parseInt(document.getElementById('pqiFalseFits').value) || 0,
        color: parseInt(document.getElementById('pqiColor').value) || 0,
        alignment: parseInt(document.getElementById('pqiAlignment').value) || 0,
        packaging: parseInt(document.getElementById('pqiPackaging').value) || 0
    };
    
    const score = calculatePQI();
    pqiData.score = score;
    
    try {
        await apiRequest(`/api/puzzles/${currentPuzzleId}/pqi`, {
            method: 'PUT',
            body: JSON.stringify(pqiData)
        });
        
        document.getElementById('pqiScore').textContent = `${score} / 100`;
        document.getElementById('pqiScore').style.color = score >= 75 ? '#28a745' : score >= 50 ? '#ffc107' : '#dc3545';
        
        showAlert(`PQI Score: ${score}/100 - Saved!`);
        
        const puzzle = await apiRequest(`/api/puzzles/${currentPuzzleId}`);
        const index = puzzles.findIndex(p => p.id === currentPuzzleId);
        if (index !== -1) {
            puzzles[index] = puzzle;
        }
        renderOverview(puzzle);
    } catch (error) {
        console.error('Failed to save PQI:', error);
    }
}

// Load PQI data
function loadPQIData(puzzle) {
    if (puzzle.pqi) {
        document.getElementById('pqiFit').value = puzzle.pqi.fit || '';
        document.getElementById('pqiCut').value = puzzle.pqi.cut || '';
        document.getElementById('pqiImage').value = puzzle.pqi.image || '';
        document.getElementById('pqiThickness').value = puzzle.pqi.thickness || '';
        document.getElementById('pqiFinish').value = puzzle.pqi.finish || '';
        document.getElementById('pqiShape').value = puzzle.pqi.shape || '';
        document.getElementById('pqiFalseFits').value = puzzle.pqi.falseFits || '';
        document.getElementById('pqiColor').value = puzzle.pqi.color || '';
        document.getElementById('pqiAlignment').value = puzzle.pqi.alignment || '';
        document.getElementById('pqiPackaging').value = puzzle.pqi.packaging || '';
        
        if (puzzle.pqi.score !== undefined) {
            const score = puzzle.pqi.score;
            document.getElementById('pqiScore').textContent = `${score} / 100`;
            document.getElementById('pqiScore').style.color = score >= 75 ? '#28a745' : score >= 50 ? '#ffc107' : '#dc3545';
        }
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

// Update series dropdowns
function updateSeriesDropdowns() {
    const seriesSelect = document.getElementById('puzzleSeries');
    if (!seriesSelect) return;
    
    // Ensure settings.series exists
    if (!settings.series) {
        settings.series = [];
    }
    
    const currentValue = seriesSelect.value;
    seriesSelect.innerHTML = '<option value="">Select or type new...</option>';
    
    settings.series.forEach(series => {
        const option = document.createElement('option');
        option.value = series;
        option.textContent = series;
        seriesSelect.appendChild(option);
    });
    
    const newOption = document.createElement('option');
    newOption.value = '__new__';
    newOption.textContent = '+ Add New Series/Set';
    seriesSelect.appendChild(newOption);
    
    if (currentValue && settings.series.includes(currentValue)) {
        seriesSelect.value = currentValue;
    }
}

// Add series
function addSeries(series) {
    if (!settings.series) {
        settings.series = [];
    }
    if (!settings.series.includes(series)) {
        settings.series.push(series);
        settings.series.sort();
        saveSettings();
        return true;
    }
    return false;
}

// Remove series
function removeSeries(series) {
    if (!settings.series) {
        settings.series = [];
        return;
    }
    settings.series = settings.series.filter(s => s !== series);
    saveSettings();
}

// Render series list in settings
function renderSeriesList() {
    const listDiv = document.getElementById('seriesList');
    if (!listDiv) return;
    
    if (!settings.series) {
        settings.series = [];
    }
    
    if (settings.series.length === 0) {
        listDiv.innerHTML = '<p style="color: #666;">No series/sets added yet.</p>';
        return;
    }
    
    listDiv.innerHTML = settings.series.map(series => `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px; background: #f8f9fa; border-radius: 6px; margin-bottom: 8px;">
            <span>${series}</span>
            <button class="btn btn-danger" style="padding: 6px 12px; font-size: 14px;" onclick="removeSeries('${series.replace(/'/g, "\\'")}'); renderSeriesList(); updateSeriesDropdowns();">Delete</button>
        </div>
    `).join('');
}
