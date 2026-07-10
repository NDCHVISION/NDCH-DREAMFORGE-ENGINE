# DreamForge — Architectural Invariants

**Version:** 2.0.3
**Status:** Locked — v2.x COMPLETE

> DreamForge does not optimize for outputs.
> It optimizes for preserving the integrity of reasoning as ideas are progressively compressed into media.

Everything encoded in these laws is a consequence of that principle. When a law seems arbitrary, trace it back to this sentence first. When a proposed change seems reasonable, measure it against this sentence before accepting it.

---

## Layer 1 — Foundational Laws

*These define what DreamForge is. They almost never change. Every subsystem, every model integration, every pipeline version, every future renderer inherits these unconditionally. A change to a Layer 1 law is a change to the definition of DreamForge — not a pipeline update.*

### Identity Law
Brand identity emerges from reasoning, not repeated motifs.

The NDCH identity is not a palette. It is not a geometry. It is not a void background. It is a philosophical commitment — the same reasoning architecture applied across every reel.

Two reels can look completely different and both be unmistakably NDCH if they derive from the same philosophical core. Two reels can share every visual property and still fail to be NDCH if the reasoning behind them is absent.

The identity envelope is defined by the SFM-ELITE axioms. It cannot evolve without an explicit architectural decision recorded in this document.

### Non-Destructive Law
No architectural evolution may break, modify, or invalidate an existing rendered reel.

v1 reels remain valid under v2 architecture. Production artifacts are contracts, not drafts. If a schema change would invalidate existing reels, it requires a versioned fork — not a modification. The pipeline may grow. It may not reach backward and break what it built.

### Geometry over Finish
Structural geometry of a composition takes precedence over surface rendering quality.

A frame with perfect finish that fails its geometric architecture has failed. A frame with adequate finish that achieves its geometric architecture has succeeded. Surface quality — palette accuracy, material rendering, texture fidelity — is never sufficient to pass a render whose spatial geometry fails the Director's specification.

This law prevents the failure mode where excellent AI rendering quality creates the illusion of a passed validation. A beautiful image of the wrong composition is still the wrong composition. Beauty is not a review criterion.

### Physical Primacy Law
Every NDCH visual must first communicate a physical system.

Only after the physical system is understood may philosophical interpretation emerge. If symbolic interpretation precedes physical interpretation, the visual has failed — regardless of aesthetic quality, regardless of whether the symbol was intended, regardless of the Director's intent.

This is the defining characteristic of the NDCH register. Physics is not the subject of NDCH reels. Physics is the language through which philosophy is expressed. The language must arrive first. The philosophy is the second read. If the philosophy arrives before the physics, the specification failed to produce sufficient physical reality.

**Symbol Emergence Check — operational form:** Before accepting any render, ask: *Could a viewer assign symbolic meaning — religious, decorative, cultural — to any element before assigning physical meaning?* If yes: identity_fidelity failure. This check survives every renderer change. It is not a blacklist. A blacklist grows and never closes. This question is the invariant.

If the check fails: revise the upstream specification to produce stronger physical reality. Do not expand the negative constraint list.

### Positive Constraint Law
DreamForge expresses desired physical reality rather than enumerating forbidden imagery.

Positive constraints and negative constraints are not equivalent. A negative constraint activates the concept it forbids in the model's latent space before excluding it. A prompt dominated by negation is a prompt built from concepts the Director does not want — and those concepts are now the loudest signal in the semantic field.

**The crowding principle:** describe the desired physical reality so completely that no signal space remains for unintended patterns to fill. The unwanted behavior becomes unlikely when the desired behavior dominates the semantic field — not because it is forbidden, but because it cannot fit.

Negative constraints are reserved only for persistent, empirically observed model failure modes that positive constraints alone have demonstrably failed to crowd out. They require prior evidence of failure to justify their presence.

**Prompt structure law:** Purpose → Physical state → Composition → Geometry → Camera → Palette → Minimal negation (last, if required). The opening sentence must answer *What is this image?* — not *What does this image look like?* The model weights early context heavily. The answer to *what is this?* must be stated before any other instruction.

**The negative list diagnostic:** if a negative constraint list grows beyond three terms, this is a signal that the upstream representation requires revision — not that the list requires expansion. A growing negative list means the positive constraints have not specified the desired reality strongly enough.

### Translation Law
Every layer translates — it does not restate, summarize, or paraphrase.

Translation means: take the full meaning of the upstream layer and compress it into the register of the current layer. A script that contains technical vocabulary from Concept DNA has not translated — it has copied. Copying violates Translation Law and Separation Law simultaneously.

The translation hierarchy has a distinct voice at each layer:
- **Thinker:** scientific — mechanisms, forces, thresholds, physical laws
- **Script:** philosophical — human experience, consequence, recognition
- **Director:** cinematographic — spatial geometry, surface, light, motion, time
- **Compiler:** engineering — constraints, parameters, model instructions

When vocabulary from one layer appears in the wrong layer, the translation has failed. This is an architectural failure, not a stylistic one.

### Compression Law
Every downstream layer contains fewer explicit ideas than the upstream layer while preserving all meaning.

```
Concept DNA     100%  — all reasoning explicit
Script           40%  — reasoning compressed into language; viewer infers the rest
Visual System    25%  — language compressed into image logic; viewer feels before understanding
Shot List        15%  — image logic compressed into camera and geometry
Runway Prompt     5%  — shot compressed into the minimum words that constrain generation
```

Compression is not reduction of meaning. It is redistribution — from explicit statement to implicit inference. The viewer understands more than the artifact explicitly says. If a layer requires more words than the layer above it, the boundary has been violated. All intelligence flows downstream. None is created downstream.

### Knowledge Separation Law
Prompts are translators. They are not knowledge stores.

Knowledge — doctrine, physical models, invariants, failure lessons, design decisions — belongs in structured data files, invariants documents, knowledge files, creative traces, and coverage maps. Prompts translate that knowledge into renderer instructions at compile time. They do not hold the knowledge themselves.

Knowledge stored in a prompt cannot be extracted, versioned, audited, or inherited without reading and modifying the prompt. Knowledge stored in structured data can be read independently, promoted to invariants, compared across reels, and inherited by future systems that never see the prompts that used it.

**The temptation to resist:** as prompts improve, they begin to feel like the source of quality. They are not. They are the final compression of upstream reasoning. The quality lives in the reasoning. A better prompt is evidence of better upstream structure, not a substitute for it.

**Corollary:** when a prompt contains knowledge that is not present in any upstream structured artifact, that knowledge is orphaned. If it produces a good result, the result is untraceble. If it produces a bad result, the failure is undiagnosable. Both conditions violate the Provenance Law.

### Reversibility Law
Any architectural decision must be reversible without touching production artifacts.

Knowledge embedded in prompts cannot be extracted without modifying the reasoning layer. Knowledge in data files can be upgraded without modifying anything downstream. If a decision cannot be undone without touching production, it requires explicit justification before being made.

Design for reversibility: structure over hardcoding; data over prompts; explicit over implicit.

### Provenance Law
Every downstream artifact must be fully explainable by upstream artifacts.

No layer may introduce information that cannot be traced to an earlier decision. Every rendered frame traces to a Runway prompt → shot_list entry → visual_system decision → concept_dna field → concept_seed. If a visual element cannot be traced, either the upstream artifact failed to constrain it, or the model introduced it. Both are diagnosable. Both require a specific response.

"The render failed" is not a diagnosis. "The render introduced a symbol not present in any upstream artifact because the positive constraint density was insufficient" is a diagnosis.

---

## Layer 2 — Creative Laws

*These govern how each brain reasons. They are about behavior, not implementation. They apply regardless of the renderer, the model, or the medium. They will not change when Runway is replaced with Veo, or when prompts are replaced with node graphs, or when clips are replaced with real-time synthesis.*

### Concept Precedes Script
Meaning must exist upstream of every creative decision.

The pipeline always travels: concept → psychology → physical analogy → symbol → visual system → camera → prompt. No visual decision is made before its semantic justification exists upstream. A prompt is the last thing written, not the first thing imagined. An image generated without upstream reasoning is a guess, not an expression.

### Script Translates
The Script's only job is to translate Concept DNA into human experience.

When a concept can be expressed equally through technical terminology or human experience, the script must favor human experience. "Peak static friction" is technically correct. "The moment that feels like stop" is emotionally correct. The script operates in the emotional register. The Thinker operates in the technical register. A script written in the Thinker's language has not changed layers — it has stayed in the wrong one.

### Director Reveals
The Director reveals what already exists in the upstream specification. The Director does not create.

The camera does not invent drama — it reveals the drama already present in the physical system. A shot that introduces visual elements not traceable to the upstream specification is not creative direction; it is layer violation. The Director's question is always: *What is the camera positioned to reveal about the mechanism?* — never *What would look good here?*

Camera grammar derives from energy state, not cinematographic convention. Movement is not chosen for visual interest. Movement is required by the energy arc or it is absent.

### Compiler Never Creates
The Compiler serializes decisions it did not make.

The Compiler translates the Director's specification into the minimum words that constrain the renderer — without adding, subtracting, or reinterpreting. If the Compiler is introducing visual ideas not present in the shot_list, the Separation Law has been violated. The Compiler is an engineer. Its creativity would be architectural corruption.

### Energy Drives Cinematography
Camera movement and energy state are the same variable expressed in two domains.

Camera grammar must be derived from the energy_arc state defined for each shot — not from cinematographic convention. A camera that moves for visual interest rather than because the energy state demands movement has violated this law.

The five grammars — compression, expansion, rotation, fracture, stillness — are expressions of energy state, not stylistic choices. The reel's kinetic arc is designed as architecture across all shots, not decided shot by shot.

### Relationships Precede Entities
Frames depict interactions before they depict objects. Objects are evidence of relationships.

A frame that shows a single dominant object where a relationship was specified has failed — regardless of how beautifully the object is rendered. Diffusion models optimize for entities. DreamForge must counteract this by specifying relationships as the primary compositional subject.

The correct question is never *What object is in this frame?* It is always *What relationship does this frame depict?*

If the viewer can identify a single dominant subject, the composition has failed.

### Orator Conducts
Narration conducts the visuals. It does not compete with them.

Silence is a first-class structural element — not absence, not padding, not error. It is visual dwell time: the duration the viewer needs to receive a physical state before the next word arrives. A script that speaks continuously across a visual state has not translated into cinematic register — it has remained in prose register.

The Orator is the fifth brain. It does not add words. It does not change philosophy. It governs how words occupy time.

**Orator questions:**
- Where should silence occur — and for how long?
- Where should the voice fragment within a sentence rather than flow?
- Which line deserves the longest post-utterance decay?
- Where should the viewer be left alone with the imagery before the next word arrives?
- Does the narration follow the cinematic grammar of the visual state it accompanies?

**Orator register:** performance — temporal authority, breathing architecture, silence as semantic unit.

**Output artifact:** `voice_direction` block in `script.json`. Fields: `global_rate`, `breathing_points[]` (before/after anchors + silence_ms + visual_state rationale), `fragmentation_directive`, `final_decay_directive`, `narration_visual_grammar` (maps each visual state to its narration behavior).

**Narration-visual grammar table:**

| Visual State | Narration Behavior |
|---|---|
| Observation | One sentence — then silence |
| Accumulation | Fragmented phrases with micro-pauses |
| Threshold | Silence before the line — not after |
| Transformation | Single decisive statement — then long dwell |
| Möbius | Quiet close with maximum decay |

**The failure mode:** a script that is correct in every word but spoken continuously across every visual state. The writing passes. The performance fails. These are different problems with different diagnoses and different fixes. Do not revise the writing to fix a performance failure.

**Pipeline position:** Orator executes after Script approval and before the Director (Visual System). It reads the approved Script and the doctrine, then produces `voice_direction`. The Director reads `voice_direction` when specifying shots — where silence must hold for the visual to communicate without narration, the Director knows this before designing the camera grammar.

**Optimization objective:** maximize semantic absorption, not information transmission. A TTS engine optimizes transmission — it delivers words at an efficient rate. The Orator optimizes retention — it governs the rate at which meaning can be received and held. These are different objectives with different outputs. Transmission asks: how fast can this be said? Retention asks: how much time does the viewer need to understand what was just said before the next thing arrives?

**Silence vs. breathing — a required distinction:**
- *Breathing* = human signal. Makes the voice feel inhabited. Not the primary tool here.
- *Silence* = cognitive space. Gives the viewer time to think. The Orator's primary tool.

DreamForge is not trying to make ElevenLabs sound more human. It is giving the viewer cognitive space to receive the visual state. The distinction matters because breathing can be automated from TTS tuning; silence must be architecturally placed.

**The Orator is deterministic, not intelligent.** It does not rewrite. It does not improvise. It does not add philosophy. Its outputs are: breathing_points, silence durations, cadence directives, fragmentation instructions, emphasis placement, decay lengths. All of these are derivable from the upstream Script and shot_list. An Orator that rewrites has violated the Separation Law. An Orator that adds meaning has violated the Compiler law. The Orator has one job: performance direction, executed without creation.

**Performance metrics (future measurement):**
```json
{
  "performance_metrics": {
    "mean_phrase_duration_seconds": "average time per spoken phrase",
    "mean_silence_duration_seconds": "average duration of architectural silence points",
    "semantic_density": "words per second of visual dwell time",
    "visual_overlap_score": "fraction of video duration where narration is active",
    "final_decay_seconds": "silence duration after final spoken word"
  }
}
```
When these are measured across reels, performance intent becomes testable. A reel with `visual_overlap_score > 0.8` has not given the visuals room to breathe.

**The failure mode:** a script that is correct in every word but spoken continuously across every visual state. The writing passes. The performance fails. These are different problems with different diagnoses and different fixes. Do not revise the writing to fix a performance failure.

### Exploration Precedes Selection
The engine must explore before committing.

No layer may select the first acceptable option as the final option. The exploration budget is an implementation parameter — it may be tuned per-concept complexity. The law is absolute: search must occur. The extent of search is implementation. A system that presents one option and declares it selected has not searched — it has guessed with extra steps.

### Confidence Must Be Exposed
The system must show its reasoning, not just its outputs.

Every decision carries confidence. That confidence must be exposed — through scoring, through rejection rationale, through explicit promotion decisions. Rejected candidates carry more signal than selected ones. A system that only records winners cannot learn from its reasoning.

Silence is a violation of this law. An observation with no promotion decision violates this law. A promotion with no mutation violates this law. "It looked right" is not a confidence level.

---

## Layer 3 — Operational Laws

*These are empirical discoveries. Some will graduate to Layer 1 or 2 as they prove model-agnostic and foundational. Some will be retired as models improve and the specific limitation they address no longer applies. Every operational law carries its origin story — if the origin no longer applies, the law is a candidate for retirement. Not every learning event becomes an invariant. Some are model quirks. The promotion decision is what separates learning from noise.*

### Editorial Assembly Law
*Graduated from LE-003, NDCH_017. Confirmed model-agnostic.*

Some semantic transitions cannot be faithfully represented by a single generative inference.

When a shot requires a hard state transition across distinct physical states — states whose latent representations are incompatible within a single generation — DreamForge composes multiple generated artifacts through editorial assembly rather than forcing a single model instance to express incompatible states.

The edit point is a first-class creative decision, not a technical compromise. Editorial assembly is the correct architectural unit for state-reset shots.

**Why this law survives model changes:** a single generation has a latent state trajectory. It begins at the seed state and resolves toward a coherent endpoint. An editorial cut allows independent latent state initialization. These are different things — not a limitation of current models but a consequence of how sequential generation works. Veo, Gen-5, and Unreal all produce sequential frames from a latent trajectory. The limit is architectural, not capability-based.

**Application:** any shot requiring a hard state transition should be decomposed into two seeded generations stitched at editorial. The seed gives each generation its state. The edit gives the sequence its transition.

### Validation Gate Law
*Formerly Law 13. Retained in Layer 3 because the specific validation artifacts evolve per-project.*

Every stage output must satisfy deterministic acceptance criteria before the downstream stage begins.

Acceptance criteria are not matters of taste — they are derivable from upstream artifacts. A stage output that looks correct but fails its mechanism test has failed. A stage output that looks unusual but passes its mechanism test has passed.

**The diagnostic imperative:** *The pipeline is complete when it can answer — why did this stage output fail?* If the answer is "we don't know," the pipeline is not complete.

Review questions must be answerable yes or no. "Does this look good?" is not deterministic. "Could a viewer infer the mechanism without narration?" is deterministic.

When a clip fails: find the upstream artifact that failed to constrain the condition. Revise that artifact. Do not patch the prompt with adjectives.

### No Orphaned Learning
*Formerly Law 14. Retained in Layer 3 because the promotion structure evolves per-project.*

A completed project must not leave learning trapped inside the project artifact.

Every captured lesson must be reviewed for promotion, rejection, or future search. If accepted, it must mutate a pipeline artifact. If rejected, the rejection must be explicit with rationale. A system that learns without inheriting has not learned — it has merely remembered. Remembering is not learning.

### Temporal Compression Law
*Adopted as explicit design decision after NDCH_017, resolving undecided runtime constraint. Layer 1 promotion candidate after 018–020 observation.*

DreamForge optimizes for complete transmission of a doctrine. Runtime is determined by the minimum duration required for the doctrine to remain intelligible. Additional time may only exist if it increases semantic transmission. Never pad for target duration.

Runtime is an emergent property of the doctrine — not a production target. Different doctrines require different durations. A doctrine with two beats naturally runs shorter than a doctrine with five. Compressing the longer to match the shorter distorts the doctrine. Padding the shorter to match the longer produces silence that carries no meaning.

**Policy:**

```json
{
  "runtime_policy": {
    "minimum_seconds": 34,
    "preferred_range": [36, 42],
    "hard_maximum": 45,
    "padding_allowed": false,
    "semantic_completion_required": true
  }
}
```

`padding_allowed: false` is the load-bearing field. A reel that ends before the doctrine is complete has failed. A reel that continues after the doctrine is complete has also failed — it has added time that dilutes transmission.

**NDCH_017 runtime verdict:** 38.25 seconds — PASS. Not because 38.25 is the standard. Because 38.25 was the amount of time the friction doctrine required to completely transmit itself. No action required.

**Standardization prohibition:** Do not adopt a fixed runtime target from a single data point. 017 is one doctrine. Its natural duration does not define the system's preferred duration. The architecture does not prefer any duration. The architecture requires semantic completion.

**Future capability (search_path):** The Thinker should eventually estimate runtime as a consequence of concept reasoning:

```json
{
  "estimated_runtime": {
    "reasoning": 39.2,
    "confidence": 0.86,
    "drivers": ["extended threshold", "minimal narration", "long observational hold"]
  }
}
```

Runtime becomes another consequence of reasoning. Requires corpus of completed reels to calibrate.

---

## Pipeline Architecture

```
1.  Concept DNA          — reasoning made explicit; portable data
2.  Script               — reasoning compressed into language
2.5 Orator               — performance direction; silence, breathing, temporal authority
3.  Visual System        — language compressed into image logic
4.  Shot List            — image logic compressed into camera and geometry
5.  Production JSON      — shot decisions serialized without new creation
6.  Render Validation    — per-clip acceptance contracts defined before rendering
7.  Generated Clips      — renderer executes against contracts
8.  Editorial Assembly   — clips assembled into locked visual cut; no new creative decisions
9.  Audio Assembly       — narration synthesized (with voice_direction applied), mixed, overlaid
9.5 Audio Validation     — final export must pass audio gate before reel is declared complete
10. Learning Update      — findings mutate the pipeline permanently
```

**Five-Brain Question Map — the architectural declaration:**

| Brain | Question |
|---|---|
| Thinker | What is true? |
| Script | How is it expressed? |
| Orator | How is it experienced? |
| Director | What must be revealed? |
| Compiler | How is it translated? |

Each brain answers exactly one question. A brain that answers two questions has violated the Separation Law. A brain that answers zero questions is noise. This map is the test: if you cannot assign a proposed decision to exactly one brain's question, the decision is either misplaced or the architecture has a gap.

**The sixth brain prohibition:** Do not add a sixth brain until the five-brain architecture has failed to generalize across three consecutive reels. A proposed sixth brain that cannot be named with a single question of the form above is not a brain — it is a feature that belongs inside an existing brain. The architecture grows by deepening existing brains, not by adding new ones.

**H-018 — Generalization Experiment:**
Run NDCH_018 through the five-brain architecture exactly as it exists, with a doctrine from a different physical vocabulary (fluid mechanics, erosion, resonance, orbital mechanics). Pass criteria: zero new architectural laws, zero new Director laws, zero Compiler redesign, Creative Coverage expands. If 018 passes: the architecture generalizes. That is the milestone worth protecting. Everything else waits for evidence.

**Stage 9 artifact:** `assemble-audio.ts` — reads `script.json`, calls ElevenLabs TTS (voice ID from script, with-timestamps endpoint), applies EQ and LUFS normalization, mixes ambient music at -18dB with fade-in/fade-out, overlays onto the locked visual cut, outputs `{REEL_ID}_final.mp4`.

**Stage 9.5 hard rule:** No reel may be declared COMPLETE unless `{REEL_ID}_final.mp4` passes all Audio Validation Gates:
- Audio stream present in final export
- Audio duration covers ≥ 90% of video duration
- Silent export only permitted if `silence_intentional: true` is declared in `script.json`

This rule closes the gap that produced `NDCH_017_complete.mp4` with no audio stream. The modular render pipeline (`render-s*.ts`) bypasses the legacy integrated pipeline (`generate-reel.ts`) entirely. Stage 9 is not optional — it is a required bridge.

Stage 10 has three required sub-phases: **Learning Capture → Promotion Decision → Pipeline Mutation.** An observation without a promotion decision is amnesia. A promotion decision without a mutation is a broken promise.

---

## Structure Generates Quality

*Derived from Phase 2C validation architecture, NDCH_017. Applies beyond DreamForge.*

**Structure generates quality. Adjectives attempt to imitate quality.**

When something is missing from the output — weight, precision, mythic gravity, emotional resonance — the instinct is to add a descriptor. A word that names the property you want.

That instinct is wrong.

Adding "mythic severity" to a prompt is not mythic weight. It is a request for the renderer to simulate the property the upstream architecture failed to produce. The adjective is evidence of a structural failure, not a solution to it.

The correct response to absent quality is to find the upstream artifact that failed to constrain the condition. Fix the structure. The quality emerges from the structure, not from naming it.

**Corollary:** If a quality can only be achieved by naming it, the structure that produces it does not exist yet. Build the structure. Do not name the gap.

---

## Enforcement

These laws are not enforced by a linter. They are enforced by the artifact schemas, the review gates, and the discipline of anyone who touches the system.

When a proposed change violates a law, the change is not modified to comply — the change is rejected until a version that complies is proposed.

No law may be suspended for convenience. No law may be temporarily overridden for a deadline. If a law creates friction, that friction is the system working correctly.
