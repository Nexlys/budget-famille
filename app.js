import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, doc, updateDoc, deleteDoc, getDoc, setDoc, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

// 🔴 🔴 🔴 REMPLACEZ PAR VOTRE CONFIGURATION FIREBASE 🔴 🔴 🔴
const firebaseConfig = {
    apiKey: "VOTRE_API_KEY",
    authDomain: "VOTRE_PROJET.firebaseapp.com",
    projectId: "VOTRE_PROJET",
    storageBucket: "VOTRE_PROJET.appspot.com",
    messagingSenderId: "VOTRE_ID",
    appId: "VOTRE_APP_ID"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// On attend que le HTML soit chargé pour éviter l'erreur "null"
document.addEventListener('DOMContentLoaded', () => {

    // --- VARIABLES MULTI-LOCATAIRES ---
    let CURRENT_BUDGET_ID = null; 
    let unsubscribers = []; 

    // Variables UI
    let goals = []; let expenses = []; let customCategories = [];
    let isPanelOpen = false; let myChart = null; let myAnnualChart = null;
    let currentSort = { column: 'date', asc: false };
    let currentSearch = ""; let showAnnual = false; let showEnvelopes = false;

    // --- GESTION DU THÈME ---
    const themeSelector = document.getElementById('theme-selector');
    const savedTheme = localStorage.getItem('budgetTheme') || 'light';
    document.body.className = savedTheme === 'light' ? '' : `theme-${savedTheme}`;
    if(themeSelector) themeSelector.value = savedTheme;

    themeSelector?.addEventListener('change', (e) => {
        document.body.className = e.target.value === 'light' ? '' : `theme-${e.target.value}`;
        localStorage.setItem('budgetTheme', e.target.value);
    });

    const filterMonth = document.getElementById('filter-month');
    const filterYear = document.getElementById('filter-year');
    const d = new Date();
    if(filterYear) {
        for(let i = d.getFullYear() - 1; i <= d.getFullYear() + 1; i++) { filterYear.appendChild(new Option(i, i)); }
        filterYear.value = d.getFullYear();
    }
    if(filterMonth) filterMonth.value = d.getMonth();

    filterMonth?.addEventListener('change', updateUI);
    filterYear?.addEventListener('change', updateUI);
    document.getElementById('search-bar')?.addEventListener('input', (e) => { currentSearch = e.target.value.toLowerCase(); updateUI(); });

    // --- GESTION DE L'AUTHENTIFICATION ---
    const screenAuth = document.getElementById('screen-auth');
    const screenSetup = document.getElementById('screen-setup');
    const screenApp = document.getElementById('screen-app');
    const authTitle = document.getElementById('auth-title');
    const authSubmitBtn = document.getElementById('auth-submit-btn');
    const authToggleMode = document.getElementById('auth-toggle-mode'); // ID Corrigé ici

    let isLoginMode = true;

    authToggleMode?.addEventListener('click', () => {
        isLoginMode = !isLoginMode;
        authTitle.innerText = isLoginMode ? "Se connecter" : "Créer un compte";
        authSubmitBtn.innerText = isLoginMode ? "Connexion" : "Inscription";
        authToggleMode.innerText = isLoginMode ? "Pas de compte ? S'inscrire ici." : "Déjà un compte ? Se connecter.";
    });

    document.getElementById('login-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('auth-email').value;
        const pwd = document.getElementById('auth-password').value;
        try {
            if(isLoginMode) await signInWithEmailAndPassword(auth, email, pwd);
            else await createUserWithEmailAndPassword(auth, email, pwd);
        } catch(err) {
            const errEl = document.getElementById('auth-error');
            errEl.style.display = 'block';
            errEl.innerText = "Erreur : Vérifiez l'email et le mot de passe (6 car. min)";
        }
    });

    // --- ROUTEUR D'ÉTAT ---
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            if(screenAuth) screenAuth.style.display = 'none';
            const userDoc = await getDoc(doc(db, "users", user.uid));
            if (userDoc.exists() && userDoc.data().budgetId) {
                CURRENT_BUDGET_ID = userDoc.data().budgetId;
                loadBudgetData();
            } else {
                if(screenSetup) screenSetup.style.display = 'flex';
                if(screenApp) screenApp.style.display = 'none';
            }
        } else {
            if(screenAuth) screenAuth.style.display = 'flex';
            if(screenSetup) screenSetup.style.display = 'none';
            if(screenApp) screenApp.style.display = 'none';
            CURRENT_BUDGET_ID = null;
            unsubscribers.forEach(unsub => unsub());
            unsubscribers = [];
        }
    });

    // --- CRÉATION / JONCTION DE FOYER ---
    document.getElementById('btn-create-budget')?.addEventListener('click', async () => {
        const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        const newBudgetRef = await addDoc(collection(db, "budgets"), { code: inviteCode, owner: auth.currentUser.uid });
        await setDoc(doc(db, "users", auth.currentUser.uid), { budgetId: newBudgetRef.id });
        window.location.reload();
    });

    document.getElementById('btn-join-budget')?.addEventListener('click', async () => {
        const code = document.getElementById('join-code').value.trim().toUpperCase();
        const q = query(collection(db, "budgets"), where("code", "==", code));
        const snap = await getDocs(q);
        if (!snap.empty) {
            await setDoc(doc(db, "users", auth.currentUser.uid), { budgetId: snap.docs[0].id });
            window.location.reload();
        } else {
            document.getElementById('join-error').style.display = 'block';
        }
    });

    // --- CHARGEMENT DES DONNÉES ---
    function loadBudgetData() {
        if(screenSetup) screenSetup.style.display = 'none';
        if(screenApp) screenApp.style.display = 'block';

        getDoc(doc(db, "budgets", CURRENT_BUDGET_ID)).then(bDoc => {
            if(bDoc.exists()) document.getElementById('display-invite-code').innerText = bDoc.data().code;
        });

        const subExp = onSnapshot(collection(db, `budgets/${CURRENT_BUDGET_ID}/expenses`), (snapshot) => {
            expenses = []; snapshot.forEach(d => expenses.push({ id: d.id, ...d.data() }));
            updateUI();
        });

        const subCat = onSnapshot(collection(db, `budgets/${CURRENT_BUDGET_ID}/categories`), (snapshot) => {
            customCategories = []; snapshot.forEach(d => customCategories.push({ id: d.id, ...d.data() }));
            renderCategories(); updateUI();
        });

        const subGoal = onSnapshot(collection(db, `budgets/${CURRENT_BUDGET_ID}/goals`), (snapshot) => {
            goals = []; snapshot.forEach(d => goals.push({ id: d.id, ...d.data() }));
            renderGoals();
        });

        unsubscribers.push(subExp, subCat, subGoal);
    }

    // --- UI ET ACTIONS ---
    document.getElementById('logout-btn')?.addEventListener('click', () => signOut(auth));
    document.getElementById('btn-cancel-setup')?.addEventListener('click', () => signOut(auth));
    document.getElementById('login-btn')?.addEventListener('click', () => {
        isPanelOpen = !isPanelOpen;
        document.getElementById('admin-panel').style.display = isPanelOpen ? 'block' : 'none';
    });

    // (Reste des fonctions UI comme addDoc, deleteDoc, updateUI, etc. intégrées ci-dessous)

    document.getElementById('category-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        await addDoc(collection(db, `budgets/${CURRENT_BUDGET_ID}/categories`), { 
            emoji: document.getElementById('new-cat-emoji').value, 
            name: document.getElementById('new-cat-name').value, 
            limit: document.getElementById('new-cat-limit').value ? parseFloat(document.getElementById('new-cat-limit').value) : null,
            isActive: true 
        });
        e.target.reset();
    });

    document.getElementById('goal-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        await addDoc(collection(db, `budgets/${CURRENT_BUDGET_ID}/goals`), {
            name: document.getElementById('goal-name').value,
            current: parseFloat(document.getElementById('goal-current').value),
            target: parseFloat(document.getElementById('goal-target').value)
        });
        e.target.reset();
    });

    document.getElementById('expense-form')?.addEventListener('submit', async function(e) {
        e.preventDefault();
        const type = document.querySelector('input[name="trans-type"]:checked').value;
        const amount = parseFloat(document.getElementById('amount').value);
        const category = document.getElementById('category').value;
        
        if (type === 'expense' && (category.toLowerCase().includes("épargne") || category.toLowerCase().includes("objectif"))) {
            const goalId = document.getElementById('goal-selector').value;
            const g = goals.find(x => x.id === goalId);
            if(g) await updateDoc(doc(db, `budgets/${CURRENT_BUDGET_ID}/goals`, goalId), { current: g.current + amount });
        }

        await addDoc(collection(db, `budgets/${CURRENT_BUDGET_ID}/expenses`), {
            date: new Date().toLocaleDateString('fr-FR'),
            timestamp: Date.now(),
            desc: document.getElementById('desc').value,
            amount: amount,
            payer: document.getElementById('payer').value,
            category: category,
            type: type
        });
        e.target.reset();
    });

    function renderCategories() {
        const sel = document.getElementById('category');
        const list = document.getElementById('category-manage-list');
        if(!sel || !list) return;
        sel.innerHTML = '<option value="">-- Catégorie --</option>';
        customCategories.filter(c => c.isActive !== false).forEach(c => sel.appendChild(new Option(`${c.emoji} ${c.name}`, `${c.emoji} ${c.name}`)));
        list.innerHTML = '';
        customCategories.forEach(c => {
            const li = document.createElement('li');
            li.innerHTML = `<span>${c.emoji} ${c.name}</span> <button class="danger-btn delete-cat" data-id="${c.id}" style="width:auto; padding:5px;">🗑️</button>`;
            list.appendChild(li);
        });
    }

    function renderGoals() {
        const cont = document.getElementById('goals-container');
        const sel = document.getElementById('goal-selector');
        if(!cont || !sel) return;
        cont.innerHTML = ''; sel.innerHTML = '<option value="">-- Objectif --</option>';
        goals.forEach(g => {
            const p = Math.min((g.current / g.target) * 100, 100);
            const card = document.createElement('div'); card.className = 'card';
            card.innerHTML = `<h3>🎯 ${g.name}</h3><p>${g.current}€ / ${g.target}€</p><div class="progress-bar"><div class="progress-fill green" style="width:${p}%"></div></div>`;
            cont.appendChild(card);
            sel.appendChild(new Option(g.name, g.id));
        });
    }

    function updateUI() {
        const list = document.getElementById('expense-list');
        if(!list) return;
        list.innerHTML = '';
        const m = parseInt(filterMonth.value);
        const y = parseInt(filterYear.value);

        let filtered = expenses.filter(e => {
            const d = new Date(e.timestamp);
            return d.getMonth() === m && d.getFullYear() === y && (e.desc.toLowerCase().includes(currentSearch) || e.category.toLowerCase().includes(currentSearch));
        });

        let rev = 0, dep = 0;
        filtered.forEach(e => {
            const isInc = e.type === 'income';
            isInc ? rev += e.amount : dep += e.amount;
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${e.date}</td><td>${e.desc}</td><td>${e.category}</td><td>${e.payer}</td><td style="color:${isInc ? '#2ECC71' : '#E74C3C'}">${isInc ? '+' : '-'}${e.amount}€</td><td><button class="delete-exp" data-id="${e.id}">🗑️</button></td>`;
            list.appendChild(tr);
        });

        document.getElementById('total-revenus').innerText = rev.toFixed(2) + ' €';
        document.getElementById('total-depenses').innerText = dep.toFixed(2) + ' €';
        const solde = rev - dep;
        const soldeEl = document.getElementById('solde-actuel');
        soldeEl.innerText = solde.toFixed(2) + ' €';
        soldeEl.className = 'balance ' + (solde >= 0 ? 'positive' : '');
    }

    // Nettoyage des écouteurs de suppression
    document.addEventListener('click', async (e) => {
        if(e.target.classList.contains('delete-exp')) {
            if(confirm("Supprimer ?")) await deleteDoc(doc(db, `budgets/${CURRENT_BUDGET_ID}/expenses`, e.target.dataset.id));
        }
        if(e.target.classList.contains('delete-cat')) {
            await deleteDoc(doc(db, `budgets/${CURRENT_BUDGET_ID}/categories`, e.target.dataset.id));
        }
    });
});