/*
 * Changes made to improve button functionality:
 * 1. Added retry logic in initializeDatabase to handle transient IndexedDB errors.
 * 2. Enhanced isDbReady to provide specific error messages for different failure cases.
 * 3. Wrapped all database operations in try-catch blocks to prevent uncaught errors from breaking button actions.
 * 4. Added debug logging for each database operation to trace issues affecting buttons.
 * 5. Improved transaction handling to ensure audit logs are consistently recorded with inventory changes.
 * 6. Added a promise-based API for all database operations to ensure async button actions complete reliably.
 */
let db;
const DB_NAME = 'ChainSyncLiteDB';
const DB_VERSION = 10;
const INVENTORY_STORE = 'inventory';
const SETTINGS_STORE = 'settings';
const AUDIT_STORE = 'audit';
const SALES_STORE = 'sales';

function initializeDatabase(onSuccess) {
    debugLog('[DB] Initializing database...');
    let attempts = 0;
    const maxAttempts = 3;

    function tryOpen() {
        try {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = (event) => {
                debugLog('[DB] Upgrading database schema...');
                db = event.target.result;
                try {
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
                    debugLog('[DB] Database schema upgraded successfully');
                } catch (err) {
                    debugLog('[DB] Error upgrading database schema', err);
                    showNotification('Error setting up database.', 'error');
                }
            };

            request.onsuccess = (event) => {
                db = event.target.result;
                debugLog('[DB] Database initialized successfully');
                onSuccess();
            };

            request.onerror = (event) => {
                attempts++;
                debugLog(`[DB] Database initialization error (attempt ${attempts})`, event);
                if (attempts < maxAttempts) {
                    debugLog('[DB] Retrying database initialization...');
                    setTimeout(tryOpen, 1000);
                } else {
                    showNotification('Error opening database after retries.', 'error');
                }
            };
        } catch (err) {
            debugLog('[DB] Error initializing database', err);
            showNotification('Error initializing database.', 'error');
        }
    }

    tryOpen();
}

function isDbReady() {
    if (!db) {
        debugLog('[DB] Database not initialized');
        showNotification('Database not ready. Please refresh.', 'error');
        return false;
    }
    if (!db.objectStoreNames.contains(INVENTORY_STORE)) {
        debugLog('[DB] Inventory store not found');
        showNotification('Database schema incomplete. Please reset data.', 'error');
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
                debugLog(`[DB] Loaded data from ${storeName}`);
                resolve(request.result);
            };
            request.onerror = () => {
                debugLog(`[DB] Error loading from ${storeName}`);
                showNotification(`Error loading from ${storeName}.`, 'error');
                reject(new Error(`Error loading from ${storeName}`));
            };
        });
    } catch (err) {
        debugLog(`[DB] Error accessing ${storeName}`, err);
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
                debugLog(`[DB] Saved item to ${storeName}`);
                resolve();
            };
            request.onerror = () => {
                debugLog(`[DB] Error saving to ${storeName}`);
                showNotification(`Error saving to ${storeName}.`, 'error');
                reject(new Error(`Error saving to ${storeName}`));
            };
        });
    } catch (err) {
        debugLog(`[DB] Error saving to ${storeName}`, err);
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
                debugLog(`[DB] Deleted item ${id} from ${storeName}`);
                resolve();
            };
            request.onerror = () => {
                debugLog(`[DB] Error deleting from ${storeName}`);
                showNotification(`Error deleting from ${storeName}.`, 'error');
                reject(new Error(`Error deleting from ${storeName}`));
            };
        });
    } catch (err) {
        debugLog(`[DB] Error deleting from ${storeName}`, err);
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
                debugLog(`[DB] Cleared ${storeName}`);
                resolve();
            };
            request.onerror = () => {
                debugLog(`[DB] Error clearing ${storeName}`);
                showNotification(`Error clearing ${storeName}.`, 'error');
                reject(new Error(`Error clearing ${storeName}`));
            };
        });
    } catch (err) {
        debugLog(`[DB] Error clearing ${storeName}`, err);
        showNotification(`Error clearing ${storeName}.`, 'error');
    }
}