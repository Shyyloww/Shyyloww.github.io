document.addEventListener('DOMContentLoaded', () => {

    // --- Scroll Animation Logic ---
    // This makes the sections fade in as you scroll down.
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

    // The title animation is now handled entirely by CSS, so no JavaScript is needed for it.
});