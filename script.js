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
    const alignTierCardHeight = () => {
        const tierGrid = document.querySelector('.tier-detail-grid');
        if (!tierGrid) {
            return; // Exit if not on a tier detail page
        }

        const pricingCard = tierGrid.querySelector('.pricing-card.static');
        // UPDATED: The anchor is now the large "Continue to Discord" button
        const anchorButton = tierGrid.querySelector('.button.primary.large');

        if (pricingCard && anchorButton) {
            // Use getBoundingClientRect for accurate positioning relative to the viewport
            const cardTop = pricingCard.getBoundingClientRect().top;
            const anchorBottom = anchorButton.getBoundingClientRect().bottom;

            // Calculate the required height
            const requiredHeight = anchorBottom - cardTop;

            // Apply the calculated height to the pricing card, ensuring a positive value
            if (requiredHeight > 0) {
                pricingCard.style.height = `${requiredHeight}px`;
            }
        }
    };

    // Run the alignment function on page load and on window resize
    alignTierCardHeight();
    window.addEventListener('resize', alignTierCardHeight);

});