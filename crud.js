 // crud.js - Create, Read, Update, Delete operations and Import/Export (Firestore Version)

 import { db } from './firebaseConfig.js'; // Import Firestore instance
 import { getCurrentUserId } from './auth.js'; // Import function to get current user ID
 import { showNotification } from './notifications.js';
 import { getTimestamp } from './utils.js';
 import {
     renderTable, updateAnalytics, updateFiltersAndSuggestions,
     clearForm as clearFormUI, updateBatchActionButtons, showSection, closeModal,
     renderSalesTable, renderAuditTable, updateReports, updateLocationDropdown,
     populateCategoryDropdowns, renderCustomCategoryList, renderHistoryLogTable // Added missing UI imports
 } from './ui.js';
 import {
    collection, addDoc, updateDoc, deleteDoc, doc, // Core Firestore functions
    query, where, orderBy, limit, // Querying functions
    serverTimestamp, // Use server timestamp for consistency
    writeBatch, // For batch operations
    getDocs, getDoc // For non-realtime reads if needed (e.g., checking existence)
 } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

 // Collection names in Firestore
 const INVENTORY_COLLECTION = 'inventory';
 const SALES_COLLECTION = 'sales';
 const AUDIT_COLLECTION = 'audit';
 const SETTINGS_COLLECTION = 'settings'; // Store settings per user
 const CATEGORIES_COLLECTION = 'categories'; // Store categories per user

 // --- Helper to Log Audit ---
 async function logAction(action, itemName = 'N/A', details = {}) {
    const userId = getCurrentUserId();
    if (!userId) { console.warn("Cannot log action, user not logged in."); return; }
    console.log(`Logging action: ${action} for item: ${itemName}`);
    const logEntry = {
        userId: userId, // Associate log with user
        timestamp: serverTimestamp(), // Use Firestore server timestamp
        action: action,
        itemName: itemName,
        details: JSON.stringify(details) // Keep details as string or use nested object
    };
    try {
        await addDoc(collection(db, AUDIT_COLLECTION), logEntry);
        console.log("Audit entry added");
        // No need to manually refresh UI if using Firestore listeners
    } catch (error) {
        console.error('Error adding audit log entry:', error);
    }
 }


 // --- Inventory CRUD (Using Firestore) ---

 // loadInventory is now handled by real-time listener in app.js

 // Add/Update using Firestore addDoc/updateDoc
 export async function quickAddItem() {
    const userId = getCurrentUserId();
    if (!userId) { showNotification('Please log in to add items.', 'error'); return; }

    const itemNameInput = document.getElementById('itemName');
    const quantityInput = document.getElementById('quantity');
    const categoryInput = document.getElementById('category');
    const locationSelect = document.getElementById('location');

    const itemName = itemNameInput?.value.trim();
    const quantity = parseInt(quantityInput?.value) || 1;
    const category = categoryInput?.value.trim() || 'Uncategorized';
    const location = locationSelect?.value || 'Store';

    if (!itemName) { showNotification('Item name is required.', 'error'); return; }
    if (quantity < 1) { showNotification('Quantity must be at least 1.', 'error'); return; }

    console.log(`Attempting to add/update: ${itemName}, Qty: ${quantity}`);

    try {
        // Check if item already exists for this user (requires a query)
        const inventoryRef = collection(db, INVENTORY_COLLECTION);
        const q = query(inventoryRef,
            where("userId", "==", userId),
            where("itemName", "==", itemName),
            // where("location", "==", location), // Add location check if needed
            limit(1) // We only need to know if one exists
        );

        const querySnapshot = await getDocs(q);
        let existingDoc = null;
        querySnapshot.forEach((doc) => { // Should be at most one due to limit(1)
            existingDoc = { id: doc.id, ...doc.data() };
        });

        if (existingDoc) {
            // Update existing item's quantity
            const newQuantity = (existingDoc.quantity || 0) + quantity;
            const itemRef = doc(db, INVENTORY_COLLECTION, existingDoc.id);
            await updateDoc(itemRef, {
                quantity: newQuantity,
                updatedAt: serverTimestamp() // Update timestamp
            });
            logAction('update_quantity', itemName, { quantity_change: quantity, location: location });
            showNotification(`Updated quantity for ${itemName}.`, 'success');
        } else {
            // Add new item document
            const newItem = {
                userId: userId,
                itemName: itemName,
                quantity: quantity,
                category: category,
                location: location,
                customFields: {}, // Initialize custom fields
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            };
            const docRef = await addDoc(inventoryRef, newItem);
            logAction('add', itemName, { quantity: quantity, category: category, location: location });
            showNotification(`Item '${itemName}' added.`, 'success');
            console.log("Document written with ID: ", docRef.id);
        }
        clearFormUI(); // Clear form after successful operation
        // No explicit loadInventory() needed due to real-time listener

    } catch (error) {
        console.error('Error adding/updating item:', error);
        showNotification(`Error saving item: ${error.message || error}`, 'error');
    }
 }

 // Delete using Firestore deleteDoc
 export async function deleteItem(itemId) { // Expects Firestore document ID
    const userId = getCurrentUserId();
    if (!userId) { showNotification('Please log in.', 'error'); return; }
    if (!itemId) { console.error("deleteItem called with invalid ID"); return; }

    // Get item details for logging *before* deleting
    let itemNameForLog = `Item ID ${itemId}`; // Fallback name
    try {
        const itemRef = doc(db, INVENTORY_COLLECTION, itemId);
        const itemSnap = await getDoc(itemRef);
        if (itemSnap.exists() && itemSnap.data().userId === userId) { // Security check
            itemNameForLog = itemSnap.data().itemName || itemNameForLog;
            if (!confirm(`Delete '${itemNameForLog}'?`)) return;

            await deleteDoc(itemRef);
            logAction('delete', itemNameForLog, { id: itemId });
            showNotification(`Item '${itemNameForLog}' deleted.`, 'success');
            // UI update handled by listener
        } else {
            console.error(`Item ${itemId} not found or permission denied for user ${userId}.`);
            showNotification('Item not found or cannot be deleted.', 'error');
        }
    } catch (error) {
        console.error('Error deleting item:', error);
        showNotification(`Error deleting item: ${error.message || error}`, 'error');
    }
 }

 // --- Sales CRUD ---
 // loadSales is handled by listener in app.js

 export async function recordSale() {
    const userId = getCurrentUserId();
    if (!userId) { showNotification('Please log in.', 'error'); return; }

    const itemNameInput = document.getElementById('saleItemName');
    const quantityInput = document.getElementById('saleQuantity');
    const itemName = itemNameInput?.value.trim();
    const quantity = parseInt(quantityInput?.value) || 1;

    if (!itemName) { showNotification('Item name is required for sale.', 'error'); return; }
    if (quantity < 1) { showNotification('Sale quantity must be at least 1.', 'error'); return; }

    console.log(`Recording sale for ${quantity} of ${itemName}`);

    // Use a Firestore Transaction to ensure atomic update
    const inventoryRef = collection(db, INVENTORY_COLLECTION);
    const salesRef = collection(db, SALES_COLLECTION);

    try {
        // Find the item first (case-insensitive might be better)
        const q = query(inventoryRef,
            where("userId", "==", userId),
            where("itemName", "==", itemName),
            limit(1));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            throw new Error(`Item '${itemName}' not found in inventory.`);
        }

        const itemDocSnapshot = querySnapshot.docs[0];
        const itemData = itemDocSnapshot.data();
        const itemId = itemDocSnapshot.id;

        if ((itemData.quantity || 0) < quantity) {
            throw new Error(`Insufficient stock for '${itemName}'. Available: ${itemData.quantity || 0}`);
        }

        // Prepare updates
        const newQuantity = (itemData.quantity || 0) - quantity;
        const itemDocRef = doc(db, INVENTORY_COLLECTION, itemId);
        const saleDocData = {
            userId: userId,
            timestamp: serverTimestamp(),
            itemName: itemName,
            quantity: quantity,
            itemId: itemId // Store reference to inventory item ID
        };

        // Perform updates in a batch for atomicity (though transaction might be safer for read-modify-write)
        const batch = writeBatch(db);
        batch.update(itemDocRef, { quantity: newQuantity, updatedAt: serverTimestamp() });
        batch.set(doc(salesRef), saleDocData); // Create new doc in sales collection

        await batch.commit(); // Commit the batch

        logAction('sale', itemName, { quantity_sold: quantity, new_stock: newQuantity });
        showNotification('Sale recorded.', 'success');
        clearSaleForm();
        // UI updates handled by listeners

    } catch (error) {
        console.error('Error recording sale:', error);
        showNotification(`Error recording sale: ${error.message || error}`, 'error');
    }
 }

 export function clearSaleForm() {
    const nameInput = document.getElementById('saleItemName');
    const quantityInput = document.getElementById('saleQuantity');
    if (nameInput) nameInput.value = '';
    if (quantityInput) quantityInput.value = '1';
    nameInput?.focus();
 }

 // --- Audit Log CRUD ---
 // loadAuditLog is handled by listener in app.js

 export async function clearHistoryLog() {
    const userId = getCurrentUserId();
    if (!userId) { showNotification('Please log in.', 'error'); return; }
    if (!confirm('Delete ALL audit log entries for your user?')) return;

    console.log("Clearing audit log for user:", userId);
    try {
        const auditRef = collection(db, AUDIT_COLLECTION);
        const q = query(auditRef, where("userId", "==", userId));
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            showNotification('Audit log is already empty.', 'info');
            return;
        }

        // Delete documents in a batch
        const batch = writeBatch(db);
        snapshot.docs.forEach(doc => {
            batch.delete(doc.ref);
        });
        await batch.commit();

        console.log(`Deleted ${snapshot.size} audit log entries.`);
        window.state.auditLog = []; // Update local state
        renderAuditTable(); // Re-render UI
        showNotification('Audit log cleared.', 'success');
    } catch (error) {
        console.error('Error clearing audit log:', error);
        showNotification('Error clearing audit log.', 'error');
    }
 }

 // --- Settings CRUD ---
 // loadSettings is handled by listener in app.js

 export async function saveSettings(key, value) {
    const userId = getCurrentUserId();
    if (!userId) { showNotification('Please log in to save settings.', 'error'); return; }
    console.log(`Saving setting: ${key} =`, value);
    try {
        // Settings stored in a single document per user for simplicity
        const settingsDocRef = doc(db, SETTINGS_COLLECTION, userId); // Use userId as document ID
        // Use updateDoc with dot notation to update specific fields, or setDoc with merge:true
        await updateDoc(settingsDocRef, { [key]: value, updatedAt: serverTimestamp() })
            .catch(async (error) => {
                // If the document doesn't exist yet, create it with setDoc
                if (error.code === 'not-found') {
                    console.log("Settings doc not found, creating...");
                    await setDoc(settingsDocRef, { [key]: value, userId: userId, updatedAt: serverTimestamp() });
                } else {
                    throw error; // Re-throw other errors
                }
            });

        console.log(`Setting ${key} saved.`);
        // Update local state immediately (listener might take time)
        if (!window.state.settings) window.state.settings = {};
        window.state.settings[key] = value;
    } catch (error) {
        console.error('Error saving settings:', error);
        showNotification('Error saving settings.', 'error');
    }
 }

 export function addLocation() {
    const locationInput = document.getElementById('newLocation');
    const location = locationInput?.value.trim();
    if (location) {
        const currentLocations = window.state.settings.locations || [];
        if (!currentLocations.includes(location)) {
            const newLocations = [...currentLocations, location].sort();
            saveSettings('locations', newLocations); // Save updated array
            updateLocationDropdown(); // Update UI immediately
            if(locationInput) locationInput.value = '';
            showNotification('Location added.', 'success');
        } else {
            showNotification('Location already exists.', 'info');
        }
    } else {
        showNotification('Please enter a location name.', 'error');
    }
 }

 // --- Category CRUD (Simplified - Dynamic based on items) ---
 export async function loadCategories() {
    console.log("Loading categories (dynamic from inventory)...");
    if (!window.state?.inventory) return; // Wait for inventory
    const categoriesFromItems = [...new Set(window.state.inventory.map(item => item.category || 'Uncategorized'))];
    window.state.customCategories = categoriesFromItems.filter(cat => cat !== 'Uncategorized').sort();
    populateCategoryDropdowns();
 }
 export async function addCustomCategory() {
    showNotification("Categories are added automatically when you use them on an item.", "info");
 }
 export async function deleteCustomCategory(categoryName) {
    showNotification("To remove a category, remove it from all items.", "info");
 }


 // --- Data Management ---
 export async function backupData() {
    const userId = getCurrentUserId();
    if (!userId) { showNotification('Please log in to backup data.', 'error'); return; }
    console.log("Starting data backup for user:", userId);
    try {
        // Fetch current data directly for backup
        const invRef = collection(db, INVENTORY_COLLECTION);
        const salesRef = collection(db, SALES_COLLECTION);
        const auditRef = collection(db, AUDIT_COLLECTION);
        const settingsRef = doc(db, SETTINGS_COLLECTION, userId);

        const invQuery = query(invRef, where("userId", "==", userId));
        const salesQuery = query(salesRef, where("userId", "==", userId), orderBy("timestamp", "desc"));
        const auditQuery = query(auditRef, where("userId", "==", userId), orderBy("timestamp", "desc"));

        const [invSnap, salesSnap, auditSnap, settingsSnap] = await Promise.all([
            getDocs(invQuery),
            getDocs(salesQuery),
            getDocs(auditQuery),
            getDoc(settingsRef)
        ]);

        const inventoryData = invSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const salesData = salesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const auditData = auditSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const settingsData = settingsSnap.exists() ? settingsSnap.data() : {};

        const backup = {
            firebaseProjectId: db.app.options.projectId, // Add project ID context
            userId: userId,
            timestamp: new Date().toISOString(),
            inventory: inventoryData,
            sales: salesData,
            audit: auditData,
            settings: settingsData
        };

        const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const dateStr = new Date().toISOString().slice(0, 10);
        a.download = `chainsync_backup_${userId.substring(0, 6)}_${dateStr}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showNotification('Data backup created.', 'success');
    } catch (error) {
        console.error('Error backing up data:', error);
        showNotification('Error backing up data.', 'error');
    }
 }

 export async function clearDatabase() {
    const userId = getCurrentUserId();
    if (!userId) { showNotification('Please log in.', 'error'); return; }
    if (!confirm('Reset ALL your data (inventory, sales, audit, settings)? This cannot be undone.')) return;

    console.log("Clearing all data for user:", userId);
    try {
        const collectionsToClear = [INVENTORY_COLLECTION, SALES_COLLECTION, AUDIT_COLLECTION];
        const batch = writeBatch(db);

        // Delete documents from collections
        for (const collName of collectionsToClear) {
            const collRef = collection(db, collName);
            const q = query(collRef, where("userId", "==", userId));
            const snapshot = await getDocs(q);
            snapshot.docs.forEach(doc => batch.delete(doc.ref));
        }

        // Delete settings document
        const settingsDocRef = doc(db, SETTINGS_COLLECTION, userId);
        batch.delete(settingsDocRef); // Delete settings doc too

        await batch.commit();
        console.log("All user data cleared from Firestore.");

        // Reset local state immediately
        window.state.inventory = [];
        window.state.sales = [];
        window.state.auditLog = [];
        window.state.settings = { theme: 'light', shopName: '', locations: [], debugMode: false };
        window.state.selectedItems.clear();
        window.state.editId = null;
        window.state.currentPage = 1;

        // Re-render UI (will show empty states)
        renderTable();
        renderSalesTable();
        renderAuditTable();
        updateReports();
        updateLocationDropdown();
        // Apply default theme?
        document.documentElement.classList.remove('dark');
        const darkThemeEl = document.getElementById('darkTheme');
        if (darkThemeEl) darkThemeEl.checked = false;


        showNotification('All application data has been reset.', 'success');
    } catch (error) {
        console.error('Error clearing database:', error);
        showNotification('Error clearing database.', 'error');
    }
 }


 // --- Import/Export --- (Needs adaptation for Firestore)

 export async function exportToCSV() {
     // Needs to use window.state.inventory which is populated by the listener
     if (window.state.inventory.length === 0) { showNotification('No inventory data to export.', 'info'); return; }
     const headers = ['Item Name', 'Quantity', 'Category', 'Location']; // Match Firestore fields
     const rows = window.state.inventory.map(item => [
         item.itemName, item.quantity, item.category, item.location
     ].map(value => `"${String(value ?? '').replace(/"/g, '""')}"`).join(','));
     const csvContent = [headers.join(','), ...rows].join('\n');
     // ... (rest of blob/download logic remains the same) ...
     const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
     const url = URL.createObjectURL(blob);
     const link = document.createElement('a');
     link.setAttribute('href', url);
     link.setAttribute('download', 'inventory_export.csv');
     link.style.visibility = 'hidden';
     document.body.appendChild(link);
     link.click();
     document.body.removeChild(link);
     URL.revokeObjectURL(url);
     showNotification('Inventory exported to CSV.', 'success');
 }

 export async function exportToExcel() {
     if (window.state.inventory.length === 0) { showNotification('No inventory data to export.', 'info'); return; }
     if (typeof XLSX === 'undefined') { showNotification('Excel library not loaded.', 'error'); return; }
     const dataToExport = window.state.inventory.map(item => ({
         'Item Name': item.itemName, 'Quantity': item.quantity, 'Category': item.category, 'Location': item.location
     }));
     // ... (rest of XLSX logic remains the same) ...
     const ws = XLSX.utils.json_to_sheet(dataToExport);
     ws['!cols'] = [ {wch:25}, {wch:10}, {wch:20}, {wch:20} ];
     const wb = XLSX.utils.book_new();
     XLSX.utils.book_append_sheet(wb, ws, "Inventory");
     XLSX.writeFile(wb, "inventory_export.xlsx");
     showNotification('Inventory exported to Excel.', 'success');
 }

 export async function exportToPDF() {
    if (window.state.inventory.length === 0) { showNotification('No inventory data to export.', 'info'); return; }
    if (typeof jspdf === 'undefined' || !window.jspdf.jsPDF?.autoTable) { showNotification('PDF library not loaded correctly.', 'error'); return; }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const tableColumn = ["Item Name", "Quantity", "Category", "Location"];
    const tableRows = window.state.inventory.map(item => [ item.itemName, item.quantity, item.category, item.location ]);
    // ... (rest of PDF generation logic remains the same) ...
    doc.setFontSize(18);
    doc.text(`${window.state.settings.shopName || 'Inventory'} Report`, 14, 22);
    doc.setFontSize(11); doc.setTextColor(100); doc.text(`Generated: ${new Date().toLocaleDateString()}`, 14, 29);
    doc.autoTable({ head: [tableColumn], body: tableRows, startY: 35, theme: 'grid', headStyles: { fillColor: [34, 197, 94] }, styles: { fontSize: 9, cellPadding: 2 }, columnStyles: { 0: { cellWidth: 'auto' }, 1: { cellWidth: 20, halign: 'right' }, 2: { cellWidth: 40 }, 3: { cellWidth: 40 } } });
    doc.save('inventory_report.pdf');
    showNotification('Inventory exported to PDF.', 'success');
 }


 export async function importFromCSV() {
     // This needs significant changes to use Firestore's addDoc/updateDoc
     // It should likely process rows and call quickAddItem logic internally.
     const userId = getCurrentUserId();
     if (!userId) { showNotification('Please log in to import data.', 'error'); return; }

     const fileInput = document.getElementById('importFile');
     const file = fileInput.files[0];
     if (!file) return;
     const reader = new FileReader();
     reader.onload = async (e) => {
         const text = e.target.result;
         const lines = text.split(/\r?\n/).filter(line => line.trim());
         if (lines.length <= 1) { showNotification('CSV file is empty or contains only headers.', 'error'); return; }
         const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/^"|"$/g, ''));
         const nameIndex = headers.indexOf('item name');
         const quantityIndex = headers.indexOf('quantity');
         const categoryIndex = headers.indexOf('category');
         const locationIndex = headers.indexOf('location');

         if (nameIndex === -1 || quantityIndex === -1) { showNotification('CSV must contain "Item Name" and "Quantity" columns.', 'error'); fileInput.value = ''; return; }

         const itemsToImport = [];
         let parseError = false;
         for (let i = 1; i < lines.length; i++) {
             const values = lines[i].split(',').map(val => val.trim().replace(/^"|"$/g, ''));
             const itemName = values[nameIndex];
             const quantityStr = values[quantityIndex];
             const quantity = parseInt(quantityStr);
             if (itemName && !isNaN(quantity) && quantity > 0) {
                 itemsToImport.push({
                     itemName, quantity,
                     category: (categoryIndex > -1 ? values[categoryIndex] : 'Uncategorized') || 'Uncategorized',
                     location: (locationIndex > -1 ? values[locationIndex] : 'Store') || 'Store',
                 });
             } else { console.warn(`Skipping invalid row ${i + 1}:`, lines[i]); parseError = true; }
         }

         if (itemsToImport.length === 0) { showNotification('No valid items found in CSV to import.', 'error'); }
         else {
             let addedCount = 0; let updatedCount = 0; let importErrorCount = 0;
             showNotification(`Importing ${itemsToImport.length} items...`, 'info');

             // Process items sequentially to avoid overwhelming Firestore writes (or use batched writes carefully)
             for (const item of itemsToImport) {
                 try {
                     const inventoryRef = collection(db, INVENTORY_COLLECTION);
                     const q = query(inventoryRef, where("userId", "==", userId), where("itemName", "==", item.itemName), limit(1));
                     const querySnapshot = await getDocs(q);
                     let existingDoc = null;
                     querySnapshot.forEach((doc) => { existingDoc = { id: doc.id, ...doc.data() }; });

                     if (existingDoc) {
                         const newQuantity = (existingDoc.quantity || 0) + item.quantity;
                         await updateDoc(doc(db, INVENTORY_COLLECTION, existingDoc.id), { quantity: newQuantity, updatedAt: serverTimestamp() });
                         await logAction('import_update', item.itemName, { quantity_added: item.quantity, location: item.location });
                         updatedCount++;
                     } else {
                         const newItem = { ...item, userId: userId, customFields: {}, createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
                         await addDoc(inventoryRef, newItem);
                         await logAction('import_add', item.itemName, { quantity: item.quantity, category: item.category, location: item.location });
                         addedCount++;
                     }
                 } catch (err) {
                     console.error(`Error importing item "${item.itemName}":`, err);
                     importErrorCount++;
                 }
             }
             // No explicit loadInventory needed if listener is working
             let message = `${addedCount} items added, ${updatedCount} updated.`;
             if (parseError) message += ' Some rows skipped.';
             if (importErrorCount > 0) message += ` ${importErrorCount} failed during import.`;
             showNotification(message, importErrorCount > 0 ? 'warning' : 'success');
         }
         fileInput.value = '';
     };
     reader.onerror = () => { showNotification('Error reading the file.', 'error'); fileInput.value = ''; };
     reader.readAsText(file);
 }


 // --- Item Selection --- (Removed as not used in simplified UI)
 export function toggleItemSelection(id, checkboxElement) {
    console.warn("toggleItemSelection called but batch actions/select all are currently removed.");
 }

 // --- Show Item Details --- (Removed as not used in simplified UI)
 export async function showItemDetails(itemId) {
    console.warn("showItemDetails called but item details modal is currently removed.");
 }

 // --- Batch Update Process --- (Removed as not used in simplified UI)
 export async function processBatchUpdate() {
    console.warn("processBatchUpdate called but batch actions are currently removed.");
 }
