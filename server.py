import os
import json
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from huggingface_hub import InferenceClient

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

HF_TOKEN = os.environ.get("HF_TOKEN")
client = InferenceClient("meta-llama/Meta-Llama-3-8B-Instruct", token=HF_TOKEN)

class ChatRequest(BaseModel):
    user_id: str
    question: str

class SortRequest(BaseModel):
    categories: list  # List of visible categories

@app.get("/")
def home():
    return {"status": "Cyberian AI Online", "model": "Llama-3-8B"}

@app.post("/ask-ai")
async def ask_ai(request: ChatRequest):
    messages = [
        {"role": "system", "content": "You are a cybersecurity tutor named Cyberian. Keep answers technical, concise, and focused on security concepts."},
        {"role": "user", "content": request.question}
    ]
    try:
        response = client.chat_completion(messages, max_tokens=500, stream=False)
        return {"answer": response.choices[0].message.content}
    except Exception as e:
        return {"answer": f"Backend Error: {str(e)}"}

@app.post("/smart-sort")
async def smart_sort(request: SortRequest):
    # Simplify input for the AI
    cats_simplified = [{"id": c['id'], "title": c['title']} for c in request.categories]
    
    prompt = f"""
    You are a curriculum architect.
    Task: Reorder the following list of learning modules into the perfect "Zero to Hero" learning path for a complete beginner.
    
    Rules:
    1. Start with foundational concepts (Hardware, OS, Networking).
    2. Move to core skills (Coding, Scripting).
    3. Then defensive/offensive security.
    4. End with advanced/specialized topics.
    
    Modules to Sort: {json.dumps(cats_simplified)}
    
    OUTPUT FORMAT: Return ONLY a raw JSON array of the Category IDs in the correct order. No text.
    Example: [10, 2, 5, 8]
    """

    messages = [
        {"role": "system", "content": "You are a JSON-only API. You output only raw arrays of integers."},
        {"role": "user", "content": prompt}
    ]

    try:
        response = client.chat_completion(messages, max_tokens=200, stream=False)
        content = response.choices[0].message.content.strip()
        
        # Clean up potential markdown wrapper
        if "[" in content and "]" in content:
            start = content.find("[")
            end = content.find("]", start) + 1
            json_str = content[start:end]
            sorted_ids = json.loads(json_str)
            return {"sorted_ids": sorted_ids}
        else:
            return {"error": "AI parsing failed", "raw": content}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))