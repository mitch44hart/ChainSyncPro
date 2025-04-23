 // ui.js - UI rendering and interaction logic (Firestore Version)

 import { formatTimestamp } from './utils.js';
 // Import functions needed by event listeners attached within this module OR called by other UI functions
 import {
     deleteItem, // Called by delete button listener in renderTable
     // editItem, // Keep commented if edit button is removed from renderTable
     loadAuditLog, // Called by showSection
     loadSales, // Called by showSection
     loadSettings, // Called by showSection
     loadCategories, // Called by showSection & updateFiltersAndSuggestions
     deleteCustomCategory // Called by delete button listener in renderCustomCategoryList
 } from './crud.js';
 import { stopScanner } from './scanner.js';

 // --- DOM Element Getters (Helper) ---
 const getElement = (id) => document.getElementById(id);
 const querySelector = (selector) => document.querySelector(selector);
 const querySelectorAll = (selector) => document.querySelectorAll(selector);

 // --- Core UI Functions ---

 export function renderTable() {
     const tableBody = getElement('inventoryBody');
     if (!tableBody) { console.error("inventoryBody element not found for renderTable"); return; }

     const searchInputEl = getElement('searchInput');

     // Access state via window.state
     const inventory = window.state?.inventory || []; // Data now comes from Firestore listener
     const currentPage = window.state?.currentPage || 1;
     const itemsPerPage = window.state?.itemsPerPage || 20;

     const searchTerm = searchInputEl ? searchInputEl.value.toLowerCase() : '';

     // Filter based *only* on search term
     const filteredInventory = inventory.filter(item =>
         (item.itemName || '').toLowerCase().includes(searchTerm) ||
         (item.category || '').toLowerCase().includes(searchTerm) ||
         (item.location || '').toLowerCase().includes(searchTerm)
     );

     const totalPages = Math.ceil(filteredInventory.length / itemsPerPage);
     const start = (currentPage - 1) * itemsPerPage;
     const paginatedInventory = filteredInventory.slice(start, start + itemsPerPage);

     tableBody.innerHTML = ''; // Clear previous rows

     if (paginatedInventory.length === 0) {
         tableBody.innerHTML = `<tr><td colspan="5" class="text-center p-5 text-gray-500 dark:text-gray-400">No items found.</td></tr>`;
     } else {
         paginatedInventory.forEach(item => {
             const row = tableBody.insertRow();
             // Use Firestore document ID (item.id)
             row.dataset.itemId = item.id;

             row.innerHTML = `
                 <td class="px-5 py-3 text-sm">${item.itemName || 'N/A'}</td>
                 <td class="px-5 py-3 text-sm">${item.quantity || 0}</td>
                 <td class="px-5 py-3 text-sm">${item.category || 'Uncategorized'}</td>
                 <td class="px-5 py-3 text-sm">${item.location || 'N/A'}</td>
                 <td class="px-5 py-3 text-sm">
                     <button class="tw-button-danger py-1 px-2 text-xs delete-item-btn" data-item-id="${item.id}" title="Delete Item">Delete</button>
                 </td>
             `;
             // Attach listener directly (alternative to delegation)
             row.querySelector('.delete-item-btn')?.addEventListener('click', () => deleteItem(item.id));
         });
     }

     renderPagination(totalPages);
 }

 export function renderPagination(totalPages) {
     const paginationContainer = getElement('pagination');
     if (!paginationContainer) return;
     paginationContainer.innerHTML = '';
     const currentPage = window.state?.currentPage || 1;

     if (totalPages <= 1) return;

     const createButton = (text, pageNum, isDisabled = false) => {
        const button = document.createElement('button');
        button.textContent = text;
        button.disabled = isDisabled;
        button.className = `tw-button-secondary py-1 px-3 text-sm ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''} ${pageNum === currentPage ? 'active' : ''}`;
        button.onclick = () => {
            if (!isDisabled) {
                window.state.currentPage = pageNum;
                renderTable(); // Re-render table for the new page
            }
        };
        paginationContainer.appendChild(button);
     };

     createButton('Prev', currentPage - 1, currentPage <= 1);

     const pageInfo = document.createElement('span');
     pageInfo.className = 'px-3 py-1 text-sm self-center dark:text-gray-300';
     pageInfo.textContent = `Page ${currentPage} of ${totalPages || 1}`;
     paginationContainer.appendChild(pageInfo);

     createButton('Next', currentPage + 1, currentPage >= totalPages);
 }


 export function renderSalesTable() {
     const tableBody = getElement('salesBody');
     if (!tableBody) { console.error("salesBody element not found"); return; }
     const sales = window.state?.sales || [];
     tableBody.innerHTML = '';

     if (sales.length === 0) {
         tableBody.innerHTML = '<tr><td colspan="3" class="text-center p-5 text-gray-500 dark:text-gray-400">No recent sales recorded.</td></tr>';
         return;
     }

     // Data comes from listener, likely already sorted by timestamp descending
     sales.forEach(sale => {
         const row = tableBody.insertRow();
         // Firestore timestamp needs .toDate()
         const timestamp = sale.timestamp?.toDate ? sale.timestamp.toDate() : new Date(sale.timestamp); // Handle potential string timestamp too
         row.innerHTML = `
             <td class="px-5 py-3 text-sm">${formatTimestamp(timestamp)}</td>
             <td class="px-5 py-3 text-sm">${sale.itemName}</td>
             <td class="px-5 py-3 text-sm">${sale.quantity}</td>
         `;
     });
 }

 export function renderHistoryLogTable() {
     const tableBody = getElement('auditBody'); // Correct ID
     if (!tableBody) { console.error("auditBody element not found"); return; }
     const auditLog = window.state?.auditLog || [];
     tableBody.innerHTML = '';

     if (auditLog.length === 0) {
         tableBody.innerHTML = '<tr><td colspan="4" class="text-center p-5 text-gray-500 dark:text-gray-400">No audit log entries found.</td></tr>';
         return;
     }

     // Data comes from listener, likely already sorted by timestamp descending
     auditLog.forEach(entry => {
         const row = tableBody.insertRow();
         const timestamp = entry.timestamp?.toDate ? entry.timestamp.toDate() : new Date(entry.timestamp);
         row.innerHTML = `
             <td class="px-5 py-3 text-sm">${formatTimestamp(timestamp)}</td>
             <td class="px-5 py-3 text-sm">${entry.action}</td>
             <td class="px-5 py-3 text-sm">${entry.itemName}</td>
             <td class="px-5 py-3 text-sm">${entry.details}</td>
         `;
     });
 }

 export function renderReportsTable() {
     const tableBody = getElement('reportsBody');
     if (!tableBody) { console.error("reportsBody element not found"); return; }
     const inventory = window.state?.inventory || [];
     tableBody.innerHTML = '';

     const categories = {};
     inventory.forEach(item => {
         const category = item.category || 'Uncategorized';
         if (!categories[category]) { categories[category] = { totalItems: 0, totalQuantity: 0 }; }
         categories[category].totalItems += 1;
         categories[category].totalQuantity += (item.quantity || 0);
     });
     const sortedCategories = Object.keys(categories).sort();

     if (sortedCategories.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="3" class="text-center p-5 text-gray-500 dark:text-gray-400">No inventory data for report.</td></tr>';
        return;
     }
     sortedCategories.forEach(categoryName => {
         const categoryData = categories[categoryName];
         const row = tableBody.insertRow();
         row.innerHTML = `
             <td class="px-5 py-3 text-sm">${categoryName}</td>
             <td class="px-5 py-3 text-sm">${categoryData.totalItems}</td>
             <td class="px-5 py-3 text-sm">${categoryData.totalQuantity}</td>
         `;
     });
 }

 export function updateReports() {
     const inventory = window.state?.inventory || [];
     const totalItems = inventory.length;
     const totalStock = inventory.reduce((sum, item) => sum + (item.quantity || 0), 0);
     const inventoryValue = inventory.reduce((sum, item) => {
         const price = parseFloat(item.customFields?.Price?.replace('$', '')) || 0;
         return sum + price * (item.quantity || 0);
     }, 0);

     (getElement('reportTotalItems') || {}).textContent = totalItems;
     (getElement('reportTotalStock') || {}).textContent = totalStock;
     (getElement('reportInventoryValue') || {}).textContent = `$${inventoryValue.toFixed(2)}`;
     renderReportsTable();
 }

 export function updateLocationDropdown() {
     const locationSelect = getElement('location');
     const locationList = getElement('locationList');
     const locations = window.state?.settings?.locations || [];

     if (locationSelect) {
        const currentValue = locationSelect.value;
        locationSelect.innerHTML = '<option value="">Select or add location</option>';
        if (!locations.includes('Store')) {
            const option = document.createElement('option'); option.value = 'Store'; option.textContent = 'Store'; locationSelect.appendChild(option);
        }
        locations.forEach(loc => { const option = document.createElement('option'); option.value = loc; option.textContent = loc; locationSelect.appendChild(option); });
        if (locations.includes(currentValue) || currentValue === 'Store') { locationSelect.value = currentValue; }
        else { locationSelect.value = ""; }
     }
     if (locationList) {
        locationList.innerHTML = '';
        if (locations.length === 0) { locationList.innerHTML = '<li class="text-gray-500 dark:text-gray-400">No locations added yet.</li>'; }
        else { locations.forEach(loc => { const li = document.createElement('li'); li.textContent = loc; locationList.appendChild(li); }); }
     }
 }

 export function populateCategoryDropdowns() {
     const categorySelect = getElement('category');
     if (!categorySelect) { console.warn("category select element not found"); return; }

     const customCategories = window.state?.customCategories || [];
     const dotCategories = window.state?.dotCategories || [];
     const currentFormCat = categorySelect.value;
     const allCategories = [...new Set(['', ...dotCategories, ...customCategories])];

     categorySelect.innerHTML = '<option value="" disabled>Select...</option>';
     allCategories.forEach(category => {
         if (category === "") return;
         const option = document.createElement('option'); option.value = category; option.textContent = category; categorySelect.appendChild(option);
     });
     if (allCategories.includes(currentFormCat)) { categorySelect.value = currentFormCat; }
     else { categorySelect.value = ""; }
 }

 export function renderCustomCategoryList() {
    // Categories are now dynamic based on inventory items in this setup
    const listElement = getElement('customCategoryList');
    if (!listElement) return;
    listElement.innerHTML = '<li class="px-3 py-2 text-gray-500 dark:text-gray-400">Categories are managed automatically based on items.</li>';
 }

 export function toggleThemeUI(isDark) {
    if (isDark) { document.documentElement.classList.add('dark'); }
    else { document.documentElement.classList.remove('dark'); }
    const themeColorMeta = document.querySelector('meta[name="theme-color"]');
    if (themeColorMeta) { themeColorMeta.content = isDark ? '#1f2937' : '#ffffff'; }
 }

 // --- UI Navigation ---
 export function showSection(sectionId) {
     console.log(`Showing section: ${sectionId}`);
     querySelectorAll('.section').forEach(el => el.classList.remove('active'));
     const targetSection = getElement(`${sectionId}-section`);
     if (targetSection) { targetSection.classList.add('active'); }
     else { console.error(`Target section not found: ${sectionId}-section`); return; }

     querySelectorAll('nav.bottom-nav a.nav-link').forEach(el => el.classList.remove('active'));
     const activeLink = querySelector(`nav.bottom-nav a.nav-link[href="#${sectionId}"]`);
     if (activeLink) { activeLink.classList.add('active'); }
     else { console.error(`Nav link not found for section: ${sectionId}`); }

     // Trigger updates needed when section becomes visible
     // Data loading is now handled by listeners, but reports might need explicit update
     if (sectionId === 'reports') { updateReports(); }
     // No need to explicitly call loadAuditLog, loadSales etc. if listeners are active
 }

 // --- Modal Handling ---
 export function openModal(modalId) {
    const modal = getElement(modalId);
    if (modal) modal.classList.remove('hidden');
 }

 export function closeModal(modalId) {
    const modal = getElement(modalId);
    if (modal) modal.classList.add('hidden');
    if (modalId === 'scanModal' && window.state?.html5QrCode && typeof stopScanner === 'function') {
        stopScanner();
    }
 }

 // --- Other UI Updates ---
 export function updateSyncStatusUI(online, statusText = null) {
    // Not relevant for Firebase sync, could be repurposed or removed
    console.log("updateSyncStatusUI called (Firebase handles sync status)");
 }

 export function updateBatchActionButtons() {
    // Removed as batch actions are not in the simplified UI
 }

 export function clearForm() {
    const itemNameEl = getElement('itemName');
    const quantityEl = getElement('quantity');
    const categoryEl = getElement('category');
    const locationEl = getElement('location');
    if(itemNameEl) itemNameEl.value = '';
    if(quantityEl) quantityEl.value = '1';
    if(categoryEl) categoryEl.value = '';
    if(locationEl) locationEl.value = '';
    // window.state.editId = null; // editId might not be used in quick add flow
    itemNameEl?.focus();
 }

 // Batch update modal functions removed as the modal/buttons were removed
 export function openBatchUpdateModal() { console.warn("Batch update UI removed.") }
