import { getFirestore, collection, addDoc, updateDoc, deleteDoc, getDocs, onSnapshot, doc, setDoc, getDoc } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { notyf } from './ui.js';
import { debugLog } from './utils.js';

const db = getFirestore();
const auth = getAuth();

async function saveItem(itemData) {
  try {
    const user = auth.currentUser;
    if (!user) throw new Error('User not authenticated.');
    
    const docRef = await addDoc(collection(db, 'users', user.uid, 'inventory'), {
      ...itemData,
      createdAt: new Date()
    });
    
    await addAuditLog('ADD_ITEM', itemData.name, `Added item with ID: ${docRef.id}`);
    debugLog(`Saved item: ${itemData.name}`, document.getElementById('debugMode'));
    return docRef.id;
  } catch (error) {
    console.error('Error saving item:', error);
    notyf.error('Failed to save item.');
    return null;
  }
}

async function updateItem(itemId, updates) {
  try {
    const user = auth.currentUser;
    if (!user) throw new Error('User not authenticated.');
    
    await updateDoc(doc(db, 'users', user.uid, 'inventory', itemId), updates);
    await addAuditLog('UPDATE_ITEM', updates.name || itemId, `Updated item with ID: ${itemId}`);
    debugLog(`Updated item: ${itemId}`, document.getElementById('debugMode'));
  } catch (error) {
    console.error('Error updating item:', error);
    notyf.error('Failed to update item.');
  }
}

async function deleteItem(itemId, itemName) {
  try {
    const user = auth.currentUser;
    if (!user) throw new Error('User not authenticated.');
    
    await deleteDoc(doc(db, 'users', user.uid, 'inventory', itemId));
    await addAuditLog('DELETE_ITEM', itemName, `Deleted item with ID: ${itemId}`);
    debugLog(`Deleted item: ${itemId}`, document.getElementById('debugMode'));
  } catch (error) {
    console.error('Error deleting item:', error);
    notyf.error('Failed to delete item.');
  }
}

async function saveSale(saleData) {
  try {
    const user = auth.currentUser;
    if (!user) throw new Error('User not authenticated.');
    
    const snapshot = await getDocs(collection(db, 'users', user.uid, 'inventory'));
    const item = snapshot.docs.find(doc => doc.data().name === saleData.itemName);
    
    if (!item) {
      notyf.error('Item not found in inventory.');
      return;
    }
    
    const itemData = item.data();
    const newQuantity = (itemData.quantity || 0) - saleData.quantity;
    
    if (newQuantity < 0) {
      notyf.error('Not enough stock to record sale.');
      return;
    }
    
    await updateDoc(doc(db, 'users', user.uid, 'inventory', item.id), { quantity: newQuantity });
    const saleRef = await addDoc(collection(db, 'users', user.uid, 'sales'), {
      ...saleData,
      timestamp: new Date()
    });
    
    await addAuditLog('RECORD_SALE', saleData.itemName, `Recorded sale of ${saleData.quantity} units`);
    debugLog(`Saved sale: ${saleData.itemName}`, document.getElementById('debugMode'));
    return saleRef.id;
  } catch (error) {
    console.error('Error saving sale:', error);
    notyf.error('Failed to record sale.');
  }
}

async function bulkImport(items) {
  try {
    const user = auth.currentUser;
    if (!user) throw new Error('User not authenticated.');
    
    const batch = items.map(async item => {
      const docRef = await addDoc(collection(db, 'users', user.uid, 'inventory'), {
        ...item,
        createdAt: new Date()
      });
      await addAuditLog('BULK_IMPORT', item.name, `Imported item with ID: ${docRef.id}`);
      return docRef.id;
    });
    
    await Promise.all(batch);
    debugLog(`Imported ${items.length} items`, document.getElementById('debugMode'));
    notyf.success(`Successfully imported ${items.length} items.`);
  } catch (error) {
    console.error('Error during bulk import:', error);
    notyf.error('Failed to import items.');
  }
}

async function addAuditLog(action, itemName, details) {
  try {
    const user = auth.currentUser;
    if (!user) return;
    
    await addDoc(collection(db, 'users', user.uid, 'audit'), {
      action,
      itemName,
      details,
      timestamp: new Date()
    });
  } catch (error) {
    console.error('Error adding audit log:', error);
  }
}

async function backupData() {
  try {
    const user = auth.currentUser;
    if (!user) throw new Error('User not authenticated.');
    
    const collections = ['inventory', 'sales', 'audit'];
    const backup = {};
    
    for (const col of collections) {
      const snapshot = await getDocs(collection(db, 'users', user.uid, col));
      backup[col] = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }
    
    const settings = await getDoc(doc(db, 'users', user.uid));
    backup.settings = settings.exists() ? settings.data() : {};
    
    debugLog('Data backup created', document.getElementById('debugMode'));
    return backup;
  } catch (error) {
    console.error('Error backing up data:', error);
    notyf.error('Failed to backup data.');
    return null;
  }
}

async function restoreData(backup) {
  try {
    const user = auth.currentUser;
    if (!user) throw new Error('User not authenticated.');
    
    const collections = ['inventory', 'sales', 'audit'];
    
    for (const col of collections) {
      const snapshot = await getDocs(collection(db, 'users', user.uid, col));
      for (const docSnap of snapshot.docs) {
        await deleteDoc(doc(db, 'users', user.uid, col, docSnap.id));
      }
      
      for (const item of backup[col] || []) {
        const { id, ...data } = item;
        await setDoc(doc(db, 'users', user.uid, col, id), data);
      }
    }
    
    if (backup.settings) {
      await setDoc(doc(db, 'users', user.uid), backup.settings);
    }
    
    await addAuditLog('RESTORE_DATA', null, 'Restored data from backup');
    debugLog('Data restored', document.getElementById('debugMode'));
    notyf.success('Data restored successfully.');
  } catch (error) {
    console.error('Error restoring data:', error);
    notyf.error('Failed to restore data.');
  }
}

async function saveUserSettings(settings) {
  try {
    const user = auth.currentUser;
    if (!user) throw new Error('User not authenticated.');
    
    await setDoc(doc(db, 'users', user.uid), settings, { merge: true });
    debugLog('User settings saved', document.getElementById('debugMode'));
  } catch (error) {
    console.error('Error saving settings:', error);
    notyf.error('Failed to save settings.');
  }
}

async function loadUserSettings() {
  try {
    const user = auth.currentUser;
    if (!user) throw new Error('User not authenticated.');
    
    const docSnap = await getDoc(doc(db, 'users', user.uid));
    debugLog('User settings loaded', document.getElementById('debugMode'));
    return docSnap.exists() ? docSnap.data() : {};
  } catch (error) {
    console.error('Error loading settings:', error);
    notyf.error('Failed to load settings.');
    return {};
  }
}

function setupRealtimeListeners({ onInventoryUpdate, onSalesUpdate, onAuditUpdate, onSettingsUpdate }) {
  try {
    const user = auth.currentUser;
    if (!user) throw new Error('User not authenticated.');
    
    const inventoryUnsub = onSnapshot(collection(db, 'users', user.uid, 'inventory'), (snapshot) => {
      const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      onInventoryUpdate(items);
    });
    
    const salesUnsub = onSnapshot(collection(db, 'users', user.uid, 'sales'), (snapshot) => {
      const sales = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      onSalesUpdate(sales);
    });
    
    const auditUnsub = onSnapshot(collection(db, 'users', user.uid, 'audit'), (snapshot) => {
      const logs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      onAuditUpdate(logs);
    });
    
    const settingsUnsub = onSnapshot(doc(db, 'users', user.uid), (docSnap) => {
      onSettingsUpdate(docSnap.exists() ? docSnap.data() : {});
    });
    
    debugLog('Realtime listeners set up', document.getElementById('debugMode'));
    return () => {
      inventoryUnsub();
      salesUnsub();
      auditUnsub();
      settingsUnsub();
    };
  } catch (error) {
    console.error('Error setting up listeners:', error);
    notyf.error('Failed to set up real-time updates.');
    return () => {};
  }
}

export {
  db,
  auth,
  saveItem,
  updateItem,
  deleteItem,
  saveSale,
  bulkImport,
  addAuditLog,
  backupData,
  restoreData,
  saveUserSettings,
  loadUserSettings,
  setupRealtimeListeners
};