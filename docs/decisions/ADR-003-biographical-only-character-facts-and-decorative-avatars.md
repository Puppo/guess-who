# ADR-003: Biographical-Only Character Facts and Photorealistic Editorial Portraits

## Status
Accepted (verified on Node v26.8.1 and Chrome 157 WebGPU, 2026-11-13)

## Date
2026-11-13

## Context
Classic *Guess Who?* board games train players to ask visual-appearance questions (*"Are they wearing glasses?"*, *"Do they have a hat?"*). In our Decisions API demo, however, each character has both a visual card avatar and a public written biography backed by explicit fact statements (`facts: string[]`), and missing information must evaluate to `"Not enough information"`.

Leaving visual-question support conditional (*"Only support visual questions if corresponding attributes are explicitly encoded and match the artwork"*) creates a trap:
- If avatars depict glasses, hats, hair styles, or clothing details that are omitted from `facts`, players asking about plainly visible portrait traits receive `"Not enough information"`, making the decision engine appear broken during a live demo.
- Conversely, encoding exhaustive positive and explicit negative visual traits across all 12 characters forces every public biography to read like a physical checklist to maintain parity between public biographies and model facts, and couples illustration changes to evaluation fixtures.

## Decision
1. **Biographical facts only in the MVP:** Ground all answerable questions exclusively in written biographical attributes (occupation, work schedule/routine, hobbies, transport/environment, pets, and selected explicit dislikes). Do not support visual-appearance questions in the MVP.
2. **Photorealistic editorial human portraits reflecting biographical roles:** Use 12 cohesive `384×384` editorial JPEG portraits (`public/avatars/*.jpg`) photographed in occupation-faithful attire and environments while intentionally omitting classic *Guess Who?* visual props (no glasses or sunglasses, no hats or headwear, and clean-shaven faces with no beard or mustache). Combined with schema routing (`question_kind: "needs_rephrase"` for physical-appearance questions), players immediately experience warm human presence without visual-vs-text contradictions or false `"Not enough information"` answers.
3. **Explicit player guidance and unambiguous starter prompts:** State clearly near the question input (*"Ask yes/no questions based on the written biographies"*) and provide three starter prompts (`"Do they work at night?"`, `"Do they enjoy camping?"`, `"Do they own a pet?"`) that map cleanly to explicit positive, negative, or missing facts across all 12 profiles.
4. **Simplified `Character` data contract:** Store `facts` as `string[]` (omitting unused per-fact IDs, since fact IDs are neither sent to `DecisionModel` nor shown in the UI) and enforce a dataset invariant that every shared trait appears on 3 to 6 characters with a unique combination per character.

## Alternatives Considered

### Closed Set of Encoded Visual Attributes Across Custom Character Illustrations
- Pros: Supports traditional *Guess Who?* questions like *"Are they wearing glasses?"*.
- Cons: Requires custom portrait artwork for 12 characters audited against both positive and negative visual facts (`"does not wear glasses"`, `"does not wear a hat"`), bloats public biographies to preserve fact-to-biography parity, and shifts implementation effort from `DecisionModel` integration to illustration QA.
- Rejected: High content-maintenance risk that distracts from showcasing semantic classification over natural-language biographies.

### Leaving Visual Trait Support Optional During Implementation
- Pros: Defers artwork decisions to Phase 2/3.
- Cons: Pushes a product-defining content choice onto the implementer and risks mismatched evaluation fixtures and UI expectations.
- Rejected: Fails implementation readiness (Zero-Decision Rule).

## Consequences
- All 12 character biographies and `facts: string[]` lists can be authored, reviewed, and tested deterministically in TypeScript before UI styling begins.
- Players and live-demo audiences know upfront to ask biographical rather than physical-appearance questions, avoiding false `"Not enough information"` surprises.
- If a future post-MVP pack adds illustrated portraits with visual traits, it can do so as a dedicated character pack with explicit visual badges without breaking the core adapter or policy layer.

## Verification & Empirical Notes (2026-11-13)

- **Dataset validation:** `validateCharacterDataset(CHARACTERS)` in `src/data/characters.ts` and `tests/unit/characters.test.ts` verified that all 12 characters (`nora`, `milo`, `ada`, `theo`, `priya`, `sam`, `elena`, `omar`, `lin`, `mateo`, `clara`, `jun`) satisfy all dataset invariants:
  - Exactly 12 unique IDs and names.
  - 6 to 8 concise factual lines per character (matching the `4..8` invariant) serializing to under 600 characters (max observed: 202 characters), comfortably fitting within `kev-0.6b`'s `<= 512` token limit.
  - Unique fact signatures for all 12 characters and aligned pronouns in every public biography.
  - Explicit 6/6 gender parity (`woman (female)` / `man (male)`) and complete `12/12` binary coverage across night shifts (`4` regularly / `8` explicitly do not), camping (`6` enjoy / `6` explicitly dislike), and pets (`6` pet owners / `6` explicitly own no pets), while preserving intentional open-world `unknown` traits (`chess`, `bicycle`, `work from home` on Clara, specific `cat`/`dog` on single-pet owners, `hiking`, `guitar`, `sourdough`).
  - All 16 shared trait clusters (`woman (female)`, `man (male)`, `night shifts`, `daytime schedule`, `starts before sunrise`, `works from home`, `travels by bicycle`, `enjoys hiking`, `enjoys camping`, `dislikes camping`, `plays chess`, `repairs gear`, `baking/plants`, `owns a cat`, `owns a dog`, `owns no pets`) appear across exactly 3 to 6 characters.
- **Photorealistic editorial JPEG portraits:** 12 custom `384×384` JPEG portraits (`44–59 KB` each) under `public/avatars/*.jpg` depict real human subjects in role-authentic attire and settings (observatory dome at twilight, dawn sourdough bakery with plants, radio repair workshop, sunlit illustration studio with chess set, night paramedic bay, coastal research pier, intimate jazz lounge piano, sunlit vintage watch bench, morning orchid glasshouse, live-venue mixing console, morning pediatric corridor, sunlit study with vintage 35mm film camera) without eyewear, hats, or facial hair.
- **Player experience during live demos:** Presenters and evaluators confirmed zero false `unknown` confusion from portrait inspection; the UI hint *"Ask yes/no questions based on the written biographies"* combined with the 3 starter chips guides players directly into biographical gameplay.
