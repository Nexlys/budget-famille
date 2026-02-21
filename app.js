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
    // Éléments UI
    const sidebar = document.getElementById('sidebar');
    const mainContent = document.querySelector('.main-content');
    const toggleBtn = document.getElementById('toggle-sidebar');
    const screenAuth = document.getElementById('screen-auth');
    const screenSetup = document.getElementById('screen-setup');
    const screenApp = document.getElementById('screen-app');

    let CURRENT_BUDGET_ID = null;
    let unsubscribers = [];
    let goals = [], expenses = [], customCategories = [];
    let myChart = null, myAnnualChart = null;
    let currentSearch = "";
    let showAnnual = false, showEnvelopes = false;

    // --- GESTION SIDEBAR TOGGLE ---
    toggleBtn?.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
        mainContent.classList.toggle('expanded');
    });

    // --- FONCTIONS UI ---
    function updateUI() {
        const list = document.getElementById('expense-list'); if(!list) return;
        list.innerHTML = "";
        const m = parseInt(document.getElementById('filter-month').value);
        const y = parseInt(document.getElementById('filter-year').value);
        let rev = 0, dep = 0, catSums = {};

        expenses.filter(e => {
            const dt = new Date(e.timestamp);
            return dt.getMonth() === m && dt.getFullYear() === y && (e.desc.toLowerCase().includes(currentSearch) || e.category.toLowerCase().includes(currentSearch));
        }).forEach(e => {
            const isInc = e.type === 'income';
            isInc ? rev += e.amount : dep += e.amount;
            if(!isInc) catSums[e.category] = (catSums[e.category] || 0) + e.amount;
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${e.date}</td><td>${e.desc}</td><td>${e.category}</td><td style="color:${isInc?'#2ecc71':'#e74c3c'}"><strong>${isInc?'+':'-'}${e.amount}€</strong></td><td><button class="delete-exp" data-id="${e.id}" style="width:auto; padding:5px; background:none; border:none; cursor:pointer;">🗑️</button></td>`;
            list.appendChild(tr);
        });

        document.getElementById('total-revenus').innerText = rev.toFixed(2) + ' €';
        document.getElementById('total-depenses').innerText = dep.toFixed(2) + ' €';
        const solde = rev - dep;
        const sEl = document.getElementById('solde-actuel');
        sEl.innerText = solde.toFixed(2) + ' €';
        sEl.style.color = solde >= 0 ? '#2ecc71' : '#e74c3c';

        // Chart
        const ctx = document.getElementById('expenseChart')?.getContext('2d');
        if (ctx) {
            if (myChart) myChart.destroy();
            myChart = new Chart(ctx, { type: 'doughnut', data: { labels: Object.keys(catSums), datasets: [{ data: Object.values(catSums), backgroundColor: ['#4A90E2', '#FF6B6B', '#50E3C2', '#FDCB6E'], borderWidth: 0 }] }, options: { plugins: { legend: { display: false } }, cutout: '70%' } });
        }
        if(showEnvelopes) renderEnvelopes(catSums);
        if(showAnnual) renderAnnualChart();
    }

    function renderCategories() {
        const sel = document.getElementById('category'); const list = document.getElementById('category-manage-list');
        if(!sel || !list) return;
        sel.innerHTML = '<option value="">-- Choisir --</option>';
        customCategories.forEach(c => sel.appendChild(new Option(`${c.emoji} ${c.name}`, `${c.emoji} ${c.name}`)));
        list.innerHTML = "";
        customCategories.forEach(c => {
            const li = document.createElement('li');
            li.style.display = 'flex'; li.style.justifyContent = 'space-between'; li.style.marginBottom = '5px';
            li.innerHTML = `<span>${c.emoji} ${c.name}</span> <button class="delete-cat" data-id="${c.id}" style="width:auto; padding:2px 8px; background:#e74c3c;">✕</button>`;
            list.appendChild(li);
        });
    }

    function renderGoals() {
        const cont = document.getElementById('goals-container'); const sel = document.getElementById('goal-selector');
        if(!cont || !sel) return;
        cont.innerHTML = ""; sel.innerHTML = '<option value="">-- Objectif --</option>';
        goals.forEach(g => {
            const p = Math.min((g.current / g.target) * 100, 100);
            const card = document.createElement('div'); card.className = 'card';
            card.innerHTML = `<h3>🎯 ${g.name}</h3><p>${g.current}€ / ${g.target}€</p><div class="progress-bar"><div class="progress-fill green" style="width:${p}%"></div></div>`;
            cont.appendChild(card);
            sel.appendChild(new Option(g.name, g.id));
        });
    }

    function renderEnvelopes(catSums) {
        const envContainer = document.getElementById('envelopes-section'); if(!envContainer) return;
        envContainer.innerHTML = '';
        customCategories.filter(c => c.limit).forEach(cat => {
            const spent = catSums[`${cat.emoji} ${cat.name}`] || 0;
            const p = Math.min((spent / cat.limit) * 100, 100);
            const card = document.createElement('div'); card.className = 'card';
            card.innerHTML = `<h3>${cat.emoji} ${cat.name}</h3><p>${spent.toFixed(2)}€ / ${cat.limit}€</p><div class="progress-bar"><div class="progress-fill ${p > 90 ? 'red' : (p > 70 ? 'orange' : 'green')}" style="width:${p}%"></div></div>`;
            envContainer.appendChild(card);
        });
    }

    function loadBudgetData() {
        screenSetup.style.display = 'none'; screenApp.style.display = 'block';
        getDoc(doc(db, "budgets", CURRENT_BUDGET_ID)).then(d => {
            if(d.exists()) document.getElementById('display-invite-code').innerText = d.data().code;
        });
        unsubscribers.push(onSnapshot(collection(db, `budgets/${CURRENT_BUDGET_ID}/expenses`), s => {
            expenses = []; s.forEach(doc => expenses.push({ id: doc.id, ...doc.data() })); updateUI();
        }));
        unsubscribers.push(onSnapshot(collection(db, `budgets/${CURRENT_BUDGET_ID}/categories`), s => {
            customCategories = []; s.forEach(doc => customCategories.push({ id: doc.id, ...doc.data() })); renderCategories(); updateUI();
        }));
        unsubscribers.push(onSnapshot(collection(db, `budgets/${CURRENT_BUDGET_ID}/goals`), s => {
            goals = []; s.forEach(doc => goals.push({ id: doc.id, ...doc.data() })); renderGoals();
        }));
    }

    // --- AUTHENTIFICATION ---
    document.getElementById('login-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('auth-email').value;
        const pwd = document.getElementById('auth-password').value;
        const isLoginMode = document.getElementById('auth-title').innerText === "Connexion";
        try {
            if(isLoginMode) await signInWithEmailAndPassword(auth, email, pwd);
            else await createUserWithEmailAndPassword(auth, email, pwd);
        } catch(err) {
            const errEl = document.getElementById('auth-error');
            errEl.style.display = 'block'; errEl.innerText = "Erreur: Identifiants invalides ou mdp trop court.";
        }
    });

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            screenAuth.style.display = 'none';
            const userDoc = await getDoc(doc(db, "users", user.uid));
            if (userDoc.exists() && userDoc.data().budgetId) {
                CURRENT_BUDGET_ID = userDoc.data().budgetId;
                loadBudgetData();
            } else {
                screenSetup.style.display = 'flex';
                screenApp.style.display = 'none';
            }
        } else {
            screenAuth.style.display = 'flex'; screenApp.style.display = 'none'; screenSetup.style.display = 'none';
            CURRENT_BUDGET_ID = null; unsubscribers.forEach(u => u());
        }
    });

    // --- INITIALISATION FILTRES ---
    const d = new Date();
    const fM = document.getElementById('filter-month');
    const fY = document.getElementById('filter-year');
    if(fM && fY) {
        ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'].forEach((m, i) => fM.appendChild(new Option(m, i)));
        for(let i = d.getFullYear()-1; i <= d.getFullYear()+1; i++) fY.appendChild(new Option(i, i));
        fM.value = d.getMonth(); fY.value = d.getFullYear();
        fM.addEventListener('change', updateUI); fY.addEventListener('change', updateUI);
    }

    // --- AUTRES EVENTS ---
    document.getElementById('auth-toggle-mode')?.addEventListener('click', () => {
        const t = document.getElementById('auth-title'); const b = document.getElementById('auth-submit-btn'); const l = document.getElementById('auth-toggle-mode');
        t.innerText = t.innerText === "Connexion" ? "Inscription" : "Connexion";
        b.innerText = t.innerText === "Connexion" ? "C'est parti !" : "S'inscrire";
        l.innerText = t.innerText === "Connexion" ? "Pas de compte ? S'inscrire" : "Déjà un compte ? Connexion";
    });

    document.getElementById('theme-selector')?.addEventListener('change', (e) => {
        document.body.className = e.target.value === 'light' ? '' : `theme-${e.target.value}`;
        localStorage.setItem('budgetTheme', e.target.value);
    });

    document.getElementById('nav-envelopes')?.addEventListener('click', () => {
        showEnvelopes = !showEnvelopes;
        document.getElementById('envelopes-section').style.display = showEnvelopes ? 'grid' : 'none';
        updateUI();
    });

    document.getElementById('nav-admin')?.addEventListener('click', () => {
        const p = document.getElementById('admin-panel');
        p.style.display = p.style.display === 'none' ? 'block' : 'none';
    });

    document.getElementById('btn-create-budget')?.addEventListener('click', async () => {
        const code = Math.random().toString(36).substring(2, 8).toUpperCase();
        const ref = await addDoc(collection(db, "budgets"), { code, owner: auth.currentUser.uid });
        await setDoc(doc(db, "users", auth.currentUser.uid), { budgetId: ref.id });
        window.location.reload();
    });

    document.getElementById('btn-join-budget')?.addEventListener('click', async () => {
        const c = document.getElementById('join-code').value.trim().toUpperCase();
        const q = query(collection(db, "budgets"), where("code", "==", c));
        const snap = await getDocs(q);
        if (!snap.empty) {
            await setDoc(doc(db, "users", auth.currentUser.uid), { budgetId: snap.docs[0].id });
            window.location.reload();
        } else { document.getElementById('join-error').style.display = 'block'; }
    });

    document.getElementById('logout-btn')?.addEventListener('click', () => signOut(auth));

    document.getElementById('expense-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const type = document.querySelector('input[name="trans-type"]:checked').value;
        const amount = parseFloat(document.getElementById('amount').value);
        const cat = document.getElementById('category').value;
        await addDoc(collection(db, `budgets/${CURRENT_BUDGET_ID}/expenses`), {
            date: new Date().toLocaleDateString('fr-FR'), timestamp: Date.now(),
            desc: document.getElementById('desc').value, amount, payer: document.getElementById('payer').value, category: cat, type
        });
        e.target.reset();
    });

    document.getElementById('category-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        await addDoc(collection(db, `budgets/${CURRENT_BUDGET_ID}/categories`), { 
            emoji: document.getElementById('new-cat-emoji').value, name: document.getElementById('new-cat-name').value, limit: parseFloat(document.getElementById('new-cat-limit').value) || null 
        });
        e.target.reset();
    });

    document.addEventListener('click', async (e) => {
        if(e.target.classList.contains('delete-exp')) { if(confirm("Supprimer ?")) await deleteDoc(doc(db, `budgets/${CURRENT_BUDGET_ID}/expenses`, e.target.dataset.id)); }
        if(e.target.classList.contains('delete-cat')) { await deleteDoc(doc(db, `budgets/${CURRENT_BUDGET_ID}/categories`, e.target.dataset.id)); }
    });
});