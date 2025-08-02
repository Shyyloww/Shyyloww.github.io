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

        // Create a function to set the height
        const alignCardHeight = () => {
            // Set height of the pricing card to match the height of the right column
            pricingCard.style.height = `${rightColumn.offsetHeight}px`;
        };

        // Create a ResizeObserver to watch the right column for size changes
        const resizeObserver = new ResizeObserver(() => {
            alignCardHeight();
        });

        // Start observing the right column
        resizeObserver.observe(rightColumn);

        // Run it once initially to set the correct height on page load
        alignCardHeight();
    };

    setupAlignment();

});