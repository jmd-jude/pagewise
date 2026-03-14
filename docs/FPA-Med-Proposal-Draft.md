# Proposal for FPA Med


## Current State

FPA Med entered an enterprise agreement with Box.com with the expectation that Box AI would support several core workflows; specifically: deposition summaries, medical chronologies, and document indexing. The first two were identified because of the potential for monetization, and the last for its potential to meaningfully increase operational efficiency. After several weeks of testing, these expectations have not yet been met.

---

## Diagnosis

The short version: enterprise AI platforms are designed for general knowledge work — drafting, Q&A, summarization of short documents. For work that requires *complete and traceable* extraction from - and generation of new - large documents, they have a structural limitation that better prompting alone cannot fix today.

I wrote about this in detail in the document I recently shared (see: Precision Gap). The core issue is that when you hand a 300+ page document to a single AI pass, the model's attention distributes unevenly. It produces output that looks complete and reads well — and consistently misses 30 to 40 percent of the substantive content, silently, with no indication that anything was skipped. This has been confirmed in peer-reviewed research, as noted in the document. For everyday document work, that may be acceptable. For specialized document production or review use-cases, it often is not.

The solution today needs to be architectural. Generative AI must operate as a narrowly scoped step, typically recursive, managed by a deliberately constructed software application workflow.

---

## What I've Built

While working through these limitations alongside your team, I have been building a system that takes the architectural approach described above.

It is a working proof-of-concept — not a finished product. It already handles structured extraction and analysis across the two workflows where the need is most acute:

- **Deposition summaries** — processes transcripts page by page, with each page examined in context of its neighbors, then assembles a complete topical index with page-level citations. Every page is accounted for. Nothing is silently skipped. The output includes source citations that link back to the originating page in the original document — the same kind of navigable, traceable experience your current providers deliver.

- **Medical chronologies** — extracts diagnoses, medications, providers, and treatment decisions from medical record sets, then constructs a timeline with contradiction detection and gap identification across records. Each finding is traced to its source document.

Each output can be reviewed, edited, and annotated by a practitioner before delivery. The system tracks what the AI produced versus what the expert modified — a distinction that matters for legal defensibility.

PDF and image ingestion is handled by Docling, a document AI library developed by IBM Research (https://arxiv.org/abs/2408.09869). High fidelity extraction is powered by DocETL, an open-source library created by members of the EPIC Data Lab and Data Systems and Foundations group at UC Berkeley (www.docetl.org & https://arxiv.org/abs/2410.12189).

This exists today. It was built, in part, because of what I observed while testing your workflows in Box AI.

**On document indexing** — this is a somewhat different problem, but one the same architecture should handle well. Each document in a set would get processed individually to extract structured metadata: date, document type, page count subject, key terms. Software would then assemble and sort the index. Given that document indexing is an area of meaningful operational leverage, it is worth considering for inclusion as a third workflow.

---

## Proposal: A Pivot

I would like to build this for you — the full, production-ready version of these three workflows, defined together with your team, against acceptance criteria we agree on in advance.

The development cost to FPA Med: **nothing.**

What I am proposing is a customer-zero arrangement. You bring the real workflows, the real documents, and the practitioner judgment to evaluate whether the output is good enough. I bring the product engineering and the architecture. We work transparently, and you have full visibility into what is being built and why.

There are subscription-based tools entering this space. What I am proposing is different: custom-built outcomes for your workflows, no ongoing licensing cost, and structured so that if it works, we share in what we've built.

If the system meets an acceptable level of satisfaction — defined by criteria we set together before I build anything — then we have a conversation about what that is worth. Some of these workflows carry direct costs today, paid to incumbent service providers, where a purpose-built system could deliver the same output for significantly less. That is a potential profit center for both of us, not just a cost reduction for FPA Med.

If it does not meet the bar, you have lost nothing. No fees, no obligation.

---

## Next Step

If this is worth a conversation, I would suggest a working session — not a pitch, but a collaborative discussion where we walk through each workflow, I show you what exists today, and we begin to define what "good enough" looks like for each one.

From there, we can agree on scope, acceptance criteria, and a timeline, and I can get started.
