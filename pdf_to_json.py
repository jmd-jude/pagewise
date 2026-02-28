"""
Convert a PDF to a page-per-record JSON array for doc-engine ingestion.

Usage:
    python pdf_to_json.py <input.pdf> <output.json>

Each record in the output contains:
    record_id  - "page-NNN" (zero-padded)
    page_num   - integer page number (1-based)
    content    - plain text of that page
"""

import json
import sys
from pathlib import Path

from docling.document_converter import DocumentConverter


def convert(pdf_path: str, output_path: str) -> None:
    print(f"Converting: {pdf_path}")
    converter = DocumentConverter()
    result = converter.convert(pdf_path)
    doc = result.document

    page_numbers = sorted(doc.pages.keys())
    print(f"Pages found: {len(page_numbers)}")

    records = []
    for page_no in page_numbers:
        text = doc.export_to_markdown(
            page_no=page_no,
            escape_underscores=False,
            image_placeholder="",
        ).strip()

        if not text:
            print(f"  Page {page_no}: empty, skipping")
            continue

        records.append({
            "record_id": f"page-{page_no:03d}",
            "doc_id": "transcript",
            "page_num": page_no,
            "content": text,
        })
        print(f"  Page {page_no}: {len(text)} chars")

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(records, f, indent=2, ensure_ascii=False)

    print(f"\nDone. {len(records)} pages written to {output_path}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python pdf_to_json.py <input.pdf> <output.json>")
        sys.exit(1)
    convert(sys.argv[1], sys.argv[2])
