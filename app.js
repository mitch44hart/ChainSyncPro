import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { initInventory } from './inventory.js';
import { switchSection, loadTheme, updateTheme, notyf } from './ui.js';
import { db, auth as dbAuth } from './db.js';
import { debugLog } from './utils.js';
import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r134/three.min.js';

// Firebase Configuration
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// ... (rest of the file unchanged)
