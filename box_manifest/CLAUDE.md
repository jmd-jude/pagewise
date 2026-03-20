# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A standalone Python toolkit that crawls Box.com folders via the Box SDK, infers page counts from Bates-range filenames, and produces CSV manifests and formatted Excel case reports. It has both a CLI workflow and a Streamlit web UI.

## Setup

```bash
source venv/bin/activate
pip install -r requirements.txt
```

## Usage

### Streamlit UI (recommended)
```bash
streamlit run app.py
```
Provides a web form for token + folder ID input, live crawl status, metrics, and in-browser download of all outputs.

### CLI workflow (two-step)
```bash
# Step 1: crawl Box → writes {slug}_manifest.csv and {slug}_summary.csv
python manifest.py

# Step 2: read manifest → writes {slug}_report.xlsx
python report.py
```

## Architecture

Three files with clear separation of concerns:

- **`manifest.py`** — Box API crawler. `walk_box_folder()` is the core recursive function; `infer_page_count_from_bates()` applies two strategies (padded Bates suffix, embedded range) to derive page counts from filenames. `main()` hardcodes `DEV_TOKEN` and `MASTER_FOLDER_ID` at the top of the file — edit these for CLI runs.

- **`report.py`** — Excel formatter. `group_by_section()` partitions manifest rows by top-level folder; `write_report()` renders the `openpyxl` workbook. Returns `bytes` when `output_file=None` (used by Streamlit) or saves to disk. `SKIP_FOLDERS` at the top excludes folders by name prefix.

- **`app.py`** — Streamlit UI that imports from the other two modules. Builds manifest and summary CSVs in memory (`io.StringIO`) and Excel in memory (`io.BytesIO`) to serve as download buttons — no files are written to disk.

## Key Behaviours

- **Box Developer Token** expires after 60 minutes. For CLI use, update `DEV_TOKEN` in `manifest.py` before each session.
- **Bates page inference**: Strategy 1 matches `PREFIX000001-PREFIX000011` patterns (≥4 zero-padded digits). Strategy 2 matches any `NUMBER-NUMBER` pair while filtering out dates and case numbers. Files without a recognized range get `Page Count = 'N/A'` and `Page Count Source = 'N/A'`; Bates-inferred files show `'bates_inferred'`.
- **Auto-detection**: `report.py` auto-selects the most recently modified `*_manifest.csv` in the working directory when `INPUT_FILE` is blank.
- **Output naming**: Derived from the Box root folder name, slugified — e.g. root folder `"Apara v. Catalyst"` → `apara_v_catalyst_manifest.csv`, `apara_v_catalyst_report.xlsx`.
