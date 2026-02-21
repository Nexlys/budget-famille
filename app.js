import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, doc, updateDoc, deleteDoc, getDoc, setDoc, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

// 🔴 REMPLACEZ PAR VOS CLÉS FIREBASE
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
    const sidebar = document.getElementById('sidebar');
    const mainContent = document.querySelector('.main-content');
    const toggleBtn = document.getElementById('toggle-sidebar');
    const screenAuth = document.getElementById('screen-auth');
    const screenSetup = document.getElementById('screen-setup');
    const screenApp = document.getElementById('screen-app');

    // Vues SPA
    const viewDashboard = document.getElementById('view-dashboard');
    const viewProfile = document.getElementById('view-profile');
    const navItems = document.querySelectorAll('.nav-item');

    let CURRENT_BUDGET_ID = null;
    let unsubscribers = [];
    let goals = [], expenses = [], customCategories = [], members = [];
    let myChart = null, myAnnualChart = null, currentSearch = "", showAnnual = false, showEnvelopes = false;

    // --- NAVIGATION SPA ---
    function setActiveNav(targetId) {
        navItems.forEach(item => item.classList.remove('active'));
        document.getElementById(targetId)?.classList.add('active');
        if (window.innerWidth <= 850) { sidebar.classList.add('collapsed'); mainContent.classList.remove('expanded'); }
    }

    document.getElementById('nav-dashboard')?.addEventListener('click', () => {
        viewDashboard.style.display = 'block'; viewProfile.style.display = 'none'; setActiveNav('nav-dashboard'); window.scrollTo(0,0);
    });

    document.getElementById('nav-profile')?.addEventListener('click', () => {
        viewDashboard.style.display = 'none'; viewProfile.style.display = 'block'; setActiveNav('nav-profile'); window.scrollTo(0,0);
    });

    // Autres boutons menu
    toggleBtn?.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed'); mainContent.classList.toggle('expanded');
    });

    document.getElementById('nav-envelopes')?.addEventListener('click', () => {
        showEnvelopes = !showEnvelopes; document.getElementById('envelopes-section').style.display = showEnvelopes ? 'grid' : 'none'; updateUI();
    });

    document.getElementById('nav-annual')?.addEventListener('click', () => {
        showAnnual = !showAnnual; document.getElementById('annual-section').style.display = showAnnual ? 'block' : 'none'; updateUI();
    });

    document.getElementById('nav-admin')?.addEventListener('click', () => {
        const p = document.getElementById('admin-panel'); p.style.display = p.style.display === 'none' ? 'block' : 'none';
        setActiveNav('nav-admin'); viewDashboard.style.display = 'block'; viewProfile.style.display = 'none'; window.scrollTo(0,0);
    });

    // --- MISE À JOUR DE L'INTERFACE ---
    function updateUI() {
        const list = document.getElementById('expense-list'); if(!list) return;
        list.innerHTML = "";
        const m = parseInt(document.getElementById('filter-month').value);
        const y = parseInt(document.getElementById('filter-year').value);
        let rev = 0, dep = 0, catSums = {};
        
        let memberStats = {};
        members.forEach(mbr => memberStats[mbr.id] = { name: mbr.name, rev: 0, dep: 0 });

        expenses.filter(e => {
            const dt = new Date(e.timestamp);
            return dt.getMonth() === m && dt.getFullYear() === y && (e.desc.toLowerCase().includes(currentSearch) || e.category.toLowerCase().includes(currentSearch));
        }).forEach(e => {
            const isInc = e.type === 'income';
            let currentPayerId = e.payerId || (members.find(mbr => mbr.name === e.payer)?.id) || 'inconnu';
            if(!memberStats[currentPayerId]) memberStats[currentPayerId] = { name: e.payer || "Ancien Profil", rev: 0, dep: 0 };
            const pName = memberStats[currentPayerId].name;

            if(isInc) { rev += e.amount; memberStats[currentPayerId].rev += e.amount; }
            else { dep += e.amount; memberStats[currentPayerId].dep += e.amount; catSums[e.category] = (catSums[e.category] || 0) + e.amount; }
            
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${e.date}</td><td>${e.desc}</td><td><small>${e.category}</small></td><td><strong>${pName}</strong></td><td style="color:${isInc?'#2ecc71':'#e74c3c'}; font-weight:bold;">${isInc?'+':'-'}${e.amount.toFixed(2)}€</td><td><button class="delete-exp" data-id="${e.id}" style="background:none; border:none; cursor:pointer;">🗑️</button></td>`;
            list.appendChild(tr);
        });

        document.getElementById('total-revenus').innerText = rev.toFixed(2) + ' €';
        document.getElementById('total-depenses').innerText = dep.toFixed(2) + ' €';
        const solde = rev - dep;
        document.getElementById('solde-actuel').innerText = solde.toFixed(2) + ' €';
        document.getElementById('solde-actuel').style.color = solde >= 0 ? '#2ecc71' : '#e74c3c';

        const propContainer = document.getElementById('proportional-container');
        if(propContainer) {
            propContainer.innerHTML = '';
            Object.values(memberStats).forEach(stat => {
                if(stat.rev === 0 && stat.dep === 0) return;
                const pct = stat.rev > 0 ? Math.min((stat.dep / stat.rev) * 100, 100) : 0;
                propContainer.innerHTML += `
                    <p style="font-size:0.85em; margin: 10px 0 5px 0; display:flex; justify-content:space-between; color:var(--text);">
                        <strong>${stat.name}</strong> <span>${pct.toFixed(1)}%</span>
                    </p>
                    <div class="progress-bar" style="height:10px; margin-top:0;">
                        <div class="progress-fill ${pct > 80 ? 'red' : (pct > 50 ? 'orange' : 'green')}" style="width:${pct}%"></div>
                    </div>
                `;
            });
        }

        const ctx = document.getElementById('expenseChart')?.getContext('2d');
        if (ctx) {
            if (myChart) myChart.destroy();
            myChart = new Chart(ctx, { type: 'doughnut', data: { labels: Object.keys(catSums), datasets: [{ data: Object.values(catSums), backgroundColor: ['#4A90E2', '#FF6B6B', '#50E3C2', '#FDCB6E', '#A29BFE'], borderWidth: 0 }] }, options: { plugins: { legend: { display: false } }, cutout: '75%' } });
        }
        if(showEnvelopes) renderEnvelopes(catSums);
        if(showAnnual) renderAnnualChart();
    }

    function renderMembers() {
        const sel = document.getElementById('payer');
        if(!sel) return;
        sel.innerHTML = '';
        members.forEach(m => sel.appendChild(new Option(m.name, m.id)));
        if(auth.currentUser) sel.value = auth.currentUser.uid;
    }

    function renderCategories() {
        const sel = document.getElementById('category'); const list = document.getElementById('category-manage-list');
        if(!sel || !list) return;
        sel.innerHTML = '<option value="">-- Choisir --</option>';
        customCategories.forEach(c => sel.appendChild(new Option(`${c.emoji} ${c.name}`, `${c.emoji} ${c.name}`)));
        list.innerHTML = "";
        customCategories.forEach(c => {
            const li = document.createElement('li'); li.style = "display:flex; justify-content:space-between; padding:8px; background:rgba(0,0,0,0.03); border-radius:6px; margin-bottom:5px;";
            li.innerHTML = `<span>${c.emoji} ${c.name}</span> <button class="delete-cat" data-id="${c.id}" style="width:auto; padding:2px 10px; margin:0; background:#e74c3c;">✕</button>`;
            list.appendChild(li);
        });
    }

    function renderGoals() {
        const cont = document.getElementById('goals-container'); const sel = document.getElementById('goal-selector');
        if(!cont || !sel) return;
        cont.innerHTML = ""; sel.innerHTML = '<option value="">-- Lier à un objectif --</option>';
        goals.forEach(g => {
            const p = Math.min((g.current / g.target) * 100, 100);
            const card = document.createElement('div'); card.className = 'card';
            card.innerHTML = `<h3>🎯 ${g.name}</h3><p>${g.current.toFixed(0)}€ / ${g.target}€</p><div class="progress-bar"><div class="progress-fill green" style="width:${p}%"></div></div>`;
            cont.appendChild(card); sel.appendChild(new Option(g.name, g.id));
        });
    }

    function renderEnvelopes(catSums) {
        const envContainer = document.getElementById('envelopes-section'); if(!envContainer) return;
        envContainer.innerHTML = '';
        customCategories.filter(c => c.limit).forEach(cat => {
            const spent = catSums[`${cat.emoji} ${cat.name}`] || 0; const p = Math.min((spent / cat.limit) * 100, 100);
            const card = document.createElement('div'); card.className = 'card';
            card.innerHTML = `<h3>${cat.emoji} ${cat.name}</h3><p>${spent.toFixed(2)}€ / ${cat.limit}€</p><div class="progress-bar"><div class="progress-fill ${p > 90 ? 'red' : (p > 70 ? 'orange' : 'green')}" style="width:${p}%"></div></div>`;
            envContainer.appendChild(card);
        });
    }

    function renderAnnualChart() {
        const ctx = document.getElementById('annualChart')?.getContext('2d'); if(!ctx) return;
        const monthlyData = new Array(12).fill(0).map(() => ({ inc: 0, exp: 0 }));
        expenses.filter(e => new Date(e.timestamp).getFullYear() === parseInt(document.getElementById('filter-year').value)).forEach(e => {
            const m = new Date(e.timestamp).getMonth();
            if(e.type === 'income') monthlyData[m].inc += e.amount; else monthlyData[m].exp += e.amount;
        });
        if(myAnnualChart) myAnnualChart.destroy();
        myAnnualChart = new Chart(ctx, { type: 'bar', data: { labels: ['Jan','Fév','Mar','Avr','Mai','Juin','Juil','Août','Sep','Oct','Nov','Déc'], datasets: [{ label: 'Revenus', data: monthlyData.map(d => d.inc), backgroundColor: '#2ecc71' }, { label: 'Dépenses', data: monthlyData.map(d => d.exp), backgroundColor: '#e74c3c' }] }, options: { responsive: true, maintainAspectRatio: false } });
    }

    // --- CHARGEMENT DATA ---
    function loadBudgetData() {
        screenSetup.style.display = 'none'; screenApp.style.display = 'block';
        getDoc(doc(db, "budgets", CURRENT_BUDGET_ID)).then(d => {
            if(d.exists()) document.getElementById('display-invite-code').innerText = d.data().code;
        });
        
        unsubscribers.push(onSnapshot(collection(db, `budgets/${CURRENT_BUDGET_ID}/members`), s => {
            members = []; s.forEach(doc => members.push({ id: doc.id, ...doc.data() }));
            const me = members.find(mbr => mbr.id === auth.currentUser.uid);
            if(me && document.getElementById('admin-pseudo')) document.getElementById('admin-pseudo').value = me.name;
            renderMembers(); updateUI();
        }));

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

    // --- AUTH ET CONFIGURATION FOYER ---
    document.getElementById('login-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('auth-email').value;
        const pwd = document.getElementById('auth-password').value;
        const isLoginMode = document.getElementById('auth-title').innerText === "Connexion";
        try {
            if(isLoginMode) await signInWithEmailAndPassword(auth, email, pwd);
            else await createUserWithEmailAndPassword(auth, email, pwd);
        } catch(err) {
            document.getElementById('auth-error').style.display = 'block';
            document.getElementById('auth-error').innerText = "Erreur: Identifiants invalides.";
        }
    });

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            const userDoc = await getDoc(doc(db, "users", user.uid));
            if (userDoc.exists() && userDoc.data().budgetId) {
                CURRENT_BUDGET_ID = userDoc.data().budgetId;
                screenAuth.style.display = 'none';
                loadBudgetData();
            } else {
                screenAuth.style.display = 'none'; screenSetup.style.display = 'flex';
            }
        } else {
            screenAuth.style.display = 'flex'; screenApp.style.display = 'none'; screenSetup.style.display = 'none';
            CURRENT_BUDGET_ID = null; unsubscribers.forEach(u => u());
        }
    });

    document.getElementById('btn-create-budget')?.addEventListener('click', async () => {
        const pseudo = document.getElementById('setup-pseudo').value.trim();
        if(!pseudo) return alert("Veuillez entrer votre prénom pour commencer.");
        const code = Math.random().toString(36).substring(2, 8).toUpperCase();
        const ref = await addDoc(collection(db, "budgets"), { code, owner: auth.currentUser.uid });
        await setDoc(doc(db, "budgets", ref.id, "members", auth.currentUser.uid), { name: pseudo });
        await setDoc(doc(db, "users", auth.currentUser.uid), { budgetId: ref.id });
        window.location.reload();
    });

    document.getElementById('btn-join-budget')?.addEventListener('click', async () => {
        const pseudo = document.getElementById('setup-pseudo').value.trim();
        if(!pseudo) return alert("Veuillez entrer votre prénom pour commencer.");
        const c = document.getElementById('join-code').value.trim().toUpperCase();
        const q = query(collection(db, "budgets"), where("code", "==", c));
        const snap = await getDocs(q);
        if (!snap.empty) {
            const targetId = snap.docs[0].id;
            await setDoc(doc(db, "budgets", targetId, "members", auth.currentUser.uid), { name: pseudo });
            await setDoc(doc(db, "users", auth.currentUser.uid), { budgetId: targetId });
            window.location.reload();
        } else { document.getElementById('join-error').style.display = 'block'; }
    });

    document.getElementById('btn-update-pseudo')?.addEventListener('click', async () => {
        const newName = document.getElementById('admin-pseudo').value.trim();
        if(newName && CURRENT_BUDGET_ID) {
            await setDoc(doc(db, `budgets/${CURRENT_BUDGET_ID}/members`, auth.currentUser.uid), { name: newName }, { merge: true });
            document.getElementById('profile-success').style.display = 'block';
            setTimeout(() => document.getElementById('profile-success').style.display = 'none', 3000);
        }
    });

    // --- EVENEMENTS UI RESTANTS ---
    const fM = document.getElementById('filter-month'), fY = document.getElementById('filter-year');
    if(fM && fY) {
        ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'].forEach((m, i) => fM.appendChild(new Option(m, i)));
        const dNow = new Date();
        for(let i = dNow.getFullYear()-1; i <= dNow.getFullYear()+1; i++) fY.appendChild(new Option(i, i));
        fM.value = dNow.getMonth(); fY.value = dNow.getFullYear();
        fM.addEventListener('change', updateUI); fY.addEventListener('change', updateUI);
    }

    document.getElementById('toggle-proportional')?.addEventListener('change', (e) => {
        document.getElementById('expenseChart').style.display = e.target.checked ? 'none' : 'block';
        document.getElementById('proportional-container').style.display = e.target.checked ? 'block' : 'none';
    });

    document.getElementById('auth-toggle-mode')?.addEventListener('click', () => {
        const t = document.getElementById('auth-title'); const b = document.getElementById('auth-submit-btn'); const l = document.getElementById('auth-toggle-mode');
        const isLog = t.innerText === "Connexion";
        t.innerText = isLog ? "Inscription" : "Connexion";
        b.innerText = isLog ? "Créer mon compte" : "Se connecter";
        l.innerText = isLog ? "Déjà un compte ? Connexion" : "Pas encore de compte ? S'inscrire";
    });

    document.getElementById('theme-selector')?.addEventListener('change', (e) => {
        document.body.className = e.target.value === 'light' ? '' : `theme-${e.target.value}`;
        localStorage.setItem('budgetTheme', e.target.value);
    });

    document.getElementById('logout-btn')?.addEventListener('click', () => signOut(auth));

    document.getElementById('expense-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const type = document.querySelector('input[name="trans-type"]:checked').value;
        const amount = parseFloat(document.getElementById('amount').value);
        const cat = document.getElementById('category').value;
        const payerId = document.getElementById('payer').value; 
        
        if (type === 'expense' && (cat.toLowerCase().includes("épargne") || cat.toLowerCase().includes("objectif"))) {
            const gid = document.getElementById('goal-selector').value;
            const targetGoal = goals.find(g => g.id === gid);
            if(targetGoal) await updateDoc(doc(db, `budgets/${CURRENT_BUDGET_ID}/goals`, gid), { current: targetGoal.current + amount });
        }
        await addDoc(collection(db, `budgets/${CURRENT_BUDGET_ID}/expenses`), {
            date: new Date().toLocaleDateString('fr-FR'), timestamp: Date.now(),
            desc: document.getElementById('desc').value, amount, payerId: payerId, category: cat, type
        });
        e.target.reset(); document.getElementById('payer').value = auth.currentUser.uid;
    });

    document.getElementById('category-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        await addDoc(collection(db, `budgets/${CURRENT_BUDGET_ID}/categories`), { 
            emoji: document.getElementById('new-cat-emoji').value, name: document.getElementById('new-cat-name').value, limit: parseFloat(document.getElementById('new-cat-limit').value) || null 
        }); e.target.reset();
    });

    document.getElementById('goal-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        await addDoc(collection(db, `budgets/${CURRENT_BUDGET_ID}/goals`), { name: document.getElementById('goal-name').value, current: 0, target: parseFloat(document.getElementById('goal-target').value) });
        e.target.reset();
    });

    document.addEventListener('click', async (e) => {
        if(e.target.classList.contains('delete-exp')) { if(confirm("Supprimer l'opération ?")) await deleteDoc(doc(db, `budgets/${CURRENT_BUDGET_ID}/expenses`, e.target.dataset.id)); }
        if(e.target.classList.contains('delete-cat')) { if(confirm("Supprimer la catégorie ?")) await deleteDoc(doc(db, `budgets/${CURRENT_BUDGET_ID}/categories`, e.target.dataset.id)); }
    });

    document.getElementById('search-bar')?.addEventListener('input', (e) => { currentSearch = e.target.value.toLowerCase(); updateUI(); });
});