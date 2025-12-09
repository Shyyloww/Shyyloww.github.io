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
# We stick with Mistral v0.3 because it is reliable, but we must use text_generation
HF_TOKEN = os.environ.get("HF_TOKEN")
client = InferenceClient("mistralai/Mistral-7B-Instruct-v0.3", token=HF_TOKEN)

class ChatRequest(BaseModel):
    user_id: str
    question: str

@app.get("/")
def home():
    return {"status": "Cyberian AI Online", "model": "Mistral-7B-v0.3 (TextGen)"}

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

    # Generate Answer using TEXT GENERATION
    # We manually format the prompt with [INST] tags which Mistral expects.
    # This bypasses the "Is this a chat model?" error.
    prompt_text = f"<s>[INST] You are a cybersecurity tutor. Keep answers short and technical. User: {request.question} [/INST]"
    
    try:
        response_text = client.text_generation(
            prompt_text, 
            max_new_tokens=500, 
            stream=False,
            return_full_text=False # Only return the answer, not the prompt
        )
        return {"answer": response_text}

    except Exception as e:
        return {"answer": f"Backend Error: {str(e)}"}