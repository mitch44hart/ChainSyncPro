import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  getFirestore,
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  orderBy,
  limit,
  startAfter,
  getDoc,
  setDoc,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { notyf } from './ui.js';

// Firebase Configuration
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// Initialize Firebase with Retry Logic
let db;
let auth;
function initializeFirebase() {
  let retries = 3;
  const attemptInit = async () => {
    try {
      const app = initializeApp(firebaseConfig);
      db = getFirestore(app);
      auth = getAuth(app);
      if (elements.debugMode?.checked) {
        console.log('Firebase initialized successfully.');
      }
    } catch (error) {
      if (retries > 0) {
        retries--;
        if (elements.debugMode?.checked) {
          console.warn(`Firebase init failed, retrying (${retries} left):`, error);
        }
        setTimeout(attemptInit, 1000);
      } else {
        console.error('Firebase initialization failed:', error);
        notyf.error('Failed to connect to database. Please try again later.');
      }
    }
  };
  attemptInit();
}

// DOM Elements (for debug mode)
const elements = {
  debugMode: document.getElementById('debugMode')
};

// Valid DOT Classes
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

// Save Item
async function saveItem(itemData) {
  if (!db || !auth.currentUser) {
    notyf.error('Database or user not initialized.');
    return false;
  }
  
  try {
    // Validate itemData
    if (!itemData.name || typeof itemData.quantity !== 'number' || itemData.quantity < 0) {
      throw new Error('Invalid item data: name and non-negative quantity required.');
    }
    if (itemData.dotClass && !DOT_CLASSES.includes(itemData.dotClass)) {
      throw new Error(`Invalid DOT class: ${itemData.dotClass}`);
    }
    
    const itemRef = await addDoc(collection(db, 'users', auth.currentUser.uid, 'inventory'), {
      ...itemData,
      createdAt: serverTimestamp(),
      dotClass: itemData.dotClass || 'None'
    });
    
    await addAuditLog('ADD_ITEM', itemData.name, `Added ${itemData.quantity} units`);
    if (elements.debugMode?.checked) {
      console.log(`Item saved: ${itemData.name}, ID: ${itemRef.id}`);
    }
    return itemRef.id;
  } catch (error) {
    console.error('Error saving item:', error);
    notyf.error(`Failed to save item: ${error.message}`);
    return false;
  }
}

// Update Item
async function updateItem(itemId, updatedData) {
  if (!db || !auth.currentUser) {
    notyf.error('Database or user not initialized.');
    return false;
  }
  
  try {
    if (updatedData.dotClass && !DOT_CLASSES.includes(updatedData.dotClass)) {
      throw new Error(`Invalid DOT class: ${updatedData.dotClass}`);
    }
    
    await updateDoc(doc(db, 'users', auth.currentUser.uid, 'inventory', itemId), {
      ...updatedData,
      updatedAt: serverTimestamp()
    });
    
    await addAuditLog('EDIT_ITEM', updatedData.name || itemId, 'Updated details');
    if (elements.debugMode?.checked) {
      console.log(`Item updated: ${itemId}`);
    }
    return true;
  } catch (error) {
    console.error('Error updating item:', error);
    notyf.error(`Failed to update item: ${error.message}`);
    return false;
  }
}

// Delete Item
async function deleteItem(itemId, itemName) {
  if (!db || !auth.currentUser) {
    notyf.error('Database or user not initialized.');
    return false;
  }
  
  try {
    await deleteDoc(doc(db, 'users', auth.currentUser.uid, 'inventory', itemId));
    await addAuditLog('DELETE_ITEM', itemName, 'Removed from inventory');
    if (elements.debugMode?.checked) {
      console.log(`Item deleted: ${itemId}`);
    }
    return true;
  } catch (error) {
    console.error('Error deleting item:', error);
    notyf.error(`Failed to delete item: ${error.message}`);
    return false;
  }
}

// Save Sale
async function saveSale(saleData) {
  if (!db || !auth.currentUser) {
    notyf.error('Database or user not initialized.');
    return false;
  }
  
  try {
    if (!saleData.itemName || typeof saleData.quantity !== 'number' || saleData.quantity <= 0) {
      throw new Error('Invalid sale data: item name and positive quantity required.');
    }
    
    const snapshot = await getDocs(collection(db, 'users', auth.currentUser.uid, 'inventory'));
    const item = snapshot.docs.find(doc => doc.data().name === saleData.itemName);
    
    if (!item) {
      throw new Error('Item not found in inventory.');
    }
    
    const currentQuantity = parseInt(item.data().quantity || 0);
    if (currentQuantity < saleData.quantity) {
      throw new Error('Insufficient stock for sale.');
    }
    
    const saleRef = await addDoc(collection(db, 'users', auth.currentUser.uid, 'sales'), {
      ...saleData,
      timestamp: serverTimestamp()
    });
    
    await updateDoc(doc(db, 'users', auth.currentUser.uid, 'inventory', item.id), {
      quantity: currentQuantity - saleData.quantity
    });
    
    await addAuditLog('RECORD_SALE', saleData.itemName, `Sold ${saleData.quantity} units`);
    if (elements.debugMode?.checked) {
      console.log(`Sale recorded: ${saleData.itemName}, ID: ${saleRef.id}`);
    }
    return saleRef.id;
  } catch (error) {
    console.error('Error recording sale:', error);
    notyf.error(`Failed to record sale: ${error.message}`);
    return false;
  }
}

// Bulk Import
async function bulkImport(items) {
  if (!db || !auth.currentUser) {
    notyf.error('Database or user not initialized.');
    return false;
  }
  
  try {
    const batch = [];
    for (const item of items) {
      if (!item.name || typeof item.quantity !== 'number' || item.quantity < 0) {
        throw new Error(`Invalid item data: ${JSON.stringify(item)}`);
      }
      if (item.dotClass && !DOT_CLASSES.includes(item.dotClass)) {
        throw new Error(`Invalid DOT class in item: ${item.dotClass}`);
      }
      
      batch.push({
        ref: collection(db, 'users', auth.currentUser.uid, 'inventory'),
        data: {
          ...item,
          createdAt: serverTimestamp(),
          dotClass: item.dotClass || 'None'
        }
      });
    }
    
    for (const { ref, data } of batch) {
      const itemRef = await addDoc(ref, data);
      await addAuditLog('BULK_IMPORT', data.name, `Added ${data.quantity} units`);
      if (elements.debugMode?.checked) {
        console.log(`Bulk item imported: ${data.name}, ID: ${itemRef.id}`);
      }
    }
    
    notyf.success(`Imported ${batch.length} items successfully.`);
    return true;
  } catch (error) {
    console.error('Error during bulk import:', error);
    notyf.error(`Failed to import items: ${error.message}`);
    return false;
  }
}

// Backup Data
async function backupData() {
  if (!db || !auth.currentUser) {
    notyf.error('Database or user not initialized.');
    return null;
  }
  
  try {
    const collections = ['inventory', 'sales', 'audit'];
    const backup = {};
    
    for (const col of collections) {
      const snapshot = await getDocs(collection(db, 'users', auth.currentUser.uid, col));
      backup[col] = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }
    
    const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
    if (userDoc.exists()) {
      backup.user = userDoc.data();
    }
    
    if (elements.debugMode?.checked) {
      console.log('Backup created:', backup);
    }
    return backup;
  } catch (error) {
    console.error('Error creating backup:', error);
    notyf.error('Failed to create backup.');
    return null;
  }
}

// Restore Data
async function restoreData(backup) {
  if (!db || !auth.currentUser) {
    notyf.error('Database or user not initialized.');
    return false;
  }
  
  try {
    // Clear existing data
    const collections = ['inventory', 'sales', 'audit'];
    for (const col of collections) {
      const snapshot = await getDocs(collection(db, 'users', auth.currentUser.uid, col));
      for (const docSnap of snapshot.docs) {
        await deleteDoc(doc(db, 'users', auth.currentUser.uid, col, docSnap.id));
      }
    }
    
    // Restore inventory
    for (const item of backup.inventory || []) {
      await addDoc(collection(db, 'users', auth.currentUser.uid, 'inventory'), {
        ...item,
        createdAt: serverTimestamp(),
        dotClass: item.dotClass && DOT_CLASSES.includes(item.dotClass) ? item.dotClass : 'None'
      });
    }
    
    // Restore sales
    for (const sale of backup.sales || []) {
      await addDoc(collection(db, 'users', auth.currentUser.uid, 'sales'), {
        ...sale,
        timestamp: serverTimestamp()
      });
    }
    
    // Restore audit logs
    for (const log of backup.audit || []) {
      await addDoc(collection(db, 'users', auth.currentUser.uid, 'audit'), {
        ...log,
        timestamp: serverTimestamp()
      });
    }
    
    // Restore user settings
    if (backup.user) {
      await setDoc(doc(db, 'users', auth.currentUser.uid), backup.user, { merge: true });
    }
    
    await addAuditLog('RESTORE_DATA', null, 'Restored data from backup');
    notyf.success('Data restored successfully.');
    if (elements.debugMode?.checked) {
      console.log('Data restored:', backup);
    }
    return true;
  } catch (error) {
    console.error('Error restoring data:', error);
    notyf.error('Failed to restore data.');
    return false;
  }
}

// Save User Settings
async function saveUserSettings(settings) {
  if (!db || !auth.currentUser) {
    notyf.error('Database or user not initialized.');
    return false;
  }
  
  try {
    await setDoc(doc(db, 'users', auth.currentUser.uid), {
      settings: {
        ...settings,
        updatedAt: serverTimestamp()
      }
    }, { merge: true });
    
    if (elements.debugMode?.checked) {
      console.log('User settings saved:', settings);
    }
    return true;
  } catch (error) {
    console.error('Error saving user settings:', error);
    notyf.error('Failed to save settings.');
    return false;
  }
}

// Load User Settings
async function loadUserSettings() {
  if (!db || !auth.currentUser) {
    notyf.error('Database or user not initialized.');
    return null;
  }
  
  try {
    const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
    const settings = userDoc.exists() && userDoc.data().settings ? userDoc.data().settings : {};
    if (elements.debugMode?.checked) {
      console.log('User settings loaded:', settings);
    }
    return settings;
  } catch (error) {
    console.error('Error loading user settings:', error);
    notyf.error('Failed to load settings.');
    return null;
  }
}

// Add Audit Log
async function addAuditLog(action, itemName, details) {
  if (!db || !auth.currentUser) {
    return;
  }
  
  try {
    await addDoc(collection(db, 'users', auth.currentUser.uid, 'audit'), {
      action,
      itemName,
      details,
      timestamp: serverTimestamp()
    });
    if (elements.debugMode?.checked) {
      console.log(`Audit log added: ${action}, ${itemName}`);
    }
  } catch (error) {
    console.error('Error adding audit log:', error);
  }
}

// Real-Time Listeners
function setupRealtimeListeners(callbacks) {
  if (!db || !auth.currentUser) {
    notyf.error('Database or user not initialized.');
    return;
  }
  
  const userId = auth.currentUser.uid;
  
  // Inventory Listener
  const inventoryUnsubscribe = onSnapshot(
    query(collection(db, 'users', userId, 'inventory'), orderBy('name')),
    (snapshot) => {
      const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      callbacks.onInventoryUpdate(items);
      checkLowStock(items);
    },
    (error) => {
      console.error('Inventory listener error:', error);
      notyf.error('Failed to update inventory in real-time.');
    }
  );
  
  // Sales Listener
  const salesUnsubscribe = onSnapshot(
    query(collection(db, 'users', userId, 'sales'), orderBy('timestamp', 'desc')),
    (snapshot) => {
      const sales = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      callbacks.onSalesUpdate(sales);
    },
    (error) => {
      console.error('Sales listener error:', error);
      notyf.error('Failed to update sales in real-time.');
    }
  );
  
  // Audit Listener
  const auditUnsubscribe = onSnapshot(
    query(collection(db, 'users', userId, 'audit'), orderBy('timestamp', 'desc')),
    (snapshot) => {
      const logs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      callbacks.onAuditUpdate(logs);
    },
    (error) => {
      console.error('Audit listener error:', error);
      notyf.error('Failed to update audit log in real-time.');
    }
  );
  
  // User Settings Listener
  const settingsUnsubscribe = onSnapshot(
    doc(db, 'users', userId),
    (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        callbacks.onSettingsUpdate({
          locations: data.locations || [],
          categories: data.categories || [],
          settings: data.settings || {}
        });
      }
    },
    (error) => {
      console.error('Settings listener error:', error);
      notyf.error('Failed to update settings in real-time.');
    }
  );
  
  return () => {
    inventoryUnsubscribe();
    salesUnsubscribe();
    auditUnsubscribe();
    settingsUnsubscribe();
    if (elements.debugMode?.checked) {
      console.log('Real-time listeners unsubscribed.');
    }
  };
}

// Check Low Stock
async function checkLowStock(items) {
  const settings = await loadUserSettings();
  const lowStockThreshold = settings?.lowStockThreshold || 10;
  
  const lowStockItems = items.filter(item => item.quantity <= lowStockThreshold);
  if (lowStockItems.length > 0) {
    const message = `Low stock alert: ${lowStockItems.map(item => `${item.name} (${item.quantity})`).join(', ')}`;
    notyf.error(message);
    if (elements.debugMode?.checked) {
      console.log('Low stock detected:', lowStockItems);
    }
  }
}

// Initialize Database
initializeFirebase();

export {
  db,
  auth,
  saveItem,
  updateItem,
  deleteItem,
  saveSale,
  bulkImport,
  backupData,
  restoreData,
  saveUserSettings,
  loadUserSettings,
  addAuditLog,
  setupRealtimeListeners
};
