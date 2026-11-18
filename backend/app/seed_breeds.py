import json
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client

APP_DIR = Path(__file__).resolve().parent
load_dotenv(APP_DIR.parent / ".env")  # backend/.env  (never commit this file)

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
    sys.exit("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in backend/.env")

supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)


def seed_breed_catalog():
    # class_names.json is the source of truth: its order IS the model's output order
    with open(APP_DIR / "class_names.json", "r", encoding="utf-8") as f:
        class_names = json.load(f)

    breed_info = {}
    info_path = APP_DIR / "breed_info.json"
    if info_path.exists():
        with open(info_path, "r", encoding="utf-8") as f:
            breed_info = json.load(f)

    rows = []
    missing_info = []
    for index, name in enumerate(class_names):
        info = breed_info.get(name)
        if info is None:
            missing_info.append(name)

        if isinstance(info, dict):
            description = info.get("description")
            
        else:
            description = str(info) if info else None
          

        rows.append({
            "class_index": index,
            "breed_name": name,
            "description": description,
            
        })

    print(f"Seeding {len(rows)} breeds...")
    supabase.table("breed").upsert(rows, on_conflict="class_index").execute()

    total = supabase.table("breed").select("breed_id", count="exact").execute().count
    print(f"Done. breed table now has {total} rows (expected {len(class_names)}).")

    if missing_info:
        print(f"\n{len(missing_info)} breeds have no entry in breed_info.json "
              f"(names must match class_names.json exactly):")
        for name in missing_info:
            print(f"  - {name}")


if __name__ == "__main__":
    seed_breed_catalog()