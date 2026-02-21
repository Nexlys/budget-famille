import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, doc, updateDoc, deleteDoc, getDoc, setDoc, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

// 🔴 CONFIGURATION FIREBASE
const firebaseConfig = {
    apiKey: "VOTRE_CLE",
    authDomain: "VOTRE_PROJET.firebaseapp.com",
    projectId: "VOTRE_PROJET",
    storageBucket: "VOTRE_PROJET.appspot.com",
    messagingSenderId: "VOTRE_ID",
    appId: "VOTRE_APP_ID"
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

    // --- ELEMENTS UI ---
    const screenAuth = document.getElementById('screen-auth');
    const screenSetup = document.getElementById('screen-setup');
    const screenApp = document.getElementById('screen-app');
    const sidebar = document.getElementById('sidebar');

    // --- GESTION DU THÈME ---
    const themeSelector = document.getElementById('theme-selector');
    const savedTheme = localStorage.getItem('budgetTheme') || 'light';
    document.body.className = savedTheme === 'light' ? '' : `theme-${savedTheme}`;
    if(themeSelector) {
        themeSelector.value = savedTheme;
        themeSelector.addEventListener('change', (e) => {
            document.body.className = e.target.value === 'light' ? '' : `theme-${e.target.value}`;
            localStorage.setItem('budgetTheme', e.target.value);
        });
    }

    // --- NAVIGATION ---
    document.getElementById('nav-envelopes')?.addEventListener('click', () => {
        showEnvelopes = !showEnvelopes;
        document.getElementById('envelopes-section').style.display = showEnvelopes ? 'grid' : 'none';
        updateUI();
    });
    document.getElementById('nav-annual')?.addEventListener('click', () => {
        showAnnual = !showAnnual;
        document.getElementById('annual-section').style.display = showAnnual ? 'block' : 'none';
        updateUI();
    });

    // --- FILTRES ---
    const filterMonth = document.getElementById('filter-month');
    const filterYear = document.getElementById('filter-year');
    if(filterMonth && filterYear) {
        const d = new Date();
        for(let i = d.getFullYear() - 1; i <= d.getFullYear() + 1; i++) { filterYear.appendChild(new Option(i, i)); }
        filterYear.value = d.getFullYear();
        filterMonth.innerHTML = "";
        ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'].forEach((m, i) => {
            filterMonth.appendChild(new Option(m, i));
        });
        filterMonth.value = d.getMonth();
        filterMonth.addEventListener('change', updateUI);
        filterYear.addEventListener('change', updateUI);
    }
    document.getElementById('search-bar')?.addEventListener('input', (e) => { currentSearch = e.target.value.toLowerCase(); updateUI(); });

    // --- AUTHENTIFICATION ---
    const authToggle = document.getElementById('auth-toggle-mode');
    let isLoginMode = true;
    authToggle?.addEventListener('click', () => {
        isLoginMode = !isLoginMode;
        document.getElementById('auth-title').innerText = isLoginMode ? "Connexion" : "Inscription";
        document.getElementById('auth-submit-btn').innerText = isLoginMode ? "C'est parti !" : "Créer mon compte";
        authToggle.innerText = isLoginMode ? "Pas de compte ? S'inscrire" : "Déjà un compte ? Se connecter";
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
            errEl.innerText = "Erreur : " + err.message;
        }
    });

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            screenAuth.style.display = 'none';
            const userDoc = await getDoc(doc(db, "users", user.uid));
            if (userDoc.exists() && userDoc.data().budgetId) {
                CURRENT_BUDGET_ID = userDoc.data().budgetId;
                sidebar.style.display = 'flex';
                loadBudgetData();
            } else {
                screenSetup.style.display = 'flex';
                screenApp.style.display = 'none';
            }
        } else {
            screenAuth.style.display = 'flex';
            sidebar.style.display = 'none';
            screenApp.style.display = 'none';
            screenSetup.style.display = 'none';
            CURRENT_BUDGET_ID = null;
            unsubscribers.forEach(u => u());
            unsubscribers = [];
        }
    });

    // --- GESTION DU FOYER ---
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
        } else { alert("Code introuvable"); }
    });

    function loadBudgetData() {
        screenSetup.style.display = 'none';
        screenApp.style.display = 'block';

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

    // --- ACTIONS UI ---
    document.getElementById('logout-btn')?.addEventListener('click', () => signOut(auth));
    document.getElementById('login-btn')?.addEventListener('click', () => {
        isPanelOpen = !isPanelOpen;
        document.getElementById('admin-panel').style.display = isPanelOpen ? 'block' : 'none';
    });

    document.getElementById('expense-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const type = document.querySelector('input[name="trans-type"]:checked').value;
        const amount = parseFloat(document.getElementById('amount').value);
        const cat = document.getElementById('category').value;
        if (type === 'expense' && cat.toLowerCase().includes("épargne")) {
            const gid = document.getElementById('goal-selector').value;
            const targetGoal = goals.find(g => g.id === gid);
            if(targetGoal) await updateDoc(doc(db, `budgets/${CURRENT_BUDGET_ID}/goals`, gid), { current: targetGoal.current + amount });
        }
        await addDoc(collection(db, `budgets/${CURRENT_BUDGET_ID}/expenses`), {
            date: new Date().toLocaleDateString('fr-FR'), timestamp: Date.now(),
            desc: document.getElementById('desc').value, amount, payer: document.getElementById('payer').value, category: cat, type
        });
        e.target.reset();
    });

    function renderCategories() {
        const sel = document.getElementById('category'); if(!sel) return;
        sel.innerHTML = '<option value="">-- Choisir --</option>';
        customCategories.filter(c => c.isActive !== false).forEach(c => sel.appendChild(new Option(`${c.emoji} ${c.name}`, `${c.emoji} ${c.name}`)));
        const list = document.getElementById('category-manage-list'); if(!list) return;
        list.innerHTML = "";
        customCategories.forEach(c => {
            const li = document.createElement('li');
            li.innerHTML = `<span>${c.emoji} ${c.name}</span> <button class="delete-cat" data-id="${c.id}" style="width:auto; padding:5px;">🗑️</button>`;
            list.appendChild(li);
        });
    }

    function renderGoals() {
        const cont = document.getElementById('goals-container'); if(!cont) return;
        cont.innerHTML = "";
        const sel = document.getElementById('goal-selector'); if(sel) sel.innerHTML = '<option value="">-- Objectif --</option>';
        goals.forEach(g => {
            const p = Math.min((g.current / g.target) * 100, 100);
            const card = document.createElement('div'); card.className = 'card';
            card.innerHTML = `<h3>🎯 ${g.name}</h3><p>${g.current}€ / ${g.target}€</p><div class="progress-bar"><div class="progress-fill green" style="width:${p}%"></div></div>`;
            cont.appendChild(card);
            if(sel) sel.appendChild(new Option(g.name, g.id));
        });
    }

    function updateUI() {
        const list = document.getElementById('expense-list'); if(!list) return;
        list.innerHTML = "";
        const m = parseInt(filterMonth.value), y = parseInt(filterYear.value);
        let rev = 0, dep = 0, revM = 0, revC = 0, depM = 0, depC = 0;
        const catSums = {};

        expenses.filter(e => {
            const dt = new Date(e.timestamp);
            return dt.getMonth() === m && dt.getFullYear() === y && (e.desc.toLowerCase().includes(currentSearch) || e.category.toLowerCase().includes(currentSearch));
        }).forEach(e => {
            const isInc = e.type === 'income';
            if(isInc) { rev += e.amount; e.payer === "Moi" ? revM += e.amount : revC += e.amount; }
            else { dep += e.amount; e.payer === "Moi" ? depM += e.amount : depC += e.amount; catSums[e.category] = (catSums[e.category] || 0) + e.amount; }
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${e.date}</td><td>${e.desc}</td><td>${e.category}</td><td style="color:${isInc?'#2ecc71':'#e74c3c'}"><strong>${isInc?'+':'-'}${e.amount}€</strong></td><td><button class="delete-exp" data-id="${e.id}">🗑️</button></td>`;
            list.appendChild(tr);
        });

        document.getElementById('total-revenus').innerText = rev.toFixed(2) + ' €';
        document.getElementById('total-depenses').innerText = dep.toFixed(2) + ' €';
        const solde = rev - dep;
        const sEl = document.getElementById('solde-actuel');
        sEl.innerText = solde.toFixed(2) + ' €';
        sEl.className = 'balance ' + (solde >= 0 ? 'positive' : '');

        // Taux d'effort
        const pM = revM > 0 ? Math.min((depM / revM) * 100, 100) : 0;
        const pC = revC > 0 ? Math.min((depC / revC) * 100, 100) : 0;
        document.getElementById('pct-moi-text').innerText = pM.toFixed(1);
        document.getElementById('pct-moi-bar').style.width = pM + '%';
        document.getElementById('pct-elle-text').innerText = pC.toFixed(1);
        document.getElementById('pct-elle-bar').style.width = pC + '%';

        const ctx = document.getElementById('expenseChart')?.getContext('2d');
        if (ctx) {
            if (myChart) myChart.destroy();
            myChart = new Chart(ctx, { type: 'doughnut', data: { labels: Object.keys(catSums), datasets: [{ data: Object.values(catSums), backgroundColor: ['#4A90E2', '#FF6B6B', '#50E3C2', '#FDCB6E'], borderWidth: 0 }] }, options: { plugins: { legend: { display: false } }, cutout: '70%' } });
        }
    }

    document.addEventListener('click', async (e) => {
        if(e.target.classList.contains('delete-exp')) { if(confirm("Supprimer ?")) await deleteDoc(doc(db, `budgets/${CURRENT_BUDGET_ID}/expenses`, e.target.dataset.id)); }
        if(e.target.classList.contains('delete-cat')) { await deleteDoc(doc(db, `budgets/${CURRENT_BUDGET_ID}/categories`, e.target.dataset.id)); }
    });
});