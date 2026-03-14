```
du -sh ~/.cache/docetl

du -sh ~/.cache/docetl && cd backend && source venv/bin/activate && docetl clear-cache && cd .. && du -sh ~/.cache/docetl

&& npm run dev
--

rm -rf /tmp/docetl_intermediates /tmp/forensic_input.json /tmp/forensic_analysis_output.json && rm -f ~/.cache/docetl/llm/cache.db
```

```
rm -rf /tmp/docetl_intermediates /tmp/forensic_input.json /tmp/forensic_analysis_output.json; backend/venv/bin/docetl clear-cache 2>&1
```

from doc-engine
```
rm -rf /tmp/docetl_intermediates /tmp/forensic_input.json /tmp/forensic_analysis_output.json && rm -f ~/.cache/docetl/llm/cache.db
```