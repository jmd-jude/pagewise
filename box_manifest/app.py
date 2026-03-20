"""
Box Manifest Generator — Streamlit UI

Run:
    streamlit run app.py
"""

import io
import csv
import re
import streamlit as st
from boxsdk import OAuth2, Client

from manifest import walk_box_folder, build_and_write_summary
from report import load_manifest, group_by_section, write_report, SKIP_FOLDERS

st.set_page_config(page_title="Box Manifest Generator", page_icon="📁", layout="centered")

st.title("📁 Box Manifest Generator")
st.caption("Crawl a Box folder and export a formatted inventory report.")

# ── Inputs ────────────────────────────────────────────────────────────────────
with st.form("config_form"):
    dev_token   = st.text_input("Box Developer Token", type="password",
                                help="Generate at app.box.com/developers/console → Developer Token (valid 60 min)")
    folder_id   = st.text_input("Box Folder ID",
                                help="The numeric ID in the Box folder URL, e.g. 362719303070")
    case_name   = st.text_input("Case Name (optional)",
                                help="Override the case name shown in the report header. Defaults to Box root folder name.")
    date_recv   = st.text_input("Date Received (optional)",
                                placeholder="e.g. 03/17/2026",
                                help="Date shown in the report header.")
    submitted   = st.form_submit_button("🚀 Generate Report", use_container_width=True)

# ── Run ───────────────────────────────────────────────────────────────────────
if submitted:
    if not dev_token or not folder_id:
        st.error("Please provide both a Developer Token and a Folder ID.")
        st.stop()

    # Authenticate
    try:
        auth   = OAuth2(client_id=None, client_secret=None, access_token=dev_token)
        client = Client(auth)
        me     = client.user().get()
        st.success(f"Authenticated as **{me.name}** ({me.login})")
    except Exception as e:
        st.error(f"Authentication failed: {e}")
        st.stop()

    # Crawl
    status_box = st.status("Crawling Box folder…", expanded=True)
    file_count = [0]
    last_logged = [0]

    def on_file(path_str):
        file_count[0] += 1
        # Log every 10 files to avoid flooding the UI
        if file_count[0] - last_logged[0] >= 10 or file_count[0] == 1:
            status_box.write(f"📄 {file_count[0]} files found…  `{path_str}`")
            last_logged[0] = file_count[0]

    manifest = walk_box_folder(client, folder_id, on_file=on_file)
    status_box.update(label=f"✅ Crawl complete — {len(manifest)} files found", state="complete")

    if not manifest:
        st.warning("No files found. Check your Folder ID and permissions.")
        st.stop()

    # ── Stats ─────────────────────────────────────────────────────────────────
    na_count  = sum(1 for r in manifest if r['Page Count'] == 'N/A')
    known     = sum(int(r['Page Count']) for r in manifest if r['Page Count'] != 'N/A')
    bates     = sum(1 for r in manifest if r['Page Count Source'] == 'bates_inferred')
    folders   = len(set(r['Folder'] for r in manifest))

    col1, col2, col3, col4 = st.columns(4)
    col1.metric("Files", f"{len(manifest):,}")
    col2.metric("Folders", f"{folders:,}")
    col3.metric("Known Pages", f"{known:,}")
    col4.metric("Bates Inferred", f"{bates:,}")

    # ── Build outputs ─────────────────────────────────────────────────────────
    # Derive slug from case root folder name
    case_root_raw = manifest[0]['Path'].split('/')[0]
    slug = re.sub(r'[^\w]+', '_', case_root_raw).strip('_').lower()

    # Manifest CSV (in memory)
    manifest_buf = io.StringIO()
    fieldnames = ['Name', 'Path', 'Folder', 'Extension',
                  'Page Count', 'Page Count Source',
                  'Size (KB)', 'Created', 'Modified', 'File ID']
    writer = csv.DictWriter(manifest_buf, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerows(manifest)
    manifest_csv_bytes = manifest_buf.getvalue().encode('utf-8')

    # Summary CSV (in memory)
    summary_buf = io.StringIO()
    import collections
    summary_folders = collections.defaultdict(lambda: {
        'File Count': 0,
        'Known Page Total': 0,
        'NA Count': 0,
        'Total Size KB': 0,
        'File Types': collections.Counter(),
    })
    for row in manifest:
        f = row['Folder']
        summary_folders[f]['File Count'] += 1
        summary_folders[f]['File Types'][row['Extension']] += 1
        if row['Page Count'] == 'N/A':
            summary_folders[f]['NA Count'] += 1
        else:
            summary_folders[f]['Known Page Total'] += int(row['Page Count'])
        if row['Size (KB)'] != 'N/A':
            summary_folders[f]['Total Size KB'] += float(row['Size (KB)'])

    summary_fieldnames = ['Folder', 'Depth', 'File Count', 'Known Page Total',
                          'Files Missing Page Count', 'Total Size', 'File Types']
    sum_writer = csv.DictWriter(summary_buf, fieldnames=summary_fieldnames)
    sum_writer.writeheader()
    for folder_path, data in sorted(summary_folders.items()):
        depth = folder_path.count('/')
        types_str = ', '.join(f"{ext}({n})" for ext, n in data['File Types'].most_common())
        total_kb = data['Total Size KB']
        size_display = (f"{round(total_kb / 1024, 1)} MB" if total_kb >= 1024
                        else f"{round(total_kb, 1)} KB")
        sum_writer.writerow({
            'Folder': folder_path,
            'Depth': depth,
            'File Count': data['File Count'],
            'Known Page Total': data['Known Page Total'] if data['Known Page Total'] > 0 else 'N/A',
            'Files Missing Page Count': data['NA Count'],
            'Total Size': size_display,
            'File Types': types_str,
        })
    summary_csv_bytes = summary_buf.getvalue().encode('utf-8')

    # Excel report (in memory)
    case_root_for_report, sections = group_by_section(manifest, SKIP_FOLDERS)
    xlsx_bytes = write_report(
        case_root_for_report,
        sections,
        manifest,
        output_file=None,
        case_name_override=case_name or None,
        date_received_override=date_recv or None,
    )

    # ── Download buttons ──────────────────────────────────────────────────────
    st.divider()
    st.subheader("📥 Downloads")

    dl1, dl2, dl3 = st.columns(3)
    dl1.download_button(
        label="📊 Excel Report",
        data=xlsx_bytes,
        file_name=f"{slug}_report.xlsx",
        mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        use_container_width=True,
    )
    dl2.download_button(
        label="📄 File Manifest (CSV)",
        data=manifest_csv_bytes,
        file_name=f"{slug}_manifest.csv",
        mime="text/csv",
        use_container_width=True,
    )
    dl3.download_button(
        label="📋 Folder Summary (CSV)",
        data=summary_csv_bytes,
        file_name=f"{slug}_summary.csv",
        mime="text/csv",
        use_container_width=True,
    )
