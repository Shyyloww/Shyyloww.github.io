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

# --- Routes ---

@app.route('/')
def home():
    token = request.cookies.get('token')
    if not token:
        return render_template('index.html') # No token, show login page

    try:
        # If token is valid, redirect to dashboard immediately
        jwt.decode(token, app.config['SECRET_KEY'], algorithms=["HS256"])
        return redirect(url_for('dashboard'))
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        # Invalid or expired token, show login page
        return render_template('index.html')

@app.route('/dashboard')
def dashboard():
    token = request.cookies.get('token')
    if not token:
        return redirect(url_for('home')) # Redirect to login if no token

    try:
        payload = jwt.decode(token, app.config['SECRET_KEY'], algorithms=["HS256"])
        # You could fetch user-specific data here using payload['user_id']
        return render_template('dashboard.html')
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        return redirect(url_for('home')) # Redirect if token is bad

@app.route('/signup', methods=['POST'])
def signup():
    # ... (Signup logic remains the same)
    try:
        data = request.get_json()
        username = data.get('username')
        password = data.get('password')

        if not username or not password:
            return jsonify({"error": "Username and password are required."}), 400

        hashed_password = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

        user_data, count = supabase.table('users').insert({
            "username": username,
            "password_hash": hashed_password
        }).execute()

        if user_data[1]:
            return jsonify({"success": True, "message": "Account created successfully!"})
        else:
            return jsonify({"error": "Signup failed. Username might already exist."}), 500
    except Exception as e:
        return jsonify({"error": f"An error occurred: {e}"}), 500

@app.route('/login', methods=['POST'])
def login():
    try:
        data = request.get_json()
        username = data.get('username')
        password = data.get('password')
        remember_me = data.get('remember', False) # Get 'remember me' status

        if not username or not password:
            return jsonify({"error": "Username and password are required."}), 400

        query = supabase.table('users').select("id, password_hash").eq('username', username).execute()
        
        if not query.data:
            return jsonify({"error": "Invalid username or password."}), 401

        user = query.data[0]
        if bcrypt.checkpw(password.encode('utf-8'), user['password_hash'].encode('utf-8')):
            # Password is correct, now create the token
            expiration = timedelta(days=30) if remember_me else timedelta(hours=8)
            token = jwt.encode({
                'user_id': user['id'],
                'exp': datetime.now(timezone.utc) + expiration
            }, app.config['SECRET_KEY'], algorithm="HS256")

            response = make_response(jsonify({"success": True, "message": "Login successful!"}))
            response.set_cookie('token', token, httponly=True, secure=True, samesite='Lax', max_age=expiration)
            return response
        else:
            return jsonify({"error": "Invalid username or password."}), 401
    except Exception as e:
        return jsonify({"error": f"An error occurred: {e}"}), 500

@app.route('/logout')
def logout():
    response = make_response(redirect(url_for('home')))
    response.set_cookie('token', '', expires=0) # Clear the cookie
    return response

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)