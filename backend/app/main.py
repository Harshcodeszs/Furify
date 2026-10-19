import os
import re
import io
import json
from typing import Optional

import torch
import torch.nn as nn
from dotenv import load_dotenv
from fastapi import FastAPI, File, UploadFile, Header, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from PIL import Image, ImageOps
from supabase import create_client, Client
from torchvision import models, transforms
from torchvision.models import EfficientNet_B0_Weights

app = FastAPI(title="Furify API")

# --- PATH CONFIGURATION ---
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# From backend/app up to the repo root, then into frontend/
FRONTEND_DIR = os.path.abspath(os.path.join(BASE_DIR, "../../frontend"))

# --- SUPABASE ---
# Local dev reads backend/.env. On Render, the real environment variables are used.
load_dotenv(os.path.join(BASE_DIR, "..", ".env"))

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
    raise RuntimeError(
        "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY "
        "(backend/.env locally, Render environment variables in production)."
    )
# Service-role key bypasses RLS: it must stay on the server, never in frontend code.
supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

# --- SETTINGS ---
MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB
CONFIDENCE_THRESHOLD = 0.35
GUEST_SCAN_LIMIT = 3
VALID_SCAN_SOURCES = ("Camera", "Upload")  # must match the scan.scan_source check constraint

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# --- LOAD AI RESOURCES ---
print("Loading AI resources...")

# 1. Class names (same file/order used during training)
with open(os.path.join(BASE_DIR, "class_names.json"), "r", encoding="utf-8") as f:
    class_names = json.load(f)
NUM_CLASSES = len(class_names)

# 2. Optional breed metadata
breed_info = {}
breed_info_path = os.path.join(BASE_DIR, "breed_info.json")
if os.path.exists(breed_info_path):
    with open(breed_info_path, "r", encoding="utf-8") as f:
        breed_info = json.load(f)

# 3. Stage 1: gatekeeper (ImageNet EfficientNet-B0)
gatekeeper_model = models.efficientnet_b0(weights=EfficientNet_B0_Weights.DEFAULT).to(device)
gatekeeper_model.eval()

# 4. Stage 2: fine-tuned breed classifier
model = models.efficientnet_b0(weights=None)
model.classifier[1] = nn.Linear(model.classifier[1].in_features, NUM_CLASSES)
model.load_state_dict(torch.load(os.path.join(BASE_DIR, "dog_model.pth"), map_location=device))
model.to(device)
model.eval()

print("AI models and metadata loaded successfully!")

val_transform = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
])


def format_info(breed):
    info = breed_info.get(breed)
    if info is None:
        return "No additional information available for this breed."
    if isinstance(info, dict):
        return info.get("description", "No description available.")
    return str(info)


# --- SUPABASE HELPERS ---
def resolve_user_id(authorization: Optional[str]) -> Optional[str]:
    """Returns the logged-in user's id, or None for guests.
    A token that is sent but invalid or expired is a 401, not a silent guest."""
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization.split(" ", 1)[1].strip()
    try:
        return supabase.auth.get_user(token).user.id
    except Exception:
        raise HTTPException(status_code=401, detail="Session expired. Please log in again.")


def guest_scans_used(guest_device_id: str) -> int:
    try:
        result = (
            supabase.table("scan")
            .select("scan_id", count="exact")
            .eq("guest_device_id", guest_device_id)
            .execute()
        )
        return result.count or 0
    except Exception as err:
        # Fails open so a database hiccup doesn't block every guest.
        print(f"Guest limit check failed: {err}")
        return 0


import uuid

FORMATS = {
    "JPEG": (".jpg", "image/jpeg"),
    "PNG": (".png", "image/png"),
    "WEBP": (".webp", "image/webp"),
}

def save_scan(user_id, guest_device_id, scan_source, top3, image_bytes, image_format="JPEG"):
    """Saves one scan row, uploads raw verified image bytes securely using Pillow's detected format."""
    image_path = None
    try:
        # Use verified server-side format instead of client-supplied headers
        ext, content_type = FORMATS.get(image_format, (".jpg", "image/jpeg"))

        owner_folder = user_id if user_id else f"guest_{guest_device_id[:20]}"
        file_name = f"{owner_folder}/{uuid.uuid4()}{ext}"

        storage_res = supabase.storage.from_("scans").upload(
            file_name,
            image_bytes,
            file_options={"content-type": content_type, "upsert": "false"},
        )
        
        if hasattr(storage_res, "path") and storage_res.path:
            image_path = storage_res.path
        elif isinstance(storage_res, dict) and "path" in storage_res:
            image_path = storage_res["path"]
        else:
            image_path = file_name
            
    except Exception as upload_err:
        print(f"Image storage upload error: {upload_err}")

    try:
        inserted = supabase.table("scan").insert({
            "user_id": user_id,
            "guest_device_id": None if user_id else guest_device_id,
            "scan_source": scan_source,
            "image_path": image_path,
        }).execute()
        
        if not inserted.data:
            return

        scan_id = inserted.data[0]["scan_id"]

        names = [m["breed"] for m in top3]
        found = (
            supabase.table("breed")
            .select("breed_id, breed_name")
            .in_("breed_name", names)
            .execute()
        )
        id_by_name = {b["breed_name"]: b["breed_id"] for b in found.data}

        rows = [
            {
                "scan_id": scan_id,
                "breed_id": id_by_name[m["breed"]],
                "confidence_score": round(m["confidence"] * 100, 2),
                "rank": rank,
            }
            for rank, m in enumerate(top3, start=1)
            if m["breed"] in id_by_name
        ]
        if rows:
            supabase.table("scan_result").insert(rows).execute()
    except Exception as err:
        print(f"Database logging error: {err}")



# --- API ENDPOINTS ---
# Plain `def` (not `async def`) so FastAPI runs the blocking PyTorch work in a
# thread pool instead of freezing the whole server during each prediction.
@app.post("/api/predict")
def predict(
    file: UploadFile = File(...),
    guest_device_id: Optional[str] = Header(None, alias="X-Guest-Device-ID"),
    scan_source: str = Header("Upload", alias="X-Scan-Source"),
    authorization: Optional[str] = Header(None),
):
    
    # --- 1. WHO IS THIS? (logged-in user or guest) ---
    user_id = resolve_user_id(authorization)
    if scan_source not in VALID_SCAN_SOURCES:
        scan_source = "Upload"

    if user_id is None:
        guest_device_id = (guest_device_id or "").strip()[:100]
        if not guest_device_id:
            raise HTTPException(
                status_code=400,
                detail="Missing identification. Provide an X-Guest-Device-ID header or sign in.",
            )
        if guest_scans_used(guest_device_id) >= GUEST_SCAN_LIMIT:
            return {
                "status": "limit_reached",
                "message": "Guest scan limit reached. Please sign in to continue scanning.",
            }



    # --- 2. IMAGE ---
    
    image_bytes = file.file.read(MAX_UPLOAD_BYTES + 1)
    if len(image_bytes) > MAX_UPLOAD_BYTES:
        return {"status": "error", "message": "Image is too large. Please upload a file under 10 MB."}

    detected_format = "JPEG"  # Default safe fallback
    try:
        pil_image = Image.open(io.BytesIO(image_bytes))
        pil_image.load()
        if pil_image.format:
            detected_format = pil_image.format.upper()
    except Exception:
        return {"status": "error", "message": "Invalid image file uploaded."}
    # EXIF orientation fix + force RGB
    try:
        pil_image = ImageOps.exif_transpose(pil_image)
    except Exception:
        pass
    if pil_image.mode != "RGB":
        pil_image = pil_image.convert("RGB")

    tensor_img = val_transform(pil_image).unsqueeze(0).to(device)

    # --- 3. STAGE 1: is it a dog? (not saved, so it doesn't use up a scan) ---
    with torch.inference_mode():
        probs = torch.nn.functional.softmax(gatekeeper_model(tensor_img)[0], dim=0)
    dog_prob_mass = torch.sum(probs[151:269]).item()
    top_class = torch.argmax(probs).item()

    if not ((dog_prob_mass >= 0.15) or (151 <= top_class <= 274)):
        return {
            "status": "not_dog",
            "message": "❌ Image does not appear to contain a dog. Please try another photo.",
        }

    # --- 4. STAGE 2: breed classification ---
    with torch.inference_mode():
        probabilities = torch.nn.functional.softmax(model(tensor_img)[0], dim=0)

    top_probs, top_idxs = torch.topk(probabilities, k=3)
    top3 = [
        {"breed": class_names[i.item()], "confidence": float(p.item())}
        for p, i in zip(top_probs, top_idxs)
    ]
    top_breed = top3[0]["breed"]
    confidence = top3[0]["confidence"]

    # --- 5. SAVE (ok and uncertain both count as a scan) ---
   # --- 5. SAVE ---
    save_scan(user_id, guest_device_id, scan_source, top3, image_bytes, detected_format)

    # --- 6. STAGE 3: confidence cutoff ---
    if confidence < CONFIDENCE_THRESHOLD:
        return {
            "status": "uncertain",
            "message": f"⚠️ Dog detected, but breed identification is uncertain ({confidence:.1%}).",
            "breed": top_breed,
            "confidence": confidence,
            "top3": top3,
            "info": format_info(top_breed),
        }

    return {
        "status": "ok",
        "breed": top_breed,
        "confidence": confidence,
        "info": format_info(top_breed),
        "top3": top3,
    }

@app.get("/api/guest-history")
def get_guest_history(guest_device_id: str = Header(..., alias="X-Guest-Device-ID")):
    guest_device_id = guest_device_id.strip()
    if not guest_device_id.startswith("guest_"):
        raise HTTPException(status_code=400, detail="Invalid guest identifier format")

    try:
        response = (
            supabase.table("scan")
            .select("""
                scan_id,
                image_path,
                scanned_at,
                scan_result (
                    confidence_score,
                    rank,
                    breed:breed_id ( breed_name )
                )
            """)
            .eq("guest_device_id", guest_device_id)
            .order("scanned_at", desc=True)
            .execute()
        )
        return {"data": response.data}
    except Exception as err:
        print(f"Failed to fetch guest history: {err}")
        raise HTTPException(status_code=500, detail="Internal server error")


# --- SERVE FRONTEND STATIC FILES & PAGES ---
# Same origin as the API, so no CORS is needed.
if os.path.exists(FRONTEND_DIR):
    for folder in ("css", "js", "assets"):
        folder_path = os.path.join(FRONTEND_DIR, folder)
        if os.path.exists(folder_path):
            app.mount(f"/{folder}", StaticFiles(directory=folder_path), name=folder)

    @app.get("/")
    def serve_index():
        return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))

    # Serves /identifyfur.html, /about.html, /login.html, etc.
    @app.get("/{page_name}.html")
    def serve_page(page_name: str):
        if not re.fullmatch(r"[A-Za-z0-9_-]+", page_name):
            raise HTTPException(status_code=404, detail="Page not found")
        file_path = os.path.join(FRONTEND_DIR, f"{page_name}.html")
        if not os.path.isfile(file_path):
            raise HTTPException(status_code=404, detail="Page not found")
        return FileResponse(file_path)