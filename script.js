document.addEventListener('DOMContentLoaded', () => {

    // --- Scroll Animation Logic ---
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('show');
            }
        });
    }, {
        threshold: 0.15
    });

    const hiddenElements = document.querySelectorAll('.hidden');
    hiddenElements.forEach(el => observer.observe(el));

    // --- Tier Detail Page Card Alignment Logic ---
    const setupAlignment = () => {
        const tierGrid = document.querySelector('.tier-detail-grid');
        if (!tierGrid) {
            return; // Exit if not on a tier detail page
        }

        const pricingCard = tierGrid.querySelector('.pricing-card.static');
        const rightColumn = tierGrid.querySelector('.tier-deep-dive');

        if (!pricingCard || !rightColumn) {
            return; // Exit if elements are missing
        }

        // This function sets the card's height to match the right column's height
        const alignCardHeight = () => {
            pricingCard.style.height = `${rightColumn.offsetHeight}px`;
        };

        // Create a ResizeObserver to watch the right column for any size changes
        const resizeObserver = new ResizeObserver(() => {
            alignCardHeight();
        });

        // Start observing the right column
        resizeObserver.observe(rightColumn);

        // Run it once initially in case the page loads static content
        alignCardHeight();
    };

    // Run the entire setup only on tier detail pages
    if (document.body.classList.contains('tier-detail-page')) {
        setupAlignment();
    }

});