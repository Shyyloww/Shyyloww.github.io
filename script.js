// --- CONFIGURATION ---
const SUPABASE_URL = 'https://exjayvebshmlzdwjbhkv.supabase.co'; 
const SUPABASE_KEY = 'sb_publishable_M_mIHSDGIHaBR2s9K9FkSg_Hy1FMn85'; 
const AI_SERVER_URL = 'https://shyyloww-github-io-1.onrender.com'; // Still needed for AI chat

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
                email: email, password: p,
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
    // Fetch categories with their IDs
    const { data: cats, error: catsError } = await sbClient.from('categories').select('*');
    if (catsError) {
        console.error("Error fetching categories:", catsError.message);
        document.getElementById('fields-list').innerHTML = `<p style="color:var(--text-muted)">Failed to load fields.</p>`;
        return;
    }

    const fList = document.getElementById('fields-list');
    if(cats?.length) {
        fList.innerHTML = cats.map(c => `
            <div class="bar-card category-card" data-category-id="${c.id}" data-category-title="${c.title}">
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

        // Attach event listeners to each category card
        document.querySelectorAll('.category-card').forEach(card => {
            card.addEventListener('click', toggleCategoryLessons);
        });

    } else { fList.innerHTML = `<p style="color:var(--text-muted)">No fields found.</p>`; }

    // 3. Concepts
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

// --- UPDATED FUNCTION: TOGGLE CATEGORY LESSONS (FETCH FROM SUPABASE) ---
async function toggleCategoryLessons(event) {
    const card = event.currentTarget;
    const categoryId = card.dataset.categoryId; // Use category ID
    const dropdownId = `lessons-${categoryId}`;
    const dropdown = document.getElementById(dropdownId);
    const arrowIcon = card.querySelector('.bar-arrow i');

    if (dropdown.classList.contains('active')) {
        // If already active, hide it
        dropdown.classList.remove('active');
        dropdown.style.maxHeight = '0';
        card.classList.remove('active'); // Remove active class from card
        arrowIcon.classList.remove('ph-caret-down');
        arrowIcon.classList.add('ph-caret-right');
        setTimeout(() => dropdown.innerHTML = '<p style="padding:1rem; color:var(--text-muted);">Click to load lessons...</p>', 300); // Clear after animation
    } else {
        // Hide all other open dropdowns first
        document.querySelectorAll('.lessons-dropdown.active').forEach(openDropdown => {
            openDropdown.classList.remove('active');
            openDropdown.style.maxHeight = '0';
            const openCard = openDropdown.previousElementSibling; // Get the associated card
            if (openCard) {
                openCard.classList.remove('active'); // Remove active class from previous card
                const openArrowIcon = openCard.querySelector('.bar-arrow i');
                openArrowIcon.classList.remove('ph-caret-down');
                openArrowIcon.classList.add('ph-caret-right');
            }
            // Clear content of previously opened dropdowns
            setTimeout(() => openDropdown.innerHTML = '<p style="padding:1rem; color:var(--text-muted);">Click to load lessons...</p>', 300);
        });

        // Show this dropdown
        dropdown.classList.add('active');
        card.classList.add('active'); // Add active class to current card
        arrowIcon.classList.remove('ph-caret-right');
        arrowIcon.classList.add('ph-caret-down');
        dropdown.innerHTML = '<p style="padding:1rem; color:var(--text-muted);">Loading lessons...</p>'; // Show loading

        // Fetch lessons from Supabase
        try {
            const { data: lessons, error } = await sbClient
                .from('videos')
                .select('title, url')
                .eq('category_id', categoryId);

            if (error) throw error;

            if (lessons && lessons.length > 0) {
                dropdown.innerHTML = lessons.map(lesson => `
                    <a href="${lesson.url}" target="_blank" class="lesson-item">
                        <i class="ph ph-video"></i>
                        <span>${lesson.title}</span>
                        <i class="ph-bold ph-arrow-square-out"></i>
                    </a>
                `).join('');
            } else {
                dropdown.innerHTML = `<p style="padding:1rem; color:var(--text-muted);">No lessons found for this category.</p>`;
            }
        } catch (error) {
            console.error('Error fetching category lessons from Supabase:', error);
            dropdown.innerHTML = `<p style="padding:1rem; color:var(--text-muted);">Failed to load lessons. Please try again.</p>`;
        }
        // Set max-height after content is loaded to allow transition
        dropdown.style.maxHeight = dropdown.scrollHeight + 'px';
    }
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

// --- 6. AI CHAT (UPDATED) ---
function toggleChat() {
    const win = document.getElementById('ai-window');
    win.classList.toggle('visible');
    
    // Auto-focus the input box when opening
    if (win.classList.contains('visible')) {
        setTimeout(() => {
            document.getElementById('ai-input').focus();
        }, 300); // 300ms delay to allow the slide-up animation to finish
    }
}

async function sendAiMessage() {
    const inp = document.getElementById('ai-input');
    const txt = inp.value; 
    if(!txt) return;
    
    const box = document.getElementById('ai-messages');
    
    // 1. Add User Message
    box.innerHTML += `<div class="msg user">${txt}</div>`;
    inp.value = "";
    box.scrollTop = box.scrollHeight;

    // 2. Add Loading Indicator
    const loadingId = "loading-" + Date.now();
    box.innerHTML += `<div id="${loadingId}" class="msg bot loading">Cyberian is thinking...</div>`;
    box.scrollTop = box.scrollHeight;

    try {
        const res = await fetch(`${AI_SERVER_URL}/ask-ai`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ user_id: currentUser.id, question: txt })
        });
        const d = await res.json();
        
        // 3. Remove Loading Indicator
        const loader = document.getElementById(loadingId);
        if(loader) loader.remove();

        // 4. Add Real Response
        box.innerHTML += `<div class="msg bot">${d.answer}</div>`;
    } catch(e) {
        // Remove loader and show error
        const loader = document.getElementById(loadingId);
        if(loader) loader.remove();
        box.innerHTML += `<div class="msg bot">Connection Error.</div>`;
    }
    box.scrollTop = box.scrollHeight;
}