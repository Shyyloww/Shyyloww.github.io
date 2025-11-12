import os
import bcrypt
import jwt
from datetime import datetime, timedelta, timezone
from flask import Flask, render_template, request, jsonify, make_response, redirect, url_for
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)

# --- Configuration and Supabase Connection ---
app.config['SECRET_KEY'] = os.environ.get("SECRET_KEY")
supabase_url = os.environ.get("SUPABASE_URL")
supabase_key = os.environ.get("SUPABASE_KEY")

if not app.config['SECRET_KEY'] or not supabase_url or not supabase_key:
    raise RuntimeError("Required environment variables are not set.")

supabase: Client = create_client(supabase_url, supabase_key)

# --- Helper Function to get user from token ---
def get_user_from_token():
    token = request.cookies.get('token')
    if not token:
        return None
    try:
        payload = jwt.decode(token, app.config['SECRET_KEY'], algorithms=["HS256"])
        return payload
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        return None

# --- Main Routes ---

@app.route('/')
def home():
    if get_user_from_token():
        return redirect(url_for('dashboard'))
    return render_template('index.html')

@app.route('/dashboard')
def dashboard():
    if not get_user_from_token():
        return redirect(url_for('home'))
    return render_template('dashboard.html')

@app.route('/logout')
def logout():
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
    
    # Fetch all exercises for the dropdown
    exercises_res = supabase.table('exercises').select('id, name').order('name').execute()
    
    # Fetch user's muscle ranks
    # This is a more complex query, so we use a database function (RPC)
    # Go to Supabase > Database > Functions to create this. See instructions.
    ranks_res = supabase.rpc('get_user_muscle_ranks', {'p_user_id': user_id}).execute()

    return jsonify({
        "username": "User", # Placeholder, we'll fetch this later
        "exercises": exercises_res.data,
        "muscle_ranks": ranks_res.data
    })

@app.route('/api/log_workout', methods=['POST'])
def log_workout():
    user = get_user_from_token()
    if not user:
        return jsonify({"error": "Not authenticated"}), 401

    data = request.get_json()
    user_id = user['user_id']
    exercise_id = int(data.get('exercise_id'))
    weight = float(data.get('weight'))
    reps = int(data.get('reps'))
    sets = int(data.get('sets'))
    
    # Epley Formula for 1-rep max estimate
    strength_score = weight * (1 + (reps / 30))

    # Insert workout into DB
    supabase.table('workouts').insert({
        'user_id': user_id,
        'exercise_id': exercise_id,
        'weight_kg': weight,
        'reps': reps,
        'sets': sets,
        'strength_score': strength_score
    }).execute()
    
    # After logging, refetch the ranks and send them back
    ranks_res = supabase.rpc('get_user_muscle_ranks', {'p_user_id': user_id}).execute()
    
    return jsonify({"success": True, "updated_ranks": ranks_res.data})

# --- Authentication Routes ---
# (Signup and Login routes remain the same as before)
@app.route('/signup', methods=['POST'])
def signup():
    # ... (No changes to this function)
    try:
        data = request.get_json()
        username = data.get('username')
        password = data.get('password')
        if not username or not password: return jsonify({"error": "Username and password are required."}), 400
        hashed_password = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
        user_data, count = supabase.table('users').insert({"username": username, "password_hash": hashed_password}).execute()
        if user_data[1]: return jsonify({"success": True, "message": "Account created successfully!"})
        else: return jsonify({"error": "Signup failed. Username might already exist."}), 500
    except Exception as e: return jsonify({"error": f"An error occurred: {e}"}), 500

@app.route('/login', methods=['POST'])
def login():
    # ... (No changes to this function)
    try:
        data = request.get_json()
        username = data.get('username')
        password = data.get('password')
        remember_me = data.get('remember', False)
        if not username or not password: return jsonify({"error": "Username and password are required."}), 400
        query = supabase.table('users').select("id, password_hash").eq('username', username).execute()
        if not query.data: return jsonify({"error": "Invalid username or password."}), 401
        user = query.data[0]
        if bcrypt.checkpw(password.encode('utf-8'), user['password_hash'].encode('utf-8')):
            expiration = timedelta(days=30) if remember_me else timedelta(hours=8)
            token = jwt.encode({'user_id': user['id'], 'exp': datetime.now(timezone.utc) + expiration}, app.config['SECRET_KEY'], algorithm="HS256")
            response = make_response(jsonify({"success": True, "message": "Login successful!"}))
            response.set_cookie('token', token, httponly=True, secure=True, samesite='Lax', max_age=expiration)
            return response
        else: return jsonify({"error": "Invalid username or password."}), 401
    except Exception as e: return jsonify({"error": f"An error occurred: {e}"}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)