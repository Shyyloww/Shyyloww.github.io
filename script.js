document.addEventListener('DOMContentLoaded', () => {
    // Restore Page State
    const savedPage = localStorage.getItem('activePage') || 'dashboard';
    showPage(savedPage);

    // Start Clock
    startClock();

    // Initialize Magic Bento Effects
    initMagicBento();
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

// --- CLOCK & SCHEDULE ---
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

// --- MAGIC BENTO LOGIC (Translated from React) ---
function initMagicBento() {
    const cards = document.querySelectorAll('.magic-bento-card');
    const spotlight = document.querySelector('.global-spotlight');
    const grid = document.querySelector('.card-grid');

    const CONFIG = {
        proximity: 300 * 0.5,
        fadeDistance: 300 * 0.75,
        spotlightRadius: 300
    };

    // 1. GLOBAL SPOTLIGHT & BORDER GLOW
    document.addEventListener('mousemove', (e) => {
        // Move the giant flashlight
        gsap.to(spotlight, {
            left: e.clientX,
            top: e.clientY,
            duration: 0.1,
            ease: 'power2.out'
        });

        // Check if mouse is inside the grid to show/hide flashlight
        const gridRect = grid.getBoundingClientRect();
        const isInside = (
            e.clientX >= gridRect.left && 
            e.clientX <= gridRect.right && 
            e.clientY >= gridRect.top && 
            e.clientY <= gridRect.bottom
        );
        
        gsap.to(spotlight, { opacity: isInside ? 0.8 : 0 });

        // Update every card's border glow based on distance
        cards.forEach(card => {
            const rect = card.getBoundingClientRect();
            
            // RelX and RelY for the local gradient
            const relativeX = ((e.clientX - rect.left) / rect.width) * 100;
            const relativeY = ((e.clientY - rect.top) / rect.height) * 100;

            card.style.setProperty('--glow-x', `${relativeX}%`);
            card.style.setProperty('--glow-y', `${relativeY}%`);

            // Calculate Intensity
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            const distance = Math.hypot(e.clientX - centerX, e.clientY - centerY) - Math.max(rect.width, rect.height) / 2;
            const effectiveDistance = Math.max(0, distance);

            let intensity = 0;
            if (effectiveDistance <= CONFIG.proximity) {
                intensity = 1;
            } else if (effectiveDistance <= CONFIG.fadeDistance) {
                intensity = (CONFIG.fadeDistance - effectiveDistance) / (CONFIG.fadeDistance - CONFIG.proximity);
            }
            card.style.setProperty('--glow-intensity', intensity);
        });
    });

    // 2. CARD TILT, MAGNETISM & PARTICLES
    cards.forEach(card => {
        let isHovered = false;

        // MOUSE MOVE (Tilt & Magnet)
        card.addEventListener('mousemove', (e) => {
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;

            // Tilt
            const rotateX = ((y - centerY) / centerY) * -10; // -10 deg
            const rotateY = ((x - centerX) / centerX) * 10;  // 10 deg

            // Magnetism (Move card slightly)
            const magnetX = (x - centerX) * 0.05;
            const magnetY = (y - centerY) * 0.05;

            gsap.to(card, {
                rotateX: rotateX,
                rotateY: rotateY,
                x: magnetX,
                y: magnetY,
                duration: 0.1,
                ease: 'power2.out',
                transformPerspective: 1000
            });
        });

        // MOUSE ENTER (Spawn Particles)
        card.addEventListener('mouseenter', () => {
            isHovered = true;
            
            // Spawn 12 particles
            for (let i = 0; i < 12; i++) {
                setTimeout(() => {
                    if (!isHovered) return;
                    createParticle(card);
                }, i * 100);
            }
        });

        // MOUSE LEAVE (Reset)
        card.addEventListener('mouseleave', () => {
            isHovered = false;
            // Reset position/tilt
            gsap.to(card, {
                rotateX: 0,
                rotateY: 0,
                x: 0,
                y: 0,
                duration: 0.5,
                ease: 'power2.out'
            });

            // Kill all particles
            const particles = card.querySelectorAll('.particle');
            particles.forEach(p => {
                gsap.to(p, { scale: 0, opacity: 0, onComplete: () => p.remove() });
            });
        });

        // CLICK EFFECT (Ripple)
        card.addEventListener('click', (e) => {
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            const ripple = document.createElement('div');
            ripple.style.position = 'absolute';
            ripple.style.width = '600px';
            ripple.style.height = '600px';
            ripple.style.borderRadius = '50%';
            ripple.style.background = 'radial-gradient(circle, rgba(132, 0, 255, 0.4) 0%, transparent 70%)';
            ripple.style.left = `${x - 300}px`;
            ripple.style.top = `${y - 300}px`;
            ripple.style.pointerEvents = 'none';
            ripple.style.zIndex = '1000';
            
            card.appendChild(ripple);
            
            gsap.fromTo(ripple, { scale: 0, opacity: 1 }, { 
                scale: 1, opacity: 0, duration: 0.8, ease: 'power2.out',
                onComplete: () => ripple.remove() 
            });
        });
    });
}

// Helper to create a single particle
function createParticle(card) {
    const p = document.createElement('div');
    p.classList.add('particle');
    card.appendChild(p);

    const rect = card.getBoundingClientRect();
    const startX = Math.random() * rect.width;
    const startY = Math.random() * rect.height;

    gsap.set(p, { x: startX, y: startY, scale: 0, opacity: 0 });
    gsap.to(p, {
        scale: 1, opacity: 1, duration: 0.3, ease: 'back.out(1.7)'
    });

    // Random Float Animation
    gsap.to(p, {
        x: startX + (Math.random() - 0.5) * 100,
        y: startY + (Math.random() - 0.5) * 100,
        rotation: Math.random() * 360,
        duration: 2 + Math.random() * 2,
        ease: 'none',
        repeat: -1,
        yoyo: true
    });

    // Fade in/out loop
    gsap.to(p, {
        opacity: 0.3, duration: 1.5, repeat: -1, yoyo: true
    });
}