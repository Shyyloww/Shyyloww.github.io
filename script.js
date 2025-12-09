// 1. SETUP
const SUPABASE_URL = 'https://exjayvebshmlzdwjbhkv.supabase.co'; 
const SUPABASE_KEY = 'sb_publishable_M_mIHSDGIHaBR2s9K9FkSg_Hy1FMn85'; 
const AI_SERVER_URL = 'https://shyyloww-github-io-1.onrender.com';

const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentUser = null;
let isLoginMode = true; // Toggle between Login and Signup

// 2. AUTHENTICATION LOGIC
async function handleAuth() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const msg = document.getElementById('auth-msg');
    
    msg.innerText = "Processing...";

    if (isLoginMode) {
        // LOGIN
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
            msg.innerText = "Error: " + error.message;
        } else {
            window.location.reload();
        }
    } else {
        // SIGNUP
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: { data: { username: email.split('@')[0] } } // Default username from email
        });
        if (error) {
            msg.innerText = "Error: " + error.message;
        } else {
            msg.innerText = "Success! Please log in.";
            toggleAuthMode();
        }
    }
}

function toggleAuthMode() {
    isLoginMode = !isLoginMode;
    document.getElementById('auth-btn').innerText = isLoginMode ? "Log In" : "Sign Up";
    document.getElementById('auth-subtitle').innerText = isLoginMode ? "Welcome back, Operator." : "Join the Network.";
    document.getElementById('toggle-link').innerText = isLoginMode ? "Create an account" : "Log in to existing";
    document.getElementById('auth-msg').innerText = "";
}

async function logout() {
    await supabase.auth.signOut();
    window.location.reload();
}

// 3. APP INITIALIZATION
window.onload = async () => {
    // Check Theme Preference
    const savedTheme = localStorage.getItem('cyberian-theme');
    if (savedTheme) setTheme(savedTheme);

    // Check Auth
    const { data: { session } } = await supabase.auth.getSession();
    
    if (session) {
        currentUser = session.user;
        document.getElementById('auth-container').style.display = 'none';
        document.getElementById('app-container').style.display = 'flex';
        document.getElementById('user-email-display').innerText = currentUser.email;
        
        loadData(); // Fetch videos and courses
    }
};

// 4. NAVIGATION
function navTo(section) {
    // Update Sidebar
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    event.currentTarget.classList.add('active');

    // Update View
    document.querySelectorAll('.view').forEach(view => view.classList.remove('active-view'));
    document.getElementById('view-' + section).classList.add('active-view');
}

// 5. DATA FETCHING
async function loadData() {
    // Load Courses (Structured Playlists)
    const { data: courses } = await supabase.from('courses').select('*');
    const courseGrid = document.getElementById('course-grid');
    courseGrid.innerHTML = '';
    
    if (courses) {
        courses.forEach(c => {
            const div = document.createElement('div');
            div.className = 'card';
            div.innerHTML = `<span class="card-badge">${c.level}</span><h3>${c.title}</h3><p>${c.description || "Start this path."}</p>`;
            div.onclick = () => alert("Logic to open playlist items goes here. (Can use existing DB structure)");
            courseGrid.appendChild(div);
        });
    }

    // Load Fields (Categories)
    const { data: categories } = await supabase.from('categories').select('*');
    const fieldGrid = document.getElementById('fields-grid');
    fieldGrid.innerHTML = '';

    if (categories) {
        categories.forEach(cat => {
            const div = document.createElement('div');
            div.className = 'card';
            div.innerHTML = `<h3>${cat.title}</h3><p>Explore ${cat.slug}</p>`;
            div.onclick = () => loadVideosForCategory(cat.id);
            fieldGrid.appendChild(div);
        });
    }
}

// 6. SETTINGS & THEMES
function setTheme(color) {
    document.documentElement.style.setProperty('--primary', color);
    // Darken it slightly for hover effects
    document.documentElement.style.setProperty('--primary-hover', color);
    localStorage.setItem('cyberian-theme', color);
}

async function changePassword() {
    const newPass = document.getElementById('new-password').value;
    const msg = document.getElementById('settings-msg');
    
    if(newPass.length < 6) {
        msg.innerText = "Password too short.";
        return;
    }

    const { data, error } = await supabase.auth.updateUser({ password: newPass });

    if (error) msg.innerText = "Error: " + error.message;
    else msg.innerText = "Password updated successfully.";
}

// 7. AI CHAT
function toggleChat() {
    const win = document.getElementById('ai-window');
    win.classList.toggle('hidden');
}

async function handleAiEnter(e) {
    if (e.key === 'Enter') sendAiMessage();
}

async function sendAiMessage() {
    const input = document.getElementById('ai-input');
    const text = input.value;
    if (!text) return;

    const msgs = document.getElementById('ai-messages');
    
    // Add User Message
    msgs.innerHTML += `<div class="ai-msg user-msg">${text}</div>`;
    input.value = '';
    msgs.scrollTop = msgs.scrollHeight;

    // Fetch AI Response
    try {
        const res = await fetch(`${AI_SERVER_URL}/ask-ai`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: currentUser.id, question: text })
        });
        const data = await res.json();
        
        msgs.innerHTML += `<div class="ai-msg">${data.answer}</div>`;
        msgs.scrollTop = msgs.scrollHeight;
    } catch (err) {
        msgs.innerHTML += `<div class="ai-msg">Connection Error. Is the Render server awake?</div>`;
    }
}