# Results — do contact forms on AI-built sites send anything?

Final run: run 6, 8 October 2026. Method and every change to it: [PREREG.md](PREREG.md). Harness: [harness.mjs](harness.mjs); known-answer pages: [fixtures/](fixtures/) (23 pages, 23 of 23 classified as expected; the deliberately broken classifier matches 10 of 23). The site lists and per-site results stay private (`private/`, not committed), as pre-registered.

## Sample

| Step | Count |
|---|---|
| Live Lovable/Bolt sites collected (status 200) | 813 |
| Used only to debug the harness (pilot) | 20 |
| Tested | 793 |
| Contact form found | 119 |
| Clear result on the final run (T) | 105 |
| Not counted: failed to load / could not click (`VOID`) | 11 |
| Not counted: site rejected the test values (`INVALID`) | 3 |

## What the 105 forms did after "Send"

| Outcome | Forms |
|---|---|
| Sent the typed message (`SENDS`) | 54 of 105 |
| Showed success, sent nothing (`FAKE_SUCCESS`) | 27 of 105 |
| Nothing visible, nothing sent (`NO_EFFECT`) | 12 of 105 |
| Opened the visitor's mail app (`MAILTO`) | 7 of 105 |
| Moved to another page without the message (`REDIRECT_NO_SEND`) | 3 of 105 |
| Reloaded the page (`RELOAD`) | 2 of 105 |

`FAKE_SUCCESS`, `NO_EFFECT`, `REDIRECT_NO_SEND` and `RELOAD` are separate mechanisms and are not added together anywhere.

By builder: Lovable 12 of 67 fake, Bolt 15 of 38 fake.

Where the 54 sending forms went: Supabase table 14, Supabase edge function 13, EmailJS 13, the site's own server 4, Formspree 3, FormSubmit 1, Google Apps Script 1, other 5.

## Demo or real?

Pre-registered rule (PREREG.md, 2026-10-07 ~20:20 UTC), applied to all 105:

| Group | Fake forms |
|---|---|
| No demo signs | 16 of 73 |
| — of which on their own domain | 5 of 30 |
| Portfolios | 2 of 17 |
| Demos (hackathon or placeholder contacts) | 9 of 15 |

The pre-registered bar for the "AI-built sites lose leads" framing (no-demo group ≥ 20 sites and fake share ≥ 10%) is met: 16 of 73.

## Manual verification

- Of the 27 final `FAKE_SUCCESS`, 21 were confirmed by reading the submit handler in the site's JavaScript (no network call; typically `setTimeout` → toast → reset). For 6 the handler could not be located in minified bundles; they are reported as flagged by the test, not as code-confirmed.
- Manual checks during the study found harness faults that were fixed and re-tested (all in PREREG.md): analytics pings counted as sending; alert() dialogs missed; chat boxes taken for contact forms; a `mailto:` via `location.href` invisible; short-lived success messages missed; filling a hidden honeypot that triggers a fake "thank you" for bots; hidden Radix/shadcn selects left empty.
- Run-to-run agreement on the 119 form sites: run 6 vs run 3 (before the honeypot and select changes) 113 of 119; most differences are sites that loaded slowly or failed to load on one pass.

## Limits

Convenience sample from public listings, skewed towards developer projects. Requests were blocked, so the test shows whether a form tried to send, not whether email arrived. One point in time. The site-type rule is coarse: "no demo signs" is not proof that a business depends on the form.
