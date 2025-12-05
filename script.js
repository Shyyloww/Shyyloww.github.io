document.addEventListener('DOMContentLoaded', () => {
    // 1. Restore saved page state
    const savedPage = localStorage.getItem('activePage') || 'dashboard';
    showPage(savedPage);

    // 2. Start the Clock
    startClock();

    // 3. Initialize Magic Bento Effects
    initMagicBento();
});

// --- NAVIGATION ---
function showPage(pageId) {
    const pages = document.querySelectorAll('.page');
    pages.forEach(page => {
        page.style.display = 'none';
        page.classList.remove('active');
    });
    const selected = document.getElementById(pageId);
    if (selected) {
        selected.style.display = 'block';
        selected.classList.add('active');
        localStorage.setItem('activePage', pageId);
    }
}

// --- CLOCK LOGIC ---
const schedule = [
    { name: "Period 1", start: "08:00", end: "08:50" },
    { name: "Period 2", start: "08:55", end: "09:45" },
    { name: "Lunch",    start: "11:30", end: "12:15" },
    { name: "Period 3", start: "12:20", end: "13:10" }
];

function startClock() {
    updateTime();
    setInterval(updateTime, 1000);
}

function updateTime() {
    const now = new Date();
    const timeString = now.toLocaleTimeString([], { hour12: true });
    document.getElementById('current-time').innerText = timeString;

    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    let statusText = "Free Time";
    let progress = 0;

    for (let period of schedule) {
        const [sH, sM] = period.start.split(':').map(Number);
        const [eH, eM] = period.end.split(':').map(Number);
        const startTotal = sH * 60 + sM;
        const endTotal = eH * 60 + eM;

        if (currentMinutes >= startTotal && currentMinutes < endTotal) {
            const duration = endTotal - startTotal;
            const elapsed = currentMinutes - startTotal;
            statusText = `${period.name} ends in ${duration - elapsed} min`;
            progress = (elapsed / duration) * 100;
            break;
        }
    }
    document.getElementById('period-status').innerText = statusText;
    document.getElementById('period-progress').style.width = progress + "%";
}

// --- MAGIC BENTO EFFECTS (GSAP) ---
function initMagicBento() {
    const cards = document.querySelectorAll('.magic-card');
    const spotlight = document.getElementById('global-spotlight');
    const grid = document.getElementById('spotlight-grid');

    // 1. Global Spotlight Follow Logic
    document.addEventListener('mousemove', (e) => {
        // Move the global flashlight
        gsap.to(spotlight, {
            left: e.clientX,
            top: e.clientY,
            duration: 0.1,
            ease: 'power2.out'
        });

        // Calculate distance for each card to handle borders/glow
        cards.forEach(card => {
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            // Update CSS variables for the specific card glow
            card.style.setProperty('--glow-x', `${x}px`);
            card.style.setProperty('--glow-y', `${y}px`);

            // If mouse is close, increase intensity
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            const distance = Math.hypot(e.clientX - centerX, e.clientY - centerY);
            
            // Simple logic: if close to card, glow is stronger
            let intensity = 1 - (distance / 500); 
            if (intensity < 0) intensity = 0;
            card.style.setProperty('--glow-intensity', intensity);
        });
    });

    // Handle Spotlight Opacity (Only show when hovering the grid area)
    if(grid) {
        grid.addEventListener('mouseenter', () => gsap.to(spotlight, { opacity: 0.8 }));
        grid.addEventListener('mouseleave', () => gsap.to(spotlight, { opacity: 0 }));
    }

    // 2. Card Specific Effects (Tilt & Particles)
    cards.forEach(card => {
        card.addEventListener('mousemove', (e) => {
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            // TILT EFFECT
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            const rotateX = ((y - centerY) / centerY) * -5; // Max 5deg tilt
            const rotateY = ((x - centerX) / centerX) * 5;

            gsap.to(card, {
                rotateX: rotateX,
                rotateY: rotateY,
                duration: 0.1,
                transformPerspective: 1000,
                ease: 'power2.out'
            });
        });

        // Reset Tilt on leave
        card.addEventListener('mouseleave', () => {
            gsap.to(card, {
                rotateX: 0,
                rotateY: 0,
                duration: 0.5,
                ease: 'power2.out'
            });
            // Clear particles
            const particles = card.querySelectorAll('.particle');
            particles.forEach(p => p.remove());
        });

        // PARTICLES ON HOVER
        card.addEventListener('mouseenter', () => {
            // Spawn 10 particles
            for(let i=0; i<10; i++) {
                const p = document.createElement('div');
                p.classList.add('particle');
                card.appendChild(p);

                // Random starting position inside card
                const startX = Math.random() * card.clientWidth;
                const startY = Math.random() * card.clientHeight;

                gsap.set(p, { x: startX, y: startY, scale: 0 });
                
                // Animate
                gsap.to(p, {
                    scale: Math.random() * 1.5,
                    x: startX + (Math.random() - 0.5) * 100,
                    y: startY + (Math.random() - 0.5) * 100,
                    opacity: 0.8,
                    duration: 1 + Math.random(),
                    repeat: -1,
                    yoyo: true,
                    ease: "sine.inOut"
                });
            }
        });
    });
}