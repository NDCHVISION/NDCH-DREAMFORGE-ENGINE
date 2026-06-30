# DreamForge — Architectural Invariants

**Version:** 1.0.0
**Status:** Locked

These invariants define what must always be true about DreamForge.
They are not defaults. They are not preferences. They are not guidelines.
They are the architectural laws that govern every decision, at every layer, across every version.

> *Process is not reasoning. Structure is not thought.*
>
> *Every relationship is an edge. Design it that way before the graph exists.*

---

## The Nine Laws

### 1. Provenance Law
Every downstream artifact must be fully explainable by upstream artifacts.
No compiler may invent information that cannot be traced to an earlier decision.
Every Runway prompt traces to a shot_list entry → visual_system decision → concept_dna field → concept_seed.
Failures are diagnosable to the exact layer.

### 2. Non-Destructive Law
Production artifacts remain backward compatible.
No architectural evolution may break, modify, or invalidate an existing rendered reel.
v1 reels remain valid. v2.1 reels remain valid. The production compiler schema is a contract.

### 3. Reversibility Law
Any architectural decision must be reversible without touching production artifacts.
Do not make decisions that foreclose future options.
Knowledge embedded in prompts cannot be extracted without modifying the reasoning layer.
Knowledge in data files can be upgraded without modifying anything.
If a decision cannot be undone without touching production, it requires explicit justification before being made.

### 4. Separation Law
No layer performs another layer's responsibilities.
The Thinker reasons about meaning. The Designer reasons about visual form. The Director reasons about emotional time. The Compiler serializes decisions it did not make.
If a layer's output contains language that belongs to a downstream layer, the boundary has been violated.

### 5. Semantic Before Visual Law
Meaning precedes imagery.
The pipeline always travels: concept → psychology → physical analogy → symbol → visual system → camera → prompt.
No visual decision is made before its semantic justification exists upstream.
A prompt is the last thing written, not the first thing imagined.

### 6. Identity Envelope Law
Brand identity emerges from reasoning, not repeated motifs.
The NDCH identity is not a palette. It is not a geometry. It is not a void background.
It is a philosophical commitment — the same reasoning architecture applied across every reel.
Two reels can look completely different and both be unmistakably NDCH if they derive from the same philosophical core.
The identity envelope is defined by the SFM-ELITE axioms. It cannot evolve without explicit architectural decision.

### 7. Search Before Commit Law
The engine must explore before committing.
No layer may select the first acceptable option as the final option.
The exploration budget is an implementation parameter — it may be tuned per-concept complexity.
The law is absolute: search must occur. The extent of search is implementation.

### 8. Learning Law
The engine records why it chose something, not just what it chose.
Rejected candidates carry more signal than selected ones.
A symbol rejected for low identity coherence teaches what the selected symbol cannot.
The exploration log must capture the full candidate set with scores and explicit rejection rationale.
A system that only records winners cannot learn from its reasoning.

### 9. Data Portability Law
Intelligence is encoded as portable data, not as prompt text.
Domain knowledge lives in structured files, not inside natural language.
Every relationship is stored as a weighted edge, not a string.
Every derivation chain is stored as a structured path, not prose.
A system whose knowledge lives in prompts is a beautiful fossil. A system whose knowledge lives in data can grow.

---

## What These Laws Govern

**What must always be true:** The nine laws above.

**What may evolve:** JSON field names, scoring dimensions, exploration budgets, evaluation formats, knowledge file schemas, prompt wording, brain decomposition, number of candidates, scoring weights.

Architecture answers: *what must always be true?*
Implementation answers: *how do we achieve it today?*

Keep these questions separate. The laws are stable. The implementations serve the laws and may change.

---

## Enforcement

These laws are not enforced by a linter. They are enforced by the artifact schemas, the review gates, and the discipline of anyone who touches the system.

When a proposed change violates a law, the change is not modified to comply — the change is rejected until a version that complies is proposed.

No law may be suspended for convenience. No law may be temporarily overridden for a deadline.
If a law creates friction, that friction is the system working correctly.
