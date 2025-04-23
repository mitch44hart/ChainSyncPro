let inventory = [];
let sales = [];
let auditLog = [];
let settings = { theme: 'light', shopName: '', locations: [], debugMode: false };
let html5QrCode = null;
let currentPage = 1;
const itemsPerPage = 20;

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
}

function quickAddItem() {
    try {
        const itemName = document.getElementById('itemName').value.trim();
        const quantity = parseInt(document.getElementById('quantity').value) || 1;
        const category = document.getElementById('category').value.trim() || 'Uncategorized';
        const location = document.getElementById('location').value || 'Store';

        if (!itemName) {
            showNotification('Item name is required.', 'error');
            return;
        }
        if (quantity < 1) {
            showNotification('Quantity must be at least 1.', 'error');
            return;
        }

        const item = { itemName, quantity, category, location };
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
                details: JSON.stringify({ quantity: item.quantity, location: item.location })
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
                    details: JSON.stringify({ quantity: item.quantity, location: item.location })
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
            details: JSON.stringify({ quantity })
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
            const row = document.createElement('tr');
            row.innerHTML = `
                <td class="px-5 py-3 text-sm">${category}</td>
                <td class="px-5 py-3 text-sm">${totalItems}</td>
                <td class="px-5 py-3 text-sm">${totalQuantity}</td>
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
            Location: item.location
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
            head: [['Item Name', 'Quantity', 'Category', 'Location']],
            body: inventory.map(item => [item.itemName, item.quantity, item.category, item.location]),
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
        const keys = ['theme', 'shopName', 'locations', 'debugMode'];
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
        locationSelect.innerHTML = '<option value="">Select or add location</option>';
        settings.locations.forEach(loc => {
            const option = document.createElement('option');
            option.value = loc;
            option.textContent = loc;
            locationSelect.appendChild(option);
        });
    } catch (err) {
        debugLog('Error updating location dropdown', err);
        showNotification('Error updating location dropdown.', 'error');
    }
}

function backupData() {
    try {
        const data = { inventory, sales, auditLog, settings };
        const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'chainsync_backup.json';
        a.click();
        URL.revokeObjectURL(url);
        showNotification('Data backed up.', 'success');
    } catch (err) {
        debugLog('Error backing up data', err);
        showNotification('Error backing up data.', 'error');
    }
}

function clearDatabase() {
    if (!confirm('Reset all data? This cannot be undone.')) return;
    try {
        const transaction = db.transaction([INVENTORY_STORE, SALES_STORE, AUDIT_STORE, SETTINGS_STORE], 'readwrite');
        [INVENTORY_STORE, SALES_STORE, AUDIT_STORE, SETTINGS_STORE].forEach(storeName => {
            transaction.objectStore(storeName).clear();
        });
        transaction.oncomplete = () => {
            inventory = [];
            sales = [];
            auditLog = [];
            settings = { theme: 'light', shopName: '', locations: [], debugMode: false };
            loadInventory();
            loadSales();
            loadAuditLog();
            loadSettings();
            showNotification('Data reset.', 'success');
        };
    } catch (err) {
        debugLog('Error clearing database', err);
        showNotification('Error clearing database.', 'error');
    }
}

function startScanner() {
    try {
        if (!window.Html5Qrcode) {
            showNotification('Scanner not available.', 'error');
            return;
        }
        openModal('scanModal');
        html5QrCode = new Html5Qrcode('reader');
        html5QrCode.start(
            { facingMode: 'environment' },
            { fps: 10, qrbox: { width: 250, height: 250 } },
            (decodedText) => {
                document.getElementById('itemName').value = decodedText;
                stopScanner();
                quickAddItem();
            },
            (error) => {
                debugLog('QR scan error', error);
            }
        ).catch(err => {
            debugLog('Error starting scanner', err);
            showNotification('Error accessing camera.', 'error');
            stopScanner();
        });
    } catch (err) {
        debugLog('Error starting scanner', err);
        showNotification('Error starting scanner.', 'error');
    }
}

function stopScanner() {
    try {
        if (html5QrCode) {
            html5QrCode.stop().then(() => {
                html5QrCode = null;
                closeModal('scanModal');
            }).catch(err => {
                debugLog('Error stopping scanner', err);
            });
        } else {
            closeModal('scanModal');
        }
    } catch (err) {
        debugLog('Error stopping scanner', err);
        showNotification('Error stopping scanner.', 'error');
    }
}

function clearForm() {
    try {
        document.getElementById('itemName').value = '';
        document.getElementById('quantity').value = '1';
        document.getElementById('category').value = '';
        document.getElementById('location').value = '';
        document.getElementById('itemName').focus();
    } catch (err) {
        debugLog('Error clearing form', err);
        showNotification('Error clearing form.', 'error');
    }
}

function getFilteredInventory() {
    try {
        const searchTerm = document.getElementById('searchInput').value.toLowerCase();
        return inventory.filter(item =>
            item.itemName.toLowerCase().includes(searchTerm) ||
            item.category.toLowerCase().includes(searchTerm) ||
            item.location.toLowerCase().includes(searchTerm)
        );
    } catch (err) {
        debugLog('Error filtering inventory', err);
        showNotification('Error filtering inventory.', 'error');
        return [];
    }
}

function renderTable() {
    try {
        const tableBody = document.getElementById('inventoryBody');
        tableBody.innerHTML = '';

        const filteredInventory = getFilteredInventory();
        const totalPages = Math.ceil(filteredInventory.length / itemsPerPage);
        const start = (currentPage - 1) * itemsPerPage;
        const paginatedInventory = filteredInventory.slice(start, start + itemsPerPage);

        if (paginatedInventory.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="5" class="text-center p-5 text-gray-500">No items found.</td></tr>';
            renderPagination(totalPages);
            return;
        }

        paginatedInventory.forEach(item => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td class="px-5 py-3 text-sm">${item.itemName}</td>
                <td class="px-5 py-3 text-sm">${item.quantity}</td>
                <td class="px-5 py-3 text-sm">${item.category}</td>
                <td class="px-5 py-3 text-sm">${item.location}</td>
                <td class="px-5 py-3 text-sm">
                    <button onclick="deleteItem(${item.id})" class="tw-button-danger py-1 px-2 text-xs">Delete</button>
                </td>
            `;
            tableBody.appendChild(row);
        });

        renderPagination(totalPages);
    } catch (err) {
        debugLog('Error rendering table', err);
        showNotification('Error rendering table.', 'error');
        document.getElementById('inventoryBody').innerHTML = '<tr><td colspan="5" class="text-center p-5 text-red-500">Error loading table. Please refresh.</td></tr>';
    }
}

function renderPagination(totalPages) {
    try {
        const pagination = document.getElementById('pagination');
        pagination.innerHTML = '';
        for (let i = 1; i <= totalPages; i++) {
            const button = document.createElement('button');
            button.textContent = i;
            button.className = i === currentPage ? 'active' : '';
            button.onclick = () => {
                currentPage = i;
                renderTable();
            };
            pagination.appendChild(button);
        }
    } catch (err) {
        debugLog('Error rendering pagination', err);
        showNotification('Error rendering pagination.', 'error');
    }
}

window.addEventListener('load', initializeApp);