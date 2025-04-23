import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  orderBy,
  limit,
  startAfter,
  getDoc,
  setDoc
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { notyf, renderTable, renderSalesTable, renderReports, renderAuditTable, renderLocations, updateReportsSummary } from './ui.js';

// DOM Elements
const elements = {
  itemName: document.getElementById('itemName'),
  quantity: document.getElementById('quantity'),
  category: document.getElementById('category'),
  location: document.getElementById('location'),
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
  settingsClearDbBtn: document.getElementById('settings-clear-db-btn'),
  settingsClearLogBtn: document.getElementById('settings-clear-log-btn'),
  newCategory: document.getElementById('newCategory'),
  addCategoryBtn: document.getElementById('add-category-btn')
};

// State
let lastInventoryDoc = null;
let lastSalesDoc = null;
const ITEMS_PER_PAGE = 10;
let scanner = null;
const DOT_CLASSES = [
  'None',
  'Flammable',
  'Corrosive',
  'Toxic',
  'Oxidizer',
  'Explosive',
  'Gas',
  'Radioactive',
  'Miscellaneous'
];

// Load Inventory with Pagination
async function loadInventory(searchTerm = '') {
  const db = getFirestore();
  const auth = getAuth();
  const user = auth.currentUser;
  if (!user) return;
  
  let q = query(
    collection(db, 'users', user.uid, 'inventory'),
    orderBy('name'),
    limit(ITEMS_PER_PAGE)
  );
  
  if (lastInventoryDoc) {
    q = query(q, startAfter(lastInventoryDoc));
  }
  
  try {
    const snapshot = await getDocs(q);
    lastInventoryDoc = snapshot.docs[snapshot.docs.length - 1];
    const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    if (searchTerm) {
      const filtered = items.filter(item =>
        item.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.category?.toLowerCase().includes(searchTerm.toLowerCase())
      );
      renderTable(filtered);
    } else {
      renderTable(items);
    }
    
    updateReportsSummary(await calculateSummary());
  } catch (error) {
    console.error('Error loading inventory:', error);
    notyf.error('Failed to load inventory.');
  }
}

// Load Sales with Pagination
async function loadSales() {
  const db = getFirestore();
  const auth = getAuth();
  const user = auth.currentUser;
  if (!user) return;
  
  let q = query(
    collection(db, 'users', user.uid, 'sales'),
    orderBy('timestamp', 'desc'),
    limit(ITEMS_PER_PAGE)
  );
  
  if (lastSalesDoc) {
    q = query(q, startAfter(lastSalesDoc));
  }
  
  try {
    const snapshot = await getDocs(q);
    lastSalesDoc = snapshot.docs[snapshot.docs.length - 1];
    const sales = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderSalesTable(sales);
  } catch (error) {
    console.error('Error loading sales:', error);
    notyf.error('Failed to load sales.');
  }
}

// Calculate Reports Summary
async function calculateSummary() {
  const db = getFirestore();
  const auth = getAuth();
  const user = auth.currentUser;
  if (!user) return { totalItems: 0, totalStock: 0, totalValue: 0, categories: {} };
  
  try {
    const snapshot = await getDocs(collection(db, 'users', user.uid, 'inventory'));
    const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
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
    return { totalItems, totalStock, totalValue, categories };
  } catch (error) {
    console.error('Error calculating summary:', error);
    notyf.error('Failed to generate reports.');
    return { totalItems: 0, totalStock: 0, totalValue: 0, categories: {} };
  }
}

// Add Item
async function addItem(itemData) {
  const db = getFirestore();
  const auth = getAuth();
  const user = auth.currentUser;
  if (!user) {
    notyf.error('Please log in to add items.');
    return;
  }
  
  try {
    const itemRef = await addDoc(collection(db, 'users', user.uid, 'inventory'), {
      ...itemData,
      createdAt: new Date(),
      dotClass: itemData.dotClass || 'None'
    });
    
    await addAuditLog('ADD_ITEM', itemData.name, `Added ${itemData.quantity} units`);
    notyf.success(`Added ${itemData.name} to inventory.`);
    elements.itemName.classList.add('animate-pulse');
    setTimeout(() => elements.itemName.classList.remove('animate-pulse'), 500);
  } catch (error) {
    console.error('Error adding item:', error);
    notyf.error('Failed to add item.');
  }
}

// Edit Item
async function editItem(itemId, updatedData) {
  const db = getFirestore();
  const auth = getAuth();
  const user = auth.currentUser;
  if (!user) return;
  
  try {
    await updateDoc(doc(db, 'users', user.uid, 'inventory', itemId), updatedData);
    await addAuditLog('EDIT_ITEM', updatedData.name, `Updated details`);
    notyf.success(`Updated ${updatedData.name}.`);
  } catch (error) {
    console.error('Error editing item:', error);
    notyf.error('Failed to update item.');
  }
}

// Delete Item
async function deleteItem(itemId, itemName) {
  const db = getFirestore();
  const auth = getAuth();
  const user = auth.currentUser;
  if (!user) return;
  
  try {
    await deleteDoc(doc(db, 'users', user.uid, 'inventory', itemId));
    await addAuditLog('DELETE_ITEM', itemName, `Removed from inventory`);
    notyf.success(`Deleted ${itemName}.`);
  } catch (error) {
    console.error('Error deleting item:', error);
    notyf.error('Failed to delete item.');
  }
}

// Record Sale
async function recordSale(saleData) {
  const db = getFirestore();
  const auth = getAuth();
  const user = auth.currentUser;
  if (!user) {
    notyf.error('Please log in to record sales.');
    return;
  }
  
  try {
    const snapshot = await getDocs(collection(db, 'users', user.uid, 'inventory'));
    const item = snapshot.docs.find(doc => doc.data().name === saleData.itemName);
    
    if (!item) {
      notyf.error('Item not found in inventory.');
      return;
    }
    
    const currentQuantity = parseInt(item.data().quantity || 0);
    if (currentQuantity < saleData.quantity) {
      notyf.error('Insufficient stock for sale.');
      return;
    }
    
    await addDoc(collection(db, 'users', user.uid, 'sales'), {
      ...saleData,
      timestamp: new Date()
    });
    
    await updateDoc(doc(db, 'users', user.uid, 'inventory', item.id), {
      quantity: currentQuantity - saleData.quantity
    });
    
    await addAuditLog('RECORD_SALE', saleData.itemName, `Sold ${saleData.quantity} units`);
    notyf.success(`Recorded sale of ${saleData.quantity} ${saleData.itemName}.`);
    elements.saleItemName.classList.add('animate-pulse');
    setTimeout(() => elements.saleItemName.classList.remove('animate-pulse'), 500);
  } catch (error) {
    console.error('Error recording sale:', error);
    notyf.error('Failed to record sale.');
  }
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
  const db = getFirestore();
  const auth = getAuth();
  const user = auth.currentUser;
  if (!user) return;
  
  try {
    const snapshot = await getDocs(collection(db, 'users', user.uid, 'inventory'));
    const items = snapshot.docs.map(doc => doc.data());
    
    const worksheet = XLSX.utils.json_to_sheet(items.map(item => ({
      Name: item.name,
      Quantity: item.quantity,
      Category: item.category,
      Location: item.location,
      DOTClass: item.dotClass,
      Price: item.price
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
  const db = getFirestore();
  const auth = getAuth();
  const user = auth.currentUser;
  if (!user) return;
  
  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    const snapshot = await getDocs(collection(db, 'users', user.uid, 'inventory'));
    const items = snapshot.docs.map(doc => doc.data());
    
    doc.text('ChainSync Lite - Inventory Report', 10, 10);
    doc.autoTable({
      startY: 20,
      head: [['Name', 'Quantity', 'Category', 'Location', 'DOT Class', 'Price']],
      body: items.map(item => [
        item.name,
        item.quantity,
        item.category || '-',
        item.location || '-',
        item.dotClass || 'None',
        item.price ? `$${item.price}` : '-'
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
  const db = getFirestore();
  const auth = getAuth();
  const user = auth.currentUser;
  if (!user) return;
  
  try {
    const userDocRef = doc(db, 'users', user.uid);
    const userDoc = await getDoc(userDocRef);
    const locations = userDoc.exists() && userDoc.data().locations ? userDoc.data().locations : [];
    
    if (locations.includes(location)) {
      notyf.error('Location already exists.');
      return;
    }
    
    locations.push(location);
    await setDoc(userDocRef, { locations }, { merge: true });
    renderLocations(locations, elements.location);
    notyf.success(`Added location: ${location}`);
    elements.newLocation.classList.add('animate-pulse');
    setTimeout(() => elements.newLocation.classList.remove('animate-pulse'), 500);
  } catch (error) {
    console.error('Error adding location:', error);
    notyf.error('Failed to add location.');
  }
}

async function deleteLocation(location) {
  const db = getFirestore();
  const auth = getAuth();
  const user = auth.currentUser;
  if (!user) return;
  
  try {
    const userDocRef = doc(db, 'users', user.uid);
    const userDoc = await getDoc(userDocRef);
    const locations = userDoc.exists() && userDoc.data().locations ? userDoc.data().locations : [];
    
    const updatedLocations = locations.filter(loc => loc !== location);
    await setDoc(userDocRef, { locations: updatedLocations }, { merge: true });
    renderLocations(updatedLocations, elements.location);
    notyf.success(`Deleted location: ${location}`);
  } catch (error) {
    console.error('Error deleting location:', error);
    notyf.error('Failed to delete location.');
  }
}

// Manage Categories
async function addCategory(category) {
  const db = getFirestore();
  const auth = getAuth();
  const user = auth.currentUser;
  if (!user) return;
  
  try {
    const userDocRef = doc(db, 'users', user.uid);
    const userDoc = await getDoc(userDocRef);
    const categories = userDoc.exists() && userDoc.data().categories ? userDoc.data().categories : [];
    
    if (categories.includes(category)) {
      notyf.error('Category already exists.');
      return;
    }
    
    categories.push(category);
    await setDoc(userDocRef, { categories }, { merge: true });
    renderCategoryOptions(categories);
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

// Audit Log
async function addAuditLog(action, itemName, details) {
  const db = getFirestore();
  const auth = getAuth();
  const user = auth.currentUser;
  if (!user) return;
  
  try {
    await addDoc(collection(db, 'users', user.uid, 'audit'), {
      action,
      itemName,
      details,
      timestamp: new Date()
    });
  } catch (error) {
    console.error('Error adding audit log:', error);
  }
}

// Real-Time Listeners
function setupRealtimeListeners() {
  const db = getFirestore();
  const auth = getAuth();
  const user = auth.currentUser;
  if (!user) return;
  
  onSnapshot(collection(db, 'users', user.uid, 'inventory'), () => {
    loadInventory(elements.searchInput.value);
  });
  
  onSnapshot(collection(db, 'users', user.uid, 'sales'), () => {
    loadSales();
  });
  
  onSnapshot(collection(db, 'users', user.uid, 'audit'), (snapshot) => {
    const logs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderAuditTable(logs);
  });
  
  onSnapshot(doc(db, 'users', user.uid), (docSnap) => {
    if (docSnap.exists()) {
      const data = docSnap.data();
      renderLocations(data.locations || [], elements.location);
      renderCategoryOptions(data.categories || []);
    }
  });
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
      dotClass: elements.dotClass?.value || 'None'
    };
    
    if (!itemData.name) {
      notyf.error('Item name is required.');
      return;
    }
    
    await addItem(itemData);
    elements.itemName.value = '';
    elements.quantity.value = '1';
    elements.category.value = '';
    elements.location.value = '';
  });
  
  elements.clearFormBtn.addEventListener('click', () => {
    elements.itemName.value = '';
    elements.quantity.value = '1';
    elements.category.value = '';
    elements.location.value = '';
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
    
    await recordSale(saleData);
    elements.saleItemName.value = '';
    elements.saleQuantity.value = '1';
  });
  
  elements.clearSaleFormBtn.addEventListener('click', () => {
    elements.saleItemName.value = '';
    elements.saleQuantity.value = '1';
    notyf.success('Sale form cleared.');
  });
  
  elements.searchInput.addEventListener('input', () => {
    lastInventoryDoc = null;
    loadInventory(elements.searchInput.value);
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
  
  elements.saveShopDetailsBtn.addEventListener('click', async () => {
    const db = getFirestore();
    const auth = getAuth();
    const user = auth.currentUser;
    if (!user) return;
    
    try {
      await setDoc(doc(db, 'users', user.uid), {
        shopName: elements.shopName.value.trim()
      }, { merge: true });
      notyf.success('Shop details saved.');
    } catch (error) {
      console.error('Error saving shop details:', error);
      notyf.error('Failed to save shop details.');
    }
  });
  
  elements.backupDataBtn.addEventListener('click', async () => {
    const db = getFirestore();
    const auth = getAuth();
    const user = auth.currentUser;
    if (!user) return;
    
    try {
      const inventory = await getDocs(collection(db, 'users', user.uid, 'inventory'));
      const sales = await getDocs(collection(db, 'users', user.uid, 'sales'));
      const audit = await getDocs(collection(db, 'users', user.uid, 'audit'));
      
      const backup = {
        inventory: inventory.docs.map(doc => ({ id: doc.id, ...doc.data() })),
        sales: sales.docs.map(doc => ({ id: doc.id, ...doc.data() })),
        audit: audit.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      };
      
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'chainsync_backup.json';
      a.click();
      URL.revokeObjectURL(url);
      
      notyf.success('Data backed up successfully.');
    } catch (error) {
      console.error('Error backing up data:', error);
      notyf.error('Failed to backup data.');
    }
  });
  
  elements.settingsClearDbBtn.addEventListener('click', async () => {
    if (!confirm('Are you sure you want to reset all data? This cannot be undone.')) return;
    
    const db = getFirestore();
    const auth = getAuth();
    const user = auth.currentUser;
    if (!user) return;
    
    try {
      const collections = ['inventory', 'sales', 'audit'];
      for (const col of collections) {
        const snapshot = await getDocs(collection(db, 'users', user.uid, col));
        for (const docSnap of snapshot.docs) {
          await deleteDoc(doc(db, 'users', user.uid, col, docSnap.id));
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
    
    const db = getFirestore();
    const auth = getAuth();
    const user = auth.currentUser;
    if (!user) return;
    
    try {
      const snapshot = await getDocs(collection(db, 'users', user.uid, 'audit'));
      for (const docSnap of snapshot.docs) {
        await deleteDoc(doc(db, 'users', user.uid, 'audit', docSnap.id));
      }
      notyf.success('Audit log cleared.');
    } catch (error) {
      console.error('Error clearing audit log:', error);
      notyf.error('Failed to clear audit log.');
    }
  });
  
  elements.inventoryBody.addEventListener('click', async (e) => {
    const editBtn = e.target.closest('.edit-item-btn');
    const deleteBtn = e.target.closest('.delete-item-btn');
    
    if (editBtn) {
      const itemId = editBtn.dataset.id;
      const itemName = prompt('Enter new item name:', editBtn.closest('tr').children[0].textContent);
      if (itemName) {
        await editItem(itemId, { name: itemName });
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
  
  await loadInventory();
  await loadSales();
  setupRealtimeListeners();
  setupKeyboardShortcuts();
}

export { initInventory };
