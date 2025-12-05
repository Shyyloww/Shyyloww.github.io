document.addEventListener('DOMContentLoaded', () => {
    showPage(localStorage.getItem('activePage') || 'dashboard');
    startClock();
    initMagicBento();
    initDockPhysics();
});

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

// --- EXACT DOCK PHYSICS IMPLEMENTATION ---
function initDockPhysics() {
    const dock = document.querySelector('.dock-panel');
    const items = document.querySelectorAll('.dock-item');
    
    // Constants from your React code
    const BASE_SIZE = 50;
    const MAGNIFICATION = 70;
    const DISTANCE_LIMIT = 200;

    dock.addEventListener('mousemove', (e) => {
        const mouseX = e.clientX;

        items.forEach(item => {
            const rect = item.getBoundingClientRect();
            // Calculate center of this specific item
            const itemCenterX = rect.left + rect.width / 2;
            
            // Calculate distance absolute value
            const distance = Math.abs(mouseX - itemCenterX);
            
            let targetSize = BASE_SIZE;

            // Logic: if within distance limit, scale up
            if (distance < DISTANCE_LIMIT) {
                // The React code does a linear mapping then passes it to a spring
                // val - rect.x - baseItemSize / 2
                // We simplify the math to:
                
                // 1. Calculate a factor 0 to 1 based on distance (1 is close, 0 is far)
                const linearFactor = 1 - (distance / DISTANCE_LIMIT);
                
                // 2. Add size based on factor
                // Using a sine curve makes it look smoother like the spring
                const curvedFactor = Math.sin(linearFactor * Math.PI / 2);
                
                targetSize = BASE_SIZE + (MAGNIFICATION - BASE_SIZE) * curvedFactor;
            }

            // Apply size using GSAP (handling the 'spring' feel via duration/ease)
            gsap.to(item, {
                width: targetSize,
                height: targetSize,
                duration: 0.1, // Fast response
                ease: 'power2.out'
            });

            // Also show label if this is the hovered item
            const label = item.querySelector('.dock-label');
            // If we are strictly hovering (mouse inside rect)
            if(e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) {
                label.style.opacity = '1';
                label.style.top = '-40px';
            } else {
                label.style.opacity = '0';
                label.style.top = '-20px';
            }
        });
    });

    dock.addEventListener('mouseleave', () => {
        items.forEach(item => {
            // Reset to base size
            gsap.to(item, {
                width: BASE_SIZE,
                height: BASE_SIZE,
                duration: 0.4,
                ease: 'elastic.out(1, 0.5)' // The spring bounce on release
            });
            // Hide labels
            const label = item.querySelector('.dock-label');
            label.style.opacity = '0';
        });
    });
}

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
    
    // ... (Clock logic remains same) ...
    // Simplified for brevity in this response, keep your existing clock logic here
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

function initMagicBento() {
    const spotlight = document.querySelector('.global-spotlight');
    if(!spotlight) return;

    document.addEventListener('mousemove', (e) => {
        gsap.to(spotlight, { left: e.clientX, top: e.clientY, duration: 0.1 });

        const cards = document.querySelectorAll('.page.active .magic-bento-card');
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