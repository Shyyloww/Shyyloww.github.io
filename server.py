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

# CONNECT TO HUGGING FACE
HF_TOKEN = os.environ.get("HF_TOKEN")
client = InferenceClient("meta-llama/Meta-Llama-3-8B-Instruct", token=HF_TOKEN)

class ChatRequest(BaseModel):
    user_id: str
    question: str

class SortRequest(BaseModel):
    goal: str
    categories: list  # List of dicts: [{'id': 1, 'title': '...'}, ...]

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
    # Construct a prompt for the AI to act as a curriculum architect
    cats_simplified = [{"id": c['id'], "title": c['title']} for c in request.categories]
    
    prompt = f"""
    You are a curriculum architect. 
    User Goal: "{request.goal}"
    Available Modules: {json.dumps(cats_simplified)}
    
    Task: Reorder the modules to create the perfect learning path for this goal. Start with prerequisites, then move to core skills, then advanced topics.
    
    CRITICAL OUTPUT RULE: Return ONLY a raw JSON array of integers representing the IDs in the correct order. Do not explain.
    Example format: [3, 1, 5, 2]
    """

    messages = [
        {"role": "system", "content": "You are a JSON-only API. You only output raw lists of integers."},
        {"role": "user", "content": prompt}
    ]

    try:
        response = client.chat_completion(messages, max_tokens=200, stream=False)
        content = response.choices[0].message.content.strip()
        
        # specific cleanup for Llama sometimes adding text
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