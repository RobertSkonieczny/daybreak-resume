# Resume on the water

A first-person rowboat journey through a resume. Row near an island to open its section automatically. A gentle turn of the camera frames its translucent panel while you stay seated in the boat. Closing a section keeps it dismissed until you leave that island and come back. The map offers optional travel shortcuts. Click the contact book in the boat to get in touch, or open the original PDF using “View résumé” in the top right.

## Edit your resume

**Edit [`dist/content/resume.yml`](dist/content/resume.yml), save, then refresh the browser.** No JavaScript edits, package installation, or build step is required. The page reads this YAML file on every reload.

```text
dist/
  content/
    resume.yml          ← Your resume: the only file most authors need to edit
  assets/resume/
    robert-skonieczny-resume.pdf  ← Local copy of the original resume
  resume-data.js        ← YAML validation and safe content rendering
  navigation.js         ← Automatic island layout and proximity detection
  animal-config.js      ← Supported animal species and configuration defaults
  wildlife.js           ← Island wildlife integration, fish jumps, and splashes
  animal-models.js      ← Species proportions, materials, and jointed animation rigs
  animal-motion.js      ← Wandering, grazing, flocking, and boat reactions
  app.js                ← Scene, boat, and first-person camera
  wave-field.js         ← Shared wave physics, wind, buoyancy sampling, and ripples
  lake-water.js         ← Displaced water, reflections, and refraction
  natural-assets.js     ← Local PBR textures, batched conifers, and shoreline details
examples/
  resume.yml            ← Reusable example of every supported section type
scripts/
  validate-resume.mjs   ← Reports mistakes before you refresh
tests/
  resume.test.mjs       ← Content and navigation behavior checks
  waves.test.mjs        ← Wave geometry, buoyancy, wind, pause, and splash checks
  wildlife-motion.test.mjs ← Roaming, boundaries, obstacles, separation, and pause
```

`profile` holds your name, headline, location, introduction, email, optional phone number, links, optional `resume_pdf` path, and optional `education`. About and the contact book both use it, so information is only edited once. Contact lives in the book; it has no island. Adding education to `profile` shows it within About, so it does not need a separate island.

`sections` is an ordered list. Each enabled section becomes a lake island, a route button, a map marker, and a floating content panel. Reorder this list to change the journey. Give every section a unique `id`. Set `enabled: false` to hide a section without deleting it. Keep between 1 and 12 enabled sections. An optional `label` gives a long title a shorter navigation label.

| `type` | Content fields | Useful for |
| --- | --- | --- |
| `about` | Uses `profile`; optional `story_title`, `paragraphs` | Introduction and interactive career path |
| `experience` | `items`: company, role, period; optional id/focus/overview/stories/team/location/technologies/highlights/url | Jobs and case studies |
| `projects` | `items`: name, description, optional period/technologies/highlights/url | Selected work |
| `skills` | `groups`: category and items; optional `featured` | Technologies connected to examples from your work |
| `education` | `items`: institution, degree, optional location/period/highlights/url | Education and certifications |
| `text` | `paragraphs`, optional links | Volunteering, awards, interests, or another custom section |

Every section can also have an optional `intro` paragraph and an `animals` list. Existing `contact` sections are supported for compatibility but do not create an island; the book always uses `profile`.

Experience entries become selectable company cards. Visitors can use the left/right arrow keys to switch companies. Jobs with `stories` offer a case-study selector and tabs for the challenge, contribution, and impact; all original highlights remain available under “Full role details.” Jobs without stories retain the contribution-by-contribution view. Adding or reordering jobs in YAML automatically updates the cards.

### Add a job

Copy an existing entry under the Experience section's `items`, preserving its indentation:

```yaml
      - company: Company Name
        role: Your Job Title
        period: "2024 — Present"
        technologies: [Python, SQL]
        highlights:
          - Describe your contribution and its result.
```

### Turn a job into a story

Keep jobs in most-recent-first order. About shows their career path in reverse order. A short `focus` labels each stage; `overview` explains the role in plain language. Optional IDs make links to a role stable when jobs move.

Add the following fields to a job (alongside `company`, `role`, and `period`):

```yaml
        id: your-company
        focus: Infrastructure
        overview: A sentence about the people or decisions your systems supported.
        stories:
          - id: your-project
            title: A specific piece of work you want to explain.
            label: Short picker label
            summary: What you built and why it mattered, in one sentence.
            challenge: Explain the problem and what was at stake.
            work: Describe your own contribution and the decisions you made.
            result: State the outcome, keeping any important qualifications.
            technologies: [Python, SQL]
            # Optional: omit the metric when no meaningful number is available.
            metric:
              value: "Your result"
              label: Enough context to understand the result accurately
```

Each story needs a unique `id` within its job plus `title`, `summary`, `challenge`, `work`, and `result`. `label`, `metric`, and `technologies` are optional. Keep numeric metric values quoted. Distinguish potential savings from realized savings, and contribution to an outcome from sole responsibility for it.

Skills automatically connect to matching `stories[].technologies`, falling back to a job's `technologies`. Clicking an example takes the boat to that job and opens the selected story. `featured: Python` on a skills section chooses its initial selection; that technology must appear in the section's groups. Skills without a matching role remain listed under “Also in my toolkit.” The site does not invent project connections. Without experience data, skills display as simple grouped lists.

To include education within About:

```yaml
profile:
  # Keep your other profile fields here.
  education:
    - institution: Your University
      degree: Your Degree
      # Optional: location and quoted period.
```

An About section's optional `story_title` introduces the career narrative. Its `paragraphs` appear under “Where I focus.” The reusable example also demonstrates the standalone Education section if you prefer a separate island.

### Add another island

Add another entry to `sections`. For example:

```yaml
  - id: volunteering
    type: text
    title: Volunteering
    paragraphs:
      - Describe your volunteer work here.
    links:
      - label: Organization
        url: https://example.com
```

The current resume includes a disabled Projects section. Fill in its `items`, then change `enabled: false` to `enabled: true` when you are ready. [`examples/resume.yml`](examples/resume.yml) has complete examples for all section types and can replace the content file when adapting the site for someone else.

### Add a company icon

Put an SVG, PNG, WebP, JPG, GIF, or ICO image in `dist/assets/companies/`. Add its path to the company's experience entry:

```yaml
      - company: Your Company
        logo: assets/companies/your-company.png
        logo_background: light
        role: Your Job Title
        period: "2024 — Present"
```

`logo_background` is optional and accepts `light` (the default), `dark`, or `transparent`. A full `https://` image URL also works. Local images stay available without contacting a third-party server. If the image is omitted or cannot load, the badge shows company initials. `npm run validate` checks that referenced local images exist.

The included company assets and their original sources are listed in [`dist/assets/companies/SOURCES.md`](dist/assets/companies/SOURCES.md).

### Keep your PDF local

Put your PDF in `dist/assets/resume/` and set its path under `profile`:

```yaml
profile:
  # Keep your other profile fields here.
  resume_pdf: assets/resume/your-resume.pdf
```

Use a filename with letters, digits, hyphens, or underscores. The top-right button opens this local file in a new browser tab. Remove `resume_pdf` to hide the button. `npm run validate` checks that the PDF exists. Updating YAML does not rewrite the PDF; replace the PDF file when your original resume changes.

### Choose the animals on each island

Add an `animals` list to any section:

```yaml
  - id: about
    type: about
    title: About
    animals:
      - species: rabbit
        count: 2
        scale: 1.2
      - species: turtle
```

Available species: `rabbit`, `fox`, `duck`, `deer`, and `turtle`. `count` defaults to 1; `scale` defaults to 1 and accepts 0.5–2. Scale multiplies each species’ natural proportions: at `scale: 1`, a deer is about 1.5 m tall, a fox 0.55 m, a rabbit 0.39 m including its ears, a duck 0.41 m, and a turtle 0.14 m. This keeps rabbits and turtles much smaller than deer; use `scale` to adjust visibility without changing the model. Keep at most 8 animals per island. Mix species in the same list. Omit the list or set `animals: []` for an empty shore. Animals are placed along the shoreline automatically, with room around the trees. They choose their own destinations and rest times: deer graze, foxes sniff and explore, rabbits hop and forage, ducks wander in a loose flock, and turtles crawl and bask. Their paths avoid tree trunks, rocks, other animals, and the water’s edge. Jointed legs follow distance travelled and adjust to the ground, with smooth acceleration and turning. Each animal has independent attention, ear, and blink timing and can react to a nearby boat. There is no fixed movement loop or shared animation clock.

Small trout occasionally jump near the boat, with tapered bodies, fins, and a flexing tail. Each jump gets a fresh location, direction, height, and delay; the flight stays over open water and takeoff and landing disturb the wave surface. The motion control pauses fish, animals, water, and other ambient animation. Reduced-motion preferences pause these effects by default.

### Check edits

```sh
npm run validate
```

To validate another YAML file: `node scripts/validate-resume.mjs examples/resume.yml`.

Use spaces rather than tabs. Quote dates, phone numbers, and strings containing a colon followed by a space. Use `>-` for a paragraph that spans multiple source lines. Website links must start with `https://` or `http://`. Content is plain text; HTML is displayed as text rather than executed.

The validator reports malformed YAML with a line and column, missing or misspelled fields with a field path, duplicate IDs, unsafe links, and empty enabled sections. The browser also displays these errors instead of silently showing an out-of-date resume.

## Run locally

```sh
npm start
```

Open http://127.0.0.1:4173. If the preview is already running, just save your edits and refresh. `npm test` runs the content, proximity, wildlife movement, and wave-physics checks.

Use W/S or up/down to row and A/D or left/right to steer. Drag the water to look around from your seat. Touch devices have arrow controls. Near an island, the boat stops and opens that section. Scroll inside long sections; Escape or the close button returns to rowing. Arrow keys scroll a focused open panel, or switch between focused company cards. Holding a rowing key through arrival does not dismiss the panel. Click the physical book or its accessible “Contact book” button for contact details. Reduced-motion preferences skip the camera animation and guided travel animation.

The water is a displaced mesh with eight crossing Gerstner waves. Each visit gets fresh wave directions, wavelengths, and phases; new random wind targets also arrive throughout the session, with smooth transitions. The boat samples the same displaced surface for its height, pitch, and roll. Oar strokes and fish landings add temporary surface ripples. Reflections include the islands and sky; depth-based refraction reveals submerged shorelines. The first-person camera keeps a steady horizon while riding the water.

Wavelengths and base amplitudes live in `dist/wave-field.js`. Surface shading and the reflection/refraction resolution limits live in `dist/lake-water.js`. The mesh is densest near the boat and uses fewer vertices toward the horizon. Phones use a smaller mesh, render textures, and shadow map. The motion control freezes wind evolution, wave phases, splashes, and idle boat movement; it remains possible to row and open sections.

The lake and all models are procedural. Three.js and js-yaml are vendored with their MIT licenses. All runtime files are local; there are no external API calls or analytics.

## Deploy to GitHub Pages

The site is static: GitHub Pages serves everything in `dist`, including the local PDF, YAML, company icons, and vendored JavaScript. No application server, database, dependency installation, or build step is needed. Asset paths also work at a project URL such as `https://YOUR_USERNAME.github.io/resume/`.

The included [deployment workflow](.github/workflows/deploy-pages.yml) validates the resume, runs the tests, and uploads `dist`. After the initial setup, every push to `main` publishes an update when those checks pass.

1. Create an empty GitHub repository named `resume`. Leave the initial README, license, and `.gitignore` options unchecked. A public repository works with GitHub Free; Pages from a private repository requires an eligible paid plan. See [GitHub's Pages documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).
2. From this project folder, initialize Git and push the project. Replace `YOUR_USERNAME` with your GitHub account name:

   ```sh
   cd /Users/robertskonieczny/Sites/daybreak-resume
   git init -b main
   git add .
   git commit -m "Add interactive resume website"
   git remote add origin https://github.com/YOUR_USERNAME/resume.git
   git push -u origin main
   ```

3. In the repository, open **Settings → Pages → Build and deployment**, then select **GitHub Actions** as the source. See [GitHub's publishing-source instructions](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).
4. Open **Actions → Deploy resume to GitHub Pages → Run workflow**, select `main`, and run it. The initial push may run before Pages is enabled; running it after step 3 completes the setup. The successful deployment shows the live URL.

For a repository named `resume`, the usual address is `https://YOUR_USERNAME.github.io/resume/`. Naming the repository `YOUR_USERNAME.github.io` instead makes it your account's main Pages site at `https://YOUR_USERNAME.github.io/`; use that repository name in the remote URL above. A custom domain can be connected later in **Settings → Pages**.

To publish edits after setup, commit and push them to `main`. Changes to `dist/content/resume.yml` update the website through the same workflow. The local preview remains available through `npm start`.

## Content source

Robert's content was transcribed from the newest resume in Downloads at the time of import: `R Skonieczny SWE Resume.docx (2) (2).pdf` (modified October 13, 2026). Job history, dates, achievements, contact information, and education come from that PDF. About and the case studies paraphrase those facts to explain their context; they do not claim additional implementation details or personal motivations. The original highlights remain available within each role. Technology spellings were normalized where appropriate. An identical copy is included at `dist/assets/resume/robert-skonieczny-resume.pdf`; the Downloads original is unchanged. No graduation date or separate project claims were invented.

The preview remains local. Files in `dist`, including the YAML file, will be served to the site's visitors if the site is hosted later.
