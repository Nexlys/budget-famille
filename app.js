import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, doc, updateDoc, deleteDoc, getDoc, setDoc, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
// NOUVEAU : Import Firebase Storage pour les photos
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js";

// 🔴 1. REMPLACEZ PAR VOS CLÉS FIREBASE
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
const storage = getStorage(app); // Initialisation Storage

// 👑 2. REMPLACEZ CECI PAR VOTRE UID FIREBASE ADMIN
const ADMIN_UID = "7AsUY4KcNDaWB33X4A2n2UfxOvO2"; 

document.addEventListener('DOMContentLoaded', () => {

    // --- 🛠️ SYSTÈME DE POP-UP PERSONNALISÉ ---
    function customAlert(message, title = "Information") {
        return new Promise((resolve) => {
            const overlay = document.getElementById('custom-dialog-overlay');
            document.getElementById('custom-dialog-title').innerText = title;
            document.getElementById('custom-dialog-msg').innerHTML = message;
            const btnContainer = document.getElementById('custom-dialog-btns');
            btnContainer.innerHTML = '<button id="btn-dialog-ok" style="width:100%; max-width:200px; padding:14px 25px;">Compris !</button>';
            overlay.style.display = 'flex';
            document.getElementById('btn-dialog-ok').onclick = () => { overlay.style.display = 'none'; resolve(); };
        });
    }

    function customConfirm(message, title = "Confirmation") {
        return new Promise((resolve) => {
            const overlay = document.getElementById('custom-dialog-overlay');
            document.getElementById('custom-dialog-title').innerText = title;
            document.getElementById('custom-dialog-msg').innerHTML = message;
            const btnContainer = document.getElementById('custom-dialog-btns');
            btnContainer.innerHTML = `
                <button id="btn-dialog-cancel" class="btn-small" style="background:var(--bg); color:var(--text); flex:1;">Annuler</button>
                <button id="btn-dialog-confirm" style="background:var(--danger); color:white; flex:1; border:none; border-radius:14px; font-weight:bold;">Confirmer</button>
            `;
            overlay.style.display = 'flex';
            document.getElementById('btn-dialog-cancel').onclick = () => { overlay.style.display = 'none'; resolve(false); };
            document.getElementById('btn-dialog-confirm').onclick = () => { overlay.style.display = 'none'; resolve(true); };
        });
    }

    // Initialisation des dates
    const todayISO = new Date().toISOString().split('T')[0];
    if(document.getElementById('expense-date')) document.getElementById('expense-date').value = todayISO;

    const sidebar = document.getElementById('sidebar');
    const mainContent = document.querySelector('.main-content');
    const toggleBtn = document.getElementById('toggle-sidebar');
    const mobileOverlay = document.getElementById('mobile-overlay');
    
    const screenMaintenance = document.getElementById('screen-maintenance');
    const screenAuth = document.getElementById('screen-auth');
    const screenSetup = document.getElementById('screen-setup');
    const screenApp = document.getElementById('screen-app');

    const viewDashboard = document.getElementById('view-dashboard');
    const viewBudget = document.getElementById('view-budget');
    const viewProfile = document.getElementById('view-profile');
    const viewCalendar = document.getElementById('view-calendar');
    const viewAdmin = document.getElementById('view-admin');
    const viewSubs = document.getElementById('view-subscriptions');
    
    let CURRENT_BUDGET_ID = null;
    let unsubscribers = [];
    let isDataLoaded = false;
    let goals = [], expenses = [], customCategories = [], members = [], eventsData = [], subsData = [], monthlySettings = [];
    let myChart = null, myAnnualChart = null, currentSearch = "";
    let calMonth = new Date().getMonth(); let calYear = new Date().getFullYear();
    let reminderPopupShown = false;
    let isMaintenance = false; let currentUserObj = null;
    let editingExpenseId = null; let editingCategoryId = null;
    let deferredPrompt; 
    let sortCol = 'date'; let sortAsc = false;
    let currentQuickFilter = 'all'; // Filtres rapides

    // --- UPLOAD DE TICKET DE CAISSE ---
    let receiptFile = null;
    document.getElementById('receipt-upload')?.addEventListener('change', (e) => {
        receiptFile = e.target.files[0];
        document.getElementById('receipt-preview').innerText = receiptFile ? `📎 Image attachée : ${receiptFile.name}` : "";
    });

    // --- THÈME AUTOMATIQUE ---
    function applyTheme(themeValue) {
        if(themeValue === 'auto') {
            const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            document.body.className = isDark ? 'theme-dark' : '';
        } else {
            document.body.className = themeValue === 'light' ? '' : `theme-${themeValue}`;
        }
        renderAnnualChart();
    }
    
    // Écoute des changements de préférence système si sur "auto"
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if(localStorage.getItem('budgetTheme') === 'auto') applyTheme('auto');
    });

    // --- 🌍 GESTION RÉSEAU & INSTALLATION PWA ---
    window.addEventListener('online', () => document.getElementById('status-indicator').innerText = "● Connecté");
    window.addEventListener('offline', () => { document.getElementById('status-indicator').innerText = "● Hors-ligne"; document.getElementById('status-indicator').style.color = "var(--danger)"; });

    window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; const installCard = document.getElementById('install-app-card'); if(installCard) installCard.style.display = 'block'; });
    document.getElementById('btn-install-pwa')?.addEventListener('click', async () => { if (deferredPrompt) { deferredPrompt.prompt(); const { outcome } = await deferredPrompt.userChoice; if (outcome === 'accepted') document.getElementById('install-app-card').style.display = 'none'; deferredPrompt = null; } });

    onSnapshot(doc(db, "settings", "system"), (d) => {
        if(d.exists()) {
            const data = d.data();
            isMaintenance = data.maintenance === true;
            const toggle = document.getElementById('admin-maintenance-toggle'); if(toggle) toggle.checked = isMaintenance;
            const banner = document.getElementById('global-announcement');
            if(data.announcement && data.announcement.trim() !== "") { banner.innerText = data.announcement; banner.style.display = 'block'; } else { banner.style.display = 'none'; }
            renderAppState(); 
        }
    });

    document.getElementById('admin-maintenance-toggle')?.addEventListener('change', async (e) => { if(auth.currentUser.uid !== ADMIN_UID) return; await setDoc(doc(db, "settings", "system"), { maintenance: e.target.checked }, { merge: true }); });
    document.getElementById('btn-admin-announce')?.addEventListener('click', async () => { if(auth.currentUser.uid !== ADMIN_UID) return; const msg = document.getElementById('admin-announcement-input').value; await setDoc(doc(db, "settings", "system"), { announcement: msg }, { merge: true }); customAlert(msg === "" ? "Annonce retirée." : "Annonce publiée à tous les utilisateurs !", "Annonce"); });
    document.getElementById('btn-admin-bypass')?.addEventListener('click', () => { screenMaintenance.style.display = 'none'; screenAuth.style.display = 'flex'; });

    onAuthStateChanged(auth, async (user) => { currentUserObj = user; if (user) { await updateDoc(doc(db, "users", user.uid), { lastLogin: Date.now() }).catch(e=>{}); } renderAppState(); });

    async function renderAppState() {
        if (isMaintenance && (!currentUserObj || currentUserObj.uid !== ADMIN_UID)) { screenMaintenance.style.display = 'flex'; screenAuth.style.display = 'none'; screenSetup.style.display = 'none'; screenApp.style.display = 'none'; if (currentUserObj) await signOut(auth); return; }
        screenMaintenance.style.display = 'none';
        if (currentUserObj) {
            if(currentUserObj.uid === ADMIN_UID) document.getElementById('nav-admin').style.display = 'flex';
            if (!isDataLoaded) { 
                const userDoc = await getDoc(doc(db, "users", currentUserObj.uid));
                if (userDoc.exists() && userDoc.data().budgetId) { 
                    CURRENT_BUDGET_ID = userDoc.data().budgetId; screenAuth.style.display = 'none'; screenSetup.style.display = 'none'; 
                    loadBudgetData(); 
                    
                    // Tutoriel Onboarding pour les nouveaux
                    if(!userDoc.data().onboardingDone) {
                        document.getElementById('modal-onboarding').style.display = 'flex';
                    }
                } 
                else { screenAuth.style.display = 'none'; screenApp.style.display = 'none'; screenSetup.style.display = 'flex'; }
            }
        } else {
            screenAuth.style.display = 'flex'; screenApp.style.display = 'none'; screenSetup.style.display = 'none'; 
            unsubscribers.forEach(u => u()); unsubscribers = []; CURRENT_BUDGET_ID = null; isDataLoaded = false; 
        }
    }

    document.getElementById('btn-finish-onboarding')?.addEventListener('click', async () => {
        document.getElementById('modal-onboarding').style.display = 'none';
        if(currentUserObj) await updateDoc(doc(db, "users", currentUserObj.uid), { onboardingDone: true });
    });

    document.getElementById('toggle-password')?.addEventListener('click', (e) => { const pwdInput = document.getElementById('auth-password'); if (pwdInput.type === 'password') { pwdInput.type = 'text'; e.target.innerText = '🙈'; } else { pwdInput.type = 'password'; e.target.innerText = '👁️'; } });
    document.getElementById('auth-forgot-pwd')?.addEventListener('click', async () => { const email = document.getElementById('auth-email').value; if(!email) return customAlert("Veuillez saisir votre adresse email dans le champ ci-dessus puis cliquer ici.", "Oups !"); try { await sendPasswordResetEmail(auth, email); customAlert("Un email de réinitialisation vous a été envoyé !", "Email envoyé"); } catch(e) { customAlert("Erreur : Adresse email introuvable ou invalide.", "Erreur"); } });
    document.getElementById('login-form')?.addEventListener('submit', async (e) => { e.preventDefault(); const email = document.getElementById('auth-email').value; const pwd = document.getElementById('auth-password').value; const isLoginMode = document.getElementById('auth-title').innerText === "Connexion"; try { if(isLoginMode) { await signInWithEmailAndPassword(auth, email, pwd); } else { const cred = await createUserWithEmailAndPassword(auth, email, pwd); await setDoc(doc(db, "users", cred.user.uid), { email: email, budgetId: null, createdAt: Date.now(), onboardingDone: false }); } } catch(err) { document.getElementById('auth-error').style.display = 'block'; document.getElementById('auth-error').innerText = "Erreur: Identifiants invalides."; } });

    // --- NAVIGATION ---
    function switchView(viewElement, navId, bnavId) {
        viewDashboard.style.display = 'none'; viewBudget.style.display = 'none'; viewProfile.style.display = 'none'; viewCalendar.style.display = 'none'; if(viewAdmin) viewAdmin.style.display = 'none'; viewSubs.style.display = 'none'; 
        document.querySelectorAll('.nav-item, .bottom-nav-item').forEach(el => el.classList.remove('active'));
        viewElement.style.display = 'block';
        if(document.getElementById(navId)) document.getElementById(navId).classList.add('active');
        if(document.getElementById(bnavId)) document.getElementById(bnavId).classList.add('active');
        window.scrollTo(0,0);
        if (window.innerWidth <= 850) { sidebar.classList.remove('mobile-open'); if (mobileOverlay) mobileOverlay.classList.remove('active'); }
    }

    toggleBtn?.addEventListener('click', () => { if (window.innerWidth <= 850) { sidebar.classList.toggle('mobile-open'); if (mobileOverlay) mobileOverlay.classList.toggle('active'); } else { sidebar.classList.toggle('collapsed'); mainContent.classList.toggle('expanded'); } });
    mobileOverlay?.addEventListener('click', () => { sidebar.classList.remove('mobile-open'); mobileOverlay.classList.remove('active'); });

    document.getElementById('nav-dashboard')?.addEventListener('click', () => { switchView(viewDashboard, 'nav-dashboard', 'bnav-dashboard'); document.getElementById('fab-add-expense').style.display='flex'; });
    document.getElementById('nav-budget')?.addEventListener('click', () => { switchView(viewBudget, 'nav-budget', 'bnav-budget'); document.getElementById('fab-add-expense').style.display='none'; renderAnnualChart(); });
    document.getElementById('nav-profile')?.addEventListener('click', () => { switchView(viewProfile, 'nav-profile', 'bnav-profile'); document.getElementById('fab-add-expense').style.display='none';});
    document.getElementById('nav-calendar')?.addEventListener('click', () => { switchView(viewCalendar, 'nav-calendar', 'bnav-calendar'); document.getElementById('fab-add-expense').style.display='none'; renderCalendar(); });
    document.getElementById('nav-subs')?.addEventListener('click', () => { switchView(viewSubs, 'nav-subs', 'bnav-subs'); document.getElementById('fab-add-expense').style.display='none'; renderSubs(); });
    document.getElementById('nav-admin')?.addEventListener('click', () => { switchView(viewAdmin, 'nav-admin', null); document.getElementById('fab-add-expense').style.display='none'; loadAdminData(); });
    
    document.getElementById('bnav-dashboard')?.addEventListener('click', () => { switchView(viewDashboard, 'nav-dashboard', 'bnav-dashboard'); document.getElementById('fab-add-expense').style.display='flex'; });
    document.getElementById('bnav-budget')?.addEventListener('click', () => { switchView(viewBudget, 'nav-budget', 'bnav-budget'); document.getElementById('fab-add-expense').style.display='none'; renderAnnualChart(); });
    document.getElementById('bnav-profile')?.addEventListener('click', () => { switchView(viewProfile, 'nav-profile', 'bnav-profile'); document.getElementById('fab-add-expense').style.display='none';});
    document.getElementById('bnav-calendar')?.addEventListener('click', () => { switchView(viewCalendar, 'nav-calendar', 'bnav-calendar'); document.getElementById('fab-add-expense').style.display='none'; renderCalendar(); });
    document.getElementById('bnav-subs')?.addEventListener('click', () => { switchView(viewSubs, 'nav-subs', 'bnav-subs'); document.getElementById('fab-add-expense').style.display='none'; renderSubs(); });

    document.getElementById('btn-open-feedback')?.addEventListener('click', () => { document.getElementById('modal-feedback').style.display = 'flex'; if (window.innerWidth <= 850) { sidebar.classList.remove('mobile-open'); mobileOverlay.classList.remove('active'); } });
    document.getElementById('btn-open-feedback-page')?.addEventListener('click', () => { document.getElementById('modal-feedback').style.display = 'flex'; });
    document.getElementById('btn-close-feedback')?.addEventListener('click', () => { document.getElementById('modal-feedback').style.display = 'none'; });
    document.getElementById('feedback-form')?.addEventListener('submit', async(e) => { e.preventDefault(); await addDoc(collection(db, "feedbacks"), { text: document.getElementById('feedback-text').value, user: auth.currentUser.email, date: Date.now() }); document.getElementById('feedback-form').reset(); document.getElementById('modal-feedback').style.display = 'none'; customAlert("Merci pour votre retour !", "Message envoyé"); });

    document.getElementById('fab-add-expense')?.addEventListener('click', () => { 
        document.getElementById('expense-date').value = new Date().toISOString().split('T')[0]; 
        receiptFile = null; document.getElementById('receipt-preview').innerText = "";
        document.getElementById('modal-expense').style.display = 'flex'; 
    });
    document.getElementById('btn-close-expense-modal')?.addEventListener('click', () => { 
        document.getElementById('modal-expense').style.display = 'none'; 
        editingExpenseId = null; 
        document.getElementById('expense-form').reset();
        receiptFile = null; document.getElementById('receipt-preview').innerText = "";
        document.getElementById('form-expense-title').innerText = "✨ Nouvelle Opération";
        document.getElementById('btn-submit-expense').innerText = "Ajouter";
    });
    
    function fireConfetti() {
        const colors = ['#D4A373', '#CCD5AE', '#E07A5F', '#81B29A', '#F2CC8F'];
        for(let i=0; i<60; i++) {
            const conf = document.createElement('div'); conf.style.position = 'fixed'; conf.style.zIndex = '9999'; conf.style.width = '12px'; conf.style.height = '12px'; conf.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)]; conf.style.left = Math.random() * 100 + 'vw'; conf.style.top = '-10px'; conf.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px'; document.body.appendChild(conf);
            const anim = conf.animate([{ transform: `translate3d(0,0,0) rotate(0deg)`, opacity: 1 }, { transform: `translate3d(${Math.random()*300 - 150}px, 100vh, 0) rotate(${Math.random()*720}deg)`, opacity: 0 }], { duration: Math.random() * 2000 + 2500, easing: 'cubic-bezier(.37,0,.63,1)' });
            anim.onfinish = () => conf.remove();
        }
    }

    function checkReminders() {
        if(reminderPopupShown) return; const todayTime = new Date().setHours(0,0,0,0); let upcoming = [];
        eventsData.forEach(ev => { if (ev.reminder > 0) { const evTime = new Date(ev.dateStart || ev.date).setHours(0,0,0,0); const diffDays = (evTime - todayTime) / (1000 * 3600 * 24); if (diffDays >= 0 && diffDays <= ev.reminder) upcoming.push({ ...ev, diffDays }); } });
        if (upcoming.length > 0) {
            const list = document.getElementById('reminder-list'); list.innerHTML = '';
            upcoming.forEach(ev => { const dayText = ev.diffDays === 0 ? "<b>Aujourd'hui</b>" : `dans ${ev.diffDays} jour(s)`; list.innerHTML += `<li style="margin-bottom:10px; padding:15px; background:var(--bg); border-radius:12px; border-left: 5px solid ${ev.important ? 'var(--danger)' : 'var(--primary)'};"><strong style="font-size:1.1em; color:var(--text);">${ev.title}</strong><br><span style="font-size:0.9em; color:var(--text); opacity:0.7; font-weight:600;">Prévu ${dayText} (${new Date(ev.dateStart || ev.date).toLocaleDateString('fr-FR')})</span></li>`; });
            document.getElementById('reminder-popup').style.display = 'flex'; reminderPopupShown = true;
        }
    }

    document.getElementById('cal-prev')?.addEventListener('click', () => { calMonth--; if(calMonth < 0) { calMonth = 11; calYear--; } renderCalendar(); });
    document.getElementById('cal-next')?.addEventListener('click', () => { calMonth++; if(calMonth > 11) { calMonth = 0; calYear++; } renderCalendar(); });
    document.getElementById('cal-show-expenses')?.addEventListener('change', renderCalendar);

    function renderCalendar() {
        const grid = document.getElementById('calendar-grid'); const monthDisplay = document.getElementById('cal-month-display'); if(!grid) return;
        const monthNames = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
        monthDisplay.innerText = `${monthNames[calMonth]} ${calYear}`; grid.innerHTML = '';
        let firstDay = new Date(calYear, calMonth, 1).getDay(); if(firstDay === 0) firstDay = 7; const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();

        for (let i = 1; i < firstDay; i++) { grid.innerHTML += `<div class="calendar-day empty"></div>`; }
        const showExpenses = document.getElementById('cal-show-expenses').checked; const todayStr = new Date().toLocaleDateString('fr-FR');

        for (let day = 1; day <= daysInMonth; day++) {
            const dateStrFR = `${String(day).padStart(2, '0')}/${String(calMonth+1).padStart(2, '0')}/${calYear}`;
            const dateStrISO = `${calYear}-${String(calMonth+1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            let cellHTML = `<div class="calendar-day ${dateStrFR === todayStr ? 'today' : ''}"><div class="day-num">${day}</div>`;
            const currentCellTime = new Date(dateStrISO).getTime();
            eventsData.forEach(ev => { 
                const evStart = new Date(ev.dateStart || ev.date).getTime(); const evEnd = new Date(ev.dateEnd || ev.date).getTime();
                if (currentCellTime >= evStart && currentCellTime <= evEnd) { 
                    let badgeClass = 'badge-perso'; if(ev.type.toLowerCase().includes('pro') || ev.type.toLowerCase().includes('travail')) badgeClass = 'badge-pro';
                    let timePrefix = ""; if(ev.timeStart && currentCellTime === evStart) { timePrefix = `🕒 ${ev.timeStart} - `; }
                    cellHTML += `<div class="badge ${badgeClass} ${ev.important ? 'badge-important' : ''} delete-ev" data-id="${ev.id}" title="${ev.type} - ${ev.title}">${ev.important ? '⚠️ ' : ''}${timePrefix}${ev.title}</div>`; 
                } 
            });
            if (showExpenses) { expenses.forEach(ex => { if (ex.date === dateStrFR) { cellHTML += `<div class="badge ${ex.type === 'income' ? 'badge-inc' : 'badge-exp'}" title="${ex.desc} (${ex.amount}€)">${ex.type === 'income' ? '+' : '-'}${ex.amount}€ <small>${ex.desc.substring(0,8)}</small></div>`; } }); }
            cellHTML += `</div>`; grid.innerHTML += cellHTML;
        }
    }
    
    document.getElementById('event-form')?.addEventListener('submit', async (e) => { 
        e.preventDefault(); const dStart = document.getElementById('ev-date-start').value; const dEnd = document.getElementById('ev-date-end').value;
        if(new Date(dEnd) < new Date(dStart)) return customAlert("La date de fin ne peut pas être avant la date de début.", "Erreur de saisie");
        await addDoc(collection(db, `budgets/${CURRENT_BUDGET_ID}/events`), { dateStart: dStart, timeStart: document.getElementById('ev-time-start').value || "", dateEnd: dEnd, timeEnd: document.getElementById('ev-time-end').value || "", title: document.getElementById('ev-title').value, type: document.getElementById('ev-type').value, important: document.getElementById('ev-important').checked, reminder: parseInt(document.getElementById('ev-reminder').value) }); 
        e.target.reset(); customAlert("Événement ajouté au calendrier !", "Succès"); 
    });

    // --- FILTRES RAPIDES ---
    document.querySelectorAll('.qf-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.qf-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            currentQuickFilter = e.target.dataset.filter;
            updateUI();
        });
    });

    // --- GESTION DU TRI DU TABLEAU ---
    document.querySelectorAll('th.sortable').forEach(th => {
        th.addEventListener('click', () => {
            const col = th.dataset.sort;
            if(sortCol === col) sortAsc = !sortAsc;
            else { sortCol = col; sortAsc = true; }
            updateUI();
        });
    });

    function updateUI() {
        const list = document.getElementById('expense-list'); if(!list) return;
        list.innerHTML = ""; 
        const m = parseInt(document.getElementById('filter-month').value); 
        const y = parseInt(document.getElementById('filter-year').value);
        
        let globalRev = 0, globalDep = 0, catSums = {}; 
        let memberStats = {}; members.forEach(mbr => memberStats[mbr.id] = { name: mbr.name, rev: 0, dep: 0 });

        const monthlyExpenses = expenses.filter(e => new Date(e.timestamp).getMonth() === m && new Date(e.timestamp).getFullYear() === y);
        
        monthlyExpenses.forEach(e => {
            const isInc = e.type === 'income'; 
            let currentPayerId = e.payerId || (members.find(mbr => mbr.name === e.payer)?.id) || 'inconnu';
            if(!memberStats[currentPayerId]) memberStats[currentPayerId] = { name: e.payer || "Ancien Profil", rev: 0, dep: 0 };
            
            if(isInc) { 
                globalRev += e.amount; 
                memberStats[currentPayerId].rev += e.amount; 
            } else { 
                globalDep += e.amount; 
                memberStats[currentPayerId].dep += e.amount; 
                catSums[e.category] = (catSums[e.category] || 0) + e.amount; 
            }
        });

        const monthKey = `${y}-${String(m+1).padStart(2, '0')}`;
        const carryOver = monthlySettings.find(s => s.id === monthKey)?.carryOver || 0;
        globalRev += carryOver; 
        document.getElementById('carryover-amount').innerText = carryOver.toFixed(2) + ' €';

        // 🤖 LOGIQUE DU MINI-COACH
        let coachMsg = "Tout va bien pour le moment ! 😊";
        const envCats = customCategories.filter(c => c.limit && c.limit > 0);
        if(envCats.length > 0) {
            let maxEnvP = 0; let maxEnvName = "";
            envCats.forEach(cat => {
                const sp = catSums[`${cat.emoji} ${cat.name}`] || 0;
                const p = (sp / cat.limit) * 100;
                if(p > maxEnvP) { maxEnvP = p; maxEnvName = cat.name; }
            });
            if(maxEnvP >= 100) coachMsg = `⚠️ Attention, l'enveloppe "${maxEnvName}" est dépassée !`;
            else if(maxEnvP >= 80) coachMsg = `🔔 L'enveloppe "${maxEnvName}" est presque vide (${maxEnvP.toFixed(0)}%).`;
            else if(globalDep > globalRev && globalRev > 0) coachMsg = `📉 Vous avez dépensé plus que vos revenus ce mois-ci.`;
            else if(globalDep === 0) coachMsg = `✨ Nouveau mois, nouvelles économies ! C'est parti.`;
        }
        document.getElementById('coach-msg').innerText = coachMsg;

        // Application du Filtre Rapide + Recherche Texte
        let filteredExpenses = monthlyExpenses;
        
        if (currentQuickFilter !== 'all') {
            if(currentQuickFilter === 'income') filteredExpenses = filteredExpenses.filter(e => e.type === 'income');
            else if(currentQuickFilter === 'me') filteredExpenses = filteredExpenses.filter(e => e.payerId === auth.currentUser.uid);
            else if(currentQuickFilter === 'partner') filteredExpenses = filteredExpenses.filter(e => e.payerId !== auth.currentUser.uid && e.type !== 'income');
        }

        let searchSum = 0;
        if (currentSearch !== "") {
            filteredExpenses = filteredExpenses.filter(e => e.desc.toLowerCase().includes(currentSearch) || e.category.toLowerCase().includes(currentSearch));
        }

        // Toujours afficher le résumé si on filtre d'une manière ou d'une autre
        if (currentSearch !== "" || currentQuickFilter !== 'all') {
            filteredExpenses.forEach(e => { if(e.type === 'income') searchSum += e.amount; else searchSum -= e.amount; });
            document.getElementById('search-summary').style.display = 'block';
            document.getElementById('search-summary-amount').innerText = (searchSum > 0 ? '+' : '') + searchSum.toFixed(2) + ' €';
        } else {
            document.getElementById('search-summary').style.display = 'none';
        }

        // Tri
        filteredExpenses.sort((a, b) => {
            let valA, valB;
            if(sortCol === 'date') { valA = a.timestamp; valB = b.timestamp; }
            else if(sortCol === 'amount') { valA = (a.type==='income'?a.amount:-a.amount); valB = (b.type==='income'?b.amount:-b.amount); }
            else if(sortCol === 'payer') { valA = members.find(mbr => mbr.id === a.payerId)?.name || a.payer || ""; valB = members.find(mbr => mbr.id === b.payerId)?.name || b.payer || ""; }
            else { valA = a[sortCol]?.toLowerCase(); valB = b[sortCol]?.toLowerCase(); }

            if(valA < valB) return sortAsc ? -1 : 1;
            if(valA > valB) return sortAsc ? 1 : -1;
            return 0;
        });

        document.querySelectorAll('th.sortable span').forEach(el => el.innerText = '');
        const currentIcon = document.getElementById(`sort-icon-${sortCol}`);
        if(currentIcon) currentIcon.innerText = sortAsc ? ' ⬆️' : ' ⬇️';

        if(filteredExpenses.length === 0) {
            list.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:40px; color:var(--text); opacity:0.5; font-size:1.1em; font-weight:700;">📭 Aucune opération trouvée pour cette sélection.</td></tr>`;
        } else {
            filteredExpenses.forEach(e => {
                const isInc = e.type === 'income'; 
                let currentPayerId = e.payerId || (members.find(mbr => mbr.name === e.payer)?.id) || 'inconnu';
                const tr = document.createElement('tr'); 
                
                // Intégration de l'icône photo si un reçu est attaché
                let receiptIcon = e.receiptUrl ? `<a href="${e.receiptUrl}" target="_blank" title="Voir le justificatif" style="text-decoration:none; margin-left:5px; font-size:1.2em;">📎</a>` : '';

                tr.innerHTML = `<td>${e.date}</td><td>${e.desc} ${receiptIcon}</td><td><small style="background:var(--bg); padding:6px 10px; border-radius:12px; font-weight:700;">${e.category}</small></td><td><strong>${memberStats[currentPayerId]?.name || e.payer}</strong></td><td style="color:${isInc?'var(--success)':'var(--danger)'}; font-weight:800; font-size:1.1em;">${isInc?'+':'-'}${e.amount.toFixed(2)}€</td>
                <td style="white-space:nowrap;">
                    <button class="duplicate-exp btn-small" data-id="${e.id}" style="padding:6px; border:none; background:none; font-size:1.2em;" title="Dupliquer">📋</button>
                    <button class="edit-exp btn-small" data-id="${e.id}" style="padding:6px; border:none; background:none; font-size:1.2em;" title="Modifier">✏️</button>
                    <button class="delete-exp btn-small" data-id="${e.id}" style="padding:6px; border:none; background:none; font-size:1.2em;" title="Supprimer">🗑️</button>
                </td>`; 
                list.appendChild(tr);
            });
        }

        document.getElementById('total-revenus').innerText = globalRev.toFixed(2) + ' €'; 
        document.getElementById('total-depenses').innerText = globalDep.toFixed(2) + ' €';
        document.getElementById('solde-actuel').innerText = (globalRev - globalDep).toFixed(2) + ' €'; 
        document.getElementById('solde-actuel').style.color = (globalRev - globalDep) >= 0 ? 'var(--success)' : 'var(--danger)';

        const propContainer = document.getElementById('proportional-container');
        if(propContainer) {
            propContainer.innerHTML = ''; 
            Object.values(memberStats).forEach(stat => {
                if(stat.rev === 0 && stat.dep === 0) return; 
                const pct = stat.rev > 0 ? Math.min((stat.dep / stat.rev) * 100, 100) : (stat.dep > 0 ? 100 : 0);
                propContainer.innerHTML += `
                <div style="margin-top:10px;">
                    <div style="display:flex; justify-content:space-between; color:var(--text); font-weight:700; font-size:0.9em; margin-bottom:5px;">
                        <strong>${stat.name}</strong> 
                        <span>${pct.toFixed(1)}%</span>
                    </div>
                    <div style="font-size:0.75em; color:var(--text); opacity:0.6; text-align:right; margin-top:-5px; margin-bottom:2px;">Dépensé: ${stat.dep.toFixed(0)}€ / Gagné: ${stat.rev.toFixed(0)}€</div>
                    <div class="progress-bar" style="height:12px; margin-top:0;"><div class="progress-fill ${pct > 80 ? 'red' : (pct > 50 ? 'orange' : 'green')}" style="width:${pct}%"></div></div>
                </div>`;
            });
        }
        const ctx = document.getElementById('expenseChart')?.getContext('2d');
        if (ctx) { if (myChart) myChart.destroy(); myChart = new Chart(ctx, { type: 'doughnut', data: { labels: Object.keys(catSums), datasets: [{ data: Object.values(catSums), backgroundColor: ['#D4A373', '#CCD5AE', '#E07A5F', '#81B29A', '#F2CC8F'], borderWidth: 0 }] }, options: { plugins: { legend: { display: false } }, cutout: '75%' } }); }
        
        renderEnvelopes(catSums); 
        renderAnnualChart(); 
        renderCalendar(); 
        renderSubs();
    }

    function renderMembers() { const sel = document.getElementById('payer'); if(sel) { sel.innerHTML = ''; members.forEach(m => sel.appendChild(new Option(m.name, m.id))); if(auth.currentUser) sel.value = auth.currentUser.uid; } }
    
    function renderCategories() { 
        const sel = document.getElementById('category'); const sSel = document.getElementById('sub-category'); const list = document.getElementById('category-manage-list'); 
        if(sel) { sel.innerHTML = '<option value="">-- Choisir une catégorie --</option>'; sSel.innerHTML = sel.innerHTML; customCategories.forEach(c => { const opt = new Option(`${c.emoji} ${c.name}`, `${c.emoji} ${c.name}`); sel.appendChild(opt); sSel.appendChild(opt.cloneNode(true)); }); } 
        if(list) { 
            list.innerHTML = ""; customCategories.forEach(c => { 
                const li = document.createElement('li'); li.style = "display:flex; justify-content:space-between; align-items:center; padding:12px; background:var(--card-bg); border-radius:12px; margin-bottom:8px; border:1px solid var(--border);"; 
                li.innerHTML = `<span style="font-weight:700;">${c.emoji} ${c.name} ${c.limit ? `<small style="color:var(--danger); opacity:0.8;">(Max ${c.limit}€)</small>` : ''}</span> 
                <div style="display:flex; gap:8px;">
                    <button class="edit-cat btn-small" data-id="${c.id}" style="padding:6px 12px !important; background:var(--secondary); color:var(--text); border:none;">✏️</button>
                    <button class="delete-cat btn-small" data-id="${c.id}" style="padding:6px 12px !important; background:var(--danger); color:white; border:none;">✕</button>
                </div>`; 
                list.appendChild(li); 
            }); 
        } 
    }
    
    // 🏆 GESTION DES OBJECTIFS ET DU MUR DES TROPHÉES
    function renderGoals() { 
        const cont = document.getElementById('goals-container'); 
        const tropCont = document.getElementById('trophies-container');
        const sel = document.getElementById('goal-selector'); 
        if(!cont || !sel || !tropCont) return; 
        
        cont.innerHTML = ""; tropCont.innerHTML = "";
        sel.innerHTML = '<option value="">-- Lier à un objectif --</option>'; 
        
        let hasTrophies = false;

        goals.forEach(g => { 
            const p = Math.min((g.current / g.target) * 100, 100); 
            
            if(g.archived) {
                // Affichage Trophée
                hasTrophies = true;
                const tCard = document.createElement('div'); tCard.className = 'trophy-card';
                tCard.innerHTML = `<div class="trophy-icon">🏆</div><h3 style="margin:0; font-size:1.2em;">${g.name}</h3><p style="margin:5px 0 0 0; font-weight:800; opacity:0.9;">${g.target}€ atteint !</p>`;
                tropCont.appendChild(tCard);
            } else {
                // Affichage Objectif en cours
                const card = document.createElement('div'); card.className = 'card'; 
                
                let archiveBtnHtml = "";
                if(p >= 100) {
                    archiveBtnHtml = `<button class="archive-goal btn-small" data-id="${g.id}" style="width:100% !important; margin-top:15px !important; background:var(--success); color:white; border:none;">Clôturer et Archiver 🏆</button>`;
                }

                card.innerHTML = `<h3>🎯 ${g.name}</h3><p style="font-weight:700; font-size:1.1em; opacity:0.8;">${g.current.toFixed(0)}€ <small>/ ${g.target}€</small></p><div class="progress-bar"><div class="progress-fill green" style="width:${p}%"></div></div> ${archiveBtnHtml}`; 
                cont.appendChild(card); 
                sel.appendChild(new Option(g.name, g.id)); 
            }
        }); 

        if(!hasTrophies) {
            tropCont.innerHTML = '<p style="color:var(--text); opacity:0.6; font-weight:700;">Aucun objectif terminé pour le moment. Accrochez-vous ! 💪</p>';
        }
    }
    
    function renderEnvelopes(catSums) { const envContent = document.getElementById('envelopes-section-content'); if(!envContent) return; envContent.innerHTML = ''; const envelopeCats = customCategories.filter(c => c.limit && c.limit > 0); if (envelopeCats.length === 0) { envContent.innerHTML = '<p style="text-align:center; padding:20px; color:var(--text); opacity:0.6; font-weight:700;">✉️ Aucune enveloppe configurée avec une limite mensuelle.</p>'; return; } const gridDiv = document.createElement('div'); gridDiv.style.display = 'grid'; gridDiv.style.gridTemplateColumns = 'repeat(auto-fit, minmax(220px, 1fr))'; gridDiv.style.gap = '20px'; envelopeCats.forEach(cat => { const spent = catSums[`${cat.emoji} ${cat.name}`] || 0; const p = Math.min((spent / cat.limit) * 100, 100); const envDiv = document.createElement('div'); envDiv.style.background = 'var(--bg)'; envDiv.style.padding = '20px'; envDiv.style.borderRadius = '20px'; envDiv.innerHTML = `<h4 style="margin:0 0 10px 0; font-size:1.1em; color:var(--text);">${cat.emoji} ${cat.name}</h4><div style="display:flex; justify-content:space-between; font-size:1em; margin-bottom:8px;"><span style="font-weight:800;">${spent.toFixed(2)}€</span><span style="color:var(--text); opacity:0.6; font-weight:700;">/ ${cat.limit}€</span></div><div class="progress-bar" style="margin-top:0;"><div class="progress-fill ${p > 90 ? 'red' : (p > 70 ? 'orange' : 'green')}" style="width:${p}%"></div></div>`; gridDiv.appendChild(envDiv); }); envContent.appendChild(gridDiv); }
    
    function renderAnnualChart() { const ctx = document.getElementById('annualChart')?.getContext('2d'); if(!ctx) return; const monthlyData = new Array(12).fill(0).map(() => ({ inc: 0, exp: 0 })); expenses.filter(e => new Date(e.timestamp).getFullYear() === parseInt(document.getElementById('filter-year').value)).forEach(e => { const m = new Date(e.timestamp).getMonth(); if(e.type === 'income') monthlyData[m].inc += e.amount; else monthlyData[m].exp += e.amount; }); if(myAnnualChart) myAnnualChart.destroy(); 
    const isDark = document.body.classList.contains('theme-dark'); const chartColors = isDark ? {inc: '#81B29A', exp: '#E07A5F', text: '#EAE4D9'} : {inc: '#81B29A', exp: '#E07A5F', text: '#5C5346'};
    myAnnualChart = new Chart(ctx, { type: 'bar', data: { labels: ['Jan','Fév','Mar','Avr','Mai','Juin','Juil','Août','Sep','Oct','Nov','Déc'], datasets: [{ label: 'Revenus', data: monthlyData.map(d => d.inc), backgroundColor: chartColors.inc, borderRadius: 6 }, { label: 'Dépenses', data: monthlyData.map(d => d.exp), backgroundColor: chartColors.exp, borderRadius: 6 }] }, options: { responsive: true, maintainAspectRatio: false, scales: { x: { ticks: { color: chartColors.text } }, y: { ticks: { color: chartColors.text } } }, plugins: { legend: { labels: { color: chartColors.text, font: {family: 'Nunito', weight: 'bold'} } } } } }); }

    // --- FRAIS FIXES ---
    document.getElementById('sub-form')?.addEventListener('submit', async (e) => { e.preventDefault(); await addDoc(collection(db, `budgets/${CURRENT_BUDGET_ID}/subscriptions`), { name: document.getElementById('sub-name').value, amount: parseFloat(document.getElementById('sub-amount').value), category: document.getElementById('sub-category').value, day: parseInt(document.getElementById('sub-day').value) }); e.target.reset(); customAlert("Abonnement enregistré avec succès !", "C'est noté"); });
    function renderSubs() { 
        const list = document.getElementById('subs-list'); const totLabel = document.getElementById('total-subs-amount'); if(!list || !totLabel) return; 
        list.innerHTML = ""; let total = 0; 
        if(subsData.length === 0) { list.innerHTML = '<li style="text-align:center; padding:30px; color:var(--text); opacity:0.5; font-weight:700;">📭 Aucun frais fixe configuré.</li>'; totLabel.innerText = "0.00 €"; return; }
        subsData.sort((a,b) => a.day - b.day).forEach(sub => { 
            total += sub.amount; const li = document.createElement('li'); li.style = "display:flex; justify-content:space-between; align-items:center; padding:15px; background:var(--bg); border-radius:16px; margin-bottom:12px;"; 
            li.innerHTML = `<div style="flex:1;"><strong style="font-size:1.1em;">${sub.name}</strong><br><small style="color:var(--text); opacity:0.7; font-weight:600;">Le ${sub.day} du mois - ${sub.category}</small></div><div style="font-weight:800; font-size:1.1em; color:var(--danger); margin-right:15px;">-${sub.amount.toFixed(2)}€</div><div style="display:flex; gap:8px;"><button class="pay-sub btn-small" data-name="${sub.name}" data-amount="${sub.amount}" data-cat="${sub.category}" style="background:var(--success); color:white; border:none;">Payer</button><button class="delete-sub btn-small" data-id="${sub.id}" style="background:var(--danger); color:white; border:none; padding:10px 15px !important;">✕</button></div>`; 
            list.appendChild(li); 
        }); 
        totLabel.innerText = total.toFixed(2) + " €"; 
    }

    // --- CHARGEMENT DATA FIREBASE ---
    function loadBudgetData() {
        if(isDataLoaded) return; isDataLoaded = true; screenApp.style.display = 'block'; document.getElementById('fab-add-expense').style.display='flex';
        getDoc(doc(db, "budgets", CURRENT_BUDGET_ID)).then(d => { if(d.exists()) document.getElementById('display-invite-code').innerText = d.data().code; });
        unsubscribers.push(onSnapshot(collection(db, `budgets/${CURRENT_BUDGET_ID}/members`), s => { members = []; s.forEach(doc => members.push({ id: doc.id, ...doc.data() })); const me = members.find(mbr => mbr.id === auth.currentUser.uid); if(me && document.getElementById('admin-pseudo')) document.getElementById('admin-pseudo').value = me.name; renderMembers(); updateUI(); }));
        unsubscribers.push(onSnapshot(collection(db, `budgets/${CURRENT_BUDGET_ID}/expenses`), s => { expenses = []; s.forEach(doc => expenses.push({ id: doc.id, ...doc.data() })); updateUI(); }));
        unsubscribers.push(onSnapshot(collection(db, `budgets/${CURRENT_BUDGET_ID}/categories`), s => { customCategories = []; s.forEach(doc => customCategories.push({ id: doc.id, ...doc.data() })); renderCategories(); updateUI(); }));
        unsubscribers.push(onSnapshot(collection(db, `budgets/${CURRENT_BUDGET_ID}/goals`), s => { goals = []; s.forEach(doc => goals.push({ id: doc.id, ...doc.data() })); renderGoals(); }));
        unsubscribers.push(onSnapshot(collection(db, `budgets/${CURRENT_BUDGET_ID}/events`), s => { eventsData = []; s.forEach(doc => eventsData.push({ id: doc.id, ...doc.data() })); renderCalendar(); checkReminders(); }));
        unsubscribers.push(onSnapshot(collection(db, `budgets/${CURRENT_BUDGET_ID}/subscriptions`), s => { subsData = []; s.forEach(doc => subsData.push({ id: doc.id, ...doc.data() })); renderSubs(); }));
        unsubscribers.push(onSnapshot(collection(db, `budgets/${CURRENT_BUDGET_ID}/monthly_settings`), s => { monthlySettings = []; s.forEach(doc => monthlySettings.push({ id: doc.id, ...doc.data() })); updateUI(); }));
    }

    // --- LOGIQUE ADMINISTRATION ---
    async function loadAdminData() {
        if(auth.currentUser.uid !== ADMIN_UID) return; 
        const now = Date.now(); const sevenDaysAgo = now - (7 * 24 * 60 * 60 * 1000); let activeCount = 0;
        const usersSnap = await getDocs(collection(db, "users")); document.getElementById('admin-tot-users').innerText = usersSnap.size; const uList = document.getElementById('admin-user-list'); uList.innerHTML = '';
        usersSnap.forEach(docSnap => { const u = docSnap.data(); if(u.lastLogin && u.lastLogin > sevenDaysAgo) activeCount++; const dateLog = u.lastLogin ? new Date(u.lastLogin).toLocaleDateString() : 'Jamais'; uList.innerHTML += `<tr><td>${u.email || 'Ancien compte'}</td><td><small>${dateLog}</small></td><td>${u.budgetId || '<i>Aucun</i>'}</td><td><button class="delete-user-data btn-small" data-uid="${docSnap.id}" style="background:var(--danger); color:white; border:none; padding:8px 12px !important;">Purger</button></td></tr>`; });
        document.getElementById('admin-active-users').innerText = activeCount;
        const budgetsSnap = await getDocs(collection(db, "budgets")); document.getElementById('admin-tot-budgets').innerText = budgetsSnap.size; const bList = document.getElementById('admin-budget-list'); bList.innerHTML = '';
        budgetsSnap.forEach(docSnap => { const b = docSnap.data(); bList.innerHTML += `<tr><td style="font-weight:800; color:var(--primary);">${b.code}</td><td><small>${b.owner}</small></td><td><button class="delete-budget-data btn-small" data-bid="${docSnap.id}" style="background:var(--danger); color:white; border:none; padding:8px 12px !important;">Détruire</button></td></tr>`; });
        const fbSnap = await getDocs(collection(db, "feedbacks")); const fList = document.getElementById('admin-feedback-list'); fList.innerHTML = '';
        fbSnap.forEach(docSnap => { const f = docSnap.data(); const d = new Date(f.date).toLocaleDateString(); fList.innerHTML += `<tr><td>${d}</td><td>${f.user}</td><td>${f.text}</td><td><button class="delete-feedback btn-small" data-id="${docSnap.id}" style="border:none; background:var(--danger); color:white; padding:8px 12px !important;">🗑️</button></td></tr>`; });
    }

    document.getElementById('btn-ghost-mode')?.addEventListener('click', async () => { const target = document.getElementById('admin-ghost-id').value; if(target && target.trim() !== "") { unsubscribers.forEach(u => u()); unsubscribers = []; isDataLoaded = false; CURRENT_BUDGET_ID = target.trim(); loadBudgetData(); await customAlert("Mode fantôme activé ! Vous voyez le budget : " + CURRENT_BUDGET_ID); document.getElementById('nav-dashboard').click(); } });
    document.getElementById('search-admin-users')?.addEventListener('input', (e) => { const term = e.target.value.toLowerCase(); document.querySelectorAll('#admin-user-list tr').forEach(row => { row.style.display = row.innerText.toLowerCase().includes(term) ? '' : 'none'; }); });
    document.getElementById('search-admin-budgets')?.addEventListener('input', (e) => { const term = e.target.value.toLowerCase(); document.querySelectorAll('#admin-budget-list tr').forEach(row => { row.style.display = row.innerText.toLowerCase().includes(term) ? '' : 'none'; }); });

    // --- SETUP & PROFIL ---
    document.getElementById('btn-create-budget')?.addEventListener('click', async () => { const pseudo = document.getElementById('setup-pseudo').value.trim(); if(!pseudo) return customAlert("Veuillez entrer votre prénom.", "Oups"); const code = Math.random().toString(36).substring(2, 8).toUpperCase(); const ref = await addDoc(collection(db, "budgets"), { code, owner: auth.currentUser.uid }); await setDoc(doc(db, "budgets", ref.id, "members", auth.currentUser.uid), { name: pseudo }); await setDoc(doc(db, "users", auth.currentUser.uid), { budgetId: ref.id }, { merge: true }); window.location.reload(); });
    document.getElementById('btn-join-budget')?.addEventListener('click', async () => { const pseudo = document.getElementById('setup-pseudo').value.trim(); if(!pseudo) return customAlert("Veuillez entrer votre prénom."); const snap = await getDocs(query(collection(db, "budgets"), where("code", "==", document.getElementById('join-code').value.trim().toUpperCase()))); if (!snap.empty) { const targetId = snap.docs[0].id; await setDoc(doc(db, "budgets", targetId, "members", auth.currentUser.uid), { name: pseudo }); await setDoc(doc(db, "users", auth.currentUser.uid), { budgetId: targetId }, { merge: true }); window.location.reload(); } else { customAlert("Code introuvable ! Vérifiez avec votre partenaire.", "Erreur"); } });
    document.getElementById('btn-update-pseudo')?.addEventListener('click', async () => { const newName = document.getElementById('admin-pseudo').value.trim(); if(newName && CURRENT_BUDGET_ID) { await setDoc(doc(db, `budgets/${CURRENT_BUDGET_ID}/members`, auth.currentUser.uid), { name: newName }, { merge: true }); document.getElementById('profile-success').style.display = 'block'; setTimeout(() => document.getElementById('profile-success').style.display = 'none', 3000); } });

    // --- FORMULAIRE DÉPENSE (AVEC IMAGE) ---
    async function saveExpense(type, amount, cat, desc, dateVal) {
        // Optionnel : Envoi d'une photo de ticket
        let savedReceiptUrl = null;
        if(receiptFile) {
            document.getElementById('btn-submit-expense').innerText = "Envoi de l'image...";
            document.getElementById('btn-submit-expense').disabled = true;
            try {
                const storageRef = ref(storage, `budgets/${CURRENT_BUDGET_ID}/receipts/${Date.now()}_${receiptFile.name}`);
                await uploadBytes(storageRef, receiptFile);
                savedReceiptUrl = await getDownloadURL(storageRef);
            } catch(e) {
                console.error(e);
                await customAlert("Erreur lors de l'envoi de la photo. La dépense sera sauvegardée sans image.");
            }
            document.getElementById('btn-submit-expense').disabled = false;
        }

        if (type === 'expense' && (cat.toLowerCase().includes("épargne") || cat.toLowerCase().includes("objectif"))) { 
            const gid = document.getElementById('goal-selector')?.value; const targetGoal = goals.find(g => g.id === gid); 
            if(targetGoal) {
                await updateDoc(doc(db, `budgets/${CURRENT_BUDGET_ID}/goals`, gid), { current: targetGoal.current + amount }); 
                if((targetGoal.current + amount) >= targetGoal.target) fireConfetti();
            }
        } 
        
        const ts = new Date(dateVal).getTime() + (12 * 60 * 60 * 1000);
        const frDate = new Date(dateVal).toLocaleDateString('fr-FR');
        
        const expenseData = { date: frDate, timestamp: ts, desc: desc, amount: amount, payerId: document.getElementById('payer').value || auth.currentUser.uid, category: cat, type: type };
        if(savedReceiptUrl) expenseData.receiptUrl = savedReceiptUrl;

        if(editingExpenseId) {
            await updateDoc(doc(db, `budgets/${CURRENT_BUDGET_ID}/expenses`, editingExpenseId), expenseData);
            editingExpenseId = null; 
        } else {
            await addDoc(collection(db, `budgets/${CURRENT_BUDGET_ID}/expenses`), expenseData); 
        }
    }

    document.getElementById('expense-form')?.addEventListener('submit', async (e) => { 
        e.preventDefault(); 
        await saveExpense(document.querySelector('input[name="trans-type"]:checked').value, parseFloat(document.getElementById('amount').value), document.getElementById('category').value, document.getElementById('desc').value, document.getElementById('expense-date').value); 
        e.target.reset(); 
        document.getElementById('expense-date').value = new Date().toISOString().split('T')[0]; 
        document.getElementById('payer').value = auth.currentUser.uid; 
        receiptFile = null; document.getElementById('receipt-preview').innerText = "";
        document.getElementById('modal-expense').style.display = 'none'; 
        
        document.getElementById('form-expense-title').innerText = "✨ Nouvelle Opération";
        document.getElementById('btn-submit-expense').innerText = "Ajouter";
    });

    document.getElementById('category-form')?.addEventListener('submit', async (e) => { 
        e.preventDefault(); 
        const em = document.getElementById('new-cat-emoji').value;
        const nom = document.getElementById('new-cat-name').value;
        const lim = parseFloat(document.getElementById('new-cat-limit').value) || null;

        if(editingCategoryId) {
            await updateDoc(doc(db, `budgets/${CURRENT_BUDGET_ID}/categories`, editingCategoryId), { emoji: em, name: nom, limit: lim });
            editingCategoryId = null;
            document.getElementById('btn-submit-category').innerText = "+ Ajouter";
            document.getElementById('category-form-title').innerText = "Gérer les Catégories";
        } else {
            await addDoc(collection(db, `budgets/${CURRENT_BUDGET_ID}/categories`), { emoji: em, name: nom, limit: lim }); 
        }
        e.target.reset(); 
    });

    document.getElementById('goal-form')?.addEventListener('submit', async (e) => { e.preventDefault(); await addDoc(collection(db, `budgets/${CURRENT_BUDGET_ID}/goals`), { name: document.getElementById('goal-name').value, current: 0, target: parseFloat(document.getElementById('goal-target').value), archived: false }); e.target.reset(); });

    // --- GESTION DES CLICS MULTIPLES ---
    document.addEventListener('click', async (e) => {
        if(e.target.classList.contains('toggle-card-btn')) { const btn = e.target; const content = btn.closest('.card').querySelector('.card-content'); if(content) { const isHidden = content.style.display === 'none'; content.style.display = isHidden ? 'block' : 'none'; btn.innerHTML = isHidden ? '➖' : '➕'; } return; }
        
        if(e.target.classList.contains('edit-exp')) {
            const expId = e.target.dataset.id; const expToEdit = expenses.find(x => x.id === expId);
            if(expToEdit) {
                editingExpenseId = expId; 
                document.getElementById('desc').value = expToEdit.desc; 
                document.getElementById('amount').value = expToEdit.amount; 
                document.getElementById('category').value = expToEdit.category; 
                document.getElementById('payer').value = expToEdit.payerId; 
                document.querySelector(`input[name="trans-type"][value="${expToEdit.type}"]`).checked = true;
                if(expToEdit.timestamp) { document.getElementById('expense-date').value = new Date(expToEdit.timestamp).toISOString().split('T')[0]; }
                
                document.getElementById('modal-expense-title').innerText = "✏️ Modifier l'opération"; 
                document.getElementById('btn-submit-expense').innerText = "Enregistrer la modification";
                document.getElementById('modal-expense').style.display = 'flex';
            }
        }
        
        if(e.target.classList.contains('duplicate-exp')) {
            const expId = e.target.dataset.id; const expToDup = expenses.find(x => x.id === expId);
            if(expToDup) {
                editingExpenseId = null; 
                document.getElementById('desc').value = expToDup.desc; 
                document.getElementById('amount').value = expToDup.amount; 
                document.getElementById('category').value = expToDup.category; 
                document.querySelector(`input[name="trans-type"][value="${expToDup.type}"]`).checked = true;
                document.getElementById('expense-date').value = new Date().toISOString().split('T')[0];
                
                document.getElementById('modal-expense-title').innerText = "📋 Dupliquer l'opération"; 
                document.getElementById('btn-submit-expense').innerText = "Ajouter";
                document.getElementById('modal-expense').style.display = 'flex';
            }
        }

        if(e.target.classList.contains('edit-cat')) {
            const catId = e.target.dataset.id; const catToEdit = customCategories.find(x => x.id === catId);
            if(catToEdit) {
                editingCategoryId = catId;
                document.getElementById('new-cat-emoji').value = catToEdit.emoji;
                document.getElementById('new-cat-name').value = catToEdit.name;
                document.getElementById('new-cat-limit').value = catToEdit.limit || '';
                
                document.getElementById('category-form-title').innerText = "✏️ Modifier la catégorie";
                document.getElementById('btn-submit-category').innerText = "Enregistrer la modification";
                document.getElementById('new-cat-name').focus();
            }
        }

        // Trophées
        if(e.target.classList.contains('archive-goal')) {
            if(await customConfirm("Bravo ! Voulez-vous envoyer cet objectif dans le Mur des Trophées ?", "Projet accompli !")) {
                await updateDoc(doc(db, `budgets/${CURRENT_BUDGET_ID}/goals`, e.target.dataset.id), { archived: true });
                fireConfetti();
            }
        }

        if(e.target.classList.contains('delete-exp')) { if(await customConfirm("Voulez-vous vraiment supprimer cette opération ?", "Supprimer ?")) await deleteDoc(doc(db, `budgets/${CURRENT_BUDGET_ID}/expenses`, e.target.dataset.id)); }
        if(e.target.classList.contains('delete-cat')) { if(await customConfirm("Voulez-vous vraiment supprimer cette catégorie ?", "Supprimer ?")) await deleteDoc(doc(db, `budgets/${CURRENT_BUDGET_ID}/categories`, e.target.dataset.id)); }
        if(e.target.classList.contains('delete-ev')) { if(await customConfirm("Voulez-vous vraiment supprimer cet événement du calendrier ?", "Supprimer ?")) await deleteDoc(doc(db, `budgets/${CURRENT_BUDGET_ID}/events`, e.target.dataset.id)); }
        if(e.target.classList.contains('delete-sub')) { if(await customConfirm("Voulez-vous vraiment supprimer cet abonnement ?", "Supprimer ?")) await deleteDoc(doc(db, `budgets/${CURRENT_BUDGET_ID}/subscriptions`, e.target.dataset.id)); }
        if(e.target.classList.contains('delete-feedback')) { if(await customConfirm("Voulez-vous effacer ce message ?", "Effacer ?")) { await deleteDoc(doc(db, "feedbacks", e.target.dataset.id)); loadAdminData(); } }
        
        if(e.target.classList.contains('pay-sub')) { 
            const amt = parseFloat(e.target.dataset.amount); const nom = e.target.dataset.name; const cat = e.target.dataset.cat;
            if(await customConfirm(`Ajouter ${amt}€ dans les dépenses pour : ${nom} ?`, "Payer l'abonnement")) { await saveExpense('expense', amt, cat, nom, new Date().toISOString().split('T')[0]); customAlert("Abonnement payé et ajouté aux dépenses !"); }
        }

        if(e.target.classList.contains('delete-user-data')) { if(await customConfirm("Purger les données de cet utilisateur ?", "Danger")) { await updateDoc(doc(db, "users", e.target.dataset.uid), { budgetId: null }); customAlert("Utilisateur purgé."); loadAdminData(); } }
        if(e.target.classList.contains('delete-budget-data')) { if(await customConfirm("Détruire ce foyer cassera l'application pour ses membres. Continuer ?", "DANGER EXTRÊME")) { await deleteDoc(doc(db, "budgets", e.target.dataset.bid)); customAlert("Foyer détruit."); loadAdminData(); } }
    });

    document.getElementById('export-btn')?.addEventListener('click', () => {
        if(expenses.length === 0) return customAlert("Aucune donnée à exporter.", "Oups !");
        let csvContent = "data:text/csv;charset=utf-8,Date,Type,Description,Catégorie,Payé par,Montant\n";
        expenses.forEach(e => { const typeStr = e.type === 'income' ? 'Revenu' : 'Dépense'; const payerName = members.find(m => m.id === e.payerId)?.name || "Inconnu"; csvContent += `"${e.date}","${typeStr}","${e.desc}","${e.category}","${payerName}","${e.amount}"\n`; });
        const encodedUri = encodeURI(csvContent); const link = document.createElement("a"); link.setAttribute("href", encodedUri); link.setAttribute("download", `budget_duo_${new Date().toLocaleDateString('fr-FR').replace(/\//g, '-')}.csv`); document.body.appendChild(link); link.click(); link.remove();
    });

    const fM = document.getElementById('filter-month'), fY = document.getElementById('filter-year');
    if(fM && fY) { ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'].forEach((m, i) => fM.appendChild(new Option(m, i))); const dNow = new Date(); for(let i = dNow.getFullYear()-1; i <= dNow.getFullYear()+1; i++) fY.appendChild(new Option(i, i)); fM.value = dNow.getMonth(); fY.value = dNow.getFullYear(); fM.addEventListener('change', updateUI); fY.addEventListener('change', updateUI); }
    document.getElementById('toggle-proportional')?.addEventListener('change', (e) => { document.getElementById('expenseChartContainer').style.display = e.target.checked ? 'none' : 'block'; document.getElementById('proportional-container').style.display = e.target.checked ? 'block' : 'none'; });
    
    document.getElementById('settings-theme-selector')?.addEventListener('change', (e) => { 
        applyTheme(e.target.value);
        localStorage.setItem('budgetTheme', e.target.value); 
    });
    
    document.getElementById('logout-btn')?.addEventListener('click', () => signOut(auth));
    document.getElementById('logout-btn-page')?.addEventListener('click', () => signOut(auth));
    document.getElementById('search-bar')?.addEventListener('input', (e) => { currentSearch = e.target.value.toLowerCase(); updateUI(); });
    
    const savedTheme = localStorage.getItem('budgetTheme') || 'auto';
    applyTheme(savedTheme);
    const tSel = document.getElementById('settings-theme-selector'); if(tSel) tSel.value = savedTheme;
});