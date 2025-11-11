document.addEventListener('DOMContentLoaded', () => {
    const signupForm = document.getElementById('signup-form');
    const loginForm = document.getElementById('login-form');
    const signupMessage = document.getElementById('signup-message');
    const loginMessage = document.getElementById('login-message');

    signupForm.addEventListener('submit', async (event) => {
        event.preventDefault(); // Prevent the default form submission (page reload)

        const email = document.getElementById('signup-email').value;
        const username = document.getElementById('signup-username').value;
        const password = document.getElementById('signup-password').value;
        
        signupMessage.textContent = ''; // Clear previous message

        try {
            const response = await fetch('/signup', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email, username, password }),
            });

            const result = await response.json();

            if (response.ok && result.success) {
                signupMessage.textContent = result.message;
                signupMessage.style.color = '#03dac6'; // Teal for success
            } else {
                signupMessage.textContent = result.error || 'An unknown error occurred.';
                signupMessage.style.color = '#cf6679'; // Red for error
            }
        } catch (error) {
            signupMessage.textContent = 'Failed to connect to the server.';
            signupMessage.style.color = '#cf6679';
        }
    });

    loginForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        loginMessage.textContent = '';

        try {
            const response = await fetch('/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email, password }),
            });

            const result = await response.json();

            if (response.ok && result.success) {
                loginMessage.textContent = result.message;
                loginMessage.style.color = '#03dac6';
                // In the future, we will redirect to the dashboard here
                // window.location.href = '/dashboard';
            } else {
                loginMessage.textContent = result.error || 'An unknown error occurred.';
                loginMessage.style.color = '#cf6679';
            }
        } catch (error) {
            loginMessage.textContent = 'Failed to connect to the server.';
            loginMessage.style.color = '#cf6679';
        }
    });
});