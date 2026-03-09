# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PageWise™ Forensic is a legal-grade forensic analysis system that processes medical and legal documents to detect contradictions, identify treatment gaps, evaluate compliance, and generate comprehensive timelines and summaries. It combines a Next.js frontend with a FastAPI backend powered by DocETL for LLM-based document analysis.

**Focus**: Medical-legal discovery with pipelines ranging from basic timeline construction to deposition summarization and expert witness packages.

## Architecture

### Frontend (Next.js 16 + React 19)
- **Tech Stack**: Next.js App Router, TypeScript, Tailwind CSS 4
- **Entry Point**: `src/app/page.tsx` - Customer-facing upload interface with pipeline selector
- **Admin Dashboard**: `src/app/admin/page.tsx` - Case management dashboard with filters
- **Case Review**: `src/app/admin/review/[caseId]/page.tsx` - Individual case review with editing
- **Shared Components**: `src/components/Header.tsx` - Shared header
- **Utilities**: `src/lib/pipelines.ts` - `getPipelineName()` maps pipeline IDs to human-readable names

### Backend (Python FastAPI)
- **Entry Point**: `backend/main.py` - FastAPI server on port 8001
- **Core Engine**: `backend/engine.py` - DocETL pipeline orchestration with LiteLLM cost tracking
- **Pipeline System**: `backend/pipeline_configs.py` - Multi-tier analysis pipelines
- **Case Management**: `backend/case_manager.py` - Persistence in `backend/cases/*.json`
- **PDF Export**: `backend/pdf_generator.py` - Report generation with track changes

### Utilities
- **`pdf_to_json.py`** (project root) - Converts PDF files to JSON for ingestion. Uses `docling.document_converter.DocumentConverter`. Outputs one record per page with fields: `record_id: "page-NNN"`, `doc_id`, `page_num`, `content`.

**Key Architecture Pattern**: Pipeline-based configuration system allows scaling analysis depth. Each pipeline defines:
- Extraction prompts (map operation over individual records)
- Analysis prompts (reduce operation for forensic/legal audit)
- Output schemas (structured JSON responses per record)
- Analysis schemas (defines output fields like timeline, contradictions, etc.)

**Available Pipelines** (MVP-exposed pipelines listed first):
1. `medical_chronology` - Medical Chronology (MVP) — Python-assembled chronology with LLM contradiction/flag detection
2. `psych_timeline` - Basic Psych Timeline (MVP) — timeline and treatment gaps
3. `deposition_summary` - Deposition Summary (MVP) — topic-based summarization using gather + `gpt-4o`
4. `psych_expert_witness` - Expert Witness Package — 7 analysis fields including contradictions, standard of care, competency

MVP pipelines are the ones exposed via the `/pipelines` endpoint. To change which pipelines are visible, update `list_pipelines()` in `backend/main.py`.

### Data Flow
1. User selects pipeline tier and uploads JSON records → Frontend (`src/app/page.tsx`)
2. Frontend POSTs to `/process` with `pipeline` parameter → `backend/main.py`
3. Backend creates case → `case_manager.py`
4. DocETL pipeline runs → `engine.py` + `pipeline_configs.py`
5. Analysis results stored → `backend/cases/{case_id}.json`
   - Original AI analysis saved in `analysis` field
   - Deep copy created in `edits` field (allows modification without affecting original)
   - Original source records stored in `original_records` field (for provenance)
   - Cost breakdown stored in `cost_breakdown` field (LiteLLM token tracking)
6. Admin reviews case → `src/app/admin/review/[caseId]/page.tsx`
   - Edit findings inline
   - Add expert comments to document reasoning
   - View source records for provenance
   - See AI vs Expert comparison (side-by-side mode)
   - Chat with case analysis via `/chat` endpoint
7. Export to PDF with track changes → `pdf_generator.py`
   - Shows which findings were AI-generated, edited, or added by expert
   - Includes expert comments inline

## Development Commands

### Frontend (Next.js)
```bash
# Install dependencies
npm install

# Development server (http://localhost:3001)
npm run dev

# Production build
npm run build

# Start production server
npm start

# Lint
npm run lint
```

### Backend (Python FastAPI)
```bash
# Activate virtual environment
source backend/venv/bin/activate

# Install dependencies
pip install -r backend/requirements.txt

# Run backend server (http://localhost:8001)
python backend/main.py
# or with uvicorn directly from project root:
uvicorn backend.main:app --host 0.0.0.0 --port 8001 --reload

# Deactivate virtual environment
deactivate
```

### Running Both Services
The application requires both servers running simultaneously:
- Frontend: `npm run dev` (port 3001)
- Backend: `source backend/venv/bin/activate && python backend/main.py` (port 8001)

### PDF to JSON Conversion
```bash
source backend/venv/bin/activate
python pdf_to_json.py path/to/document.pdf
# Outputs: document.json with one record per page
```

## Key Configuration Files

- `package.json` - Node dependencies and scripts
- `tsconfig.json` - TypeScript config with `@/*` path alias to `./src/*`
- `next.config.ts` - Next.js configuration
- `backend/venv/` - Python 3.13 virtual environment (do not modify)
- `backend/.env` - Environment variables (OpenAI + Anthropic API keys)

## Environment Variables

Create `backend/.env` with:
```
OPENAI_API_KEY=...       # Used by DocETL for extraction and analysis (gpt-4o-mini / gpt-4o)
ANTHROPIC_API_KEY=...    # Used by /chat endpoint (Claude Sonnet)
ANTHROPIC_MODEL=claude-sonnet-4-5-20250929   # Model for chat
```

## LLM Models

| Use Case | Model |
|---|---|
| Extraction (most pipelines) | `gpt-4o-mini` |
| Analysis (most pipelines) | `gpt-4o-mini` |
| Deposition extraction | `gpt-4o` |
| Chat endpoint | `claude-sonnet-4-5-20250929` |

Cost tracking uses LiteLLM callbacks in `engine.py`. Token usage and estimated costs are stored in `cost_breakdown` on each case.

## API Endpoints

### Public Endpoints
- `GET /` - Health check
- `GET /pipelines` - List available (MVP) analysis pipelines
- `POST /process` - Upload and analyze documents (accepts `pipeline` parameter)
- `POST /export-pdf` - Export analysis to PDF

### Admin Endpoints
- `GET /admin/cases` - List all cases
- `GET /admin/case/{case_id}` - Get case details (includes analysis, edits, comments, original_records, cost_breakdown)
- `POST /admin/update-edits` - Save edited analysis and expert comments
  - Accepts: `{ case_id, edits, comments }`
- `POST /admin/update-status` - Update case status (`processing` → `pending_review` → `approved` → `delivered`)
- `GET /admin/export-pdf/{case_id}` - Export case to PDF with track changes

### Chat Endpoint
- `POST /chat` - Chat with case analysis using Claude Sonnet as a grounded assistant
  - Accepts: `{ case_id, message, history? }`
  - Grounded to the case's analysis and source records; designed to prevent hallucinations

## Human-in-the-Loop Features

### Expert Review Interface (`src/app/admin/review/[caseId]/page.tsx`)

**View Modes:**
- **AI Original** - Read-only view of pristine AI-generated analysis
- **Expert Version** - Editable view for expert modifications (default)
- **Side-by-Side** - Two-column comparison showing AI vs Expert changes
  - Visual indicators: Green (added), Blue (edited), Unchanged (white)

**Edit Metrics Dashboard:**
- Automatically calculates and displays:
  - Total AI-generated findings
  - Findings validated unchanged (%)
  - Findings edited by expert (%)
  - Findings removed by expert (%)
  - Findings added by expert
  - Expert Enhancement Rate (% modified)

**Expert Comments & Annotations:**
- Click 💬 button next to any finding to add expert rationale
- Comments stored separately in `comments` field: `{ [section]: { [index]: "comment text" } }`
- Comments display inline below findings
- Saved with case data for legal defensibility

**Source Record Provenance:**
- "View All Source Records" button shows original JSON documents
- Modal displays all source data with dynamic rendering (works with any JSON structure)
- Enables experts to verify AI findings against source material

**Data Structure in Case JSON:**
```json
{
  "id": "20260224_155416",
  "customer_name": "...",
  "pipeline": "medical_chronology",
  "status": "pending_review",
  "analysis": { /* Original AI output */ },
  "edits": { /* Expert-modified version */ },
  "comments": {
    "timeline": {
      "0": "Changed severity based on PHQ-9 score of 22",
      "3": "Added per expert clinical judgment"
    }
  },
  "original_records": [ /* Full source documents for provenance */ ],
  "cost_breakdown": { /* LiteLLM token usage and costs */ }
}
```

### PDF Export with Track Changes (`backend/pdf_generator.py`)

**Visual Indicators in Exported PDF:**
- ✓ = AI-Generated, validated by expert (black text)
- ✏ = Edited by expert (blue text)
- ✚ = Added by expert (green text)
- 💬 = Expert comment/rationale (purple italic)

**Implementation:**
- Compares `analysis` (original) vs `edits` (modified) to detect changes
- Renders appropriate icon and style based on change status
- Includes expert comments inline under relevant findings

## Adding New Analysis Pipelines

To add a new pipeline (e.g., `depo_medical_hybrid`):

1. Add configuration to `PIPELINE_CONFIGS` in `backend/pipeline_configs.py`:
```python
"depo_medical_hybrid": {
    "name": "Deposition + Medical",
    "dataset_description": "deposition transcripts and medical records",
    "persona": "a medical-legal analyst",
    "extraction_prompt": """Extract from this record:

    Record: {{ input }}

    Return JSON with:
    - date: Record date (YYYY-MM-DD)
    - source_type: (deposition, medical_record)
    - key_facts: List of key facts
    """,
    "analysis_prompt": """Summarize findings:

    {% for record in inputs %}
    {{ record.date }}: {{ record.key_facts }}
    {% endfor %}

    Return JSON with:
    - summary: Overall summary
    - contradictions: Conflicts between records
    """,
    "output_schema": {
        "date": "string",
        "source_type": "string",
        "key_facts": "list[str]"
    },
    "analysis_schema": {
        "summary": "list[str]",
        "contradictions": "list[str]"
    }
}
```

2. To expose it in the frontend, add it to the `mvp_pipelines` list in `list_pipelines()` in `backend/main.py`
3. Update section mappings in `src/app/admin/review/[caseId]/page.tsx` if adding new analysis schema fields
4. Add the human-readable name to `src/lib/pipelines.ts`

## Important Notes

- **CORS Configuration**: Backend allows `localhost:3000` and `localhost:3001`
- **Case Storage**: Cases persist in `backend/cases/` directory (local to project)
- **Case ID format**: `YYYYMMdd_HHmmss` (timestamp-based)
- **LLM Models**: `gpt-4o-mini` for most extraction/analysis; `gpt-4o` for deposition; Claude Sonnet for chat
- **Python Version**: Uses Python 3.13 (check `backend/venv/pyvenv.cfg`)
- **Environment Variables**: `backend/.env` requires both `OPENAI_API_KEY` and `ANTHROPIC_API_KEY`
- **Dynamic UI**: Frontend automatically renders any analysis fields returned by pipelines
- **Docs**: `docs/` directory contains DocETL operator documentation and best practices

## Common Development Tasks

**Adding a new frontend page**: Create file in `src/app/{route}/page.tsx`

**Modifying analysis logic**: Edit prompts in `backend/pipeline_configs.py`

**Adding a new pipeline**: Add to `PIPELINE_CONFIGS` in `backend/pipeline_configs.py`, expose in `list_pipelines()` in `backend/main.py`, add name to `src/lib/pipelines.ts`

**Changing case persistence**: Modify `backend/case_manager.py`

**Updating UI styling**: Edit Tailwind classes in component files

**Adding new analysis fields**: Add to `analysis_schema` in pipeline config; frontend displays automatically

**Adding new comment types**: Extend the `comments` structure in case interface and `update_case_edits()` in `case_manager.py`

**Customizing PDF track changes**: Modify styles in `pdf_generator.py`
- Change icons: Edit `get_icon_and_style()` function
- Modify colors: Update ParagraphStyle definitions

**Testing backend endpoints**:
```bash
curl http://localhost:8001/
curl http://localhost:8001/pipelines
curl -X POST http://localhost:8001/process \
  -H "Content-Type: application/json" \
  -d '{"records": [...], "pipeline": "medical_chronology", "customer_name": "Test"}'

# Test chat
curl -X POST http://localhost:8001/chat \
  -H "Content-Type: application/json" \
  -d '{"case_id": "20260224_155416", "message": "What are the key contradictions?"}'

# Test admin update
curl -X POST http://localhost:8001/admin/update-edits \
  -H "Content-Type: application/json" \
  -d '{"case_id": "20260224_155416", "edits": {...}, "comments": {"timeline": {"0": "Expert note"}}}'
```

## Sample Data Format

Records should be JSON arrays. For medical records:
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

For deposition transcripts (via `pdf_to_json.py`):
```json
[
  {
    "record_id": "page-001",
    "doc_id": "deposition_smith_2024",
    "page_num": 1,
    "content": "Q: Can you state your name for the record? A: John Smith..."
  }
]
```
