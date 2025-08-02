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

    // --- Tier Detail Page Card Alignment Logic ---
    function setupAlignment() {
        const tierGrid = document.querySelector('.tier-detail-grid');
        // Exit if we are not on a tier detail page
        if (!tierGrid) {
            return;
        }

        const alignCard = () => {
            const pricingCard = tierGrid.querySelector('.pricing-card.static');
            const anchorButton = tierGrid.querySelector('.button.primary.large');

            // Ensure both elements exist before doing calculations
            if (pricingCard && anchorButton) {
                const cardRect = pricingCard.getBoundingClientRect();
                const anchorRect = anchorButton.getBoundingClientRect();

                // Calculate the required height from the top of the card to the bottom of the anchor
                const requiredHeight = anchorRect.bottom - cardRect.top;

                // Apply the calculated height, with a sanity check
                if (requiredHeight > 100) {
                    pricingCard.style.height = `${requiredHeight}px`;
                }
            }
        };

        // Run on load and resize for robust performance
        window.addEventListener('load', alignCard);
        window.addEventListener('resize', alignCard);
        // Also run immediately in case 'load' has already fired
        alignCard();
    }

    setupAlignment();
});