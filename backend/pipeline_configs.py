"""
Pipeline Configuration System for ChronoScope
Enables multi-pipeline document analysis with minimal code changes

STANDARD EVENT SCHEMA (All pipelines must extract these fields):
--------------------------------------------------------------------
Every pipeline's extraction_prompt MUST output these standardized fields:
- date: Record date (YYYY-MM-DD format) [REQUIRED]
- record_id: Unique identifier for deduplication [REQUIRED]
- event_type: Category of event (visit, evaluation, treatment, etc.) [REQUIRED]
- event_description: One or two sentence summary of what happened [REQUIRED - THE KEY FIELD]
- provider: Provider/facility name [OPTIONAL]

Additional fields (pipeline-specific, not used by chronology assembly):
- confidence: Confidence level (medical_chronology only)
- diagnosis: Diagnosis mentioned (medical_chronology only)
- [Future pipelines can add custom fields as needed]

This standard ensures engine.py can build chronologies without pipeline-specific logic.
"""

PIPELINE_CONFIGS = {
    "psych_timeline": {
        "name": "Basic Timeline",
        "dataset_description": "medical and psychiatric records",
        "persona": "a forensic psychiatrist reviewing records for timeline construction",
        "extraction_model": "gpt-4o-mini",
        "analysis_model": "gpt-4o-mini",
        "requires_llm_analysis": False,  # Python builds timeline/gaps deterministically
        "num_retries_on_validate_failure": 2,  # Retry twice on validation failure
        "extraction_validation": [
            'output["date"] != ""',       # Enforce date presence (critical for chronology)
            'output["record_id"] != ""'   # Enforce record_id for deduplication
        ],
        "extraction_prompt": """Extract from this record:

Record: {{ input }}

Return JSON with:
- date: Record date (YYYY-MM-DD)
- record_id: Record ID if mentioned (or use date as fallback)
- event_type: (evaluation, treatment, incident, hospitalization, medication_change, other)
- event_description: One to two sentence description of what happened
- provider: Provider name if mentioned
""",
        "analysis_prompt": """Create chronological timeline of psychiatric events:

{% for record in inputs %}
{{ record.date }}: [{{ record.event_type }}] {{ record.event_description }}
{% endfor %}

Return JSON with:
- timeline: List of chronological events (include date at start of each)
- treatment_gaps: Periods >30 days without documented care
""",
        "output_schema": {
            "date": "string",
            "record_id": "string",
            "event_type": "string",
            "event_description": "string",
            "provider": "string"
        },
        "analysis_schema": {
            "timeline": "list[str]",
            "treatment_gaps": "list[str]"
        }
    },

    "psych_expert_witness": {
        "name": "Expert Witness Package",
        "dataset_description": "medical and psychiatric records for legal proceedings",
        "persona": "a forensic psychiatrist preparing expert witness testimony",
        "extraction_model": "gpt-4o-mini",
        "analysis_model": "gpt-4o-mini",
        "extraction_prompt": """Extract from this record:

Record: {{ input }}

Return JSON with:
- date: Record date
- record_id: Record ID
- provider: Provider name
- diagnoses: Psychiatric diagnoses
- medications: Medications and doses
- competency_assessments: Any competency evaluations
- treatment_recommendations: Recommendations made
- patient_statements: Relevant patient statements or behaviors
- standard_of_care_issues: Potential deviations from standard care
""",
        "analysis_prompt": """Prepare expert witness analysis:

{% for record in inputs %}
{{ record.date }} - {{ record.record_id }}:
Provider: {{ record.provider }}
Diagnoses: {{ record.diagnoses }}
Meds: {{ record.medications }}
Competency: {{ record.competency_assessments }}
Recommendations: {{ record.treatment_recommendations }}
Patient Statements: {{ record.patient_statements }}
Standard of Care: {{ record.standard_of_care_issues }}
---
{% endfor %}

Return JSON with:
- timeline: Chronological psychiatric timeline with dates
- treatment_gaps: Missing care with record ID citations
- medication_adherence: Medication compliance with citations
- contradictions: Conflicting information across records with citations
- standard_of_care_deviations: Care that deviates from accepted standards with citations
- competency_timeline: Changes in patient competency over time
- expert_opinions_needed: Areas requiring expert psychiatric interpretation
""",
        "output_schema": {
            "date": "string",
            "record_id": "string",
            "provider": "string",
            "diagnoses": "list[str]",
            "medications": "list[str]",
            "competency_assessments": "string",
            "treatment_recommendations": "string",
            "patient_statements": "string",
            "standard_of_care_issues": "string"
        },
        "analysis_schema": {
            "timeline": "list[str]",
            "treatment_gaps": "list[str]",
            "medication_adherence": "list[str]",
            "contradictions": "list[str]",
            "standard_of_care_deviations": "list[str]",
            "competency_timeline": "list[str]",
            "expert_opinions_needed": "list[str]"
        }
    },

    "medical_chronology": {
        "name": "Medical Chronology",
        "dataset_description": "medical records from various healthcare providers",
        "persona": "a medical chronologist extracting structured data from records",
        "extraction_model": "gpt-4o-mini",  # Model for extraction phase
        "analysis_model": "gpt-4o-mini",  # Model for analysis phase (contradictions, red flags, expert opinions)
        "requires_llm_analysis": True,  # Needs LLM for contradictions, red flags, expert opinions
        "num_retries_on_validate_failure": 2,  # Retry twice on validation failure
        "extraction_validation": [
            'output["date"] != ""',  # Enforce date presence (critical for chronology)
            'output["record_id"] != ""'  # Enforce record_id for de-duplication
        ],
        "extraction_prompt": """Extract from this medical record:

Record: {{ input }}

Return JSON with:
- date: Record date (YYYY-MM-DD format)
- record_id: Record ID or identifier if mentioned (or use date as fallback)
- provider: Physician or facility name
- event_type: (visit, procedure, test, medication, hospitalization, discharge)
- event_description: One to two sentence summary of the event
- diagnosis: Diagnosis mentioned (if any)
- confidence: Confidence level (high, medium, or low)
""",
        "output_schema": {
            "date": "string",
            "record_id": "string",
            "provider": "string",
            "event_type": "string",
            "event_description": "string",
            "diagnosis": "string",
            "confidence": "string"
        },
        "analysis_prompt": """Perform forensic medical analysis on these records:

{% for record in inputs %}
{{ record.date }} - {{ record.record_id }}:
Provider: {{ record.provider }}
Event: [{{ record.event_type }}] {{ record.event_description }}
Diagnosis: {{ record.diagnosis }}
Confidence: {{ record.confidence }}
---
{% endfor %}

Return JSON with:
- contradictions: List of contradiction objects, each with:
  * description (string): Clear description of the contradiction found across records
  * records (list of strings): Record IDs involved (e.g., ["MRN-2024-001", "MRN-2024-002"])
  * category (string): diagnosis|treatment|timeline|documentation|medication|other
  * severity (string): critical|moderate|minor
  * legal_relevance (string): high|medium|low

- red_flags: List of red flag objects, each with:
  * category (string): Documentation Gaps|Standard of Care|Inconsistent Treatment|Missing Records|other
  * issue (string): Specific description of the issue or gap identified
  * records (list of strings): Record IDs involved
  * legal_relevance (string): high|medium|low

- expert_opinions_needed: List of expert opinion objects, each with:
  * topic (string): Brief topic heading describing area requiring expert review
  * reason (string): Why expert medical opinion is needed for this topic
  * records (list of strings): Relevant record IDs

Note: Focus on medical-legal issues relevant to litigation, malpractice review, or expert witness testimony.
""",
        "analysis_schema": {
            "contradictions": "list[dict]",
            "red_flags": "list[dict]",
            "expert_opinions_needed": "list[dict]"
        }
        # Note: chronology and missing_records are assembled in Python (engine.py)
        # This avoids LLM hallucinations and ensures perfect chronological accuracy
    },

    "deposition_summary": {
        "name": "Deposition Summary",
        "pipeline_type": "deposition",
        "use_gather": True,
        "gather_config": {
            "content_key": "content",
            "doc_id_key": "doc_id",
            "order_key": "page_num",
            "peripheral_chunks": {
                "previous": {"head": {"count": 3}},
                "next": {"head": {"count": 3}}
            }
        },
        "dataset_description": "deposition transcript pages from a legal proceeding",
        "persona": "a legal analyst creating a comprehensive deposition summary table for attorney review",
        "extraction_model": "gpt-4o",
        "requires_llm_analysis": False,
        "num_retries_on_validate_failure": 2,
        "extraction_validation": [
            # Allow empty fields when is_continuation=true; require both when it is a new topic
            'output["is_continuation"] == True or (output["subject"] != "" and output["page_range"] != "")',
        ],
        "extraction_prompt": """You are analyzing a page of deposition testimony to decide ONE thing: does this page BEGIN a new topic, or is it a continuation of the topic already underway?

PAGE NUMBER: {{ input.page_num }}

TRANSCRIPT CONTENT:
{{ input.content_rendered }}

"--- Begin Main Chunk ---" to "--- End Main Chunk ---" is the primary page you are evaluating.
The surrounding context shows adjacent pages.

════════════════════════════════════
WHAT IS A "TOPIC" IN DEPOSITION TESTIMONY?
════════════════════════════════════

A topic is a SPECIFIC NAMED SUBJECT — a particular person, relationship, document, location, event, or legal issue that counsel is asking about.

Topics typically span 2-5 pages. Examples:

- Witness's relationship with a specific person (e.g., his sibling, his attorney)
- A specific document or legal instrument (e.g., the sixth version of the trust, the 2019 amendment)
- A specific event or transaction (e.g., drum pickups from Otis Air Force Base, the burn pit at NECC)
- A specific legal issue (e.g., disinheriting a family member, a prior lawsuit)
- A specific time period or decision (e.g., when witness changed his will, what happened after the accident)
- Counsel reading numbered paragraphs from a prior statement to the witness
  (e.g., "Paragraph 7 says you dumped sludge weekly — does that sound right?") —
  each paragraph covers a distinct factual subject and is its own topic, even
  though all come from the same exhibit
- A new exhibit being introduced for the first time, OR a new numbered paragraph
  from a prior exhibit being read aloud to the witness, always begins a new topic

A NEW TOPIC begins when the specific named subject shifts — even if the broad area of questioning (e.g., "family relationships") stays the same. Asking about Geoffrey is a different topic than asking about Morton. Asking about the 2019 trust amendment is a different topic than asking about the 2021 amendment.

════════════════════════════════════
YOUR DECISION RULE
════════════════════════════════════

Look at the PREVIOUS CONTEXT. Ask: "Is examining counsel still asking about the SAME specific named subject as the prior page?"

If YES (drilling down on the same specific person, document, event, or issue) → is_continuation=true, all other fields empty string ""

If NO (counsel has shifted to a different specific named person, document, event, location, or legal issue) → is_continuation=false, produce a full summary row

DEFAULT: When in doubt whether the specific subject has shifted, err toward is_continuation=false and start a new row. Expect roughly 1 in 3 pages to start a new topic.

If there is no previous context (first page of substantive testimony) → is_continuation=false, produce a row.

════════════════════════════════════
WHEN PRODUCING A ROW (is_continuation=false):
════════════════════════════════════

subject: Specific noun phrase, 3-7 words. Name the actual subject matter.
  Good: "Drum Pickups from Otis Air Force Base", "Disinheriting Geoffrey", "Witness's CDL License", "Burn Pit Operations at NECC", "Sixth Version of the Trust"
  Bad: "Witness Testimony", "Further Examination", "Background Information"

page_range: This page number through where the topic ends based on next-page context.
  Format: "50" (single page) or "50-54" (topic continues into next pages).

summary: 150-300 word third-person narrative. Name the witness. Include specific facts, names, locations, dates, and documents referenced. Attribute statements to the witness directly. Preserve witness hedging exactly as spoken: "I don't recall," "probably," "I believe," "approximately." Never convert uncertain testimony into definitive statements.

records: List of record IDs for every page covered by this topic, in "page-NNN" format (zero-padded to 3 digits).
  Derive directly from your page_range. Example: page_range "55-57" → ["page-055", "page-056", "page-057"]. Example: page_range "69" → ["page-069"]

Do not use meta-commentary or framing phrases ("This page covers", "The witness was asked about", "This section discusses"). Begin every summary with a direct factual statement.

Return JSON with exactly these five fields: subject, page_range, summary, is_continuation, records
""",
        "output_schema": {
            "subject": "string",
            "page_range": "string",
            "summary": "string",
            "is_continuation": "boolean",
            "records": "list[str]"
        },
        "analysis_schema": {
            "summary_table": "list[dict]"
        }
    }
}


def get_pipeline_config(pipeline: str):
    """
    Get configuration for a specific pipeline

    Args:
        pipeline: One of "psych_timeline", "psych_expert_witness", "medical_chronology"

    Returns:
        Pipeline configuration dict

    Raises:
        ValueError: If pipeline is not recognized
    """
    if pipeline not in PIPELINE_CONFIGS:
        available = ", ".join(PIPELINE_CONFIGS.keys())
        raise ValueError(f"Unknown pipeline '{pipeline}'. Available pipelines: {available}")

    return PIPELINE_CONFIGS[pipeline]


def list_pipelines():
    """
    Get list of all available pipelines

    Returns:
        List of pipeline names and their human-readable titles
    """
    # MVP: Only expose medical_chronology and psych_timeline
    # Other pipelines remain in codebase for future roadmap
    MVP_PIPELINES = ["medical_chronology", "psych_timeline", "deposition_summary"]

    return [
        {"id": pipeline_id, "name": config["name"]}
        for pipeline_id, config in PIPELINE_CONFIGS.items()
        if pipeline_id in MVP_PIPELINES
    ]
