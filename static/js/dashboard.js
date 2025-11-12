document.addEventListener('DOMContentLoaded', () => {
    const exerciseSelect = document.getElementById('exercise-select');
    const bodyMapContainer = document.getElementById('body-map-svg-container');
    const logWorkoutForm = document.getElementById('log-workout-form');
    const logMessage = document.getElementById('log-message');

    let bodyMapSVG;

    // --- Core Functions ---

    const fetchDashboardData = async () => {
        try {
            const response = await fetch('/api/dashboard_data');
            if (!response.ok) throw new Error('Failed to fetch data');
            const data = await response.json();

            populateExerciseDropdown(data.exercises);
            await loadBodyMap();
            updateBodyMapColors(data.muscle_ranks);

        } catch (error) {
            console.error("Error fetching dashboard data:", error);
            bodyMapContainer.innerHTML = "<p>Could not load dashboard data.</p>";
        }
    };

    const loadBodyMap = async () => {
        try {
            const response = await fetch('/static/body-map.svg');
            const svgText = await response.text();
            bodyMapContainer.innerHTML = svgText;
            bodyMapSVG = bodyMapContainer.querySelector('svg');
        } catch (error) {
            console.error('Error loading SVG:', error);
            bodyMapContainer.innerHTML = "<p>Could not load body map.</p>";
        }
    };

    const updateBodyMapColors = (muscleRanks) => {
        if (!bodyMapSVG || !muscleRanks) return;
        
        muscleRanks.forEach(rank => {
            const muscleElement = bodyMapSVG.getElementById(rank.muscle_group.toLowerCase().replace(/\s+/g, '-'));
            if (muscleElement) {
                muscleElement.style.fill = getRankColor(rank.strength_score);
            }
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

    // --- Event Listeners ---

    logWorkoutForm.addEventListener('submit', async (e) => {
        e.preventDefault();
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
                logMessage.textContent = 'Workout logged successfully!';
                logMessage.style.color = '#03dac6';
                updateBodyMapColors(result.updated_ranks);
                logWorkoutForm.reset();
            } else {
                logMessage.textContent = result.error || 'Failed to log workout.';
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