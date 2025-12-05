// --- STATE MANAGEMENT ---
// Check if a page is saved in local storage, otherwise default to dashboard
document.addEventListener('DOMContentLoaded', () => {
    const savedPage = localStorage.getItem('activePage') || 'dashboard';
    showPage(savedPage);
    startClock();
});

function showPage(pageId) {
    // Hide all pages
    const pages = document.querySelectorAll('.page');
    pages.forEach(page => {
        page.style.display = 'none';
        page.classList.remove('active');
    });

    // Show selected page
    const selected = document.getElementById(pageId);
    if (selected) {
        selected.style.display = 'block';
        selected.classList.add('active');
        // Save state
        localStorage.setItem('activePage', pageId);
    }
}

// --- CLOCK & SCHEDULE LOGIC ---
// You will need to edit these times to match your actual school schedule
const schedule = [
    { name: "Period 1", start: "08:00", end: "08:50" },
    { name: "Period 2", start: "08:55", end: "09:45" },
    { name: "Lunch",    start: "11:30", end: "12:15" },
    { name: "Period 3", start: "12:20", end: "13:10" },
    // Add more periods here...
];

function startClock() {
    updateTime();
    setInterval(updateTime, 1000);
}

function updateTime() {
    const now = new Date();
    
    // Update Digital Clock
    const timeString = now.toLocaleTimeString([], { hour12: true });
    document.getElementById('current-time').innerText = timeString;

    // Calculate Schedule Logic
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    let statusText = "Free Time";
    let progress = 0;

    for (let period of schedule) {
        const [startH, startM] = period.start.split(':').map(Number);
        const [endH, endM] = period.end.split(':').map(Number);
        
        const startTotal = startH * 60 + startM;
        const endTotal = endH * 60 + endM;

        if (currentMinutes >= startTotal && currentMinutes < endTotal) {
            // We are inside a period
            const duration = endTotal - startTotal;
            const elapsed = currentMinutes - startTotal;
            const remaining = duration - elapsed;
            
            statusText = `${period.name} ends in ${remaining} min`;
            progress = (elapsed / duration) * 100;
            break;
        }
    }

    document.getElementById('period-status').innerText = statusText;
    document.getElementById('period-progress').style.width = progress + "%";
}