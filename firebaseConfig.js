 // firebaseConfig.js - Initialize Firebase App

 // Import functions from the Firebase SDKs
 import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
 import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
 import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
 // Import other services like getAnalytics if needed

 // Your web app's Firebase configuration
 // Get this from your Firebase project settings:
 // Project settings > General > Your apps > SDK setup and configuration
 const firebaseConfig = {
  apiKey: "AIzaSyCvthCZO55TsBkXCwRGAhe5On3-uTHUTvs",
  authDomain: "chainsyncpro-8f18e.firebaseapp.com",
  projectId: "chainsyncpro-8f18e",
  storageBucket: "chainsyncpro-8f18e.firebasestorage.app",
  messagingSenderId: "980189721849",
  appId: "1:980189721849:web:74d84bd4a6acb1ee675e28",
 };

 // Initialize Firebase
 let app;
 let db;
 let auth;

 try {
    app = initializeApp(firebaseConfig);
    console.log("Firebase App Initialized");
    db = getFirestore(app);
    console.log("Firestore Initialized");
    auth = getAuth(app);
    console.log("Firebase Auth Initialized");
    // const analytics = getAnalytics(app); // Initialize Analytics if needed
 } catch (error) {
    console.error("Firebase initialization failed:", error);
    // Display a user-friendly error message on the page
    const body = document.querySelector('body');
    if (body) {
        body.innerHTML = '<div class="p-8 text-center text-red-600">Error initializing Firebase. Please check your configuration and the console.</div>';
    }
 }

 // Export the initialized services
 export { app, db, auth };
