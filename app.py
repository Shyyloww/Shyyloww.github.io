import os
import bcrypt
from flask import Flask, render_template, request, jsonify
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)

# --- Supabase Connection ---
supabase_url = os.environ.get("SUPABASE_URL")
supabase_key = os.environ.get("SUPABASE_KEY")

if not supabase_url or not supabase_key:
    raise RuntimeError("Supabase credentials must be set.")
supabase: Client = create_client(supabase_url, supabase_key)

# --- Routes ---

@app.route('/')
def home():
    return render_template('index.html')

@app.route('/signup', methods=['POST'])
def signup():
    try:
        data = request.get_json()
        email = data.get('email')
        username = data.get('username')
        password = data.get('password')

        if not email or not password or not username:
            return jsonify({"error": "Email, username, and password are required."}), 400

        # Hash the password for security
        hashed_password = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

        # Insert new user into the database
        user_data, count = supabase.table('users').insert({
            "email": email,
            "username": username,
            "password_hash": hashed_password
        }).execute()

        # user_data[1] contains the actual user record
        if user_data[1]:
            return jsonify({"success": True, "message": "Account created successfully!"})
        else:
            return jsonify({"error": "Signup failed. Email or username might already exist."}), 500

    except Exception as e:
        # This will catch duplicate email/username errors from the database
        return jsonify({"error": f"An error occurred: {e}"}), 500

@app.route('/login', methods=['POST'])
def login():
    try:
        data = request.get_json()
        email = data.get('email')
        password = data.get('password')

        if not email or not password:
            return jsonify({"error": "Email and password are required."}), 400

        # Find the user by email
        query = supabase.table('users').select("*").eq('email', email).execute()
        
        if not query.data:
            return jsonify({"error": "Invalid email or password."}), 401

        user = query.data[0]
        stored_hash = user.get('password_hash')

        # Check if the provided password matches the stored hash
        if bcrypt.checkpw(password.encode('utf-8'), stored_hash.encode('utf-8')):
            # In a real app, you would create a session token here
            return jsonify({"success": True, "message": "Login successful!"})
        else:
            return jsonify({"error": "Invalid email or password."}), 401

    except Exception as e:
        return jsonify({"error": f"An error occurred: {e}"}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
