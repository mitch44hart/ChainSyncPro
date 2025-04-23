let db;
const DB_NAME = 'ChainSyncLiteDB';
const DB_VERSION = 10; // Incremented to ensure schema updates
const INVENTORY_STORE = 'inventory';
const SETTINGS_STORE = 'settings';
const AUDIT_STORE = 'audit';
const SALES_STORE = 'sales';

function initializeDatabase(onSuccess) {
    console.log('Initializing database...'); // Debug log
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
        try {
            console.log('Upgrading database schema...');
            db = event.target.result;
            if (!db.objectStoreNames.contains(INVENTORY_STORE)) {
                const invStore = db.createObjectStore(INVENTORY_STORE, { keyPath: 'id', autoIncrement: true });
                invStore.createIndex('itemName', 'itemName', { unique: false });
                invStore.createIndex('category', 'category', { unique: false });
                invStore.createIndex('location', 'location', { unique: false });
                invStore.createIndex('quantity', 'quantity', { unique: false });
                invStore.createIndex('dotClassification', 'dotClassification', { unique: false });
            }
            if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
                db.createObjectStore(SETTINGS_STORE, { keyPath: 'key' });
            }
            if (!db.objectStoreNames.contains(AUDIT_STORE)) {
                const auditStore = db.createObjectStore(AUDIT_STORE, { keyPath: 'id', autoIncrement: true });
                auditStore.createIndex('timestamp', 'timestamp', { unique: false });
            }
            if (!db.objectStoreNames.contains(SALES_STORE)) {
                const salesStore = db.createObjectStore(SALES_STORE, { keyPath: 'id', autoIncrement: true });
                salesStore.createIndex('timestamp', 'timestamp', { unique: false });
            }
            console.log('Database schema upgraded successfully');
        } catch (err) {
            debugLog('Error upgrading database', err);
            showNotification('Error setting up database.', 'error');
        }
    };

    request.onsuccess = (event) => {
        try {
            db = event.target.result;
            console.log('Database initialized successfully');
            onSuccess();
        } catch (err) {
            debugLog('Error initializing database', err);
            showNotification('Error initializing database.', 'error');
        }
    };

    request.onerror = (event) => {
        debugLog('Database error', event);
        showNotification('Error opening database.', 'error');
    };
}

function isDbReady() {
    if (!db) {
        showNotification('Database not ready. Please refresh.', 'error');
        return false;
    }
    return true;
}

async function getAllFromStore(storeName) {
    if (!isDbReady()) return [];
    try {
        const transaction = db.transaction([storeName], 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.getAll();
        return new Promise((resolve, reject) => {
            request.onsuccess = () => {
                console.log(`Loaded ${storeName} data`);
                resolve(request.result);
            };
            request.onerror = () => {
                debugLog(`Error loading from ${storeName}`);
                showNotification(`Error loading from ${storeName}.`, 'error');
                reject();
            };
        });
    } catch (err) {
        debugLog(`Error loading from ${storeName}`, err);
        showNotification(`Error loading from ${storeName}.`, 'error');
        return [];
    }
}

async function saveToStore(storeName, item) {
    if (!isDbReady()) return;
    try {
        const transaction = db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.put(item);
        return new Promise((resolve, reject) => {
            request.onsuccess = () => {
                console.log(`Saved to ${storeName}`);
                resolve();
            };
            request.onerror = () => {
                debugLog(`Error saving to ${storeName}`);
                showNotification(`Error saving to ${storeName}.`, 'error');
                reject();
            };
        });
    } catch (err) {
        debugLog(`Error saving to ${storeName}`, err);
        showNotification(`Error saving to ${storeName}.`, 'error');
    }
}

async function deleteFromStore(storeName, id) {
    if (!isDbReady()) return;
    try {
        const transaction = db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.delete(id);
        return new Promise((resolve, reject) => {
            request.onsuccess = () => {
                console.log(`Deleted from ${storeName}`);
                resolve();
            };
            request.onerror = () => {
                debugLog(`Error deleting from ${storeName}`);
                showNotification(`Error deleting from ${storeName}.`, 'error');
                reject();
            };
        });
    } catch (err) {
        debugLog(`Error deleting from ${storeName}`, err);
        showNotification(`Error deleting from ${storeName}.`, 'error');
    }
}

async function clearStore(storeName) {
    if (!isDbReady()) return;
    try {
        const transaction = db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.clear();
        return new Promise((resolve, reject) => {
            request.onsuccess = () => {
                console.log(`Cleared ${storeName}`);
                resolve();
            };
            request.onerror = () => {
                debugLog(`Error clearing ${storeName}`);
                showNotification(`Error clearing ${storeName}.`, 'error');
                reject();
            };
        });
    } catch (err) {
        debugLog(`Error clearing ${storeName}`, err);
        showNotification(`Error clearing ${storeName}.`, 'error');
    }
}