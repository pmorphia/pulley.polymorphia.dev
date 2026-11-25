/* pulley.polymorphia.dev — the packages and users of the Distrobase registry at
 * dstbs.wednesware.org, read live from its public API, with the hand-off from polymorphia.dev. */
(() => {
"use strict";
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const enc = encodeURIComponent;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const eio = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const root = document.documentElement;
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode or full */ } },
};
const POLY = "https://polymorphia.dev";
const API = "https://dstbs.wednesware.org/v1";
const REGISTRY = "wednesware.org";
const FLYWHEEL = "https://flywheel.polymorphia.dev";

const embed = window.__embed, resume = window.__resume, direct = window.__direct;
const tell = m => { if (embed) parent.postMessage(m, embed); };

const toastEl = $("#toast");
let toastTimer = 0;
function toast(html, ms = 2400) {
  toastEl.innerHTML = html; toastEl.classList.add("on");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => toastEl.classList.remove("on"), ms);
}
async function copy(text, what = "copied") {
  try { await navigator.clipboard.writeText(text); toast(`${esc(what)} <code>${esc(text.length > 48 ? text.slice(0, 46) + "…" : text)}</code>`); SFX.click(1.4); }
  catch (e) { toast("Couldn't copy: select the text and copy it yourself"); }
}

/* ================================================================ sound (synthesized) */
// Only plays after a click or key press on this page. During the hand-off the sound is played by
// polymorphia.dev, where the click happened (see index.html).
const SFX = (() => {
  const btn = $("#sound");
  let on = store.get("pl-sound", "on") !== "off";
  const snd = (resume && resume.snd) || (direct && direct.snd);
  if (snd === "0" || snd === "1") { on = snd === "1"; store.set("pl-sound", on ? "on" : "off"); }
  let ac = null, out, noise;
  function init() {
    if (ac) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
    const comp = ac.createDynamicsCompressor();
    out = ac.createGain(); out.gain.value = on ? .7 : 0;
    out.connect(comp).connect(ac.destination);
    noise = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const ready = () => ac && on && ac.state === "running";
  const unlock = () => { init(); if (ac && ac.state !== "running") ac.resume(); };
  ["pointerdown", "keydown", "touchend"].forEach(ev => addEventListener(ev, unlock, { capture: true, passive: true }));
  function tone(f0, dur, { type = "sine", vol = .1, f1 = f0, attack = .004, at = 0 } = {}) {
    if (!ready()) return;
    const t = ac.currentTime + at, o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g).connect(out); o.start(t); o.stop(t + dur + .02);
  }
  function hiss(dur, freq, { vol = .1, q = 1, type = "bandpass", at = 0 } = {}) {
    if (!ready()) return;
    const t = ac.currentTime + at, s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = noise; f.type = type; f.Q.value = q; f.frequency.value = freq;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    s.connect(f).connect(g).connect(out); s.start(t, Math.random() * .8); s.stop(t + dur + .02);
  }
  let last = 0;
  function paint() { btn.setAttribute("aria-pressed", on); btn.title = on ? "Sound on" : "Sound off"; btn.textContent = on ? "♪" : "♪̸"; }
  paint();
  btn.addEventListener("click", () => {
    on = !on; paint(); store.set("pl-sound", on ? "on" : "off"); init();
    if (ac) out.gain.setTargetAtTime(on ? .7 : 0, ac.currentTime, .03);
    if (on) setTimeout(() => api.click(1.2), 40);
  });
  const api = {
    get on() { return on; },
    // one tooth of the pulley's ratchet
    click(pitch = 1) {
      const n = performance.now(), gap = n - last; if (gap < 34) return; last = n;
      const v = .35 + .65 * clamp((gap - 34) / 110);
      hiss(.022, 3400 * pitch, { vol: .09 * v, q: 4 });
      tone(1900 * pitch, .03, { type: "triangle", vol: .018 * v });
    },
    snap() { hiss(.06, 1800, { vol: .1, q: 1.4 }); tone(620, .12, { type: "triangle", vol: .03, f1: 880 }); },
    row(i) { hiss(.03, 3000 + i * 180, { vol: .03, q: 3 }); },
    land() {
      tone(170, .26, { vol: .13, f1: 85, attack: .003 });
      hiss(.1, 2600, { vol: .06, q: 1.1 });
      tone(1175, .32, { type: "triangle", vol: .022, at: .025 });
    },
  };
  return api;
})();
// arrival events: to polymorphia.dev when embedded, else to our own (usually still locked) audio
function emit(type, extra) {
  if (embed) return tell(Object.assign({ type: "pl-" + type }, extra));
  if (type === "click") SFX.click(extra && extra.p);
  else if (type === "snap") SFX.snap();
  else if (type === "row") SFX.row(extra.i);
  else if (type === "docked") SFX.land();
}

/* ================================================================ the pulley mark */
const MARK = `<img class="mark" src="logo.png" alt="" width="2000" height="2000" draggable="false">`;
const slot = $("#markSlot"), wheelEl = $("#wheel"), rope = $("#rope"), hoist = $("#hoist");
slot.innerHTML = MARK; wheelEl.innerHTML = MARK;
const dockSvg = $(".mark", slot);
// The header wheel turns as things move: by the page's scroll (it is the rope) and by a kick on
// every page change. A ratchet tooth clicks every 30° of that movement. On top of it, like the logo
// on flywheel.polymorphia.dev, it idles round slowly and speeds up while the brand is hovered (that
// part turns silently: it never clicks the ratchet).
const IDLE = 14, HOVER = 300;
let wAngle = resume ? resume.a : 0, wGoal = wAngle, lastTooth = null, arriving = root.classList.contains("arrive");
let omega = IDLE, spun = 0, hoverBrand = false, wLast = performance.now();
function wheelFrame(now) {
  const dt = Math.min(.05, (now - wLast) / 1000); wLast = now;
  omega += ((hoverBrand ? HOVER : IDLE) - omega) * (1 - Math.exp(-dt * (hoverBrand ? 2.2 : .8)));
  if (!reduced && !arriving) { const d = omega * dt; wAngle += d; wGoal += d; spun += d; }
  wAngle += (wGoal - wAngle) * .14;
  if (Math.abs(wGoal - wAngle) < .01) wAngle = wGoal;
  const a = wAngle + scrollY * .45;
  if (!arriving) {
    dockSvg.style.transform = `rotate(${a % 360}deg)`;
    const tooth = Math.floor((a - spun) / 30);
    if (lastTooth !== null && tooth !== lastTooth && !reduced) SFX.click(1 + (tooth % 3) * .04);
    lastTooth = tooth;
  }
  requestAnimationFrame(wheelFrame);
}
$(".brand").addEventListener("pointerenter", () => hoverBrand = true);
$(".brand").addEventListener("pointerleave", () => hoverBrand = false);
requestAnimationFrame(wheelFrame);

/* ================================================================ registry data */
const CACHE = "pl.registry.v1";
let DB = null, loadError = null, listMissing = false, fetchedAt = 0, live = false;
try { const c = JSON.parse(store.get(CACHE, "null")); if (c && Array.isArray(c.users) && Array.isArray(c.dists)) { DB = c; listMissing = !!c.listMissing; fetchedAt = c.at || 0; } } catch (e) { /* ignore */ }

async function getJSON(url, ms = 9000) {
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { Accept: "application/json" } });
    if (!r.ok) { const e = new Error(`HTTP ${r.status}`); e.status = r.status; throw e; }
    return await r.json();
  } finally { clearTimeout(timer); }
}
async function refresh() {
  const [u, d] = await Promise.allSettled([getJSON(API + "/users"), getJSON(API + "/distributions")]);
  if (u.status === "rejected" && d.status === "rejected") {
    loadError = u.reason && u.reason.name === "AbortError" ? "timed out" : (u.reason && u.reason.status ? u.reason.message : "unreachable from this page");
    live = false;
    return false;
  }
  loadError = null; live = true;
  const users = u.status === "fulfilled" && Array.isArray(u.value) ? u.value.map(x => ({ name: String(x.username), joined: x.createdAt || null })) : (DB ? DB.users : []);
  let dists = [];
  if (d.status === "fulfilled" && Array.isArray(d.value)) {
    listMissing = false;
    dists = d.value.map(x => ({ author: String(x.author), name: String(x.distribution || x.name), latest: String(x.latest), releases: +x.releases || 1 }));
  } else listMissing = d.reason && d.reason.status === 404;
  users.sort((a, b) => a.name.localeCompare(b.name));
  dists.sort((a, b) => (a.author + "." + a.name).localeCompare(b.author + "." + b.name));
  fetchedAt = Date.now();
  DB = { users, dists, listMissing, at: fetchedAt };
  store.set(CACHE, JSON.stringify(DB));
  return true;
}

// what a release's archive says about it (kind, description, README, dependencies), cached
const metaMem = new Map(), metaWait = new Map();
const metaKey = (a, n, v) => `${a}/${n}@${v}`;
function cachedMeta(a, n, v) {
  const k = metaKey(a, n, v);
  if (metaMem.has(k)) return metaMem.get(k);
  try { const m = JSON.parse(store.get("pl.meta.v4:" + k, "null")); if (m) { metaMem.set(k, m); return m; } } catch (e) { /* ignore */ }
  return null;
}
function getMeta(a, n, v) {
  const k = metaKey(a, n, v), have = cachedMeta(a, n, v);
  if (have) return Promise.resolve(have);
  if (metaWait.has(k)) return metaWait.get(k);
  const p = (async () => {
    const rel = await getJSON(`${API}/${enc(a)}/${enc(n)}/${enc(v)}`);
    const artifacts = (rel.artifacts || []).map(x => ({ name: String(x.name), size: +x.size || 0, sha256: String(x.sha256 || "") }));
    let meta = { kind: "other", description: "", dependencies: [], fileList: [], readme: null };
    const arc = artifacts.find(x => /\.(tar\.gz|tgz)$/i.test(x.name)) || artifacts[0];
    if (arc) {
      try {
        const r = await fetch(artifactUrl(a, n, v, arc.name));
        if (r.ok) meta = await PulleyPkg.inspect(await r.arrayBuffer());
      } catch (e) { meta.unreadable = true; }
    }
    meta.artifacts = artifacts;
    if (meta.readme && meta.readme.length > 120000) meta.readme = meta.readme.slice(0, 120000) + "\n\n…";
    metaMem.set(k, meta);
    store.set("pl.meta.v4:" + k, JSON.stringify(meta));
    return meta;
  })();
  metaWait.set(k, p);
  p.catch(() => {}).finally(() => metaWait.delete(k));
  return p;
}
const artifactUrl = (a, n, v, name) => `${API}/${enc(a)}/${enc(n)}/${enc(v)}/${name.split("/").map(enc).join("/")}`;
const releasesMem = new Map();
async function getReleases(a, n) {
  const k = a + "/" + n;
  if (releasesMem.has(k)) return releasesMem.get(k);
  const d = await getJSON(`${API}/${enc(a)}/${enc(n)}`);
  const out = { latest: String(d.latest), releases: Array.isArray(d.releases) && d.releases.length ? d.releases.map(String) : [String(d.latest)] };
  releasesMem.set(k, out);
  return out;
}
// Only Flywheel packages (releases with a pulley.toml) are shown. A package's kind is known once
// its latest release has been read; until then it is "checking", and unreadable ones are hidden.
const metaFailed = new Set();
const kindOf = d => { const m = cachedMeta(d.author, d.name, d.latest); return m ? m.kind : metaFailed.has(metaKey(d.author, d.name, d.latest)) ? "unreadable" : null; };
// `unlisted = true` in a package's latest pulley.toml keeps it out of every listing (packages,
// search, user pages, counts); its page still opens from a direct link or a typed address.
const isUnlisted = d => !!(cachedMeta(d.author, d.name, d.latest) || {}).unlisted;
const flywheelDists = list => list.filter(d => kindOf(d) === "flywheel" && !isUnlisted(d));
const checkingDists = list => list.filter(d => kindOf(d) === null);
let refreshQueued = false;
function refreshView() {
  if (refreshQueued) return;
  refreshQueued = true;
  requestAnimationFrame(() => {
    refreshQueued = false;
    if (current.name === "packages" || current.name === "users") renderList(current.name);
    else if (current.name === "user") renderUser(current.user);
    else return;
    renderStats();
    $$(".hz").forEach(el => el.classList.add("in"));
  });
}
// list descriptions: read the latest release of each listed package, three at a time
const metaQueue = []; let metaBusy = 0;
function wantMeta(d) {
  if (cachedMeta(d.author, d.name, d.latest) || metaFailed.has(metaKey(d.author, d.name, d.latest)) || metaQueue.some(x => x === d)) return;
  metaQueue.push(d); pumpMeta();
}
function pumpMeta() {
  while (metaBusy < 3 && metaQueue.length) {
    const d = metaQueue.shift(); metaBusy++;
    getMeta(d.author, d.name, d.latest).then(m => { fillRow(d, m); refreshView(); }, () => { metaFailed.add(metaKey(d.author, d.name, d.latest)); refreshView(); }).finally(() => { metaBusy--; pumpMeta(); });
  }
}
function fillRow(d, m) {
  $$(`.row[data-key="${CSS.escape(d.author + "/" + d.name)}"]`).forEach(row => {
    const desc = $(".desc", row); desc.classList.remove("wait");
    desc.textContent = m ? (m.description || (m.kind === "flywheel" ? "a Flywheel package" : "no description")) : "couldn't read this release";
    const t = $(".tag", row); if (t && m) t.outerHTML = kindTag(m.kind);
    const i = $(".picon", row); if (i && m) i.outerHTML = pkgIcon(m, d.name);
  });
}

/* ================================================================ views */
const view = $("#view"), stats = $("#stats"), q = $("#q");
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
const hue = s => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
function ago(iso) {
  if (!iso) return "";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (!isFinite(s)) return "";
  if (s < 60) return "just now";
  const u = [[31536000, "year"], [2592000, "month"], [86400, "day"], [3600, "hour"], [60, "minute"]].find(([n]) => s >= n);
  return plural(Math.floor(s / u[0]), u[1]) + " ago";
}
const fmtDate = iso => { const d = new Date(iso); return isNaN(d) ? "" : d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }); };
const fmtSize = n => n < 1024 ? n + " B" : n < 1048576 ? (n / 1024).toFixed(1) + " KB" : (n / 1048576).toFixed(1) + " MB";
const kindTag = k => k === "flywheel" ? `<span class="tag flywheel" title="has a pulley.toml">flywheel</span>` : `<span class="tag">package</span>`;
const unlistedTag = m => m && m.unlisted ? ` <span class="tag" title="unlisted = true in pulley.toml: not shown in listings">unlisted</span>` : "";
// `[package] icon` (a data: URL read from the release), or a quiet tile with the name's initial
const pkgIcon = (m, name, cls = "") => m && m.icon
  ? `<img class="picon ${cls}" src="${esc(m.icon)}" alt="" loading="lazy" decoding="async">`
  : `<span class="picon none ${cls}" aria-hidden="true">${esc((name || "?")[0].toUpperCase())}</span>`;
const addrHtml = (a, n) => `<span class="au">${esc(a)}</span><span class="dot">.</span>${esc(n)}`;
const installCmd = (a, n) => `pulley add ${a}.${n}`;
// a distribution whose release was read and has no pulley.toml: not shown, and Pulley refuses it
const foreign = m => !!m && m.kind !== "flywheel" && !m.unreadable;

function pkgRow(d) {
  const m = cachedMeta(d.author, d.name, d.latest), key = d.author + "/" + d.name;
  return `<a class="row pkg hz" href="#/p/${enc(d.author)}/${enc(d.name)}" data-key="${esc(key)}">
    ${pkgIcon(m, d.name)}
    <span class="addr" data-addr="${esc(key)}">${addrHtml(d.author, d.name)}</span>
    <span class="meta">${m ? kindTag(m.kind) : `<span class="tag">…</span>`}<span class="ver">${esc(d.latest)}</span><span class="hide-sm">${plural(d.releases, "release")}</span></span>
    <span class="desc${m ? "" : " wait"}">${m ? esc(m.description || (m.kind === "flywheel" ? "a Flywheel package" : "no description")) : "reading the latest release…"}</span>
  </a>`;
}
function userRow(u) {
  const n = flywheelDists(DB.dists.filter(d => d.author === u.name.toLowerCase())).length;
  return `<a class="row user hz" href="#/u/${enc(u.name)}" data-key="u:${esc(u.name)}">
    <span class="avatar" style="--h:${hue(u.name)}">${esc(u.name[0].toUpperCase())}</span>
    <span class="addr" data-addr="u:${esc(u.name)}">${esc(u.name)}</span>
    <span class="meta"><span class="ver">${listMissing ? "user" : plural(n, "package")}</span></span>
    <span class="desc">${u.joined ? "joined " + esc(ago(u.joined)) : "join date unknown"}</span>
  </a>`;
}
const checkingNote = n => n ? `<div class="note hz" style="margin-top:8px">Checking ${plural(n, "more package")} for a <code>pulley.toml</code>…</div>` : "";
const secH = (label, n) => `<h2 class="sec-h hz">${label} <span class="n">${n}</span><span class="grow"></span></h2>`;
const skeleton = n => `<div class="list">${Array.from({ length: n }, () => `<div class="row skeleton hz"><span class="addr">.</span><span class="desc">.</span></div>`).join("")}</div>`;
function errorNote() {
  return `<div class="note hz">Couldn't read <a href="https://dstbs.wednesware.org" target="_blank" rel="noopener">dstbs.wednesware.org</a> (${esc(loadError || "unknown error")}).
    ${DB ? `Showing what this browser saw ${esc(ago(new Date(fetchedAt).toISOString()))}.` : ""}
    <br><button class="btn sm" type="button" data-act="retry" style="margin-top:10px">Try again</button></div>`;
}
const missingNote = () => `<div class="note hz">This registry doesn't publish a package list yet, so packages can't be browsed here. You can still open one directly: type its address, like <code>author.name</code>, in the search bar.</div>`;
function lookupRow(text) {
  const m = /^([a-z0-9_-]+)\.([a-z0-9_.-]+?)(?:=([\w.-]+))?$/i.exec(text.trim());
  if (!m) return "";
  return `<a class="row hz" href="#/p/${enc(m[1].toLowerCase())}/${enc(m[2].toLowerCase())}${m[3] ? "/" + enc(m[3]) : ""}"><span class="addr">${addrHtml(m[1].toLowerCase(), m[2].toLowerCase())}</span><span class="meta"><span class="ver">open →</span></span><span class="desc">look up this address on ${REGISTRY}</span></a>`;
}

function renderList(kind) {
  if (!DB) { view.innerHTML = loadError ? errorNote() : secH(kind, "…") + skeleton(4); return; }
  const text = q.value.trim().toLowerCase();
  const match = s => !text || s.toLowerCase().includes(text);
  const matching = DB.dists.filter(d => match(d.author + "." + d.name) || match((cachedMeta(d.author, d.name, d.latest) || {}).description || ""));
  const dists = flywheelDists(matching), checking = checkingDists(matching);
  const users = DB.users.filter(u => match(u.name));
  let html = loadError ? errorNote() : "";
  const pk = () => {
    if (listMissing) return secH("packages", "—") + missingNote() + (text ? `<div class="list" style="margin-top:8px">${lookupRow(text)}</div>` : "");
    if (!dists.length && checking.length) return secH("packages", "…") + skeleton(Math.min(checking.length, 4)) + checkingNote(checking.length);
    if (!dists.length) return secH("packages", 0) + `<div class="empty hz">${text ? `No Flywheel packages match <code>${esc(text)}</code>.` : "No Flywheel packages have been published yet."}${text ? `<div class="list" style="margin-top:12px;text-align:left">${lookupRow(text)}</div>` : ""}</div>`;
    return secH("packages", dists.length) + `<div class="list">${dists.map(pkgRow).join("")}</div>` + checkingNote(checking.length);
  };
  const us = () => !users.length ? secH("users", 0) + `<div class="empty hz">${text ? `No users match <code>${esc(text)}</code>.` : "No users yet."}</div>` : secH("users", users.length) + `<div class="list">${users.map(userRow).join("")}</div>`;
  if (text) html += pk() + us();             // searching shows both
  else html += kind === "users" ? us() : pk();
  view.innerHTML = html;
  checking.forEach(wantMeta);
}

function renderPackage(a, n, v) {
  const d = DB && DB.dists.find(x => x.author === a && x.name === n);
  const want = v || (d && d.latest) || null;
  const m0 = want ? cachedMeta(a, n, want) : null;
  // Only Flywheel packages have a page: anything else gets this notice and nothing of its contents.
  const notFlywheel = cls => {
    view.innerHTML = `
    <nav class="crumbs ${cls}"><a href="#/">packages</a><span>/</span><span>${esc(a)}</span><span>/</span><span>${esc(n)}</span></nav>
    <div class="title ${cls}"><h1>${addrHtml(a, n)}</h1></div>
    <div class="empty ${cls}"><code>${esc(a)}.${esc(n)}</code> isn't a Flywheel package: its release has no <code>pulley.toml</code>. This site lists Flywheel packages only, and Pulley installs Flywheel packages only.<br><a class="btn sm" href="#/" style="margin-top:12px">Browse Flywheel packages</a></div>`;
  };
  if (foreign(m0)) return notFlywheel("hz");
  view.innerHTML = `
    <nav class="crumbs hz"><a href="#/">packages</a><span>/</span><a href="#/u/${enc(a)}">${esc(a)}</a><span>/</span><span>${esc(n)}</span></nav>
    <div class="title hz"><span id="pIcon">${pkgIcon(m0, n, "lg")}</span><h1 data-addr="${esc(a + "/" + n)}">${addrHtml(a, n)}</h1><span id="pTag">${m0 ? kindTag(m0.kind) + unlistedTag(m0) : ""}</span><span class="ver" id="pVer">${esc(want || "…")}</span></div>
    <p class="lead hz${m0 ? "" : " wait"}" id="pLead">${m0 ? esc(m0.description || "No description.") : "reading the release…"}</p>
    <div class="cols hz">
      <div>
        <section class="card"><div class="card-h"><span class="title-s" id="pReadmeName">README</span><span class="grow"></span></div><div class="prose" id="pReadme"><p style="color:var(--faint)">loading…</p></div></section>
        <section class="card" id="pFilesCard" hidden><div class="card-h"><span class="title-s">files</span><span class="grow"></span><span id="pFilesN"></span></div><div class="card-b"><ul class="files" id="pFiles"></ul></div></section>
      </div>
      <aside>
        <section class="card"><div class="card-h"><span class="title-s">install</span></div><div class="card-b" id="pInstall"></div></section>
        <section class="card"><div class="card-h"><span class="title-s">about</span></div><div class="card-b"><dl class="facts" id="pFacts"></dl></div></section>
        <section class="card"><div class="card-h"><span class="title-s">releases</span><span class="grow"></span><span id="pRelN"></span></div><ul class="rels" id="pRels"><li style="padding:6px 9px;color:var(--faint)">…</li></ul></section>
        <section class="card"><div class="card-h"><span class="title-s">artifacts</span></div><div class="card-b" id="pArts"><span style="color:var(--faint)">…</span></div></section>
        <section class="card" id="pDepsCard" hidden><div class="card-h"><span class="title-s">dependencies</span><span class="grow"></span><span id="pDepsN"></span></div><div class="card-b"><ul class="deps" id="pDeps"></ul></div></section>
      </aside>
    </div>`;
  const here = location.hash;
  const still = () => location.hash === here;
  const fillInstall = m => {
    // an archive that couldn't be read can't be vouched for, so no install command for it
    if (m && m.kind !== "flywheel") { $("#pInstall").innerHTML = `<p style="margin:0;color:var(--faint);font-size:11.5px">Pulley installs Flywheel packages only, and this release couldn't be read.</p>`; return; }
    const cmd = installCmd(a, n);
    $("#pInstall").innerHTML = `<div class="cmdline"><span class="sig">$</span><code>${esc(cmd)}</code><button class="btn sm ghost" type="button" data-copy="${esc(cmd)}">copy</button></div>` +
      `<p style="margin:8px 0 0;color:var(--faint);font-size:11.5px">New to Pulley? <a href="#/install">Install it</a>.</p>`;
  };
  fillInstall(m0);
  const facts = (rels, m) => {
    const rows = [["address", `${a}.${n}`], ["registry", REGISTRY], ["author", `<a href="#/u/${enc(a)}">${esc(a)}</a>`, true]];
    if (rels) rows.push(["latest", rels.latest]);
    if (m && m.license) rows.push(["license", m.license]);
    if (m && m.main) rows.push(["main", m.main]);
    $("#pFacts").innerHTML = rows.map(([k, v, raw]) => `<dt>${k}</dt><dd>${raw ? v : esc(v)}</dd>`).join("");
  };
  facts(null, m0);
  const fail = msg => { if (!still()) return; $("#pLead").textContent = msg; $("#pLead").classList.add("wait"); $("#pReadme").innerHTML = `<p style="color:var(--faint)">${esc(msg)}</p>`; $("#pArts").textContent = "—"; $("#pRels").innerHTML = ""; };
  getReleases(a, n).then(rels => {
    if (!still()) return;
    const ver = v || rels.latest;
    $("#pVer").textContent = ver;
    $("#pRelN").textContent = rels.releases.length;
    $("#pRels").innerHTML = rels.releases.slice().reverse().map(r => `<li><a href="#/p/${enc(a)}/${enc(n)}/${enc(r)}" aria-current="${r === ver}">${esc(r)}${r === rels.latest ? "<small>latest</small>" : ""}</a></li>`).join("");
    facts(rels, cachedMeta(a, n, ver));
    return getMeta(a, n, ver).then(m => {
      if (!still()) return;
      if (foreign(m)) return notFlywheel("hz in");
      facts(rels, m);
      $("#pTag").innerHTML = kindTag(m.kind) + unlistedTag(m);
      $("#pIcon").innerHTML = pkgIcon(m, n, "lg");
      $("#pLead").textContent = m.description || (m.unreadable ? "This release's archive couldn't be read." : "No description.");
      $("#pLead").classList.toggle("wait", !m.description);
      fillInstall(m);
      $("#pArts").innerHTML = m.artifacts.length ? m.artifacts.map(x => `<div class="art"><div class="nm"><a href="${esc(artifactUrl(a, n, ver, x.name))}" download>${esc(x.name)}</a><span style="color:var(--dim)">${fmtSize(x.size)}</span></div><span class="sha" data-copy="${esc(x.sha256)}" title="copy SHA-256">sha256 ${esc(x.sha256)}</span></div>`).join("") : "none";
      paintReadme(m);
      if (m.fileList && m.fileList.length) { $("#pFilesCard").hidden = false; $("#pFilesN").textContent = m.fileList.length; $("#pFiles").innerHTML = m.fileList.slice(0, 200).map(f => `<li>${esc(f)}</li>`).join(""); }
      if (m.dependencies && m.dependencies.length) { $("#pDepsCard").hidden = false; $("#pDepsN").textContent = m.dependencies.length; $("#pDeps").innerHTML = m.dependencies.map(x => depItem(x, m)).join(""); fillDepIcons(m, still); }
    });
  }).catch(e => fail(e && e.status === 404 ? `${a}.${n}${v ? "=" + v : ""} isn't on ${REGISTRY}.` : `Couldn't read ${a}.${n} from the registry (${e && e.message || "error"}).`));
}
// README: Markdown with Flywheel highlighting; "Try it" opens the code in the flywheel playground
let readmeShown = null;
function paintReadme(m) {
  const box = $("#pReadme"); if (!box) return;
  readmeShown = m;
  if (!m.readme) { box.innerHTML = `<p style="color:var(--faint)">This release has no README.</p>`; return; }
  $("#pReadmeName").textContent = m.readmeName || "README";
  const codes = [];
  const isMd = !/\.txt$/i.test(m.readmeName || "");
  box.innerHTML = isMd ? FwMarkdown.render(m.readme, { codes, tryLabel: "Try it ↗", link: h => /^(https?:|mailto:|#)/.test(h) ? h : "#" }).html : `<pre><code>${esc(m.readme)}</code></pre>`;
  $$(".try", box).forEach(b => b.addEventListener("click", () => window.open(FLYWHEEL + "/#/p/" + b64e(codes[+b.dataset.code]), "_blank", "noopener")));
  $$("a[href^='http']", box).forEach(x => { x.target = "_blank"; x.rel = "noopener"; });
}
FwHighlight.fetch("grammar/flywheel.tmLanguage.json").then(() => { if (readmeShown && $("#pReadme")) paintReadme(readmeShown); }, () => {});
const b64e = s => btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

// A dependency: its package (linked when it is on this registry) with its icon, then the
// constraint, and the import name when that differs from the package name.
const regName = r => String(r || "").replace(/^https?:\/\/(dstbs\.)?/, "").replace(/\/+$/, "");
const onThisRegistry = (x, m) => regName(x.registry || m.registry || REGISTRY) === REGISTRY;
function depItem(x, m) {
  const dev = x.dev ? `<span class="tag">dev</span>` : "";
  if (x.kind !== "registry") {
    const what = x.kind === "git" || x.kind === "path" ? `<span class="tag">${x.kind}</span>` : "";
    return `<li>${pkgIcon(null, x.alias)}<div class="dep-b"><div class="dep-t"><span class="dep-a">${esc(x.alias)}</span>${dev}</div><div class="dep-s">${what}<span class="spec">${esc(x.kind === "git" ? x.url : x.spec)}</span></div></div></li>`;
  }
  const here = onThisRegistry(x, m), full = x.author + "." + x.name, addr = addrHtml(x.author, x.name);
  const name = here ? `<a class="dep-a" href="#/p/${enc(x.author)}/${enc(x.name)}" title="${esc(full)}">${addr}</a>`
    : `<span class="dep-a" title="${esc(full + " on " + (x.registry || m.registry))}">${addr}</span>`;
  const where = here ? "" : `<span class="spec">@${esc(x.registry || m.registry)}</span>`;
  const alias = x.alias !== x.name ? `<span class="spec">import ${esc(x.alias)}</span>` : "";
  return `<li data-dep="${esc(x.author + "/" + x.name)}">${pkgIcon(null, x.name)}<div class="dep-b"><div class="dep-t">${name}${dev}</div><div class="dep-s"><span class="ver sm">${esc(x.constraint === "*" ? "any" : x.constraint)}</span>${where}${alias}</div></div></li>`;
}
// each dependency's icon comes from its own latest release
function fillDepIcons(m, still) {
  for (const x of m.dependencies) {
    if (x.kind !== "registry" || !onThisRegistry(x, m)) continue;
    const d = DB && DB.dists.find(y => y.author === x.author && y.name === x.name);
    (d ? Promise.resolve(d.latest) : getReleases(x.author, x.name).then(r => r.latest))
      .then(v => getMeta(x.author, x.name, v))
      .then(dm => {
        if (!still() || !dm.icon) return;
        $$(`#pDeps li[data-dep="${CSS.escape(x.author + "/" + x.name)}"] .picon`).forEach(el => { el.outerHTML = pkgIcon(dm, x.name); });
      }, () => {});
  }
}

function renderUser(name) {
  const u = DB && DB.users.find(x => x.name.toLowerCase() === name.toLowerCase());
  const own = DB ? DB.dists.filter(d => d.author === name.toLowerCase()) : [];
  const dists = flywheelDists(own), checking = checkingDists(own);
  view.innerHTML = `
    <nav class="crumbs hz"><a href="#/users">users</a><span>/</span><span>${esc(name)}</span></nav>
    <div class="title hz"><span class="avatar" style="--h:${hue(name)};width:42px;height:42px;font-size:19px;border-radius:11px">${esc(name[0].toUpperCase())}</span><h1 data-addr="u:${esc(name)}">${esc(name)}</h1></div>
    <p class="lead hz">${!DB ? "loading…" : u ? (u.joined ? `Joined ${esc(fmtDate(u.joined))} (${esc(ago(u.joined))}).` : "Join date unknown.") : `No user called <code>${esc(name)}</code> on ${REGISTRY}.`}</p>
    ${!DB ? "" : listMissing ? missingNote() : secH("packages", dists.length) + (dists.length ? `<div class="list">${dists.map(pkgRow).join("")}</div>` : checking.length ? "" : `<div class="empty hz">${esc(name)} hasn't published any Flywheel packages yet.</div>`) + checkingNote(checking.length)}`;
  checking.forEach(wantMeta);
}

function renderInstall() {
  const os = /win/i.test(navigator.userAgentData?.platform || navigator.platform || "") ? "windows" : /mac/i.test(navigator.platform || "") ? "macos" : "linux";
  const PREP = {
    linux: ["Arch: sudo pacman -S python python-pipx", "Debian / Ubuntu: sudo apt install python3 pipx", "Fedora: sudo dnf install python3 pipx", "pipx ensurepath"],
    macos: ["brew install python pipx", "pipx ensurepath"],
    windows: ["py -m pip install --user pipx", "py -m pipx ensurepath"],
  };
  const cmd = c => { const [label, code] = c.includes(": ") ? c.split(": ") : ["", c]; return `${label ? `<p style="margin:6px 0 4px;color:var(--faint);font-size:11.5px">${esc(label)}</p>` : ""}<div class="cmdline"><span class="sig">$</span><code>${esc(code)}</code><button class="btn sm ghost" type="button" data-copy="${esc(code)}">copy</button></div>`; };
  view.innerHTML = `
    <div class="title hz"><h1>Install Pulley</h1></div>
    <p class="lead hz">Pulley installs Flywheel packages from Distrobase registries. It needs Python 3.12 or later and <code>git</code>. You'll also want <a href="${FLYWHEEL}">Flywheel</a> itself.</p>
    <div class="cols hz">
      <div class="steps">
        <div class="step"><h3>Python and pipx</h3><p>pipx gives Pulley its own environment and puts <code>pulley</code> on your PATH.</p>
          <div><div class="os-tabs" role="group" aria-label="Operating system">${["linux", "macos", "windows"].map(o => `<button type="button" data-os="${o}" aria-pressed="${o === os}">${o === "macos" ? "macOS" : o[0].toUpperCase() + o.slice(1)}</button>`).join("")}</div><div id="prep">${PREP[os].map(cmd).join("")}</div></div></div>
        <div class="step"><h3>Pulley</h3><p>Install it from PyPI. Open a new terminal afterwards.</p>${cmd("pipx install fw-pulley")}</div>
        <div class="step"><h3>Check it</h3><p><code>pulley where</code> shows the Flywheel installation and package directories it found.</p>${cmd("pulley --version")}${cmd("pulley where")}</div>
        <div class="step"><h3>Use it</h3><p>Start a project and add a package from this registry by its address.</p>${cmd("pulley new app && cd app")}${cmd("pulley add author.package")}${cmd("flywheel run app.fw")}</div>
      </div>
      <aside>
        <section class="card"><div class="card-h"><span class="title-s">commands</span><span class="grow"></span><span>also <code>ppm</code></span></div><div class="card-b"><table class="cmds">
          ${[["add <pkg>", "add a dependency and install it"], ["install", "install everything in pulley.toml"], ["remove <name>", "remove a dependency"], ["update", "move to the newest allowed versions"], ["list --tree", "what is installed"], ["info <address>", "releases, sizes and checksums"], ["publish", "publish as author.name=version"], ["login / register", "registry accounts"]].map(([c, d]) => `<tr><td>${esc(c)}</td><td>${esc(d)}</td></tr>`).join("")}
        </table></div></section>
        <section class="card"><div class="card-h"><span class="title-s">pulley.toml</span></div><div class="prose" style="padding:12px 14px"><pre><code>[package]
name = "app"
author = "you"
version = "alpha-1"

[dependencies]
shapes = "author.shapes=^1.2"</code></pre><p style="margin:0;font-size:12px;color:var(--dim)">The full reference is in the <a href="https://github.com/fwlang/pulley#readme" target="_blank" rel="noopener">README</a>.</p></div></section>
      </aside>
    </div>`;
  $$(".os-tabs button").forEach(b => b.addEventListener("click", () => {
    $$(".os-tabs button").forEach(x => x.setAttribute("aria-pressed", x === b));
    $("#prep").innerHTML = PREP[b.dataset.os].map(cmd).join("");
    SFX.click(1.2);
  }));
}

function renderStats() {
  if (!DB) { stats.innerHTML = loadError ? `<span class="live off"></span>registry unreachable` : `<span class="live"></span>reading dstbs.wednesware.org…`; return; }
  const fw = flywheelDists(DB.dists);
  const rel = fw.reduce((s, d) => s + d.releases, 0);
  const bits = listMissing ? [`<b>${DB.users.length}</b> ${DB.users.length === 1 ? "user" : "users"}`] : [`<b>${fw.length}</b> Flywheel ${fw.length === 1 ? "package" : "packages"}`, `<b>${DB.users.length}</b> ${DB.users.length === 1 ? "user" : "users"}`, `<b>${rel}</b> ${rel === 1 ? "release" : "releases"}`];
  stats.innerHTML = `<span class="live${live ? "" : " off"}"></span>${bits.join(" · ")} · ${live ? "live from" : "cached from"} dstbs.wednesware.org`;
}

/* ================================================================ routing */
function parseRoute(hash = location.hash) {
  const p = hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(s => { try { return decodeURIComponent(s); } catch (e) { return s; } });
  if (p[0] === "p" && p[1] && p[2]) return { name: "package", depth: 2, a: p[1].toLowerCase(), n: p[2].toLowerCase(), v: p[3] || null, key: p[1].toLowerCase() + "/" + p[2].toLowerCase() };
  if (p[0] === "u" && p[1]) return { name: "user", depth: 1, user: p[1], key: "u:" + p[1] };
  if (p[0] === "users") return { name: "users", depth: 0 };
  if (p[0] === "install") return { name: "install", depth: 0 };
  return { name: "packages", depth: 0 };
}
let current = parseRoute();
function render() {
  current = parseRoute();
  const tab = current.name === "user" ? "users" : current.name === "package" ? "packages" : current.name;
  $$("nav.tabs a").forEach(a => { if (a.dataset.view === tab) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
  if (current.name === "package") renderPackage(current.a, current.n, current.v);
  else if (current.name === "user") renderUser(current.user);
  else if (current.name === "install") renderInstall();
  else renderList(current.name);
  renderStats();
  document.title = current.name === "package" ? `${current.a}.${current.n} · Pulley` : current.name === "user" ? `${current.user} · Pulley` : "Pulley";
  if (!arriving) $$(".hz").forEach(el => el.classList.add("in"));
}
// Page changes: the old page is lowered and the new one hoisted up (reversed going back), the
// address flies between a list row and the page title, and the header wheel turns a few teeth.
function navigate() {
  const prev = current, next = parseRoute();
  const back = next.depth < prev.depth || (next.depth === prev.depth && next.name === "packages" && prev.name !== "packages");
  wGoal += back ? -120 : 120;
  if (!document.startViewTransition || reduced || arriving) { render(); scrollTo(0, 0); return; }
  const shared = next.key || prev.key;
  const tag = () => { if (!shared) return; const el = $(`#view [data-addr="${CSS.escape(shared)}"]`); if (el) el.style.viewTransitionName = "addr"; };
  tag();
  root.classList.toggle("nav-back", back);
  const vt = document.startViewTransition(() => { render(); scrollTo(0, 0); tag(); });
  vt.finished.finally(() => { root.classList.remove("nav-back"); $$("#view [data-addr]").forEach(el => el.style.viewTransitionName = ""); });
}
addEventListener("hashchange", navigate);

// search: filters as you type, from any page
q.addEventListener("input", () => {
  if (current.name !== "packages" && current.name !== "users") { history.replaceState(null, "", "#/"); current = parseRoute(); render(); }
  else renderList(current.name);
  if (!arriving) $$(".hz").forEach(el => el.classList.add("in"));
  SFX.click(1.25);
});
q.addEventListener("keydown", e => {
  if (e.key === "Escape") { q.value = ""; q.dispatchEvent(new Event("input")); return; }
  if (e.key !== "Enter") return;
  const first = $("#view a.row");
  if (first) { location.hash = first.getAttribute("href"); q.blur(); }
});
addEventListener("keydown", e => {
  if (e.key === "/" && document.activeElement !== q && !/input|textarea/i.test(document.activeElement.tagName)) { e.preventDefault(); q.focus(); q.select(); }
});
document.addEventListener("click", e => {
  const c = e.target.closest("[data-copy]"); if (c) { copy(c.dataset.copy, c.classList.contains("sha") ? "SHA-256 copied" : "copied"); return; }
  const r = e.target.closest("[data-act='retry']"); if (r) { r.disabled = true; refresh().then(render); }
});

/* ================================================================ the hand-off */
const BAR = $("#bar");
// where polymorphia.dev's hoisted wheel hangs: over the middle of the bar, in the header's line
function spot() {
  const b = BAR.getBoundingClientRect();
  return { cx: b.left + b.width / 2, cy: 28, size: 40 };
}
function barRect() { const b = BAR.getBoundingClientRect(); return { l: b.left, t: b.top, w: b.width, h: b.height }; }
function placeWheel(cx, cy, size, angle) {
  wheelEl.style.width = wheelEl.style.height = size + "px";
  wheelEl.style.transform = `translate(${cx - size / 2}px, ${cy - size / 2}px) rotate(${angle % 360}deg)`;
}
function placeRope(x, y0, y1) {
  rope.style.height = Math.max(0, y1 - y0) + "px";
  rope.style.transform = `translate(${x - 1}px, ${y0}px)`;
}
const hz = () => $$(".hz").slice(0, 16);

// The arrival: the rope reels in, the wheel rolls along the header into its place, and the page's
// content is hoisted in under it. Starts exactly where polymorphia.dev's hoist ended.
function arrive(a0) {
  const s = spot(), r = s.size / 2, b = BAR.getBoundingClientRect(), L0 = b.top - (s.cy + r);
  const dock = slot.getBoundingClientRect(), dx = dock.left + dock.width / 2, dy = dock.top + dock.height / 2;
  const items = hz(), uis = $$(".ui");
  const DEG = 180 / Math.PI;
  let snapped = false, docked = false, tooth = Math.floor(a0 / 30), t0 = null, rowsAt = [];
  const rowStart = .42, rowGap = .055;
  const settleAt = Math.max(1.5, rowStart + items.length * rowGap + .6);
  placeWheel(s.cx, s.cy, s.size, a0); placeRope(s.cx, s.cy + r, b.top);
  hoist.style.display = "block"; wheelEl.style.display = "block";
  dockSvg.style.visibility = "hidden";       // the travelling wheel becomes this one when it lands
  uis.forEach((el, i) => setTimeout(() => el.classList.add("in"), 250 + i * 70));
  setTimeout(() => BAR.classList.add("in"), 300);
  items.forEach((el, i) => rowsAt.push(rowStart + i * rowGap));
  let angle = a0;
  function step(now) {
    if (t0 === null) t0 = now;
    const t = (now - t0) / 1000;
    // reel in the rope: the wheel turns by the rope's length
    const k1 = eio(clamp(t / .32));
    const reel = L0 * k1;
    // roll to the dock: turning as it rolls, shrinking into the header slot
    const k2 = eio(clamp((t - .18) / .82));
    const cx = lerp(s.cx, dx, k2), cy = lerp(s.cy, dy, k2), size = lerp(s.size, dock.width, k2);
    angle = a0 + reel / r * DEG - (s.cx - cx) / r * DEG;
    if (!docked) placeWheel(cx, cy, size, angle);
    placeRope(s.cx, s.cy + r, s.cy + r + (L0 - reel));
    rope.style.opacity = k1 >= 1 ? 0 : 1;
    const th = Math.floor(angle / 30);
    if (th !== tooth) { tooth = th; emit("click", { p: 1 + (k2 * .3) }); }
    if (!snapped && t >= .32) { snapped = true; emit("snap"); }
    rowsAt.forEach((at, i) => { if (at !== null && t >= at) { items[i].classList.add("in"); rowsAt[i] = null; if (i < 10) emit("row", { i }); } });
    if (!docked && t >= 1) {
      docked = true; wheelEl.style.display = "none"; dockSvg.style.visibility = "";
      wAngle = wGoal = angle - scrollY * .45; lastTooth = null;
      dockSvg.style.transform = `rotate(${angle % 360}deg)`;
      emit("docked");
    }
    if (t >= settleAt) {
      arriving = false; root.classList.remove("arrive"); hoist.style.display = "";
      if (pendingRender) { pendingRender = false; render(); }
      $$(".hz").forEach(el => el.classList.add("in"));
      tell({ type: "pl-settled", a: +(angle % 360).toFixed(2), t: Date.now() });
      return;
    }
    requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
  // polymorphia.dev hides its own wheel and button once ours has painted
  requestAnimationFrame(() => requestAnimationFrame(() => tell({ type: "pl-live" })));
}

// back to polymorphia.dev: the reverse. The content is lowered away, the wheel rolls back out to
// hang over the bar, the rope drops to it, and polymorphia.dev lowers the bar into its button.
let leaving = false;
async function goPolymorphia() {
  if (leaving) return;
  if (reduced) { location.href = POLY + "/#main"; return; }
  leaving = true;
  if (scrollY > 2) { scrollTo({ top: 0, behavior: "smooth" }); for (let i = 0; i < 30 && scrollY > 2; i++) await new Promise(r => setTimeout(r, 20)); scrollTo(0, 0); }
  if (document.activeElement) document.activeElement.blur();
  const s = spot(), r = s.size / 2, b = BAR.getBoundingClientRect(), L = b.top - (s.cy + r);
  const dock = slot.getBoundingClientRect(), dx = dock.left + dock.width / 2, dy = dock.top + dock.height / 2;
  const a0 = wAngle + scrollY * .45, DEG = 180 / Math.PI;
  root.classList.add("leaving");
  arriving = true;            // the dock wheel stops following the scroll; the travelling one takes over
  hoist.style.display = "block"; wheelEl.style.display = "block"; rope.style.opacity = 1;
  dockSvg.style.visibility = "hidden";
  placeWheel(dx, dy, dock.width, a0); placeRope(s.cx, s.cy + r, s.cy + r);
  let t0 = null, tooth = Math.floor(a0 / 30), angle = a0;
  function step(now) {
    if (t0 === null) t0 = now;
    const t = (now - t0) / 1000;
    const k1 = eio(clamp(t / .62)), k2 = eio(clamp((t - .5) / .3));
    const cx = lerp(dx, s.cx, k1), cy = lerp(dy, s.cy, k1), size = lerp(dock.width, s.size, k1);
    angle = a0 + (cx - dx) / r * DEG + L * k2 / r * DEG;
    placeWheel(cx, cy, size, angle);
    placeRope(s.cx, s.cy + r, s.cy + r + L * k2);
    const th = Math.floor(angle / 30);
    if (th !== tooth) { tooth = th; SFX.click(1.1 - k1 * .2); }
    if (t >= .86) {
      const p = new URLSearchParams({ from: "pl", a: (angle % 360).toFixed(2), bl: b.left.toFixed(1), bt: b.top.toFixed(1), bw: b.width.toFixed(1), bh: b.height.toFixed(1), wx: s.cx.toFixed(1), wy: s.cy, ws: s.size, snd: SFX.on ? 1 : 0, t: Date.now() });
      location.href = POLY + "/#" + p;
      return;
    }
    requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}
$("#back").addEventListener("click", e => { if (e.button || e.metaKey || e.ctrlKey || e.shiftKey) return; e.preventDefault(); goPolymorphia(); });
addEventListener("pageshow", e => {
  if (!e.persisted || !leaving) return;
  leaving = false; arriving = false; root.classList.remove("leaving"); hoist.style.display = ""; dockSvg.style.visibility = "";
});

/* ================================================================ start */
render();
// fresh data re-renders the page, except mid-arrival, where it would swap rows being hoisted in
let pendingRender = false;
const fresh = refresh().then(ok => {
  if (arriving && !root.classList.contains("embed-wait")) pendingRender = true;
  else if (ok || !DB) render(); else renderStats();
  return ok;
});
const fontsReady = document.fonts ? document.fonts.ready : Promise.resolve();
if (embed) {
  // ready once the first frame can be painted with real content: the registry (or the cache, or
  // after 1.5 s whatever we have) and the fonts, so the bar's text lines up with the button's
  const data = DB ? Promise.resolve() : Promise.race([fresh, new Promise(r => setTimeout(r, 1500))]);
  Promise.all([data, fontsReady]).then(() => {
    render();
    tell({ type: "pl-ready", bar: barRect(), wheel: spot() });
  });
  addEventListener("message", e => {
    if (e.origin !== embed || !e.data || e.data.type !== "pm-go" || !root.classList.contains("embed-wait")) return;
    root.classList.remove("embed-wait");
    arrive(+e.data.a || 0);
  });
} else if (direct && arriving) {
  if (reduced) { arriving = false; root.classList.remove("arrive"); render(); }
  else {
    const data = DB ? Promise.resolve() : Promise.race([fresh, new Promise(r => setTimeout(r, 1200))]);
    Promise.all([data, fontsReady]).then(() => { render(); arrive(0); });
  }
}
})();
