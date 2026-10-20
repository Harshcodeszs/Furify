
# File structure
Furify/
├── .gitignore          # Keeps secrets and local caches out of GitHub
├── README.md           # Setup instructions
├── requirements.txt    # Python dependencies
├── backend/            
│   ├── .env            # ⚠️ Local secrets (DO NOT PUSH)
│   └── app/            
│       ├── main.py     # FastAPI entry point & proxy logic
│       ├── dog_model.pth # PyTorch model weights
│       ├── class_names.json & breed_info.json
│       └── seed_breeds.py
└── frontend/           # HTML, CSS, & Vanilla JS pages

# How to setup
1. Clone & Switch Branch
- git clone https://github.com/Harshcodeszs/Furify.git
- cd Furify
- git checkout testing-release

2. Set Up Python Virtual Environment
python -m venv .venv
# Activate:
### Windows (PowerShell): .venv\Scripts\Activate.ps1
### Mac/Linux: source .venv/bin/activate

3. Install Dependencies

- pip install -r requirements.txt

4. Configure the .env File
- Go into the backend/ folder.
- Create a file named .env.
- Paste your Supabase credentials (get the keys from your to harsh):
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
- Then make sure to ask for your gmail to be a test account 

5. Run the Application
cd backend
uvicorn app.main:app --reload

- copy the http://127.0.0.1:8000 to the terminal then paste it to the browser

