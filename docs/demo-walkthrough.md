# Decisions API Presenter Walkthrough Guide (2–3 Minutes)

This live demonstration script guides presenters through a 2-to-3 minute interactive walkthrough of **Guess Who? — Decisions API Showcase**. It demonstrates how the experimental [Decisions API](https://github.com/explainers-by-googlers/decisions-api) (`window.DecisionModel`) and its local WebGPU polyfill (`open-jev@0.1.2` with `onnx-community/kev-0.6b-ONNX`) perform single-pass, non-generative classification directly in the browser.

---

## 1. Pre-Flight Checklist

Before presenting on stage or recording a demo video:

1. **Environment:**
   - Operating System: macOS (Apple Silicon arm64 recommended for WebGPU Metal acceleration) or Linux/Windows with a supported WebGPU device.
   - Node.js: `v26.8.1` (`node -v` matching `.nvmrc`).
   - Browser: Desktop Google Chrome (Chrome 157+) or Chrome Canary with `chrome://flags/#decisions-api` enabled (**"Enabled with All Backends"** recommended to include cross-encoder backends; **"Enabled"** or **"Enabled with EmbeddingGemma V1"** uses the `embedding-gemma-v1` bi-encoder with Schema `v3.1.0`'s anchor-calibrated atomic `Choice` partition, and **"Enabled with Gemma 4 on CPU"** exposes `language-model`).
2. **Warm-Up / Weight Cache:**
   - Launch dev server: `npm run dev` (starts on `http://localhost:5173`).
   - Open Chrome to `http://localhost:5173`.
   - If first run: click `"Initialize & start game"`. The browser will fetch ~383 MB of quantized ONNX weights and compile WebGPU shaders (~2.1s).
   - Once initialized, weights are stored locally in browser cache. Subsequent page reloads and rounds will show `Ready · Polyfill (open-jev · kev-0.6b)` (or `Ready · Native DecisionModel`) immediately without network requests.
3. **Screen Layout:**
   - Use desktop view (`>= 1024px`) to show the 4×3 character grid, question panel, and docked Inspector panel.
   - Locate the persistent header engine badge (`Ready · Polyfill (open-jev · kev-0.6b)`) and the `"Inspector (Show)"` / `"Inspector (Hide)"` toggle button.

---

## 2. Cast Reference

The 12 fictional characters each have 6 to 8 concise, written biographical facts with explicit gender parity (6 women, 6 men), full schedule/camping/pet coverage, and overlapping traits:

| Character | Gender & Occupation | Key Biographical Facts |
| --- | --- | --- |
| **Nora** | Woman · Astronomer | Works onsite at hilltop observatory; regularly works at night; enjoys hiking & camping; owns a cat |
| **Milo** | Man · Baker | Starts before sunrise; explicitly does not work at night; grows indoor plants; travels by bicycle; explicitly dislikes camping; explicitly owns no pets |
| **Ada** | Woman · Mechanic | Explicitly does not work at night; repairs old radios; enjoys camping; owns a dog |
| **Theo** | Man · Illustrator | Works from home; explicitly does not work at night; plays chess; explicitly dislikes camping; explicitly owns no pets |
| **Priya** | Woman · Paramedic | Regularly works at night; travels by bicycle; enjoys distance running; explicitly dislikes camping; explicitly owns no pets |
| **Sam** | Man · Marine Biologist | Daytime hours; explicitly does not work at night; enjoys camping; plays acoustic guitar; owns a cat |
| **Elena** | Woman · Jazz Pianist | Regularly works at night; bakes sourdough bread; lives downtown; explicitly dislikes camping; explicitly owns no pets |
| **Omar** | Man · Accessibility Consultant | Works from home; explicitly does not work at night; repairs vintage watches; enjoys hiking & camping; owns a dog |
| **Lin** | Woman · Botanical Archivist | Starts before sunrise; explicitly does not work at night; grows orchids and herbs; plays chess; enjoys camping; owns a cat |
| **Mateo** | Man · Sound Engineer | Regularly works at night; travels by bicycle; plays acoustic guitar; explicitly dislikes camping; explicitly owns no pets |
| **Clara** | Woman · Pediatric Nurse | Starts before sunrise; explicitly does not work at night; enjoys hiking & camping; bakes pastries; owns both a cat and a dog |
| **Jun** | Man · Technical Translator | Works from home; explicitly does not work at night; plays chess; repairs old film cameras; explicitly dislikes camping; explicitly owns no pets |

---

## 3. Step-by-Step Live Demo Script (2–3 Minutes)

### Phase 1: Game Introduction & First Valid Question (0:00 – 0:45)

> **Presenter Narration:**
> *"Welcome! This is Guess Who?, built to showcase the experimental Decisions API (`window.DecisionModel`). Unlike LLMs or chat interfaces, this model is a compact, single-pass classifier running locally on device via WebGPU. There is no cloud server, no text generation, and no keyword heuristics.*
> *The game selected one of these 12 characters at random. Let's ask our first question using a starter chip."*

1. **Action:** Click the starter chip: `"Do they work at night?"`
2. **Observe in UI:**
   - The question input fills and submits automatically.
   - The response banner immediately returns either:
     - **`"Yes"`** (if the secret character is Nora, Priya, Elena, or Mateo).
     - **`"No"`** (for the remaining 8 characters — Milo, Ada, Theo, Sam, Omar, Lin, Clara, or Jun — who all explicitly do not work at night).
   - The `questionCount` counter increments from `0` to `1`.
3. **Key Point to Mention:**
   - Emphasize that the response was computed in a single forward pass in ~270 ms without generating tokens or calling an external API.

---

### Phase 2: Open-World Grounding & Zero `unknown`-to-`No` Bias (0:45 – 1:15)

> **Presenter Narration:**
> *"In classical LLM prompts or keyword systems, asking about an unmentioned trait often hallucinates 'No'. Let's ask about something unmentioned for most characters to see how the Decisions API handles open-world absence."*

1. **Action:** Type and submit:
   `Does this person bake sourdough bread?`
   *(Alternatively: `Does this person play chess?` or — when not Ada's specific pet — `Does this person own a cat?`)*
2. **Observe in UI:**
   - Unless Elena (who explicitly bakes sourdough bread) is the secret character, the engine returns **`"Not enough information"`**.
   - `questionCount` increments (e.g. to `2`), because this is an accepted factual question that resolved according to game rules.
3. **Key Point to Mention:**
   - The schema splits verification into two orthogonal questions: `supports_yes` and `contradicts_no`.
   - When a trait is simply omitted, both resolve to `false`. The application policy recognizes this as `"Not enough information"` rather than hallucinating `"No"`.
   - In our empirical evaluation over 64 test cases (28 tuning + 36 held-out), this architecture achieved **0 post-policy `unknown`-to-`No` errors**.

---

### Phase 3: Guardrails & Non-Trait Routing (1:15 – 1:45)

> **Presenter Narration:**
> *"What happens if a player tries to bypass the rules, guess a character directly in the text box, or ask a compound question? The Decisions API schema includes a `question_kind` classification head that routes intents deterministically before checking facts."*

1. **Action A (Identity Guess):** Type and submit:
   `Is the secret character Nora?`
   - **Observe:** UI displays: `"To guess a specific character, select their card and confirm 'Make my guess'."`
   - **Crucial Detail:** Notice that **`questionCount` did NOT increment**. Non-trait questions do not penalize the player.
2. **Action B (Compound / Malformed Question):** Type and submit:
   `Do they own a dog and work at night?`
   *(Or a physical appearance question: `Is this person tall with brown hair?`)*
   - **Observe:** UI displays: `"Ask one yes/no question at a time about written biographical traits."`
   - **Crucial Detail:** `questionCount` remains unchanged. `question_kind` classified the input as `needs_rephrase`, protecting the factual heads from evaluating ambiguous compound logic.

---

### Phase 4: Inside the Technical Inspector Panel (1:45 – 2:15)

> **Presenter Narration:**
> *"Now let's look under the hood. Let's expand the Decisions API Inspector to see the raw probabilities and execution telemetry."*

1. **Action:** Click **`"Inspector (Show)"`** (or scroll to the Inspector section).
2. **Point out the Runtime & Timings section:**
   - **Engine Identity:** `Polyfill (open-jev · kev-0.6b)` on `webgpu` (or `Native DecisionModel`).
   - **Round `create()` Duration:** Displayed as **`< 0.1 ms`** (`0.00 ms`). Explain: the weights remain resident in WebGPU memory; creating a new round session only constructs the in-memory schema without reloading weights.
   - **Inference Duration:** ~`270 ms` warm single-pass execution.
3. **Point out the Latest Decision Output:**
   - Show the winning labels and probability bars for:
     - `question_kind` (`trait_question`, `identity_guess`, or `needs_rephrase`).
     - `supports_yes` (`true` vs. `false`).
     - `contradicts_no` (`true` vs. `false`).
   - Note the confidence percentage and the UI label:
     *`Confidence (model score, not guaranteed correctness)`*.
     Explain that confidence is the raw model score, and the application policy gates decisions against calibrated thresholds (`0.50` for intent, `0.50` for facts).
4. **Action (Reveal Context — Spoilers):**
   - Click `<details>` **`"Reveal context — spoilers"`**.
   - **Show:** The exact JSON schema and anonymous fact list passed into `DecisionModel.create()` for this round (e.g., `- Works as an astronomer\n- Regularly works at night...`).
   - Note that the character's name and ID are **never** passed to the model, preventing identity leakage.
   - Note that opening this disclosure is stateless and does not alter the game.

---

### Phase 5: Manual Elimination, Confirmed Guess, and Teardown (2:15 – 2:45)

> **Presenter Narration:**
> *"To finish the game, let's eliminate characters based on our clues and make our final guess."*

1. **Action (Eliminate & Restore):**
   - Click **`"Eliminate"`** on characters that do not match the clues (e.g. if the answer to night work was "Yes", eliminate Milo, Theo, Sam, and Jun).
   - Click **`"Restore"`** on one card and re-eliminate it, showing that card elimination is completely manual and reversible.
2. **Action (Make Guess):**
   - Click **`"Make my guess"`** on your candidate character (e.g. Nora).
   - A modal confirmation `<dialog>` opens: *"Are you sure you want to guess [Name] as the secret character?"*
   - Click **`"Confirm Guess"`**.
3. **Observe Win/Loss Screen:**
   - The round banner displays **`"You won!"`** (or **`"Game over"`**), revealing the secret character, total questions asked, and full biography.
4. **Action (New Game & Teardown):**
   - Click **`"New game"`**.
   - Explain what happened behind the scenes:
     - The previous session was cleanly torn down via `session.destroy()`.
     - Any pending in-flight request was aborted via `AbortController`.
     - A fresh secret character was selected and a new round session was created in `< 0.1 ms`.
     - The card grid and turn history reset for the next player.

---

## 4. Presenter Q&A Reference

### Q: Why not use a small LLM with a prompt like "Answer Yes or No"?
**A:** Generative LLMs generate tokens autoregressively. They are 10–50x heavier in memory and compute, susceptible to prompt injection, do not natively output calibrated option probabilities across multiple parallel questions, and frequently hallucinate on missing information. The Decisions API executes a single forward pass over predefined options in under 200 ms.

### Q: Why does the app say "Not enough information" instead of "No" for unmentioned hobbies?
**A:** Closed-world assumptions assume anything not stated is false. Real human biographies are open-world: Ada owning a dog does not mean she doesn't own a cat. The Decisions API schema verifies both entailment (`supports_yes`) and explicit contradiction (`contradicts_no`) separately, preventing false negatives.

### Q: What happens if someone runs this in an unsupported browser?
**A:** The app detects missing `window.DecisionModel` and missing WebGPU adapters via `navigator.gpu.requestAdapter()`. Instead of falling back to a fake or cloud simulation, it displays an honest unsupported-environment screen with setup instructions.
