import os
import json
from docetl import DSLRunner
from dotenv import load_dotenv
from pipeline_configs import get_pipeline_config
from litellm import completion_cost
import litellm
import threading
from jinja2 import Template

load_dotenv()

litellm.request_timeout = 300

# ============= LiteLLM Cost Tracking =============
# Thread-safe cost tracker for capturing actual LLM usage
_cost_tracker = {
    "calls": [],
    "lock": threading.Lock(),
    "operation_context": None  # Track which operation (extraction/analysis) is running
}

def track_llm_costs(kwargs, response_obj, start_time, end_time):
    """
    Callback to capture actual token usage and costs from LiteLLM calls made by DocETL.
    Automatically invoked by LiteLLM on each successful completion.
    """
    try:
        model = kwargs.get("model", "unknown")
        usage = response_obj.get("usage", {})
        prompt_tokens = usage.get("prompt_tokens", 0)
        completion_tokens = usage.get("completion_tokens", 0)
        total_tokens = usage.get("total_tokens", 0)

        # Calculate actual cost using LiteLLM
        try:
            cost = completion_cost(completion_response=response_obj)
        except Exception as e:
            print(f"[Cost Tracking] Warning: Could not calculate cost: {e}")
            cost = 0.0

        # Thread-safe tracking
        with _cost_tracker["lock"]:
            _cost_tracker["calls"].append({
                "model": model,
                "prompt_tokens": prompt_tokens,
                "completion_tokens": completion_tokens,
                "total_tokens": total_tokens,
                "cost": cost,
                "operation": _cost_tracker.get("operation_context", "unknown")
            })

    except Exception as e:
        print(f"[Cost Tracking] Error in callback: {e}")

# Install the callback globally for all LiteLLM calls
litellm.success_callback = [track_llm_costs]
# ============= END Cost Tracking =============

def analyze_records_for_red_flags(sorted_records, analysis_model, pipeline_config):
    """
    Optional LLM analysis step for deep insights after Python assembly.

    Analyzes extracted medical records for:
    - Red flags (standard of care issues, documentation gaps, safety concerns)
    - Contradictions across records
    - Expert opinions needed

    Args:
        sorted_records: List of extracted records (sorted chronologically)
        analysis_model: Model to use (e.g., "claude-sonnet-4-5-20250929")
        pipeline_config: Pipeline configuration dict

    Returns:
        Dict with red_flags, contradictions, expert_opinions_needed
    """
    try:
        print(f"[Analysis] Starting deep analysis with {analysis_model}...")

        # Set operation context for cost tracking
        with _cost_tracker["lock"]:
            _cost_tracker["operation_context"] = "analysis"

        # Extract valid record IDs for grounding
        valid_record_ids = [record.get('record_id', '') for record in sorted_records if record.get('record_id')]
        valid_ids_str = ", ".join(valid_record_ids)
        print(f"[Analysis] Grounding LLM with {len(valid_record_ids)} valid record IDs")

        # Construct analysis prompt
        persona = pipeline_config.get("persona", "a forensic medical expert")
        dataset_description = pipeline_config.get("dataset_description", "medical records")

        # Use custom analysis_prompt from pipeline config if available, otherwise use default
        if "analysis_prompt" in pipeline_config:
            # Pipeline provides custom analysis prompt with Jinja template
            print(f"[Analysis] Using custom analysis prompt from pipeline config")
            template = Template(pipeline_config["analysis_prompt"])

            # Render template with structured records (not text summaries!)
            analysis_prompt = template.render(inputs=sorted_records)
        else:
            # Use default hardcoded prompt for backward compatibility
            print(f"[Analysis] Using default analysis prompt")
            # Build text summary for default prompt
            records_summary = []
            for i, record in enumerate(sorted_records, 1):
                summary = (
                    f"{i}. Date: {record.get('date', 'Unknown')} | "
                    f"ID: {record.get('record_id', 'Unknown')} | "
                    f"Provider: {record.get('provider', 'Unknown')} | "
                    f"Event: {record.get('event_type', 'unknown')} | "
                    f"Description: {record.get('event_description', 'No description')} | "
                    f"Diagnosis: {record.get('diagnosis', 'None')} | "
                    f"Confidence: {record.get('confidence', 'unknown')}"
                )
                records_summary.append(summary)

            analysis_prompt = f"""You are {persona} analyzing {dataset_description}.

Below are {len(sorted_records)} extracted medical records in chronological order. Each record has been extracted and validated.

RECORDS:
{chr(10).join(records_summary)}

TASK: Analyze these records for critical issues that would be relevant in a legal/forensic context.

Return JSON with three fields:

1. "red_flags": List of serious issues (standard of care deviations, documentation gaps, safety concerns, medication errors, consent issues)
   - Format: "Category: [category] | Issue: [specific issue] | Records: [record IDs] | Legal Relevance: [high/medium/low]"
   - Focus on actionable, specific issues with record citations

2. "contradictions": List of conflicting information across records
   - Format: "Records [ID1] and [ID2]: [description of contradiction] | Legal Relevance: [high/medium/low]"

3. "expert_opinions_needed": Areas requiring expert medical interpretation
   - Format: "Topic: [topic] | Records: [record IDs] | Reason: [why expert needed]"

Be thorough but concise. Only include significant issues. Always cite specific record IDs."""

        # Add grounding constraints to prevent hallucinations
        grounding_instructions = f"""

CRITICAL GROUNDING REQUIREMENT:
You MUST only cite record IDs that exist in the provided records above.
Valid record IDs in this dataset: {valid_ids_str}

Do NOT invent, assume, or reference any record IDs that are not in this list.
If you cannot find evidence of an issue in the actual records provided, do not report it."""

        analysis_prompt += grounding_instructions

        # Call LLM
        response = litellm.completion(
            model=analysis_model,
            messages=[
                {"role": "system", "content": f"You are {persona}."},
                {"role": "user", "content": analysis_prompt}
            ],
            temperature=0.1  # Low temperature for consistency
        )

        # Parse response
        response_content = response.choices[0].message.content

        # Try to extract JSON from response (Claude sometimes wraps JSON in markdown)
        if "```json" in response_content:
            # Extract JSON from markdown code block
            json_start = response_content.find("```json") + 7
            json_end = response_content.find("```", json_start)
            response_content = response_content[json_start:json_end].strip()
        elif "```" in response_content:
            # Generic code block
            json_start = response_content.find("```") + 3
            json_end = response_content.find("```", json_start)
            response_content = response_content[json_start:json_end].strip()

        result = json.loads(response_content)

        # Get raw LLM results
        raw_red_flags = result.get("red_flags", [])
        raw_contradictions = result.get("contradictions", [])
        raw_expert_opinions = result.get("expert_opinions_needed", [])

        print(f"[Analysis] ✓ Found {len(raw_red_flags)} red flag(s), {len(raw_contradictions)} contradiction(s), {len(raw_expert_opinions)} expert opinion(s) needed")

        # VALIDATION: Check for hallucinated record IDs
        def validate_record_ids(items, field_name):
            """Validate that cited record IDs exist in the input data"""
            valid_ids_set = set(valid_record_ids)
            hallucinations_found = 0

            for item in items:
                if isinstance(item, dict):
                    cited_records = item.get("records", [])
                    if isinstance(cited_records, str):
                        cited_records = [r.strip() for r in cited_records.split(",")]
                    elif not isinstance(cited_records, list):
                        cited_records = []

                    for record_id in cited_records:
                        if record_id and record_id not in valid_ids_set:
                            hallucinations_found += 1
                            print(f"[Analysis] ⚠️  HALLUCINATION DETECTED in {field_name}: '{record_id}' does not exist in input data!")

            if hallucinations_found > 0:
                print(f"[Analysis] ⚠️  Total hallucinations in {field_name}: {hallucinations_found}")
            else:
                print(f"[Analysis] ✓ No hallucinations detected in {field_name}")

        # Validate all citation fields
        validate_record_ids(raw_red_flags, "red_flags")
        validate_record_ids(raw_contradictions, "contradictions")
        validate_record_ids(raw_expert_opinions, "expert_opinions_needed")

        # Get analysis schema to determine output format
        analysis_schema = pipeline_config.get("analysis_schema", {})

        # Helper function to format field based on schema
        def format_field(field_name, raw_data, string_formatter):
            """
            Format field based on schema specification.
            If schema specifies list[dict], return objects.
            If schema specifies list[str], convert to strings.
            Default to strings for backward compatibility.
            """
            schema_type = analysis_schema.get(field_name, "list[str]")

            if schema_type == "list[dict]":
                # Return structured objects
                print(f"[Analysis] Returning {field_name} as structured objects (schema: list[dict])")
                return raw_data
            else:
                # Convert to pipe-delimited strings (backward compatibility)
                print(f"[Analysis] Converting {field_name} to strings (schema: {schema_type})")
                formatted = []
                for item in raw_data:
                    if isinstance(item, dict):
                        formatted.append(string_formatter(item))
                    else:
                        formatted.append(str(item))
                return formatted

        # Format red_flags
        def format_red_flag(flag):
            records_str = ", ".join(flag.get("records", [])) if isinstance(flag.get("records"), list) else flag.get("records", "Unknown")
            return (
                f"Category: {flag.get('category', 'unknown')} | "
                f"Issue: {flag.get('issue', 'No description')} | "
                f"Records: {records_str} | "
                f"Legal Relevance: {flag.get('legal_relevance', 'unknown')}"
            )

        red_flags = format_field("red_flags", raw_red_flags, format_red_flag)

        # Format contradictions
        def format_contradiction(contradiction):
            return (
                f"Records {contradiction.get('records', 'Unknown')}: "
                f"{contradiction.get('description', 'No description')} | "
                f"Legal Relevance: {contradiction.get('legal_relevance', 'unknown')}"
            )

        contradictions = format_field("contradictions", raw_contradictions, format_contradiction)

        # Format expert_opinions_needed
        def format_expert_opinion(opinion):
            records_str = ", ".join(opinion.get("records", [])) if isinstance(opinion.get("records"), list) else opinion.get("records", "Unknown")
            return (
                f"Topic: {opinion.get('topic', 'Unknown')} | "
                f"Records: {records_str} | "
                f"Reason: {opinion.get('reason', 'No description')}"
            )

        expert_opinions = format_field("expert_opinions_needed", raw_expert_opinions, format_expert_opinion)

        return {
            "red_flags": red_flags,
            "contradictions": contradictions,
            "expert_opinions_needed": expert_opinions
        }

    except Exception as e:
        print(f"[Analysis] Error during LLM analysis: {e}")
        import traceback
        traceback.print_exc()
        return {
            "red_flags": [],
            "contradictions": [],
            "expert_opinions_needed": []
        }

def run_forensic_pipeline(input_data, pipeline="psych_timeline", hybrid_mode=False):
    """
    Universal Forensic Discovery Pipeline
    Uses DocETL to analyze documents

    Args:
        input_data: List of document records (JSON objects)
        pipeline: One of "psych_timeline", "psych_expert_witness", "medical_chronology"
        hybrid_mode: If True, uses Claude Sonnet 4 for analysis (higher quality, higher cost)

    Returns:
        Dict with "analysis" and "cost_data" keys
    """

    # Get pipeline-specific configuration
    pipeline_config = get_pipeline_config(pipeline)

    # Save input data to temp file (DocETL requires file-based datasets)
    input_path = "/tmp/forensic_input.json"
    with open(input_path, 'w') as f:
        json.dump(input_data, f)

    # Get model configurations (with defaults)
    extraction_model = pipeline_config.get("extraction_model", "gpt-4o-mini")
    analysis_model = pipeline_config.get("analysis_model", "gpt-4o-mini")

    # Override analysis model if hybrid mode is enabled
    if hybrid_mode:
        analysis_model = "claude-sonnet-4-5-20250929"
        print(f"[Pipeline] Hybrid mode enabled: Using {analysis_model} for analysis")

    # Build DocETL config with pipeline-specific prompts and schemas
    config = {
        "default_model": "gpt-4o-mini",
        "system_prompt": {
            "dataset_description": pipeline_config["dataset_description"],
            "persona": pipeline_config["persona"]
        },
        "datasets": {
            "records": {
                "type": "file",
                "path": input_path
            }
        },
        "operations": [
            {
                "name": "extract_events",
                "type": "map",
                "model": extraction_model,  # Use pipeline-specific extraction model
                "prompt": pipeline_config["extraction_prompt"],
                "output": {
                    "schema": pipeline_config["output_schema"]
                },
                "validate": pipeline_config.get("extraction_validation", []),
                "num_retries_on_validate_failure": pipeline_config.get("num_retries_on_validate_failure", 2),
                "skip_on_error": True,  # Continue processing even if some records fail
                "pass_through": True
            }
            # Note: No reduce operation - chronology assembly happens in Python after extraction
        ],
        "pipeline": {
            "steps": [
                {
                    "name": "extraction",
                    "input": "records",
                    "operations": ["extract_events"]
                }
                # Note: No audit step - Python assembles chronology from extraction results
            ],
            "output": {
                "type": "file",
                "path": "/tmp/forensic_analysis_output.json",
                "intermediate_dir": "/tmp/docetl_intermediates"  # Save intermediate results for debugging
            }
        }
    }

    try:
        print(f"[Pipeline] Analyzing {len(input_data)} records...")

        # Run the pipeline (DSLRunner processes and saves to temp file)
        runner = DSLRunner(config=config, max_threads=4, timeout_seconds=300)
        runner.load_run_save()

        print(f"[Pipeline] Pipeline execution complete")
        print(f"[Pipeline] Pipeline execution complete")
        print(f"[Pipeline] 📂 Intermediate outputs: /tmp/docetl_intermediates/extraction/")
        
        # Read extraction results (map output)
        extraction_path = "/tmp/docetl_intermediates/extraction/extract_events.json"
        if os.path.exists(extraction_path):
            with open(extraction_path, 'r') as f:
                extracted_records = json.load(f)
                extracted_count = len(extracted_records)
                input_count = len(input_data)

                # DATA INTEGRITY CHECK
                if extracted_count < input_count:
                    print(f"[WARNING] ⚠️  DATA LOSS: {input_count - extracted_count} records lost during extraction!")
                    print(f"[WARNING]    Input: {input_count} records → Extracted: {extracted_count} records")
                elif extracted_count > input_count:
                    print(f"[WARNING] ⚠️  PHANTOM RECORDS: {extracted_count - input_count} extra records added!")
                else:
                    print(f"[Pipeline] ✓ Extraction integrity: {extracted_count}/{input_count} records")

                # ============= PYTHON-BASED CHRONOLOGY ASSEMBLY =============
                print(f"[Assembly] Assembling chronology from {extracted_count} extracted records...")

                # Step 1: De-duplicate by record_id
                seen_ids = set()
                unique_records = []
                duplicates_removed = 0

                for record in extracted_records:
                    record_id = record.get('record_id', '')
                    if record_id and record_id in seen_ids:
                        duplicates_removed += 1
                        print(f"[Assembly] ⚠️  Removed duplicate record_id: {record_id}")
                        continue
                    seen_ids.add(record_id)
                    unique_records.append(record)

                if duplicates_removed > 0:
                    print(f"[Assembly] Removed {duplicates_removed} duplicate(s)")
                else:
                    print(f"[Assembly] ✓ No duplicates found")

                # Step 2: Sort by date
                from datetime import datetime
                invalid_dates = []  # Track records with invalid dates

                def safe_parse_date(date_str):
                    try:
                        return datetime.strptime(date_str, '%Y-%m-%d')
                    except:
                        invalid_dates.append(date_str)
                        print(f"[Assembly] ⚠️  Invalid date detected: '{date_str}'")
                        return datetime.min  # Put invalid dates at the beginning

                sorted_records = sorted(unique_records, key=lambda r: safe_parse_date(r.get('date', '')))
                print(f"[Assembly] ✓ Sorted {len(sorted_records)} records by date")

                if invalid_dates:
                    print(f"[Assembly] ⚠️  Found {len(invalid_dates)} invalid date(s)")

                # Step 3: Calculate gaps (Python date math - no LLM hallucinations!)
                missing_records = []
                for i in range(len(sorted_records) - 1):
                    try:
                        date1 = datetime.strptime(sorted_records[i]['date'], '%Y-%m-%d')
                        date2 = datetime.strptime(sorted_records[i+1]['date'], '%Y-%m-%d')
                        gap_days = (date2 - date1).days

                        if gap_days > 30:
                            missing_records.append(
                                f"Gap detected: {sorted_records[i]['date']} to {sorted_records[i+1]['date']} "
                                f"({gap_days} days) - No documented care between visits"
                            )
                    except Exception as e:
                        print(f"[Assembly] Warning: Could not calculate gap between records: {e}")

                print(f"[Assembly] ✓ Identified {len(missing_records)} gaps > 30 days")

                # Step 4: Format chronology strings using standard event schema
                # All pipelines extract to: date, record_id, event_type, event_description, provider
                # Optional fields (confidence, diagnosis) are pipeline-specific
                chronology = []
                for record in sorted_records:
                    entry = (
                        f"{record.get('date', 'Unknown')} [{record.get('record_id', 'Unknown')}]: "
                        f"[{record.get('event_type', 'unknown')}] - "
                        f"{record.get('event_description', 'No description')} "
                        f"(Provider: {record.get('provider', 'Unknown')})"
                    )

                    # Append optional fields if present (e.g., confidence for medical_chronology)
                    if 'confidence' in record:
                        entry += f" [Confidence: {record.get('confidence', 'unknown')}]"

                    chronology.append(entry)

                print(f"[Assembly] ✓ Formatted {len(chronology)} chronology entries")
                print(f"[Assembly] ✓ Final count: {len(chronology)} entries from {extracted_count} extracted records")

                # Step 5: Flag records with invalid dates as documentation gaps
                red_flags = []
                contradictions = []
                expert_opinions_needed = []

                # Check if pipeline expects structured red_flags
                analysis_schema = pipeline_config.get("analysis_schema", {})
                use_structured_red_flags = analysis_schema.get("red_flags") == "list[dict]"

                # Add invalid date records to red flags
                for record in sorted_records:
                    if record.get('date', '') in invalid_dates:
                        if use_structured_red_flags:
                            # Structured object format
                            red_flags.append({
                                "category": "documentation_gap",
                                "issue": f"Record missing valid date '{record.get('date', '')}'",
                                "records": [record.get('record_id', 'Unknown')],
                                "legal_relevance": "high"
                            })
                        else:
                            # Legacy pipe-delimited string format
                            red_flags.append(
                                f"Category: documentation_gap | Issue: Record missing valid date '{record.get('date', '')}' | "
                                f"Record: {record.get('record_id', 'Unknown')} | Legal Relevance: high"
                            )

                if red_flags:
                    print(f"[Assembly] ⚠️  Added {len(red_flags)} documentation gap(s) to red flags")

                # Step 6: Optional LLM analysis for deeper insights (if pipeline requires it)
                if pipeline_config.get("requires_llm_analysis", False):
                    print(f"[Pipeline] Running LLM analysis with {analysis_model}...")
                    analysis_results = analyze_records_for_red_flags(sorted_records, analysis_model, pipeline_config)

                    # Merge LLM-generated insights with existing red flags
                    llm_red_flags = analysis_results.get("red_flags", [])
                    contradictions = analysis_results.get("contradictions", [])
                    expert_opinions_needed = analysis_results.get("expert_opinions_needed", [])

                    if llm_red_flags:
                        red_flags.extend(llm_red_flags)
                        print(f"[Analysis] ✓ Added {len(llm_red_flags)} LLM-detected red flag(s)")
                else:
                    print(f"[Pipeline] Skipping LLM analysis: Pipeline uses deterministic Python assembly only")

                # Assemble final output
                analysis_output = {
                    "chronology": chronology,
                    "missing_records": missing_records,
                    "red_flags": red_flags,
                    "contradictions": contradictions,  # LLM-detected contradictions (if hybrid mode)
                    "expert_opinions_needed": expert_opinions_needed  # Areas needing expert review (if hybrid mode)
                }

                # Aggregate cost data from LiteLLM callbacks (separate extraction and analysis)
                extraction_cost = 0.0
                analysis_cost = 0.0
                total_cost = 0.0
                total_tokens = 0
                llm_calls_count = 0

                with _cost_tracker["lock"]:
                    llm_calls_count = len(_cost_tracker["calls"])

                    for call in _cost_tracker["calls"]:
                        call_cost = call["cost"]
                        total_cost += call_cost
                        total_tokens += call["total_tokens"]

                        # Separate extraction vs analysis costs
                        operation = call.get("operation", "unknown")
                        if operation == "analysis":
                            analysis_cost += call_cost
                        else:
                            extraction_cost += call_cost

                    # Reset tracker for next run
                    _cost_tracker["calls"] = []

                # Log cost summary
                if total_cost > 0:
                    print(f"[Pipeline] Total Cost: {llm_calls_count} LLM calls, ${total_cost:.4f} ({total_tokens:,} tokens)")
                    if extraction_cost > 0:
                        print(f"[Pipeline]   - Extraction: ${extraction_cost:.4f}")
                    if analysis_cost > 0:
                        print(f"[Pipeline]   - Analysis: ${analysis_cost:.4f}")

                # Determine actual analysis model used
                actual_analysis_model = analysis_model if pipeline_config.get("requires_llm_analysis", False) else "python"

                cost_breakdown = {
                    "extraction_model": extraction_model,
                    "analysis_model": actual_analysis_model,  # Shows actual model used
                    "extraction_cost": extraction_cost,
                    "analysis_cost": analysis_cost,
                    "total_cost": total_cost,
                    "total_tokens": total_tokens,
                    "records_processed": len(input_data)
                }

                return {
                    "analysis": analysis_output,
                    "cost_data": cost_breakdown
                }
        else:
            # Extraction file not found - raise error
            print(f"[ERROR] Extraction results not found at {extraction_path}")
            raise FileNotFoundError(f"Extraction results not found at {extraction_path}")

    except Exception as e:
        print(f"[Pipeline Error] {str(e)}")
        import traceback
        traceback.print_exc()

        # Capture any costs incurred before error
        total_cost = 0.0
        total_tokens = 0
        with _cost_tracker["lock"]:
            for call in _cost_tracker["calls"]:
                total_cost += call["cost"]
                total_tokens += call["total_tokens"]
            _cost_tracker["calls"] = []

        # Return error with any cost data captured
        error_analysis = {
            "chronology": [],
            "missing_records": [f"Pipeline error: {str(e)}"],
            "red_flags": [],
            "contradictions": [],
            "expert_opinions_needed": []
        }
        error_cost_data = {
            "extraction_model": extraction_model if 'extraction_model' in locals() else "unknown",
            "analysis_model": "python",
            "extraction_cost": 0.0,
            "analysis_cost": 0.0,
            "total_cost": total_cost,
            "total_tokens": total_tokens,
            "records_processed": 0
        }
        return {
            "analysis": error_analysis,
            "cost_data": error_cost_data
        }
