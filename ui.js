/*
 * Changes made to improve button functionality:
 * 1. Moved setupEventListeners to run after DOMContentLoaded to ensure all elements are available.
 * 2. Improved event delegation to handle button clicks more reliably, even for dynamically added buttons.
 * 3. Added checks for button existence and onclick attributes to prevent null errors.
 * 4. Introduced a disableButtonDuringAction helper to prevent multiple rapid clicks.
 * 5. Enhanced debug logging for button actions to trace issues.
 * 6. Added fallback for missing Notyf library to ensure notifications work.
 */

function getNotyfInstance() {
    if (window.Notyf) {
        return new Notyf({
            duration: 3000,
            position: { x: 'right', y: 'bottom' },
            dismissible: true
        });
    }
    console.warn('[UI] Notyf not available. Using console for notifications.');
    return {
        success: (msg) => console.log(`[SUCCESS] ${msg.message || msg}`),
        error: (msg) => console.error(`[ERROR] ${msg}`),
        open: (msg) => console.log(`[INFO] ${msg.message || msg}`)
    };
}
const notyf = getNotyfInstance();

function debugLog(message, error = null) {
    if (window.settings?.debugMode) {
        console.log(`[UI] [${new Date().toISOString()}] ${message}`, error || '');
    }
}

function showNotification(message, type = 'info') {
    try {
        if (type === 'success') {
            notyf.success(message);
        } else if (type === 'error') {
            notyf.error(message);
        } else {
            notyf.open({ type: 'info', message });
        }
    } catch (err) {
        debugLog('[UI] Notification error', err);
        console.error(`[UI] ${type.toUpperCase()}: ${message}`);
    }
}

function openModal(modalId) {
    try {
        const modal = document.getElementById(modalId);
        if (!modal) {
            debugLog(`[UI] Modal ${modalId} not found`);
            showNotification(`Modal ${modalId} not found.`, 'error');
            return;
        }
        modal.classList.remove('hidden');
        modal.focus();
        debugLog(`[UI] Opened modal: ${modalId}`);
    } catch (err) {
        debugLog('[UI] Error opening modal', err);
        showNotification('Error opening modal.', 'error');
    }
}

function closeModal(modalId) {
    try {
        const modal = document.getElementById(modalId);
        if (!modal) {
            debugLog(`[UI] Modal ${modalId} not found`);
            return;
        }
        modal.classList.add('hidden');
        debugLog(`[UI] Closed modal: ${modalId}`);
    } catch (err) {
        debugLog('[UI] Error closing modal', err);
        showNotification('Error closing modal.', 'error');
    }
}

function switchSection(sectionId) {
    try {
        debugLog(`[UI] Switching to section: ${sectionId}`);
        const validSections = ['inventory', 'sales', 'reports', 'audit', 'settings'];
        if (!validSections.includes(sectionId)) {
            debugLog(`[UI] Invalid section ID: ${sectionId}`);
            showNotification('Invalid section.', 'error');
            return;
        }

        const sectionElement = document.getElementById(`${sectionId}-section`);
        const navLink = document.getElementById(`nav-${sectionId}`);
        if (!sectionElement || !navLink) {
            debugLog(`[UI] Section or nav link not found for ${sectionId}`);
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
        debugLog(`[UI] Switched to section: ${sectionId}`);
    } catch (err) {
        debugLog('[UI] Error switching section', err);
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

// Helper to disable button during action to prevent multiple clicks
function disableButtonDuringAction(button, action) {
    if (!button) return;
    button.disabled = true;
    action().finally(() => {
        setTimeout(() => {
            button.disabled = false;
        }, 500);
    });
}

function setupEventListeners() {
    // Ensure DOM is fully loaded before setting up listeners
    document.addEventListener('DOMContentLoaded', () => {
        debugLog('[UI] Setting up event listeners...');
        try {
            const mainContainer = document.body;
            if (!mainContainer) {
                debugLog('[UI] Main container not found');
                showNotification('App setup failed. Please refresh.', 'error');
                return;
            }

            // Event delegation for all button clicks
            mainContainer.addEventListener('click', debounce((e) => {
                const button = e.target.closest('button');
                if (button) {
                    const onclick = button.getAttribute('onclick');
                    if (onclick) {
                        debugLog(`[UI] Button clicked: ${onclick}`);
                        try {
                            const funcName = onclick.match(/^([a-zA-Z0-9_]+)\(/)?.[1];
                            if (funcName && typeof window[funcName] === 'function') {
                                disableButtonDuringAction(button, () => {
                                    return Promise.resolve(window[funcName]());
                                });
                            } else {
                                debugLog(`[UI] Function ${funcName} not found`);
                                showNotification(`Action ${funcName} not available.`, 'error');
                            }
                        } catch (err) {
                            debugLog(`[UI] Error executing ${onclick}`, err);
                            showNotification('Button action failed.', 'error');
                        }
                    } else {
                        debugLog('[UI] Button clicked but no onclick attribute found');
                    }
                }

                // Handle navigation links
                const navLink = e.target.closest('.nav-link');
                if (navLink) {
                    e.preventDefault();
                    const sectionId = navLink.getAttribute('href').substring(1);
                    debugLog(`[UI] Nav link clicked: ${sectionId}`);
                    switchSection(sectionId);
                }
            }, 200));

            // Filter input listeners
            const filterInputs = ['filterName', 'filterCategory', 'filterDot', 'filterQuantity'];
            filterInputs.forEach(id => {
                const element = document.getElementById(id);
                if (element) {
                    element.addEventListener('input', debounce(() => {
                        debugLog(`[UI] Filter input changed: ${id}`);
                        if (typeof currentPage !== 'undefined' && typeof renderTable === 'function') {
                            currentPage = 1;
                            if (typeof saveFilterSettings === 'function') {
                                saveFilterSettings();
                            }
                            renderTable();
                        }
                    }, 300));
                } else {
                    debugLog(`[UI] Filter element ${id} not found`);
                }
            });

            // Quantity slider listener
            const quantitySlider = document.getElementById('filterQuantity');
            if (quantitySlider) {
                quantitySlider.addEventListener('input', () => {
                    const valueSpan = document.getElementById('quantityValue');
                    if (valueSpan) {
                        valueSpan.textContent = `${quantitySlider.value}+`;
                    }
                });
            }

            // Keyboard shortcuts
            document.addEventListener('keydown', (e) => {
                if (e.ctrlKey) {
                    debugLog(`[UI] Key pressed: Ctrl+${e.key}`);
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

            debugLog('[UI] Event listeners set up successfully');
        } catch (err) {
            debugLog('[UI] Error setting up event listeners', err);
            showNotification('Error setting up app. Please refresh.', 'error');
        }
    });
}

// Initialize event listeners
setupEventListeners();