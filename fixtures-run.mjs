// Serves fixtures/ on 127.0.0.1:8799, runs the harness on every page and compares with fixtures/expected.tsv.
import { createServer } from "node:http";
import { readFileSync, existsSync, rmSync } from "node:fs";
import { spawn } from "node:child_process";
import { join } from "node:path";
const dir = new URL("./fixtures/", import.meta.url).pathname;
const server = createServer((req, res) => {
  const file = join(dir, (req.url || "/").split("?")[0].replace(/^\/+/, ""));
  if (!file.startsWith(dir) || !existsSync(file)) { res.writeHead(404).end(); return; }
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(readFileSync(file));
}).listen(8799, "127.0.0.1");
const rows = readFileSync(join(dir, "expected.tsv"), "utf8").trim().split("\n").map((l) => l.split("\t"));
const out = "fixtures-results.jsonl";
rmSync(out, { force: true });
// The fixture server lives in this process, so the harness must run asynchronously.
await new Promise((resolve, reject) => {
  const child = spawn("node", ["harness.mjs", ...rows.map(([f]) => `http://127.0.0.1:8799/${f}`), "--out", out, "--concurrency", "4"], { stdio: "inherit" });
  child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`harness exited ${code}`))));
});
const got = Object.fromEntries(readFileSync(out, "utf8").trim().split("\n").map((l) => JSON.parse(l)).map((r) => [r.url.split("/").pop(), r.class]));
let ok = 0;
for (const [file, want] of rows) { const pass = got[file] === want; ok += pass; if (!pass) console.log("FAIL", file, "expected", want, "got", got[file]); }
console.log(`${ok} of ${rows.length} fixtures match`);
server.close();
process.exit(ok === rows.length ? 0 : 1);
