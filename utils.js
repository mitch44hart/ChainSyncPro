import { notyf } from './ui.js';

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

// Debug Logging
function debugLog(message, debugMode) {
  if (debugMode?.checked) {
    console.log(`[ChainSync Lite] ${message}`);
  }
}

// Error Formatting
function formatError(error, defaultMessage = 'An error occurred.') {
  const message = error?.message || defaultMessage;
  notyf.error(message);
  return message;
}

// Item Validation
function validateItem(item, isBulk = false) {
  try {
    if (!item.name || typeof item.name !== 'string' || item.name.trim() === '') {
      throw new Error('Item name is required and must be a non-empty string.');
    }
    if (typeof item.quantity !== 'number' || item.quantity < 0 || isNaN(item.quantity)) {
      throw new Error('Quantity must be a non-negative number.');
    }
    if (item.dotClass && !DOT_CLASSES.includes(item.dotClass)) {
      throw new Error(`Invalid DOT class: ${item.dotClass}`);
    }
    if (item.price && (typeof item.price !== 'number' || item.price < 0)) {
      throw new Error('Price must be a non-negative number.');
    }
    return true;
  } catch (error) {
    formatError(error, isBulk ? `Invalid item: ${error.message}` : error.message);
    return false;
  }
}

// CSV Parsing for Bulk Upload
async function parseCSV(file) {
  try {
    if (!file || !file.name.endsWith('.csv')) {
      throw new Error('Please upload a valid CSV file.');
    }

    const text = await file.text();
    const rows = text.split('\n').map(row => row.trim()).filter(row => row);
    if (rows.length < 1) {
      throw new Error('CSV file is empty.');
    }

    const headers = rows[0].split(',').map(h => h.trim().toLowerCase());
    const requiredHeaders = ['name', 'quantity'];
    const missingHeaders = requiredHeaders.filter(h => !headers.includes(h));
    if (missingHeaders.length > 0) {
      throw new Error(`Missing required headers: ${missingHeaders.join(', ')}`);
    }

    const items = [];
    for (let i = 1; i < rows.length; i++) {
      const values = rows[i].split(',').map(v => v.trim());
      const item = {};
      headers.forEach((header, index) => {
        item[header] = values[index] || '';
      });

      // Normalize data
      item.quantity = parseInt(item.quantity) || 0;
      item.price = item.price ? parseFloat(item.price) : undefined;
      item.dotClass = item.dotclass || item.dot_class || 'None';
      item.category = item.category || '';
      item.location = item.location || '';

      if (validateItem(item, true)) {
        items.push({
          name: item.name,
          quantity: item.quantity,
          category: item.category,
          location: item.location,
          dotClass: item.dotClass,
          price: item.price
        });
      }
    }

    if (items.length === 0) {
      throw new Error('No valid items found in CSV.');
    }

    debugLog(`Parsed ${items.length} items from CSV`, document.getElementById('debugMode'));
    return items;
  } catch (error) {
    formatError(error, 'Failed to parse CSV file.');
    return [];
  }
}

// Date Formatter
function formatDate(timestamp) {
  try {
    const date = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  } catch (error) {
    debugLog(`Date format error: ${error.message}`, document.getElementById('debugMode'));
    return '-';
  }
}

// Currency Formatter
function formatCurrency(value) {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(value || 0);
  } catch (error) {
    debugLog(`Currency format error: ${error.message}`, document.getElementById('debugMode'));
    return '$0.00';
  }
}

// Number Formatter
function formatNumber(value) {
  try {
    return new Intl.NumberFormat('en-US').format(value || 0);
  } catch (error) {
    debugLog(`Number format error: ${error.message}`, document.getElementById('debugMode'));
    return '0';
  }
}

// Three.js Data Normalizer
function normalizeThreeJSData(categories) {
  try {
    const maxQuantity = Math.max(...Object.values(categories).map(c => c.totalQuantity), 1);
    return Object.entries(categories).map(([name, data]) => ({
      name,
      quantity: data.totalQuantity,
      normalized: data.totalQuantity / maxQuantity
    }));
  } catch (error) {
    debugLog(`Three.js data normalization error: ${error.message}`, document.getElementById('debugMode'));
    return [];
  }
}

export {
  DOT_CLASSES,
  debugLog,
  formatError,
  validateItem,
  parseCSV,
  formatDate,
  formatCurrency,
  formatNumber,
  normalizeThreeJSData
};
