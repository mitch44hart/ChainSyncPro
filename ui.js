function getNotyfInstance() {
    if (window.Notyf) {
        return new Notyf({
            duration: 3000,
            position: { x: 'right', y: 'bottom' },
            dismissible: true
        });
    }
    console.warn('Notyf not available. Notifications will use console.log.');
    return {
        success: (msg) => console.log(`[SUCCESS] ${msg.message}`),
        error: (msg) => console.error(`[ERROR] ${msg}`),
        open: (msg) => console.log(`[INFO] ${msg.message}`)
    };
}
const notyf = getNotyfInstance();

function debugLog(message, error = null) {
    if (window.settings && settings.debugMode) {
        console.log(`[${new Date().toISOString()}] ${message}`, error || '');
    }
}

function showNotification(message, type = 'info') {
    try {
        if (notyf) {
            if (type === 'success') {
                notyf.success({ message, duration: 5000 });
            } else if (type === 'error') {
                notyf.error(message);
            } else {
                notyf.open({ type: 'info', message });
            }
        } else {
            console.log(`[${type.toUpperCase()}] ${message}`);
        }
    } catch (err) {
        console.error('Notification error:', err);
    }
}

function openModal(modalId) {
    try {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('hidden');
            modal.focus();
            console.log(`Opened modal: ${modalId}`);
        } else {
            debugLog(`Modal ${modalId} not found`);
            showNotification(`Modal ${modalId} not found.`, 'error');
        }
    } catch (err) {
        debugLog('Error opening modal', err);
        showNotification('Error opening modal.', 'error');
    }
}

function closeModal(modalId) {
    try {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.add('hidden');
            console.log(`Closed modal: ${modalId}`);
        } else {
            debugLog(`Modal ${modalId} not found`);
        }
    } catch (err) {
        debugLog('Error closing modal', err);
        showNotification('Error closing modal.', 'error');
    }
}

function switchSection(sectionId) {
    try {
        console.log(`Switching to section: ${sectionId}`);
        const validSections = ['inventory', 'sales', 'reports', 'audit', 'settings'];
        if (!validSections.includes(sectionId)) {
            debugLog(`Invalid section ID: ${sectionId}`);
            showNotification('Invalid section.', 'error');
            return;
        }

        const sectionElement = document.getElementById(`${sectionId}-section`);
        const navLink = document.getElementById(`nav-${sectionId}`);

        if (!sectionElement || !navLink) {
            debugLog(`Section or nav link not found for ${sectionId}`);
            showNotification('Section not found. Please refresh.', 'error');
            return;
        }

        document.querySelectorAll('.section').forEach(section => section.classList.remove('active'));
        document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
        sectionElement.classList.add('active');
        navLink.classList.add('active');

        if (sectionId === 'reports' && typeof renderReportsTable === 'function') {
            renderReportsTable();
        }

        console.log(`Switched to section: ${sectionId}`);
    } catch (err) {
        debugLog('Error switching section', err);
        showNotification('Error switching section. Please refresh.', 'error');
    }
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function setupEventListeners() {
    try {
        console.log('Setting up event listeners...');
        const navContainer = document.querySelector('.bottom-nav');
        if (!navContainer) {
            debugLog('Nav container not found');
            showNotification('Navigation setup failed. Please refresh.', 'error');
            return;
        }

        navContainer.removeEventListener('click', handleNavClick);
        navContainer.addEventListener('click', debounce(handleNavClick, 200));

        function handleNavClick(e) {
            try {
                const link = e.target.closest('.nav-link');
                if (link) {
                    e.preventDefault();
                    const sectionId = link.getAttribute('href').substring(1);
                    console.log(`Nav link clicked: ${sectionId}`);
                    switchSection(sectionId);
                }
            } catch (err) {
                debugLog('Error in nav click handler', err);
                showNotification('Error navigating. Please try again.', 'error');
            }
        }

        const filterInputs = ['filterName', 'filterCategory', 'filterDot', 'filterQuantity'];
        filterInputs.forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.addEventListener('input', debounce(() => {
                    console.log(`Filter input changed: ${id}`);
                    if (typeof currentPage !== 'undefined' && typeof renderTable === 'function') {
                        currentPage = 1;
                        if (typeof saveFilterSettings === 'function') {
                            saveFilterSettings();
                        }
                        renderTable();
                    }
                }, 300));
            } else {
                console.warn(`Filter element ${id} not found`);
            }
        });

        const quantitySlider = document.getElementById('filterQuantity');
        if (quantitySlider) {
            quantitySlider.addEventListener('input', () => {
                const valueSpan = document.getElementById('quantityValue');
                if (valueSpan) {
                    valueSpan.textContent = `${quantitySlider.value}+`;
                }
            });
        }

        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey) {
                console.log(`Key pressed: Ctrl+${e.key}`);
                switch (e.key) {
                    case '1':
                        e.preventDefault();
                        switchSection('inventory');
                        break;
                    case '2':
                        e.preventDefault();
                        switchSection('sales');
                        break;
                    case '3':
                        e.preventDefault();
                        switchSection('reports');
                        break;
                    case '4':
                        e.preventDefault();
                        switchSection('audit');
                        break;
                    case '5':
                        e.preventDefault();
                        switchSection('settings');
                        break;
                    case 's':
                        e.preventDefault();
                        if (typeof startScanner === 'function') startScanner();
                        break;
                    case 'Enter':
                        e.preventDefault();
                        if (typeof quickAddItem === 'function') quickAddItem();
                        break;
                    case 'e':
                        e.preventDefault();
                        if (typeof selectedItemId !== 'undefined' && selectedItemId && typeof openEditModal === 'function') {
                            openEditModal(selectedItemId);
                        }
                        break;
                    case 'b':
                        e.preventDefault();
                        if (typeof openBulkImportModal === 'function') openBulkImportModal();
                        break;
                    case '/':
                        e.preventDefault();
                        openModal('shortcutModal');
                        break;
                }
            }
        });

        console.log('Event listeners set up successfully');
    } catch (err) {
        debugLog('Error setting up event listeners', err);
        showNotification('Error setting up navigation. Please refresh.', 'error');
    }
}