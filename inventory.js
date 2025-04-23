let inventory = [];
let sales = [];
let auditLog = [];
let settings = {
    theme: 'light',
    shopName: '',
    locations: [],
    debugMode: false,
    categories: [],
    dotClassifications: [],
    filters: { name: '', category: '', dot: '', quantity: 0 }
};
let html5QrCode = null;
let currentPage = 1;
const itemsPerPage = 20;
let selectedItemId = null;

function initializeApp() {
    console.log('Initializing app...');
    try {
        initializeDatabase(() => {
            console.log('Database ready, loading data...');
            loadSettings();
            loadInventory();
            loadSales();
            loadAuditLog();
            setupEventListeners();
            console.log('App initialized successfully');
        });
    } catch (err) {
        debugLog('Error initializing app', err);
        showNotification('Error initializing app. Please refresh.', 'error');
    }
}

async function loadInventory() {
    try {
        inventory = await getAllFromStore(INVENTORY_STORE);
        renderTable();
        updateReports();
        updateLocationDropdown();
        updateCategoryDropdown();
        updateDotDropdown();
        updateFilterDropdowns();
        console.log('Inventory loaded');
    } catch (err) {
        debugLog('Error loading inventory', err);
        showNotification('Error loading inventory.', 'error');
    }
}

function quickAddItem() {
    console.log('Add Item button clicked');
    try {
        const itemName = document.getElementById('itemName')?.value.trim();
        const quantity = parseInt(document.getElementById('quantity')?.value) || 1;
        let category = document.getElementById('category')?.value;
        const location = document.getElementById('location')?.value || 'Store';
        let dotClassification = document.getElementById('dotClassification')?.value;

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
                updateCategoryDropdown();
                category = newCategory;
            } else {
                category = '';
            }
        }

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

function openEditModal(id) {
    console.log(`Edit button clicked for item ID: ${id}`);
    try {
        const item = inventory.find(i => i.id === id);
        if (!item) {
            showNotification('Item not found.', 'error');
            return;
        }
        selectedItemId = id;
        const editItemName = document.getElementById('editItemName');
        const editQuantity = document.getElementById('editQuantity');
        const editCategory = document.getElementById('editCategory');
        const editLocation = document.getElementById('editLocation');
        const editDotClassification = document.getElementById('editDotClassification');
        if (!editItemName || !editQuantity || !editCategory || !editLocation || !editDotClassification) {
            showNotification('Edit modal elements missing.', 'error');
            return;
        }
        editItemName.value = item.itemName;
        editQuantity.value = item.quantity;
        editCategory.value = item.category;
        editLocation.value = item.location;
        editDotClassification.value = item.dotClassification || '';
        updateCategoryDropdown('editCategory');
        updateDotDropdown('editDotClassification');
        openModal('editModal');
    } catch (err) {
        debugLog('Error opening edit modal', err);
        showNotification('Error opening edit modal.', 'error');
    }
}

async function saveEditedItem() {
    console.log('Save Edit button clicked');
    try {
        const item = inventory.find(i => i.id === selectedItemId);
        if (!item) {
            showNotification('Item not found.', 'error');
            return;
        }
        const itemName = document.getElementById('editItemName')?.value.trim();
        const quantity = parseInt(document.getElementById('editQuantity')?.value) || 1;
        let category = document.getElementById('editCategory')?.value;
        const location = document.getElementById('editLocation')?.value || 'Store';
        let dotClassification = document.getElementById('editDotClassification')?.value;

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
        debugLog('Error saving edit item', err);
        showNotification('Error saving edit item.', 'error');
    }
}

async function deleteItem(id) {
    console.log(`Delete button clicked for item ID: ${id}`);
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
    try {
        sales = await getAllFromStore(SALES_STORE);
        renderSalesTable();
        console.log('Sales loaded');
    } catch (err) {
        debugLog('Error loading sales', err);
        showNotification('Error loading sales.', 'error');
    }
}

function recordSale() {
    console.log('Record Sale button clicked');
    try {
        const itemName = document.getElementById('saleItemName')?.value.trim();
        const quantity = parseInt(document.getElementById('saleQuantity')?.value) || 1;

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
        if (!tableBody) {
            showNotification('Sales table body not found.', 'error');
            return;
        }
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
    console.log('Clear Sale button clicked');
    try {
        const saleItemName = document.getElementById('saleItemName');
        const saleQuantity = document.getElementById('saleQuantity');
        if (saleItemName && saleQuantity) {
            saleItemName.value = '';
            saleQuantity.value = '1';
            saleItemName.focus();
        }
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

        const totalItemsElement = document.getElementById('totalItems');
        const totalStockElement = document.getElementById('totalStock');
        const inventoryValueElement = document.getElementById('inventoryValue');
        if (totalItemsElement && totalStockElement && inventoryValueElement) {
            totalItemsElement.textContent = totalItems;
            totalStockElement.textContent = totalStock;
            inventoryValueElement.textContent = `$${inventoryValue.toFixed(2)}`;
        }
    } catch (err) {
        debugLog('Error updating reports', err);
        showNotification('Error updating reports.', 'error');
    }
}

function renderReportsTable() {
    try {
        const tableBody = document.getElementById('reportsBody');
        if (!tableBody) {
            showNotification('Reports table body not found.', 'error');
            return;
        }
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
    console.log('Export to Excel button clicked');
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
    console.log('Export to PDF button clicked');
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
    try {
        auditLog = await getAllFromStore(AUDIT_STORE);
        renderAuditTable();
        console.log('Audit log loaded');
    } catch (err) {
        debugLog('Error loading audit log', err);
        showNotification('Error loading audit log.', 'error');
    }
}

function renderAuditTable() {
    try {
        const tableBody = document.getElementById('auditBody');
        if (!tableBody) {
            showNotification('Audit table body not found