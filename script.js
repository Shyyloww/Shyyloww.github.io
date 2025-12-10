// --- CONFIGURATION ---
const SUPABASE_URL = 'https://exjayvebshmlzdwjbhkv.supabase.co'; 
const SUPABASE_KEY = 'sb_publishable_M_mIHSDGIHaBR2s9K9FkSg_Hy1FMn85'; 
const AI_SERVER_URL = 'https://shyyloww-github-io-1.onrender.com';

const sbClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let isLoginMode = true;
let currentUser = null;
let allConcepts = []; 
let allCategories = []; 

// --- SMART PATH: EXCLUSION DEFINITIONS ---
// Keys are UI labels, Values are DB tags to filter out
const exclusionGroups = {
    'Code & Scripting': ['programming', 'scripting', 'bash', 'powershell', 'python', 'sql', 'html', 'javascript', 'c'],
    'Windows Internals': ['windows', 'registry', 'active directory', 'ntlm', 'kerberos'],
    'Linux Systems': ['linux', 'kernel', 'shell', 'filesystem', 'ubuntu', 'kali'],
    'Networking Core': ['network', 'osi', 'tcp', 'ip', 'subnet', 'dns', 'dhcp', 'protocols'],
    'Web Security': ['web', 'xss', 'sqli', 'csrf', 'owasp', 'http', 'cookies'],
    'Cloud & VMs': ['cloud', 'virtualization', 'vms', 'containers', 'aws', 'azure'],
    'Cryptography': ['crypto', 'hashing', 'pki', 'encryption', 'salting'],
    'Hardware & IoT': ['hardware', 'iot', 'industrial', 'cpu', 'ram', 'gpu', 'binary'],
    'Compliance & Law': ['ethics', 'risk', 'compliance', 'gdpr', 'hipaa', 'legal'],
    'Red Team Ops': ['redteam', 'exploitation', 'malware', 'metasploit', 'c2', 'social engineering'],
    'Blue Team Ops': ['blueteam', 'forensics', 'siem', 'threat hunting', 'soc', 'yara']
};

// --- STATE MANAGEMENT ---
let pathState = {
    exclusions: [] // Array of exclusion keys (e.g. ['Code & Scripting'])
};

let stateHistory = [];
let stateFuture = [];

// --- 1. SETUP EVENT LISTENERS ---
document.addEventListener('DOMContentLoaded', () => {
    // Auth Buttons
    document.getElementById('auth-btn').addEventListener('click', handleAuth);
    document.getElementById('toggle-text').addEventListener('click', toggleAuthMode);
    document.getElementById('logout-btn').addEventListener('click', logout);

    // Nav Buttons
    document.getElementById('btn-courses').addEventListener('click', () => navTo('courses'));
    document.getElementById('btn-fields').addEventListener('click', () => navTo('fields'));
    document.getElementById('btn-concepts').addEventListener('click', () => navTo('concepts'));
    document.getElementById('btn-favorites').addEventListener('click', () => navTo('favorites'));
    document.getElementById('btn-settings').addEventListener('click', () => navTo('settings'));

    // Settings
    document.getElementById('update-pass-btn').addEventListener('click', changePassword);
    document.querySelectorAll('.swatch').forEach(s => s.addEventListener('click', (e) => setTheme(e.target.dataset.color)));

    // AI Buttons
    document.getElementById('ai-toggle-btn').addEventListener('click', toggleChat);
    document.getElementById('ai-close-btn').addEventListener('click', toggleChat);
    document.getElementById('ai-send-btn').addEventListener('click', sendAiMessage);
    document.getElementById('ai-input').addEventListener('keypress', (e) => { if(e.key === 'Enter') sendAiMessage(); });

    // Path Builder Interactions
    document.getElementById('btn-save-path').addEventListener('click', savePathPreferences);
    document.getElementById('btn-undo').addEventListener('click', undoPathState);
    document.getElementById('btn-redo').addEventListener('click', redoPathState);

    // Search
    document.querySelector('.concept-search').addEventListener('keyup', (e) => filterConcepts(e.target.value));

    // Initialize Exclusion Grid
    initExclusionGrid();

    initApp();
});

function initExclusionGrid() {
    const container = document.getElementById('exclusion-toggles');
    container.innerHTML = Object.keys(exclusionGroups).map(key => `
        <label class="cat-toggle">
            <input type="checkbox" data-exclude="${key}">
            <span>${key}</span>
        </label>
    `).join('');

    // Attach listeners after creation
    container.querySelectorAll('input').forEach(chk => {
        chk.addEventListener('change', (e) => toggleExclusion(e.target.dataset.exclude));
    });
}

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
                email: email, password: p, options: { data: { username: u } }
            });
            if(error) throw error;
            m.innerText = "ID Created. Logging in...";
            setTimeout(() => location.reload(), 1500);
        }
    } catch (err) { document.getElementById('auth-msg').innerText = err.message; }
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
        document.getElementById('user-display').innerText = currentUser.user_metadata?.username || currentUser.email.split('@')[0];
        
        await loadUserPreferences();
        loadData();
    } else {
        document.getElementById('auth-container').style.display = 'flex';
    }
}

// --- SMART PATH LOGIC ---

function pushHistory() {
    stateHistory.push(JSON.parse(JSON.stringify(pathState)));
    stateFuture = [];
    updateUndoRedoButtons();
}

function undoPathState() {
    if (stateHistory.length === 0) return;
    stateFuture.push(JSON.parse(JSON.stringify(pathState)));
    pathState = stateHistory.pop();
    updateUIFromState();
    renderFields(); 
    updateUndoRedoButtons();
}

function redoPathState() {
    if (stateFuture.length === 0) return;
    stateHistory.push(JSON.parse(JSON.stringify(pathState)));
    pathState = stateFuture.pop();
    updateUIFromState();
    renderFields();
    updateUndoRedoButtons();
}

function updateUndoRedoButtons() {
    document.getElementById('btn-undo').disabled = stateHistory.length === 0;
    document.getElementById('btn-redo').disabled = stateFuture.length === 0;
}

function toggleExclusion(tagGroup) {
    pushHistory();
    if (pathState.exclusions.includes(tagGroup)) {
        pathState.exclusions = pathState.exclusions.filter(e => e !== tagGroup);
    } else {
        pathState.exclusions.push(tagGroup);
    }
    updateUIFromState();
    // No need to re-render fields immediately unless you want to hide empty categories dynamically.
    // The filtering happens when opening a category dropdown.
    renderFields(); 
}

function updateUIFromState() {
    document.querySelectorAll('#exclusion-toggles input').forEach(chk => {
        chk.checked = pathState.exclusions.includes(chk.dataset.exclude);
    });
}

// --- DATA PERSISTENCE ---
async function loadUserPreferences() {
    try {
        const { data } = await sbClient.from('profiles').select('learning_preferences').eq('id', currentUser.id).single();
        if (data && data.learning_preferences) {
            // Merge defaults in case schema changed
            pathState = { ...pathState, ...data.learning_preferences };
        }
        updateUIFromState();
    } catch (e) { console.log("Using default preferences"); }
}

async function savePathPreferences() {
    const btn = document.getElementById('btn-save-path');
    btn.innerText = "Saving...";
    try {
        await sbClient.from('profiles').update({ learning_preferences: pathState }).eq('id', currentUser.id);
        document.getElementById('path-status').innerText = "Path saved.";
        setTimeout(() => document.getElementById('path-status').innerText = "", 3000);
    } catch(e) { document.getElementById('path-status').innerText = "Save failed."; }
    btn.innerText = "Save Filters";
}

// --- DATA LOADING & RENDERING ---

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

    // 2. Categories
    const { data: cats } = await sbClient.from('categories').select('*');
    allCategories = cats || [];
    renderFields(); 

    // 3. Concepts
    const { data: concepts } = await sbClient.from('concepts').select('*');
    allConcepts = concepts || [];
    renderConcepts(allConcepts);
}

function renderFields() {
    const fList = document.getElementById('fields-list');
    
    // Sort Categories (Default by ID for stability)
    let sortedCats = [...allCategories].sort((a, b) => a.id - b.id);

    if(sortedCats.length > 0) {
        fList.innerHTML = sortedCats.map(c => `
            <div class="bar-card category-card" id="card-${c.id}" data-category-id="${c.id}" data-category-title="${c.title}">
                <div class="bar-icon"><i class="ph-fill ph-folder-notch"></i></div>
                <div class="bar-content">
                    <h3>${c.title}</h3>
                    <p>${c.description || "Explore this domain."}</p>
                </div>
                <div class="bar-arrow"><i class="ph-bold ph-caret-right"></i></div>
            </div>
            <div class="lessons-dropdown" id="lessons-${c.id}">
                <p style="padding:1rem; color:var(--text-muted);">Click to load lessons...</p>
            </div>
        `).join('');

        document.querySelectorAll('.category-card').forEach(card => {
            card.addEventListener('click', toggleCategoryLessons);
        });
    }
}

async function toggleCategoryLessons(event) {
    const card = event.currentTarget;
    const categoryId = card.dataset.categoryId;
    const categoryTitle = card.dataset.categoryTitle;
    const dropdownId = `lessons-${categoryId}`;
    const dropdown = document.getElementById(dropdownId);
    const arrowIcon = card.querySelector('.bar-arrow i');

    // Toggle Logic
    if (dropdown.classList.contains('active')) {
        dropdown.classList.remove('active');
        dropdown.style.maxHeight = '0';
        card.classList.remove('active');
        arrowIcon.classList.remove('ph-caret-down');
        arrowIcon.classList.add('ph-caret-right');
        setTimeout(() => dropdown.innerHTML = '<p style="padding:1rem; color:var(--text-muted);">Click to load lessons...</p>', 300);
        return;
    }

    // Close others
    document.querySelectorAll('.lessons-dropdown.active').forEach(openDropdown => {
        openDropdown.classList.remove('active');
        openDropdown.style.maxHeight = '0';
        const openCard = openDropdown.previousElementSibling;
        if(openCard) {
            openCard.classList.remove('active');
            openCard.querySelector('.bar-arrow i').classList.replace('ph-caret-down', 'ph-caret-right');
        }
        setTimeout(() => openDropdown.innerHTML = '<p style="padding:1rem; color:var(--text-muted);">Click to load lessons...</p>', 300);
    });

    // Open this
    dropdown.classList.add('active');
    card.classList.add('active');
    arrowIcon.classList.replace('ph-caret-right', 'ph-caret-down');
    dropdown.innerHTML = '<p style="padding:1rem; color:var(--text-muted);">Analyzing filters...</p>';

    try {
        const { data: lessons, error } = await sbClient
            .from('videos')
            .select('title, url, tags, id')
            .eq('category_id', categoryId)
            .order('id', { ascending: true });

        if (error) throw error;

        // --- DEEP FILTERING LOGIC ---
        // 1. Build a list of all forbidden tags
        let forbiddenTags = [];
        pathState.exclusions.forEach(groupKey => {
            if (exclusionGroups[groupKey]) {
                forbiddenTags = [...forbiddenTags, ...exclusionGroups[groupKey]];
            }
        });

        // 2. Filter videos
        const visibleLessons = lessons.filter(video => {
            if (!video.tags || video.tags.length === 0) return true;
            // If video has a tag that matches a forbidden tag, exclude it
            const hasForbiddenTag = video.tags.some(tag => forbiddenTags.includes(tag.toLowerCase()));
            return !hasForbiddenTag;
        });

        if (visibleLessons.length > 0) {
            dropdown.innerHTML = visibleLessons.map(lesson => `
                <div class="lesson-item" onclick="openLesson('${lesson.title.replace(/'/g, "\\'")}', '${lesson.url}', '${categoryTitle.replace(/'/g, "\\'")}')" style="cursor:pointer">
                    <i class="ph ph-play-circle"></i>
                    <span>${lesson.title}</span>
                    <i class="ph-bold ph-caret-right"></i>
                </div>
            `).join('');
        } else {
            dropdown.innerHTML = `<p style="padding:1rem; color:var(--text-muted);">All lessons hidden by your filters.</p>`;
        }
    } catch (err) {
        console.error(err);
        dropdown.innerHTML = `<p style="padding:1rem; color:var(--text-muted);">Unable to load data.</p>`;
    }
    dropdown.style.maxHeight = dropdown.scrollHeight + 'px';
}

function openLesson(title, url, categoryName) {
    let videoId = "";
    try {
        const urlObj = new URL(url);
        if (urlObj.hostname.includes('youtu.be')) { videoId = urlObj.pathname.slice(1); }
        else if (urlObj.hostname.includes('youtube.com')) { videoId = urlObj.searchParams.get('v'); }
    } catch (e) {}

    if (!videoId) { alert("Video unavailable."); return; }

    document.getElementById('lesson-title').innerText = title;
    document.getElementById('lesson-category').innerText = categoryName;
    document.getElementById('video-player').src = `https://www.youtube.com/embed/${videoId}?autoplay=1`;
    navTo('lesson');
}

// Navigation Helper
function navTo(sec) {
    if (document.getElementById('view-lesson').classList.contains('active-view') && sec !== 'lesson') {
        document.getElementById('video-player').src = ""; 
    }
    document.querySelectorAll('.view').forEach(el => el.classList.remove('active-view'));
    document.getElementById('view-'+sec).classList.add('active-view');
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    const btn = document.getElementById('btn-'+sec);
    if(btn) btn.classList.add('active');
}

// Concepts & Utils
function renderConcepts(list) {
    const el = document.getElementById('concepts-list');
    el.innerHTML = list.length ? list.map(c => `
        <div class="bar-card">
            <div class="bar-icon"><i class="ph-fill ph-book-bookmark"></i></div>
            <div class="bar-content"><h3>${c.title}</h3><p>${c.definition}</p></div>
        </div>`).join('') : `<p style="color:var(--text-muted)">No concepts.</p>`;
}
function filterConcepts(query) {
    renderConcepts(allConcepts.filter(c => c.title.toLowerCase().includes(query.toLowerCase())));
}
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

// AI Chat
function toggleChat() {
    const win = document.getElementById('ai-window');
    win.classList.toggle('visible');
    if (win.classList.contains('visible')) { setTimeout(() => { document.getElementById('ai-input').focus(); }, 300); }
}
async function sendAiMessage() {
    const inp = document.getElementById('ai-input');
    const txt = inp.value; if(!txt) return;
    const box = document.getElementById('ai-messages');
    box.innerHTML += `<div class="msg user">${txt}</div>`;
    inp.value = "";
    box.scrollTop = box.scrollHeight;
    const loadingId = "loading-" + Date.now();
    box.innerHTML += `<div id="${loadingId}" class="msg bot loading">Cyberian is thinking...</div>`;
    box.scrollTop = box.scrollHeight;
    try {
        const res = await fetch(`${AI_SERVER_URL}/ask-ai`, {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ user_id: currentUser.id, question: txt })
        });
        const d = await res.json();
        const loader = document.getElementById(loadingId);
        if(loader) loader.remove();
        box.innerHTML += `<div class="msg bot">${d.answer}</div>`;
    } catch(e) {
        const loader = document.getElementById(loadingId);
        if(loader) loader.remove();
        box.innerHTML += `<div class="msg bot">Error.</div>`;
    }
    box.scrollTop = box.scrollHeight;
}