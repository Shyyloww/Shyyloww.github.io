import os
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from supabase import create_client, Client
from ctransformers import AutoModelForCausalLM 
from huggingface_hub import hf_hub_download

app = FastAPI()

# ---------------------------------------------------------
# 1. CONNECT SUPABASE
# ---------------------------------------------------------
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")

# Check if keys exist to prevent startup crash
if not SUPABASE_URL or not SUPABASE_KEY:
    print("WARNING: Supabase credentials not found in Environment Variables.")
    supabase = None
else:
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# ---------------------------------------------------------
# 2. LOAD AI MODEL (TinyLlama for Low RAM)
# ---------------------------------------------------------
print("Downloading AI Model...")

# We use TheBloke's TinyLlama (GGUF format) because it runs on CPU and <500MB RAM
try:
    model_path = hf_hub_download(
        repo_id="TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF",
        filename="tinyllama-1.1b-chat-v1.0.Q2_K.gguf" 
    )
    
    print("Initializing AI Engine...")
    llm = AutoModelForCausalLM.from_pretrained(
        model_path, 
        model_type="llama"
    )
    print("AI Online.")
except Exception as e:
    print(f"CRITICAL ERROR loading AI: {e}")
    llm = None

# ---------------------------------------------------------
# 3. API ROUTE
# ---------------------------------------------------------
class ChatRequest(BaseModel):
    user_id: str
    question: str

@app.get("/")
def home():
    return {"status": "Cybersecurity AI is Online", "model": "TinyLlama"}

@app.post("/ask-ai")
async def ask_ai(request: ChatRequest):
    if not llm:
        return {"answer": "System Error: AI Model failed to load (Check Render Logs)."}
    
    # 1. Log to Supabase (Optional - Fail silently if it breaks)
    if supabase:
        try:
            supabase.table("ai_logs").insert({
                "user_id": request.user_id,
                "question": request.question
            }).execute()
        except Exception as e:
            print(f"Logging error: {e}")

    # 2. Generate Answer
    # We enforce a persona to keep it relevant
    prompt = f"User: {request.question}\nCybersecurity Tutor:"
    
    try:
        response = llm(prompt, max_new_tokens=128) # Keep tokens low for speed
        return {"answer": response}
    except Exception as e:
        return {"answer": f"Processing Error: {str(e)}"}