# Contact forms that send nothing — study and test harness

We submitted the contact form on public Lovable and Bolt sites while recording every network request and **blocking all of them**, so no message ever reached a site owner. On the final run, **27 of 105** forms showed a success message ("Message sent!") and sent nothing; 54 of 105 sent the typed message. On sites without demo signs, 16 of 73 were fake.

Write-up: https://formgong.com/en/blog/contact-forms-that-send-nothing/

| File | What it is |
| --- | --- |
| [`PREREG.md`](PREREG.md) | Rules written before testing, and every later change with the reason (seven harness faults found by manual checks) |
| [`RESULTS.md`](RESULTS.md) | Final numbers with denominators |
| [`harness.mjs`](harness.mjs) | The test: Playwright + installed Chrome, one visit per site |
| [`fixtures/`](fixtures/) | 23 local pages with known answers (`expected.tsv`) |

## Run it

```bash
npm install
npm run fixtures                       # 23 known-answer pages; all must match
node harness.mjs https://your-site.example --out result.jsonl
```

Requires Google Chrome (the harness launches it with `channel: "chrome"`).

## How it decides

After the contact form is found, every request is intercepted. Same-origin static files and cross-origin scripts, styles and fonts load; **everything else is recorded and aborted**. The harness fills visible fields with obvious test values (never honeypots), presses send and watches the page for five seconds.

- `SENDS` — a request carried what was typed.
- `FAKE_SUCCESS` — no such request, no other outgoing request, and a success message (or `alert()`) appeared.
- `NO_EFFECT`, `MAILTO`, `RELOAD`, `REDIRECT_NO_SEND`, `OTHER_REQUEST`, `INVALID`, `VOID` — see PREREG.md.

## Ethics

Nothing is submitted to anyone. The site list and per-site results are not published, and the write-up names no site. Please use the harness the same way.

MIT licensed. Made by [Formgong](https://formgong.com).
