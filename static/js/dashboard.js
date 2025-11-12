document.addEventListener('DOMContentLoaded', () => {
    const exerciseSelect = document.getElementById('exercise-select');
    const frontMapContainer = document.getElementById('front-map-container');
    const backMapContainer = document.getElementById('back-map-container');
    const logWorkoutForm = document.getElementById('log-workout-form');
    const logMessage = document.getElementById('log-message');

    let frontMapSVG, backMapSVG;

    // --- Core Functions ---

    const fetchDashboardData = async () => {
        try {
            const response = await fetch('/api/dashboard_data');
            if (!response.ok) throw new Error('Failed to fetch data');
            const data = await response.json();

            populateExerciseDropdown(data.exercises);
            await loadBodyMaps();
            updateBodyMapColors(data.muscle_ranks);

        } catch (error) {
            console.error("Error fetching dashboard data:", error);
        }
    };

    const loadBodyMaps = async () => {
        try {
            const response = await fetch('/static/body-map.svg');
            const svgText = await response.text();
            
            const parser = new DOMParser();
            const svgDoc = parser.parseFromString(svgText, "image/svg+xml");

            // Prepare and load Front View
            const frontView = svgDoc.getElementById('front-view');
            frontMapContainer.innerHTML = '';
            frontMapContainer.appendChild(frontView.cloneNode(true));
            frontMapSVG = frontMapContainer.querySelector('g');
            
            // Prepare and load Back View
            const backView = svgDoc.getElementById('back-view');
            backView.classList.remove('hidden'); // Make it visible
            backMapContainer.innerHTML = '';
            backMapContainer.appendChild(backView.cloneNode(true));
            backMapSVG = backMapContainer.querySelector('g');

        } catch (error) {
            console.error('Error loading SVG:', error);
            frontMapContainer.innerHTML = "<p>Could not load map.</p>";
            backMapContainer.innerHTML = "<p>Could not load map.</p>";
        }
    };

    const updateBodyMapColors = (muscleRanks) => {
        if (!frontMapSVG || !backMapSVG || !muscleRanks) return;

        muscleRanks.forEach(rank => {
            const color = getRankColor(rank.strength_score);
            // Convert DB name to SVG ID format (e.g., "Front Delts" -> "front-delts")
            const baseId = rank.muscle_group.toLowerCase().replace(/\s+/g, '-');
            
            // Select all parts for a muscle (e.g., front-delts, front-delts-r)
            const frontElements = frontMapSVG.querySelectorAll(`#${baseId}`);
            const backElements = backMapSVG.querySelectorAll(`#${baseId}-back`); // e.g., calves-back

            frontElements.forEach(el => el.style.fill = color);
            backElements.forEach(el => el.style.fill = color);
        });
    };

    const getRankColor = (score) => {
        if (score <= 0) return '#444444';    // Unranked
        if (score <= 50) return '#4CAF50';   // Novice (Green)
        if (score <= 100) return '#2196F3';  // Intermediate (Blue)
        if (score <= 150) return '#9C27B0';  // Advanced (Purple)
        return '#FF9800';                    // Elite (Orange)
    };

    const populateExerciseDropdown = (exercises) => {
        if (!exercises) return;
        exercises.forEach(ex => {
            const option = document.createElement('option');
            option.value = ex.id;
            option.textContent = ex.name;
            exerciseSelect.appendChild(option);
        });
    };

    // --- Event Listener for Form ---
    logWorkoutForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        // ... (rest of the form submission logic remains the same)
        logMessage.textContent = '';
        const formData = {
            exercise_id: document.getElementById('exercise-select').value,
            weight: document.getElementById('weight-input').value,
            reps: document.getElementById('reps-input').value,
            sets: document.getElementById('sets-input').value
        };
        try {
            const response = await fetch('/api/log_workout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });
            const result = await response.json();
            if (response.ok && result.success) {
                logMessage.textContent = 'Workout logged!';
                logMessage.style.color = '#03dac6';
                updateBodyMapColors(result.updated_ranks);
                logWorkoutForm.reset();
            } else {
                logMessage.textContent = result.error || 'Failed to log.';
                logMessage.style.color = '#cf6679';
            }
        } catch (error) {
            logMessage.textContent = 'Server error.';
            logMessage.style.color = '#cf6679';
        }
    });

    // --- Initial Load ---
    fetchDashboardData();
});