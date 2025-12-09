// --- CONFIGURATION ---
const SUPABASE_URL = 'https://exjayvebshmlzdwjbhkv.supabase.co'; 
const SUPABASE_KEY = 'sb_publishable_M_mIHSDGIHaBR2s9K9FkSg_Hy1FMn85'; 
const AI_SERVER_URL = 'https://shyyloww-github-io-1.onrender.com';

const sbClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let isLoginMode = true;
let currentUser = null;
let allConcepts = []; 

// --- 1. SETUP EVENT LISTENERS ---
document.addEventListener('DOMContentLoaded', () => {
    // Auth Buttons
    document.getElementById('auth-btn').addEventListener('click', handleAuth);
    document.getElementById('toggle-text').addEventListener('click', toggleAuthMode);
    document.getElementById('logout-btn').addEventListener('click', logout);

    // Navigation Buttons
    document.getElementById('btn-courses').addEventListener('click', () => navTo('courses'));
    document.getElementById('btn-fields').addEventListener('click', () => navTo('fields'));
    document.getElementById('btn-concepts').addEventListener('click', () => navTo('concepts'));
    document.getElementById('btn-favorites').addEventListener('click', () => navTo('favorites'));
    document.getElementById('btn-settings').addEventListener('click', () => navTo('settings'));

    // Settings Buttons
    document.getElementById('update-pass-btn').addEventListener('click', changePassword);
    document.querySelectorAll('.swatch').forEach(s => {
        s.addEventListener('click', (e) => setTheme(e.target.dataset.color));
    });

    // AI Buttons
    document.getElementById('ai-toggle-btn').addEventListener('click', toggleChat);
    document.getElementById('ai-close-btn').addEventListener('click', toggleChat);
    document.getElementById('ai-send-btn').addEventListener('click', sendAiMessage);
    document.getElementById('ai-input').addEventListener('keypress', (e) => {
        if(e.key === 'Enter') sendAiMessage();
    });

    // Concept Search
    document.querySelector('.concept-search').addEventListener('keyup', (e) => filterConcepts(e.target.value));

    // Initialize
    initApp();
});

// --- 2. AUTHENTICATION ---
async function handleAuth() {
    try {
        const u = document.getElementById('username').value.trim();
        const p = document.getElementById('password').value;
        const m = document.getElementById('auth-msg');

        if(!u || !p) { m.innerText = "Credentials required."; return; }
        if(p.length < 6) { m.innerText = "Password too short."; return; }
        
        m.innerText = "Authenticating...";
        const email = u + "@cyberian.io";

        if(isLoginMode) {
            const { error } = await sbClient.auth.signInWithPassword({ email, password: p });
            if(error) throw error;
            location.reload();
        } else {
            const { error } = await sbClient.auth.signUp({
                email: fakeEmail, password: p,
                options: { data: { username: u } }
            });
            if(error) throw error;
            m.innerText = "ID Created. Logging in...";
            setTimeout(() => location.reload(), 1500);
        }
    } catch (err) {
        document.getElementById('auth-msg').innerText = err.message;
    }
}

function toggleAuthMode() {
    isLoginMode = !isLoginMode;
    document.getElementById('auth-btn').innerText = isLoginMode ? "Initialize Session" : "Create ID";
    document.getElementById('toggle-text').innerText = isLoginMode ? "Create new operator ID" : "Return to login";
    document.getElementById('auth-msg').innerText = "";
}

async function logout() { await sbClient.auth.signOut(); location.reload(); }

// --- 3. APP INITIALIZATION ---
async function initApp() {
    const savedTheme = localStorage.getItem('cyberian-theme');
    if(savedTheme) setTheme(savedTheme);

    const { data: { session } } = await sbClient.auth.getSession();
    if(session) {
        currentUser = session.user;
        document.getElementById('auth-container').classList.add('hidden');
        document.getElementById('app-container').style.display = 'flex';
        
        const name = currentUser.user_metadata?.username || currentUser.email.split('@')[0];
        document.getElementById('user-display').innerText = name;
        
        loadData();
    } else {
        document.getElementById('auth-container').style.display = 'flex';
    }
}

// --- 4. NAVIGATION & DATA ---
function navTo(sec) {
    document.querySelectorAll('.view').forEach(el => el.classList.remove('active-view'));
    document.getElementById('view-'+sec).classList.add('active-view');
    
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    const btn = document.getElementById('btn-'+sec);
    if(btn) btn.classList.add('active');
}

async function loadData() {
    // 1. Courses
    const { data: courses } = await sbClient.from('courses').select('*');
    const cList = document.getElementById('course-list');
    if(courses?.length) {
        cList.innerHTML = courses.map(c => `
            <div class="bar-card">
                <div class="bar-icon"><i class="ph-fill ph-graduation-cap"></i></div>
                <div class="bar-content">
                    <span class="badge">${c.level}</span>
                    <h3>${c.title}</h3>
                    <p>${c.description || "Start this learning path."}</p>
                </div>
                <div class="bar-arrow"><i class="ph-bold ph-caret-right"></i></div>
            </div>
        `).join('');
    } else { cList.innerHTML = `<p style="color:var(--text-muted)">No courses found.</p>`; }

    // 2. Fields
    const { data: cats } = await sbClient.from('categories').select('*');
    const fList = document.getElementById('fields-list');
    if(cats?.length) {
        fList.innerHTML = cats.map(c => `
            <div class="bar-card">
                <div class="bar-icon"><i class="ph-fill ph-folder-notch"></i></div>
                <div class="bar-content">
                    <h3>${c.title}</h3>
                    <p>${c.description || "Explore this domain."}</p>
                </div>
                <div class="bar-arrow"><i class="ph-bold ph-caret-right"></i></div>
            </div>
        `).join('');
    }

    // 3. Concepts (Now using List Stack)
    const { data: concepts } = await sbClient.from('concepts').select('*');
    allConcepts = concepts || [];
    renderConcepts(allConcepts);
}

function renderConcepts(list) {
    const listContainer = document.getElementById('concepts-list');
    if(list.length) {
        listContainer.innerHTML = list.map(c => `
            <div class="bar-card">
                <div class="bar-icon"><i class="ph-fill ph-book-bookmark"></i></div>
                <div class="bar-content">
                    <h3>${c.title}</h3>
                    <p>${c.definition}</p>
                </div>
            </div>
        `).join('');
    } else {
        listContainer.innerHTML = `<p style="color:var(--text-muted)">No concepts found.</p>`;
    }
}

function filterConcepts(query) {
    const filtered = allConcepts.filter(c => c.title.toLowerCase().includes(query.toLowerCase()));
    renderConcepts(filtered);
}

// --- 5. UTILITIES ---
function setTheme(c) {
    document.documentElement.style.setProperty('--primary', c);
    document.documentElement.style.setProperty('--primary-glow', c + '4d');
    localStorage.setItem('cyberian-theme', c);
}

async function changePassword() {
    const pass = document.getElementById('new-password').value;
    const msg = document.getElementById('settings-msg');
    if(pass.length < 6) return msg.innerText = "Too short.";
    
    const { error } = await sbClient.auth.updateUser({ password: pass });
    msg.innerText = error ? error.message : "Password updated.";
}

// --- 6. AI CHAT ---
function toggleChat() {
    document.getElementById('ai-window').classList.toggle('visible');
}

async function sendAiMessage() {
    const inp = document.getElementById('ai-input');
    const txt = inp.value; if(!txt) return;
    
    const box = document.getElementById('ai-messages');
    box.innerHTML += `<div class="msg user">${txt}</div>`;
    inp.value = "";
    box.scrollTop = box.scrollHeight;

    try {
        const res = await fetch(`${AI_SERVER_URL}/ask-ai`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ user_id: currentUser.id, question: txt })
        });
        const d = await res.json();
        box.innerHTML += `<div class="msg bot">${d.answer}</div>`;
    } catch(e) {
        box.innerHTML += `<div class="msg bot">Connection Error.</div>`;
    }
    box.scrollTop = box.scrollHeight;
}