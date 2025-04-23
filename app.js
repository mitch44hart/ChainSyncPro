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

// DOM Elements
const elements = {
  loading: document.getElementById('loading'),
  authContainer: document.getElementById('auth-container'),
  loginPrompt: document.getElementById('login-prompt'),
  appContent: document.getElementById('app-content'),
  userEmail: document.getElementById('user-email'),
  logoutButton: document.getElementById('logout-button'),
  loginEmail: document.getElementById('login-email'),
  loginPassword: document.getElementById('login-password'),
  loginButton: document.getElementById('login-button'),
  signupButton: document.getElementById('signup-button'),
  authError: document.getElementById('auth-error'),
  navLinks: document.querySelectorAll('.nav-link'),
  debugMode: document.getElementById('debugMode'),
  categoryChart: document.getElementById('categoryChart'),
  toggleSidebar: document.getElementById('toggleSidebar'),
  sidebar: document.getElementById('sidebar')
};

// Initialize App
async function initializeApp() {
  try {
    elements.loading.classList.remove('hidden');
    const app = initializeApp(firebaseConfig);
    debugLog('Firebase app initialized', elements.debugMode);
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    if (!db || !dbAuth) {
      throw new Error('Database or auth not initialized.');
    }
    
    setupAuthListeners();
    setupNavigation();
    setupSidebar();
    await loadTheme();
    setupThreeJSChart();
    registerServiceWorker();
  } catch (error) {
    console.error('App initialization failed:', error);
    notyf.error('Failed to initialize application. Please refresh.');
    elements.loading.classList.add('hidden');
  }
}

// Authentication
function setupAuthListeners() {
  const auth = getAuth();
  
  onAuthStateChanged(auth, async (user) => {
    try {
      if (user) {
        elements.userEmail.textContent = user.email;
        elements.authContainer.classList.remove('hidden');
        elements.loginPrompt.classList.add('hidden');
        elements.appContent.classList.remove('hidden');
        await initInventory();
        debugLog(`User logged in: ${user.email}`, elements.debugMode);
      } else {
        elements.authContainer.classList.add('hidden');
        elements.loginPrompt.classList.remove('hidden');
        elements.appContent.classList.add('hidden');
        debugLog('No user logged in', elements.debugMode);
      }
    } catch (error) {
      console.error('Auth state change error:', error);
      notyf.error('Authentication error. Please try again.');
    } finally {
      elements.loading.classList.add('hidden');
    }
  });
  
  elements.loginButton.addEventListener('click', async () => {
    const email = elements.loginEmail.value.trim();
    const password = elements.loginPassword.value.trim();
    
    if (!email || !password) {
      elements.authError.textContent = 'Email and password are required.';
      return;
    }
    
    try {
      elements.loading.classList.remove('hidden');
      await signInWithEmailAndPassword(auth, email, password);
      notyf.success('Logged in successfully.');
      elements.authError.textContent = '';
      elements.loginEmail.value = '';
      elements.loginPassword.value = '';
    } catch (error) {
      console.error('Login error:', error);
      elements.authError.textContent = getAuthErrorMessage(error.code);
      notyf.error('Login failed.');
    } finally {
      elements.loading.classList.add('hidden');
    }
  });
  
  elements.signupButton.addEventListener('click', async () => {
    const email = elements.loginEmail.value.trim();
    const password = elements.loginPassword.value.trim();
    
    if (!email || !password) {
      elements.authError.textContent = 'Email and password are required.';
      return;
    }
    
    try {
      elements.loading.classList.remove('hidden');
      await createUserWithEmailAndPassword(auth, email, password);
      notyf.success('Account created successfully.');
      elements.authError.textContent = '';
      elements.loginEmail.value = '';
      elements.loginPassword.value = '';
    } catch (error) {
      console.error('Signup error:', error);
      elements.authError.textContent = getAuthErrorMessage(error.code);
      notyf.error('Signup failed.');
    } finally {
      elements.loading.classList.add('hidden');
    }
  });
  
  elements.logoutButton.addEventListener('click', async () => {
    try {
      elements.loading.classList.remove('hidden');
      await signOut(auth);
      notyf.success('Logged out successfully.');
    } catch (error) {
      console.error('Logout error:', error);
      notyf.error('Logout failed.');
    } finally {
      elements.loading.classList.add('hidden');
    }
  });
}

// Auth Error Messages
function getAuthErrorMessage(errorCode) {
  switch (errorCode) {
    case 'auth/invalid-email':
      return 'Invalid email address.';
    case 'auth/user-not-found':
      return 'No account found with this email.';
    case 'auth/wrong-password':
      return 'Incorrect password.';
    case 'auth/email-already-in-use':
      return 'Email already in use.';
    case 'auth/weak-password':
      return 'Password must be at least 6 characters.';
    default:
      return 'An error occurred. Please try again.';
  }
}

// Navigation
function setupNavigation() {
  elements.navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const section = link.getAttribute('href').substring(1);
      switchSection(section);
      elements.sidebar.classList.remove('open');
      debugLog(`Navigated to section: ${section}`, elements.debugMode);
    });
  });
}

// Sidebar
function setupSidebar() {
  elements.toggleSidebar.addEventListener('click', () => {
    elements.sidebar.classList.toggle('open');
    debugLog(`Sidebar toggled: ${elements.sidebar.classList.contains('open') ? 'open' : 'closed'}`, elements.debugMode);
  });
}

// Three.js Chart
function setupThreeJSChart() {
  if (!elements.categoryChart) return;
  
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(75, elements.categoryChart.clientWidth / elements.categoryChart.clientHeight, 0.1, 1000);
  const renderer = new THREE.WebGLRenderer({ canvas: elements.categoryChart, alpha: true });
  
  renderer.setSize(elements.categoryChart.clientWidth, elements.categoryChart.clientHeight);
  camera.position.z = 10;
  
  const addBars = (categories) => {
    scene.children.forEach(child => {
      if (child instanceof THREE.Mesh) scene.remove(child);
    });
    
    categories.forEach((data, index) => {
      const geometry = new THREE.BoxGeometry(0.8, data.normalized * 5, 0.8);
      const material = new THREE.MeshBasicMaterial({ color: 0x22c55e });
      const bar = new THREE.Mesh(geometry, material);
      bar.position.set(index * 1.2 - (categories.length * 0.6), (data.normalized * 5) / 2, 0);
      scene.add(bar);
    });
  };
  
  function animate() {
    requestAnimationFrame(animate);
    scene.rotation.y += 0.01;
    renderer.render(scene, camera);
  }
  animate();
  
  window.addEventListener('reportsUpdated', (e) => {
    addBars(e.detail.categories);
  });
  
  debugLog('Three.js chart initialized', elements.debugMode);
}

// Service Worker
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').then(reg => {
      debugLog(`Service worker registered: ${reg.scope}`, elements.debugMode);
    }).catch(error => {
      console.error('Service worker registration failed:', error);
    });
  }
}

// Start App
document.addEventListener('DOMContentLoaded', initializeApp);

export { initializeApp };
