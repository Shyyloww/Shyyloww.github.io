import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware  # <--- NEW IMPORT
from pydantic import BaseModel
from supabase import create_client, Client
from huggingface_hub import InferenceClient

app = FastAPI()

# --- FIX: ALLOW YOUR WEBSITE TO TALK TO SERVER ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all websites (safe for public APIs)
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# -------------------------------------------------

# 1. CONNECT SUPABASE
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")

if SUPABASE_URL and SUPABASE_KEY:
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
else:
    supabase = None

# 2. CONNECT TO HUGGING FACE
HF_TOKEN = os.environ.get("HF_TOKEN")
client = InferenceClient("mistralai/Mistral-7B-Instruct-v0.3", token=HF_TOKEN)

class ChatRequest(BaseModel):
    user_id: str
    question: str

@app.get("/")
def home():
    return {"status": "Cyberian AI Online"}

@app.post("/ask-ai")
async def ask_ai(request: ChatRequest):
    # Log to Supabase (Optional)
    if supabase:
        try:
            supabase.table("ai_logs").insert({
                "user_id": request.user_id,
                "question": request.question
            }).execute()
        except:
            pass 

    # Generate Answer
    prompt = f"You are a cybersecurity tutor. Keep it short.\nUser: {request.question}\nTutor:"
    
    try:
        response_text = ""
        for token in client.text_generation(prompt, max_new_tokens=200, stream=True):
            response_text += token
        return {"answer": response_text}

    except Exception as e:
        return {"answer": f"Error: {str(e)}"}