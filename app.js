import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, doc, updateDoc, deleteDoc, getDoc, setDoc, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

// 🔴 🔴 🔴 REMPLACEZ PAR VOTRE CONFIGURATION FIREBASE 🔴 🔴 🔴
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

// --- VARIABLES MULTI-LOCATAIRES ---
let CURRENT_BUDGET_ID = null; // L'ID secret du foyer
let unsubscribers = []; // Pour nettoyer les écoutes si on change de compte

// Variables UI
let goals = []; let expenses = []; let customCategories = [];
let isPanelOpen = false; let myChart = null; let myAnnualChart = null;
let currentSort = { column: 'date', asc: false };
let currentSearch = ""; let showAnnual = false; let showEnvelopes = false;

// --- GESTION DU THÈME ---
const themeSelector = document.getElementById('theme-selector');
const savedTheme = localStorage.getItem('budgetTheme') || 'light';
document.body.className = savedTheme === 'light' ? '' : `theme-${savedTheme}`;
themeSelector.value = savedTheme;
themeSelector.addEventListener('change', (e) => {
    document.body.className = e.target.value === 'light' ? '' : `theme-${e.target.value}`;
    localStorage.setItem('budgetTheme', e.target.value);
});

const d = new Date();
const filterMonth = document.getElementById('filter-month');
const filterYear = document.getElementById('filter-year');
for(let i = d.getFullYear() - 1; i <= d.getFullYear() + 1; i++) { filterYear.appendChild(new Option(i, i)); }
filterMonth.value = d.getMonth(); filterYear.value = d.getFullYear();
filterMonth.addEventListener('change', updateUI); filterYear.addEventListener('change', updateUI);
document.getElementById('search-bar').addEventListener('input', (e) => { currentSearch = e.target.value.toLowerCase(); updateUI(); });


// --- GESTION DES ÉCRANS ET DE L'AUTHENTIFICATION SAAS ---
const screenAuth = document.getElementById('screen-auth');
const screenSetup = document.getElementById('screen-setup');
const screenApp = document.getElementById('screen-app');

let isLoginMode = true;
const authTitle = document.getElementById('auth-title');
const authSubmitBtn = document.getElementById('auth-submit-btn');
const authToggleLink = document.getElementById('auth-toggle-link');

authToggleLink.addEventListener('click', () => {
    isLoginMode = !isLoginMode;
    authTitle.innerText = isLoginMode ? "Se connecter" : "Créer un compte";
    authSubmitBtn.innerText = isLoginMode ? "Connexion" : "Inscription";
    authToggleLink.innerText = isLoginMode ? "Pas de compte ? S'inscrire ici." : "Déjà un compte ? Se connecter.";
});

document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('auth-email').value;
    const pwd = document.getElementById('auth-password').value;
    try {
        if(isLoginMode) await signInWithEmailAndPassword(auth, email, pwd);
        else await createUserWithEmailAndPassword(auth, email, pwd);
        document.getElementById('auth-error').style.display = 'none';
    } catch(err) {
        document.getElementById('auth-error').style.display = 'block';
        document.getElementById('auth-error').innerText = isLoginMode ? "Identifiants incorrects" : "Erreur (Mot de passe trop court ou email utilisé)";
    }
});

document.getElementById('logout-btn').addEventListener('click', () => { signOut(auth); });
document.getElementById('btn-cancel-setup').addEventListener('click', () => { signOut(auth); });

// Le routeur principal
onAuthStateChanged(auth, async (user) => {
    if (user) {
        screenAuth.style.display = 'none';
        // On vérifie si l'utilisateur a déjà un Foyer (budgetId) assigné
        const userDocRef = doc(db, "users", user.uid);
        const userDoc = await getDoc(userDocRef);
        
        if (userDoc.exists() && userDoc.data().budgetId) {
            CURRENT_BUDGET_ID = userDoc.data().budgetId;
            loadBudgetData(); // LANCE LA MACHINE !
        } else {
            // L'utilisateur vient de s'inscrire, il n'a pas de Foyer
            screenSetup.style.display = 'flex';
            screenApp.style.display = 'none';
        }
    } else {
        // Déconnecté
        screenAuth.style.display = 'flex';
        screenSetup.style.display = 'none';
        screenApp.style.display = 'none';
        // Nettoyage
        CURRENT_BUDGET_ID = null;
        unsubscribers.forEach(unsub => unsub());
        unsubscribers = [];
    }
});

// CRÉER UN NOUVEAU FOYER
document.getElementById('btn-create-budget').addEventListener('click', async () => {
    const user = auth.currentUser;
    if(!user) return;
    
    // Génère un code d'invitation à 6 caractères aléatoires majuscules
    const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    
    // Crée le document du foyer
    const newBudgetRef = await addDoc(collection(db, "budgets"), {
        code: inviteCode,
        createdAt: Date.now(),
        owner: user.uid
    });
    
    // Ajoute des catégories par défaut pour aider
    await addDoc(collection(db, `budgets/${newBudgetRef.id}/categories`), { name: "Logement", emoji: "🏠", isActive: true });
    await addDoc(collection(db, `budgets/${newBudgetRef.id}/categories`), { name: "Courses", emoji: "🛒", isActive: true });

    // Assigne le foyer à l'utilisateur
    await setDoc(doc(db, "users", user.uid), { budgetId: newBudgetRef.id });
    
    // La fonction onAuthStateChanged va redétecter la modif (en rechargeant manuellement pour simplifier)
    window.location.reload();
});

// REJOINDRE UN FOYER EXISTANT
document.getElementById('btn-join-budget').addEventListener('click', async () => {
    const user = auth.currentUser;
    const inputCode = document.getElementById('join-code').value.trim().toUpperCase();
    if(!inputCode) return;

    // Cherche si un foyer possède ce code
    const q = query(collection(db, "budgets"), where("code", "==", inputCode));
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
        document.getElementById('join-error').style.display = 'block';
    } else {
        const targetBudgetId = querySnapshot.docs[0].id;
        // On lie l'utilisateur à ce foyer
        await setDoc(doc(db, "users", user.uid), { budgetId: targetBudgetId });
        window.location.reload();
    }
});


// ============================================================================
// --- CHARGEMENT DES DONNÉES DU FOYER SÉLECTIONNÉ ---
// ============================================================================
function loadBudgetData() {
    screenSetup.style.display = 'none';
    screenApp.style.display = 'block';

    // Affiche le code d'invitation dans le panel admin
    getDoc(doc(db, "budgets", CURRENT_BUDGET_ID)).then(bDoc => {
        if(bDoc.exists()) {
            document.getElementById('display-invite-code').innerText = bDoc.data().code;
        }
    });

    // 1. Ecoute des Opérations
    const subExp = onSnapshot(collection(db, `budgets/${CURRENT_BUDGET_ID}/expenses`), (snapshot) => {
        expenses = []; snapshot.forEach((doc) => { expenses.push({ id: doc.id, ...doc.data() }); });
        updateUI();
    });

    // 2. Ecoute des Catégories
    const subCat = onSnapshot(collection(db, `budgets/${CURRENT_BUDGET_ID}/categories`), (snapshot) => {
        customCategories = []; snapshot.forEach((doc) => { customCategories.push({ id: doc.id, ...doc.data() }); });
        renderCategories(); updateUI(); 
    });

    // 3. Ecoute des Objectifs
    const subGoal = onSnapshot(collection(db, `budgets/${CURRENT_BUDGET_ID}/goals`), (snapshot) => {
        goals = []; snapshot.forEach((doc) => { goals.push({ id: doc.id, ...doc.data() }); });
        renderGoals();
    });

    // 4. Moteur des prélèvements automatiques (CRON Local Foyer)
    const subRec = onSnapshot(collection(db, `budgets/${CURRENT_BUDGET_ID}/recurring`), (snapshot) => {
        const now = new Date();
        snapshot.forEach(async (docSnap) => {
            const rule = { id: docSnap.id, ...docSnap.data() };
            const triggerDate = new Date(rule.nextYear, rule.nextMonth, rule.dayOfMonth);
            if (now.getTime() >= triggerDate.getTime()) {
                await addDoc(collection(db, `budgets/${CURRENT_BUDGET_ID}/expenses`), {
                    date: triggerDate.toLocaleDateString('fr-FR'), timestamp: triggerDate.getTime(),
                    desc: rule.desc + ' (Auto)', amount: rule.amount, payer: rule.payer, category: rule.category, type: rule.type || 'expense'
                });
                let nextM = rule.nextMonth + 1; let nextY = rule.nextYear;
                if(nextM > 11) { nextM = 0; nextY++; }
                await updateDoc(doc(db, `budgets/${CURRENT_BUDGET_ID}/recurring`, rule.id), { nextMonth: nextM, nextYear: nextY });
            }
        });
    });

    unsubscribers.push(subExp, subCat, subGoal, subRec);
}


// --- GESTION DU PANEL ADMIN UI ---
document.getElementById('login-btn').addEventListener('click', () => { 
    isPanelOpen = !isPanelOpen; 
    document.getElementById('admin-panel').style.display = isPanelOpen ? 'block' : 'none';
});


// --- VOS FONCTIONS HABITUELLES (Légèrement modifiées pour inclure `budgets/ID/`) ---

// Ajouter Catégorie
document.getElementById('category-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const limitVal = document.getElementById('new-cat-limit').value;
    await addDoc(collection(db, `budgets/${CURRENT_BUDGET_ID}/categories`), { 
        emoji: document.getElementById('new-cat-emoji').value, name: document.getElementById('new-cat-name').value, limit: limitVal ? parseFloat(limitVal) : null, isActive: true 
    });
    e.target.reset();
});

document.getElementById('category-manage-list').addEventListener('click', async (e) => {
    if(e.target.classList.contains('edit-cat')) {
        const catId = e.target.getAttribute('data-id');
        const editDiv = document.getElementById(`edit-${catId}`);
        const btn = document.getElementById(`btn-cat-${catId}`);
        if (editDiv.style.display === 'none') {
            document.getElementById(`display-${catId}`).style.display = 'none'; editDiv.style.display = 'flex';
            btn.innerText = '✅'; btn.classList.replace('edit-btn', 'success-btn');
        } else {
            await updateDoc(doc(db, `budgets/${CURRENT_BUDGET_ID}/categories`, catId), { 
                name: document.getElementById(`input-name-${catId}`).value, emoji: document.getElementById(`input-emoji-${catId}`).value, limit: document.getElementById(`input-limit-${catId}`).value ? parseFloat(document.getElementById(`input-limit-${catId}`).value) : null
            });
        }
    }
});

document.getElementById('category-manage-list').addEventListener('change', async (e) => {
    if(e.target.classList.contains('toggle-cat')) await updateDoc(doc(db, `budgets/${CURRENT_BUDGET_ID}/categories`, e.target.getAttribute('data-id')), { isActive: e.target.checked });
});

// Ajouter Objectif
document.getElementById('goal-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await addDoc(collection(db, `budgets/${CURRENT_BUDGET_ID}/goals`), { name: document.getElementById('goal-name').value, current: parseFloat(document.getElementById('goal-current').value), target: parseFloat(document.getElementById('goal-target').value) });
    e.target.reset();
});

document.getElementById('goal-manage-list').addEventListener('click', async (e) => {
    const goalId = e.target.getAttribute('data-id');
    if(!goalId) return;
    if(e.target.classList.contains('delete-goal') && confirm("Supprimer cet objectif ?")) await deleteDoc(doc(db, `budgets/${CURRENT_BUDGET_ID}/goals`, goalId));
    if(e.target.classList.contains('edit-goal')) {
        const editDiv = document.getElementById(`edit-goal-${goalId}`);
        const btn = document.getElementById(`btn-goal-${goalId}`);
        if (editDiv.style.display === 'none') {
            document.getElementById(`display-goal-${goalId}`).style.display = 'none'; editDiv.style.display = 'flex';
            btn.innerText = '✅'; btn.classList.replace('edit-btn', 'success-btn');
        } else {
            await updateDoc(doc(db, `budgets/${CURRENT_BUDGET_ID}/goals`, goalId), { name: document.getElementById(`input-goal-name-${goalId}`).value, target: parseFloat(document.getElementById(`input-goal-target-${goalId}`).value) });
        }
    }
});

// Ajouter Dépense
document.getElementById('expense-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    const type = document.querySelector('input[name="trans-type"]:checked').value;
    const category = document.getElementById('category').value;
    const amount = parseFloat(document.getElementById('amount').value);
    const desc = document.getElementById('desc').value;
    const payer = document.getElementById('payer').value;
    const isRecurring = document.getElementById('is-recurring').checked;
    
    const catLow = category.toLowerCase();
    if (type === 'expense' && (catLow.includes("épargne") || catLow.includes("epargne") || catLow.includes("objectif"))) {
        const goalId = document.getElementById('goal-selector').value;
        const goalToUpdate = goals.find(g => g.id === goalId);
        if(goalToUpdate) { await updateDoc(doc(db, `budgets/${CURRENT_BUDGET_ID}/goals`, goalId), { current: goalToUpdate.current + amount }); }
    }

    await addDoc(collection(db, `budgets/${CURRENT_BUDGET_ID}/expenses`), { date: new Date().toLocaleDateString('fr-FR'), timestamp: Date.now(), desc: desc, amount: amount, payer: payer, category: category, type: type });

    if (isRecurring) {
        const d = new Date(); let nextM = d.getMonth() + 1; let nextY = d.getFullYear(); if(nextM > 11) { nextM = 0; nextY++; }
        await addDoc(collection(db, `budgets/${CURRENT_BUDGET_ID}/recurring`), {
            desc: desc, amount: amount, payer: payer, category: category, type: type,
            dayOfMonth: parseInt(document.getElementById('recurring-day').value), nextMonth: nextM, nextYear: nextY
        });
    }

    e.target.reset(); document.getElementById('goal-selector-group').style.display = 'none'; document.getElementById('recurring-day-group').style.display = 'none';
});

// Supprimer dépense
document.getElementById('expense-list').addEventListener('click', async (e) => {
    const btn = e.target.closest('.delete-exp');
    if (btn && confirm("Supprimer cette opération ?")) await deleteDoc(doc(db, `budgets/${CURRENT_BUDGET_ID}/expenses`, btn.getAttribute('data-id')));
});


// (Toutes les fonctions renderCategories, renderGoals, updateUI et Export CSV restent identiques, mais sans Firebase dedans).
document.querySelectorAll('input[name="trans-type"]').forEach(radio => { radio.addEventListener('change', () => { document.getElementById('category').dispatchEvent(new Event('change')); }); });
document.getElementById('category').addEventListener('change', (e) => {
    const group = document.getElementById('goal-selector-group'); const isExpense = document.getElementById('type-expense').checked;
    if(isExpense && (e.target.value.toLowerCase().includes("épargne") || e.target.value.toLowerCase().includes("epargne") || e.target.value.toLowerCase().includes("objectif"))) {
        group.style.display = 'block'; document.getElementById('goal-selector').required = true;
    } else { group.style.display = 'none'; document.getElementById('goal-selector').required = false; }
});
document.getElementById('is-recurring').addEventListener('change', (e) => { document.getElementById('recurring-day-group').style.display = e.target.checked ? 'block' : 'none'; document.getElementById('recurring-day').required = e.target.checked; });
document.getElementById('toggle-annual-btn').addEventListener('click', (e) => { showAnnual = !showAnnual; e.target.classList.toggle('active'); document.getElementById('annual-section').style.display = showAnnual ? 'block' : 'none'; if(showAnnual) updateUI(); });
document.getElementById('toggle-envelopes-btn').addEventListener('click', (e) => { showEnvelopes = !showEnvelopes; e.target.classList.toggle('active'); document.getElementById('envelopes-section').style.display = showEnvelopes ? 'grid' : 'none'; if(showEnvelopes) updateUI(); });
document.getElementById('toggle-proportional').addEventListener('change', (e) => { if (e.target.checked) { document.getElementById('chart-container').style.display = 'none'; document.getElementById('proportional-container').style.display = 'block'; } else { document.getElementById('chart-container').style.display = 'block'; document.getElementById('proportional-container').style.display = 'none'; } });

document.querySelectorAll('th.sortable').forEach(th => {
    th.addEventListener('click', () => { const column = th.getAttribute('data-sort'); if (currentSort.column === column) currentSort.asc = !currentSort.asc; else { currentSort.column = column; currentSort.asc = true; } updateUI(); });
});

document.getElementById('export-btn').addEventListener('click', () => {
    let csvContent = "\uFEFFDate;Description;Catégorie;Personne;Montant;Type\n"; 
    expenses.forEach(exp => { const typeStr = (exp.type === 'income') ? 'Revenu' : 'Dépense'; csvContent += `${exp.date};${exp.desc};${exp.category};${exp.payer};${exp.amount};${typeStr}\n`; });
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.setAttribute("download", `budget_export_${new Date().toLocaleDateString('fr-FR')}.csv`);
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
});

function renderCategories() {
    const selectEl = document.getElementById('category'); const manageList = document.getElementById('category-manage-list');
    selectEl.innerHTML = '<option value="">-- Choisir une catégorie --</option>';
    customCategories.filter(cat => cat.isActive !== false).forEach(cat => { selectEl.appendChild(new Option(`${cat.emoji} ${cat.name}`, `${cat.emoji} ${cat.name}`)); });
    manageList.innerHTML = '';
    customCategories.forEach(cat => {
        const li = document.createElement('li'); const isChecked = cat.isActive !== false ? 'checked' : ''; li.style.opacity = cat.isActive !== false ? '1' : '0.5';
        li.innerHTML = `<div style="display: flex; align-items: center; gap: 15px; flex-grow: 1;"><input type="checkbox" class="toggle-cat" data-id="${cat.id}" ${isChecked} title="Activer/Désactiver" style="width: 18px; height: 18px; margin: 0; cursor: pointer;"><div id="display-${cat.id}" style="display: flex; align-items: center; gap: 8px; flex-grow: 1;"><span style="font-size: 1.2em;">${cat.emoji}</span><strong>${cat.name}</strong>${cat.limit ? ` <span style="font-size: 0.8em; color:#E74C3C;">(Max: ${cat.limit}€)</span>` : ''}</div><div id="edit-${cat.id}" style="display: none; align-items: center; gap: 5px; flex-grow: 1;"><input type="text" id="input-emoji-${cat.id}" value="${cat.emoji}" style="width: 45px; text-align: center; padding: 4px;" maxlength="2"><input type="text" id="input-name-${cat.id}" value="${cat.name}" style="flex-grow: 1; padding: 4px;"><input type="number" id="input-limit-${cat.id}" value="${cat.limit || ''}" placeholder="Max €" style="width: 70px; padding: 4px;"></div></div><div class="action-group" style="margin-left: 15px;"><button class="edit-btn edit-cat" data-id="${cat.id}" id="btn-cat-${cat.id}" style="padding: 6px 12px; font-size: 0.85em; width: auto; margin: 0;">✏️</button></div>`;
        manageList.appendChild(li);
    });
}

function renderGoals() {
    const goalsContainer = document.getElementById('goals-container'); const goalSelector = document.getElementById('goal-selector'); const manageList = document.getElementById('goal-manage-list');
    goalsContainer.innerHTML = ''; goalSelector.innerHTML = '<option value="">-- Choisir un objectif --</option>'; manageList.innerHTML = '';
    goals.forEach(goal => {
        const percent = Math.min((goal.current / goal.target) * 100, 100);
        const card = document.createElement('div'); card.className = 'card'; card.innerHTML = `<h3>🎯 ${goal.name}</h3><p>${goal.current.toFixed(2)} € / ${goal.target.toFixed(2)} €</p><div class="progress-bar"><div class="progress-fill green" style="width: ${percent}%;"></div></div>`;
        goalsContainer.appendChild(card); goalSelector.appendChild(new Option(goal.name, goal.id));
        const li = document.createElement('li');
        li.innerHTML = `<div style="display: flex; align-items: center; gap: 15px; flex-grow: 1;"><div id="display-goal-${goal.id}" style="display: flex; align-items: center; gap: 8px; flex-grow: 1;"><strong style="line-height: 1;">${goal.name}</strong> <span style="font-size: 0.9em;">(${goal.current}€ / ${goal.target}€)</span></div><div id="edit-goal-${goal.id}" style="display: none; align-items: center; gap: 8px; flex-grow: 1;"><input type="text" id="input-goal-name-${goal.id}" value="${goal.name}" style="flex-grow: 1; padding: 4px; margin: 0;"><input type="number" id="input-goal-target-${goal.id}" value="${goal.target}" step="0.01" style="width: 80px; padding: 4px; margin: 0;"></div></div><div class="action-group" style="margin-left: 15px;"><button class="edit-btn edit-goal" data-id="${goal.id}" id="btn-goal-${goal.id}" style="padding: 6px 12px; font-size:0.85em; width: auto; margin: 0;">✏️</button><button class="danger-btn delete-goal" data-id="${goal.id}" style="padding: 6px 12px; font-size:0.85em; width: auto; margin: 0;">🗑️</button></div>`;
        manageList.appendChild(li);
    });
}

function updateUI() {
    const expenseList = document.getElementById('expense-list'); expenseList.innerHTML = '';
    const selectedMonth = parseInt(document.getElementById('filter-month').value); const selectedYear = parseInt(document.getElementById('filter-year').value);

    let filteredExpenses = expenses.filter(exp => {
        const expDate = new Date(exp.timestamp);
        return expDate.getMonth() === selectedMonth && expDate.getFullYear() === selectedYear && (exp.desc.toLowerCase().includes(currentSearch) || exp.category.toLowerCase().includes(currentSearch) || exp.payer.toLowerCase().includes(currentSearch));
    });

    document.querySelectorAll('th.sortable').forEach(th => {
        const col = th.getAttribute('data-sort'); let text = th.innerText.replace(' ⬆️', '').replace(' ⬇️', '').replace(' ↕️', '');
        if (currentSort.column === col) th.innerText = text + (currentSort.asc ? ' ⬆️' : ' ⬇️'); else th.innerText = text + ' ↕️';
    });

    filteredExpenses.sort((a, b) => {
        let valA, valB;
        switch(currentSort.column) {
            case 'date': valA = a.timestamp; valB = b.timestamp; break;
            case 'desc': valA = a.desc.toLowerCase(); valB = b.desc.toLowerCase(); break;
            case 'category': valA = a.category.toLowerCase(); valB = b.category.toLowerCase(); break;
            case 'payer': valA = a.payer.toLowerCase(); valB = b.payer.toLowerCase(); break;
            case 'amount': valA = (a.type === 'income') ? a.amount : -a.amount; valB = (b.type === 'income') ? b.amount : -b.amount; break;
            default: valA = a.timestamp; valB = b.timestamp;
        }
        if (valA < valB) return currentSort.asc ? -1 : 1;
        if (valA > valB) return currentSort.asc ? 1 : -1;
        return 0;
    });

    let totalDépenses = 0, totalRevenus = 0, revMoi = 0, revElle = 0, depMoi = 0, depElle = 0;
    const categoryTotals = {}; const categoryEnvelopes = {}; 

    filteredExpenses.forEach(exp => {
        const isIncome = (exp.type || 'expense') === 'income';
        const row = document.createElement('tr');
        const amountStr = isIncome ? `+ ${exp.amount.toFixed(2)} €` : `- ${exp.amount.toFixed(2)} €`;
        row.innerHTML = `<td>${exp.date}</td><td>${exp.desc}</td><td><span class="${exp.desc.includes('(Auto') ? 'badge recurring' : 'badge'}">${exp.category}</span></td><td>${exp.payer}</td><td style="color: ${isIncome ? '#2ECC71' : '#E74C3C'}; font-weight: bold;">${amountStr}</td><td style="text-align: center;"><button class="danger-btn delete-exp" data-id="${exp.id}" style="padding: 4px 8px; font-size: 0.8em; width: auto; margin: 0;">🗑️</button></td>`;
        expenseList.appendChild(row);

        if (isIncome) {
            totalRevenus += exp.amount;
            if (exp.payer === 'Moi') revMoi += exp.amount; if (exp.payer === 'Ma Compagne') revElle += exp.amount;
        } else {
            totalDépenses += exp.amount;
            if (exp.payer === 'Moi') depMoi += exp.amount; if (exp.payer === 'Ma Compagne') depElle += exp.amount;
            if(categoryTotals[exp.category]) categoryTotals[exp.category] += exp.amount; else categoryTotals[exp.category] = exp.amount;
            const catName = exp.category.substring(3).trim();
            if(categoryEnvelopes[catName]) categoryEnvelopes[catName] += exp.amount; else categoryEnvelopes[catName] = exp.amount;
        }
    });

    document.getElementById('total-depenses').innerText = totalDépenses.toFixed(2) + ' €';
    document.getElementById('total-revenus').innerText = '+ ' + totalRevenus.toFixed(2) + ' €';
    const soldeActuel = totalRevenus - totalDépenses;
    document.getElementById('solde-actuel').innerText = soldeActuel.toFixed(2) + ' €';
    document.getElementById('solde-actuel').className = soldeActuel >= 0 ? 'balance positive' : 'balance';

    const pctMoi = revMoi > 0 ? Math.min((depMoi / revMoi) * 100, 100) : 0; const pctElle = revElle > 0 ? Math.min((depElle / revElle) * 100, 100) : 0;
    document.getElementById('pct-moi-text').innerText = pctMoi.toFixed(1); document.getElementById('pct-moi-bar').style.width = pctMoi + '%'; document.getElementById('pct-moi-bar').className = 'progress-fill ' + (pctMoi > 80 ? 'red' : (pctMoi > 50 ? 'orange' : 'green'));
    document.getElementById('pct-elle-text').innerText = pctElle.toFixed(1); document.getElementById('pct-elle-bar').style.width = pctElle + '%'; document.getElementById('pct-elle-bar').className = 'progress-fill ' + (pctElle > 80 ? 'red' : (pctElle > 50 ? 'orange' : 'green'));

    const ctx = document.getElementById('expenseChart').getContext('2d');
    if (myChart) myChart.destroy(); 
    if (Object.keys(categoryTotals).length > 0) {
        myChart = new Chart(ctx, { type: 'doughnut', data: { labels: Object.keys(categoryTotals), datasets: [{ data: Object.values(categoryTotals), backgroundColor: ['#4A90E2', '#50E3C2', '#FF6B6B', '#FDCB6E', '#A29BFE', '#E84393', '#00B894'], borderWidth: 2, borderColor: 'transparent' }] }, options: { responsive: true, plugins: { legend: { display: false } } } });
    }

    if (showEnvelopes) {
        const envContainer = document.getElementById('envelopes-section'); envContainer.innerHTML = '';
        const catsWithLimits = customCategories.filter(c => c.limit && c.limit > 0 && c.isActive !== false);
        if(catsWithLimits.length === 0) { envContainer.innerHTML = '<p style="text-align: center; width: 100%;">Aucun budget max défini.</p>'; } else {
            catsWithLimits.forEach(cat => {
                const spent = categoryEnvelopes[cat.name] || 0; let percent = Math.min((spent / cat.limit) * 100, 100);
                const card = document.createElement('div'); card.className = 'card';
                card.innerHTML = `<h3 style="margin-bottom: 5px;">${cat.emoji} ${cat.name}</h3><p style="margin: 0 0 5px 0; font-size: 0.9em;">Dépensé : <strong>${spent.toFixed(2)}€</strong> / ${cat.limit}€</p><div class="progress-bar"><div class="progress-fill ${percent >= 100 ? 'red' : (percent >= 75 ? 'orange' : 'green')}" style="width: ${percent}%;"></div></div>`;
                envContainer.appendChild(card);
            });
        }
    }

    if (showAnnual) {
        const annualCtx = document.getElementById('annualChart').getContext('2d');
        if (myAnnualChart) myAnnualChart.destroy();
        const monthlyInc = new Array(12).fill(0); const monthlyExp = new Array(12).fill(0);
        expenses.forEach(exp => {
            const expDate = new Date(exp.timestamp);
            if(expDate.getFullYear() === selectedYear) { const m = expDate.getMonth(); if ((exp.type || 'expense') === 'income') monthlyInc[m] += exp.amount; else monthlyExp[m] += exp.amount; }
        });
        const chartTextColor = document.body.classList.contains('theme-dark') ? '#e0e0e0' : '#333';
        myAnnualChart = new Chart(annualCtx, { type: 'bar', data: { labels: ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'], datasets: [ { label: 'Revenus', data: monthlyInc, backgroundColor: '#2ECC71' }, { label: 'Dépenses', data: monthlyExp, backgroundColor: '#E74C3C' } ] }, options: { responsive: true, maintainAspectRatio: false, color: chartTextColor, scales: { x: { ticks: { color: chartTextColor } }, y: { ticks: { color: chartTextColor } } } } });
    }
}