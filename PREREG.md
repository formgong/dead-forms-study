# Pre-registration — do contact forms on AI-built sites send anything?

Written 2026-10-07, before any site in the sample is tested. Changes after the first sample run are listed at the bottom with a reason; nothing above that line is edited after the run starts.

## Question

On public websites published with Lovable or Bolt, when a visitor fills in the contact form and presses submit, does the page try to send the message anywhere?

## Population and sample

- Population: live sites on `*.lovable.app` and `*.bolt.host` (plus custom domains only with concrete builder evidence, recorded per row).
- Sample: the list in `sample.csv`, collected before testing from public sources (source recorded per row). It is a convenience sample, not a random one: galleries over-represent polished sites. The write-up must say so.
- Inclusion: homepage returns HTTP 200 and renders in a real Chrome within 30 s.

## Contact form definition

A visible, enabled `textarea` inside a `<form>`, or (React forms without `<form>`) a visible `textarea` with a visible button whose text matches send/submit/contact/message in the page language. Excluded: any form containing a password field (auth), and search/newsletter forms (no textarea). Look on the homepage first, then `/contact`, then `/contact-us`; first match wins.

## Procedure (one visit per site, nothing leaves the browser)

1. Load the page in Chrome (Playwright, `channel: chrome`, headless), wait for network idle (max 30 s).
2. Find the contact form. From this point every request is intercepted: same-origin static GETs (script, style, image, font) and cross-origin script/style/font GETs continue; **everything else is recorded and aborted** — fetch/XHR, any POST, document navigations, beacons, cross-origin images. WebSocket opens are recorded.
3. Fill every visible field with test values (name "Test Research", email `research@example.com`, phone `+15555550123`, message "This is an automated test. Please ignore."), pick the first real option in selects, tick required checkboxes.
4. Record `form.checkValidity()`, click the submit control, wait 5 s.
5. Record: every aborted request after the click (method, host, path, type), page text that appeared after the click, toast/status elements, a screenshot.

Because all outgoing requests are aborted, no message reaches the site owner and no third-party service receives form data.

## Classification (decided by these rules, in this order)

| Class | Rule |
|---|---|
| `VOID` | page failed to load, timed out, captcha/bot wall, or the harness threw. Excluded from every denominator, reported as a count. |
| `NO_FORM` | no contact form found by the definition above. |
| `INVALID` | `checkValidity()` false after filling (a field the harness could not satisfy). Reported separately, not in the headline denominator. |
| `SENDS` | at least one aborted non-static request after the click (fetch/XHR/POST/navigation/beacon). Sub-labelled by destination host: supabase-rest, supabase-function, emailjs, formspree, web3forms, formsubmit, getform/forminit, formgong, netlify-forms, google-apps-script, automation (zapier/make/n8n), same-origin, other. |
| `MAILTO` | form `action` starts with `mailto:` or a `mailto:` navigation/open was captured. |
| `RELOAD` | the only request is a same-origin GET document navigation to the same path (a native form with no action on a static host). Nothing is delivered. |
| `FAKE_SUCCESS` | no request after the click **and** success text or a success toast appeared (thank/sent/success/received/"get back to you" and the same in the page language). |
| `NO_EFFECT` | no request and no success message. |

`FAKE_SUCCESS`, `NO_EFFECT` and `RELOAD` are three different mechanisms and are never pooled into one number.

## Numbers that will be published

- Denominator `T` = sites with a contact form and a valid test (`SENDS + MAILTO + RELOAD + FAKE_SUCCESS + NO_EFFECT`). Every share is given as "k of T".
- Headline: `FAKE_SUCCESS` of `T` — "shows a success message, sends nothing".
- Also: `NO_EFFECT` of `T`, `RELOAD` of `T`, and the `SENDS` destination breakdown.
- Also reported: total sampled, `VOID`, `NO_FORM`, `INVALID`, per builder.

## Bar, set before the run

- The full run is valid only if `T ≥ 100`. Below that, publish nothing as a statistic.
- The angle "many AI-built forms are fake" is used only if `FAKE_SUCCESS ≥ 10% of T`. Otherwise the piece is "where AI-built forms send their data", with the same honesty about counts.
- The result is published whatever it is; it is not re-run with a different sample to get a better number.

## Harness validation (must pass before the sample run)

Seven local fixture pages with known outcomes: fake toast → `FAKE_SUCCESS`; fetch POST to an API → `SENDS/other`; native POST to Formspree → `SENDS/formspree`; `mailto:` action → `MAILTO`; preventDefault and nothing else → `NO_EFFECT`; fetch to `*.supabase.co/rest/v1/...` → `SENDS/supabase-rest`; native form without action → `RELOAD`. All seven must match. Then the classifier is deliberately broken (no-request treated as `SENDS`) and the fixtures must fail.

## Manual verification

Every `FAKE_SUCCESS` in the first 20 tested sites, and a random 10 from the full run, is checked by hand: read the submit handler in the site's JS bundle and confirm it makes no network call. Disagreements are reported, and if more than 2 of 10 disagree the harness is fixed and the whole run repeated.

## Publication ethics

Results are published in aggregate only. Individual sites are not named or linked. The raw list stays private.

---
Changes after the run started:
- 2026-10-07 18:35 UTC, before any sample site was tested: the sample list was frozen as `sample-frozen-2026-10-07.csv` (1,790 rows; 1,555 with HTTP 200). Rows with status 200 were sorted by URL and shuffled with `random.Random(20261007)`. The first 20 are the pilot (harness debugging, excluded from results); the next 500 are the run (`run-urls.txt`). Reason: testing all 1,555 sequentially would take many hours; 500 is expected to give T ≥ 100.
- 2026-10-07 ~18:55 UTC, after the pilot and before the run. **The 18:35 freeze is withdrawn**: it copied the sample file while the collecting agent was still writing it, so it included rows the agent later excluded (template demos, custom domains without builder evidence, and `*.vercel.app` sites that are neither Lovable nor Bolt). Re-frozen from the agent's final file as `sample-frozen-v2.csv`; eligible = status `200` only (excludes `200-notfound-page`, `200-parked-domain`, `200-login-wall`). Same seed and shuffle; first 20 = new pilot, all remaining eligible rows = run (not 500), because only ~134 of 813 look like business sites and T ≥ 100 needs the whole list.
- Same time, classification rules changed after the pilot found four harness faults (none of these pilot sites are in the results):
  1. `SENDS` now means a request that **carries what the visitor typed** (any test value in its URL or body). Analytics/telemetry requests (Google Analytics, Tag Manager, `/g/collect`, `/ccm/collect`, Clarity, Hotjar, PostHog, Sentry, Vercel/Cloudflare insights, Meta, Lovable `/~api/analytics`, etc.) are recorded and ignored. Reason: a "Message Sent!" form whose only request was a Google Analytics event was classed `SENDS`; Next.js route prefetches were too.
  2. New class `OTHER_REQUEST`: a non-GET, non-analytics request without the typed values (e.g. an encoded body). It is checked **before** `FAKE_SUCCESS`, so a form that sends anything at all is never counted as fake.
  3. `alert()`/`confirm()` dialog text counts as a success message (pilot site cleared its fields after submit with no visible text — an alert that the harness had silently dismissed).
  4. A contact form must also contain an email, phone or name-like input; a lone textarea (AI chat box) is not a contact form.
  Fixtures grew from 8 to 15 (alert, analytics-only, chat box, prefetch, opaque POST, Netlify Forms, empty Supabase POST). 15 of 15 match; the deliberately broken classifier matches 6 of 15; no fixture request reached the fixture server.
- 2026-10-07 ~18:58 UTC, before the run: if the run yields T < 100, the sample is extended — never trimmed — with more business-like sites from the same sources (madewithlovable.com custom domains with Lovable DNS/HTML evidence, then GitHub homepages), frozen in a new file before testing, and tested with the same harness. No statistic is published while T < 100. Pilot 2 (20 sites): 19 NO_FORM, 1 NO_EFFECT; 4 of the NO_FORM sites were checked by hand (homepage and /contact) and indeed have no form, only mailto links.
- 2026-10-07 ~19:50 UTC, **after the full run** (793 sites, T = 112). Manual verification found: of 19 `FAKE_SUCCESS`, 17 confirmed by reading the submit handler (no network call), 1 was a `mailto:` opened with `window.location.href` (harness gap: such navigations are invisible to request interception), 1 handler could not be located. Of a random 10 `NO_EFFECT`, 2 were clicks that never happened (a covering element; Playwright timed out), 1 navigated to another page without the typed values, 1 showed the site's own validation error. Because those cases sit inside the denominator, the harness was fixed and **every site where a form was found is re-tested**; the first-run numbers are not published. Fixes: a failed click → `VOID`; a document navigation that does not carry the typed values → new class `REDIRECT_NO_SEND`; validation-error text after the click with no request → `INVALID`. Fixtures 15 → 18 (covered button, redirect, custom validation): 18 of 18 match, broken classifier 7 of 18, no fixture request leaked. Known remaining gap, reported with the results: a `mailto:` opened via `location.href` without any visible text is classed `NO_EFFECT`.
- 2026-10-07 ~20:05 UTC, after the re-test (T = 104): manual check found two code-verified fake forms classed `NO_EFFECT` because they show "Message Sent!" for only 2–3 s and the harness read the page once at 5 s; and `location.href = "mailto:…"` was still invisible. Fixes: the page text is sampled every 250 ms for the whole 5 s window; renderer-initiated navigations are captured via the Chrome DevTools Protocol (`Page.frameRequestedNavigation`), so a JS `mailto:` counts as `MAILTO`. Fixtures 18 → 20 (transient message, JS mailto): 20 of 20 match, broken classifier 7 of 20, nothing leaked. All 119 form sites are re-tested again (run 3); run 2 numbers are not published either.
- 2026-10-07 ~20:20 UTC, after run 3 and **before any site-type counts were computed**: owner raised that many fake forms may sit on demos where nobody expects leads. Every site in T is put in exactly one group from its rendered homepage and contact page, by these rules in order:
  1. `demo` — source is the Devpost hackathon, or the page shows placeholder contacts: an `example.com/org/net` email, a `555` phone pattern (`555-`, `(555)`, `555 01`), `123 Main`/`123 … Street|Avenue|Boulevard`, `lorem ipsum`, `yourcompany`, `your@email`, `@company.com`, `@email.com`, `john@doe`/`jane@doe`.
  2. `portfolio` — a personal site: hostname or title contains portfolio, folio, resume, cv, or "about me".
  3. `real` — everything else: no placeholder contacts and not a portfolio. Custom domain is recorded but is not required.
  Fake-form rates are reported per group with denominators; the "AI-built sites lose leads" framing is used only if the `real` group has at least 20 sites in T and its `FAKE_SUCCESS` share is at least 10%. If `real` has fewer than 20 sites, the result is reported as inconclusive for real businesses.
- 2026-10-07 ~20:45 UTC, after run 3: manual check of the 12 newly flagged fakes confirmed 4 by code, could not locate the handler in 7 (minified bundles), and found 1 harness fault: on one site (name removed before publication) the handler returns a fake "queued" message **when its honeypot is filled**, and the harness had filled the off-screen honeypot. Fix: inputs that are off-screen, ≤2 px, transparent, clipped, `tabindex=-1`, `aria-hidden`, or named like a honeypot (`botcheck`, `honeypot`, `_gotcha`, `bot_field`, `hp_`, `website`, `url`, `fax`) are never filled. Fixtures 20 → 21 (honeypot-guarded form). All 119 form sites are re-tested (run 4); run 3 numbers are not published.
- 2026-10-07 ~21:10 UTC, after run 4 (T = 98): the honeypot name list also skipped ordinary fields named `website`, `url` and `fax`; three sites that sent in run 3 became `INVALID` because a required, visible "Website" field stayed empty. Fix: honeypots are recognised only by being hidden from people (off-screen, ≤2 px, transparent, clipped, `tabindex=-1`, `aria-hidden`) or by an explicit trap name (`botcheck`, `honeypot`, `_gotcha`, `bot_field`, `hp_`). Fixture added: a visible required `website` field → `SENDS`. Fixtures: 22 of 22, broken classifier 9 of 22, nothing leaked. Run 5 re-tests all 119 form sites and is the **final** run; its numbers are the published ones, with run-to-run agreement against run 4 reported.
- 2026-10-08 ~00:15 UTC, after run 5 (T = 98). Correction to the previous entry: the `website`/`url` names were **not** the cause (narrowing them changed nothing; that was a guess logged as a diagnosis). Measured cause: shadcn/Radix selects keep a hidden native `<select>` (1×1 px, `aria-hidden`, `tabindex=-1`); since run 4 the honeypot rule skipped it, the site's own validation demanded a choice, and 3 sites that send became `INVALID` (a fourth, already code-confirmed fake, too). Fix: the honeypot rule applies to text inputs only; hidden selects, checkboxes and radios are filled again (forced), and `type=time` gets a value. Fixture added (hidden Radix-style select + time field → `SENDS`): 23 of 23, broken classifier 10 of 23, nothing leaked. On the 8 run-5 `INVALID` sites the fix gives 3 `SENDS`, 1 `FAKE_SUCCESS`, 1 `NO_EFFECT`, 3 still `INVALID` (required file upload, a maths captcha, one unexplained). Run 6 re-tests all 119 form sites and replaces run 5 as the final run.
