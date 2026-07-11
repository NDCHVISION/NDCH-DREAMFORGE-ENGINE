# DreamForge Pipeline Changelog

Human-readable evolution of the pipeline. This is not a git log — it records *why* changes happened, not just what changed. Git records what. This records why.

---

## v2.0.3 — The Orator / Performance Preservation Milestone
*NDCH_017 post-publication retrospective — 2026-07-04*

### The Milestone
DreamForge previously preserved **reasoning**. It now preserves **performance intent**. These are different artifacts. Performance intent has traditionally disappeared between script and render — it exists in the director's head and is lost as soon as narration is sent to TTS. LE-011 makes it explicit, persistent, and inspectable.

### What Changed
**Fifth brain declared: the Orator.**

Five-brain architecture now complete:

| Brain | Question |
|---|---|
| Thinker | What is true? |
| Script | How is it expressed? |
| Orator | How is it experienced? |
| Director | What must be revealed? |
| Compiler | How is it translated? |

Each brain answers exactly one question. The architecture is now clean.

**Root cause diagnosed:** 017's narration ran 19.6s against a 38.25s visual. The silence pooled at the end because there was no mechanism for distributing it architecturally. The diagnosis was: not a writing failure — a performance failure. The Orator is the correct fix.

**New output artifact:** `voice_direction` block in `script.json`. Fields: `global_rate`, `breathing_points[]` (before/after anchors + silence_ms + rationale), `fragmentation_directive`, `final_decay_directive`, `narration_visual_grammar`.

**Optimization objective locked:** maximize semantic absorption, not information transmission. A TTS engine transmits. The Orator governs retention.

**Silence/breathing distinction encoded:** silence = cognitive space (primary tool); breathing = human signal (secondary). DreamForge needs silence, not breathing.

**Performance metrics schema defined** (future measurement): `mean_phrase_duration`, `mean_silence_duration`, `semantic_density`, `visual_overlap_score`, `final_decay_seconds`. When measured, performance intent becomes testable.

### What Did Not Change
- No new Runway prompts
- No new visual laws
- No new script philosophy
- No new compiler logic
- Zero architectural laws added to handle NDCH_017's specific content

### The Stop Instruction
The five-brain architecture is now complete. Do not add a sixth brain. The sixth brain prohibition is encoded in DREAMFORGE_INVARIANTS.md: a proposed sixth brain that cannot be named with a single question of the form "How is it X?" is not a brain — it is a feature that belongs inside an existing brain.

### H-018 — The Generalization Experiment
Run NDCH_018 through five-brain architecture with a doctrine from a different physical vocabulary. Pass criteria: zero new architectural laws. If 018 passes, the architecture generalizes. That is now the experiment worth protecting.

---

## v1.0.0 — Initial Pipeline
*Established during DreamForge 1.0 — 2.0 era*

- Four-Brain Architecture: Thinker → Designer → Director → Compiler
- Laws 1–9 established (Provenance, Non-Destructive, Reversibility, Separation, Semantic Before Visual, Identity Envelope, Search Before Commit, Learning, Data Portability)
- Stage sequence: Concept DNA → Script → Visual System → Shot List → Production JSON → Clips → Assembly → Output

---

## v1.2.0 — Translation Layer Laws
*Added after script v1 rejection, NDCH_017 (Phase 1B review)*

**Why:** Script v1 was written in the Thinker's vocabulary — "static friction," "surface," "threshold" appeared verbatim. It was technically correct but emotionally wrong. The failure revealed that the handoff between layers had no formal compression requirement.

- **Law 10 added:** Translation Compression — script must compress Concept DNA, not restate it
- **Law 11 added:** Emotional Before Technical — script operates in emotional register; Thinker operates in technical register
- **Law 12 added:** Compression — each downstream layer encodes fewer explicit ideas while preserving all meaning; explicit compression ratios defined (100% → 40% → 25% → 15% → 5%)
- Added anchor sentence: *"The Thinker thinks like a scientist. The Script speaks like a philosopher. The Director sees like a cinematographer. The Compiler behaves like an engineer."*

---

## v1.3.0 — Validation Gate + Pipeline Map
*Added after production JSON compilation, NDCH_017 (Phase 2C)*

**Why:** Proceeding from production JSON directly to renders had no deterministic acceptance criteria. A failed render would produce the question "does this look right?" instead of "did the renderer satisfy the contract?" That is a subjective question and cannot be diagnosed to a specific upstream artifact.

- **Law 13 added:** Validation Gate — every stage output must satisfy deterministic acceptance criteria before the downstream stage begins; the diagnostic imperative: "The pipeline is complete when it can answer: why did this stage output fail?"
- **Pipeline map added:** Stages 1–10 explicitly defined in DREAMFORGE_INVARIANTS.md
- **Stage 9 added:** Render Validation as a formal pipeline stage
- **Mythic weight formalized:** Defined as six design properties (scale hierarchy, irreversibility, silence, geometric inevitability, absence of distraction, temporal gravity) with failure modes — not style adjectives
- **Meta-principle added:** "Structure generates quality. Adjectives attempt to imitate quality." Documented as an NDCH-wide principle applicable beyond DreamForge.

---

## v1.4.0 — No Orphaned Learning
*Added after Stage 10 architecture review, NDCH_017*

**Why:** learning_update.json predated the Observation → Lesson → Promotion → Mutation model. It was a notes file with mutation targets, not a pipeline with promotion decisions. A system that captures observations without forcing promotion decisions will drift back to pipeline amnesia — the next project doesn't inherit what the previous one learned.

- **Law 14 added:** No Orphaned Learning — every accepted learning event must mutate a target artifact or be explicitly rejected with rationale; silence violates the law
- **pipeline_learning.json adopted:** Stage 10 artifact with pre-declared learning events, promotion types, no-orphan rule, and versioning requirement
- **learning_update.json retired:** Marked deprecated; superseded by pipeline_learning.json
- **Stage 10 defined:** Learning Capture → Promotion Decision → Pipeline Mutation; pre-declared before rendering begins, not after
- **PIPELINE_CHANGELOG.md introduced:** This file; human-readable evolution record

**Status: FROZEN** — no new architecture until NDCH_017 renders complete and the first pipeline_learning event is filled.

---

## v1.5.0 — Hero Object Ban + Relationship Composition
*Promoted from LE-001, NDCH_017 S1 FAIL render*

**Why:** S1 v1 render produced a premium geometric crystal sculpture (9.5/10 as AI art) that completely failed the Director's specification (FAIL for architecture). The Director specified "viewer placed inside the contact zone." The render placed the viewer outside, looking at a hero object. Root cause: shot_list.json S1 direction said "match head occupies 70% of frame" — this designated a single dominant subject. The lesson: diffusion models optimize for entities, not relationships. A prompt designating a primary subject will produce a hero object regardless of secondary elements mentioned.

- **Hero object ban added** to visual_system.json `what_the_director_must_not_do`: "The frame must not contain a single isolated subject. The frame must depict a relationship."
- **S1 shot_list.json completely revised**: new objective — reveal the microscopic interface where stored potential exists; both surfaces equal compositional weight; camera inside the gap not outside looking at an object
- **S1 production prompt revised** in NDCH_017_FRICTION.json: relationship-first framing; gap as compositional subject; both surfaces equal; explicit camera lock prohibition
- **render_validation.json S1 updated**: new must_show (both surfaces, gap as focal plane), new must_not_show (single dominant subject), new review questions targeting relationship vs. object
- **LE-001 recorded** in pipeline_learning.json: accepted, promoted to visual_constraint + shot_rule + prompt_rule
- **Generalizable principle:** "Relationships render better than abstractions in diffusion models. Specify Crystal A interacting with Crystal B through contact interface — not Crystal A with Crystal B nearby."

---

## v1.6.0 — Kinetic Arc + Forensic Register Constraint
*Promoted from LE-001B, NDCH_017 S1 v2 PASS*

**Why:** S1 v2 PASSED validation (8.9–9.2/10). The relationship-first composition worked — hero object ban held, camera static, gap as compositional subject. However, the review identified a distinction the pipeline had not yet formalized: the difference between an **observational** render and a **forensic** render. S1 v2 is observational ("I am watching") not forensic ("I am examining evidence"). The gap reads clean and beautiful when it should read charged and dangerous — "stored consequence," not empty space. Separately: the Director was deciding movement shot by shot. There was no pipeline structure that defined movement as a narrative arc across the whole reel. Both gaps are now formalized.

- **Kinetic arc field added** to visual_system.json: five states across S1–S5 (latent → accumulating → threshold → release → equilibrium). Movement is now designed as reel-level architecture, not shot-level adjective.
- **Forensic register constraint added** to visual_system.json: defines the target register ("forensic"), the failure register ("observational"), and what produces each — micro-evidence of physical force (stress whitening, lattice distortion, pressure lines), not decorative particles.
- **render_validation.json S1 updated** to PASS with full v2 pass notes and residual observations.
- **LE-001B recorded** in pipeline_learning.json: S1 v2 PASS learning captured, promoted to visual_constraint + search_path.
- **Generalizable principle:** "A beautiful composition is not the same as a forensic composition. Restraint without evidence produces aesthetic distance, not investigation. The viewer should feel like a scientist examining a crime scene — not an audience member watching a film."

**Render gate status:** S1 PASSED. S4 gate is now OPEN. Proceed to render-s4-test.ts (Variant A: crystal fracture).

---

## v1.7.0 — Fidelity Categories + Cinematic Grammar Constraint
*Promoted from LE-002, NDCH_017 S4 PASS*

**Why:** S4 Variant A PASSED (9.4/10). The render proved that when geometry remains stable and only the material state changes, the viewer perceives physics rather than visual effects. Two additional architectural gaps were identified from the S4 review: (1) render validation had no structural framework for categorizing what kind of fidelity each question was testing — all questions were at the same level regardless of whether they were testing energy behavior, identity preservation, or model compliance; (2) camera grammar was still being specified shot by shot without a derivation rule constraining it to the energy state.

- **Fidelity categories added** to render_validation.json: five categories (Entity Fidelity, Relationship Fidelity, Energy Fidelity, Identity Fidelity, Model Compliance) as a global validation framework. Future render validation can classify failures by fidelity type, enabling faster upstream artifact diagnosis.
- **Cinematic grammar constraint added** to visual_system.json: five grammars (compression, expansion, rotation, fracture, stillness) with a derivation rule — camera grammar must be derived from energy_arc state, not cinematographic convention. "Do not ask what would look good here."
- **LE-002 closed**: Variant A succeeded. Generalizable principle: keep geometry architecturally stable, change only material state. Crimson must read as internal material property, not arriving effect.
- **Residuals banked as search_path**: microscopic wave asymmetry for future threshold shots; central hub pattern recognition concern for S5 monitoring.
- **Muted test added** to render_validation.json global_validation_questions: the definitive completion check.
- **Energy arc upstream of kinetic arc**: energy_arc is now the source artifact; kinetic_arc derives from it.

**Generalizable principle:** "When the geometry survives and only the state changes, the viewer reads physics. When the geometry changes and the state changes simultaneously, the viewer reads chaos. The discipline is keeping them separate."

**Render gate status:** S4 PASSED. S5 gate is now OPEN. Proceed to render-s5-test.ts. S2 and S3 may be generated in parallel after S5 validation begins (gate rule: S4 must pass before S5; S2/S3 may begin after S1 passes — S1 PASSED).

---

## v1.8.0 — Split-Generation Assembly Rule
*Promoted from LE-003, NDCH_017 S5 FAIL × 2*

**Why:** S5 required a two-part visual narrative: first half sustaining ignition (S4 state), second half cold surface reset (S1 state). Two attempts failed. Seeded from S4 final frame: model animated decorative crystal expansion, ignored two-part structure. Text-only: model produced a compass rose symbol from frame 1, opened cold with no ignition first half. Root cause confirmed: a single Runway Gen-4.5 generation cannot execute a hard visual state reset within one clip. The model collapses multi-state prompts to a single register.

- **Split-generation assembly rule added**: any shot requiring a hard state transition across a single clip must be split into two seeded generations and stitched editorially. Not a prompt failure — a single-generation state-transition limit of Gen-4.5.
- **S5 strategy revised** in shot_list.json: `current_seed_strategy` updated to split-generation stitch
- **render_validation.json S5** updated with decision FAIL and `s5_split_generation_method` documenting S5A + S5B approach with FFmpeg concat command
- **render-s5a-test.ts and render-s5b-test.ts created**: S5A seeds from S4 final frame (ignition residual); S5B seeds from S1 first frame (cold surface / palindrome close)
- **LE-003 recorded** in pipeline_learning.json: accepted, promoted to assembly_rule + shot_rule
- **Generalizable rule:** "Any loop-critical ending requiring hard state reset should be split-generation. Two seeded clips + editorial stitch is not a workaround — it is the correct architectural unit for a state-reset shot."

---

## v1.8.1 — Positive-Crowding Prompt Rule + Symbol Emergence Check
*Promoted from LE-008, NDCH_017 S5A FAIL*

**Why:** S5A v2 prompt used ~40% negation tokens (NO mandala, NOT centered, NO compass, NO six-point, etc.). Despite this explicit blacklist, Runway produced a hexagonal mandala with radial symmetry, bokeh orbs, and a radial gold network — exactly the failures the negation list was written to prevent. Post-failure review by the Director identified the actual failure: the prompt was fighting the model instead of directing it. Diffusion models don't reason; they pattern-match. A prompt dominated by negation reduces positive signal and creates space for model priors to fill. The model filled that space with its highest-probability interpretation of 'crystallographic at post-ignition state' — which is radial geometry. Additionally, the most important instruction was buried at the end: models weight early context heavily.

- **Positive-crowding principle established as prompt_rule**: describe the desired physics so completely that no signal space remains for model priors. The unwanted behavior (radial symmetry, symbolism) becomes improbable when the desired behavior (irregular fracture topology, forensic physical evidence) dominates the semantic field.
- **Prompt structure order is now law**: Purpose → Physical state → Composition → Geometry → Camera → Palette → Minimal negation (last resort only, <10% of token budget)
- **Opening sentence rule**: the first sentence must answer "What is this image?" — not "What does this image look like?" The opening sentence establishes the semantic register everything else builds on.
- **Symbol Emergence Check added** to render_validation.json global_validation_questions: "Could a viewer assign symbolic meaning before physical meaning?" If yes: identity_fidelity failure regardless of visual quality. This question is the invariant. A growing blacklist is not.
- **LE-008 recorded** in pipeline_learning.json: accepted, promoted to prompt_rule + validation_rule

**Generalizable principle:** "DreamForge should not sound like it is arguing with Runway. It should sound like it is describing an inevitable physical reality. That subtle shift will produce more stable generations over time than any negation list."

**Director's formulation (verbatim):** "Positive constraints so strong that the unwanted behavior becomes unlikely."

---

## v1.9.0 — Positive Constraint Law + Physical Primacy Law
*Promoted from LE-008, after Director architectural review, NDCH_017 S5A*

**Why:** The Symbol Emergence Check and positive-crowding principle were first captured in v1.8.1 as a prompt_rule and validation_rule. Director review elevated them beyond implementation guidance: these are not techniques for managing Runway — they are laws about how diffusion models process instruction and about what every NDCH visual must achieve before any other criterion applies. They cannot be bent for a deadline, suspended for convenience, or treated as defaults. That makes them invariants.

**What changed:**

**Law 15 — Positive Constraint Law:** DreamForge prompts maximize positive constraints. Negative constraints are reserved only for persistent, empirically observed model failure modes. A growing negative list is a diagnostic signal — it means the upstream representation has not specified desired physical reality sufficiently. The response is always revision of the upstream representation, not expansion of the list.

The crowding principle: describe the desired physical reality so completely that no signal space remains for unintended patterns to fill.

Prompt structure order is now law: Purpose → Physical state → Composition → Geometry → Camera → Palette → Minimal negation (last). The opening sentence must answer *What is this image?* before any other instruction.

**Law 16 — Physical Primacy Law:** Every NDCH visual must first communicate a physical system. If symbolic interpretation precedes physical interpretation, the visual has failed — regardless of aesthetic quality. The Symbol Emergence Check operationalizes this law: *Could a viewer assign symbolic meaning before physical meaning?* If yes: identity_fidelity failure. This check is the invariant. A blacklist is not.

**Symbol Emergence Check added as structured schema** in render_validation.json: `primary_read`, `secondary_read`, `symbolic_read_before_physical`, `result`. Required for every clip before PASS is assigned. Filled retrospectively for S1 (PASS), S4 (PASS with residual — frame_1 hub noted), S5 attempts (FAIL — compass emblem).

**DREAMFORGE_INVARIANTS.md bumped** to v1.9.0. Laws 15 and 16 added as Addendum.

**Generalizable principle:** *"DreamForge should not sound like it is arguing with Runway. It should sound like it is describing an inevitable physical reality."*

**What this unlocks:** Future reels no longer need to re-discover the crowding principle from scratch. The negative list limit (>3 terms = upstream revision required) is now a machine-checkable diagnostic. The Symbol Emergence Check is now a first-class artifact field, not a retrospective observation.

---

## v2.0.0 — Hierarchical Restructuring + Master Principle
*Director architectural review, NDCH_017. Architecture frozen after this entry.*

**Why:** DreamForge began as a prompt stack. It accumulated techniques. Then it began discovering laws. Laws and techniques are not the same thing — techniques change with models; laws constrain every subsystem, every future renderer, every integration that will ever touch this system. A flat numbered list of laws does not express hierarchy. It implies all laws are equally stable. They are not.

**What changed:**

The invariants are now organized into three layers with distinct stability guarantees:

- **Layer 1 — Foundational Laws:** define what DreamForge is; almost never change; every future system inherits these unconditionally. Contains: Identity Law, Non-Destructive Law, Geometry over Finish, Physical Primacy Law, Positive Constraint Law, Translation Law, Compression Law, Reversibility Law, Provenance Law.

- **Layer 2 — Creative Laws:** govern how each brain reasons; apply regardless of renderer or medium; model-agnostic. Contains: Concept Precedes Script, Script Translates, Director Reveals, Compiler Never Creates, Energy Drives Cinematography, Relationships Precede Entities, Exploration Precedes Selection, Confidence Must Be Exposed.

- **Layer 3 — Operational Laws:** empirical discoveries; may graduate to Layer 1/2 or be retired as models evolve. Contains: Editorial Assembly Law (graduated from LE-003), Validation Gate Law, No Orphaned Learning.

**Master principle added at the top:**
> DreamForge does not optimize for outputs. It optimizes for preserving the integrity of reasoning as ideas are progressively compressed into media.

**New laws in this version:**
- **Physical Primacy Law** (Layer 1): every visual must first communicate a physical system; symbolic interpretation may not precede physical interpretation; Symbol Emergence Check is its operational form
- **Positive Constraint Law** (Layer 1): DreamForge expresses desired physical reality rather than enumerating forbidden imagery; crowding principle; negative list diagnostic (>3 terms = upstream revision required); prompt structure order is law
- **Geometry over Finish** (Layer 1): structural geometry takes precedence over surface rendering quality; beauty is not a review criterion
- **Director Reveals** (Layer 2): camera reveals; does not invent; camera grammar derives from energy state
- **Relationships Precede Entities** (Layer 2): frames depict interactions before objects; objects are evidence of relationships; graduated from LE-001 hero object ban
- **Editorial Assembly Law** (Layer 3): hard state transitions require independent seeded generations stitched editorially; model-agnostic; survives Runway, Veo, Gen-5, Unreal

**DREAMFORGE_INVARIANTS.md version:** 2.0.0

**Architecture is now frozen.** Do not add laws before generating NDCH_017 through NDCH_020. Generate first. Observe. The next architectural session will be evidence-based, not speculative.

---

## v2.0.1 — Temporal Compression Law
*Gap-fill to frozen v2.0.0 architecture. Resolves undecided runtime design question after NDCH_017.*

**Why:** NDCH_017 assembled at 38.25 seconds. The original architecture targeted 45 seconds. Neither became the right answer. The question "should we standardize at 38-40 or 45?" was the wrong question — it was a timing decision masquerading as a systems design decision. The right question was: what does DreamForge actually optimize runtime against?

**Decision — Option C: Semantic Runtime.** Director's formulation:

> *DreamForge optimizes for complete transmission of a doctrine. Runtime is determined by the minimum duration required for the doctrine to remain intelligible. Additional time may only exist if it increases semantic transmission. Never pad for target duration.*

Runtime is an emergent property of the doctrine, not a production target. Different doctrines require different durations. This is consistent with the master principle: the system preserves the integrity of reasoning — it does not compress reasoning to fit a clock.

**Policy encoded:**
- Minimum: 34 seconds
- Preferred range: 36–42 seconds
- Hard maximum: 45 seconds
- `padding_allowed: false`
- `semantic_completion_required: true`

**NDCH_017 verdict under this law:** 38.25 seconds — PASS. No action required. 38.25 was not a failure to reach 45. It was the time the friction doctrine required to complete its transmission.

**What changed:**
- Temporal Compression Law added to DREAMFORGE_INVARIANTS.md Layer 3 (Layer 1 promotion candidate after 018–020)
- runtime_policy JSON structure added as canonical schema for future concept_dna / production artifacts
- estimated_runtime Thinker field added as search_path for future corpus-calibrated runtime prediction
- Runtime decision recorded as closed in PIPELINE_CHANGELOG.md

**Generalizable principle:** Do not adopt fixed targets from single data points. 017 is one doctrine. Its natural duration does not define the system's preferred duration.

---

## v2.x — COMPLETE
*Director declaration after NDCH_017 production and retrospective. Architecture frozen.*

**v2.x objective:** Prove that layered reasoning produces better individual reels. **Status: COMPLETE.**

**Canonical project description (as of v2.x close):**
> DreamForge is a layered creative reasoning system that compiles philosophy into film through auditable transformations.

This is no longer "a reel generation pipeline." The distinction matters for how every architectural decision going forward is evaluated.

**What the moat actually is:**

Not the Thinker. Not the Director. Not the Compiler. Not the prompts.

DreamForge preserves reasoning. Every stage preserves provenance. Doctrine → Concept DNA → Creative Trace → Script → Visual System → Shot List → Compiler → Render → Validation → Learning Event → Invariant. Nothing important disappears. Most creative AI pipelines lose 95% of their reasoning before generation. DreamForge keeps it. That makes it inspectable, teachable, and improvable.

**The biggest milestone (retrospective):**

Not S4. Not S5. Not Temporal Compression.

It was when failures stopped producing prompt edits and instead produced: named law → validation update → architectural consequence. That is when the project changed categories.

**Architecture Stability Index and Ontological Sufficiency:**

The Architecture Stability Index tracks how many architecture-level changes (new laws, new constraints, new validation rules, new schemas) each reel requires. The metric is not measuring stability — it is measuring **representational sufficiency**.

- Stability asks: *Does the architecture stop changing?*
- Sufficiency asks: *Can the architecture explain new phenomena without inventing new categories?*

Those are different questions. The index answers the second one.

When novel doctrines repeatedly fit within existing architectural categories without requiring new laws, the ontology has demonstrated sufficiency for the explored design space. Not "complete" — sufficiency is scientifically stronger. New domains can always emerge. The claim is narrower and therefore more defensible: *sufficient for what has been explored*.

- NDCH_017 baseline: ~14 architecture changes (LE-001 through LE-009, Laws 15–16, v1.5.0 through v2.0.2)
- Target trend: 018 → ~7, 019 → ~3, 020 → ~1, 021+ → 0

**Divergence-Convergence Principle:**

The Architecture Stability Index should be plotted alongside the Creative Coverage Dashboard simultaneously. The relationship between the two graphs is the proof of system health:

```
Creative Coverage (diverging)
↑
|        /
|      /
|    /
|  /
|/___________________________

Architecture Changes (converging)
\
 \
  \
   \
    \______________
```

- If both continue increasing: the architecture is incomplete — new creativity requires new structure.
- If both flatten: the system has stopped learning.
- The healthy system: **increasing conceptual diversity + decreasing architectural modification simultaneously.**

Most creative systems exhibit one of two failure modes: Type A (growing creativity → growing complexity → eventual collapse) or Type B (frozen architecture → frozen creativity → stable but inert). DreamForge's hypothesis is the third type: growing creativity, stable architecture.

**Ontological Compression Ratio:**

```
new doctrines accepted
─────────────────────────────
new architectural laws required
```

- NDCH_017: 1 doctrine / 5 laws = 0.20
- Target 018–030: 13 doctrines / 0 laws = ∞ (asymptotic sufficiency)

When this ratio climbs steeply, the ontology has become sufficient. When it reaches practical infinity — new reels absorbed with zero new laws — the system has transitioned from research to production. Track this starting at 018. Record both numerator and denominator for each completed reel.

**Permanent invariant added:**

Prompts remain translators, not databases. Knowledge belongs in structured data, invariants, knowledge files, traces, and coverage maps. Prompts translate that knowledge into renderer instructions. Knowledge stored in prompts cannot be extracted without modifying the reasoning layer. That temptation will return. Resist it.

**v3.x objective (next):**

Prove that the system improves over a corpus. Success is no longer "017 is better." Success is "after 100 reels the system demonstrably reasons better than after 10." Requires different metrics: Architecture Stability Index, Creative Coverage Dashboard, Doctrine Distance.

**Three things to build in v3.x (in priority order):**

1. **Creative Coverage Dashboard** — immediately implementable, no architecture changes. Physics domains, psychological mechanisms, perceptual anchors. Converts "what should we make?" into "what regions of conceptual space remain unexplored?" Becomes the perception layer for creative search.

2. **Architecture Stability Index** — track starting at 018. Graph becomes evidence of transition from research to production. Very few AI creative systems can demonstrate this.

3. **Cross-reel reasoning** — not memory, reasoning. "Candidate symbol → rejected → already explored in 011 and 017." DreamForge stops remembering and starts composing against its own history. Requires Leap 7 corpus-updating architecture as prerequisite.

**Evaluation (Director's final assessment):**

| Category | Assessment |
|---|---|
| Separation of concerns | A+ |
| Traceability | A+ |
| Failure localization | A+ |
| Extensibility | A |
| Validation philosophy | A+ |
| Creative originality | A |
| Long-term architecture | A+ |
| Generalization | Unproven — that is the next experiment |

**The experiment that matters now — H-018:**

**Hypothesis H-018:** A doctrine derived from a fundamentally different physical vocabulary can be completely represented using the existing DreamForge ontology without modification of architectural laws.

The question is not whether 018 *fits* the architecture. The question is whether the ontology *generalizes* to 018.

**Pass criteria (all must hold):**
- Zero new invariants required
- Zero new Director laws required
- Zero Compiler redesign required
- Zero validation category additions required
- Creative Coverage expands into a previously unexplored region
- Reel remains recognizably NDCH

**Failure conditions:**
- A new law is required → ontology not yet sufficient for this domain
- A new validation category is required → fidelity framework incomplete
- Identity fails despite architectural adherence → Identity Law requires deeper specification

H-018 is falsifiable. The result — pass or fail — is more valuable than a successful reel. A passing 018 proves the ontology generalizes. A failing 018 identifies exactly which category was missing and why. Both outcomes advance the architecture.

Produce five reels with different physical vocabularies (fluid mechanics, erosion, orbital mechanics, phase change, biological adaptation). If all five satisfy H-018: DreamForge has demonstrated that it preserves philosophical identity while expanding creative possibility across fundamentally different physical registers. That is the transition from impressive prototype to genuinely novel creative operating system.

---

## v3.0 Vision — Epistemology Shift (DreamForge 4.0 Roadmap)
*Director retrospective after NDCH_017 production complete. Not yet implemented. Architecture frozen at v2.0.0 pending 018–020 observation.*

**The core shift:**

Before 017, DreamForge was a production pipeline: Concept → Prompt → Runway → Video.

After 017, the architecture is: Doctrine → Reasoning → Physical Model → Perceptual Model → Cinematic Model → Compiler → Generation → Validation → Learning → Architecture.

The render is no longer the endpoint. The architecture is. Every reel feeds the architecture.

**The single most important realization:**

DreamForge 3.0 optimizes for producing one excellent reel. DreamForge 4.0 should optimize for producing an evolving body of work. The reel becomes a byproduct. The knowledge base becomes the product.

> **Roadmap sentence:** *"The goal of DreamForge is not to generate increasingly impressive reels. The goal is to build an increasingly intelligent creative system whose reels become evidence of that intelligence."*

**Three genuinely novel innovations confirmed by 017:**

1. **Failure Localization** — structural failure diagnosis applied to creative output. Instead of "the output wasn't good," DreamForge asks: Thinker? Director? Compiler? Model? Editorial? Validation? That's software engineering applied to creativity. Most creative AI systems do not treat failure with this level of structural discipline.

2. **Physical Primacy** — most AI art asks *What image represents this idea?* DreamForge asks *What physical law makes this idea inevitable?* Those are completely different questions. 017 doesn't illustrate motivation — it reveals physics.

3. **Editorial Assembly Law** — recognized a model limitation as an architectural problem and changed the system instead of the prompt. The discipline of knowing when to stop prompting and restructure.

**Seven-leap roadmap (LE-009):**

| Leap | Description | Implementation Horizon |
|------|-------------|----------------------|
| 1 | Knowledge Graph — corpus-level reasoning across reels | 018-025 |
| 2 | Novelty Optimization — least explored valid symbol, not highest scoring | Requires Leap 7 first |
| 3 | Doctrine Distance — measurable diversity metric in conceptual space | Requires Leap 7 first |
| 4 | Predictive Validation — failure prediction before generation | 018-050 (requires 50+ failure data points) |
| 5 | Creative Coverage Dashboard — tracked physics domains, psychological mechanisms, perceptual anchors | **Immediately implementable** |
| 6 | Quantitative Validation — per-category scoring for trend visibility | 018+ |
| 7 | Corpus-Updating Architecture — each reel updates the knowledge graph, changes future search space | **Load-bearing prerequisite for 2, 3, 4, 5, 6** |

**Five hypotheses resolved by 017:**

1. Does layered reasoning outperform direct prompting? **YES** — improvements traced to reasoning layer changes, not prompt hacks.
2. Can DreamForge learn architectural lessons instead of prompt tricks? **YES** — five transferable laws confirmed.
3. Is validation actually useful? **YES** — validation evolved from surface checks to structural questions.
4. Can failures be localized? **YES** — every failure became attributable to one layer.
5. Does the architecture generalize? **OPEN** — 017 proves one doctrine. 018–025 will test generalization.

**Open design decision — Runtime:**

017 assembled at 38.25 seconds vs. 45-second target.

- Option A: Update DreamForge standard to 38–40 seconds. All downstream updates accordingly.
- Option B: Maintain 45-second target. Intentionally add breathing room via longer shots or silence. Document runtime architecture explicitly.

*This must be decided before 018 concept development begins. Do not let it drift.*

**What to do before 018:**

1. Watch 016 then 017 back to back — as a viewer, not analytically. Write down three things: which stays with you longer, which feels more inevitable, at what moment attention drifts.
2. Decide runtime (Option A or B above).
3. Start Creative Coverage Dashboard (Leap 5 — no architecture change required, only discipline).
4. Choose a doctrine that is visually nothing like 017. Test whether NDCH identity survives a completely different physical vocabulary.

---

## Versioning Rules

| Change type | Version bump |
|---|---|
| New law or structural stage change | Major (x.0.0 → x+1.0.0 or 1.x.0 → 1.x+1.0) |
| New constraint, validation rule, or schema field | Minor (1.4.0 → 1.5.0) |
| Clarification, wording fix, or retroactive documentation | Patch (1.4.0 → 1.4.1) |

A version bump requires: this changelog entry, updated version field in DREAMFORGE_INVARIANTS.md, and a filled pipeline_learning.json event with promotion_decision: accepted if the change was promoted from a learning event.
