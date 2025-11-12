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

# --- Helper Function ---
def get_user_from_token():
    token = request.cookies.get('token')
    if not token: return None
    try:
        return jwt.decode(token, app.config['SECRET_KEY'], algorithms=["HS256"])
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        return None

# --- Main Routes ---
@app.route('/')
def home():
    if get_user_from_token(): return redirect(url_for('dashboard'))
    return render_template('index.html')

@app.route('/dashboard')
def dashboard():
    if not get_user_from_token(): return redirect(url_for('home'))
    return render_template('dashboard.html')

@app.route('/logout')
def logout():
    response = make_response(redirect(url_for('home')))
    response.set_cookie('token', '', expires=0)
    return response

# --- API Routes ---
@app.route('/api/dashboard_data')
def get_dashboard_data():
    user = get_user_from_token()
    if not user: return jsonify({"error": "Not authenticated"}), 401
    
    user_id = user['user_id']
    
    exercises_res = supabase.table('exercises').select('id, name, type').order('name').execute()
    
    # CALL THE NEW, MORE POWERFUL DATABASE FUNCTION
    chart_data_res = supabase.rpc('get_user_body_chart_data', {'p_user_id': user_id}).execute()

    return jsonify({
        "exercises": exercises_res.data,
        "body_chart": chart_data_res.data # Send the new data to the front-end
    })

@app.route('/api/log_workout', methods=['POST'])
def log_workout():
    user = get_user_from_token()
    if not user: return jsonify({"error": "Not authenticated"}), 401

    data = request.get_json()
    user_id = user['user_id']
    exercise_id = int(data.get('exercise_id'))
    weight = float(data.get('weight'))
    reps = int(data.get('reps'))
    sets = int(data.get('sets'))

    # --- NEW LOGIC START ---
    
    # Fetch the exercise details to check its type
    exercise_details_res = supabase.table('exercises').select('type, bodyweight_multiplier').eq('id', exercise_id).single().execute()
    exercise_info = exercise_details_res.data
    
    strength_score = 0
    if exercise_info['type'] == 'Weighted':
        # Use the Epley formula for weighted lifts
        strength_score = weight * (1 + (reps / 30))
    elif exercise_info['type'] == 'Bodyweight/Calisthenics':
        # Use the new multiplier formula for bodyweight lifts
        multiplier = exercise_info.get('bodyweight_multiplier') or 1.0
        strength_score = reps * multiplier

    # --- NEW LOGIC END ---

    supabase.table('workouts').insert({
        'user_id': user_id, 'exercise_id': exercise_id, 'weight_kg': weight,
        'reps': reps, 'sets': sets, 'strength_score': strength_score
    }).execute()
    
    chart_data_res = supabase.rpc('get_user_body_chart_data', {'p_user_id': user_id}).execute()
    
    return jsonify({"success": True, "updated_chart": chart_data_res.data})

# --- Auth Routes (No Changes) ---
@app.route('/signup', methods=['POST'])
def signup():
    try:
        data = request.get_json()
        username, password = data.get('username'), data.get('password')
        if not username or not password: return jsonify({"error": "Username and password are required."}), 400
        hashed_password = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
        supabase.table('users').insert({"username": username, "password_hash": hashed_password}).execute()
        return jsonify({"success": True, "message": "Account created successfully!"})
    except Exception as e: return jsonify({"error": f"An error occurred: {e}"}), 500

@app.route('/login', methods=['POST'])
def login():
    try:
        data = request.get_json()
        username, password, remember = data.get('username'), data.get('password'), data.get('remember', False)
        if not username or not password: return jsonify({"error": "Username and password are required."}), 400
        query = supabase.table('users').select("id, password_hash").eq('username', username).execute()
        if not query.data: return jsonify({"error": "Invalid username or password."}), 401
        user = query.data[0]
        if bcrypt.checkpw(password.encode('utf-8'), user['password_hash'].encode('utf-8')):
            expiration = timedelta(days=30) if remember else timedelta(hours=8)
            token = jwt.encode({'user_id': user['id'], 'exp': datetime.now(timezone.utc) + expiration}, app.config['SECRET_KEY'], algorithm="HS256")
            response = make_response(jsonify({"success": True}))
            response.set_cookie('token', token, httponly=True, secure=True, samesite='Lax', max_age=expiration)
            return response
        else: return jsonify({"error": "Invalid username or password."}), 401
    except Exception as e: return jsonify({"error": f"An error occurred: {e}"}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)