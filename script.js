// --- CONFIGURATION ---
const SUPABASE_URL = 'https://exjayvebshmlzdwjbhkv.supabase.co'; 
const SUPABASE_KEY = 'sb_publishable_M_mIHSDGIHaBR2s9K9FkSg_Hy1FMn85'; 
const AI_SERVER_URL = 'https://shyyloww-github-io-1.onrender.com';

const sbClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let isLoginMode = true;
let currentUser = null;
let allConcepts = []; 
let allCategories = []; 

// --- SMART PATH LOGIC DEFINITIONS ---

// 1. Tag Groups: Maps a UI "Exclusion" to specific video tags
const exclusionGroups = {
    'coding': ['python', 'bash', 'powershell', 'scripting', 'sql', 'html', 'javascript', 'programming', 'c'],
    'math': ['binary', 'hexadecimal', 'crypto', 'hashing', 'algorithms', 'math'],
    'compliance': ['risk', 'management', 'gdpr', 'hipaa', 'pci', 'compliance', 'ethics'],
    'hardware': ['cpu', 'ram', 'gpu', 'iot', 'hardware', 'industrial']
};

// 2. Priority Weights: Determines Order based on Focus
// Higher number = Higher on the page. Default weight is 10.
const categoryPriorities = {
    'general': {}, // Default sorting
    'red': {
        'red-team': 100,
        'app-security': 90,
        'networking': 80,
        'operating-systems-admin': 70,
        'coding-scripting': 60
    },
    'blue': {
        'blue-team': 100,
        'infra-cloud-security': 90,
        'networking': 80,
        'operating-systems-admin': 70,
        'crypto-access-control': 60
    },
    'engineering': {
        'infra-cloud-security': 100,
        'coding-scripting': 90,
        'networking': 80,
        'specialized-frontier-tech': 70
    }
};

// --- STATE MANAGEMENT ---
let pathState = {
    focus: 'general',       // 'general', 'red', 'blue', 'engineering'
    exclusions: []          // Array of exclusion keys (e.g. ['coding', 'math'])
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

    // Focus Radio Buttons
    document.querySelectorAll('input[name="focus"]').forEach(radio => {
        radio.addEventListener('change', (e) => setFocus(e.target.value));
    });

    // Exclusion Checkboxes
    document.querySelectorAll('#exclusion-toggles input').forEach(chk => {
        chk.addEventListener('change', (e) => toggleExclusion(e.target.dataset.exclude));
    });

    // Search
    document.querySelector('.concept-search').addEventListener('keyup', (e) => filterConcepts(e.target.value));

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

// --- NEW: SMART PATH LOGIC ---

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
    renderFields(); // This triggers the resort/refilter
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

function setFocus(newFocus) {
    if (pathState.focus === newFocus) return;
    pushHistory();
    pathState.focus = newFocus;
    renderFields(); // Re-sort categories
}

function toggleExclusion(tagGroup) {
    pushHistory();
    if (pathState.exclusions.includes(tagGroup)) {
        pathState.exclusions = pathState.exclusions.filter(e => e !== tagGroup);
    } else {
        pathState.exclusions.push(tagGroup);
    }
    renderFields(); // Re-render to hide categories that might become empty
    // Note: Video filtering happens inside toggleCategoryLessons, but categories might disappear now.
}

function updateUIFromState() {
    // Set Radio
    const radio = document.querySelector(`input[name="focus"][value="${pathState.focus}"]`);
    if(radio) radio.checked = true;

    // Set Checkboxes
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
        document.getElementById('path-status').innerText = "Path optimized & saved.";
        setTimeout(() => document.getElementById('path-status').innerText = "", 3000);
    } catch(e) { document.getElementById('path-status').innerText = "Save failed."; }
    btn.innerText = "Save Choices";
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

    // 2. Categories (Fetch once)
    const { data: cats } = await sbClient.from('categories').select('*');
    allCategories = cats || [];
    renderFields(); // Smart render

    // 3. Concepts
    const { data: concepts } = await sbClient.from('concepts').select('*');
    allConcepts = concepts || [];
    renderConcepts(allConcepts);
}

// --- THE SMART RENDER LOGIC ---
function renderFields() {
    const fList = document.getElementById('fields-list');
    
    // 1. Sort Categories based on Focus
    const priorities = categoryPriorities[pathState.focus] || {};
    
    // Clone array to sort safely
    let sortedCats = [...allCategories].sort((a, b) => {
        const weightA = priorities[a.slug] || 10; // Default weight
        const weightB = priorities[b.slug] || 10;
        return weightB - weightA; // Descending order (highest priority first)
    });

    // 2. Render
    // Note: We don't filter categories here yet. We let them render.
    // If they are clicked and contain 0 allowed videos (due to exclusions), we could hide them then,
    // OR ideally, we pre-check. For performance, let's keep them visible but empty, or users will be confused.
    // However, if you want to hide empty ones, we'd need to fetch counts first. 
    // For now, let's render the sorted list.

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
    dropdown.innerHTML = '<p style="padding:1rem; color:var(--text-muted);">Analyzing path...</p>';

    try {
        const { data: lessons, error } = await sbClient
            .from('videos')
            .select('title, url, tags, id')
            .eq('category_id', categoryId)
            .order('id', { ascending: true }); // Default to ID order (logical progression)

        if (error) throw error;

        // --- DEEP FILTERING LOGIC ---
        // 1. Build a list of all forbidden tags based on user exclusions
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
            dropdown.innerHTML = `<p style="padding:1rem; color:var(--text-muted);">All lessons in this category are hidden by your "Exclude" settings.</p>`;
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
    try {
        const res = await fetch(`${AI_SERVER_URL}/ask-ai`, {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ user_id: currentUser.id, question: txt })
        });
        const d = await res.json();
        box.innerHTML += `<div class="msg bot">${d.answer}</div>`;
    } catch(e) { box.innerHTML += `<div class="msg bot">Error.</div>`; }
    box.scrollTop = box.scrollHeight;
}