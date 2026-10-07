// Tests whether a site's contact form tries to send anything. Rules: PREREG.md.
// Usage: node harness.mjs <urls.txt|url...> --out results.jsonl [--shots dir] [--broken-classifier]
// Every non-static request after the form is found is recorded and aborted, so nothing leaves the browser.
import { chromium } from "playwright";
import { appendFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";

const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); if (i < 0) return null; const v = args[i + 1]; args.splice(i, 2); return v; };
const OUT = flag("--out") ?? "results.jsonl";
const SHOTS = flag("--shots");
const BROKEN = args.includes("--broken-classifier") ? (args.splice(args.indexOf("--broken-classifier"), 1), true) : false;
const urls = args.flatMap((a) => (existsSync(a) && !a.startsWith("http") ? readFileSync(a, "utf8").split(/\r?\n/) : [a])).map((s) => s.trim()).filter((s) => /^https?:\/\//.test(s));
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const SUCCESS = /(\bthank|\bsuccess|\bsent\b|\breceived\b|get back to you|be in touch|we'?ll contact|\bsubmitted\b|дякуємо|надіслано|спасибо|отправлено|gracias|enviado|merci|envoy|obrigad|danke|gesendet|grazie|inviato|teşekkür|gönderildi|dziękujemy|wysłano|شكرا|תודה|ありがとう|送信)/i;
const STATIC_TYPES = new Set(["script", "stylesheet", "image", "font", "media"]);
const CROSS_ORIGIN_OK = new Set(["script", "stylesheet", "font"]);
// Telemetry never delivers a message; requests to these hosts are recorded but ignored.
const ANALYTICS = /(^|\.)(google-analytics\.com|analytics\.google\.com|googletagmanager\.com|doubleclick\.net|clarity\.ms|hotjar\.(com|io)|plausible\.io|posthog\.com|segment\.(io|com)|mixpanel\.com|amplitude\.com|sentry\.io|ingest\.sentry\.io|cloudflareinsights\.com|facebook\.com|facebook\.net|tiktok\.com|linkedin\.com|twitter\.com|bing\.com|umami\.is|vercel-insights\.com|lovable\.dev)$/;
const TEST_MARKERS = ["research@example.com", "research%40example.com", "automated test", "automated+test", "automated%20test", "Test Research", "Test+Research", "Test%20Research", "15555550123"];
const isAnalytics = (url) => { try { const u = new URL(url); return ANALYTICS.test(u.hostname) || /\/(g|ccm)\/collect|\/_vercel\/insights|\/cdn-cgi\/rum|\/~api\/analytics/.test(u.pathname) || (u.hostname === "www.google.com" && /collect/.test(u.pathname)); } catch { return false; } };

function destination(url, pageOrigin) {
  const u = new URL(url);
  const h = u.hostname;
  if (u.origin === pageOrigin) return "same-origin";
  if (h.endsWith(".supabase.co")) return u.pathname.startsWith("/functions/") ? "supabase-function" : "supabase-rest";
  if (h.endsWith("emailjs.com")) return "emailjs";
  if (h.endsWith("formspree.io")) return "formspree";
  if (h.endsWith("web3forms.com")) return "web3forms";
  if (h.endsWith("formsubmit.co")) return "formsubmit";
  if (h.endsWith("getform.io") || h.endsWith("forminit.com")) return "getform/forminit";
  if (h.endsWith("formgong.com")) return "formgong";
  if (h === "script.google.com" || h === "script.googleusercontent.com") return "google-apps-script";
  if (/(^|\.)zapier\.com$|(^|\.)make\.com$|integromat|n8n/.test(h)) return "automation";
  return "other";
}

async function findForm(page) {
  return page.evaluate(() => {
    const visible = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none"; };
    const BTN = /(send|submit|contact|message|get in touch|request|book|відправ|надісл|отправ|enviar|envoyer|senden|absenden|invia|gönder|wyślij|إرسال|שלח|送信)/i;
    const areas = [...document.querySelectorAll("textarea")].filter((t) => visible(t) && !t.disabled);
    for (const area of areas) {
      let root = area.closest("form");
      if (!root) {
        // React form without <form>: climb to the nearest ancestor that also holds a matching button.
        let el = area.parentElement;
        while (el && el !== document.body) {
          const btn = [...el.querySelectorAll("button, [role=button], input[type=submit]")].find((b) => visible(b) && BTN.test(b.innerText || b.value || ""));
          if (btn) { root = el; break; }
          el = el.parentElement;
        }
      }
      if (!root) continue;
      if (root.querySelector("input[type=password]")) continue;
      // A contact form asks who is writing; a lone textarea is a chat or search box.
      const who = [...root.querySelectorAll("input")].some((i) => visible(i) && (["email", "tel"].includes((i.type || "").toLowerCase()) || /name|mail|phone|tel|nom|имя|ім/i.test((i.name || "") + " " + (i.placeholder || "") + " " + (i.id || "") + " " + (i.getAttribute("aria-label") || ""))));
      if (!who) continue;
      const id = "fg-research-" + Math.random().toString(36).slice(2);
      root.setAttribute("data-fg-research", id);
      return { id, isForm: root.tagName === "FORM", action: root.getAttribute?.("action") || null, method: (root.getAttribute?.("method") || "get").toLowerCase() };
    }
    return null;
  });
}

async function fill(page, id) {
  const root = page.locator(`[data-fg-research="${id}"]`);
  const inputs = root.locator("input, textarea, select");
  const n = await inputs.count();
  for (let i = 0; i < n; i++) {
    const el = inputs.nth(i);
    const tagName = await el.evaluate((e) => e.tagName).catch(() => "");
    const hiddenControl = tagName === "SELECT" || ["checkbox", "radio"].includes(((await el.getAttribute("type").catch(() => "")) || "").toLowerCase());
    if ((!hiddenControl && !(await el.isVisible().catch(() => false))) || !(await el.isEnabled().catch(() => false))) continue;
    // Never fill a honeypot: a person cannot see or reach it, and filling it makes many forms fake success for "bots".
    // Honeypots are text boxes; hidden selects and checkboxes belong to custom UI controls (Radix, shadcn) and must be filled.
    const textLike = await el.evaluate((e) => e.tagName === "TEXTAREA" || (e.tagName === "INPUT" && ["text", "email", "tel", "url", "search", "", "number"].includes((e.getAttribute("type") || "").toLowerCase()))).catch(() => false);
    const trap = textLike && await el.evaluate((e) => {
      const r = e.getBoundingClientRect(); const st = getComputedStyle(e);
      const off = r.right <= 0 || r.bottom <= 0 || r.left >= window.innerWidth + 2000 || r.width <= 2 || r.height <= 2;
      const hiddenish = Number(st.opacity) === 0 || st.clipPath.includes("inset(50%") || (st.clip && st.clip !== "auto");
      const marked = e.tabIndex === -1 || e.getAttribute("aria-hidden") === "true" || e.closest("[aria-hidden=true]") !== null;
      const named = /botcheck|honeypot|honey|_gotcha|gotcha|bot[-_]?field|\bhp[-_]/i.test((e.name || "") + " " + (e.id || ""));
      return off || hiddenish || marked || named;
    }).catch(() => false);
    if (trap) continue;
    const tag = await el.evaluate((e) => e.tagName.toLowerCase());
    const type = (await el.getAttribute("type"))?.toLowerCase() ?? (tag === "textarea" ? "textarea" : "text");
    const hint = ((await el.getAttribute("name")) ?? "") + " " + ((await el.getAttribute("placeholder")) ?? "") + " " + ((await el.getAttribute("id")) ?? "");
    try {
      if (tag === "select") {
        const values = await el.evaluate((s) => [...s.options].filter((o) => o.value && !o.disabled).map((o) => o.value));
        if (values.length) await el.selectOption(values[0], { force: true });
      } else if (type === "checkbox") { await el.check({ timeout: 2000, force: true }); }
      else if (type === "radio") { await el.check({ timeout: 2000, force: true }); }
      else if (["submit", "button", "hidden", "file", "image", "reset"].includes(type)) { continue; }
      else if (tag === "textarea") await el.fill("This is an automated test. Please ignore.");
      else if (type === "email" || /mail/i.test(hint)) await el.fill("research@example.com");
      else if (type === "tel" || /phone|tel/i.test(hint)) await el.fill("+15555550123");
      else if (type === "url") await el.fill("https://example.com");
      else if (type === "number") await el.fill("1");
      else if (type === "date") await el.fill("2026-10-20");
      else if (type === "time") await el.fill("10:30");
      else if (/name|ім|имя|nom|nombre/i.test(hint)) await el.fill("Test Research");
      else await el.fill("Test");
    } catch { /* a field we cannot fill shows up as INVALID */ }
  }
}

async function testUrl(browser, url) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const result = { url, at: new Date().toISOString() };
  let armed = false;
  const aborted = [];
  const sockets = [];
  await page.route("**/*", async (route) => {
    const req = route.request();
    if (!armed) return route.continue();
    const origin = new URL(page.url()).origin;
    let reqOrigin = null;
    try { reqOrigin = new URL(req.url()).origin; } catch { /* data: etc. */ }
    const type = req.resourceType();
    const isStatic = req.method() === "GET" && !req.isNavigationRequest() && STATIC_TYPES.has(type) && (reqOrigin === origin || CROSS_ORIGIN_OK.has(type));
    if (isStatic || req.url().startsWith("data:")) return route.continue();
    let body = "";
    try { body = (req.postDataBuffer()?.toString("utf8") ?? "").slice(0, 4000); } catch { /* binary */ }
    let decodedUrl = req.url();
    try { decodedUrl = decodeURIComponent(req.url()); } catch { /* keep raw */ }
    const carries = TEST_MARKERS.some((m) => decodedUrl.includes(m) || req.url().includes(m) || body.includes(m));
    aborted.push({ method: req.method(), url: req.url().slice(0, 300), type, nav: req.isNavigationRequest(), carries, analytics: isAnalytics(req.url()), netlify: /(^|&)form-name=/.test(body) });
    return route.abort();
  });
  page.on("websocket", (ws) => { if (armed) sockets.push(ws.url().slice(0, 200)); });
  const dialogs = [];
  const cdp = await context.newCDPSession(page).catch(() => null);
  const jsNavigations = [];
  if (cdp) {
    await cdp.send("Page.enable").catch(() => {});
    cdp.on("Page.frameRequestedNavigation", (e) => { if (armed) jsNavigations.push(String(e.url).slice(0, 200)); });
  }
  page.on("dialog", async (d) => { if (armed) dialogs.push(d.message().slice(0, 200)); await d.dismiss().catch(() => {}); });
  try {
    let form = null;
    const origin = new URL(url).origin;
    for (const candidate of [url, origin + "/contact", origin + "/contact-us"]) {
      const resp = await page.goto(candidate, { waitUntil: "networkidle", timeout: 30000 }).catch(() => null);
      if (candidate === url) {
        result.status = resp?.status() ?? null;
        if (!resp || resp.status() >= 400) { result.class = "VOID"; result.reason = "load " + (resp?.status() ?? "failed"); return result; }
        const title = (await page.title().catch(() => "")) + " " + (await page.locator("body").innerText({ timeout: 3000 }).catch(() => "")).slice(0, 400);
        if (/just a moment|attention required|verify you are human|captcha/i.test(title)) { result.class = "VOID"; result.reason = "bot wall"; return result; }
      } else if (!resp || resp.status() >= 400) continue;
      await page.waitForTimeout(1500);
      form = await findForm(page);
      if (form) { result.formPage = candidate; break; }
    }
    if (!form) { result.class = "NO_FORM"; return result; }
    result.form = form;
    if (form.action && form.action.trim().toLowerCase().startsWith("mailto:")) { result.class = "MAILTO"; return result; }
    await page.evaluate(() => {
      // Record mailto: opens that never become requests.
      window.__fgMailto = [];
      const open = window.open;
      window.open = (u, ...rest) => { if (String(u).startsWith("mailto:")) { window.__fgMailto.push(String(u)); return null; } return open.call(window, u, ...rest); };
      document.addEventListener("click", (e) => { const a = e.target.closest?.("a[href^='mailto:']"); if (a) { window.__fgMailto.push(a.href); e.preventDefault(); } }, true);
    });
    await fill(page, form.id);
    const before = await page.locator("body").innerText().catch(() => "");
    result.valid = await page.evaluate((id) => { const r = document.querySelector(`[data-fg-research="${id}"]`); return r.tagName === "FORM" ? r.checkValidity() : [...r.querySelectorAll("input,textarea,select")].every((e) => e.checkValidity()); }, form.id);
    armed = true;
    const root = page.locator(`[data-fg-research="${form.id}"]`);
    const button = root.locator("button[type=submit], input[type=submit]").first();
    const fallback = root.locator("button, [role=button]").filter({ hasText: /send|submit|contact|message|get in touch|request|book|відправ|надісл|отправ|enviar|envoyer|senden|absenden|invia|gönder|wyślij|إرسال|שלח|送信/i }).first();
    const target = (await button.count()) ? button : fallback;
    if (!(await target.count())) { result.class = "VOID"; result.reason = "no submit control"; return result; }
    await target.click({ timeout: 5000 }).catch((e) => { result.clickError = String(e).slice(0, 120); });
    if (result.clickError) { result.class = "VOID"; result.reason = "click failed"; return result; }
    // Sample the page every 250 ms: some forms flash "Message sent!" for a second or two and hide it again.
    const seen = new Set();
    for (let i = 0; i < 20; i++) {
      await page.waitForTimeout(250);
      const now = await page.locator("body").innerText({ timeout: 1000 }).catch(() => "");
      for (const line of now.split("\n")) { const t = line.trim(); if (t && !before.includes(t)) seen.add(t); }
    }
    const after = [...seen].join("\n");
    const toasts = await page.locator("[role=status], [role=alert], [data-sonner-toast], [class*=toast], [class*=Toast]").allInnerTexts().catch(() => []);
    const added = after.split("\n").join(" | ").slice(0, 600);
    result.newText = added;
    result.toasts = toasts.join(" | ").slice(0, 300);
    result.mailto = [...(await page.evaluate(() => window.__fgMailto ?? []).catch(() => [])), ...jsNavigations.filter((u) => u.startsWith("mailto:"))];
    result.jsNavigations = jsNavigations;
    result.requests = aborted;
    result.dialogs = dialogs;
    result.cleared = await page.evaluate((id) => { const t = document.querySelector(`[data-fg-research="${id}"] textarea`); return t ? t.value === "" : null; }, form.id).catch(() => null);
    result.sockets = sockets;
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/${new URL(url).hostname}.png` }).catch(() => {});
    result.class = classify(result, origin);
    if (result.class === "SENDS") result.destinations = [...new Set(aborted.filter((q) => q.carries && !q.analytics).map((q) => (q.netlify ? "netlify-forms" : destination(q.url, origin))))];
    return result;
  } catch (error) {
    result.class = "VOID";
    result.reason = "harness: " + String(error).slice(0, 160);
    return result;
  } finally {
    await context.close().catch(() => {});
  }
}

function classify(r, origin) {
  if (BROKEN) return "SENDS"; // deliberate fault for the validation step
  const reqs = (r.requests ?? []).filter((q) => !q.analytics);
  if (r.mailto?.length) return "MAILTO";
  const path = new URL(r.formPage ?? r.url).pathname;
  const isReload = (q) => q.nav && q.method === "GET" && new URL(q.url).origin === origin && new URL(q.url).pathname === path;
  // Delivery = a request that carries what the visitor typed.
  if (reqs.some((q) => q.carries && !isReload(q))) return "SENDS";
  if (reqs.some(isReload)) return "RELOAD";
  // Moves to another page (a thank-you page or an error) without taking what was typed.
  if (reqs.some((q) => q.nav && !q.carries)) return "REDIRECT_NO_SEND";
  // Something was sent but we cannot see the message in it: never counted as fake.
  if (reqs.some((q) => q.method !== "GET")) return "OTHER_REQUEST";
  const success = [r.newText, r.toasts, ...(r.dialogs ?? [])].some((t) => SUCCESS.test(t ?? ""));
  if (success) return "FAKE_SUCCESS";
  if (r.valid === false) return "INVALID";
  // The site's own validation refused the test values (custom JS, not HTML constraints).
  if (/(required|invalid|please (enter|fill|select|provide|upload|choose)|must (be|contain)|at least|is not valid|enter a valid)/i.test(r.newText ?? "")) return "INVALID";
  return "NO_EFFECT";
}

const CONCURRENCY = Number(flag("--concurrency") ?? 1);
const browser = await chromium.launch({ channel: "chrome", headless: true });
const queue = [...urls];
await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  for (let url = queue.shift(); url; url = queue.shift()) {
    // Hard cap per site so one hanging page cannot stall a worker.
    const r = await Promise.race([testUrl(browser, url), new Promise((ok) => setTimeout(() => ok({ url, class: "VOID", reason: "site timeout 120s" }), 120_000))]);
    appendFileSync(OUT, JSON.stringify(r) + "\n");
    console.log(r.class.padEnd(13), (r.destinations ?? []).join(",").padEnd(18), url, r.reason ?? "");
  }
}));
await browser.close();
