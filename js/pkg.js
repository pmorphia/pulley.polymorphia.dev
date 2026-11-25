/* Reads Distrobase release archives in the browser: gunzip (DecompressionStream), a tar reader,
 * and a small TOML parser that covers pulley.toml. Exposes `PulleyPkg`. */
(function (root) {
"use strict";
const dec = new TextDecoder();

async function gunzip(bytes) {
  if (!(bytes[0] === 0x1f && bytes[1] === 0x8b)) return bytes;
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// ustar, with GNU long names (L) and pax path records (x)
function untar(bytes) {
  const files = new Map();
  let off = 0, longName = null, paxPath = null;
  const field = (h, a, b) => dec.decode(h.subarray(a, b)).replace(/\0[\s\S]*$/, "");
  while (off + 512 <= bytes.length) {
    const h = bytes.subarray(off, off + 512);
    if (h.every(b => b === 0)) break;
    let name = field(h, 0, 100);
    const prefix = field(h, 345, 500);
    if (prefix && dec.decode(h.subarray(257, 262)) === "ustar") name = prefix + "/" + name;
    const size = parseInt(field(h, 124, 136).trim() || "0", 8) || 0;
    const type = h[156] ? String.fromCharCode(h[156]) : "0";
    off += 512;
    const data = bytes.subarray(off, off + size);
    off += Math.ceil(size / 512) * 512;
    if (type === "L") { longName = dec.decode(data).replace(/\0[\s\S]*$/, ""); continue; }
    if (type === "x") {
      const m = /(?:^|\n)\d+ path=([^\n]*)\n/.exec(dec.decode(data));
      if (m) paxPath = m[1];
      continue;
    }
    if (type === "0" || type === "7") {
      const path = (paxPath || longName || name).replace(/^\.\//, "");
      files.set(path, data);
    }
    longName = paxPath = null;
  }
  return files;
}

/* ------------------------------------------------------------------ TOML (the pulley.toml subset) */
function parseToml(text) {
  const out = {};
  let table = out;
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  for (let i = 0; i < lines.length; i++) {
    let line = stripComment(lines[i]).trim();
    if (!line) continue;
    let m;
    if ((m = /^\[\[\s*([^\]]+?)\s*\]\]$/.exec(line))) {
      const path = splitKey(m[1]), last = path.pop(), parent = dig(out, path);
      (parent[last] = Array.isArray(parent[last]) ? parent[last] : []).push(table = {});
      continue;
    }
    if ((m = /^\[\s*([^\]]+?)\s*\]$/.exec(line))) { table = dig(out, splitKey(m[1])); continue; }
    const eq = findTop(line, "=");
    if (eq < 0) continue;
    const key = splitKey(line.slice(0, eq).trim());
    let val = line.slice(eq + 1).trim();
    // arrays and inline tables may span lines
    while (unbalanced(val) && i + 1 < lines.length) val += " " + stripComment(lines[++i]).trim();
    const last = key.pop();
    dig(table, key)[last] = value(val);
  }
  return out;
}
function dig(obj, path) { for (const k of path) obj = (obj[k] = obj[k] && typeof obj[k] === "object" ? obj[k] : {}); return obj; }
function splitKey(s) { return s.split(".").map(k => k.trim().replace(/^["']|["']$/g, "")); }
function stripComment(line) {
  let q = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === "\\" && q === '"') i++; else if (c === q) q = null; }
    else if (c === '"' || c === "'") q = c;
    else if (c === "#") return line.slice(0, i);
  }
  return line;
}
function findTop(s, ch) {
  let q = null, depth = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === "\\" && q === '"') i++; else if (c === q) q = null; continue; }
    if (c === '"' || c === "'") q = c;
    else if (c === "[" || c === "{") depth++;
    else if (c === "]" || c === "}") depth--;
    else if (c === ch && depth === 0) return i;
  }
  return -1;
}
function unbalanced(s) {
  let q = null, depth = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === "\\" && q === '"') i++; else if (c === q) q = null; continue; }
    if (c === '"' || c === "'") q = c; else if (c === "[" || c === "{") depth++; else if (c === "]" || c === "}") depth--;
  }
  return depth > 0;
}
function splitTop(s) {
  const parts = []; let start = 0, q = null, depth = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === "\\" && q === '"') i++; else if (c === q) q = null; continue; }
    if (c === '"' || c === "'") q = c; else if (c === "[" || c === "{") depth++; else if (c === "]" || c === "}") depth--;
    else if (c === "," && depth === 0) { parts.push(s.slice(start, i)); start = i + 1; }
  }
  parts.push(s.slice(start));
  return parts.map(p => p.trim()).filter(Boolean);
}
function value(v) {
  if (v.startsWith('"""') || v.startsWith("'''")) return v.slice(3, v.lastIndexOf(v.slice(0, 3)));
  if (v[0] === '"') { try { return JSON.parse(v); } catch (e) { return v.slice(1, -1); } }
  if (v[0] === "'") return v.slice(1, -1);
  if (v[0] === "[") return splitTop(v.slice(1, -1)).map(value);
  if (v[0] === "{") {
    const o = {};
    for (const part of splitTop(v.slice(1, -1))) {
      const eq = findTop(part, "=");
      if (eq < 0) continue;
      const key = splitKey(part.slice(0, eq).trim()), last = key.pop();
      dig(o, key)[last] = value(part.slice(eq + 1).trim());
    }
    return o;
  }
  if (v === "true" || v === "false") return v === "true";
  if (/^[+-]?\d[\d_]*(\.\d+)?([eE][+-]?\d+)?$/.test(v)) return Number(v.replace(/_/g, ""));
  return v;
}

/* ------------------------------------------------------------------ package metadata */
// What a release archive says about itself: a Flywheel package (pulley.toml), a Hydrogen /
// Sourcegen distribution (.sourcepkg), or neither. README is the first README* at the root.
async function inspect(buffer) {
  let files = untar(await gunzip(new Uint8Array(buffer)));
  // An archive with a single top-level directory unpacks that directory, as Pulley does.
  const tops = new Set([...files.keys()].map(n => n.split("/")[0]));
  if (tops.size === 1 && [...files.keys()].every(n => n.includes("/"))) {
    const cut = [...tops][0].length + 1;
    files = new Map([...files].map(([n, d]) => [n.slice(cut), d]));
  }
  const text = name => files.has(name) ? dec.decode(files.get(name)) : null;
  const meta = { kind: "other", description: "", license: "", main: "", dependencies: [], files: files.size, readme: null, readmeName: null };
  const toml = text("pulley.toml");
  if (toml != null) {
    meta.kind = "flywheel";
    try {
      const t = parseToml(toml), p = t.package || {};
      meta.description = String(p.description || "");
      meta.license = String(p.license || "");
      meta.main = String(p.main || "");
      meta.version = p.version ? String(p.version) : "";
      meta.unlisted = p.unlisted === true; // `unlisted = true`: left out of listings, page still opens by address
      const deps = (o, dev) => Object.entries(o || {}).map(([alias, spec]) => ({ alias, spec: typeof spec === "string" ? spec : describeSpec(spec), dev }));
      meta.dependencies = deps(t.dependencies, false).concat(deps(t["dev-dependencies"], true));
    } catch (e) { /* show what we can */ }
  } else {
    const sp = text(".sourcepkg");
    if (sp != null) {
      meta.kind = "hydrogen";
      try {
        const j = JSON.parse(sp);
        meta.description = String(j.description || "");
        meta.command = j.command ? String(j.command) : "";
        meta.requiresPython = j["requires-python"] ? String(j["requires-python"]) : "";
        meta.dependencies = (Array.isArray(j.dependencies) ? j.dependencies : []).map(d => ({ alias: String(d), spec: "", dev: false }));
      } catch (e) { /* ignore */ }
    }
  }
  const readme = [...files.keys()].filter(n => !n.includes("/") && /^readme(\.(md|markdown|txt))?$/i.test(n)).sort()[0];
  if (readme) { meta.readmeName = readme; meta.readme = text(readme); }
  meta.fileList = [...files.keys()].sort();
  return meta;
}
function describeSpec(s) {
  if (!s || typeof s !== "object") return String(s || "");
  if (s.path) return "path " + s.path;
  if (s.git) return "git " + s.git + (s.rev ? " @ " + s.rev : "");
  return [s.distribution, s.registry ? "@" + s.registry : "", s.version ? " " + s.version : ""].join("");
}

root.PulleyPkg = { gunzip, untar, parseToml, inspect };
})(typeof self !== "undefined" ? self : globalThis);
