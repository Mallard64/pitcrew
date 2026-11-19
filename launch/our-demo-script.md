# Pit Crew: our demo video, script v2 (DRAFT, not recorded yet)

Target: about 115 s at 1920×1080, about 270 words of narration. It follows Pit Crew's own 6-part outline.
Every product line must match the real footage. Demo lines get adjusted to what the recorded run actually shows.

| # | Time | On screen | Narration |
|---|------|-----------|-----------|
| 1 Problem | 0–14s | A countdown clock ticking to **11:59 AM**, then a checklist that fills up: *script · record · edit · voiceover · captions* | Every team at this hackathon has to submit a demo video. Most of us are making it right now, at 3 a.m. A good one needs a script, a clean recording, editing, a voiceover and captions. That's hours you don't have. |
| 2 Solution | 14–22s | Headline "Paste a link. Get a pitch." + the Pit Crew form | Pit Crew makes the pitch video for you. Paste your live link, or just your GitHub repo. |
| 3 Demo (live) | 22–50s | REAL footage of our production site:<br>• typing `excalidraw.com`, picking a narrator, ticking "review the script", clicking **Make my pitch video**<br>• live progress, sped up with a **×8** label<br>• the outline review: pitch check, editing one line, clicking **Voice and render this**<br>• the finished video playing about 6 s with its own sound | Here's a real run on Excalidraw. The agent opens the site, plans the story, and our server records every step in Chromium. Before anything is voiced, I get the outline, a pitch check, and can change any line. About eight minutes later, the video is done. *(times adjusted to this run)* |
| 3b Demo (no live link) | 50–62s | Split screen of two finished test videos: **OmniSTEM**, a repo run in a sandbox (window title "localhost · run from the repo"), and **Hunt the Wumpus**, the team's own gameplay (title "Team footage") | No live link? Pit Crew runs your repo in a HarnessRouter sandbox, or cuts your own gameplay footage, and always labels where the demo came from. |
| 4 How it's built | 62–82s | **Animated architecture diagram** (spec below); each box lights up as it's named | Your link goes to our server on Railway. It hands the project to an agent on HarnessRouter, which explores the site or runs the repo in its sandbox and writes the plan as JSON. Our server checks every statistic against its source page, records the demo in Chromium, voices it with ElevenLabs, and renders it with Remotion at 1080p. You review the script before it's voiced. |
| 5 Evidence | 82–94s | A grid of real thumbnails from tonight's runs, labeled **"Our test runs, Nov 18"** | We tested it tonight on open-source products like Excalidraw, Hoppscotch, Squoosh and Mermaid, plus three GitHub-only student projects. *(Add counts only from eval/results.md; no user claims.)* |
| 6 Next | 94–104s | Three cards: Product Hunt · Demo days · Investor updates | Next: a pitch video for every launch. Product Hunt, demo days, investor updates. |
| 7 Ask + end | 104–115s | The live URL + **#bighackgame**, plus the credit line (see decision 3) | Paste your link, and Pit Crew makes the pitch. Try it tonight. |

## The architecture diagram (scene 4)
It uses our renderer's own `diagram` element, so it's drawn in the same style as the videos Pit Crew makes. Nodes flow left to right, and every box and arrow is something the code really does:

```
 Team ──link / repo / footage──▶ Pit Crew server (Next.js on Railway)
                                     │  task + site digest / repo facts
                                     ▼
                        HarnessRouter agent (Claude, own sandbox)
                        explores the site · runs the repo · writes plan JSON
                                     │  video plan (story, scenes, demo steps)
                                     ▼
 Pit Crew server:  verify stats (fetch source, exact number match)
                   → record demo (Playwright + Chromium, step repair)
                   → you review the outline (human in the loop)
                   → voice (ElevenLabs) → render (Remotion, 1080p60)
                                     │
                                     ▼
                     pitch video + build log + submission text
```

`diagram` element (layered, 8 nodes):
```json
{"type":"diagram","kind":"layered",
 "nodes":[{"id":"team","label":"Your link or repo"},{"id":"server","label":"Pit Crew server"},
          {"id":"agent","label":"HarnessRouter agent"},{"id":"stats","label":"Stat checker"},
          {"id":"rec","label":"Chromium recorder"},{"id":"review","label":"Your review"},
          {"id":"voice","label":"ElevenLabs voice"},{"id":"render","label":"Remotion render"}],
 "edges":[{"from":"team","to":"server"},{"from":"server","to":"agent","label":"task"},
          {"from":"agent","to":"stats","label":"plan"},{"from":"stats","to":"rec"},
          {"from":"rec","to":"review"},{"from":"review","to":"voice"},{"from":"voice","to":"render"}]}
```

## Accuracy notes (checked against the code)
- **The agent** plans and explores (and runs repos in its sandbox). **Our server** does the recording of live sites, stat verification, voicing and rendering. That split is why the diagram has two lanes.
- **"About eight minutes":** the measured production runs took 6–9.5 min at 60–75 s. Replace this with the recorded run's real time.
- **No traction claims:** /stats only contains our own test runs, and the feedback table has 0 rows, so no quotes.
- **No problem statistic:** I found no source page I could verify for "hours to make a demo video".

## Still your call
1. **Credit line:** this video is assembled by hand in Pit Crew's own renderer (same looks, voice, captions, diagram element), because the pipeline doesn't take a screen recording of itself as input. Proposed line: **"Rendered with Pit Crew's own video engine."** The alternative is to run Pit Crew on its own URL and use that output as a section, which earns "made by Pit Crew" for that part only.
2. **Voice and look:** Sarah on Blueprint (blue grid suits the tech diagram), or another combination.
3. **Scene 3b split screen:** this needs tonight's OmniSTEM and Wumpus reruns to come out well. If either is weak, I'll cut 3b and give the 12 s to scene 4.
