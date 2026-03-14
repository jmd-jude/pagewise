# The Precision Gap: Why Enterprise AI May Fall Short for High-Stakes Document Work

---

## Summary

Every major enterprise software platform now includes an AI assistant.  Microsoft 365, Salesforce, Google Workspace, Doc Management Platforms, Cloud Data — they have all integrated large language models into their products, and for good reason. These tools are genuinely impressive at drafting emails, answering questions about a document, generating meeting summaries, and accelerating the kind of general knowledge work that fills most of a professional's day.

Legal, medical, and financial professionals have been among the most enthusiastic early adopters. The use cases seem obvious: long documents, complex information, repetitive extraction tasks. AI should be a natural fit.

For many things, it is. But for a specific and important class of work — where the output must be *complete*, *accurate*, and *traceable to a source* — enterprise AI tools fall short. Not catastrophically, and not in ways that are immediately obvious. They produce something that looks right, is mostly right, and is wrong in ways that only become visible when you check it carefully against the original.

This document explains why that happens, why it is not always fixable by writing better prompts, and what a different approach looks like.

---

## How Language Models Work

A language model is, at its core, a very sophisticated pattern-completion machine. It has been trained on an enormous amount of text and has learned to produce responses that are contextually appropriate, fluent, and helpful. When you give it a document and ask a question, it reads the document and generates an answer.

The critical constraint is not whether the document fits. Modern models can technically ingest hundreds of thousands of words in a single pass. The problem is what happens to the model's *attention* as the document gets longer.

When a person reads a 300-page deposition transcript looking for every substantive topic, they work systematically: page by page, building a running index. They do not try to hold all 300 pages in mind simultaneously.

When a language model is given the same 300 pages as a single prompt, it does exactly that. It processes everything at once and generates output that reflects its overall impression. The result is accurate for prominent topics — those that appear repeatedly or are discussed at length — and incomplete for topics that appear once, briefly, in the middle of a long section.

This is not a fringe hypothesis. It is a documented phenomenon. Liu et al. (2024) in the paper "Lost in the Middle: How Language Models Use Long Contexts" — published in the *Transactions of the Association for Computational Linguistics* — found that performance on information retrieval tasks degrades significantly when relevant information appears in the middle of a long context, even for models explicitly designed for long-context use. A separate 2025 study, "Context Length Alone Hurts LLM Performance Despite Perfect Retrieval" (Du et al., EMNLP 2025), found that performance degradation begins well before context limits are reached — in some models, a large portion of the drop occurs within the first 7,000 tokens, far below their stated capacity. The implication: the problem is not about running out of room. It is about the structural way these models distribute attention across long input, regardless of how large the window technically is.

In practice, when asked to produce a complete topical summary of a 250-300 page legal deposition transcript, a capable enterprise AI model produced approximately 60 entries. A methodical, page-by-page pipeline approach applied to the same document produced 77 — a 28% increase in coverage, with every entry traced to a specific page range in the original. The difference is not the model's capability in isolation. It is the architecture within which the model operates.

---

## When Does It Matter?

Not every document workflow has a completeness problem. Short transcripts — say, under 30 to 50 pages — typically fall within the range where a single-pass approach works reliably. The model's attention is not significantly diluted, and the output is likely adequate for most purposes.

The risk curve steepens as document length grows. Based on available research, degradation in information retrieval becomes practically significant around 30,000–50,000 tokens, roughly the equivalent of 60–100 pages of dense transcript. By the time a document reaches 150–200 pages, systematic omissions are expected rather than exceptional. At 250–300 pages, the kind of consistent gap seen in our testing — 40 to 60 percent of substantive topics missed — should be assumed as the baseline, not the worst case.

For everyday document work, this range rarely matters. For expert witness work, it is precisely where most of the important material lives.

---

## Why Prompting Alone Cannot Solve This

The natural response when an AI tool underperforms is to write a better prompt. Be more specific. Give it an example of what you want. Tell it to be thorough. For many tasks, this works.

For completeness over long documents, it does not — not reliably, and not at scale. The reason is architectural. The model is not *choosing* to skip topics. It is producing the best output it can from a single pass over a very large input. Telling it to be more thorough does not change the underlying constraint. It may shift which topics get covered, but it does not guarantee exhaustive coverage.

This has been confirmed empirically. Across multiple iterations in our testing — with progressively more explicit coverage requirements, structured output formats, and quality checklists — coverage plateaued consistently at 40–60 percent of the substantive testimony in a 300-page deposition. The ceiling did not move because the instructions improved. It moved only when the architecture changed.

---

## A Different Architecture: Workflow, Not Query

The solution is not a better model or a cleverer prompt. It is a different way of deploying AI within a structured process.

The core insight: let AI do what it is genuinely good at — reading a bounded piece of text and extracting structured information from it — and let software handle what software is good at: ordering, deduplication, completeness verification, and citation formatting.

**Step 1 — Segment.** Divide the document into natural units — one page at a time. Each unit is small enough that the model's attention is not divided.

**Step 2 — Contextualize.** For each page, automatically include surrounding pages as context. The model understands whether a topic is beginning, continuing, or concluding — without being overwhelmed by the full document.

**Step 3 — Extract per unit.** For each page, the model answers a single focused question: does a new topic begin here, and if so, what is it? This is a task the model can perform with high accuracy and consistency when given bounded input.

**Step 4 — Assemble in code.** Structured outputs from every page are collected and assembled by software: sorted by page number, deduplicated, formatted with source citations. No AI participates in the assembly step. It is deterministic, auditable, and verifiable.

Two properties of this architecture deserve specific attention for expert witness contexts:

*Coverage is verifiable.* Because every page is processed individually, the pipeline can confirm that every page was examined. There is no silent skipping. If a topic was missed, the gap is visible in the output structure — not hidden in the fluency of the prose.

*Hallucination is structurally constrained.* When a model operates on one page at a time, it has nowhere to fabricate from. It either finds something relevant on that page or it does not. The bounded context removes the conditions under which confabulation typically occurs — where a model, uncertain about details it can no longer "see" clearly, fills in plausibly from training rather than from the document. For work where a fabricated medication dosage or a misremembered date could be raised by opposing counsel, this architectural property matters.


---

## A Note on Validation

A useful test for any organization in this space: take a document you have already processed manually and run it through both approaches. The single-prompt enterprise AI output and the pipeline output will not be the same. The differences — in coverage, in citation accuracy, in the completeness of the resulting index — are visible to any practitioner who knows the source material.

The comparison does not require a sophisticated evaluation framework. It requires someone who knows the document well enough to recognize what is missing. That comparison is the most direct possible demonstration of the gap described here.

> Note - we could create an experiment to test this approach using a long deposition transcript already in the public domain.


---

## References

Liu, N. F., Lin, K., Hewitt, J., Paranjape, A., Bevilacqua, M., Petroni, F., & Liang, P. (2024). Lost in the Middle: How Language Models Use Long Contexts. *Transactions of the Association for Computational Linguistics*, 12, 157–173. https://aclanthology.org/2024.tacl-1.9/

Du, Y., Tian, M., Ronanki, S., Rongali, S., Bodapati, S., Galstyan, A., & Wells, A. (2025). Context Length Alone Hurts LLM Performance Despite Perfect Retrieval. In *Findings of EMNLP 2025*. https://arxiv.org/abs/2510.05381
