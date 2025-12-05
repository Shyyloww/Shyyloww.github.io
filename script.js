document.addEventListener('DOMContentLoaded', () => {
    showPage(localStorage.getItem('activePage') || 'dashboard');
    startClock();
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
    const maxScale = 1.8;
    const distanceRange = 200;

    dock.addEventListener('mousemove', (e) => {
        items.forEach(item => {
            const rect = item.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const distance = Math.abs(e.clientX - centerX);
            let scale = 1;
            if (distance < distanceRange) {
                const strength = 1 - (distance / distanceRange);
                const curve = Math.sin(strength * Math.PI / 2); 
                scale = 1 + (maxScale - 1) * curve;
            }
            gsap.to(item, { width: baseSize * scale, height: baseSize * scale, duration: 0.1, ease: 'power2.out' });
        });
    });

    dock.addEventListener('mouseleave', () => {
        items.forEach(item => gsap.to(item, { width: baseSize, height: baseSize, duration: 0.3, ease: 'elastic.out(1, 0.5)' }));
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

// --- MAGIC BENTO ---
function initMagicBento() {
    const spotlight = document.querySelector('.global-spotlight');
    if(!spotlight) return;

    document.addEventListener('mousemove', (e) => {
        // Move Global Spotlight
        gsap.to(spotlight, { left: e.clientX, top: e.clientY, duration: 0.1 });

        // Calculate Glow for ALL cards on the current page
        const cards = document.querySelectorAll('.page.active .magic-bento-card');
        
        // Show spotlight if mouse is near any card on active page
        let isNearAny = false;

        cards.forEach(card => {
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            card.style.setProperty('--glow-x', `${x}px`);
            card.style.setProperty('--glow-y', `${y}px`);

            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            const dist = Math.hypot(e.clientX - centerX, e.clientY - centerY) - Math.max(rect.width, rect.height)/2;
            
            if(dist < 300) isNearAny = true;

            const intensity = Math.max(0, 1 - (Math.max(0, dist) / 300));
            card.style.setProperty('--glow-intensity', intensity);
        });

        gsap.to(spotlight, { opacity: isNearAny ? 0.8 : 0, duration: 0.2 });
    });
}