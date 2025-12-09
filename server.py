import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from supabase import create_client, Client
from huggingface_hub import InferenceClient

app = FastAPI()

# --- 1. SECURITY: CORS MIDDLEWARE ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- 2. DATABASE CONNECTION ---
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")

if SUPABASE_URL and SUPABASE_KEY:
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
else:
    print("Warning: Supabase credentials missing. Logging disabled.")
    supabase = None

# --- 3. AI ENGINE CONNECTION ---
# SWITCHING TO MISTRAL v0.3
# This model is currently active and supports the 'chat_completion' method used below.
HF_TOKEN = os.environ.get("HF_TOKEN")
client = InferenceClient("mistralai/Mistral-7B-Instruct-v0.3", token=HF_TOKEN)

class ChatRequest(BaseModel):
    user_id: str
    question: str

@app.get("/")
def home():
    return {"status": "Cyberian AI Online", "model": "Mistral-7B-v0.3"}

@app.post("/ask-ai")
async def ask_ai(request: ChatRequest):
    # Log to Supabase (Optional)
    if supabase:
        try:
            supabase.table("ai_logs").insert({
                "user_id": request.user_id,
                "question": request.question
            }).execute()
        except Exception as e:
            print(f"Logging Error: {e}") 

    # Generate Answer
    # We use chat_completion because it handles the formatting automatically
    try:
        response = client.chat_completion(
            messages=[
                {"role": "system", "content": "You are a cybersecurity tutor named Cyberian. Keep answers technical, concise, and focused on security concepts."},
                {"role": "user", "content": request.question}
            ],
            max_tokens=512,
            stream=False
        )
        
        return {"answer": response.choices[0].message.content}

    except Exception as e:
        # This will print the exact error from Hugging Face if something goes wrong
        return {"answer": f"System Error: {str(e)}"}