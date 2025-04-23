function getNotyfInstance() {
    if (window.Notyf) {
        return new Notyf({
            duration: 3000,
            position: { x: 'right', y: 'bottom' },
            dismissible: true
        });
    }
    console.warn('Notyf not available. Notifications will use console.log.');
    return null;
}
const notyf = getNotyfInstance();

function debugLog(message, error = null) {
    if (settings.debugMode) {
        console.log(`[${new Date().toISOString()}] ${message}`, error || '');
    }
}

function showNotification(message, type = 'info') {
    try {
        if (notyf && window.Notyf) {
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
        debugLog('Notification error', err);
        console.error('Notification error:', err);
    }
}

function openModal(modalId) {
    try {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('hidden');
            modal.focus();
        } else {
            debugLog(`Modal ${modalId} not found`);
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
        debugLog(`Switching to section: ${sectionId}`);
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
            if (sectionElement) {
                sectionElement.innerHTML = '<p class="fallback">Error loading section. Please try again.</p>';
            }
            return;
        }

        document.querySelectorAll('.section').forEach(section => section.classList.remove('active'));
        document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
        sectionElement.classList.add('active');
        navLink.classList.add('active');

        if (sectionId === 'reports') {
            renderReportsTable();
        }

        debugLog(`Switched to section: ${sectionId}`);
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
        debugLog('Setting up event listeners');
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
                    debugLog(`Nav link clicked: ${sectionId}`);
                    switchSection(sectionId);
                }
            } catch (err) {
                debugLog('Error in nav click handler', err);
                showNotification('Error navigating. Please try again.', 'error');
            }
        }

        document.getElementById('searchInput').addEventListener('input', debounce(() => {
            currentPage = 1;
            renderTable();
        }, 300));
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 's') {
                e.preventDefault();
                startScanner();
            }
            if (e.ctrlKey && e.key === 'Enter') {
                e.preventDefault();
                quickAddItem();
            }
        });

        debugLog('Event listeners set up successfully');
    } catch (err) {
        debugLog('Error setting up event listeners', err);
        showNotification('Error setting up navigation. Please refresh.', 'error');
    }
}