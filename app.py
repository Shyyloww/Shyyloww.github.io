from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
# CORS allows your GitHub site to talk to this Render site without security errors
CORS(app) 

# This variable holds the state of your ESP32 Hotspot
# In a real app, you might use a database, but a variable works for now.
# Note: If Render restarts, this resets to "OFF".
hotspot_state = "OFF"

@app.route('/')
def home():
    return "ESP32 Controller Backend is Running!"

# The GitHub Website uses this to change the state
@app.route('/set_hotspot', methods=['GET'])
def set_hotspot():
    global hotspot_state
    # We look for ?state=ON or ?state=OFF in the URL
    status = request.args.get('state')
    if status in ["ON", "OFF"]:
        hotspot_state = status
        return jsonify({"message": f"Hotspot set to {hotspot_state}", "current_state": hotspot_state})
    return jsonify({"error": "Invalid state. Use ON or OFF"}), 400

# The ESP32 uses this to check what it should do
@app.route('/get_status', methods=['GET'])
def get_status():
    # Returns just the text "ON" or "OFF" to make it easy for ESP32
    return hotspot_state

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=10000)