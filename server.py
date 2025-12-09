import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from supabase import create_client, Client
from huggingface_hub import InferenceClient

app = FastAPI()

# --- CORS SETTINGS ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 1. CONNECT SUPABASE
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")

if SUPABASE_URL and SUPABASE_KEY:
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
else:
    supabase = None

# 2. CONNECT TO HUGGING FACE
# Switching to Llama-3-8B-Instruct. 
# This is natively a CHAT model, so it works perfectly with chat_completion.
HF_TOKEN = os.environ.get("HF_TOKEN")
client = InferenceClient("meta-llama/Meta-Llama-3-8B-Instruct", token=HF_TOKEN)

class ChatRequest(BaseModel):
    user_id: str
    question: str

@app.get("/")
def home():
    return {"status": "Cyberian AI Online", "model": "Llama-3-8B"}

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

    # Generate Answer using CHAT COMPLETION
    # Llama 3 expects a system prompt and a user prompt.
    messages = [
        {"role": "system", "content": "You are a cybersecurity tutor named Cyberian. Keep answers technical, concise, and focused on security concepts."},
        {"role": "user", "content": request.question}
    ]
    
    try:
        response = client.chat_completion(messages, max_tokens=500, stream=False)
        return {"answer": response.choices[0].message.content}

    except Exception as e:
        return {"answer": f"Backend Error: {str(e)}"}