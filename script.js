document.addEventListener('DOMContentLoaded', () => {
    // 1. Navigation Init
    const savedPage = localStorage.getItem('activePage') || 'dashboard';
    showPage(savedPage);

    // 2. Clock Init
    startClock();

    // 3. Effects Init
    initMagicBento();
    initDockPhysics();
});

// --- NAVIGATION ---
function showPage(pageId) {
    document.querySelectorAll('.page').forEach(page => {
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

// --- DOCK PHYSICS ---
function initDockPhysics() {
    const dock = document.querySelector('.dock-panel');
    const items = document.querySelectorAll('.dock-item');
    const baseSize = 50;
    const maxScale = 1.8; // How much it grows (1.8x)
    const distanceRange = 200; // Radius of effect

    // Mouse Move on Dock
    dock.addEventListener('mousemove', (e) => {
        items.forEach(item => {
            const rect = item.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            
            // Calculate distance from mouse to center of this icon
            const distance = Math.abs(e.clientX - centerX);

            let scale = 1;
            
            // If mouse is close, scale up
            if (distance < distanceRange) {
                // Creates a bell-curve shape for smooth magnification
                const strength = 1 - (distance / distanceRange); // 0 to 1
                // Ease the strength to make it rounder (sine curve)
                const curve = Math.sin(strength * Math.PI / 2); 
                scale = 1 + (maxScale - 1) * curve;
            }

            // Apply size using GSAP for smoothness
            gsap.to(item, {
                width: baseSize * scale,
                height: baseSize * scale,
                duration: 0.1, // Very fast reaction
                ease: 'power2.out'
            });
        });
    });

    // Mouse Leave Dock (Reset all)
    dock.addEventListener('mouseleave', () => {
        items.forEach(item => {
            gsap.to(item, {
                width: baseSize,
                height: baseSize,
                duration: 0.3, // Slower reset like a spring release
                ease: 'elastic.out(1, 0.5)'
            });
        });
    });
}

// --- CLOCK ---
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
    document.getElementById('current-time').innerText = now.toLocaleTimeString([], { hour12: true });

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

// --- MAGIC BENTO & SPOTLIGHT ---
function initMagicBento() {
    const cards = document.querySelectorAll('.magic-bento-card');
    const spotlight = document.querySelector('.global-spotlight');
    const grid = document.querySelector('.card-grid');

    if(!spotlight) return;

    document.addEventListener('mousemove', (e) => {
        // Move Global Spotlight
        gsap.to(spotlight, { left: e.clientX, top: e.clientY, duration: 0.1 });

        // Spotlight Opacity Logic
        const gridRect = grid ? grid.getBoundingClientRect() : null;
        if(gridRect) {
            const isInside = (e.clientX >= gridRect.left && e.clientX <= gridRect.right && e.clientY >= gridRect.top && e.clientY <= gridRect.bottom);
            gsap.to(spotlight, { opacity: isInside ? 0.8 : 0 });
        }

        // Card Border Glow Logic
        cards.forEach(card => {
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            card.style.setProperty('--glow-x', `${x}px`);
            card.style.setProperty('--glow-y', `${y}px`);

            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            const dist = Math.hypot(e.clientX - centerX, e.clientY - centerY) - Math.max(rect.width, rect.height)/2;
            const intensity = Math.max(0, 1 - (Math.max(0, dist) / 200));
            card.style.setProperty('--glow-intensity', intensity);
        });
    });
}