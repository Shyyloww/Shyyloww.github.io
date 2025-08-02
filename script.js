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
        const deepDive = tierGrid.querySelector('.tier-deep-dive');
        const featureChart = deepDive.querySelector('.feature-chart');

        if (pricingCard && deepDive && featureChart) {
            // Reset height first to get natural dimensions for calculation
            pricingCard.style.height = 'auto';

            // Calculate the height from the top of the deepDive content
            // to the bottom of the featureChart.
            const deepDiveTopOffset = deepDive.offsetTop;
            const chartBottomOffset = featureChart.offsetTop + featureChart.offsetHeight;
            const requiredHeight = chartBottomOffset - deepDiveTopOffset;

            // Apply the calculated height to the pricing card
            pricingCard.style.height = `${requiredHeight}px`;
        }
    };

    // Run the alignment function on page load and on window resize
    alignTierCardHeight();
    window.addEventListener('resize', alignTierCardHeight);

});