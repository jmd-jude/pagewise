# Engineering Notes — PageWise™
*Internal document — not for client distribution*

---

## Context

This is a working prototype built to demonstrate a pipeline-based approach to legal and medical document analysis. It was developed rapidly (largely AI-assisted) and is functional but not production-ready. The goal of this document is to give an incoming engineer an honest picture of what exists, what needs to be built, and what the constraints are — so they can assess the lift and propose an appropriate infrastructure approach.

---

## What Exists Today

### Application Stack
- **Frontend**: Next.js 16 + React 19, TypeScript, Tailwind CSS 4, App Router
- **Backend**: Python FastAPI (port 8001), DocETL for pipeline orchestration, LiteLLM for LLM cost tracking
- **PDF Ingestion**: Docling (IBM Research open-source library) — converts PDFs to per-page JSON records; integrated and tested against the deposition summary pipeline only; not yet validated against medical record PDFs
- **Storage**: Local filesystem (`backend/cases/*.json`) — no database
- **LLM Providers**: OpenAI (`gpt-4o-mini`, `gpt-4o`) for extraction and analysis; Anthropic Claude Sonnet for chat endpoint

### What Works
- **Medical chronology pipeline** — map/reduce over medical records; extracts diagnoses, medications, providers, treatment decisions; assembles timeline with contradiction detection and gap identification; output reviewable and editable in the admin UI; *(scalability consideration: real-world medical record sets are often hundreds of pages of heterogeneous content — progress notes, labs, imaging, prescriptions, referrals — collated into a single PDF; the map phase handles this well page by page, but the reduce step receives a structurally varied and potentially very large set of extracted records; hierarchical reduce may be needed at scale)*
- **Deposition summary pipeline** — page-by-page extraction with sliding context window; topic-based summarization using gather operator and `gpt-4o`; structured JSON output  *(scalability consideration: for very long transcripts, 300+ pages, the reduce/synthesis step receives a large number of topic entries — a hierarchical reduce strategy may be needed at scale)*
- **Admin review interface** — practitioners can edit AI-generated findings, add comments/annotations, view AI vs. expert version side-by-side; change tracking between AI original and expert-modified version
- **PDF export** — generates track-changes PDF showing AI-generated vs. edited vs. expert-added findings with visual indicators; does not yet support hotlinks to source pages in original document
- **Case chat** — Claude Sonnet grounded to case data for Q&A without hallucination
- **Cost tracking** — LiteLLM callbacks capture token usage and estimated cost per case

### What Is Not Yet Built
- **Document indexing pipeline** — extracts structured metadata (date, doc type, parties, subject, key terms) per document; assembles sortable, searchable index; incremental updates as new files are added
- **PDF hotlinks** — clickable citations in output PDF linking to specific pages in the original source PDF (plan: combine source + output into single PDF using `pypdf`; add internal link annotations in `reportlab` with page offset math)
- **Cloud deployment** — currently runs on localhost; no hosting, no auth, no multi-tenancy
- **HIPAA-compliant infrastructure** — see section below

---

## Compliance Requirements

This application will process medical records and legal documents containing PHI (Protected Health Information). HIPAA compliance is a requirement before any real client data flows through the system.

### The OpenAI Problem
The current stack calls OpenAI's API directly. **OpenAI does not offer Business Associate Agreements (BAAs) on the standard API.** This means the current configuration cannot legally process PHI. This is the most important blocker.

### The Path Forward
AWS Bedrock hosts Anthropic Claude and other models, and is covered under AWS's BAA. The application already uses LiteLLM for all LLM calls, which supports Bedrock as a backend — meaning the provider swap is largely a configuration change, not a rewrite. The engineer should validate this and assess any model capability tradeoffs.

To activate Bedrock: (1) sign the AWS BAA in the console under Account Settings > Agreements — this is a click-through, not a negotiated contract; (2) request access to Claude and any other required model families via the Bedrock console; (3) update LiteLLM config to route calls through Bedrock with AWS IAM credentials instead of OpenAI API keys.

### What the BAA Covers — and What It Doesn't
Signing the AWS BAA means AWS is contractually bound to handle PHI per HIPAA rules. It covers the infrastructure and LLM processing environment. It does **not** make the application itself HIPAA-compliant — that is PageWise's responsibility as the Business Associate.

PageWise is a BA (not a Covered Entity). The practical compliance obligations for a BA with a narrow, document-in/document-out use case are manageable:

**Engineering-owned (one-time setup):**
- Encryption at rest (S3 with encryption enabled) and in transit (HTTPS)
- Audit logging — who accessed which case, when; AWS CloudTrail covers infrastructure; application-level logging needed for user actions
- Access controls — basic authenticated login for the admin interface
- Short PHI retention — automated deletion of source files after delivery

**Policy/documentation (non-engineering, one-time):**
- Written Security Risk Assessment — identifies risks in the system and mitigations; templates exist; a few hours of work
- Data handling and breach response policies — again, templates exist for small companies
- Workforce training acknowledgment — even for a small team, document that anyone touching PHI has been briefed
- BAA template for clients — PageWise must also sign a BAA with each customer before they submit real PHI

**Ongoing:**
- Annual review of the Security Risk Assessment
- Breach notification procedure — 60-day window to notify affected parties if PHI is ever exposed; need a written plan

SOC 2 is a longer-term goal; not required for initial deployment.

### Other Compliance Considerations
- Minimal PHI retention — process and deliver, don't store long-term; the planned architecture supports this naturally
- No long-term audit trail of PHI content is required — just access logs

---

## Infrastructure Requirements (Constraints, Not Prescription)

The engineer should propose the specific stack, but the requirements are:

- **HIPAA-eligible hosting** — AWS (preferred given Bedrock dependency), Azure, or GCP all have HIPAA BAA programs
- **No long-term PHI storage** — files in, processed, output delivered, source deleted on a short retention schedule
- **Simple access model** — initial use case is: paralegal uploads files, receives output, downloads and moves on; not a multi-user SaaS at this stage
- **LLM calls through a BAA-covered provider** — Bedrock is the most straightforward path given existing LiteLLM integration
- **Replace local file storage** — cases currently stored as JSON files on disk; needs to move to something cloud-native (S3, or a managed DB) with appropriate encryption

---

## Prioritized Build List

1. **Cloud deployment** — containerize the app, deploy to HIPAA-eligible infrastructure, swap OpenAI → Bedrock
2. **PDF hotlinks** — clickable page citations linking to source document pages in combined PDF output
3. **Document indexing pipeline** — new pipeline using existing map/reduce architecture; incremental update support
4. **Auth / access control** — basic login for admin interface; scoped access per client if needed

---

## Out of Scope (for Now)

- Redaction workflows — a different problem category (pattern matching, PII detection); not part of initial build
- SOC 2 certification — follow-on once the product has demonstrated value
- Multi-tenant SaaS features — premature; build for one client first

---

## Notes for the Engineer

- The pipeline architecture is DocETL-based — worth reading the DocETL docs in `docs/` before diving in
- LiteLLM is already wired in for provider abstraction; Bedrock swap should be low-friction
- The frontend renders analysis fields dynamically — new pipeline outputs surface in the UI without frontend changes
- `pdf_to_json.py` handles PDF → JSON conversion using Docling; tested against deposition transcripts only — medical record PDFs (scanned documents, varied formats) have not been validated and should be treated as an open question; the per-page JSON structure may need adjustment to match what the medical chronology pipeline expects
- Python 3.13, virtual environment at `backend/venv/`
- No test suite currently exists
