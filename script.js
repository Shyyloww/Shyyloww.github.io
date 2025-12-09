// 1. CONFIGURATION
const SUPABASE_URL = 'https://exjayvebshmlzdwjbhkv.supabase.co'; 
const SUPABASE_KEY = 'sb_publishable_M_mIHSDGIHaBR2s9K9FkSg_Hy1FMn85'; 
const AI_SERVER_URL = 'https://shyyloww-github-io-1.onrender.com';

const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentUser = null;
let isLoginMode = true;

// 2. WAIT FOR PAGE TO LOAD
document.addEventListener('DOMContentLoaded', () => {
    // Check for saved theme
    const savedTheme = localStorage.getItem('cyberian-theme');
    if (savedTheme) setTheme(savedTheme);

    // Attach Button Listeners (This fixes the "button does nothing" bug)
    document.getElementById('auth-btn').addEventListener('click', handleAuth);
    document.getElementById('toggle-btn').addEventListener('click', toggleAuthMode);

    // Check Login Status
    checkSession();
});

// 3. AUTH LOGIC
async function handleAuth() {
    const usernameInput = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    const msg = document.getElementById('auth-msg');

    if (!usernameInput || !password) {
        msg.innerText = "Please fill in all fields.";
        return;
    }

    // Backend Trick: Append fake domain so Supabase accepts it as an email
    const fakeEmail = `${usernameInput}@cyberian.io`;

    msg.innerText = "Processing...";
    console.log("Attempting Auth with:", fakeEmail);

    if (isLoginMode) {
        // LOGIN
        const { data, error } = await supabase.auth.signInWithPassword({ 
            email: fakeEmail, 
            password: password 
        });

        if (error) {
            console.error(error);
            msg.innerText = "Error: " + error.message;
        } else {
            window.location.reload();
        }
    } else {
        // SIGNUP
        const { data, error } = await supabase.auth.signUp({
            email: fakeEmail,
            password: password,
            options: {
                data: { username: usernameInput } // Store real username
            }
        });

        if (error) {
            console.error(error);
            msg.innerText = "Error: " + error.message;
        } else {
            msg.innerText = "Success! Account created. Logging you in...";
            // Auto login after signup
            setTimeout(() => window.location.reload(), 1500);
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

async function checkSession() {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
        currentUser = session.user;
        // Show App, Hide Login
        document.getElementById('auth-container').style.display = 'none';
        document.getElementById('app-container').style.display = 'flex';
        
        // Display Username (Grab from metadata if exists, else strip fake email)
        const displayUser = currentUser.user_metadata.username || currentUser.email.split('@')[0];
        document.getElementById('user-display').innerText = displayUser;
        
        loadData();
    }
}

async function logout() {
    await supabase.auth.signOut();
    window.location.reload();
}

// 4. DATA LOADING
async function loadData() {
    // Load Courses
    const { data: courses } = await supabase.from('courses').select('*');
    const courseGrid = document.getElementById('course-grid');
    courseGrid.innerHTML = '';
    
    if (courses && courses.length > 0) {
        courses.forEach(c => {
            const div = document.createElement('div');
            div.className = 'card';
            div.innerHTML = `<span class="card-badge">${c.level}</span><h3>${c.title}</h3><p>${c.description || "Start Path"}</p>`;
            courseGrid.appendChild(div);
        });
    } else {
        courseGrid.innerHTML = '<p>No courses found. Run the SQL script in Supabase!</p>';
    }

    // Load Fields
    const { data: categories } = await supabase.from('categories').select('*');
    const fieldGrid = document.getElementById('fields-grid');
    fieldGrid.innerHTML = '';

    if (categories) {
        categories.forEach(cat => {
            const div = document.createElement('div');
            div.className = 'card';
            div.innerHTML = `<h3>${cat.title}</h3><p>Explore Category</p>`;
            fieldGrid.appendChild(div);
        });
    }
}

// 5. NAVIGATION
function navTo(section) {
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    // Find button that triggered this (event might be undefined if called manually)
    if(event) event.currentTarget.classList.add('active');

    document.querySelectorAll('.view').forEach(view => view.classList.remove('active-view'));
    document.getElementById('view-' + section).classList.add('active-view');
}

// 6. SETTINGS & AI
function setTheme(color) {
    document.documentElement.style.setProperty('--primary', color);
    document.documentElement.style.setProperty('--primary-hover', color);
    localStorage.setItem('cyberian-theme', color);
}

async function changePassword() {
    const newPass = document.getElementById('new-password').value;
    const msg = document.getElementById('settings-msg');
    
    if(newPass.length < 6) {
        msg.innerText = "Password too short (min 6 chars).";
        return;
    }

    const { data, error } = await supabase.auth.updateUser({ password: newPass });
    if (error) msg.innerText = "Error: " + error.message;
    else msg.innerText = "Password updated successfully.";
}

function toggleChat() {
    document.getElementById('ai-window').classList.toggle('hidden');
}

async function handleAiEnter(e) {
    if (e.key === 'Enter') sendAiMessage();
}

async function sendAiMessage() {
    const input = document.getElementById('ai-input');
    const text = input.value;
    if (!text) return;

    const msgs = document.getElementById('ai-messages');
    msgs.innerHTML += `<div class="ai-msg user-msg">${text}</div>`;
    input.value = '';
    msgs.scrollTop = msgs.scrollHeight;

    try {
        const res = await fetch(`${AI_SERVER_URL}/ask-ai`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: currentUser.id, question: text })
        });
        const data = await res.json();
        msgs.innerHTML += `<div class="ai-msg">${data.answer}</div>`;
    } catch (err) {
        msgs.innerHTML += `<div class="ai-msg">Connection Error.</div>`;
    }
}