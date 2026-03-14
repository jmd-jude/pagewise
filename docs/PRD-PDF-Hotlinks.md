# PRD — PDF Hotlinks
*Internal document — not for client distribution*

---

## Problem

The deposition summary PDF export contains a table of topics with page citations (e.g., "Pages 5–7"). These citations are inert text. A reviewer must manually locate the cited pages in the original transcript — switching between documents, searching by page number. This is friction on every citation, and the summary can have dozens of them.

---

## Goal

Produce a single combined PDF in which the summary's page citations are clickable internal links that jump directly to the cited page in the appended source document.

---

## User Story

A paralegal or expert opens the exported PDF. They read a topic entry: *"Drum Pickups from Otis Air Force Base — Pages 47–52."* They click "47–52" and land immediately on page 47 of the original transcript, which is appended in the same file. They review, return to the summary, continue.

---

## Output Format

```
Combined PDF
├── Pages 1–N      → Summary (ReportLab-generated, existing pipeline output)
└── Pages N+1–N+M  → Original transcript (source PDF, appended verbatim)
```

Page citations in the summary section are internal PDF links. Clicking a citation navigates to the corresponding page in the appended source section.

**Offset math:** A citation to original page X links to combined page `X + N`, where `N` is the total page count of the summary section.

---

## Scope

- **In scope:** Deposition summary pipeline only (initial release)
- **In scope:** `page_range` field citations in the summary table — these are already structured data
- **Out of scope:** Medical chronology pipeline (record citations there are string-embedded; different problem)
- **Out of scope:** Hotlinks in the body text of individual summary entries (future)
- **Out of scope:** Reverse links (source page → back to summary)

---

## Current State (Relevant Codebase Facts)

### What exists and works
- `pdf_generator.py` renders the summary table as a 3-column ReportLab table: Subject | Pages | Summary
- The `page_range` field (e.g., `"47-52"`) and `records` field (e.g., `["page-047", "page-052"]`) are structured data on every summary row — no text parsing needed
- The export endpoint `GET /admin/export-pdf/{case_id}` in `main.py:318` reads the case JSON and calls `generate_forensic_pdf()`

### The gap: source PDF is discarded
The current upload flow converts the PDF to JSON records on the frontend (via `pdf_to_json.py` + Docling) and sends only the JSON to the backend. The source PDF never reaches the server and is not stored. It must be made available at export time for this feature to work.

---

## Implementation Approach

### Step 1 — Store the source PDF at upload time

Modify the upload flow to send the source PDF to the backend alongside the extracted JSON records. Store it associated with the case.

**Backend:**
- Add a `POST /upload-pdf/{case_id}` endpoint that accepts a file upload and saves the PDF to `backend/cases/{case_id}_source.pdf`
- Or: modify `POST /process` to accept an optional file upload alongside the records JSON (multipart form)
- Store the source PDF path on the case record: `case["source_pdf_path"]`

**Frontend:**
- After `pdf_to_json.py` converts the file locally, also POST the original PDF file to the backend

**Note:** When the storage layer moves to S3 (per the Engineering Brief), the source PDF goes to S3 with the same retention policy as the case data.

### Step 2 — Count summary pages after ReportLab render

To compute the offset, the code needs to know how many pages the summary PDF is before appending the source. ReportLab's `SimpleDocTemplate` exposes page count after `doc.build()` via `doc.page`. Capture this value.

```python
doc.build(story)
summary_page_count = doc.page  # available after build
```

### Step 3 — Inject link annotations into the summary PDF

Before combining, add internal link annotations to the `page_range` cells in the summary table. ReportLab supports this via `platypus.flowables` anchor/link primitives or by post-processing the output PDF with `pypdf`.

**Recommended approach — post-process with pypdf:**
After ReportLab produces the summary PDF, use `pypdf` to:
1. Parse the page range text from each summary row (already available as structured data — no parsing needed, use the `records` list)
2. Find the bounding box of the page citation cell (requires knowing the table layout — see trade-off note below)
3. Add a `Link` annotation to that region pointing to destination page `X + summary_page_count`

**Alternative approach — ReportLab native links:**
Wrap the `page_range` cell content in a ReportLab `HyperlinkParagraph` or use `canvas.linkRect()` with an internal destination. This requires threading destination page numbers through `generate_forensic_pdf()` and computing them at render time — doable but requires the summary page count to be known before rendering (it isn't, since rendering determines page count). A two-pass render solves this but adds complexity.

**Recommendation:** Post-process with pypdf. It avoids the circular dependency and keeps the link injection as a separate, testable step.

### Step 4 — Append source PDF with pypdf

```python
from pypdf import PdfWriter, PdfReader

writer = PdfWriter()

# Add summary pages
summary_reader = PdfReader(summary_pdf_path)
for page in summary_reader.pages:
    writer.add_page(page)

# Add source pages
source_reader = PdfReader(source_pdf_path)
for page in source_reader.pages:
    writer.add_page(page)

with open(combined_output_path, "wb") as f:
    writer.write(f)
```

### Step 5 — Wire into export endpoint

Modify `GET /admin/export-pdf/{case_id}` in `main.py:318` to:
1. Check whether `case["source_pdf_path"]` exists
2. If yes: run the combined PDF flow (summary + hotlinks + append source)
3. If no: fall back to current behavior (summary PDF only, no hotlinks)

This keeps the export endpoint backward-compatible with cases processed before this feature ships.

---

## Data Flow (After This Feature)

```
Upload flow:
  PDF file → pdf_to_json.py (frontend) → JSON records → POST /process
  PDF file ──────────────────────────────────────────→ POST /upload-pdf/{case_id}

Export flow:
  GET /admin/export-pdf/{case_id}
    → load case JSON
    → generate_forensic_pdf() → summary.pdf  (ReportLab, N pages)
    → capture summary_page_count = N
    → inject link annotations into summary.pdf (pypdf)
    → append source PDF as pages N+1 to N+M (pypdf)
    → return combined.pdf
```

---

## Open Questions

1. **Frontend PDF conversion:** `pdf_to_json.py` currently runs locally (frontend). If the source PDF also needs to be uploaded to the backend, should conversion move server-side? This would simplify the flow (one upload, server handles both conversion and storage) but adds server load and changes the existing architecture. Defer decision — for now, keep conversion client-side and add a second upload for the source file.

2. **Link annotation bounding boxes:** To place a clickable region over the `page_range` cell, the code needs to know where that cell renders on the page. This is straightforward if the table has fixed column widths (which the current implementation does — Letter page minus margins, fixed column ratios). Document the column geometry and hardcode the link region calculation, or use pypdf's annotation API with approximate coordinates. Validate visually.

3. **Multi-page citations:** `page_range` can be a range like `"47-52"`. The link should target the first page of the range (page 47). The `records` list already gives the individual pages in order — use `records[0]` to extract the start page reliably rather than parsing the string.

4. **Page ID format:** Records are stored as `"page-047"` (zero-padded, 3 digits). Parse with `int("page-047".split("-")[1])` → `47`. Validate this assumption holds for all cases.

5. **Export UX:** Should the combined PDF be the new default, or a separate export option ("Export with source")? Recommendation: make it the default when a source PDF is available; the fallback handles cases without one.

---

## Acceptance Criteria

- [ ] Combined PDF is generated: summary pages first, source pages appended
- [ ] Every `page_range` cell in the summary table is a clickable link
- [ ] Clicking a citation navigates to the correct page in the appended source section
- [ ] Offset math is correct: citation to original page X lands on combined page X + N
- [ ] If no source PDF is stored for a case, export falls back to current behavior without error
- [ ] File is named clearly, e.g., `depo_summary_with_source_{customer}_{case_id}.pdf`

---

## Dependencies

- `pypdf` — for combining PDFs and injecting link annotations; add to `backend/requirements.txt` (likely already present given the Engineering Brief references it)
- No frontend changes required beyond the additional PDF upload POST

---

## Prioritization Note

Per the Engineering Brief, PDF hotlinks is item #2 on the build list after cloud deployment. This feature can be developed and tested locally against existing sample cases. The source PDF storage mechanism chosen here (local filesystem) will need to migrate to S3 as part of the cloud deployment work — design the storage abstraction with that in mind.
