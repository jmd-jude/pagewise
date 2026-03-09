# PageWise™ Forensic

A legal-grade document analysis system for medical-legal discovery. Processes medical records and deposition transcripts to detect contradictions, identify treatment gaps, evaluate compliance, and generate forensic timelines — with a human-in-the-loop expert review layer and PDF export with track changes.

**Stack**: Next.js 16 (frontend) + FastAPI (backend) + DocETL (LLM pipeline orchestration)

---

## Prerequisites

- Node.js 18+
- Python 3.13
- OpenAI API key
- Anthropic API key

---

## Setup

### 1. Clone the repo

```bash
git clone git@github.com:jmd-jude/pagewise.git
cd pagewise
```

### 2. Frontend

```bash
npm install
```

### 3. Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 4. Environment variables

Create `backend/.env`:

```
OPENAI_API_KEY=...
ANTHROPIC_API_KEY=...
ANTHROPIC_MODEL=claude-sonnet-4-6
```

---

## Running locally

Both services must run simultaneously.

**Frontend** (port 3001):
```bash
npm run dev
```

**Backend** (port 8001) — from project root:
```bash
source backend/venv/bin/activate
python backend/main.py
```

Open [http://localhost:3001](http://localhost:3001).

---

## Project structure

```
pagewise/
├── src/app/
│   ├── page.tsx              # Upload interface (customer-facing)
│   ├── admin/page.tsx        # Case management dashboard
│   └── admin/review/[caseId] # Case review + expert editing
├── backend/
│   ├── main.py               # FastAPI server
│   ├── engine.py             # DocETL pipeline orchestration
│   ├── pipeline_configs.py   # Analysis pipeline definitions
│   ├── case_manager.py       # Case persistence (JSON files)
│   └── pdf_generator.py      # PDF export with track changes
└── pdf_to_json.py            # Convert PDFs to ingestible JSON
```

---

## Input data format

Records are submitted as JSON arrays. For medical records:

```json
[
  {
    "date": "2024-01-15",
    "record_id": "MED-2024-001",
    "provider": "Dr. Jane Smith, MD",
    "record_type": "Initial Evaluation",
    "diagnoses": ["Major Depressive Disorder"],
    "medications": ["Sertraline 100mg daily"],
    "chief_complaint": "Patient reports worsening symptoms...",
    "treatment_plan": "Continue medications. Weekly therapy."
  }
]
```

To convert PDFs first:
```bash
source backend/venv/bin/activate
python pdf_to_json.py path/to/document.pdf
# Outputs document.json with one record per page
```

---

## Analysis pipelines

| Pipeline ID | Name | Description |
|---|---|---|
| `medical_chronology` | Medical Chronology | Python-assembled chronology with LLM contradiction detection |
| `psych_timeline` | Basic Psych Timeline | Timeline and treatment gap analysis |
| `deposition_summary` | Deposition Summary | Topic-based summarization |
| `psych_expert_witness` | Expert Witness Package | 7-field forensic analysis |

---

## Key API endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/` | Health check |
| GET | `/pipelines` | List available pipelines |
| POST | `/process` | Submit records for analysis |
| POST | `/export-pdf` | Export analysis to PDF |
| GET | `/admin/cases` | List all cases |
| GET | `/admin/case/{case_id}` | Get case details |
| POST | `/admin/update-edits` | Save expert edits and comments |
| POST | `/chat` | Chat with a case (Claude-powered) |

---

## LLM models used

| Use case | Model |
|---|---|
| Extraction (most pipelines) | `gpt-4o-mini` |
| Analysis (most pipelines) | `gpt-4o-mini` |
| Deposition extraction | `gpt-4o` |
| Chat endpoint | Claude Sonnet |

---

## For deeper development context

See [CLAUDE.md](CLAUDE.md) for architecture details, pipeline configuration, adding new pipelines, and common development tasks.
