document.addEventListener('DOMContentLoaded', () => {

    // --- Scroll Animation Logic ---
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('show');
            }
        });
    }, {
        threshold: 0.15 // Trigger when 15% of the element is visible
    });

    const hiddenElements = document.querySelectorAll('.hidden');
    hiddenElements.forEach(el => observer.observe(el));

    // --- Animated Title Logic ---
    const title = document.getElementById('animated-title');
    if (title) {
        // Extracting color palettes from your themes.py
        const themes = [
            { name: "Cyber", colors: ["#9bf1ff", "#ff00ff", "#8A2BE2"] },
            { name: "Matrix", colors: ["#39ff14", "#008F11", "#9dff8a"] },
            { name: "Sunset", colors: ["#fff2cc", "#ff8c42", "#ff5e57"] },
            { name: "Ocean", colors: ["#e0ffff", "#61dafb", "#0074d9"] },
            { name: "Jungle", colors: ["#dad7cd", "#a3b18a", "#588157"] },
            { name: "Galaxy", colors: ["#f8f8f2", "#bd93f9", "#ff79c6"] }
        ];

        let currentThemeIndex = 0;

        const changeTheme = () => {
            currentThemeIndex = (currentThemeIndex + 1) % themes.length;
            const nextTheme = themes[currentThemeIndex];
            
            // Update the CSS variables smoothly
            document.documentElement.style.setProperty('--gradient-color-1', nextTheme.colors[0]);
            document.documentElement.style.setProperty('--gradient-color-2', nextTheme.colors[1]);
            document.documentElement.style.setProperty('--gradient-color-3', nextTheme.colors[2]);
        };
        
        // Change theme every 4 seconds
        setInterval(changeTheme, 4000);
    }
});