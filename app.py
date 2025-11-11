from flask import Flask, render_template

# Initialize the Flask app
app = Flask(__name__)

# This is the main route for your website
@app.route('/')
def home():
    # This will look for 'index.html' in your 'templates' folder and display it
    return render_template('index.html')

# This is needed for Render to run the app
if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)