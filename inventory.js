import {
  saveItem,
  updateItem,
  deleteItem,
  saveSale,
  bulkImport,
  backupData,
  restoreData,
  saveUserSettings,
  loadUserSettings,
  addAuditLog,
  setupRealtimeListeners
} from './db.js';
import { notyf, renderTable, renderSalesTable, renderReports, renderAuditTable, renderLocations, updateReportsSummary } from './ui.js';
import { validateItem, parseCSV, formatDate, formatCurrency, formatNumber } from './utils.js';

// DOM Elements
const elements = {
  itemName: document.getElementById('itemName'),
  quantity: document.getElementById('quantity'),
  category: document.getElementById('category'),
  location: document.getElementById('location'),
  dotClass: document.getElementById('dotClass'),
  saleItemName: document.getElementById('saleItemName'),
  saleQuantity: document.getElementById('saleQuantity'),
  searchInput: document.getElementById('searchInput'),
  quickAddBtn: document.getElementById('quick-add-item-btn'),
  clearFormBtn: document.getElementById('clear-form-btn'),
  startScanBtn: document.getElementById('start-scan-btn'),
  scanModal: document.getElementById('scanModal'),
  reader: document.getElementById('reader'),
  cancelScanBtn: document.getElementById('cancel-scan-btn'),
  scanModalCloseBtn: document.getElementById('scan-modal-close-btn'),
  recordSaleBtn: document.getElementById('record-sale-btn'),
  clearSaleFormBtn: document.getElementById('clear-sale-form-btn'),
  reportExportExcelBtn: document.getElementById('report-export-excel-btn'),
  reportExportPdfBtn: document.getElementById('report-export-pdf-btn'),
  shopName: document.getElementById('shopName'),
  newLocation: document.getElementById('newLocation'),
  addLocationBtn: document.getElementById('add-location-btn'),
  saveShopDetailsBtn: document.getElementById('save-shop-details-btn'),
  debugMode: document.getElementById('debugMode'),
  backupDataBtn: document.getElementById('backup-data-btn'),
  restoreDataBtn: document.getElementById('restore-data-btn'),
  settingsClearDbBtn: document.getElementById('settings-clear-db-btn'),
  settingsClearLogBtn: document.getElementById('settings-clear-log-btn'),
  newCategory: document.getElementById('newCategory'),
  addCategoryBtn: document.getElementById('add-category-btn'),
  lowStockThreshold: document.getElementById('lowStockThreshold'),
  saveSettingsBtn: document.getElementById('save-settings-btn'),
  bulkUploadBtn: document.getElementById('bulk-upload-btn'),
  bulkUploadInput: document.getElementById('bulk-upload-input')
};

// State
let scanner = null;
let unsubscribeListeners = null;

// Load Inventory
function loadInventory(items, searchTerm = '') {
  if (searchTerm) {
    const filtered = items.filter(item =>
      item.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.category?.toLowerCase().includes(searchTerm.toLowerCase())
    );
    renderTable(filtered);
  } else {
    renderTable(items);
  }
  updateReportsSummary(calculateSummary(items));
}

// Calculate Reports Summary
function calculateSummary(items) {
  const categories = {};
  let totalItems = 0;
  let totalStock = 0;
  let totalValue = 0;
  
  items.forEach(item => {
    const category = item.category || 'Uncategorized';
    if (!categories[category]) {
      categories[category] = { totalItems: 0, totalQuantity: 0 };
    }
    categories[category].totalItems += 1;
    categories[category].totalQuantity += parseInt(item.quantity || 0);
    totalItems += 1;
    totalStock += parseInt(item.quantity || 0);
    totalValue += (parseFloat(item.price) || 0) * (parseInt(item.quantity) || 0);
  });
  
  renderReports(categories);
  return {
    totalItems: formatNumber(totalItems),
    totalStock: formatNumber(totalStock),
    totalValue: formatCurrency(totalValue),
    categories
  };
}

// Barcode Scanner
function startScanner() {
  elements.scanModal.classList.remove('hidden');
  elements.reader.classList.add('border-4', 'border-blue-500', 'animate-pulse');
  
  scanner = new Html5Qrcode('reader');
  scanner.start(
    { facingMode: 'environment' },
    { fps: 10, qrbox: { width: 250, height: 250 } },
    (decodedText) => {
      elements.itemName.value = decodedText;
      stopScanner();
      notyf.success('Barcode scanned successfully.');
      elements.itemName.focus();
    },
    (error) => {
      if (elements.debugMode.checked) {
        console.warn('QR Code scan error:', error);
      }
    }
  ).catch(err => {
    console.error('Error starting scanner:', err);
    notyf.error('Failed to access camera. Please check permissions.');
    stopScanner();
  });
}

function stopScanner() {
  if (scanner) {
    scanner.stop().then(() => {
      scanner = null;
      elements.scanModal.classList.add('hidden');
      elements.reader.classList.remove('border-4', 'border-blue-500', 'animate-pulse');
    }).catch(err => {
      console.error('Error stopping scanner:', err);
      notyf.error('Failed to stop scanner.');
    });
  }
}

// Export to Excel
async function exportToExcel() {
  try {
    const backup = await backupData();
    if (!backup) return;
    
    const worksheet = XLSX.utils.json_to_sheet(backup.inventory.map(item => ({
      Name: item.name,
      Quantity: formatNumber(item.quantity),
      Category: item.category,
      Location: item.location,
      DOTClass: item.dotClass,
      Price: item.price ? formatCurrency(item.price) : '-'
    })));
    
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Inventory');
    XLSX.writeFile(workbook, 'inventory_export.xlsx');
    
    await addAuditLog('EXPORT_EXCEL', null, 'Exported inventory to Excel');
    notyf.success('Inventory exported to Excel.');
  } catch (error) {
    console.error('Error exporting to Excel:', error);
    notyf.error('Failed to export inventory.');
  }
}

// Export to PDF
async function exportToPDF() {
  try {
    const backup = await backupData();
    if (!backup) return;
    
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    doc.text('ChainSync Lite - Inventory Report', 10, 10);
    doc.autoTable({
      startY: 20,
      head: [['Name', 'Quantity', 'Category', 'Location', 'DOT Class', 'Price']],
      body: backup.inventory.map(item => [
        item.name,
        formatNumber(item.quantity),
        item.category || '-',
        item.location || '-',
        item.dotClass || 'None',
        item.price ? formatCurrency(item.price) : '-'
      ])
    });
    
    doc.save('inventory_report.pdf');
    await addAuditLog('EXPORT_PDF', null, 'Exported inventory to PDF');
    notyf.success('Inventory exported to PDF.');
  } catch (error) {
    console.error('Error exporting to PDF:', error);
    notyf.error('Failed to export inventory.');
  }
}

// Manage Locations
async function addLocation(location) {
  try {
    const settings = await loadUserSettings();
    const locations = settings?.locations || [];
    
    if (locations.includes(location)) {
      notyf.error('Location already exists.');
      return;
    }
    
    locations.push(location);
    await saveUserSettings({ locations });
    notyf.success(`Added location: ${location}`);
    elements.newLocation.classList.add('animate-pulse');
    setTimeout(() => elements.newLocation.classList.remove('animate-pulse'), 500);
  } catch (error) {
    console.error('Error adding location:', error);
    notyf.error('Failed to add location.');
  }
}

async function deleteLocation(location) {
  try {
    const settings = await loadUserSettings();
    const locations = (settings?.locations || []).filter(loc => loc !== location);
    await saveUserSettings({ locations });
    notyf.success(`Deleted location: ${location}`);
  } catch (error) {
    console.error('Error deleting location:', error);
    notyf.error('Failed to delete location.');
  }
}

// Manage Categories
async function addCategory(category) {
  try {
    const settings = await loadUserSettings();
    const categories = settings?.categories || [];
    
    if (categories.includes(category)) {
      notyf.error('Category already exists.');
      return;
    }
    
    categories.push(category);
    await saveUserSettings({ categories });
    notyf.success(`Added category: ${category}`);
  } catch (error) {
    console.error('Error adding category:', error);
    notyf.error('Failed to add category.');
  }
}

async function renderCategoryOptions(categories) {
  const categorySelect = document.createElement('select');
  categorySelect.id = 'category';
  categorySelect.className = 'tw-input';
  categorySelect.setAttribute('aria-label', 'Category');
  
  categorySelect.innerHTML = '<option value="">Select or type category</option>';
  (categories || []).forEach(cat => {
    const option = document.createElement('option');
    option.value = cat;
    option.textContent = cat;
    categorySelect.appendChild(option);
  });
  
  elements.category.replaceWith(categorySelect);
  elements.category = categorySelect;
}

// Keyboard Shortcuts
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'Enter' && elements.itemName === document.activeElement) {
      elements.quickAddBtn.click();
    }
    if (e.ctrlKey && e.key === 's') {
      e.preventDefault();
      elements.startScanBtn.click();
    }
    if (e.ctrlKey && e.key === 'r' && elements.saleItemName === document.activeElement) {
      elements.recordSaleBtn.click();
    }
  });
}

// Initialize Inventory
async function initInventory() {
  if (!elements.quickAddBtn || !elements.clearFormBtn || !elements.startScanBtn) {
    console.error('Required DOM elements not found.');
    notyf.error('Application initialization failed.');
    return;
  }
  
  elements.quickAddBtn.addEventListener('click', async () => {
    const itemData = {
      name: elements.itemName.value.trim(),
      quantity: parseInt(elements.quantity.value) || 1,
      category: elements.category.value.trim(),
      location: elements.location.value.trim(),
      dotClass: elements.dotClass.value || 'None',
      price: parseFloat(elements.price?.value) || undefined
    };
    
    if (!validateItem(itemData)) return;
    
    await saveItem(itemData);
    elements.itemName.value = '';
    elements.quantity.value = '1';
    elements.category.value = '';
    elements.location.value = '';
    elements.dotClass.value = 'None';
    elements.price.value = '';
  });
  
  elements.clearFormBtn.addEventListener('click', () => {
    elements.itemName.value = '';
    elements.quantity.value = '1';
    elements.category.value = '';
    elements.location.value = '';
    elements.dotClass.value = 'None';
    elements.price.value = '';
    notyf.success('Form cleared.');
  });
  
  elements.startScanBtn.addEventListener('click', startScanner);
  elements.cancelScanBtn.addEventListener('click', stopScanner);
  elements.scanModalCloseBtn.addEventListener('click', stopScanner);
  
  elements.recordSaleBtn.addEventListener('click', async () => {
    const saleData = {
      itemName: elements.saleItemName.value.trim(),
      quantity: parseInt(elements.saleQuantity.value) || 1
    };
    
    if (!saleData.itemName) {
      notyf.error('Item name is required.');
      return;
    }
    
    await saveSale(saleData);
    elements.saleItemName.value = '';
    elements.saleQuantity.value = '1';
  });
  
  elements.clearSaleFormBtn.addEventListener('click', () => {
    elements.saleItemName.value = '';
    elements.saleQuantity.value = '1';
    notyf.success('Sale form cleared.');
  });
  
  elements.searchInput.addEventListener('input', () => {
    loadInventory(currentItems, elements.searchInput.value);
  });
  
  elements.reportExportExcelBtn.addEventListener('click', exportToExcel);
  elements.reportExportPdfBtn.addEventListener('click', exportToPDF);
  
  elements.addLocationBtn.addEventListener('click', () => {
    const location = elements.newLocation.value.trim();
    if (!location) {
      notyf.error('Location name is required.');
      return;
    }
    addLocation(location);
    elements.newLocation.value = '';
  });
  
  elements.addCategoryBtn.addEventListener('click', () => {
    const category = elements.newCategory.value.trim();
    if (!category) {
      notyf.error('Category name is required.');
      return;
    }
    addCategory(category);
    elements.newCategory.value = '';
  });
  
  elements.saveShopDetailsBtn.addEventListener('click', async () => {
    try {
      await saveUserSettings({ shopName: elements.shopName.value.trim() });
      notyf.success('Shop details saved.');
    } catch (error) {
      console.error('Error saving shop details:', error);
      notyf.error('Failed to save shop details.');
    }
  });
  
  elements.backupDataBtn.addEventListener('click', async () => {
    const backup = await backupData();
    if (!backup) return;
    
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'chainsync_backup.json';
    a.click();
    URL.revokeObjectURL(url);
    
    notyf.success('Data backed up successfully.');
  });
  
  elements.restoreDataBtn.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      
      try {
        const text = await file.text();
        const backup = JSON.parse(text);
        await restoreData(backup);
      } catch (error) {
        console.error('Error restoring data:', error);
        notyf.error('Failed to restore data.');
      }
    };
    input.click();
  });
  
  elements.bulkUploadBtn.addEventListener('click', () => {
    elements.bulkUploadInput.click();
  });
  
  elements.bulkUploadInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    try {
      const items = await parseCSV(file);
      if (items.length > 0) {
        await bulkImport(items);
        notyf.success(`Imported ${items.length} items.`);
      }
      elements.bulkUploadInput.value = '';
    } catch (error) {
      console.error('Error during bulk upload:', error);
      notyf.error('Failed to import items.');
    }
  });
  
  elements.settingsClearDbBtn.addEventListener('click', async () => {
    if (!confirm('Are you sure you want to reset all data? This cannot be undone.')) return;
    
    try {
      const collections = ['inventory', 'sales', 'audit'];
      for (const col of collections) {
        const snapshot = await getDocs(collection(db, 'users', auth.currentUser.uid, col));
        for (const docSnap of snapshot.docs) {
          await deleteDoc(doc(db, 'users', auth.currentUser.uid, col, docSnap.id));
        }
      }
      notyf.success('All data reset.');
    } catch (error) {
      console.error('Error resetting data:', error);
      notyf.error('Failed to reset data.');
    }
  });
  
  elements.settingsClearLogBtn.addEventListener('click', async () => {
    if (!confirm('Are you sure you want to clear the audit log? This cannot be undone.')) return;
    
    try {
      const snapshot = await getDocs(collection(db, 'users', auth.currentUser.uid, 'audit'));
      for (const docSnap of snapshot.docs) {
        await deleteDoc(doc(db, 'users', auth.currentUser.uid, 'audit', docSnap.id));
      }
      notyf.success('Audit log cleared.');
    } catch (error) {
      console.error('Error clearing audit log:', error);
      notyf.error('Failed to clear audit log.');
    }
  });
  
  elements.saveSettingsBtn.addEventListener('click', async () => {
    try {
      await saveUserSettings({
        lowStockThreshold: parseInt(elements.lowStockThreshold.value) || 10
      });
      notyf.success('Settings saved.');
    } catch (error) {
      console.error('Error saving settings:', error);
      notyf.error('Failed to save settings.');
    }
  });
  
  elements.inventoryBody.addEventListener('click', async (e) => {
    const editBtn = e.target.closest('.edit-item-btn');
    const deleteBtn = e.target.closest('.delete-item-btn');
    
    if (editBtn) {
      const itemId = editBtn.dataset.id;
      const itemName = prompt('Enter new item name:', editBtn.closest('tr').children[0].textContent);
      if (itemName) {
        await updateItem(itemId, { name: itemName });
      }
    }
    
    if (deleteBtn) {
      const itemId = deleteBtn.dataset.id;
      const itemName = deleteBtn.closest('tr').children[0].textContent;
      if (confirm(`Are you sure you want to delete ${itemName}?`)) {
        await deleteItem(itemId, itemName);
      }
    }
  });
  
  elements.locationList.addEventListener('click', (e) => {
    const deleteBtn = e.target.closest('.delete-location-btn');
    if (deleteBtn) {
      const location = deleteBtn.dataset.location;
      if (confirm(`Are you sure you want to delete ${location}?`)) {
        deleteLocation(location);
      }
    }
  });
  
  // Setup Real-Time Listeners
  let currentItems = [];
  unsubscribeListeners = setupRealtimeListeners({
    onInventoryUpdate: (items) => {
      currentItems = items;
      loadInventory(items, elements.searchInput.value);
    },
    onSalesUpdate: (sales) => {
      renderSalesTable(sales);
    },
    onAuditUpdate: (logs) => {
      renderAuditTable(logs);
    },
    onSettingsUpdate: (data) => {
      renderLocations(data.locations, elements.location);
      renderCategoryOptions(data.categories);
    }
  });
  
  setupKeyboardShortcuts();
}

// Cleanup
window.addEventListener('beforeunload', () => {
  if (unsubscribeListeners) {
    unsubscribeListeners();
  }
});

export { initInventory };
