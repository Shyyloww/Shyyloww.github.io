import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from supabase import create_client, Client
from huggingface_hub import InferenceClient

app = FastAPI()

# --- CORS SETTINGS (Allows your site to talk to this server) ---
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
# We are switching to Zephyr-7b-beta because it allows "text_generation" on the free tier
HF_TOKEN = os.environ.get("HF_TOKEN")
client = InferenceClient("HuggingFaceH4/zephyr-7b-beta", token=HF_TOKEN)

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
    # Zephyr uses a specific format: <|system|>...<|user|>...<|assistant|>
    prompt = f"<|system|>\nYou are a helpful cybersecurity tutor. Keep answers short and technical.<|endoftext|>\n<|user|>\n{request.question}<|endoftext|>\n<|assistant|>\n"
    
    try:
        response_text = ""
        # We use text_generation because it is stable on the free tier
        for token in client.text_generation(prompt, max_new_tokens=256, stream=True):
            response_text += token
        
        return {"answer": response_text}

    except Exception as e:
        return {"answer": f"Error: {str(e)}"}