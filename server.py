import os
from fastapi import FastAPI
from pydantic import BaseModel
from supabase import create_client, Client
from huggingface_hub import InferenceClient

app = FastAPI()

# ---------------------------------------------------------
# 1. CONNECT SUPABASE
# ---------------------------------------------------------
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")

if SUPABASE_URL and SUPABASE_KEY:
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
else:
    supabase = None

# ---------------------------------------------------------
# 2. CONNECT TO HUGGING FACE API (No RAM usage locally!)
# ---------------------------------------------------------
# We use Mistral-7B-Instruct. It is 10x smarter than TinyLlama.
HF_TOKEN = os.environ.get("HF_TOKEN")
client = InferenceClient(
    "mistralai/Mistral-7B-Instruct-v0.3", 
    token=HF_TOKEN
)

class ChatRequest(BaseModel):
    user_id: str
    question: str

@app.get("/")
def home():
    return {"status": "Cybersecurity AI Bridge is Online", "mode": "API Proxy"}

@app.post("/ask-ai")
async def ask_ai(request: ChatRequest):
    # 1. Log to Supabase (Optional)
    if supabase:
        try:
            supabase.table("ai_logs").insert({
                "user_id": request.user_id,
                "question": request.question
            }).execute()
        except:
            pass 

    # 2. Generate Answer via API
    # We send the prompt to Hugging Face's servers
    prompt = f"You are a helpful cybersecurity tutor. Keep answers short and technical.\nUser: {request.question}\nTutor:"
    
    try:
        response_text = ""
        # Streaming the response to get the text
        for token in client.text_generation(prompt, max_new_tokens=200, stream=True):
            response_text += token
        
        return {"answer": response_text}

    except Exception as e:
        return {"answer": f"Error contacting AI: {str(e)}"}