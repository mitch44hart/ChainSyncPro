 // auth.js - Firebase Authentication Logic

 import { auth } from './firebaseConfig.js'; // Import initialized auth instance
 import {
     createUserWithEmailAndPassword,
     signInWithEmailAndPassword,
     signOut,
     onAuthStateChanged
 } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
 import { showNotification } from './notifications.js';
 import { loadInitialData, cleanupListeners } from './app.js'; // Import functions to run on login/logout

 const loginPrompt = document.getElementById('login-prompt');
 const appContent = document.getElementById('app-content');
 const authContainer = document.getElementById('auth-container');
 const userEmailSpan = document.getElementById('user-email');
 const logoutButton = document.getElementById('logout-button');
 const loginButton = document.getElementById('login-button');
 const signupButton = document.getElementById('signup-button');
 const loginEmailInput = document.getElementById('login-email');
 const loginPasswordInput = document.getElementById('login-password');
 const authErrorP = document.getElementById('auth-error');

 let currentUid = null; // Store current user ID

 // --- Auth State Listener ---
 onAuthStateChanged(auth, (user) => {
    console.log("Auth state changed. User:", user);
    if (user) {
        // User is signed in
        currentUid = user.uid;
        console.log("User logged in:", currentUid);
        userEmailSpan.textContent = user.email || 'Logged In';
        authContainer.style.display = 'block';
        loginPrompt.style.display = 'none';
        appContent.style.display = 'block'; // Show the main app content
        authErrorP.textContent = ''; // Clear any previous errors
        loadInitialData(currentUid); // Load data specific to this user
    } else {
        // User is signed out
        console.log("User logged out.");
        currentUid = null;
        userEmailSpan.textContent = '';
        authContainer.style.display = 'none';
        appContent.style.display = 'none'; // Hide app content
        loginPrompt.style.display = 'flex'; // Show login prompt
        cleanupListeners(); // Detach Firestore listeners
    }
 });

 // --- Event Listeners ---
 loginButton?.addEventListener('click', async () => {
    const email = loginEmailInput.value;
    const password = loginPasswordInput.value;
    authErrorP.textContent = ''; // Clear error
    if (!email || !password) {
        authErrorP.textContent = 'Please enter email and password.';
        return;
    }
    try {
        console.log("Attempting login...");
        await signInWithEmailAndPassword(auth, email, password);
        console.log("Login successful");
        // Auth state listener will handle UI changes
    } catch (error) {
        console.error("Login failed:", error);
        authErrorP.textContent = `Login failed: ${error.message}`;
        showNotification(`Login failed: ${error.code}`, 'error');
    }
 });

 signupButton?.addEventListener('click', async () => {
    const email = loginEmailInput.value;
    const password = loginPasswordInput.value;
    authErrorP.textContent = ''; // Clear error
    if (!email || !password) {
        authErrorP.textContent = 'Please enter email and password for signup.';
        return;
    }
    if (password.length < 6) {
        authErrorP.textContent = 'Password should be at least 6 characters.';
        return;
    }
    try {
        console.log("Attempting signup...");
        await createUserWithEmailAndPassword(auth, email, password);
        console.log("Signup successful");
        showNotification('Signup successful! You are now logged in.', 'success');
        // Auth state listener will handle UI changes
    } catch (error) {
        console.error("Signup failed:", error);
        authErrorP.textContent = `Signup failed: ${error.message}`;
        showNotification(`Signup failed: ${error.code}`, 'error');
    }
 });

 logoutButton?.addEventListener('click', async () => {
    try {
        await signOut(auth);
        console.log("Logout successful");
        // Auth state listener will handle UI changes
    } catch (error) {
        console.error("Logout failed:", error);
        showNotification(`Logout failed: ${error.message}`, 'error');
    }
 });

 // Export function to get current user ID if needed by other modules
 export function getCurrentUserId() {
    return currentUid;
 }
