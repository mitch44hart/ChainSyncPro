 // app.js - Main application logic and initialization for ChainSync Lite v6 (Firebase)
 console.log('[App.js] Script start');

 // --- Module Imports ---
 let db, auth; // Firebase services
 let loadInventoryListener, loadSalesListener, loadAuditLogListener, loadSettingsListener; // Listener unsubscribers
 try {
     console.log('[App.js] Importing modules...');
     ({ db, auth } = await import('./firebaseConfig.js')); // Destructure initialized services
     const authModule = await import('./auth.js'); // Import auth functions separately
     const { showNotification, notyf } = await import('./notifications.js');
     const { getTimestamp, formatTimestamp } = await import('./utils.js');
     const crud = await import('./crud.js'); // Import all crud functions
     const ui = await import('./ui.js'); // Import all ui functions
     const scanner = await import('./scanner.js'); // Import scanner functions
     // sync.js removed
     console.log('[App.js] Modules imported successfully.');

     // Make functions globally accessible if needed (less ideal than explicit listeners)
     window.quickAddItem = crud.quickAddItem;
     window.clearForm = ui.clearForm;
     window.startScanner = scanner.startScanner;
     window.stopScanner = scanner.stopScanner;
     window.deleteItem = crud.deleteItem;
     window.recordSale = crud.recordSale;
     window.clearSaleForm = crud.clearSaleForm;
     window.exportToExcel = crud.exportToExcel;
     window.exportToPDF = crud.exportToPDF;
     window.addLocation = crud.addLocation;
     window.toggleTheme = () => {
        const isDark = document.getElementById('darkTheme')?.checked;
        if (typeof isDark === 'boolean') { ui.toggleThemeUI(isDark); crud.saveSettings('theme', isDark ? 'dark' : 'light'); }
     };
     window.toggleDebugMode = () => {
        const debugMode = document.getElementById('debugMode')?.checked;
        if (typeof debugMode === 'boolean') { crud.saveSettings('debugMode', debugMode); window.state.settings.debugMode = debugMode; showNotification(`Debug logs ${debugMode ? 'enabled' : 'disabled'}.`, 'info'); }
     };
     window.backupData = crud.backupData;
     window.clearDatabase = crud.clearDatabase;
     window.loadInventoryLog = crud.loadAuditLog; // Point to correct function
     window.sortTable = ui.sortTable; // UI function
     window.sortLogTable = ui.sortLogTable; // UI function
     window.closeModal = ui.closeModal;
     window.deleteCustomCategory = crud.deleteCustomCategory;

 } catch (importError) {
     console.error('[App.js] CRITICAL ERROR DURING MODULE IMPORT:', importError);
     alert('Failed to load essential application components. Please check the console and refresh.');
     throw importError; // Stop execution
 }

 // --- Firestore SDK Functions needed in this file ---
 import { collection, query, where, orderBy, onSnapshot, doc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";


 // --- Global State ---
 console.log('[App.js] Initializing global state...');
 window.state = {
     inventory: [], sales: [], auditLog: [],
     settings: { theme: 'light', shopName: '', locations: [], debugMode: false },
     editId: null, sortDirection: 1, lastSortedColumn: -1, customCategories: [],
     dotCategories: [ "Class 1: Explosives", "Class 2: Gases", "Class 3: Flammable Liquids", "Class 4: Flammable Solids", "Class 5: Oxidizing Substances", "Class 6: Toxic & Infectious Substances", "Class 7: Radioactive Material", "Class 8: Corrosives", "Class 9: Miscellaneous" ],
     logSortColumn: 0, logSortDirection: -1, selectedItems: new Set(),
     chartInstance: null, categoryChartInstance: null, html5QrCode: null,
     currentPage: 1, itemsPerPage: 20,
     currentUid: null // Store current user ID
 };
 console.log('[App.js] Global state initialized.');


 // --- Firebase Real-time Listeners ---

 export function setupFirestoreListeners(userId) {
    if (!userId) {
        console.error("[App.js] Cannot setup listeners: No user ID provided.");
        return;
    }
    console.log("[App.js] Setting up Firestore listeners for user:", userId);
    cleanupListeners(); // Unsubscribe from previous listeners if any

    // Inventory Listener
    const invRef = collection(db, 'inventory');
    const invQuery = query(invRef, where("userId", "==", userId), orderBy("itemName", "asc")); // Order as needed
    loadInventoryListener = onSnapshot(invQuery, (snapshot) => {
        console.log("[App.js] Inventory snapshot received:", snapshot.size);
        const items = [];
        snapshot.forEach((doc) => {
            items.push({ id: doc.id, ...doc.data() }); // Use Firestore doc ID
        });
        window.state.inventory = items.map(item => ({ // Map to ensure defaults
             ...item,
             category: item.category || 'Uncategorized',
             quantity: item.quantity || 0,
             unitCost: item.unitCost || 0,
             location: item.location || 'Store',
             customFields: item.customFields || {}
         }));
        console.log("[App.js] Updated inventory state:", window.state.inventory.length);
        ui.renderTable(); // Update UI
        ui.updateReports(); // Update reports
        crud.loadCategories(); // Update categories based on inventory
        ui.updateLocationDropdown(); // Update locations based on inventory/settings
    }, (error) => {
        console.error("[App.js] Inventory listener error:", error);
        showNotification("Error listening for inventory updates.", "error");
    });

    // Sales Listener (Load recent 100)
    const salesRef = collection(db, 'sales');
    const salesQuery = query(salesRef, where("userId", "==", userId), orderBy("timestamp", "desc"), limit(100));
    loadSalesListener = onSnapshot(salesQuery, (snapshot) => {
        console.log("[App.js] Sales snapshot received:", snapshot.size);
        const salesData = [];
        snapshot.forEach((doc) => salesData.push({ id: doc.id, ...doc.data() }));
        window.state.sales = salesData;
        ui.renderSalesTable();
    }, (error) => {
        console.error("[App.js] Sales listener error:", error);
        showNotification("Error listening for sales updates.", "error");
    });

    // Audit Log Listener (Load recent 100)
    const auditRef = collection(db, 'audit');
    const auditQuery = query(auditRef, where("userId", "==", userId), orderBy("timestamp", "desc"), limit(100));
    loadAuditLogListener = onSnapshot(auditQuery, (snapshot) => {
        console.log("[App.js] Audit log snapshot received:", snapshot.size);
        const auditData = [];
        snapshot.forEach((doc) => auditData.push({ id: doc.id, ...doc.data() }));
        window.state.auditLog = auditData;
        ui.renderHistoryLogTable();
    }, (error) => {
        console.error("[App.js] Audit listener error:", error);
        showNotification("Error listening for audit log updates.", "error");
    });

     // Settings Listener (Listen to the specific user's settings doc)
     const settingsDocRef = doc(db, 'settings', userId);
     loadSettingsListener = onSnapshot(settingsDocRef, (docSnap) => {
         console.log("[App.js] Settings snapshot received.");
         const defaultSettings = { theme: 'light', shopName: '', locations: [], debugMode: false };
         if (docSnap.exists()) {
             window.state.settings = { ...defaultSettings, ...docSnap.data() };
         } else {
             console.log("[App.js] Settings document not found, using defaults.");
             window.state.settings = defaultSettings; // Use defaults if doc doesn't exist
         }
         console.log("[App.js] Updated settings state:", window.state.settings);
         // Apply settings to UI
         const shopNameEl = document.getElementById('shopName');
         const darkThemeEl = document.getElementById('darkTheme');
         const debugModeEl = document.getElementById('debugMode');
         if (shopNameEl) shopNameEl.value = window.state.settings.shopName || '';
         if (darkThemeEl) darkThemeEl.checked = window.state.settings.theme === 'dark';
         if (debugModeEl) debugModeEl.checked = window.state.settings.debugMode || false;
         ui.toggleThemeUI(window.state.settings.theme === 'dark'); // Apply theme
         ui.updateLocationDropdown();
     }, (error) => {
         console.error("[App.js] Settings listener error:", error);
         showNotification("Error listening for settings updates.", "error");
     });
 }

 export function cleanupListeners() {
    console.log("[App.js] Cleaning up Firestore listeners.");
    if (loadInventoryListener) { loadInventoryListener(); loadInventoryListener = null; }
    if (loadSalesListener) { loadSalesListener(); loadSalesListener = null; }
    if (loadAuditLogListener) { loadAuditLogListener(); loadAuditLogListener = null; }
    if (loadSettingsListener) { loadSettingsListener(); loadSettingsListener = null; }
    // Reset local data when listeners are cleaned up (on logout)
    window.state.inventory = [];
    window.state.sales = [];
    window.state.auditLog = [];
    window.state.settings = { theme: 'light', shopName: '', locations: [], debugMode: false };
    window.state.customCategories = [];
    // Optionally re-render empty tables
    ui.renderTable();
    ui.renderSalesTable();
    ui.renderHistoryLogTable();
    ui.updateReports();
    ui.populateCategoryDropdowns();
    ui.updateLocationDropdown();
 }


 // --- Event Listeners ---
 console.log('[App.js] Adding DOMContentLoaded listener...');
 document.addEventListener('DOMContentLoaded', () => {
     console.log("[App.js] DOMContentLoaded event fired.");

     try { // Wrap DOMContentLoaded logic in try-catch
         // Check essential libraries (Firebase is initialized in its own module)
         if (!notyf) throw new Error("Notyf not initialized by DOMContentLoaded");
         if (typeof Chart === 'undefined') console.warn("Chart.js not loaded by DOMContentLoaded");
         if (typeof XLSX === 'undefined') console.warn("XLSX (SheetJS) not loaded by DOMContentLoaded");
         if (typeof jspdf === 'undefined') console.warn("jsPDF not loaded by DOMContentLoaded");
         if (typeof Html5Qrcode === 'undefined') console.warn("Html5Qrcode not loaded by DOMContentLoaded");

         console.log("[App.js] Setting up initial UI and listeners...");
         // Initial UI setup - Batch buttons removed
         // updateBatchActionButtons();
         // updateSyncStatusUI(navigator.onLine); // Sync status handled by auth state

         // Setup Navigation Listeners
         document.querySelectorAll('nav.bottom-nav a.nav-link').forEach(link => {
             link.addEventListener('click', (event) => {
                 event.preventDefault();
                 const sectionId = link.getAttribute('href').substring(1);
                 console.log(`[App.js] Nav link clicked: ${link.id}, Target section: ${sectionId}`);
                 try { ui.showSection(sectionId); } catch (error) { console.error(`[App.js] Error in showSection for ${sectionId}:`, error); showNotification(`Error switching view: ${error.message}`, 'error'); }
             });
         });

         // Setup Modal Close Buttons
         document.querySelectorAll('[data-close-modal]').forEach(button => {
            button.addEventListener('click', () => {
                const modalId = button.getAttribute('data-close-modal');
                ui.closeModal(modalId);
            });
         });

         // Setup Button Listeners (Explicit attachment)
         console.log("[App.js] Attaching button listeners...");
         document.getElementById('quick-add-item-btn')?.addEventListener('click', crud.quickAddItem);
         document.getElementById('clear-form-btn')?.addEventListener('click', ui.clearForm);
         document.getElementById('start-scan-btn')?.addEventListener('click', scanner.startScanner);
         document.getElementById('importFile')?.addEventListener('change', crud.importFromCSV);
         document.getElementById('export-csv-btn')?.addEventListener('click', crud.exportToCSV);
         document.getElementById('export-excel-btn')?.addEventListener('click', crud.exportToExcel);
         document.getElementById('export-pdf-btn')?.addEventListener('click', crud.exportToPDF);
         document.getElementById('record-sale-btn')?.addEventListener('click', crud.recordSale);
         document.getElementById('clear-sale-form-btn')?.addEventListener('click', crud.clearSaleForm);
         document.getElementById('report-export-excel-btn')?.addEventListener('click', crud.exportToExcel);
         document.getElementById('report-export-pdf-btn')?.addEventListener('click', crud.exportToPDF);
         document.getElementById('refresh-log-btn')?.addEventListener('click', crud.loadAuditLog); // Manual refresh still possible
         document.getElementById('add-category-btn')?.addEventListener('click', crud.addCustomCategory);
         document.getElementById('save-shop-details-btn')?.addEventListener('click', () => {
            const name = document.getElementById('shopName')?.value;
            crud.saveSettings('shopName', name);
            showNotification('Shop name saved.', 'success');
         });
         document.getElementById('add-location-btn')?.addEventListener('click', crud.addLocation);
         document.getElementById('darkTheme')?.addEventListener('change', window.toggleTheme); // Use wrapper
         document.getElementById('debugMode')?.addEventListener('change', window.toggleDebugMode); // Use wrapper
         document.getElementById('backup-data-btn')?.addEventListener('click', crud.backupData);
         document.getElementById('settings-clear-db-btn')?.addEventListener('click', crud.clearDatabase);
         document.getElementById('settings-clear-log-btn')?.addEventListener('click', crud.clearHistoryLog);
         document.getElementById('scan-modal-close-btn')?.addEventListener('click', scanner.stopScanner);
         document.getElementById('cancel-scan-btn')?.addEventListener('click', scanner.stopScanner);
         // Batch action buttons removed

         // Table Header Sorting Listeners
         document.querySelectorAll('#inventoryTable thead th[data-sort-col]').forEach(th => {
            th.addEventListener('click', () => ui.sortTable(parseInt(th.dataset.sortCol)));
         });
         // Use data attribute for log table sort column
         document.querySelectorAll('#auditTable thead th[data-log-sort-col]').forEach(th => {
            th.addEventListener('click', () => ui.sortLogTable(parseInt(th.dataset.logSortCol)));
         });


         // Select All Checkbox Listener (Removed)

         // Event delegation for inventory table delete buttons
         const inventoryTableBody = document.getElementById('inventoryBody');
         if (inventoryTableBody) {
            inventoryTableBody.addEventListener('click', (event) => {
                const target = event.target;
                if (target.classList.contains('delete-item-btn')) {
                    const itemId = target.dataset.itemId; // Get Firestore ID
                    if (itemId) {
                        crud.deleteItem(itemId);
                    }
                }
            });
         } else {
            console.error("inventoryBody not found for event delegation setup.");
         }


         console.log("[App.js] Listeners attached.");

         // Initial data loading is now triggered by the onAuthStateChanged listener in auth.js
         console.log("[App.js] Initialization complete. Waiting for auth state...");


     } catch (domError) {
         console.error("[App.js] CRITICAL ERROR in DOMContentLoaded handler:", domError);
         alert('A critical error occurred while setting up the application. Please check the console and refresh.');
     }
 });

 // --- Service Worker Registration ---
 console.log('[App.js] Setting up Service Worker registration...');
 if ('serviceWorker' in navigator) {
     window.addEventListener('load', () => {
         console.log('[App.js] Page loaded, registering Service Worker...');
         navigator.serviceWorker.register('/sw.js')
             .then(reg => console.log('[App.js] Service Worker registered scope:', reg.scope))
             .catch(err => console.log('[App.js] Service Worker registration failed:', err));
     });
 } else {
     console.log('[App.js] Service Worker not supported.');
 }

 console.log('[App.js] Script end');
