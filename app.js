import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, doc, updateDoc, deleteDoc, getDoc, setDoc, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

// 🔴 CONFIGURATION FIREBASE ICI
const firebaseConfig = {
  apiKey: "AIzaSyBRx9Cq4O2FfJu-2rQFYsoY4xzBcEV29pw",
  authDomain: "projet-duo.firebaseapp.com",
  projectId: "projet-duo",
  storageBucket: "projet-duo.firebasestorage.app",
  messagingSenderId: "963400986667",
  appId: "1:963400986667:web:458602ba323ee1adf33a6e",
  measurementId: "G-DJMM6FLJZN"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

document.addEventListener('DOMContentLoaded', () => {
    let CURRENT_BUDGET_ID = null;
    let unsubscribers = [];
    let goals = [], expenses = [], customCategories = [];
    let isPanelOpen = false, myChart = null, myAnnualChart = null;
    let currentSort = { column: 'date', asc: false }, currentSearch = "";
    let showAnnual = false, showEnvelopes = false;

    // --- THEME ---
    const themeSelector = document.getElementById('theme-selector');
    const savedTheme = localStorage.getItem('budgetTheme') || 'light';
    document.body.className = savedTheme === 'light' ? '' : `theme-${savedTheme}`;
    themeSelector.value = savedTheme;
    themeSelector.addEventListener('change', (e) => {
        document.body.className = e.target.value === 'light' ? '' : `theme-${e.target.value}`;
        localStorage.setItem('budgetTheme', e.target.value);
    });

    // --- NAVIGATION SIDEBAR ---
    document.getElementById('nav-envelopes').addEventListener('click', () => {
        showEnvelopes = !showEnvelopes;
        document.getElementById('envelopes-section').style.display = showEnvelopes ? 'grid' : 'none';
        updateUI();
    });
    document.getElementById('nav-annual').addEventListener('click', () => {
        showAnnual = !showAnnual;
        document.getElementById('annual-section').style.display = showAnnual ? 'block' : 'none';
        updateUI();
    });

    // --- AUTH ---
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            document.getElementById('screen-auth').style.display = 'none';
            const userDoc = await getDoc(doc(db, "users", user.uid));
            if (userDoc.exists() && userDoc.data().budgetId) {
                CURRENT_BUDGET_ID = userDoc.data().budgetId;
                document.getElementById('sidebar').style.display = 'flex';
                loadBudgetData();
            } else {
                document.getElementById('screen-setup').style.display = 'flex';
            }
        } else {
            document.getElementById('screen-auth').style.display = 'flex';
            document.getElementById('sidebar').style.display = 'none';
            document.getElementById('screen-app').style.display = 'none';
        }
    });

    // --- LE RESTE DES FONCTIONS (REPRENDRE LE CODE PRECEDENT) ---
    // (Inclure loadBudgetData, updateUI, renderCategories, renderGoals, etc.)
    // Note: Assurez-vous de bien lier les IDs du nouveau HTML !
    
    // ... [Copiez ici la logique de votre app.js précédent] ...
    
});