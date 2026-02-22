import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, doc, updateDoc, deleteDoc, getDoc, setDoc, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

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

// 👑 2. REMPLACEZ CECI PAR VOTRE UID FIREBASE ADMIN
const ADMIN_UID = "7AsUY4KcNDaWB33X4A2n2UfxOvO2"; 

document.addEventListener('DOMContentLoaded', () => {

    function customAlert(message, title = "Information") {
        return new Promise((resolve) => {
            const overlay = document.getElementById('custom-dialog-overlay');
            document.getElementById('custom-dialog-title').innerText = title;
            document.getElementById('custom-dialog-msg').innerHTML = message;
            const btnContainer = document.getElementById('custom-dialog-btns');
            btnContainer.innerHTML = '<button id="btn-dialog-ok" style="width:auto; padding:10px 25px;">OK</button>';
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
            btnContainer.innerHTML = `<button id="btn-dialog-cancel" class="btn-small" style="background:var(--card-bg); color:var(--text);">Annuler</button><button id="btn-dialog-confirm" style="width:auto; padding:10px 25px; background:#e74c3c;">Confirmer</button>`;
            overlay.style.display = 'flex';
            document.getElementById('btn-dialog-cancel').onclick = () => { overlay.style.display = 'none'; resolve(false); };
            document.getElementById('btn-dialog-confirm').onclick = () => { overlay.style.display = 'none'; resolve(true); };
        });
    }

    const todayISO = new Date().toISOString().split('T')[0];
    if(document.getElementById('expense-date')) document.getElementById('expense-date').value = todayISO;
    if(document.getElementById('quick-date')) document.getElementById('quick-date').value = todayISO;

    const sidebar = document.getElementById('sidebar');
    const mainContent = document.querySelector('.main-content');
    const toggleBtn = document.getElementById('toggle-sidebar');
    const mobileOverlay = document.getElementById('mobile-overlay');
    
    const screenMaintenance = document.getElementById('screen-maintenance');
    const screenAuth = document.getElementById('screen-auth');
    const screenSetup = document.getElementById('screen-setup');
    const screenApp = document.getElementById('screen-app');

    const viewDashboard = document.getElementById('view-dashboard');
    const viewProfile = document.getElementById('view-profile');
    const viewCalendar = document.getElementById('view-calendar');
    const viewAdmin = document.getElementById('view-admin');
    const viewSubs = document.getElementById('view-subscriptions');
    const viewPanda = document.getElementById('view-panda'); 
    
    const navItems = document.querySelectorAll('.nav-item');

    let CURRENT_BUDGET_ID = null;
    let unsubscribers = [];
    let isDataLoaded = false;
    let goals = [], expenses = [], customCategories = [], members = [], eventsData = [], subsData = [];
    let myChart = null, myAnnualChart = null, currentSearch = "";
    let showAnnual = false, showEnvelopes = false;
    let calMonth = new Date().getMonth(); let calYear = new Date().getFullYear();
    let reminderPopupShown = false;
    let isMaintenance = false; let currentUserObj = null;
    let editingExpenseId = null; 
    let deferredPrompt; 

    // --- 🐼 MOTEUR DU TAMAGOTCHI 3D ---
    let pandaData = { love: 50, hunger: 50, hygiene: 50, energy: 50, coins: 0, hat: false, glasses: false, isSleeping: false };
    let pandaWriteTimeout = null;
    let isOverBudget = false;

    // Variables pour le "Mode Éponge/Brosse"
    let isWashingMode = false;
    let washLastX = null;
    let pandaPetAccumulator = 0;
    const pandaViewer = document.getElementById('panda-3d');
    const pandaContainer = document.getElementById('panda-3d-container');
    const btnWash = document.getElementById('btn-panda-wash');

    function checkPandaVisibility() {
        const theme = localStorage.getItem('budgetTheme') || 'light';
        const isPandaTheme = (theme === 'panda-geant');
        const nav1 = document.getElementById('nav-panda'); if(nav1) nav1.style.display = isPandaTheme ? 'flex' : 'none';
        const nav2 = document.getElementById('bnav-panda'); if(nav2) nav2.style.display = isPandaTheme ? 'flex' : 'none';
        if(!isPandaTheme && viewPanda.style.display === 'block') { document.getElementById('nav-dashboard').click(); }
    }

    function savePandaState() {
        if(!CURRENT_BUDGET_ID) return;
        clearTimeout(pandaWriteTimeout);
        pandaWriteTimeout = setTimeout(() => { updateDoc(doc(db, `budgets/${CURRENT_BUDGET_ID}/pet`, "panda"), { ...pandaData, lastUpdate: Date.now() }); }, 1000);
    }

    function spawnParticle(emoji, x, y) {
        const p = document.createElement('div');
        p.innerText = emoji; p.className = 'floating-particle';
        p.style.left = (x - 15) + 'px'; p.style.top = (y - 15) + 'px';
        document.body.appendChild(p);
        setTimeout(() => p.remove(), 1000);
    }

    // 🧽 Bouton Activer/Désactiver la Brosse
    btnWash?.addEventListener('click', () => {
        if(pandaData.isSleeping) return customAlert("Chut... il dort. Éteignez la lumière pour le réveiller.", "Zzz...");
        
        isWashingMode = !isWashingMode;
        
        if (isWashingMode) {
            btnWash.classList.add('washing-active');
            if(pandaViewer) pandaViewer.removeAttribute('camera-controls'); // Bloque la rotation 3D
            customAlert("Mode Bain activé 🧼 !<br><br>Frottez l'écran (le cadre du panda) avec votre doigt ou votre souris pour le laver.<br><br>Recliquez sur l'éponge pour terminer.", "L'heure du bain !");
        } else {
            btnWash.classList.remove('washing-active');
            if(pandaViewer) pandaViewer.setAttribute('camera-controls', 'true'); // Débloque la rotation 3D
        }
    });

    // ❤️ Interaction Câlin (Clic simple) 
    pandaContainer?.addEventListener('pointerdown', (e) => {
        if(pandaData.isSleeping) return customAlert("Chut... il dort. Éteignez la lumière pour le réveiller.", "Zzz...");
        
        // Si on est en mode Brosse, le pointerdown sert juste de point de départ au frottement
        if(isWashingMode) {
            washLastX = e.clientX;
        } else {
            // Sinon, c'est un câlin normal !
            if(pandaData.love < 100) {
                pandaData.love = Math.min(100, pandaData.love + 5);
                spawnParticle('❤️', e.clientX, e.clientY);
                updatePandaUI(); savePandaState();
            }
        }
    });

    // 🧼 Interaction Frottement (Quand on bouge sur l'écran en mode Brosse)
    pandaContainer?.addEventListener('pointermove', (e) => {
        if (!isWashingMode || washLastX === null) return; // Ne fait rien si pas en mode lavage
        
        // On calcule la distance parcourue par le doigt/souris
        pandaPetAccumulator += Math.abs(e.clientX - washLastX);
        
        // Tous les X pixels frottés, on gagne 1 point d'hygiène et on fait une bulle
        if (pandaPetAccumulator > 30) {
            pandaPetAccumulator = 0;
            if(pandaData.hygiene < 100) {
                pandaData.hygiene = Math.min(100, pandaData.hygiene + 2);
                spawnParticle('🫧', e.clientX, e.clientY);
                updatePandaUI(); savePandaState();
            }
        }
        washLastX = e.clientX;
    });

    // Arrête le frottement quand on lève le doigt/souris
    pandaContainer?.addEventListener('pointerup', () => washLastX = null);
    pandaContainer?.addEventListener('pointerleave', () => washLastX = null);

    // Nourrir
    document.getElementById('btn-panda-feed')?.addEventListener('click', () => {
        if(pandaData.isSleeping) return customAlert("Il faut le réveiller avant de manger !", "Zzz...");
        if(pandaData.hunger >= 100) return customAlert("Il n'a plus faim pour le moment, il a le ventre plein ! 🐼", "Repu !");
        
        pandaData.hunger = Math.min(100, pandaData.hunger + 20);
        
        const bamboo = document.createElement('div'); bamboo.innerText = '🎋';
        bamboo.style.position = 'absolute'; bamboo.style.fontSize = '50px'; bamboo.style.left = '50%'; bamboo.style.zIndex = '10';
        bamboo.style.animation = 'floatUp 1s ease-in reverse forwards'; 
        pandaContainer.appendChild(bamboo);
        setTimeout(() => bamboo.remove(), 1000);

        updatePandaUI(); savePandaState();
    });

    // Dormir (Lumière)
    document.getElementById('btn-panda-sleep')?.addEventListener('click', () => {
        // Désactive le mode brosse si on s'endort
        if(isWashingMode) {
            isWashingMode = false;
            btnWash.classList.remove('washing-active');
            if(pandaViewer) pandaViewer.setAttribute('camera-controls', 'true');
        }

        pandaData.isSleeping = !pandaData.isSleeping;
        updatePandaUI(); savePandaState();
    });

    // Boutique
    document.getElementById('btn-buy-hat')?.addEventListener('click', () => {
        if(pandaData.hat) return customAlert("Vous possédez déjà ce magnifique chapeau !");
        if(pandaData.coins < 100) return customAlert("Vous n'avez pas assez de pièces. Économisez davantage !");
        pandaData.coins -= 100; pandaData.hat = true; updatePandaUI(); savePandaState(); customAlert("Chapeau acheté !");
    });

    document.getElementById('btn-buy-glasses')?.addEventListener('click', () => {
        if(pandaData.glasses) return customAlert("Vous possédez déjà ces lunettes !");
        if(pandaData.coins < 200) return customAlert("Vous n'avez pas assez de pièces.");
        pandaData.coins -= 200; pandaData.glasses = true; updatePandaUI(); savePandaState(); customAlert("Lunettes achetées !");
    });

    function updatePandaUI() {
        document.getElementById('p-bar-love').style.width = pandaData.love + '%';
        document.getElementById('p-bar-hunger').style.width = pandaData.hunger + '%';
        document.getElementById('p-bar-hygiene').style.width = pandaData.hygiene + '%';
        document.getElementById('p-bar-energy').style.width = pandaData.energy + '%';
        
        const coinDisplay = document.getElementById('panda-coins-display'); if(coinDisplay) coinDisplay.innerText = pandaData.coins;
        const overlay = document.getElementById('panda-room-overlay'); const bubble = document.getElementById('panda-mood-bubble');
        if(overlay) overlay.style.opacity = pandaData.isSleeping ? '1' : '0';
        
        if(bubble) {
            if(pandaData.isSleeping) { bubble.style.display = 'block'; bubble.innerText = "Zzz... Zzz..."; } 
            else if (isOverBudget) { bubble.style.display = 'block'; bubble.innerText = "Je m'inquiète pour notre budget... 😰"; } 
            else if (pandaData.hunger < 30) { bubble.style.display = 'block'; bubble.innerText = "J'ai faaaaaim 🎋"; } 
            else if (pandaData.hygiene < 30) { bubble.style.display = 'block'; bubble.innerText = "Je suis tout sale 🧼"; } 
            else { bubble.style.display = 'none'; }
        }

        const hat = document.getElementById('acc-hat'); if(hat) hat.style.display = pandaData.hat ? 'block' : 'none';
        const glasses = document.getElementById('acc-glasses'); if(glasses) glasses.style.display = pandaData.glasses ? 'block' : 'none';
    }


    // --- 🌍 GESTION RÉSEAU & INSTALLATION PWA ---
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

    onAuthStateChanged(auth, async (user) => { currentUserObj = user; renderAppState(); });

    async function checkDailyLogin() {
        if(!currentUserObj) return;
        const uRef = doc(db, "users", currentUserObj.uid);
        const uSnap = await getDoc(uRef);
        const todayStr = new Date().toLocaleDateString('fr-FR');
        
        if (uSnap.exists()) {
            const uData = uSnap.data();
            if (uData.lastLoginDate !== todayStr) {
                await updateDoc(uRef, { lastLoginDate: todayStr, lastLogin: Date.now() });
                if(CURRENT_BUDGET_ID) { pandaData.coins += 10; savePandaState(); }
            }
        }
    }

    async function renderAppState() {
        if (isMaintenance && (!currentUserObj || currentUserObj.uid !== ADMIN_UID)) { screenMaintenance.style.display = 'flex'; screenAuth.style.display = 'none'; screenSetup.style.display = 'none'; screenApp.style.display = 'none'; if (currentUserObj) await signOut(auth); return; }
        screenMaintenance.style.display = 'none';
        if (currentUserObj) {
            if(currentUserObj.uid === ADMIN_UID) document.getElementById('nav-admin').style.display = 'flex';
            if (!isDataLoaded) { 
                const userDoc = await getDoc(doc(db, "users", currentUserObj.uid));
                if (userDoc.exists() && userDoc.data().budgetId) { 
                    CURRENT_BUDGET_ID = userDoc.data().budgetId; screenAuth.style.display = 'none'; screenSetup.style.display = 'none'; 
                    loadBudgetData(); checkDailyLogin(); checkPandaVisibility(); 
                } 
                else { screenAuth.style.display = 'none'; screenApp.style.display = 'none'; screenSetup.style.display = 'flex'; }
            }
        } else {
            screenAuth.style.display = 'flex'; screenApp.style.display = 'none'; screenSetup.style.display = 'none'; 
            unsubscribers.forEach(u => u()); unsubscribers = []; CURRENT_BUDGET_ID = null; isDataLoaded = false; checkPandaVisibility();
        }
    }

    document.getElementById('toggle-password')?.addEventListener('click', (e) => { const pwdInput = document.getElementById('auth-password'); if (pwdInput.type === 'password') { pwdInput.type = 'text'; e.target.innerText = '🙈'; } else { pwdInput.type = 'password'; e.target.innerText = '👁️'; } });
    document.getElementById('auth-forgot-pwd')?.addEventListener('click', async () => { const email = document.getElementById('auth-email').value; if(!email) return customAlert("Veuillez saisir votre adresse email dans le champ ci-dessus puis cliquer ici.", "Oups !"); try { await sendPasswordResetEmail(auth, email); customAlert("Un email de réinitialisation vous a été envoyé !", "Email envoyé"); } catch(e) { customAlert("Erreur : Adresse email introuvable ou invalide.", "Erreur"); } });
    document.getElementById('login-form')?.addEventListener('submit', async (e) => { e.preventDefault(); const email = document.getElementById('auth-email').value; const pwd = document.getElementById('auth-password').value; const isLoginMode = document.getElementById('auth-title').innerText === "Connexion"; try { if(isLoginMode) { await signInWithEmailAndPassword(auth, email, pwd); } else { const cred = await createUserWithEmailAndPassword(auth, email, pwd); await setDoc(doc(db, "users", cred.user.uid), { email: email, budgetId: null, createdAt: Date.now(), lastLoginDate: '' }); } } catch(err) { document.getElementById('auth-error').style.display = 'block'; document.getElementById('auth-error').innerText = "Erreur: Identifiants invalides."; } });

    // --- NAVIGATION ---
    function switchView(viewElement, navId, bnavId) {
        viewDashboard.style.display = 'none'; viewProfile.style.display = 'none'; viewCalendar.style.display = 'none'; if(viewAdmin) viewAdmin.style.display = 'none'; viewSubs.style.display = 'none'; viewPanda.style.display = 'none';
        document.querySelectorAll('.nav-item, .bottom-nav-item').forEach(el => el.classList.remove('active'));
        viewElement.style.display = 'block';
        if(document.getElementById(navId)) document.getElementById(navId).classList.add('active');
        if(document.getElementById(bnavId)) document.getElementById(bnavId).classList.add('active');
        window.scrollTo(0,0);
        if (window.innerWidth <= 850) { sidebar.classList.remove('mobile-open'); if (mobileOverlay) mobileOverlay.classList.remove('active'); }
    }

    toggleBtn?.addEventListener('click', () => { if (window.innerWidth <= 850) { sidebar.classList.toggle('mobile-open'); if (mobileOverlay) mobileOverlay.classList.toggle('active'); } else { sidebar.classList.toggle('collapsed'); mainContent.classList.toggle('expanded'); } });
    mobileOverlay?.addEventListener('click', () => { sidebar.classList.remove('mobile-open'); mobileOverlay.classList.remove('active'); });

    document.getElementById('nav-dashboard')?.addEventListener('click', () => { switchView(viewDashboard, 'nav-dashboard', 'bnav-dashboard'); document.getElementById('fab-quick-add').style.display='flex'; });
    document.getElementById('nav-profile')?.addEventListener('click', () => { switchView(viewProfile, 'nav-profile', 'bnav-profile'); document.getElementById('fab-quick-add').style.display='none';});
    document.getElementById('nav-calendar')?.addEventListener('click', () => { switchView(viewCalendar, 'nav-calendar', 'bnav-calendar'); document.getElementById('fab-quick-add').style.display='none'; renderCalendar(); });
    document.getElementById('nav-subs')?.addEventListener('click', () => { switchView(viewSubs, 'nav-subs', 'bnav-subs'); document.getElementById('fab-quick-add').style.display='none'; renderSubs(); });
    document.getElementById('nav-admin')?.addEventListener('click', () => { switchView(viewAdmin, 'nav-admin', null); document.getElementById('fab-quick-add').style.display='none'; loadAdminData(); });
    document.getElementById('nav-panda')?.addEventListener('click', () => { switchView(viewPanda, 'nav-panda', 'bnav-panda'); document.getElementById('fab-quick-add').style.display='none'; });

    document.getElementById('bnav-dashboard')?.addEventListener('click', () => { switchView(viewDashboard, 'nav-dashboard', 'bnav-dashboard'); document.getElementById('fab-quick-add').style.display='flex'; });
    document.getElementById('bnav-profile')?.addEventListener('click', () => { switchView(viewProfile, 'nav-profile', 'bnav-profile'); document.getElementById('fab-quick-add').style.display='none';});
    document.getElementById('bnav-calendar')?.addEventListener('click', () => { switchView(viewCalendar, 'nav-calendar', 'bnav-calendar'); document.getElementById('fab-quick-add').style.display='none'; renderCalendar(); });
    document.getElementById('bnav-subs')?.addEventListener('click', () => { switchView(viewSubs, 'nav-subs', 'bnav-subs'); document.getElementById('fab-quick-add').style.display='none'; renderSubs(); });
    document.getElementById('bnav-panda')?.addEventListener('click', () => { switchView(viewPanda, 'nav-panda', 'bnav-panda'); document.getElementById('fab-quick-add').style.display='none'; });

    document.getElementById('btn-open-feedback')?.addEventListener('click', () => { document.getElementById('modal-feedback').style.display = 'flex'; if (window.innerWidth <= 850) { sidebar.classList.remove('mobile-open'); mobileOverlay.classList.remove('active'); } });
    document.getElementById('btn-close-feedback')?.addEventListener('click', () => { document.getElementById('modal-feedback').style.display = 'none'; });
    document.getElementById('feedback-form')?.addEventListener('submit', async(e) => { e.preventDefault(); await addDoc(collection(db, "feedbacks"), { text: document.getElementById('feedback-text').value, user: auth.currentUser.email, date: Date.now() }); document.getElementById('feedback-form').reset(); document.getElementById('modal-feedback').style.display = 'none'; customAlert("Merci pour votre retour !", "Message envoyé"); });

    document.getElementById('fab-quick-add')?.addEventListener('click', () => { document.getElementById('quick-date').value = new Date().toISOString().split('T')[0]; document.getElementById('modal-quick-add').style.display = 'flex'; });
    document.getElementById('btn-close-quick-add')?.addEventListener('click', () => { document.getElementById('modal-quick-add').style.display = 'none'; });
    
    function fireConfetti() {
        const colors = ['#4A90E2', '#50E3C2', '#FDCB6E', '#FF6B6B', '#A29BFE'];
        for(let i=0; i<50; i++) {
            const conf = document.createElement('div'); conf.style.position = 'fixed'; conf.style.zIndex = '9999'; conf.style.width = '10px'; conf.style.height = '10px'; conf.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)]; conf.style.left = Math.random() * 100 + 'vw'; conf.style.top = '-10px'; conf.style.borderRadius = Math.random() > 0.5 ? '50%' : '0'; document.body.appendChild(conf);
            const anim = conf.animate([{ transform: `translate3d(0,0,0) rotate(0deg)`, opacity: 1 }, { transform: `translate3d(${Math.random()*200 - 100}px, 100vh, 0) rotate(${Math.random()*720}deg)`, opacity: 0 }], { duration: Math.random() * 2000 + 2000, easing: 'cubic-bezier(.37,0,.63,1)' });
            anim.onfinish = () => conf.remove();
        }
    }

    function checkReminders() {
        if(reminderPopupShown) return; const todayTime = new Date().setHours(0,0,0,0); let upcoming = [];
        eventsData.forEach(ev => { if (ev.reminder > 0) { const evTime = new Date(ev.dateStart || ev.date).setHours(0,0,0,0); const diffDays = (evTime - todayTime) / (1000 * 3600 * 24); if (diffDays >= 0 && diffDays <= ev.reminder) upcoming.push({ ...ev, diffDays }); } });
        if (upcoming.length > 0) {
            const list = document.getElementById('reminder-list'); list.innerHTML = '';
            upcoming.forEach(ev => { const dayText = ev.diffDays === 0 ? "<b>Aujourd'hui</b>" : `dans ${ev.diffDays} jour(s)`; list.innerHTML += `<li style="margin-bottom:8px; padding:12px; background:rgba(0,0,0,0.03); border-radius:8px; border-left: 4px solid ${ev.important ? '#e74c3c' : 'var(--primary)'};"><strong style="font-size:1.1em;">${ev.title}</strong><br><span style="font-size:0.9em; color:#666;">Prévu ${dayText} (${new Date(ev.dateStart || ev.date).toLocaleDateString('fr-FR')})</span></li>`; });
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
    document.getElementById('ev-date-start')?.addEventListener('change', (e) => { const endInput = document.getElementById('ev-date-end'); if (!endInput.value || new Date(endInput.value) < new Date(e.target.value)) { endInput.value = e.target.value; } });
    
    document.getElementById('event-form')?.addEventListener('submit', async (e) => { 
        e.preventDefault(); const dStart = document.getElementById('ev-date-start').value; const dEnd = document.getElementById('ev-date-end').value;
        if(new Date(dEnd) < new Date(dStart)) return customAlert("La date de fin ne peut pas être avant la date de début.", "Erreur de saisie");
        await addDoc(collection(db, `budgets/${CURRENT_BUDGET_ID}/events`), { dateStart: dStart, timeStart: document.getElementById('ev-time-start').value || "", dateEnd: dEnd, timeEnd: document.getElementById('ev-time-end').value || "", title: document.getElementById('ev-title').value, type: document.getElementById('ev-type').value, important: document.getElementById('ev-important').checked, reminder: parseInt(document.getElementById('ev-reminder').value) }); 
        e.target.reset(); customAlert("Événement ajouté au calendrier !", "Succès"); 
    });

    document.getElementById('btn-toggle-envelopes')?.addEventListener('click', (e) => { showEnvelopes = !showEnvelopes; document.getElementById('envelopes-section').style.display = showEnvelopes ? 'block' : 'none'; e.target.style.background = showEnvelopes ? 'var(--primary)' : 'var(--card-bg)'; e.target.style.color = showEnvelopes ? '#fff' : 'var(--text)'; updateUI(); });
    document.getElementById('btn-toggle-annual')?.addEventListener('click', (e) => { showAnnual = !showAnnual; document.getElementById('annual-section').style.display = showAnnual ? 'block' : 'none'; e.target.style.background = showAnnual ? 'var(--primary)' : 'var(--card-bg)'; e.target.style.color = showAnnual ? '#fff' : 'var(--text)'; updateUI(); });
    document.getElementById('btn-toggle-admin')?.addEventListener('click', () => { const p = document.getElementById('admin-panel'); p.style.display = p.style.display === 'none' ? 'block' : 'none'; });

    function updateUI() {
        const list = document.getElementById('expense-list'); if(!list) return;
        list.innerHTML = ""; const m = parseInt(document.getElementById('filter-month').value); const y = parseInt(document.getElementById('filter-year').value);
        let rev = 0, dep = 0, catSums = {}; let memberStats = {}; members.forEach(mbr => memberStats[mbr.id] = { name: mbr.name, rev: 0, dep: 0 });

        const filteredExpenses = expenses.filter(e => { return new Date(e.timestamp).getMonth() === m && new Date(e.timestamp).getFullYear() === y && (e.desc.toLowerCase().includes(currentSearch) || e.category.toLowerCase().includes(currentSearch)); });

        if(filteredExpenses.length === 0) {
            list.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:30px; color:var(--text); opacity:0.6; font-size:1.1em;">📭 Aucune opération pour cette période. Quel calme !</td></tr>`;
        } else {
            filteredExpenses.forEach(e => {
                const isInc = e.type === 'income'; let currentPayerId = e.payerId || (members.find(mbr => mbr.name === e.payer)?.id) || 'inconnu';
                if(!memberStats[currentPayerId]) memberStats[currentPayerId] = { name: e.payer || "Ancien Profil", rev: 0, dep: 0 };
                if(isInc) { rev += e.amount; memberStats[currentPayerId].rev += e.amount; } else { dep += e.amount; memberStats[currentPayerId].dep += e.amount; catSums[e.category] = (catSums[e.category] || 0) + e.amount; }
                const tr = document.createElement('tr'); 
                tr.innerHTML = `<td>${e.date}</td><td>${e.desc}</td><td><small>${e.category}</small></td><td><strong>${memberStats[currentPayerId].name}</strong></td><td style="color:${isInc?'#2ecc71':'#e74c3c'}; font-weight:bold;">${isInc?'+':'-'}${e.amount.toFixed(2)}€</td>
                <td style="white-space:nowrap;">
                    <button class="duplicate-exp btn-small" data-id="${e.id}" style="padding:5px; border:none; background:none;" title="Dupliquer">📋</button>
                    <button class="edit-exp btn-small" data-id="${e.id}" style="padding:5px; border:none; background:none;" title="Modifier">✏️</button>
                    <button class="delete-exp btn-small" data-id="${e.id}" style="padding:5px; border:none; background:none;" title="Supprimer">🗑️</button>
                </td>`; 
                list.appendChild(tr);
            });
        }

        document.getElementById('total-revenus').innerText = rev.toFixed(2) + ' €'; document.getElementById('total-depenses').innerText = dep.toFixed(2) + ' €';
        document.getElementById('solde-actuel').innerText = (rev - dep).toFixed(2) + ' €'; document.getElementById('solde-actuel').style.color = (rev - dep) >= 0 ? '#2ecc71' : '#e74c3c';
        
        isOverBudget = (dep > rev && rev > 0);
        updatePandaUI();

        const propContainer = document.getElementById('proportional-container');
        if(propContainer) {
            propContainer.innerHTML = ''; Object.values(memberStats).forEach(stat => {
                if(stat.rev === 0 && stat.dep === 0) return; const pct = stat.rev > 0 ? Math.min((stat.dep / stat.rev) * 100, 100) : 0;
                propContainer.innerHTML += `<p style="font-size:0.85em; margin: 10px 0 5px 0; display:flex; justify-content:space-between; color:var(--text);"><strong>${stat.name}</strong> <span>${pct.toFixed(1)}%</span></p><div class="progress-bar" style="height:10px; margin-top:0;"><div class="progress-fill ${pct > 80 ? 'red' : (pct > 50 ? 'orange' : 'green')}" style="width:${pct}%"></div></div>`;
            });
        }
        const ctx = document.getElementById('expenseChart')?.getContext('2d');
        if (ctx) { if (myChart) myChart.destroy(); myChart = new Chart(ctx, { type: 'doughnut', data: { labels: Object.keys(catSums), datasets: [{ data: Object.values(catSums), backgroundColor: ['#4A90E2', '#FF6B6B', '#50E3C2', '#FDCB6E', '#A29BFE'], borderWidth: 0 }] }, options: { plugins: { legend: { display: false } }, cutout: '75%' } }); }
        if(showEnvelopes) renderEnvelopes(catSums); if(showAnnual) renderAnnualChart(); renderCalendar(); renderSubs();
    }

    function renderMembers() { const sel = document.getElementById('payer'); if(sel) { sel.innerHTML = ''; members.forEach(m => sel.appendChild(new Option(m.name, m.id))); if(auth.currentUser) sel.value = auth.currentUser.uid; } }
    function renderCategories() { const sel = document.getElementById('category'); const qSel = document.getElementById('quick-category'); const sSel = document.getElementById('sub-category'); const list = document.getElementById('category-manage-list'); if(sel) { sel.innerHTML = '<option value="">-- Choisir --</option>'; qSel.innerHTML = sel.innerHTML; sSel.innerHTML = sel.innerHTML; customCategories.forEach(c => { const opt = new Option(`${c.emoji} ${c.name}`, `${c.emoji} ${c.name}`); sel.appendChild(opt); qSel.appendChild(opt.cloneNode(true)); sSel.appendChild(opt.cloneNode(true)); }); } if(list) { list.innerHTML = ""; customCategories.forEach(c => { const li = document.createElement('li'); li.style = "display:flex; justify-content:space-between; padding:8px; background:rgba(0,0,0,0.03); border-radius:6px; margin-bottom:5px;"; li.innerHTML = `<span>${c.emoji} ${c.name}</span> <button class="delete-cat" data-id="${c.id}" style="width:auto; padding:2px 10px; margin:0; background:#e74c3c;">✕</button>`; list.appendChild(li); }); } }
    function renderGoals() { const cont = document.getElementById('goals-container'); const sel = document.getElementById('goal-selector'); if(!cont || !sel) return; cont.innerHTML = ""; sel.innerHTML = '<option value="">-- Lier à un objectif --</option>'; goals.forEach(g => { const p = Math.min((g.current / g.target) * 100, 100); const card = document.createElement('div'); card.className = 'card'; card.innerHTML = `<h3>🎯 ${g.name}</h3><p>${g.current.toFixed(0)}€ / ${g.target}€</p><div class="progress-bar"><div class="progress-fill green" style="width:${p}%"></div></div>`; cont.appendChild(card); sel.appendChild(new Option(g.name, g.id)); }); }
    function renderEnvelopes(catSums) { const envContent = document.getElementById('envelopes-section-content'); if(!envContent) return; envContent.innerHTML = ''; const envelopeCats = customCategories.filter(c => c.limit && c.limit > 0); if (envelopeCats.length === 0) { envContent.innerHTML = '<p style="text-align:center; padding:10px; color:#888; margin:0;">✉️ Aucune enveloppe définie.</p>'; return; } const gridDiv = document.createElement('div'); gridDiv.style.display = 'grid'; gridDiv.style.gridTemplateColumns = 'repeat(auto-fit, minmax(200px, 1fr))'; gridDiv.style.gap = '15px'; envelopeCats.forEach(cat => { const spent = catSums[`${cat.emoji} ${cat.name}`] || 0; const p = Math.min((spent / cat.limit) * 100, 100); const envDiv = document.createElement('div'); envDiv.style.background = 'rgba(0,0,0,0.02)'; envDiv.style.border = '1px solid var(--border)'; envDiv.style.padding = '15px'; envDiv.style.borderRadius = '8px'; envDiv.innerHTML = `<h4 style="margin:0 0 5px 0;">${cat.emoji} ${cat.name}</h4><div style="display:flex; justify-content:space-between; font-size:0.85em; margin-bottom:5px;"><span style="font-weight:bold;">${spent.toFixed(2)}€</span><span style="color:#888;">/ ${cat.limit}€</span></div><div class="progress-bar" style="margin-top:0;"><div class="progress-fill ${p > 90 ? 'red' : (p > 70 ? 'orange' : 'green')}" style="width:${p}%"></div></div>`; gridDiv.appendChild(envDiv); }); envContent.appendChild(gridDiv); }
    function renderAnnualChart() { const ctx = document.getElementById('annualChart')?.getContext('2d'); if(!ctx) return; const monthlyData = new Array(12).fill(0).map(() => ({ inc: 0, exp: 0 })); expenses.filter(e => new Date(e.timestamp).getFullYear() === parseInt(document.getElementById('filter-year').value)).forEach(e => { const m = new Date(e.timestamp).getMonth(); if(e.type === 'income') monthlyData[m].inc += e.amount; else monthlyData[m].exp += e.amount; }); if(myAnnualChart) myAnnualChart.destroy(); myAnnualChart = new Chart(ctx, { type: 'bar', data: { labels: ['Jan','Fév','Mar','Avr','Mai','Juin','Juil','Août','Sep','Oct','Nov','Déc'], datasets: [{ label: 'Revenus', data: monthlyData.map(d => d.inc), backgroundColor: '#2ecc71' }, { label: 'Dépenses', data: monthlyData.map(d => d.exp), backgroundColor: '#e74c3c' }] }, options: { responsive: true, maintainAspectRatio: false } }); }

    // --- FRAIS FIXES ---
    document.getElementById('sub-form')?.addEventListener('submit', async (e) => { e.preventDefault(); await addDoc(collection(db, `budgets/${CURRENT_BUDGET_ID}/subscriptions`), { name: document.getElementById('sub-name').value, amount: parseFloat(document.getElementById('sub-amount').value), category: document.getElementById('sub-category').value, day: parseInt(document.getElementById('sub-day').value) }); e.target.reset(); customAlert("Frais fixe enregistré !", "Succès"); });
    function renderSubs() { 
        const list = document.getElementById('subs-list'); const totLabel = document.getElementById('total-subs-amount'); if(!list || !totLabel) return; 
        list.innerHTML = ""; let total = 0; 
        if(subsData.length === 0) { list.innerHTML = '<li style="text-align:center; padding:15px; color:#888; font-style:italic;">📭 Aucun frais fixe configuré.</li>'; totLabel.innerText = "0.00 €"; return; }
        subsData.sort((a,b) => a.day - b.day).forEach(sub => { 
            total += sub.amount; const li = document.createElement('li'); li.style = "display:flex; justify-content:space-between; align-items:center; padding:12px; background:rgba(0,0,0,0.02); border:1px solid var(--border); border-radius:8px; margin-bottom:8px;"; 
            li.innerHTML = `<div style="flex:1;"><strong>${sub.name}</strong><br><small style="color:#666;">Le ${sub.day} du mois - ${sub.category}</small></div><div style="font-weight:bold; color:#e74c3c; margin-right:15px;">-${sub.amount.toFixed(2)}€</div><button class="pay-sub btn-small" data-name="${sub.name}" data-amount="${sub.amount}" data-cat="${sub.category}" style="background:#2ecc71; color:white; padding:5px 10px; border:none; margin-right:5px !important;">Payer</button><button class="delete-sub btn-small" data-id="${sub.id}" style="background:#e74c3c; color:white; padding:5px 10px; border:none;">✕</button>`; 
            list.appendChild(li); 
        }); 
        totLabel.innerText = total.toFixed(2) + " €"; 
    }

    // --- CHARGEMENT DATA FIREBASE ---
    function loadBudgetData() {
        if(isDataLoaded) return; isDataLoaded = true; screenApp.style.display = 'block'; document.getElementById('fab-quick-add').style.display='flex';
        getDoc(doc(db, "budgets", CURRENT_BUDGET_ID)).then(d => { if(d.exists()) document.getElementById('display-invite-code').innerText = d.data().code; });
        unsubscribers.push(onSnapshot(collection(db, `budgets/${CURRENT_BUDGET_ID}/members`), s => { members = []; s.forEach(doc => members.push({ id: doc.id, ...doc.data() })); const me = members.find(mbr => mbr.id === auth.currentUser.uid); if(me && document.getElementById('admin-pseudo')) document.getElementById('admin-pseudo').value = me.name; renderMembers(); updateUI(); }));
        unsubscribers.push(onSnapshot(collection(db, `budgets/${CURRENT_BUDGET_ID}/expenses`), s => { expenses = []; s.forEach(doc => expenses.push({ id: doc.id, ...doc.data() })); updateUI(); }));
        unsubscribers.push(onSnapshot(collection(db, `budgets/${CURRENT_BUDGET_ID}/categories`), s => { customCategories = []; s.forEach(doc => customCategories.push({ id: doc.id, ...doc.data() })); renderCategories(); updateUI(); }));
        unsubscribers.push(onSnapshot(collection(db, `budgets/${CURRENT_BUDGET_ID}/goals`), s => { goals = []; s.forEach(doc => goals.push({ id: doc.id, ...doc.data() })); renderGoals(); }));
        unsubscribers.push(onSnapshot(collection(db, `budgets/${CURRENT_BUDGET_ID}/events`), s => { eventsData = []; s.forEach(doc => eventsData.push({ id: doc.id, ...doc.data() })); renderCalendar(); checkReminders(); }));
        unsubscribers.push(onSnapshot(collection(db, `budgets/${CURRENT_BUDGET_ID}/subscriptions`), s => { subsData = []; s.forEach(doc => subsData.push({ id: doc.id, ...doc.data() })); renderSubs(); }));
        
        // 🐼 CHARGEMENT DU TAMAGOTCHI 🐼
        unsubscribers.push(onSnapshot(doc(db, `budgets/${CURRENT_BUDGET_ID}/pet`, "panda"), (d) => {
            if(d.exists()) {
                const p = d.data();
                const now = Date.now();
                const daysPassed = (now - p.lastUpdate) / (1000 * 60 * 60 * 24);
                
                if(daysPassed >= 0.1) {
                    const decay = Math.floor(daysPassed * 20); 
                    pandaData.love = Math.max(0, p.love - decay);
                    pandaData.hunger = Math.max(0, p.hunger - decay);
                    pandaData.hygiene = Math.max(0, p.hygiene - decay);
                    
                    if(p.isSleeping) { pandaData.energy = Math.min(100, p.energy + (decay * 3)); } 
                    else { pandaData.energy = Math.max(0, p.energy - decay); }
                    
                    pandaData.coins = p.coins || 0; pandaData.hat = p.hat || false; pandaData.glasses = p.glasses || false; pandaData.isSleeping = p.isSleeping || false;
                    savePandaState();
                } else {
                    pandaData = p; updatePandaUI();
                }
            } else {
                setDoc(doc(db, `budgets/${CURRENT_BUDGET_ID}/pet`, "panda"), pandaData);
            }
        }));
    }

    // --- LOGIQUE ADMINISTRATION ---
    async function loadAdminData() {
        if(auth.currentUser.uid !== ADMIN_UID) return; 
        const now = Date.now(); const sevenDaysAgo = now - (7 * 24 * 60 * 60 * 1000); let activeCount = 0;
        const usersSnap = await getDocs(collection(db, "users")); document.getElementById('admin-tot-users').innerText = usersSnap.size; const uList = document.getElementById('admin-user-list'); uList.innerHTML = '';
        usersSnap.forEach(docSnap => { const u = docSnap.data(); if(u.lastLogin && u.lastLogin > sevenDaysAgo) activeCount++; const dateLog = u.lastLogin ? new Date(u.lastLogin).toLocaleDateString() : 'Jamais'; uList.innerHTML += `<tr><td>${u.email || 'Ancien compte'}</td><td><small>${dateLog}</small></td><td>${u.budgetId || '<i>Aucun</i>'}</td><td><button class="delete-user-data btn-small" data-uid="${docSnap.id}" style="background:#e74c3c; color:white; padding:5px;">Purger</button></td></tr>`; });
        document.getElementById('admin-active-users').innerText = activeCount;
        const budgetsSnap = await getDocs(collection(db, "budgets")); document.getElementById('admin-tot-budgets').innerText = budgetsSnap.size; const bList = document.getElementById('admin-budget-list'); bList.innerHTML = '';
        budgetsSnap.forEach(docSnap => { const b = docSnap.data(); bList.innerHTML += `<tr><td style="font-weight:bold; color:var(--primary);">${b.code}</td><td><small>${b.owner}</small></td><td><button class="delete-budget-data btn-small" data-bid="${docSnap.id}" style="background:#e74c3c; color:white; padding:5px;">Détruire</button></td></tr>`; });
        const fbSnap = await getDocs(collection(db, "feedbacks")); const fList = document.getElementById('admin-feedback-list'); fList.innerHTML = '';
        fbSnap.forEach(docSnap => { const f = docSnap.data(); const d = new Date(f.date).toLocaleDateString(); fList.innerHTML += `<tr><td>${d}</td><td>${f.user}</td><td>${f.text}</td><td><button class="delete-feedback btn-small" data-id="${docSnap.id}" style="padding:5px;">🗑️</button></td></tr>`; });
    }

    document.getElementById('btn-ghost-mode')?.addEventListener('click', async () => { const target = document.getElementById('admin-ghost-id').value; if(target && target.trim() !== "") { unsubscribers.forEach(u => u()); unsubscribers = []; isDataLoaded = false; CURRENT_BUDGET_ID = target.trim(); loadBudgetData(); await customAlert("Mode fantôme activé ! Vous voyez le budget : " + CURRENT_BUDGET_ID); document.getElementById('nav-dashboard').click(); } });
    document.getElementById('search-admin-users')?.addEventListener('input', (e) => { const term = e.target.value.toLowerCase(); document.querySelectorAll('#admin-user-list tr').forEach(row => { row.style.display = row.innerText.toLowerCase().includes(term) ? '' : 'none'; }); });
    document.getElementById('search-admin-budgets')?.addEventListener('input', (e) => { const term = e.target.value.toLowerCase(); document.querySelectorAll('#admin-budget-list tr').forEach(row => { row.style.display = row.innerText.toLowerCase().includes(term) ? '' : 'none'; }); });

    // --- SETUP & PROFIL ---
    document.getElementById('btn-create-budget')?.addEventListener('click', async () => { const pseudo = document.getElementById('setup-pseudo').value.trim(); if(!pseudo) return customAlert("Veuillez entrer votre prénom.", "Oups"); const code = Math.random().toString(36).substring(2, 8).toUpperCase(); const ref = await addDoc(collection(db, "budgets"), { code, owner: auth.currentUser.uid }); await setDoc(doc(db, "budgets", ref.id, "members", auth.currentUser.uid), { name: pseudo }); await setDoc(doc(db, "users", auth.currentUser.uid), { budgetId: ref.id }, { merge: true }); window.location.reload(); });
    document.getElementById('btn-join-budget')?.addEventListener('click', async () => { const pseudo = document.getElementById('setup-pseudo').value.trim(); if(!pseudo) return customAlert("Veuillez entrer votre prénom."); const snap = await getDocs(query(collection(db, "budgets"), where("code", "==", document.getElementById('join-code').value.trim().toUpperCase()))); if (!snap.empty) { const targetId = snap.docs[0].id; await setDoc(doc(db, "budgets", targetId, "members", auth.currentUser.uid), { name: pseudo }); await setDoc(doc(db, "users", auth.currentUser.uid), { budgetId: targetId }, { merge: true }); window.location.reload(); } else { customAlert("Code introuvable !", "Erreur"); } });
    document.getElementById('btn-update-pseudo')?.addEventListener('click', async () => { const newName = document.getElementById('admin-pseudo').value.trim(); if(newName && CURRENT_BUDGET_ID) { await setDoc(doc(db, `budgets/${CURRENT_BUDGET_ID}/members`, auth.currentUser.uid), { name: newName }, { merge: true }); document.getElementById('profile-success').style.display = 'block'; setTimeout(() => document.getElementById('profile-success').style.display = 'none', 3000); } });

    // --- FORMULAIRES DE DÉPENSES ---
    async function saveExpense(type, amount, cat, desc, dateVal) {
        if (type === 'expense' && (cat.toLowerCase().includes("épargne") || cat.toLowerCase().includes("objectif"))) { 
            const gid = document.getElementById('goal-selector')?.value; const targetGoal = goals.find(g => g.id === gid); 
            if(targetGoal) {
                await updateDoc(doc(db, `budgets/${CURRENT_BUDGET_ID}/goals`, gid), { current: targetGoal.current + amount }); 
                pandaData.coins += 50; savePandaState();
                if((targetGoal.current + amount) >= targetGoal.target) fireConfetti();
            }
        } 
        
        const ts = new Date(dateVal).getTime() + (12 * 60 * 60 * 1000);
        const frDate = new Date(dateVal).toLocaleDateString('fr-FR');

        if(editingExpenseId) {
            await updateDoc(doc(db, `budgets/${CURRENT_BUDGET_ID}/expenses`, editingExpenseId), { desc: desc, amount: amount, category: cat, type: type, payerId: document.getElementById('payer').value, date: frDate, timestamp: ts });
            editingExpenseId = null; 
            const btnSubmit = document.getElementById('btn-submit-expense'); if(btnSubmit) { btnSubmit.innerText = "Enregistrer l'opération"; btnSubmit.style.background = "var(--primary)"; }
            document.getElementById('form-expense-title').innerText = "➕ Nouvelle Opération";
        } else {
            await addDoc(collection(db, `budgets/${CURRENT_BUDGET_ID}/expenses`), { date: frDate, timestamp: ts, desc: desc, amount: amount, payerId: document.getElementById('payer').value || auth.currentUser.uid, category: cat, type: type }); 
        }
    }

    document.getElementById('expense-form')?.addEventListener('submit', async (e) => { e.preventDefault(); await saveExpense(document.querySelector('input[name="trans-type"]:checked').value, parseFloat(document.getElementById('amount').value), document.getElementById('category').value, document.getElementById('desc').value, document.getElementById('expense-date').value); e.target.reset(); document.getElementById('expense-date').value = new Date().toISOString().split('T')[0]; document.getElementById('payer').value = auth.currentUser.uid; });
    document.getElementById('quick-expense-form')?.addEventListener('submit', async (e) => { e.preventDefault(); await saveExpense(document.querySelector('input[name="quick-trans-type"]:checked').value, parseFloat(document.getElementById('quick-amount').value), document.getElementById('quick-category').value, document.getElementById('quick-desc').value, document.getElementById('quick-date').value); e.target.reset(); document.getElementById('modal-quick-add').style.display = 'none'; });
    document.getElementById('category-form')?.addEventListener('submit', async (e) => { e.preventDefault(); await addDoc(collection(db, `budgets/${CURRENT_BUDGET_ID}/categories`), { emoji: document.getElementById('new-cat-emoji').value, name: document.getElementById('new-cat-name').value, limit: parseFloat(document.getElementById('new-cat-limit').value) || null }); e.target.reset(); });
    document.getElementById('goal-form')?.addEventListener('submit', async (e) => { e.preventDefault(); await addDoc(collection(db, `budgets/${CURRENT_BUDGET_ID}/goals`), { name: document.getElementById('goal-name').value, current: 0, target: parseFloat(document.getElementById('goal-target').value) }); e.target.reset(); });

    // --- GESTION DES CLICS MULTIPLES ---
    document.addEventListener('click', async (e) => {
        if(e.target.classList.contains('toggle-card-btn')) { const btn = e.target; const content = btn.closest('.card').querySelector('.card-content'); if(content) { const isHidden = content.style.display === 'none'; content.style.display = isHidden ? 'block' : 'none'; btn.innerHTML = isHidden ? '➖' : '➕'; } return; }
        
        if(e.target.classList.contains('edit-exp')) {
            const expId = e.target.dataset.id; const expToEdit = expenses.find(x => x.id === expId);
            if(expToEdit) {
                editingExpenseId = expId; document.getElementById('desc').value = expToEdit.desc; document.getElementById('amount').value = expToEdit.amount; document.getElementById('category').value = expToEdit.category; document.getElementById('payer').value = expToEdit.payerId; document.querySelector(`input[name="trans-type"][value="${expToEdit.type}"]`).checked = true;
                if(expToEdit.timestamp) { document.getElementById('expense-date').value = new Date(expToEdit.timestamp).toISOString().split('T')[0]; }
                const btnSubmit = document.getElementById('btn-submit-expense'); if(btnSubmit) { btnSubmit.innerText = "💾 Enregistrer la modification"; btnSubmit.style.background = "#f39c12"; }
                document.getElementById('form-expense-title').innerText = "✏️ Modifier l'opération"; document.getElementById('expense-form').scrollIntoView({behavior: "smooth"});
            }
        }
        
        if(e.target.classList.contains('duplicate-exp')) {
            const expId = e.target.dataset.id; const expToDup = expenses.find(x => x.id === expId);
            if(expToDup) {
                document.getElementById('quick-desc').value = expToDup.desc; document.getElementById('quick-amount').value = expToDup.amount; document.getElementById('quick-category').value = expToDup.category; document.querySelector(`input[name="quick-trans-type"][value="${expToDup.type}"]`).checked = true;
                document.getElementById('quick-date').value = new Date().toISOString().split('T')[0];
                document.getElementById('modal-quick-add').style.display = 'flex';
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
    document.getElementById('toggle-proportional')?.addEventListener('change', (e) => { document.getElementById('expenseChart').style.display = e.target.checked ? 'none' : 'block'; document.getElementById('proportional-container').style.display = e.target.checked ? 'block' : 'none'; });
    document.getElementById('auth-toggle-mode')?.addEventListener('click', () => { const t = document.getElementById('auth-title'); const b = document.getElementById('auth-submit-btn'); const l = document.getElementById('auth-toggle-mode'); const isLog = t.innerText === "Connexion"; t.innerText = isLog ? "Inscription" : "Connexion"; b.innerText = isLog ? "Créer mon compte" : "Se connecter"; l.innerText = isLog ? "Déjà un compte ? Connexion" : "Pas encore de compte ? S'inscrire"; });
    
    document.getElementById('theme-selector')?.addEventListener('change', (e) => { 
        document.body.className = e.target.value === 'light' ? '' : `theme-${e.target.value}`; 
        localStorage.setItem('budgetTheme', e.target.value); 
        checkPandaVisibility();
    });
    
    document.getElementById('logout-btn')?.addEventListener('click', () => signOut(auth));
    document.getElementById('search-bar')?.addEventListener('input', (e) => { currentSearch = e.target.value.toLowerCase(); updateUI(); });
    
    const savedTheme = localStorage.getItem('budgetTheme') || 'light';
    if(savedTheme !== 'light') { document.body.className = `theme-${savedTheme}`; }
    const tSel = document.getElementById('theme-selector'); if(tSel) tSel.value = savedTheme;
});