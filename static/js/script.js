document.addEventListener('DOMContentLoaded', () => {
    // Form and message elements
    const loginCard = document.getElementById('login-card');
    const signupCard = document.getElementById('signup-card');
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');
    const loginMessage = document.getElementById('login-message');
    const signupMessage = document.getElementById('signup-message');

    // Toggle links
    const showSignup = document.getElementById('show-signup');
    const showLogin = document.getElementById('show-login');

    // --- Form Toggling Logic ---
    showSignup.addEventListener('click', (e) => {
        e.preventDefault();
        loginCard.classList.add('hidden');
        signupCard.classList.remove('hidden');
    });

    showLogin.addEventListener('click', (e) => {
        e.preventDefault();
        signupCard.classList.add('hidden');
        loginCard.classList.remove('hidden');
    });

    // --- Signup Form Handler ---
    signupForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const username = document.getElementById('signup-username').value;
        const password = document.getElementById('signup-password').value;
        signupMessage.textContent = '';

        try {
            const response = await fetch('/signup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password }),
            });
            const result = await response.json();

            if (response.ok && result.success) {
                signupMessage.textContent = result.message + " You can now login.";
                signupMessage.style.color = '#03dac6';
            } else {
                signupMessage.textContent = result.error || 'An error occurred.';
                signupMessage.style.color = '#cf6679';
            }
        } catch (error) {
            signupMessage.textContent = 'Failed to connect to the server.';
            signupMessage.style.color = '#cf6679';
        }
    });

    // --- Login Form Handler ---
    loginForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const username = document.getElementById('login-username').value;
        const password = document.getElementById('login-password').value;
        const remember = document.getElementById('remember-me').checked; // Get remember me status
        loginMessage.textContent = '';

        try {
            const response = await fetch('/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password, remember }), // Send it to the server
            });
            const result = await response.json();

            if (response.ok && result.success) {
                // On successful login, redirect to the dashboard
                window.location.href = '/dashboard';
            } else {
                loginMessage.textContent = result.error || 'An error occurred.';
                loginMessage.style.color = '#cf6679';
            }
        } catch (error) {
            loginMessage.textContent = 'Failed to connect to the server.';
            loginMessage.style.color = '#cf6679';
        }
    });
});