document.addEventListener('DOMContentLoaded', () => {
    const exerciseSelect = document.getElementById('exercise-select');
    const weightInput = document.getElementById('weight-input');
    const chartTbody = document.getElementById('body-chart-tbody');
    const logWorkoutForm = document.getElementById('log-workout-form');
    const logMessage = document.getElementById('log-message');

    let exercisesData = [];

    // --- Core Functions ---

    const fetchDashboardData = async () => {
        try {
            const response = await fetch('/api/dashboard_data');
            if (!response.ok) throw new Error('Failed to fetch data');
            const data = await response.json();
            
            exercisesData = data.exercises;
            populateExerciseDropdown(exercisesData);
            updateBodyChart(data.body_chart);

        } catch (error) {
            console.error("Error fetching dashboard data:", error);
            chartTbody.innerHTML = `<tr><td colspan="5">Could not load data.</td></tr>`;
        }
    };

    const updateBodyChart = (chartData) => {
        if (!chartData) return;
        
        chartTbody.innerHTML = ''; // Clear existing rows

        chartData.forEach(muscle => {
            const row = document.createElement('tr');
            const rank = getRankFromScore(muscle.strength_score);
            
            row.innerHTML = `
                <td>${muscle.muscle_group}</td>
                <td class="rank-cell ${rank.className}">${rank.name}</td>
                <td>${muscle.exercise_name || 'N/A'}</td>
                <td>${muscle.weight_kg !== null ? `${muscle.weight_kg}kg / ${muscle.reps} reps / ${muscle.sets} sets` : 'N/A'}</td>
                <td>${muscle.strength_score.toFixed(1)}</td>
            `;
            chartTbody.appendChild(row);
        });
    };

    const getRankFromScore = (score) => {
        if (score <= 0) return { name: 'Unranked', className: 'rank-unranked' };
        if (score <= 50) return { name: 'Novice', className: 'rank-novice' };
        if (score <= 100) return { name: 'Intermediate', className: 'rank-intermediate' };
        if (score <= 150) return { name: 'Advanced', className: 'rank-advanced' };
        return { name: 'Elite', className: 'rank-elite' };
    };
    
    const populateExerciseDropdown = (exercises) => {
        if (!exercises) return;
        exerciseSelect.innerHTML = '<option value="">Select an exercise...</option>';
        exercises.forEach(ex => {
            const option = document.createElement('option');
            option.value = ex.id;
            option.textContent = ex.name;
            exerciseSelect.appendChild(option);
        });
    };

    // --- Event Listeners ---

    exerciseSelect.addEventListener('change', (e) => {
        const selectedId = parseInt(e.target.value);
        const selectedExercise = exercisesData.find(ex => ex.id === selectedId);
        if (selectedExercise && selectedExercise.type === 'Bodyweight/Calisthenics') {
            weightInput.value = 0;
            weightInput.disabled = true;
        } else {
            weightInput.value = '';
            weightInput.disabled = false;
        }
    });

    logWorkoutForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        logMessage.textContent = '';
        const formData = {
            exercise_id: exerciseSelect.value,
            weight: weightInput.value,
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
                updateBodyChart(result.updated_chart); // Refresh the chart with new data
                logWorkoutForm.reset();
                weightInput.disabled = false;
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