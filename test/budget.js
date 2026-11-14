/* Release budget and local runtime-asset closure.
 * The 10 MB requirement applies to downloaded resources, not JS heap or VRAM.
 * node test/budget.js [--json] [--check-cache] [--stage _site]
 * --stage builds or updates a directory containing only this runtime closure.
 */
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const zlib = require("node:zlib");
const ROOT = path.resolve(__dirname, "..");
const LIMIT = 10_000_000;

function localReference(reference, owner) {
  const ref = reference.trim();
  if (!ref || ref.startsWith("#") || /^(?:data|blob):/i.test(ref)) return null;
  assert.ok(!/^(?:[a-z][\w+.-]*:|\/\/)/i.test(ref), `${owner}: external runtime resource ${ref}`);
  assert.ok(!ref.startsWith("/"), `${owner}: runtime resource must be relative for GitHub Pages: ${ref}`);
  const clean = decodeURIComponent(ref.split(/[?#]/, 1)[0]);
  const name = path.posix.normalize(path.posix.join(path.posix.dirname(owner), clean));
  assert.ok(name !== ".." && !name.startsWith("../"), `${owner}: runtime resource escapes release root`);
  return name;
}

function references(name, source) {
  const refs = [];
  const add = ref => { const value = localReference(ref, name); if (value) refs.push(value); };
  if (/\.html?$/i.test(name)) {
    for (const tag of source.matchAll(/<(?:script|img|source|audio|video|track|link)\b[^>]*>/gi)) {
      if (/^<link\b/i.test(tag[0]) && !/\brel\s*=\s*["'][^"']*(?:stylesheet|icon|preload|manifest)/i.test(tag[0])) continue;
      for (const attr of tag[0].matchAll(/\b(?:src|href|poster)\s*=\s*(["'])(.*?)\1/gi)) add(attr[2]);
      const srcset = tag[0].match(/\bsrcset\s*=\s*(["'])(.*?)\1/i);
      if (srcset) for (const entry of srcset[2].split(",")) add(entry.trim().split(/\s+/)[0]);
    }
  }
  if (/\.(?:html?|css)$/i.test(name)) {
    for (const match of source.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^\s)]*))\s*\)/gi)) add(match[1] || match[2] || match[3] || "");
    for (const match of source.matchAll(/@import\s+["']([^"']+)["']/gi)) add(match[1]);
  }
  if (/\.(?:html?|m?js)$/i.test(name)) {
    // Literal asset requests/imports are included statically. Browser verification
    // separately checks actual requests, including any dynamically built URLs.
    for (const match of source.matchAll(/(?:\bfetch|\bimport|\bimportScripts|\.load)\s*\(\s*["']([^"']+)["']/g)) add(match[1]);
    for (const match of source.matchAll(/\bnew\s+(?:Audio|Worker|SharedWorker|URL)\s*\(\s*["']([^"']+)["']/g)) add(match[1]);
    for (const match of source.matchAll(/\b(?:import|export)\s+(?:[^;\n]*?\s+from\s+)?["']([^"']+)["']/g)) add(match[1]);
  }
  if (/\.webmanifest$/i.test(name)) {
    const manifest = JSON.parse(source);
    for (const item of [...(manifest.icons || []), ...(manifest.screenshots || [])]) if (item.src) add(item.src);
  }
  return refs;
}

function runtimeFiles(root = ROOT) {
  const pending = ["index.html"], found = new Map();
  while (pending.length) {
    const name = pending.pop();
    if (found.has(name)) continue;
    const target = path.resolve(root, name);
    assert.ok(target.startsWith(root + path.sep), `runtime path outside repository: ${name}`);
    assert.ok(fs.existsSync(target) && fs.statSync(target).isFile(), `missing runtime asset: ${name}`);
    assert.ok(fs.realpathSync(target).startsWith(fs.realpathSync(root) + path.sep), `runtime symlink outside repository: ${name}`);
    const data = fs.readFileSync(target);
    found.set(name, data);
    if (/\.(?:html?|css|m?js|webmanifest)$/i.test(name)) pending.push(...references(name, data.toString("utf8")));
  }
  if (fs.existsSync(path.join(root, ".nojekyll"))) found.set(".nojekyll", fs.readFileSync(path.join(root, ".nojekyll")));
  return new Map([...found].sort(([a], [b]) => a.localeCompare(b)));
}

function inspect(root = ROOT) {
  const assets = runtimeFiles(root);
  const files = [...assets].map(([name, data]) => ({
    name, bytes: data.length, gzipBytes: zlib.gzipSync(data, { level: 9 }).length,
    sha256: crypto.createHash("sha256").update(data).digest("hex"),
  }));
  const rawBytes = files.reduce((sum, file) => sum + file.bytes, 0);
  const gzipBytes = files.reduce((sum, file) => sum + file.gzipBytes, 0);
  assert.ok(rawBytes < LIMIT, `runtime resources are ${rawBytes.toLocaleString()} bytes; must remain below ${LIMIT.toLocaleString()} bytes BEFORE compression`);
  return { assets, report: { limitBytes: LIMIT, rawBytes, gzipBytes, remainingBytes: LIMIT - rawBytes, files } };
}

function verifyCacheVersions(assets) {
  const html = assets.get("index.html").toString("utf8");
  for (const match of html.matchAll(/<script\b[^>]*\bsrc\s*=\s*(["'])(.*?)\1/gi)) {
    const name = localReference(match[2], "index.html");
    if (!name || name.startsWith("vendor/")) continue;
    const version = new URL(match[2], "https://release.invalid/").searchParams.get("v");
    const expected = crypto.createHash("sha256").update(assets.get(name)).digest("hex").slice(0, 12);
    assert.equal(version, expected, `${name}: stale cache version; update index.html to ?v=${expected} before publishing`);
  }
}

function stageAssets(assets, directory, root = ROOT) {
  root = path.resolve(root);
  const destination = path.resolve(root, directory);
  assert.ok(destination.startsWith(root + path.sep), "deployment directory must be inside the repository");
  // Refuse symlinked output paths rather than risk changing their targets.
  let cursor = root;
  for (const part of path.relative(root, destination).split(path.sep)) {
    cursor = path.join(cursor, part);
    let stat;
    try { stat = fs.lstatSync(cursor); }
    catch (error) { if (error.code === "ENOENT") continue; throw error; }
    assert.ok(!stat.isSymbolicLink() && stat.isDirectory(), "deployment directory must contain only real directories: " + cursor);
  }
  const names = [...assets.keys()];
  function checkExisting(folder, relative = "") {
    if (!fs.existsSync(folder)) return;
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      const name = relative ? relative + "/" + entry.name : entry.name;
      const target = path.join(folder, entry.name), stat = fs.lstatSync(target);
      assert.ok(!stat.isSymbolicLink(), "deployment output contains a symlink: " + name);
      if (stat.isDirectory()) {
        assert.ok(names.some(asset => asset.startsWith(name + "/")), "deployment output contains an unknown directory: " + name);
        checkExisting(target, name);
      } else {
        assert.ok(stat.isFile() && assets.has(name), "deployment output contains an unknown file: " + name);
      }
    }
  }
  // Validate the complete old tree BEFORE overwriting any file. Unknown files
  // are left untouched; repeated builds of the known closure are idempotent.
  checkExisting(destination);
  for (const [name, data] of assets) {
    const target = path.join(destination, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, data);
  }
  return path.relative(root, destination);
}

function main() {
  const { assets, report } = inspect();
  const at = process.argv.indexOf("--stage");
  if (at !== -1 || process.argv.includes("--check-cache")) {
    verifyCacheVersions(assets);
    report.cacheVersionsVerified = true;
  }
  if (at !== -1) {
    assert.ok(process.argv[at + 1] && !process.argv[at + 1].startsWith("--"), "--stage requires a runtime output directory");
    report.stagedTo = stageAssets(assets, process.argv[at + 1]);
  }
  if (process.argv.includes("--json")) console.log(JSON.stringify(report, null, 2));
  else {
    console.table(report.files.map(({ name, bytes, gzipBytes }) => ({ asset: name, bytes, gzipBytes })));
    console.log(`PASS download budget: ${report.rawBytes.toLocaleString()} / ${LIMIT.toLocaleString()} bytes raw (${(report.rawBytes / 1_000_000).toFixed(3)} MB), ${report.gzipBytes.toLocaleString()} bytes summed per-file gzip. All runtime references local.`);
    console.log("This is the download/resource budget. It does not measure browser memory or GPU memory.");
    if (report.stagedTo) console.log("Static release staged to " + report.stagedTo);
  }
}
if (require.main === module) main();
module.exports = { inspect, runtimeFiles, references, verifyCacheVersions, stageAssets, LIMIT };
