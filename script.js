document.addEventListener('DOMContentLoaded', () => {

    // --- Scroll-in Animation Logic ---
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('show');
            }
        });
    }, { threshold: 0.15 });

    const hiddenElements = document.querySelectorAll('.hidden');
    hiddenElements.forEach(el => observer.observe(el));

    // --- NEW: Advanced Title & Site Theme Animation ---
    const title = document.getElementById('animated-title');
    const titleSpan = title ? title.querySelector('span') : null;

    if (title && titleSpan) {
        // Expanded themes object with gradient colors AND a main accent color
        const themes = [
            { name: "Cyber",   gradientColors: ["#9bf1ff", "#ff00ff", "#8A2BE2"], mainAccent: "#ff00ff" },
            { name: "Matrix",  gradientColors: ["#39ff14", "#008F11", "#9dff8a"], mainAccent: "#39ff14" },
            { name: "Sunset",  gradientColors: ["#fff2cc", "#ff8c42", "#ff5e57"], mainAccent: "#ff8c42" },
            { name: "Ocean",   gradientColors: ["#e0ffff", "#61dafb", "#0074d9"], mainAccent: "#61dafb" },
            { name: "Jungle",  gradientColors: ["#dad7cd", "#a3b18a", "#588157"], mainAccent: "#a3b18a" },
            { name: "Galaxy",  gradientColors: ["#f8f8f2", "#bd93f9", "#ff79c6"], mainAccent: "#bd93f9" }
        ];

        let currentThemeIndex = 0;

        const changeTheme = () => {
            currentThemeIndex = (currentThemeIndex + 1) % themes.length;
            const nextTheme = themes[currentThemeIndex];

            // --- The Crossfade Logic ---
            // 1. Set the new gradient on the top layer (the span)
            const newGradient = `linear-gradient(45deg, ${nextTheme.gradientColors.join(', ')})`;
            titleSpan.style.backgroundImage = newGradient;

            // 2. Fade the top layer in
            titleSpan.style.opacity = 1;

            // 3. Simultaneously change the site's main accent color
            document.documentElement.style.setProperty('--accent-color', nextTheme.mainAccent);

            // 4. After the fade is complete, reset for the next cycle
            setTimeout(() => {
                // Set the bottom layer's gradient to the new one
                title.style.backgroundImage = newGradient;
                // Make the top layer invisible again, instantly
                titleSpan.style.transition = 'opacity 0s'; // No transition on the way out
                titleSpan.style.opacity = 0;
                // Re-enable the smooth transition for the next fade-in
                setTimeout(() => {
                    titleSpan.style.transition = 'opacity 1.5s ease-in-out';
                }, 50);
            }, 1500); // This timeout must match the CSS transition duration
        };
        
        // Change theme every 4 seconds
        setInterval(changeTheme, 4000);
    }
});