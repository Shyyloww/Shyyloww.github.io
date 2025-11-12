document.addEventListener('DOMContentLoaded', () => {
    // --- Element Selections ---
    const exerciseSelect = document.getElementById('exercise-select');
    const chartTbody = document.getElementById('body-chart-tbody');
    const logWorkoutForm = document.getElementById('log-workout-form');
    const logMessage = document.getElementById('log-message');
    
    const repsGroup = document.getElementById('reps-group');
    const durationGroup = document.getElementById('duration-group');
    const weightInput = document.getElementById('weight-input');
    const repsInput = document.getElementById('reps-input');
    const setsInput = document.getElementById('sets-input');
    const durationInput = document.getElementById('duration-input');

    let exercisesData = [];

    // --- Core Functions ---
    const fetchDashboardData = async () => { /* ... same as before ... */ };
    const updateBodyChart = (chartData) => { /* ... same as before ... */ };
    
    // --- THE NEW RANKING FUNCTION ---
    const getRankFromScore = (score) => {
        // New, more rewarding thresholds
        const tiers = [
            { name: 'Wood', threshold: 10, className: 'rank-wood' },
            { name: 'Bronze', threshold: 25, className: 'rank-bronze' },
            { name: 'Silver', threshold: 50, className: 'rank-silver' },
            { name: 'Gold', threshold: 85, className: 'rank-gold' },
            { name: 'Platinum', threshold: 130, className: 'rank-platinum' },
            { name: 'Diamond', threshold: 185, className: 'rank-diamond' },
            { name: 'Champion', threshold: 250, className: 'rank-champion' },
            { name: 'Titan', threshold: 325, className: 'rank-titan' },
            { name: 'Olympian', threshold: Infinity, className: 'rank-olympian' }
        ];

        if (score <= 0) return { name: 'Unranked', className: 'rank-unranked' };

        let previousThreshold = 0;
        for (const tier of tiers) {
            if (score <= tier.threshold) {
                const range = tier.threshold - previousThreshold;
                const step = range / 3;
                let subLevel = 3;
                if (score <= previousThreshold + step) { subLevel = 1; } 
                else if (score <= previousThreshold + step * 2) { subLevel = 2; }
                return { name: `${tier.name} ${subLevel}`, className: tier.className };
            }
            previousThreshold = tier.threshold;
        }
        return { name: 'Olympian 3', className: 'rank-olympian' };
    };
    
    const populateExerciseDropdown = (exercises) => { /* ... same as before ... */ };

    // --- Event Listeners ---
    exerciseSelect.addEventListener('change', (e) => {
        const selectedId = parseInt(e.target.value);
        if (!selectedId) return;

        const selectedExercise = exercisesData.find(ex => ex.id === selectedId);
        
        // --- NEW UI TOGGLING LOGIC ---
        if (selectedExercise && selectedExercise.metric_type === 'duration') {
            repsGroup.classList.add('hidden');
            durationGroup.classList.remove('hidden');
            // Make duration required and reps not
            durationInput.required = true;
            repsInput.required = false;
            setsInput.required = false;
            weightInput.required = false;
        } else { // Default to reps-based
            durationGroup.classList.add('hidden');
            repsGroup.classList.remove('hidden');
            // Make reps required and duration not
            durationInput.required = false;
            repsInput.required = true;
            setsInput.required = true;
            // Handle optional/required weight
            if (selectedExercise && selectedExercise.type === 'Bodyweight/Calisthenics') {
                weightInput.required = false;
                weightInput.placeholder = "Add weight (optional)";
            } else {
                weightInput.required = true;
                weightInput.placeholder = "e.g., 50.5";
            }
        }
    });

    logWorkoutForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        logMessage.textContent = '';
        
        const selectedId = parseInt(exerciseSelect.value);
        const selectedExercise = exercisesData.find(ex => ex.id === selectedId);
        
        let formData = { exercise_id: selectedId };
        
        // Send the correct data based on exercise type
        if (selectedExercise.metric_type === 'duration') {
            formData.duration = durationInput.value;
        } else {
            formData.weight = weightInput.value;
            formData.reps = repsInput.value;
            formData.sets = setsInput.value;
        }

        // (Submission logic is the same)
        try {
            const response = await fetch('/api/log_workout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(formData) });
            const result = await response.json();
            if (response.ok && result.success) {
                logMessage.textContent = 'Workout logged!'; logMessage.style.color = '#03dac6'; updateBodyChart(result.updated_chart); logWorkoutForm.reset();
                // Reset UI to default state
                durationGroup.classList.add('hidden');
                repsGroup.classList.remove('hidden');
                weightInput.required = true;
                weightInput.placeholder = "e.g., 50.5";

            } else { logMessage.textContent = result.error || 'Failed to log.'; logMessage.style.color = '#cf6679'; }
        } catch (error) { logMessage.textContent = 'Server error.'; logMessage.style.color = '#cf6679'; }
    });

    // --- Helper functions to copy/paste ---
    fetchDashboardData = async () => { try { const response = await fetch('/api/dashboard_data'); if (!response.ok) throw new Error('Failed to fetch data'); const data = await response.json(); exercisesData = data.exercises; populateExerciseDropdown(exercisesData); updateBodyChart(data.body_chart); } catch (error) { console.error("Error:", error); chartTbody.innerHTML = `<tr><td colspan="5">Could not load data.</td></tr>`; } };
    updateBodyChart = (chartData) => { if (!chartData) return; chartTbody.innerHTML = ''; chartData.forEach(muscle => { const row = document.createElement('tr'); const rank = getRankFromScore(muscle.strength_score); const details = muscle.duration_seconds ? `${muscle.duration_seconds} seconds` : (muscle.weight_kg !== null ? `${muscle.weight_kg}kg / ${muscle.reps} reps / ${muscle.sets} sets` : 'N/A'); row.innerHTML = `<td>${muscle.muscle_group}</td><td class="rank-cell ${rank.className}">${rank.name}</td><td>${muscle.exercise_name || 'N/A'}</td><td>${details}</td><td>${muscle.strength_score.toFixed(1)}</td>`; chartTbody.appendChild(row); }); };
    populateExerciseDropdown = (exercises) => { if (!exercises) return; exerciseSelect.innerHTML = '<option value="">Select an exercise...</option>'; exercises.forEach(ex => { const option = document.createElement('option'); option.value = ex.id; option.textContent = ex.name; exerciseSelect.appendChild(option); }); };

    // --- Initial Load ---
    fetchDashboardData();
});