import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, doc, updateDoc, deleteDoc, getDoc, setDoc, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

// 🔴 CONFIGURATION FIREBASE
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

    // --- THÈMES ---
    const themeSelector = document.getElementById('theme-selector');
    const savedTheme = localStorage.getItem('budgetTheme') || 'light';
    document.body.className = savedTheme === 'light' ? '' : `theme-${savedTheme}`;
    if (themeSelector) {
        themeSelector.value = savedTheme;
        themeSelector.addEventListener('change', (e) => {
            document.body.className = e.target.value === 'light' ? '' : `theme-${e.target.value}`;
            localStorage.setItem('budgetTheme', e.target.value);
        });
    }

    // --- FILTRES ---
    const filterMonth = document.getElementById('filter-month');
    const filterYear = document.getElementById('filter-year');
    if (filterMonth && filterYear) {
        const d = new Date();
        for (let i = d.getFullYear() - 1; i <= d.getFullYear() + 1; i++) {
            filterYear.appendChild(new Option(i, i));
        }
        filterYear.value = d.getFullYear();
        filterMonth.value = d.getMonth();
        filterMonth.addEventListener('change', updateUI);
        filterYear.addEventListener('change', updateUI);
    }
    document.getElementById('search-bar')?.addEventListener('input', (e) => {
        currentSearch = e.target.value.toLowerCase();
        updateUI();
    });

    // --- AUTHENTIFICATION ---
    const authToggle = document.getElementById('auth-toggle-mode');
    let isLoginMode = true;
    authToggle?.addEventListener('click', () => {
        isLoginMode = !isLoginMode;
        document.getElementById('auth-title').innerText = isLoginMode ? "Se connecter" : "Créer un compte";
        document.getElementById('auth-submit-btn').innerText = isLoginMode ? "Connexion" : "Inscription";
        authToggle.innerText = isLoginMode ? "Pas de compte ? S'inscrire ici." : "Déjà un compte ? Se connecter.";
    });

    document.getElementById('login-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('auth-email').value;
        const pwd = document.getElementById('auth-password').value;
        const errEl = document.getElementById('auth-error');
        try {
            if (isLoginMode) await signInWithEmailAndPassword(auth, email, pwd);
            else await createUserWithEmailAndPassword(auth, email, pwd);
            errEl.style.display = 'none';
        } catch (err) {
            errEl.style.display = 'block';
            errEl.innerText = "Erreur d'authentification (Mdp: 6 car. min)";
        }
    });

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            document.getElementById('screen-auth').style.display = 'none';
            const userDoc = await getDoc(doc(db, "users", user.uid));
            if (userDoc.exists() && userDoc.data().budgetId) {
                CURRENT_BUDGET_ID = userDoc.data().budgetId;
                loadBudgetData();
            } else {
                document.getElementById('screen-setup').style.display = 'flex';
                document.getElementById('screen-app').style.display = 'none';
            }
        } else {
            document.getElementById('screen-auth').style.display = 'flex';
            document.getElementById('screen-setup').style.display = 'none';
            document.getElementById('screen-app').style.display = 'none';
            CURRENT_BUDGET_ID = null;
            unsubscribers.forEach(un => un());
        }
    });

    // --- FOYER ---
    document.getElementById('btn-create-budget')?.addEventListener('click', async () => {
        const code = Math.random().toString(36).substring(2, 8).toUpperCase();
        const ref = await addDoc(collection(db, "budgets"), { code, owner: auth.currentUser.uid });
        await setDoc(doc(db, "users", auth.currentUser.uid), { budgetId: ref.id });
        window.location.reload();
    });

    document.getElementById('btn-join-budget')?.addEventListener('click', async () => {
        const code = document.getElementById('join-code').value.trim().toUpperCase();
        const q = query(collection(db, "budgets"), where("code", "==", code));
        const snap = await getDocs(q);
        if (!snap.empty) {
            await setDoc(doc(db, "users", auth.currentUser.uid), { budgetId: snap.docs[0].id });
            window.location.reload();
        } else document.getElementById('join-error').style.display = 'block';
    });

    function loadBudgetData() {
        document.getElementById('screen-setup').style.display = 'none';
        document.getElementById('screen-app').style.display = 'block';
        getDoc(doc(db, "budgets", CURRENT_BUDGET_ID)).then(d => {
            if(d.exists()) document.getElementById('display-invite-code').innerText = d.data().code;
        });
        unsubscribers.push(onSnapshot(collection(db, `budgets/${CURRENT_BUDGET_ID}/expenses`), s => {
            expenses = []; s.forEach(d => expenses.push({ id: d.id, ...d.data() })); updateUI();
        }));
        unsubscribers.push(onSnapshot(collection(db, `budgets/${CURRENT_BUDGET_ID}/categories`), s => {
            customCategories = []; s.forEach(d => customCategories.push({ id: d.id, ...d.data() })); renderCategories(); updateUI();
        }));
        unsubscribers.push(onSnapshot(collection(db, `budgets/${CURRENT_BUDGET_ID}/goals`), s => {
            goals = []; s.forEach(d => goals.push({ id: d.id, ...d.data() })); renderGoals();
        }));
    }

    // --- ACTIONS ---
    document.getElementById('logout-btn')?.addEventListener('click', () => signOut(auth));
    document.getElementById('btn-cancel-setup')?.addEventListener('click', () => signOut(auth));
    document.getElementById('login-btn')?.addEventListener('click', () => {
        isPanelOpen = !isPanelOpen;
        document.getElementById('admin-panel').style.display = isPanelOpen ? 'block' : 'none';
    });

    document.getElementById('toggle-annual-btn')?.addEventListener('click', (e) => {
        showAnnual = !showAnnual; e.target.classList.toggle('active');
        document.getElementById('annual-section').style.display = showAnnual ? 'block' : 'none';
        if(showAnnual) updateUI();
    });

    document.getElementById('toggle-envelopes-btn')?.addEventListener('click', (e) => {
        showEnvelopes = !showEnvelopes; e.target.classList.toggle('active');
        document.getElementById('envelopes-section').style.display = showEnvelopes ? 'grid' : 'none';
        if(showEnvelopes) updateUI();
    });

    document.getElementById('category-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        await addDoc(collection(db, `budgets/${CURRENT_BUDGET_ID}/categories`), {
            emoji: document.getElementById('new-cat-emoji').value,
            name: document.getElementById('new-cat-name').value,
            limit: parseFloat(document.getElementById('new-cat-limit').value) || null,
            isActive: true
        });
        e.target.reset();
    });

    document.getElementById('expense-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const type = document.querySelector('input[name="trans-type"]:checked').value;
        const amount = parseFloat(document.getElementById('amount').value);
        const cat = document.getElementById('category').value;
        if (type === 'expense' && cat.toLowerCase().includes("épargne")) {
            const gid = document.getElementById('goal-selector').value;
            const g = goals.find(x => x.id === gid);
            if(g) await updateDoc(doc(db, `budgets/${CURRENT_BUDGET_ID}/goals`, gid), { current: g.current + amount });
        }
        await addDoc(collection(db, `budgets/${CURRENT_BUDGET_ID}/expenses`), {
            date: new Date().toLocaleDateString('fr-FR'), timestamp: Date.now(),
            desc: document.getElementById('desc').value, amount, payer: document.getElementById('payer').value, category: cat, type
        });
        e.target.reset();
    });

    function updateUI() {
        const list = document.getElementById('expense-list'); if(!list) return;
        list.innerHTML = '';
        const m = parseInt(filterMonth.value), y = parseInt(filterYear.value);
        let rev = 0, dep = 0;
        const catSums = {};

        expenses.filter(e => {
            const dt = new Date(e.timestamp);
            return dt.getMonth() === m && dt.getFullYear() === y && (e.desc.toLowerCase().includes(currentSearch) || e.category.toLowerCase().includes(currentSearch));
        }).forEach(e => {
            const isInc = e.type === 'income';
            isInc ? rev += e.amount : dep += e.amount;
            if(!isInc) catSums[e.category] = (catSums[e.category] || 0) + e.amount;
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${e.date}</td><td>${e.desc}</td><td>${e.category}</td><td>${e.payer}</td><td style="color:${isInc ? '#2ECC71' : '#E74C3C'}"><strong>${isInc?'+':'-'}${e.amount}€</strong></td><td style="text-align:center"><button class="delete-exp" data-id="${e.id}">🗑️</button></td>`;
            list.appendChild(tr);
        });

        document.getElementById('total-revenus').innerText = rev.toFixed(2) + ' €';
        document.getElementById('total-depenses').innerText = dep.toFixed(2) + ' €';
        const solde = rev - dep;
        const sEl = document.getElementById('solde-actuel');
        sEl.innerText = solde.toFixed(2) + ' €';
        sEl.className = 'balance ' + (solde >= 0 ? 'positive' : '');

        // Graphique Camembert
        const ctx = document.getElementById('expenseChart')?.getContext('2d');
        if (ctx) {
            if (myChart) myChart.destroy();
            myChart = new Chart(ctx, { type: 'doughnut', data: { labels: Object.keys(catSums), datasets: [{ data: Object.values(catSums), backgroundColor: ['#4A90E2', '#FF6B6B', '#50E3C2', '#FDCB6E'] }] }, options: { plugins: { legend: { display: false } } } });
        }
    }

    function renderCategories() {
        const sel = document.getElementById('category'); if(!sel) return;
        sel.innerHTML = '<option value="">-- Catégorie --</option>';
        customCategories.forEach(c => sel.appendChild(new Option(`${c.emoji} ${c.name}`, `${c.emoji} ${c.name}`)));
        const list = document.getElementById('category-manage-list'); if(!list) return;
        list.innerHTML = '';
        customCategories.forEach(c => {
            const li = document.createElement('li');
            li.innerHTML = `<span>${c.emoji} ${c.name}</span> <button class="delete-cat" data-id="${c.id}">🗑️</button>`;
            list.appendChild(li);
        });
    }

    function renderGoals() {
        const cont = document.getElementById('goals-container'); if(!cont) return;
        cont.innerHTML = '';
        goals.forEach(g => {
            const p = Math.min((g.current / g.target) * 100, 100);
            const card = document.createElement('div'); card.className = 'card';
            card.innerHTML = `<h3>🎯 ${g.name}</h3><p>${g.current}€ / ${g.target}€</p><div class="progress-bar"><div class="progress-fill green" style="width:${p}%"></div></div>`;
            cont.appendChild(card);
        });
    }

    document.addEventListener('click', async (e) => {
        if (e.target.classList.contains('delete-exp')) await deleteDoc(doc(db, `budgets/${CURRENT_BUDGET_ID}/expenses`, e.target.dataset.id));
        if (e.target.classList.contains('delete-cat')) await deleteDoc(doc(db, `budgets/${CURRENT_BUDGET_ID}/categories`, e.target.dataset.id));
    });
});