import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from supabase import create_client, Client
from huggingface_hub import InferenceClient

app = FastAPI()

# --- 1. SECURITY: CORS MIDDLEWARE ---
# This allows your GitHub Pages site to talk to this Render server.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins (safe for public learning sites)
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- 2. DATABASE CONNECTION (Supabase) ---
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")

if SUPABASE_URL and SUPABASE_KEY:
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
else:
    print("Warning: Supabase credentials missing. Logging disabled.")
    supabase = None

# --- 3. AI ENGINE CONNECTION (Hugging Face) ---
# We use Zephyr-7B via the Chat Completion API.
# This API automatically handles the prompt formatting.
HF_TOKEN = os.environ.get("HF_TOKEN")
client = InferenceClient("HuggingFaceH4/zephyr-7b-beta", token=HF_TOKEN)

# --- 4. DATA MODELS ---
class ChatRequest(BaseModel):
    user_id: str
    question: str

# --- 5. ROUTES ---

@app.get("/")
def home():
    return {"status": "Cyberian AI System Online", "model": "Zephyr-7B"}

@app.post("/ask-ai")
async def ask_ai(request: ChatRequest):
    # Step A: Log the question to Supabase (if connected)
    if supabase:
        try:
            supabase.table("ai_logs").insert({
                "user_id": request.user_id,
                "question": request.question
            }).execute()
        except Exception as e:
            print(f"Logging Error: {e}") 

    # Step B: specific instructions for the AI behavior
    system_prompt = "You are a cybersecurity tutor named Cyberian. Keep answers technical, concise, and focused on security concepts. Do not hallucinate tools."

    # Step C: Send to Hugging Face
    try:
        response = client.chat_completion(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": request.question}
            ],
            max_tokens=512,
            stream=False
        )
        
        # Extract the actual text answer
        answer_text = response.choices[0].message.content
        return {"answer": answer_text}

    except Exception as e:
        return {"answer": f"System Error: {str(e)}"}