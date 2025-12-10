// --- CONFIGURATION ---
const SUPABASE_URL = 'https://exjayvebshmlzdwjbhkv.supabase.co'; 
const SUPABASE_KEY = 'sb_publishable_M_mIHSDGIHaBR2s9K9FkSg_Hy1FMn85'; 
const AI_SERVER_URL = 'https://shyyloww-github-io-1.onrender.com';

const sbClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let isLoginMode = true;
let currentUser = null;
let allConcepts = []; 
let allCategories = []; 
let allVideoMeta = []; 
let userFavorites = [];

// --- EXCLUSION DEFINITIONS ---
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

// --- STATE ---
let pathState = {
    exclusions: [],      
    customOrder: []      
};

let stateHistory = [];
let stateFuture = [];
let currentCourseData = []; // To store the playlist currently being watched

// --- INIT ---
document.addEventListener('DOMContentLoaded', () => {
    // Auth & Nav
    document.getElementById('auth-btn').addEventListener('click', handleAuth);
    document.getElementById('toggle-text').addEventListener('click', toggleAuthMode);
    document.getElementById('logout-btn').addEventListener('click', logout);
    document.getElementById('btn-courses').addEventListener('click', () => navTo('courses'));
    document.getElementById('btn-fields').addEventListener('click', () => navTo('fields'));
    document.getElementById('btn-concepts').addEventListener('click', () => navTo('concepts'));
    document.getElementById('btn-favorites').addEventListener('click', () => navTo('favorites'));
    document.getElementById('btn-settings').addEventListener('click', () => navTo('settings'));
    document.getElementById('update-pass-btn').addEventListener('click', changePassword);
    
    document.querySelectorAll('.swatch').forEach(s => s.addEventListener('click', (e) => setTheme(e.target.dataset.color)));

    // AI & Search
    document.getElementById('ai-toggle-btn').addEventListener('click', toggleChat);
    document.getElementById('ai-close-btn').addEventListener('click', toggleChat);
    document.getElementById('ai-send-btn').addEventListener('click', sendAiMessage);
    document.getElementById('ai-input').addEventListener('keypress', (e) => { if(e.key === 'Enter') sendAiMessage(); });
    document.querySelector('.concept-search').addEventListener('keyup', (e) => filterConcepts(e.target.value));

    // Path Builder
    document.getElementById('btn-save-path').addEventListener('click', savePathPreferences);
    document.getElementById('btn-undo').addEventListener('click', undoPathState);
    document.getElementById('btn-redo').addEventListener('click', redoPathState);
    document.getElementById('btn-smart-sort').addEventListener('click', runSmartSort);

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
    container.querySelectorAll('input').forEach(chk => {
        chk.addEventListener('change', (e) => toggleExclusion(e.target.dataset.exclude));
    });
}

// --- AUTH ---
async function handleAuth() {
    const u = document.getElementById('username').value.trim();
    const p = document.getElementById('password').value;
    const email = u + "@cyberian.io";
    if(isLoginMode) {
        const { error } = await sbClient.auth.signInWithPassword({ email, password: p });
        if(!error) location.reload(); else document.getElementById('auth-msg').innerText = error.message;
    } else {
        const { error } = await sbClient.auth.signUp({ email, password: p, options: { data: { username: u } } });
        if(!error) location.reload(); else document.getElementById('auth-msg').innerText = error.message;
    }
}
function toggleAuthMode() { isLoginMode = !isLoginMode; document.getElementById('auth-btn').innerText = isLoginMode ? "Initialize" : "Create"; }
async function logout() { await sbClient.auth.signOut(); location.reload(); }

async function initApp() {
    const savedTheme = localStorage.getItem('cyberian-theme');
    if(savedTheme) setTheme(savedTheme);
    const { data: { session } } = await sbClient.auth.getSession();
    if(session) {
        currentUser = session.user;
        document.getElementById('auth-container').classList.add('hidden');
        document.getElementById('app-container').style.display = 'flex';
        document.getElementById('user-display').innerText = currentUser.user_metadata?.username || "Operator";
        
        await Promise.all([loadUserPreferences(), loadFavorites()]);
        await loadData();
    } else { document.getElementById('auth-container').style.display = 'flex'; }
}

// --- DATA LOADING ---
async function loadData() {
    // 1. Load Courses (NOW CLICKABLE)
    const { data: courses } = await sbClient.from('courses').select('*').order('id');
    const cList = document.getElementById('course-list');
    
    if (courses && courses.length > 0) {
        cList.innerHTML = courses.map(c => `
            <div class="bar-card course-card" onclick="openCourse('${c.id}', '${c.title.replace(/'/g,"\\'")}')">
                <div class="bar-icon"><i class="ph-fill ph-graduation-cap"></i></div>
                <div class="bar-content">
                    <span class="badge">${c.level}</span>
                    <h3>${c.title}</h3>
                    <p>${c.description || "Start this learning path."}</p>
                </div>
                <div class="bar-arrow"><i class="ph-bold ph-caret-right"></i></div>
            </div>
        `).join('');
    } else {
        cList.innerHTML = `<p style="color:var(--text-muted)">No courses available.</p>`;
    }
    
    // 2. Load Categories
    const { data: cats } = await sbClient.from('categories').select('*');
    allCategories = cats || [];

    // 3. Load Video Meta
    const { data: vids } = await sbClient.from('videos').select('id, category_id, tags');
    allVideoMeta = vids || [];

    // 4. Load Concepts
    const { data: conc } = await sbClient.from('concepts').select('*');
    allConcepts = conc || [];
    renderConcepts(allConcepts);

    renderFields(); 
}

async function loadFavorites() {
    const { data } = await sbClient.from('favorites').select('video_id').eq('user_id', currentUser.id);
    userFavorites = data ? data.map(f => f.video_id) : [];
}

// --- COURSE LOGIC ---
async function openCourse(courseId, courseTitle) {
    // 1. Fetch Syllabus
    const { data: items, error } = await sbClient
        .from('course_items')
        .select(`order_index, videos ( id, title, url )`)
        .eq('course_id', courseId)
        .order('order_index');

    if (error || !items || items.length === 0) {
        alert("This course is currently empty.");
        return;
    }

    // 2. Store data for sidebar
    currentCourseData = items.map(i => ({...i.videos, order: i.order_index}));

    // 3. Play first video
    const firstVid = currentCourseData[0];
    playCourseVideo(firstVid, courseTitle);
}

function playCourseVideo(video, courseTitle) {
    // 1. Setup Player
    openLesson(video.title, video.url, courseTitle);

    // 2. Render Sidebar Playlist
    const playlistContainer = document.getElementById('course-playlist-container');
    const playlistItems = document.getElementById('course-playlist-items');
    
    playlistContainer.classList.remove('hidden');
    
    playlistItems.innerHTML = currentCourseData.map(v => {
        const isPlaying = v.id === video.id ? 'style="color:var(--primary); font-weight:bold;"' : '';
        const icon = v.id === video.id ? 'ph-fill ph-play-circle' : 'ph ph-circle';
        
        return `
        <div class="playlist-item" onclick="playCourseVideo({id:${v.id}, title:'${v.title.replace(/'/g,"\\'")}', url:'${v.url}'}, '${courseTitle}')">
            <span style="opacity:0.5; font-size:0.8rem; width:20px;">#${v.order}</span>
            <i class="${icon}" ${isPlaying}></i>
            <span ${isPlaying}>${v.title}</span>
        </div>
        `;
    }).join('');
}

// --- SMART PATH LOGIC ---
function pushHistory() {
    stateHistory.push(JSON.parse(JSON.stringify(pathState)));
    stateFuture = [];
    updateUndoRedoButtons();
}

async function runSmartSort() {
    const btn = document.getElementById('btn-smart-sort');
    btn.classList.add('loading-pulse');

    const visibleCats = getVisibleCategories();
    if(visibleCats.length === 0) {
        alert("No visible categories to sort!");
        btn.classList.remove('loading-pulse');
        return;
    }

    try {
        const catList = visibleCats.map(c => ({ id: c.id, title: c.title }));
        const res = await fetch(`${AI_SERVER_URL}/smart-sort`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ categories: catList })
        });
        const data = await res.json();

        if(data.sorted_ids && Array.isArray(data.sorted_ids)) {
            pushHistory();
            pathState.customOrder = data.sorted_ids;
            renderFields(); 
            document.getElementById('path-status').innerText = "Path optimized for beginner progression.";
            setTimeout(() => document.getElementById('path-status').innerText = "", 4000);
        } else { alert("AI sorting failed."); }
    } catch(e) { console.error(e); alert("Connection failed."); }
    btn.classList.remove('loading-pulse');
}

function getVisibleCategories() {
    let forbidden = [];
    pathState.exclusions.forEach(k => { if(exclusionGroups[k]) forbidden.push(...exclusionGroups[k]); });
    const validCategoryIds = new Set();
    allVideoMeta.forEach(v => {
        if(!v.tags) { validCategoryIds.add(v.category_id); return; }
        if (!v.tags.some(t => forbidden.includes(t.toLowerCase()))) validCategoryIds.add(v.category_id);
    });
    return allCategories.filter(c => validCategoryIds.has(c.id));
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
    } else { pathState.exclusions.push(tagGroup); }
    updateUIFromState();
    renderFields();
}

function updateUIFromState() {
    document.querySelectorAll('#exclusion-toggles input').forEach(chk => {
        chk.checked = pathState.exclusions.includes(chk.dataset.exclude);
    });
}

// --- RENDER FIELDS ---
function renderFields() {
    const fList = document.getElementById('fields-list');
    let visibleCats = getVisibleCategories();

    if (pathState.customOrder && pathState.customOrder.length > 0) {
        visibleCats.sort((a, b) => {
            const indexA = pathState.customOrder.indexOf(a.id);
            const indexB = pathState.customOrder.indexOf(b.id);
            const rankA = indexA === -1 ? 9999 : indexA;
            const rankB = indexB === -1 ? 9999 : indexB;
            return rankA - rankB;
        });
    } else { visibleCats.sort((a, b) => a.id - b.id); }

    if(visibleCats.length > 0) {
        fList.innerHTML = visibleCats.map(c => `
            <div class="bar-card category-card" data-category-id="${c.id}" data-category-title="${c.title}">
                <div class="bar-icon"><i class="ph-fill ph-folder-notch"></i></div>
                <div class="bar-content"><h3>${c.title}</h3><p>${c.description}</p></div>
                <div class="bar-arrow"><i class="ph-bold ph-caret-right"></i></div>
            </div>
            <div class="lessons-dropdown" id="lessons-${c.id}"><p style="padding:1rem;">Click to load...</p></div>
        `).join('');
        document.querySelectorAll('.category-card').forEach(card => card.addEventListener('click', toggleCategoryLessons));
    } else { fList.innerHTML = `<div style="text-align:center; padding:2rem; color:var(--text-muted)">All content hidden by your filters.</div>`; }
}

// --- FIELD LESSONS & FAVORITES ---
async function toggleCategoryLessons(e) {
    const card = e.currentTarget;
    const catId = card.dataset.categoryId;
    const dropdown = document.getElementById(`lessons-${catId}`);
    const arrow = card.querySelector('.bar-arrow i');

    if (dropdown.classList.contains('active')) {
        dropdown.classList.remove('active'); dropdown.style.maxHeight='0'; 
        card.classList.remove('active'); arrow.classList.replace('ph-caret-down','ph-caret-right');
        return;
    }

    document.querySelectorAll('.lessons-dropdown.active').forEach(d => {
        d.classList.remove('active'); d.style.maxHeight='0';
        d.previousElementSibling.classList.remove('active');
        d.previousElementSibling.querySelector('.bar-arrow i').classList.replace('ph-caret-down','ph-caret-right');
    });

    dropdown.classList.add('active'); card.classList.add('active'); arrow.classList.replace('ph-caret-right','ph-caret-down');
    dropdown.innerHTML = '<p style="padding:1rem;">Loading...</p>';

    const { data: lessons } = await sbClient.from('videos').select('*').eq('category_id', catId).order('id', {ascending:true});
    let forbidden = [];
    pathState.exclusions.forEach(k => { if(exclusionGroups[k]) forbidden.push(...exclusionGroups[k]); });
    const visible = lessons.filter(v => {
        if(!v.tags) return true;
        return !v.tags.some(t => forbidden.includes(t.toLowerCase()));
    });

    if(visible.length) {
        dropdown.innerHTML = visible.map(l => {
            const isFav = userFavorites.includes(l.id);
            const heartClass = isFav ? "ph-fill ph-heart" : "ph ph-heart";
            const heartColor = isFav ? "#f38ba8" : "var(--text-muted)";
            return `
            <div class="lesson-item">
                <i class="ph ph-play-circle" style="color:var(--primary)"></i>
                <span style="flex:1; cursor:pointer;" onclick="openLesson('${l.title.replace(/'/g,"\\'")}', '${l.url}', '${card.dataset.categoryTitle.replace(/'/g,"\\'")}')">${l.title}</span>
                <i class="${heartClass}" style="cursor:pointer; color:${heartColor}; margin-right:10px;" onclick="toggleFavorite(${l.id}, this)"></i>
                <i class="ph-bold ph-caret-right"></i>
            </div>
        `}).join('');
    } else { dropdown.innerHTML = `<p style="padding:1rem;color:var(--text-muted)">Hidden by filters.</p>`; }
    dropdown.style.maxHeight = dropdown.scrollHeight + 'px';
}

async function toggleFavorite(vidId, icon) {
    event.stopPropagation();
    if (userFavorites.includes(vidId)) {
        await sbClient.from('favorites').delete().match({ user_id: currentUser.id, video_id: vidId });
        userFavorites = userFavorites.filter(id => id !== vidId);
        icon.className = "ph ph-heart"; icon.style.color = "var(--text-muted)";
    } else {
        await sbClient.from('favorites').insert({ user_id: currentUser.id, video_id: vidId });
        userFavorites.push(vidId);
        icon.className = "ph-fill ph-heart"; icon.style.color = "#f38ba8";
    }
    if (document.getElementById('view-favorites').classList.contains('active-view')) renderFavoritesView();
}

async function renderFavoritesView() {
    const grid = document.getElementById('favorites-grid');
    if(userFavorites.length === 0) { grid.innerHTML = `<p style="color:var(--text-muted)">No favorites yet.</p>`; return; }
    const { data: vids } = await sbClient.from('videos').select('*').in('id', userFavorites);
    grid.innerHTML = vids.map(v => `
        <div class="bar-card">
            <div class="bar-icon"><i class="ph-fill ph-heart" style="color:#f38ba8"></i></div>
            <div class="bar-content"><h3>${v.title}</h3><p>Click arrow to play</p></div>
            <div class="bar-arrow" onclick="openLesson('${v.title.replace(/'/g,"\\'")}', '${v.url}', 'Favorites')"><i class="ph-bold ph-play"></i></div>
            <i class="ph ph-trash" style="margin-left:15px; color:var(--text-muted); cursor:pointer;" onclick="toggleFavorite(${v.id}, this.parentNode)"></i>
        </div>
    `).join('');
}

function openLesson(t, u, c) {
    let vid = "";
    try { const o = new URL(u); vid = o.hostname.includes('youtu.be') ? o.pathname.slice(1) : o.searchParams.get('v'); } catch(e){}
    if(vid) {
        document.getElementById('lesson-title').innerText=t;
        document.getElementById('lesson-category').innerText=c;
        document.getElementById('video-player').src=`https://www.youtube.com/embed/${vid}?autoplay=1`;
        // Hide Playlist by default, show only if playing a course
        document.getElementById('course-playlist-container').classList.add('hidden');
        navTo('lesson');
    }
}

// Utils
function navTo(s) {
    if(document.querySelector('.active-view').id === 'view-lesson' && s !== 'lesson') {
        document.getElementById('video-player').src="";
        document.getElementById('course-playlist-container').classList.add('hidden');
    }
    if(s === 'favorites') renderFavoritesView();
    document.querySelectorAll('.view').forEach(v=>v.classList.remove('active-view'));
    document.getElementById('view-'+s).classList.add('active-view');
    document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
    document.getElementById('btn-'+s)?.classList.add('active');
}

function renderConcepts(l) { document.getElementById('concepts-list').innerHTML = l.length ? l.map(c=>`<div class="bar-card"><div class="bar-icon"><i class="ph-fill ph-book-bookmark"></i></div><div class="bar-content"><h3>${c.title}</h3><p>${c.definition}</p></div></div>`).join('') : `<p>No concepts.</p>`; }
function filterConcepts(q) { renderConcepts(allConcepts.filter(c=>c.title.toLowerCase().includes(q.toLowerCase()))); }
async function loadUserPreferences() {
    try {
        const { data } = await sbClient.from('profiles').select('learning_preferences').eq('id', currentUser.id).single();
        if (data?.learning_preferences) pathState = { ...pathState, ...data.learning_preferences };
        updateUIFromState();
    } catch(e) {}
}
async function savePathPreferences() {
    await sbClient.from('profiles').update({ learning_preferences: pathState }).eq('id', currentUser.id);
    const s = document.getElementById('path-status'); s.innerText = "Config Saved."; setTimeout(()=>s.innerText="", 2000);
}
function setTheme(c) { document.documentElement.style.setProperty('--primary', c); document.documentElement.style.setProperty('--primary-glow', c+'4d'); localStorage.setItem('cyberian-theme',c); }
async function changePassword() { 
    const pass = document.getElementById('new-password').value;
    if(pass.length < 6) { document.getElementById('settings-msg').innerText="Too short."; return; }
    await sbClient.auth.updateUser({password: pass}); 
    document.getElementById('settings-msg').innerText="Updated.";
}

function toggleChat() { 
    const win = document.getElementById('ai-window');
    win.classList.toggle('visible');
    if (win.classList.contains('visible')) setTimeout(() => document.getElementById('ai-input').focus(), 300);
}
async function sendAiMessage() {
    const inp = document.getElementById('ai-input');
    const txt = inp.value; if(!txt)return;
    const box = document.getElementById('ai-messages');
    box.innerHTML+=`<div class="msg user">${txt}</div>`;
    inp.value=""; box.scrollTop=box.scrollHeight;
    const loadId = 'load-'+Date.now();
    box.innerHTML+=`<div id="${loadId}" class="msg bot loading">Thinking...</div>`;
    try {
        const res = await fetch(`${AI_SERVER_URL}/ask-ai`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({user_id:currentUser.id,question:txt})});
        const d = await res.json(); document.getElementById(loadId).remove();
        box.innerHTML+=`<div class="msg bot">${d.answer}</div>`;
    } catch(e){ document.getElementById(loadId).remove(); box.innerHTML+=`<div class="msg bot">Error.</div>`; }
    box.scrollTop=box.scrollHeight;
}