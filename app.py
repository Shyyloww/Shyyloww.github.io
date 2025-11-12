import os
import bcrypt
import jwt
from datetime import datetime, timedelta, timezone
from flask import Flask, render_template, request, jsonify, make_response, redirect, url_for
from supabase import create_client, Client
from dotenv import load_dotenv

# Load environment variables for local development
load_dotenv()

app = Flask(__name__)

# --- Configuration and Supabase Connection ---
app.config['SECRET_KEY'] = os.environ.get("SECRET_KEY")
supabase_url = os.environ.get("SUPABASE_URL")
supabase_key = os.environ.get("SUPABASE_KEY")

# Security check to ensure the app doesn't start without its keys
if not app.config['SECRET_KEY'] or not supabase_url or not supabase_key:
    raise RuntimeError("Required environment variables (SECRET_KEY, SUPABASE_URL, SUPABASE_KEY) are not set.")

supabase: Client = create_client(supabase_url, supabase_key)

SCORE_MULTIPLIER = 3.0

# --- Helper Function to get user data from the browser cookie ---
def get_user_from_token():
    token = request.cookies.get('token')
    if not token:
        return None
    try:
        # Decode the token to get the user's ID
        payload = jwt.decode(token, app.config['SECRET_KEY'], algorithms=["HS256"])
        return payload
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        # If the token is bad, treat them as logged out
        return None

# --- Main Page Routes ---

@app.route('/')
def home():
    # If the user has a valid token, send them straight to the dashboard
    if get_user_from_token():
        return redirect(url_for('dashboard'))
    # Otherwise, show the login/signup page
    return render_template('index.html')

@app.route('/dashboard')
def dashboard():
    # Protect this page: if no valid token, redirect to the login page
    if not get_user_from_token():
        return redirect(url_for('home'))
    return render_template('dashboard.html')

@app.route('/logout')
def logout():
    # Create a response that redirects to the home page and clears the session cookie
    response = make_response(redirect(url_for('home')))
    response.set_cookie('token', '', expires=0)
    return response

# --- API Routes (for JavaScript to call) ---

@app.route('/api/dashboard_data')
def get_dashboard_data():
    user = get_user_from_token()
    if not user:
        return jsonify({"error": "Not authenticated"}), 401
    
    user_id = user['user_id']
    
    # Fetch all exercises, including their type and the new metric_type
    exercises_res = supabase.table('exercises').select('id, name, type, metric_type').order('name').execute()
    
    # Call our powerful database function to get the full body chart
    chart_data_res = supabase.rpc('get_user_body_chart_data', {'p_user_id': user_id}).execute()

    return jsonify({
        "exercises": exercises_res.data,
        "body_chart": chart_data_res.data
    })

@app.route('/api/log_workout', methods=['POST'])
def log_workout():
    user = get_user_from_token()
    if not user:
        return jsonify({"error": "Not authenticated"}), 401

    data = request.get_json()
    user_id = user['user_id']
    exercise_id = int(data.get('exercise_id'))
    
    # Fetch exercise details to know how to process it
    exercise_details_res = supabase.table('exercises').select('name, type, metric_type, bodyweight_multiplier').eq('id', exercise_id).single().execute()
    exercise_info = exercise_details_res.data
    
    strength_score = 0
    # This payload will be sent to the database
    workout_payload = { 'user_id': user_id, 'exercise_id': exercise_id }

    # --- NEW DYNAMIC LOGIC ---
    if exercise_info['metric_type'] == 'duration':
        duration = int(data.get('duration', 0))
        multiplier = exercise_info.get('bodyweight_multiplier') or 1.0
        strength_score = duration * multiplier
        workout_payload['duration_seconds'] = duration
    else: # Default to 'reps' based exercises
        weight_str = data.get('weight', '0')
        weight = float(weight_str) if weight_str else 0.0
        reps = int(data.get('reps'))
        sets = int(data.get('sets'))
        
        # Server-side validation: if it's a 'Weighted' type, weight is mandatory
        if exercise_info['type'] == 'Weighted' and weight <= 0:
            return jsonify({"error": f"Weight is required for this exercise."}), 400
        
        if weight > 0:
            # If any weight is added (even to a bodyweight exercise), use the Epley formula
            strength_score = weight * (1 + (reps / 30))
        else:
            # If weight is 0, use the bodyweight multiplier
            multiplier = exercise_info.get('bodyweight_multiplier') or 1.0
            strength_score = reps * multiplier
            
        workout_payload['weight_kg'] = weight
        workout_payload['reps'] = reps
        workout_payload['sets'] = sets

    workout_payload['strength_score'] = unmultiplied_score * SCORE_MULTIPLIER
    supabase.table('workouts').insert(workout_payload).execute()
    
    # After logging, refetch the full chart data and send it back to update the UI
    chart_data_res = supabase.rpc('get_user_body_chart_data', {'p_user_id': user_id}).execute()
    
    return jsonify({"success": True, "updated_chart": chart_data_res.data})


# --- Authentication Routes (No Changes Needed) ---

@app.route('/signup', methods=['POST'])
def signup():
    try:
        data = request.get_json()
        username, password = data.get('username'), data.get('password')
        if not username or not password:
            return jsonify({"error": "Username and password are required."}), 400
        hashed_password = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
        supabase.table('users').insert({"username": username, "password_hash": hashed_password}).execute()
        return jsonify({"success": True, "message": "Account created successfully!"})
    except Exception as e:
        # Catches errors like a duplicate username
        return jsonify({"error": f"An error occurred. The username may already be taken."}), 500

@app.route('/login', methods=['POST'])
def login():
    try:
        data = request.get_json()
        username, password, remember = data.get('username'), data.get('password'), data.get('remember', False)
        if not username or not password:
            return jsonify({"error": "Username and password are required."}), 400
        
        query = supabase.table('users').select("id, password_hash").eq('username', username).execute()
        if not query.data:
            return jsonify({"error": "Invalid username or password."}), 401
        
        user = query.data[0]
        if bcrypt.checkpw(password.encode('utf-8'), user['password_hash'].encode('utf-8')):
            # Set cookie duration based on "Remember Me"
            expiration = timedelta(days=30) if remember else timedelta(hours=8)
            token = jwt.encode({'user_id': user['id'], 'exp': datetime.now(timezone.utc) + expiration}, app.config['SECRET_KEY'], algorithm="HS256")
            
            response = make_response(jsonify({"success": True, "message": "Login successful!"}))
            response.set_cookie('token', token, httponly=True, secure=True, samesite='Lax', max_age=expiration)
            return response
        else:
            return jsonify({"error": "Invalid username or password."}), 401
    except Exception as e:
        return jsonify({"error": f"An server error occurred: {e}"}), 500

# This is required for Render to run the app
if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)