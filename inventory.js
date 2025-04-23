let inventory = [];
let sales = [];
let auditLog = [];
let settings = {
    theme: 'light',
    shopName: '',
    locations: [],
    debugMode: false,
    categories: [], // NEW: Category presets
    dotClassifications: [], // NEW: Custom DOT classifications
    filters: { name: '', category: '', dot: '', quantity: 0 } // NEW: Filter settings
};
let html5QrCode = null;
let currentPage = 1;
const itemsPerPage = 20;
let selectedItemId = null; // NEW: Track item for editing

function initializeApp() {
    initializeDatabase(() => {
        loadSettings();
        loadInventory();
        loadSales();
        loadAuditLog();
        setupEventListeners();
    });
}

async function loadInventory() {
    inventory = await getAllFromStore(INVENTORY_STORE);
    renderTable();
    updateReports();
    updateLocationDropdown();
    updateCategoryDropdown();
    updateDotDropdown();
    updateFilterDropdowns();
}

function quickAddItem() {
    try {
        const itemName = document.getElementById('itemName').value.trim();
        const quantity = parseInt(document.getElementById('quantity').value) || 1;
        let category = document.getElementById('category').value;
        const location = document.getElementById('location').value || 'Store';
        let dotClassification = document.getElementById('dotClassification').value;

        if (!itemName) {
            showNotification('Item name is required.', 'error');
            return;
        }
        if (quantity < 1) {
            showNotification('Quantity must be at least 1.', 'error');
            return;
        }

        // NEW: Handle add-new category
        if (category === 'add-new') {
            const newCategory = prompt('Enter new category name:');
            if (newCategory && !settings.categories.includes(newCategory)) {
                settings.categories.push(newCategory);
                saveSettings('categories', settings.categories);
                updateCategoryDropdown();
                category = newCategory;
            } else {
                category = '';
            }
        }

        // NEW: Handle add-new DOT classification
        if (dotClassification === 'add-new') {
            const newDot = prompt('Enter new DOT classification:');
            if (newDot && !settings.dotClassifications.includes(newDot)) {
                settings.dotClassifications.push(newDot);
                saveSettings('dotClassifications', settings.dotClassifications);
                updateDotDropdown();
                dotClassification = newDot;
            } else {
                dotClassification = '';
            }
        }

        const item = { itemName, quantity, category: category || 'Uncategorized', location, dotClassification };
        const existingItem = inventory.find(i => i.itemName.toLowerCase() === itemName.toLowerCase() && i.location === location);

        if (existingItem) {
            existingItem.quantity += quantity;
            saveItem(existingItem, true, 'update');
        } else {
            saveItem(item, false, 'add');
        }
    } catch (err) {
        debugLog('Error adding item', err);
        showNotification('Error adding item.', 'error');
    }
}

async function saveItem(item, isUpdate = false, action = 'add') {
    if (!isDbReady()) return;
    try {
        const transaction = db.transaction([INVENTORY_STORE, AUDIT_STORE], 'readwrite');
        const store = transaction.objectStore(INVENTORY_STORE);
        const auditStore = transaction.objectStore(AUDIT_STORE);
        const request = store.put(item);
        request.onsuccess = () => {
            const auditEntry = {
                timestamp: Date.now(),
                action: isUpdate ? 'update' : 'add',
                itemName: item.itemName,
                details: JSON.stringify({ quantity: item.quantity, location: item.location, dotClassification: item.dotClassification })
            };
            auditStore.add(auditEntry);
            transaction.oncomplete = () => {
                loadInventory();
                loadAuditLog();
                showNotification(`Item ${isUpdate ? 'updated' : 'added'} successfully.`, 'success');
                clearForm();
            };
        };
        request.onerror = () => {
            debugLog('Error saving item');
            showNotification('Error saving item.', 'error');
        };
    } catch (err) {
        debugLog('Error saving item', err);
        showNotification('Error saving item.', 'error');
    }
}

// NEW: Edit Item
function openEditModal(id) {
    try {
        const item = inventory.find(i => i.id === id);
        if (!item) {
            showNotification('Item not found.', 'error');
            return;
        }
        selectedItemId = id;
        document.getElementById('editItemName').value = item.itemName;
        document.getElementById('editQuantity').value = item.quantity;
        document.getElementById('editCategory').value = item.category;
        document.getElementById('editLocation').value = item.location;
        document.getElementById('editDotClassification').value = item.dotClassification || '';
        updateCategoryDropdown('editCategory');
        updateDotDropdown('editDotClassification');
        openModal('editModal');
    } catch (err) {
        debugLog('Error opening edit modal', err);
        showNotification('Error opening edit modal.', 'error');
    }
}

async function saveEditedItem() {
    try {
        const item = inventory.find(i => i.id === selectedItemId);
        if (!item) {
            showNotification('Item not found.', 'error');
            return;
        }
        const itemName = document.getElementById('editItemName').value.trim();
        const quantity = parseInt(document.getElementById('editQuantity').value) || 1;
        let category = document.getElementById('editCategory').value;
        const location = document.getElementById('editLocation').value || 'Store';
        let dotClassification = document.getElementById('editDotClassification').value;

        if (!itemName) {
            showNotification('Item name is required.', 'error');
            return;
        }
        if (quantity < 1) {
            showNotification('Quantity must be at least 1.', 'error');
            return;
        }

        if (category === 'add-new') {
            const newCategory = prompt('Enter new category name:');
            if (newCategory && !settings.categories.includes(newCategory)) {
                settings.categories.push(newCategory);
                saveSettings('categories', settings.categories);
                updateCategoryDropdown('editCategory');
                category = newCategory;
            } else {
                category = item.category;
            }
        }

        if (dotClassification === 'add-new') {
            const newDot = prompt('Enter new DOT classification:');
            if (newDot && !settings.dotClassifications.includes(newDot)) {
                settings.dotClassifications.push(newDot);
                saveSettings('dotClassifications', settings.dotClassifications);
                updateDotDropdown('editDotClassification');
                dotClassification = newDot;
            } else {
                dotClassification = item.dotClassification || '';
            }
        }

        item.itemName = itemName;
        item.quantity = quantity;
        item.category = category || 'Uncategorized';
        item.location = location;
        item.dotClassification = dotClassification;
        await saveItem(item, true, 'edit');
        closeModal('editModal');
        selectedItemId = null;
    } catch (err) {
        debugLog('Error saving edited item', err);
        showNotification('Error saving edited item.', 'error');
    }
}

async function deleteItem(id) {
    if (!confirm('Delete this item?')) return;
    try {
        const item = inventory.find(i => i.id === id);
        if (item) {
            const transaction = db.transaction([INVENTORY_STORE, AUDIT_STORE], 'readwrite');
            const store = transaction.objectStore(INVENTORY_STORE);
            const auditStore = transaction.objectStore(AUDIT_STORE);
            const request = store.delete(id);
            request.onsuccess = () => {
                auditStore.add({
                    timestamp: Date.now(),
                    action: 'delete',
                    itemName: item.itemName,
                    details: JSON.stringify({ quantity: item.quantity, location: item.location, dotClassification: item.dotClassification })
                });
                transaction.oncomplete = () => {
                    loadInventory();
                    loadAuditLog();
                    showNotification('Item deleted.', 'success');
                };
            };
            request.onerror = () => {
                debugLog('Error deleting item');
                showNotification('Error deleting item.', 'error');
            };
        }
    } catch (err) {
        debugLog('Error deleting item', err);
        showNotification('Error deleting item.', 'error');
    }
}

async function loadSales() {
    sales = await getAllFromStore(SALES_STORE);
    renderSalesTable();
}

function recordSale() {
    try {
        const itemName = document.getElementById('saleItemName').value.trim();
        const quantity = parseInt(document.getElementById('saleQuantity').value) || 1;

        if (!itemName) {
            showNotification('Item name is required.', 'error');
            return;
        }
        if (quantity < 1) {
            showNotification('Quantity must be at least 1.', 'error');
            return;
        }

        const item = inventory.find(i => i.itemName.toLowerCase() === itemName.toLowerCase());
        if (!item || item.quantity < quantity) {
            showNotification('Item not found or insufficient stock.', 'error');
            return;
        }

        item.quantity -= quantity;
        const transaction = db.transaction([INVENTORY_STORE, SALES_STORE, AUDIT_STORE], 'readwrite');
        const invStore = transaction.objectStore(INVENTORY_STORE);
        const salesStore = transaction.objectStore(SALES_STORE);
        const auditStore = transaction.objectStore(AUDIT_STORE);

        invStore.put(item);
        salesStore.add({ timestamp: Date.now(), itemName, quantity });
        auditStore.add({
            timestamp: Date.now(),
            action: 'sale',
            itemName,
            details: JSON.stringify({ quantity, dotClassification: item.dotClassification })
        });

        transaction.oncomplete = () => {
            loadInventory();
            loadSales();
            loadAuditLog();
            showNotification('Sale recorded.', 'success');
            clearSaleForm();
        };
    } catch (err) {
        debugLog('Error recording sale', err);
        showNotification('Error recording sale.', 'error');
    }
}

function renderSalesTable() {
    try {
        const tableBody = document.getElementById('salesBody');
        tableBody.innerHTML = '';
        sales.slice(-50).reverse().forEach(sale => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td class="px-5 py-3 text-sm">${new Date(sale.timestamp).toLocaleString()}</td>
                <td class="px-5 py-3 text-sm">${sale.itemName}</td>
                <td class="px-5 py-3 text-sm">${sale.quantity}</td>
            `;
            tableBody.appendChild(row);
        });
    } catch (err) {
        debugLog('Error rendering sales table', err);
        showNotification('Error rendering sales table.', 'error');
    }
}

function clearSaleForm() {
    try {
        document.getElementById('saleItemName').value = '';
        document.getElementById('saleQuantity').value = '1';
        document.getElementById('saleItemName').focus();
    } catch (err) {
        debugLog('Error clearing sale form', err);
        showNotification('Error clearing sale form.', 'error');
    }
}

function updateReports() {
    try {
        const totalItems = inventory.length;
        const totalStock = inventory.reduce((sum, item) => sum + (item.quantity || 0), 0);
        const inventoryValue = inventory.reduce((sum, item) => {
            const price = item.customFields?.Price ? parseFloat(item.customFields.Price.replace('$', '')) || 0 : 0;
            return sum + price * (item.quantity || 0);
        }, 0);

        document.getElementById('totalItems').textContent = totalItems;
        document.getElementById('totalStock').textContent = totalStock;
        document.getElementById('inventoryValue').textContent = `$${inventoryValue.toFixed(2)}`;
    } catch (err) {
        debugLog('Error updating reports', err);
        showNotification('Error updating reports.', 'error');
    }
}

function renderReportsTable() {
    try {
        const tableBody = document.getElementById('reportsBody');
        tableBody.innerHTML = '';
        const categories = [...new Set(inventory.map(item => item.category))];
        categories.forEach(category => {
            const itemsInCategory = inventory.filter(item => item.category === category);
            const totalItems = itemsInCategory.length;
            const totalQuantity = itemsInCategory.reduce((sum, item) => sum + (item.quantity || 0), 0);
            const dotClasses = [...new Set(itemsInCategory.map(item => item.dotClassification || 'None'))].join(', ');
            const row = document.createElement('tr');
            row.innerHTML = `
                <td class="px-5 py-3 text-sm">${category}</td>
                <td class="px-5 py-3 text-sm">${totalItems}</td>
                <td class="px-5 py-3 text-sm">${totalQuantity}</td>
                <td class="px-5 py-3 text-sm">${dotClasses}</td>
            `;
            tableBody.appendChild(row);
        });
    } catch (err) {
        debugLog('Error rendering reports table', err);
        showNotification('Error rendering reports table.', 'error');
    }
}

function exportToExcel() {
    try {
        if (!window.XLSX) {
            showNotification('Excel export not available.', 'error');
            return;
        }
        const data = inventory.map(item => ({
            'Item Name': item.itemName,
            Quantity: item.quantity,
            Category: item.category,
            Location: item.location,
            'DOT Classification': item.dotClassification || 'None'
        }));
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Inventory');
        XLSX.write(wb, 'inventory.xlsx');
        showNotification('Exported to Excel.', 'success');
    } catch (err) {
        debugLog('Error exporting to Excel', err);
        showNotification('Error exporting to Excel.', 'error');
    }
}

function exportToPDF() {
    try {
        if (!window.jspdf) {
            showNotification('PDF export not available.', 'error');
            return;
        }
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        doc.text('Inventory Report', 20, 20);
        doc.autoTable({
            head: [['Item Name', 'Quantity', 'Category', 'Location', 'DOT Classification']],
            body: inventory.map(item => [item.itemName, item.quantity, item.category, item.location, item.dotClassification || 'None']),
            startY: 30
        });
        doc.save('inventory.pdf');
        showNotification('Exported to PDF.', 'success');
    } catch (err) {
        debugLog('Error exporting to PDF', err);
        showNotification('Error exporting to PDF.', 'error');
    }
}

async function loadAuditLog() {
    auditLog = await getAllFromStore(AUDIT_STORE);
    renderAuditTable();
}

function renderAuditTable() {
    try {
        const tableBody = document.getElementById('auditBody');
        tableBody.innerHTML = '';
        auditLog.slice(-50).reverse().forEach(entry => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td class="px-5 py-3 text-sm">${new Date(entry.timestamp).toLocaleString()}</td>
                <td class="px-5 py-3 text-sm">${entry.action}</td>
                <td class="px-5 py-3 text-sm">${entry.itemName}</td>
                <td class="px-5 py-3 text-sm">${entry.details}</td>
            `;
            tableBody.appendChild(row);
        });
    } catch (err) {
        debugLog('Error rendering audit table', err);
        showNotification('Error rendering audit table.', 'error');
    }
}

async function loadSettings() {
    if (!isDbReady()) return;
    try {
        const transaction = db.transaction([SETTINGS_STORE], 'readonly');
        const store = transaction.objectStore(SETTINGS_STORE);
        const keys = ['theme', 'shopName', 'locations', 'debugMode', 'categories', 'dotClassifications', 'filters'];
        const results = await Promise.all(keys.map(key => store.get(key)));
        results.forEach((result, i) => {
            if (result.result) {
                settings[keys[i]] = result.result.value;
            }
        });
        document.getElementById('shopName').value = settings.shopName || '';
        document.getElementById('darkTheme').checked = settings.theme === 'dark';
        document.getElementById('debugMode').checked = settings.debugMode || false;
        if (settings.theme === 'dark') {
            document.documentElement.classList.add('dark');
        }
        updateLocationDropdown();
        updateCategoryDropdown();
        updateDotDropdown();
        updateCategoryList();
        updateDotList();
        loadFilterSettings();
    } catch (err) {
        debugLog('Error loading settings', err);
        showNotification('Error loading settings.', 'error');
    }
}

function saveSettings(key, value) {
    if (!isDbReady()) return;
    try {
        const transaction = db.transaction([SETTINGS_STORE], 'readwrite');
        const store = transaction.objectStore(SETTINGS_STORE);
        store.put({ key, value });
        transaction.oncomplete = () => {
            settings[key] = value;
            debugLog(`Settings saved: ${key}=${value}`);
        };
    } catch (err) {
        debugLog('Error saving settings', err);
        showNotification('Error saving settings.', 'error');
    }
}

function toggleTheme() {
    try {
        const isDark = document.getElementById('darkTheme').checked;
        document.documentElement.classList.toggle('dark', isDark);
        saveSettings('theme', isDark ? 'dark' : 'light');
    } catch (err) {
        debugLog('Error toggling theme', err);
        showNotification('Error toggling theme.', 'error');
    }
}

function toggleDebugMode() {
    try {
        const debugMode = document.getElementById('debugMode').checked;
        saveSettings('debugMode', debugMode);
    } catch (err) {
        debugLog('Error toggling debug mode', err);
        showNotification('Error toggling debug mode.', 'error');
    }
}

function addLocation() {
    try {
        const location = document.getElementById('locations').value.trim();
        if (location && !settings.locations.includes(location)) {
            settings.locations.push(location);
            saveSettings('locations', settings.locations);
            updateLocationDropdown();
            document.getElementById('locations').value = '';
            showNotification('Location added.', 'success');
        }
    } catch (err) {
        debugLog('Error adding location', err);
        showNotification('Error adding location.', 'error');
    }
}

function updateLocationDropdown() {
    try {
        const locationSelect = document.getElementById('location');
        const editLocationSelect = document.getElementById('editLocation');
        [locationSelect, editLocationSelect].forEach(select => {
            if (select) {
                select.innerHTML = '<option value="">Select or add location</option>';
                settings.locations.forEach(loc => {
                    const option = document.createElement('option');
                    option.value = loc;
                    option.textContent = loc;
                    select.appendChild(option);
                });
            }
        });
    } catch (err) {
        debugLog('Error updating location dropdown', err);
        showNotification('Error updating location dropdown.', 'error');
    }
}

// NEW: Category Presets
function addCategoryPreset() {
    try {
        const category = document.getElementById('categoryPreset').value.trim();
        if (category && !settings.categories.includes(category)) {
            settings.categories.push(category);
            saveSettings('categories', settings.categories);
            updateCategoryDropdown();
            updateCategoryList();
            document.getElementById('categoryPreset').value = '';
            showNotification('Category added.', 'success');
        }
    } catch (err) {
        debugLog('Error adding category preset', err);
        showNotification('Error adding category preset.', 'error');
    }
}

function updateCategoryDropdown(id = 'category') {
    try {
        const select = document.getElementById(id);
        select.innerHTML = '<option value="">Select category</option>';
        settings.categories.forEach(cat => {
            const option = document.createElement('option');
            option.value = cat;
            option.textContent = cat;
            select.appendChild(option);
        });
        select.innerHTML += '<option value="add-new">Add New Category...</option>';
    } catch (err) {
        debugLog('Error updating category dropdown', err);
        showNotification('Error updating category dropdown.', 'error');
