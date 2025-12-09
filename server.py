import os
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from supabase import create_client, Client
from ctransformers import AutoModelForCausalLM # Example for GGUF/BIN models

app = FastAPI()

# ---------------------------------------------------------
# 1. CONNECT SUPABASE
# ---------------------------------------------------------
# We get these from Render's "Environment Variables" settings later
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# ---------------------------------------------------------
# 2. CONNECT AI (The Model)
# ---------------------------------------------------------
# NOTE: Render Free Tier only has 512MB RAM. Large models will crash it.
# You likely need a "Quantized" (GGUF) model or a TinyLlama model.

# Option A: If you managed to upload the file to GitHub (files <100MB)
# model_path = "./my_model_file.bin" 

# Option B: (RECOMMENDED) Download it on startup so GitHub doesn't reject the large file
from huggingface_hub import hf_hub_download

print("Downloading/Loading Model...")
model_path = hf_hub_download(
    repo_id="TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF", # CHANGE THIS to your model's repo
    filename="tinyllama-1.1b-chat-v1.0.Q2_K.gguf"     # CHANGE THIS to your model's filename
)

# Initialize the AI
llm = AutoModelForCausalLM.from_pretrained(model_path, model_type="llama")

# ---------------------------------------------------------
# 3. THE API ROUTE (Frontend talks to this)
# ---------------------------------------------------------
class ChatRequest(BaseModel):
    user_id: str
    question: str
    context: str = "" # Optional: what course they are looking at

@app.post("/ask-ai")
async def ask_ai(request: ChatRequest):
    try:
        # Step 1: (Optional) Log the question to Supabase
        supabase.table("ai_logs").insert({
            "user_id": request.user_id,
            "question": request.question
        }).execute()

        # Step 2: Generate Answer
        # We give the AI a persona
        prompt = f"You are a cybersecurity tutor. Context: {request.context}. Question: {request.question} Answer:"
        
        response_text = llm(prompt, max_new_tokens=256)

        return {"answer": response_text}

    except Exception as e:
        return {"error": str(e)}

@app.get("/")
def read_root():
    return {"status": "Cybersecurity AI is Online"}