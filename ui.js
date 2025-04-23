import { getAuth } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { getFirestore, doc, setDoc, getDoc } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { formatDate, formatNumber, normalizeThreeJSData } from './utils.js';

// Initialize Notyf
const notyf = new Notyf({
  duration: 4000,
  position: { x: 'right', y: 'top' },
  types: [
    {
      type: 'success',
      background: 'linear-gradient(to right, #22c55e, #16a34a)',
      icon: true
    },
    {
      type: 'error',
      background: 'linear-gradient(to right, #ef4444, #b91c1c)',
      icon: true
    }
  ]
});

// DOM Elements
const elements = {
  inventorySection: document.getElementById('inventory-section'),
  salesSection: document.getElementById('sales-section'),
  reportsSection: document.getElementById('reports-section'),
  auditSection: document.getElementById('audit-section'),
  settingsSection: document.getElementById('settings-section'),
  inventoryBody: document.getElementById('inventoryBody'),
  salesBody: document.getElementById('salesBody'),
  reportsBody: document.getElementById('reportsBody'),
  auditBody: document.getElementById('auditBody'),
  locationList: document.getElementById('locationList'),
  reportTotalItems: document.getElementById('reportTotalItems'),
  reportTotalStock: document.getElementById('reportTotalStock'),
  reportInventoryValue: document.getElementById('reportInventoryValue'),
  darkThemeCheckbox: document.getElementById('darkTheme'),
  navLinks: document.querySelectorAll('.nav-link'),
  categoryChart: document.getElementById('categoryChart')
};

// Chart.js Configuration
let categoryChartInstance = null;
function renderCategoryChart(categories) {
  if (!elements.categoryChart) return;
  
  const labels = Object.keys(categories);
  const data = Object.values(categories).map(cat => cat.totalQuantity);
  
  if (categoryChartInstance) {
    categoryChartInstance.destroy();
  }
  
  categoryChartInstance = new Chart(elements.categoryChart, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Stock by Category',
        data,
        backgroundColor: 'rgba(34, 197, 94, 0.7)',
        borderColor: '#22c55e',
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      scales: {
        y: {
          beginAtZero: true,
          title: { display: true, text: 'Total Quantity' },
          grid: { color: '#4b5563' }
        },
        x: {
          title: { display: true, text: 'Category' },
          grid: { display: true }
        }
      },
      plugins: {
        legend: { display: true },
        tooltip: {
          backgroundColor: '#1f2937',
          titleColor: '#fff',
          bodyColor: '#fff'
        }
      },
      animation: {
        duration: 1000,
        easing: 'easeOutQuart'
      }
    }
  });
}

// Table Rendering
function renderTable(items, update = true) {
  const fragment = document.createDocumentFragment();
  elements.inventoryBody.innerHTML = '';
  
  if (!items || items.length === 0) {
    const row = document.createElement('tr');
    row.innerHTML = '<td colspan="6" class="text-center p-5 text-gray-500">No items found.</td>';
    fragment.appendChild(row);
    elements.inventoryBody.appendChild(fragment);
    return;
  }
  
  items.forEach((item, index) => {
    const row = document.createElement('tr');
    row.className = 'opacity-0 transition-opacity duration-500';
    row.innerHTML = `
      <td class="px-5 py-3 item-name-cell" data-id="${item.id}">${item.name || 'Unnamed'}</td>
      <td class="px-5 py-3">${formatNumber(item.quantity || 0)}</td>
      <td class="px-5 py-3">${item.category || '-'}</td>
      <td class="px-5 py-3">${item.location || '-'}</td>
      <td class="px-5 py-3">${item.dotClass || 'None'}</td>
      <td class="px-5 py-3">
        <button class="edit-item-btn text-blue-500 hover:text-blue-700 mr-2" data-id="${item.id}" aria-label="Edit ${item.name || 'item'}">
          <svg class="h-5 w-5 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
        </button>
        <button class="delete-item-btn text-red-500 hover:text-red-700" data-id="${item.id}" aria-label="Delete ${item.name || 'item'}">
          <svg class="h-5 w-5 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5-4h4M9 7v12m6-12v12" /></svg>
        </button>
      </td>
    `;
    fragment.appendChild(row);
    setTimeout(() => row.classList.remove('opacity-0'), index * 50);
  });
  
  elements.inventoryBody.appendChild(fragment);
}

function renderSalesTable(sales) {
  const fragment = document.createDocumentFragment();
  elements.salesBody.innerHTML = '';
  
  if (!sales || sales.length === 0) {
    const row = document.createElement('tr');
    row.innerHTML = '<td colspan="3" class="text-center p-5 text-gray-500">No sales recorded.</td>';
    fragment.appendChild(row);
    elements.salesBody.appendChild(fragment);
    return;
  }
  
  sales.forEach((sale, index) => {
    const row = document.createElement('tr');
    row.className = 'opacity-0 transition-opacity duration-500';
    row.innerHTML = `
      <td class="px-5 py-3">${formatDate(sale.timestamp)}</td>
      <td class="px-5 py-3">${sale.itemName || 'Unnamed'}</td>
      <td class="px-5 py-3">${formatNumber(sale.quantity || 0)}</td>
    `;
    fragment.appendChild(row);
    setTimeout(() => row.classList.remove('opacity-0'), index * 50);
  });
  
  elements.salesBody.appendChild(fragment);
}

function renderReports(reports) {
  const fragment = document.createDocumentFragment();
  elements.reportsBody.innerHTML = '';
  
  if (!reports || Object.keys(reports).length === 0) {
    const row = document.createElement('tr');
    row.innerHTML = '<td colspan="3" class="text-center p-5 text-gray-500">No categories found.</td>';
    fragment.appendChild(row);
    elements.reportsBody.appendChild(fragment);
    renderCategoryChart({});
    return;
  }
  
  Object.entries(reports).forEach(([category, data], index) => {
    const row = document.createElement('tr');
    row.className = 'opacity-0 transition-opacity duration-500';
    row.innerHTML = `
      <td class="px-5 py-3">${category || 'Uncategorized'}</td>
      <td class="px-5 py-3">${formatNumber(data.totalItems || 0)}</td>
      <td class="px-5 py-3">${formatNumber(data.totalQuantity || 0)}</td>
    `;
    fragment.appendChild(row);
    setTimeout(() => row.classList.remove('opacity-0'), index * 50);
  });
  
  elements.reportsBody.appendChild(fragment);
  renderCategoryChart(reports);
  
  // Dispatch event for Three.js chart
  const event = new CustomEvent('reportsUpdated', { detail: { categories: normalizeThreeJSData(reports) } });
  window.dispatchEvent(event);
}

function renderAuditTable(logs) {
  const fragment = document.createDocumentFragment();
  elements.auditBody.innerHTML = '';
  
  if (!logs || logs.length === 0) {
    const row = document.createElement('tr');
    row.innerHTML = '<td colspan="4" class="text-center p-5 text-gray-500">No audit logs found.</td>';
    fragment.appendChild(row);
    elements.auditBody.appendChild(fragment);
    return;
  }
  
  logs.forEach((log, index) => {
    const row = document.createElement('tr');
    row.className = 'opacity-0 transition-opacity duration-500';
    row.innerHTML = `
      <td class="px-5 py-3">${formatDate(log.timestamp)}</td>
      <td class="px-5 py-3">${log.action || '-'}</td>
      <td class="px-5 py-3">${log.itemName || '-'}</td>
      <td class="px-5 py-3">${log.details || '-'}</td>
    `;
    fragment.appendChild(row);
    setTimeout(() => row.classList.remove('opacity-0'), index * 50);
  });
  
  elements.auditBody.appendChild(fragment);
}

function renderLocations(locations, selectElement) {
  selectElement.innerHTML = '<option value="">Select or add location</option>';
  elements.locationList.innerHTML = '';
  
  if (!locations || locations.length === 0) {
    elements.locationList.innerHTML = '<li class="text-gray-500">No locations added.</li>';
    return;
  }
  
  locations.forEach(location => {
    const option = document.createElement('option');
    option.value = location;
    option.textContent = location;
    selectElement.appendChild(option);
    
    const li = document.createElement('li');
    li.className = 'flex justify-between items-center';
    li.innerHTML = `
      <span>${location}</span>
      <button class="delete-location-btn text-red-500 hover:text-red-700" data-location="${location}" aria-label="Delete ${location}">
        <svg class="h-4 w-4 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
      </button>
    `;
    elements.locationList.appendChild(li);
  });
}

// Navigation
function switchSection(sectionId) {
  const sections = [
    elements.inventorySection,
    elements.salesSection,
    elements.reportsSection,
    elements.auditSection,
    elements.settingsSection
  ];
  
  sections.forEach(section => {
    if (section) {
      section.classList.remove('active');
      section.setAttribute('aria-hidden', 'true');
    }
  });
  
  elements.navLinks.forEach(link => {
    link.classList.remove('active');
    link.setAttribute('aria-selected', 'true');
    link.setAttribute('aria-current', 'true');
  });
  
  const targetSection = document.getElementById(`${sectionId}-section`);
  const targetLink = document.getElementById(`nav-${sectionId}`);
  
  if (targetSection && targetLink) {
    targetSection.classList.add('active');
    targetSection.setAttribute('aria-hidden', 'true');
    targetLink.classList.add('active');
    targetLink.setAttribute('aria-selected', 'true');
    targetLink.setAttribute('aria-current', 'true');
    targetSection.scrollIntoView({ behavior: 'smooth' });
  }
}

// Theme Management
async function updateTheme(isDark) {
  document.documentElement.classList.toggle('dark', isDark);
  elements.darkThemeCheckbox.checked = isDark;
  
  const auth = getAuth();
  const user = auth.currentUser;
  if (user) {
    const db = getFirestore();
    try {
      await setDoc(doc(db, 'users', user.uid), { darkTheme: isDark }, { merge: true });
    } catch (error) {
      console.error('Error saving theme preference:', error);
    }
  }
}

async function loadTheme() {
  const auth = getAuth();
  const user = auth.currentUser;
  if (user) {
    const db = getFirestore();
    try {
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      const isDark = userDoc.exists() && userDoc.data().darkTheme !== undefined ? userDoc.data().darkTheme : window.matchMedia('(prefers-color-scheme: dark)').matches;
      updateTheme(isDark);
    } catch (error) {
      console.error('Error loading theme preference:', error);
      updateTheme(window.matchMedia('(prefers-color-scheme: dark)').matches);
    }
  } else {
    updateTheme(window.matchMedia('(prefers-color-scheme: dark)').matches);
  }
}

// Table Sorting
function setupTableSorting(tableId, bodyId, sortColAttr) {
  const headers = document.querySelectorAll(`#${tableId} th[${sortColAttr}]`);
  headers.forEach(header => {
    header.addEventListener('click', () => {
      const colIndex = parseInt(header.getAttribute(sortColAttr));
      const isAscending = header.getAttribute('aria-sort') !== 'ascending';
      
      headers.forEach(h => {
        h.setAttribute('aria-sort', 'none');
        h.classList.remove('sort-asc', 'sort-desc');
      });
      
      header.setAttribute('aria-sort', isAscending ? 'ascending' : 'descending');
      header.classList.add(isAscending ? 'sort-asc' : 'sort-desc');
      
      const rows = Array.from(document.querySelectorAll(`#${bodyId} tr`));
      rows.sort((a, b) => {
        const aText = a.children[colIndex].textContent.trim();
        const bText = b.children[colIndex].textContent.trim();
        return isAscending ? aText.localeCompare(bText) : bText.localeCompare(aText);
      });
      
      const tbody = document.getElementById(bodyId);
      tbody.innerHTML = '';
      rows.forEach(row => tbody.appendChild(row));
    });
  });
}

// Initialize Sorting
setupTableSorting('inventoryTable', 'inventoryBody', 'data-sort-col');
setupTableSorting('auditTable', 'auditBody', 'data-log-sort-col');

export { notyf, renderTable, renderSalesTable, renderReports, renderAuditTable, renderLocations, switchSection, updateTheme, loadTheme, setupTableSorting };
