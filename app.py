import os
from flask import Flask, render_template
from supabase import create_client, Client
from dotenv import load_dotenv

# Load environment variables from a .env file if it exists (for local development)
load_dotenv()

# Initialize the Flask app
app = Flask(__name__)

# Get Supabase credentials from environment variables
supabase_url = os.environ.get("SUPABASE_URL")
supabase_key = os.environ.get("SUPABASE_KEY")

# Check if the credentials are set
if not supabase_url or not supabase_key:
    raise RuntimeError("Supabase URL and Key must be set in environment variables.")

# Create the Supabase client
supabase: Client = create_client(supabase_url, supabase_key)

# This is the main route for your website
@app.route('/')
def home():
    # Let's test the connection by fetching the list of exercises
    try:
        response = supabase.table('exercises').select('name').limit(5).execute()
        # The actual data is in response.data
        exercises = response.data
        print("Successfully connected to Supabase and fetched exercises.")
    except Exception as e:
        exercises = []
        print(f"Error connecting to Supabase: {e}")

    # This will look for 'index.html' in your 'templates' folder and display it
    return render_template('index.html', exercises=exercises)


# This is needed for Render to run the app
if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)