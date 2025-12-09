// 1. CONFIGURATION
const SUPABASE_URL = 'https://exjayvebshmlzdwjbhkv.supabase.co'; // From Data API settings
const SUPABASE_KEY = 'sb_publishable_M_mIHSDGIHaBR2s9K9FkSg_Hy1FMn85'; // The "anon" key
const AI_SERVER_URL = 'YOUR_RENDER_URL_HERE'; // e.g., https://my-cyber-ai.onrender.com

const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
let currentUser = null;

// 2. AUTHENTICATION
async function loginWithGoogle() {
    const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
    });
}

async function logout() {
    await supabase.auth.signOut();
    window.location.reload();
}

// Check session on load
window.onload = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
        currentUser = session.user;
        document.getElementById('login-container').style.display = 'none';
        document.getElementById('dashboard-container').style.display = 'flex';
        loadCourses(); // Load initial data
    }
};

// 3. DATA LOADING
async function loadCourses() {
    // This fetches from your Supabase 'courses' table
    const { data: courses, error } = await supabase.from('courses').select('*');
    const container = document.getElementById('course-list');
    container.innerHTML = '';
    
    if (courses) {
        courses.forEach(course => {
            const card = document.createElement('div');
            card.className = 'card';
            card.innerHTML = `<h3>${course.title}</h3><p>${course.level}</p>`;
            // Add click event to open playlist...
            container.appendChild(card);
        });
    }
}

function showSection(sectionId) {
    // Hide all sections
    document.querySelectorAll('.section').forEach(el => el.style.display = 'none');
    // Show selected
    document.getElementById('section-' + sectionId).style.display = 'block';
}

// 4. AI CHAT LOGIC
function toggleChat() {
    const body = document.getElementById('ai-body');
    body.style.display = body.style.display === 'none' ? 'flex' : 'none';
}

async function handleEnter(e) {
    if (e.key === 'Enter') {
        const input = document.getElementById('ai-input');
        const question = input.value;
        const history = document.getElementById('chat-history');

        // User Message
        history.innerHTML += `<div><strong>YOU:</strong> ${question}</div>`;
        input.value = '';

        // Fetch from Render
        history.innerHTML += `<div id="loading">...analyzing...</div>`;
        
        try {
            const res = await fetch(`${AI_SERVER_URL}/ask-ai`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: currentUser.id,
                    question: question
                })
            });
            const data = await res.json();
            
            // Remove loading
            document.getElementById('loading').remove();
            
            // AI Message
            history.innerHTML += `<div><strong>TUTOR:</strong> ${data.answer}</div>`;
            history.scrollTop = history.scrollHeight; // Auto scroll down
            
        } catch (err) {
            console.error(err);
            document.getElementById('loading').innerText = "ERROR: LINK_SEVERED";
        }
    }
}