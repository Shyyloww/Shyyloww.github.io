document.addEventListener('DOMContentLoaded', () => {
    const exerciseSelect = document.getElementById('exercise-select');
    const weightInput = document.getElementById('weight-input');
    const chartTbody = document.getElementById('body-chart-tbody');
    const logWorkoutForm = document.getElementById('log-workout-form');
    const logMessage = document.getElementById('log-message');

    let exercisesData = [];

    // --- Core Functions (no changes to fetchDashboardData, updateBodyChart, getRankFromScore) ---
    const fetchDashboardData = async () => { /* ... same as before ... */ };
    const updateBodyChart = (chartData) => { /* ... same as before ... */ };
    const getRankFromScore = (score) => { /* ... same as before ... */ };
    const populateExerciseDropdown = (exercises) => { /* ... same as before ... */ };
    
    // --- NEW LOGIC for Exercise Selection ---
    exerciseSelect.addEventListener('change', (e) => {
        const selectedId = parseInt(e.target.value);
        if (!selectedId) return;

        const selectedExercise = exercisesData.find(ex => ex.id === selectedId);
        
        // If the exercise is primarily bodyweight, weight is OPTIONAL.
        if (selectedExercise && selectedExercise.type === 'Bodyweight/Calisthenics') {
            weightInput.required = false;
            weightInput.placeholder = "Add weight (optional)";
        } else {
            // Otherwise, for weighted exercises, it is REQUIRED.
            weightInput.required = true;
            weightInput.placeholder = "e.g., 50.5";
        }
    });

    // --- Form Submission (no changes) ---
    logWorkoutForm.addEventListener('submit', async (e) => { /* ... same as before ... */ });

    // --- Helper Functions to copy/paste ---
    // (To avoid errors, let's include the full code for the unchanged functions)
    fetchDashboardData = async () => {
        try {
            const response = await fetch('/api/dashboard_data');
            if (!response.ok) throw new Error('Failed to fetch data');
            const data = await response.json();
            exercisesData = data.exercises;
            populateExerciseDropdown(exercisesData);
            updateBodyChart(data.body_chart);
        } catch (error) { console.error("Error fetching dashboard data:", error); chartTbody.innerHTML = `<tr><td colspan="5">Could not load data.</td></tr>`; }
    };
    updateBodyChart = (chartData) => {
        if (!chartData) return;
        chartTbody.innerHTML = '';
        chartData.forEach(muscle => {
            const row = document.createElement('tr');
            const rank = getRankFromScore(muscle.strength_score);
            row.innerHTML = `<td>${muscle.muscle_group}</td><td class="rank-cell ${rank.className}">${rank.name}</td><td>${muscle.exercise_name || 'N/A'}</td><td>${muscle.weight_kg !== null ? `${muscle.weight_kg}kg / ${muscle.reps} reps / ${muscle.sets} sets` : 'N/A'}</td><td>${muscle.strength_score.toFixed(1)}</td>`;
            chartTbody.appendChild(row);
        });
    };
    getRankFromScore = (score) => {
        const tiers = [{ name: 'Wood', threshold: 15, className: 'rank-wood' },{ name: 'Bronze', threshold: 40, className: 'rank-bronze' },{ name: 'Silver', threshold: 70, className: 'rank-silver' },{ name: 'Gold', threshold: 110, className: 'rank-gold' },{ name: 'Platinum', threshold: 160, className: 'rank-platinum' },{ name: 'Diamond', threshold: 220, className: 'rank-diamond' },{ name: 'Champion', threshold: 290, className: 'rank-champion' },{ name: 'Titan', threshold: 370, className: 'rank-titan' },{ name: 'Olympian', threshold: Infinity, className: 'rank-olympian' }];
        if (score <= 0) return { name: 'Unranked', className: 'rank-unranked' };
        let previousThreshold = 0;
        for (const tier of tiers) {
            if (score <= tier.threshold) {
                const range = tier.threshold - previousThreshold; const step = range / 3; let subLevel = 3;
                if (score <= previousThreshold + step) { subLevel = 1; } else if (score <= previousThreshold + step * 2) { subLevel = 2; }
                return { name: `${tier.name} ${subLevel}`, className: tier.className };
            }
            previousThreshold = tier.threshold;
        }
        return { name: 'Olympian 3', className: 'rank-olympian' };
    };
    populateExerciseDropdown = (exercises) => {
        if (!exercises) return;
        exerciseSelect.innerHTML = '<option value="">Select an exercise...</option>';
        exercises.forEach(ex => {
            const option = document.createElement('option');
            option.value = ex.id;
            option.textContent = ex.name;
            exerciseSelect.appendChild(option);
        });
    };
    logWorkoutForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        logMessage.textContent = '';
        const formData = { exercise_id: exerciseSelect.value, weight: weightInput.value, reps: document.getElementById('reps-input').value, sets: document.getElementById('sets-input').value };
        try {
            const response = await fetch('/api/log_workout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(formData) });
            const result = await response.json();
            if (response.ok && result.success) {
                logMessage.textContent = 'Workout logged!'; logMessage.style.color = '#03dac6'; updateBodyChart(result.updated_chart); logWorkoutForm.reset(); weightInput.required = true; weightInput.placeholder = "e.g., 50.5";
            } else { logMessage.textContent = result.error || 'Failed to log.'; logMessage.style.color = '#cf6679'; }
        } catch (error) { logMessage.textContent = 'Server error.'; logMessage.style.color = '#cf6679'; }
    });

    // --- Initial Load ---
    fetchDashboardData();
});