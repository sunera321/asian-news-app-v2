// app.js — Asia Economic Lens v8 frontend

const REGIONS = {
  "South Asia":     ["LK","IN","PK","BD"],
  "East Asia":      ["CN","JP","KR"],
  "Southeast Asia": ["SG","MY","TH","ID","PH","VN"],
  "Central Asia":   ["KZ"],
  "West Asia":      ["AE"],
};

const COUNTRIES = {
  LK: { name:"Sri Lanka",   emoji:"🇱🇰", region:"South Asia",     economy:"IMF programme, tea & garment exports, tourism recovery" },
  IN: { name:"India",       emoji:"🇮🇳", region:"South Asia",     economy:"Largest emerging market, IT hub, G20 member" },
  PK: { name:"Pakistan",    emoji:"🇵🇰", region:"South Asia",     economy:"IMF programme, textile exports, energy crisis" },
  BD: { name:"Bangladesh",  emoji:"🇧🇩", region:"South Asia",     economy:"Garment export giant, remittance-dependent" },
  CN: { name:"China",       emoji:"🇨🇳", region:"East Asia",      economy:"World's second largest economy, manufacturing powerhouse" },
  JP: { name:"Japan",       emoji:"🇯🇵", region:"East Asia",      economy:"Advanced economy, auto & electronics exports" },
  KR: { name:"South Korea", emoji:"🇰🇷", region:"East Asia",      economy:"Semiconductor giant, K-culture exports" },
  SG: { name:"Singapore",   emoji:"🇸🇬", region:"Southeast Asia", economy:"Global financial & logistics hub" },
  MY: { name:"Malaysia",    emoji:"🇲🇾", region:"Southeast Asia", economy:"Palm oil, semiconductor assembly, commodities" },
  TH: { name:"Thailand",    emoji:"🇹🇭", region:"Southeast Asia", economy:"Tourism-heavy, auto manufacturing, rice exports" },
  ID: { name:"Indonesia",   emoji:"🇮🇩", region:"Southeast Asia", economy:"Nickel & coal powerhouse, G20 member" },
  PH: { name:"Philippines", emoji:"🇵🇭", region:"Southeast Asia", economy:"BPO services hub, OFW remittances" },
  VN: { name:"Vietnam",     emoji:"🇻🇳", region:"Southeast Asia", economy:"China+1 manufacturing shift, fast-growing" },
  KZ: { name:"Kazakhstan",  emoji:"🇰🇿", region:"Central Asia",   economy:"Oil-dependent, commodity exporter" },
  AE: { name:"UAE",         emoji:"🇦🇪", region:"West Asia",      economy:"Oil wealth, Dubai global hub, fintech" },
};

// Topic → gradient + icon for fallback placeholder (used only if Pollinations fails)
const VISUALS = [
  [/tariff|trade|export|import|wto|sanction/i,        "#1a3a5c","#0f2744","🌐","Trade"],
  [/tech|ai|chip|semiconductor|digital|cyber/i,       "#1a1a4a","#0f0f30","💻","Technology"],
  [/oil|gas|fuel|energy|opec|coal|solar/i,            "#3a2a0f","#261a08","⚡","Energy"],
  [/bank|financ|invest|stock|bond|fund/i,             "#1a3a2a","#0f2218","📊","Finance"],
  [/politic|govern|minister|election|parliament/i,    "#3a1a1a","#260f0f","🏛️","Policy"],
  [/market|index|shares|equit/i,                      "#2a1a3a","#1a0f26","📈","Markets"],
  [/health|pharma|medic|hospital/i,                   "#1a2a1a","#0f1a0f","🏥","Healthcare"],
  [/climate|green|carbon|emission|renewabl/i,         "#0f2a1a","#081a0f","🌿","Climate"],
];

function getVisual(title, sectors) {
  const text = [title, ...(sectors||[])].join(" ");
  for (const [re, c1, c2, icon, label] of VISUALS) {
    if (re.test(text)) return { c1, c2, icon, label };
  }
  return { c1:"#1e2d3d", c2:"#0f1a26", icon:"📰", label:"Global News" };
}

// ── Pollinations.AI — free, no-key, reliable image generation ─────────────
// https://image.pollinations.ai/prompt/{text}?width=W&height=H&seed=N&nologo=true
// 100% reliable since it's our own generated URL — no CDN hotlink blocking possible.

// Editorial photography prompt — kept SHORT for faster Flux/Turbo generation.
// Long prompts measurably slow down generation time on Pollinations.
function buildImagePrompt(title, sectors) {
  const topic = (sectors && sectors[0]) || extractTopicWord(title);
  return `editorial photo, ${topic}, business news, professional photography`;
}

// Pull one strong keyword out of the title as a topic fallback
function extractTopicWord(title) {
  const t = (title || "").toLowerCase();
  if (/tariff|trade|export|import/.test(t))    return "international trade";
  if (/tech|ai|chip|software/.test(t))         return "technology";
  if (/oil|gas|energy|fuel/.test(t))           return "energy industry";
  if (/bank|financ|invest|stock|market/.test(t)) return "finance";
  if (/politic|govern|minister|election/.test(t)) return "government";
  if (/health|pharma|medic/.test(t))           return "healthcare";
  return "global economy";
}

// Deterministic seed from title so the SAME story always gets the SAME image
function seedFromText(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 100000;
}

function getPollinationsUrl(title, sectors, width, height) {
  const prompt = buildImagePrompt(title, sectors);
  const seed   = seedFromText(title || "news");
  const params = new URLSearchParams({
    width:  String(width),
    height: String(height),
    seed:   String(seed),
    nologo: "true",
    model:  "turbo",   // turbo is much faster than flux — better for 10 simultaneous loads
  });
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?${params}`;
}

// ── Build image element ────────────────────────────────────────────────────
let imgDebugCounter = 0;
let imgLoadQueue     = 0; // staggers requests so we don't fire 10 at once

function buildImgEl(item, large) {
  const container = document.createElement("div");
  container.className = "story-img-wrap";

  // Smaller dimensions = much faster generation on Pollinations turbo model
  const width  = large ? 700 : 480;
  const height = large ? 440 : 300;

  const img = document.createElement("img");
  img.alt     = item.title || "";
  img.loading = "lazy";
  img.style.cssText = "width:100%;height:100%;object-fit:cover;display:block;background:#1a2433;opacity:0;transition:opacity .3s ease;";

  const debugId   = ++imgDebugCounter;
  const url       = getPollinationsUrl(item.title, item.sectors, width, height);
  const staggerMs = imgLoadQueue * 350;   // space out requests by 350ms each
  imgLoadQueue++;

  console.log(`%c[IMG #${debugId}] QUEUED (+${staggerMs}ms delay)`, "color:#888", { title:(item.title||"").slice(0,50), url });

  img.onload = function() {
    this.style.opacity = "1";
    console.log(`%c[IMG #${debugId}] ✅ LOADED`, "color:#0a0", { naturalWidth:this.naturalWidth, src:this.src });
  };

  img.onerror = function() {
    console.error(`%c[IMG #${debugId}] ❌ FAILED`, "color:#c00;font-weight:bold", { attemptedUrl:this.src });
    const v = getVisual(item.title, item.sectors);
    const size = large ? "280px" : "180px";
    container.innerHTML = `
      <div style="background:linear-gradient(135deg,${v.c1},${v.c2});
                  min-height:${size};width:100%;height:100%;
                  display:flex;align-items:center;justify-content:center;
                  flex-direction:column;gap:.5rem;">
        <span style="font-size:${large?"3rem":"2rem"};opacity:.65;">${v.icon}</span>
        <span style="font-family:var(--f-ui);font-size:.65rem;font-weight:700;
                     letter-spacing:.1em;text-transform:uppercase;
                     color:rgba(255,255,255,.3);">${v.label}</span>
      </div>`;
  };

  // Stagger image requests so we don't hit Pollinations with 10 parallel
  // generation jobs at once — this was the real cause of the failures.
  setTimeout(() => { img.src = url; }, staggerMs);

  container.appendChild(img);
  return container;
}

// Clean NewsData descriptions — strips appended source names & truncates
function cleanDesc(text) {
  if (!text) return "";
  // NewsData appends source names like "Reuters Bloomberg CBC Canada"
  // Strategy: find the first sentence end and use that if reasonable
  const sentenceEnd = text.search(/\.\s+[A-Z]|\?\s+[A-Z]|!\s+[A-Z]/);
  if (sentenceEnd > 60 && sentenceEnd < 220) {
    // Take up to second sentence end
    const secondEnd = text.search(new RegExp(`[\.?!]\\s+[A-Z]`, "g"));
    const cutAt = sentenceEnd + 1;
    return text.slice(0, cutAt).trim();
  }
  // Fallback: truncate at 200 chars at word boundary
  let t = text.slice(0, 200);
  const lastSpace = t.lastIndexOf(" ");
  if (lastSpace > 100) t = t.slice(0, lastSpace);
  return t.trim();
}

// ── State ─────────────────────────────────────────────────
let currentCountry = null;
let currentData    = null;
let currentFilter  = "all";
const sessionCache = {};
const CACHE_TTL    = 60 * 60 * 1000;

// ── DOM refs ──────────────────────────────────────────────
const homepage      = document.getElementById("homepage");
const newspage      = document.getElementById("newspage");
const mastheadNav   = document.getElementById("mastheadNav");
const navBack       = document.getElementById("navBack");
const navCountry    = document.getElementById("navCountry");
const navRefresh    = document.getElementById("navRefresh");
const sectionRibbon = document.getElementById("sectionRibbon");
const newsFeed      = document.getElementById("newsFeed");
const regionGrid    = document.getElementById("regionGrid");
const homeLink      = document.getElementById("homeLink");
const topBarDate    = document.getElementById("topBarDate");
const cmFlag        = document.getElementById("cmFlag");
const cmKicker      = document.getElementById("cmKicker");
const cmHeadline    = document.getElementById("cmHeadline");
const cmSub         = document.getElementById("cmSub");
const rStat1        = document.getElementById("rStat1");
const rStat2        = document.getElementById("rStat2");
const rStat3        = document.getElementById("rStat3");
const rStat4        = document.getElementById("rStat4");
const filterBtns    = document.querySelectorAll(".rf");

topBarDate.textContent = new Date().toLocaleDateString("en-GB", {
  weekday:"long", day:"numeric", month:"long", year:"numeric"
});

// ── Build homepage ────────────────────────────────────────
function buildHomepage() {
  regionGrid.innerHTML = "";
  for (const [region, codes] of Object.entries(REGIONS)) {
    const block = document.createElement("div");
    block.className = "region-block";
    block.innerHTML = `<div class="region-heading">${region}</div>`;
    const cards = document.createElement("div");
    cards.className = "country-cards";
    codes.forEach(code => {
      const c    = COUNTRIES[code];
      const card = document.createElement("div");
      card.className = "country-card" + (sessionCache[code] ? " cached" : "");
      card.dataset.code = code;
      card.innerHTML = `
        <span class="cc-flag">${c.emoji}</span>
        <span class="cc-info">
          <span class="cc-name">${c.name}</span>
          <span class="cc-region">${c.region}</span>
        </span>`;
      card.addEventListener("click", () => selectCountry(code));
      cards.appendChild(card);
    });
    block.appendChild(cards);
    regionGrid.appendChild(block);
  }
}

// ── Select country ────────────────────────────────────────
async function selectCountry(code, forceRefresh = false) {
  currentCountry = code;
  currentFilter  = "all";
  filterBtns.forEach(b => b.classList.toggle("active", b.dataset.filter === "all"));

  const c = COUNTRIES[code];
  mastheadNav.style.display = "flex";
  navCountry.textContent    = `${c.emoji} ${c.name}`;
  cmFlag.textContent        = c.emoji;
  cmKicker.textContent      = `${c.region} · Economic Impact Briefing`;
  cmHeadline.textContent    = c.name;
  cmSub.textContent         = c.economy;

  homepage.style.display      = "none";
  newspage.style.display      = "block";
  sectionRibbon.style.display = "block";
  window.scrollTo({ top:0, behavior:"smooth" });

  if (!forceRefresh && sessionCache[code] && Date.now() - sessionCache[code].ts < CACHE_TTL) {
    renderData(sessionCache[code].data);
    return;
  }
  await loadNews(code);
}

// ── Load from API ─────────────────────────────────────────
async function loadNews(code) {
  navRefresh.disabled = true;
  navRefresh.classList.add("spinning");
  sectionRibbon.style.display = "none";
  showSkeletons();

  try {
    const res  = await fetch(`/api/news?country=${code}`);
    if (!res.ok) throw new Error(`Server error ${res.status}`);
    const data = await res.json();
    sessionCache[code] = { data, ts: Date.now() };
    document.querySelectorAll(".country-card").forEach(el =>
      el.classList.toggle("cached", !!sessionCache[el.dataset.code])
    );
    renderData(data);
  } catch (err) {
    showError(err.message);
  } finally {
    navRefresh.disabled = false;
    navRefresh.classList.remove("spinning");
  }
}

// ── Render data ───────────────────────────────────────────
function renderData(data) {
  currentData   = data;
  const items   = data.newsAnalysis || [];
  const pos     = items.filter(i => i.sentiment === "positive").length;
  const neg     = items.filter(i => i.sentiment === "negative").length;
  const updated = data.lastUpdated
    ? new Date(data.lastUpdated).toLocaleTimeString("en-US", { hour:"2-digit", minute:"2-digit" })
    : "—";

  rStat1.textContent = `${items.length} stories`;
  rStat2.textContent = `↑ ${pos} positive`;
  rStat3.textContent = `↓ ${neg} negative`;
  rStat4.textContent = `Updated ${updated}`;
  sectionRibbon.style.display = "block";
  renderFeed(items);
}

// ── Render feed ───────────────────────────────────────────
function renderFeed(items) {
  imgLoadQueue = 0; // reset stagger counter for fresh render

  const filtered = currentFilter === "all"
    ? items : items.filter(i => i.sentiment === currentFilter);

  newsFeed.innerHTML = "";

  if (!filtered.length) {
    newsFeed.innerHTML = `
      <div class="feed-state">
        <div class="feed-state-icon">🔍</div>
        <h3>No ${currentFilter} stories</h3>
        <p>No stories match this filter right now.</p>
      </div>`;
    return;
  }

  const c = COUNTRIES[currentCountry];

  // Hero card
  newsFeed.appendChild(buildFeaturedCard(filtered[0], c));

  // Secondary grid — 3 cols
  const secondary = filtered.slice(1, 4);
  if (secondary.length) {
    newsFeed.appendChild(sectionLabel("Latest Analysis"));
    const grid = el("div","story-grid");
    secondary.forEach((item, i) => {
      const card = buildStoryCard(item, c);
      card.style.animationDelay = `${i * 0.07}s`;
      grid.appendChild(card);
    });
    newsFeed.appendChild(grid);
  }

  // Rest — 2 cols
  const rest = filtered.slice(4);
  if (rest.length) {
    newsFeed.appendChild(sectionLabel("More Stories"));
    const grid2 = el("div","story-grid-2");
    rest.forEach((item, i) => {
      const card = buildStoryCard(item, c);
      card.style.animationDelay = `${i * 0.05}s`;
      grid2.appendChild(card);
    });
    newsFeed.appendChild(grid2);
  }
}

// ── Featured (hero) card — built with DOM API, no innerHTML for images ────
function buildFeaturedCard(item, country) {
  const wrap = el("div","story-featured");

  // Image column
  const imgCol = el("div","story-img");
  imgCol.appendChild(buildImgEl(item, true));

  // Body column
  const body = el("div","story-body");
  body.innerHTML = `
    <div>
      <div class="story-meta">
        ${sentimentBadge(item.sentiment)}
        ${(item.sectors||[]).slice(0,3).map(s=>`<span class="sector-pill">${esc(s)}</span>`).join("")}
      </div>
      <h2 class="story-headline">${esc(item.title)}</h2>
      <p class="story-desc">${esc(cleanDesc(item.description))}</p>
    </div>
    <div class="impact-dispatch">
      <div class="impact-dispatch-label">
        <span class="flag">${country.emoji}</span>
        Impact on ${esc(country.name)}
      </div>
      <p class="impact-dispatch-text">${esc(item.impact)}</p>
    </div>`;

  wrap.appendChild(imgCol);
  wrap.appendChild(body);
  return wrap;
}

// ── Standard story card ───────────────────────────────────
function buildStoryCard(item, country) {
  const wrap = el("div",`story-card border-${item.sentiment||"neutral"}`);

  // Image — built with DOM, no innerHTML
  const imgWrap = el("div","story-img");
  imgWrap.appendChild(buildImgEl(item, false));
  wrap.appendChild(imgWrap);

  // Body
  const pubDate = item.pubDate
    ? new Date(item.pubDate).toLocaleDateString("en-GB",{day:"numeric",month:"short"})
    : "";

  const body = el("div","story-body");
  body.innerHTML = `
    <div class="story-meta">
      ${sentimentBadge(item.sentiment)}
      ${(item.sectors||[]).slice(0,2).map(s=>`<span class="sector-pill">${esc(s)}</span>`).join("")}
    </div>
    <h3 class="story-headline">${esc(item.title)}</h3>
    <p class="story-desc">${esc(cleanDesc(item.description))}</p>
    <div class="impact-dispatch">
      <div class="impact-dispatch-label">
        <span class="flag">${country.emoji}</span>
        Impact on ${esc(country.name)}
      </div>
      <p class="impact-dispatch-text">${esc(item.impact)}</p>
    </div>`;
  wrap.appendChild(body);

  // Footer
  const footer = el("div","story-footer");
  footer.innerHTML = `
    <span class="story-date">${pubDate}</span>
    ${item.link ? `<a href="${esc(item.link)}" target="_blank" rel="noopener" class="story-bbc"><span class="story-bbc-icon">Read</span> ›</a>` : ""}`;
  wrap.appendChild(footer);

  return wrap;
}

// ── Helpers ───────────────────────────────────────────────
function sentimentBadge(s) {
  const map = { positive:"↑ Positive", negative:"↓ Negative", mixed:"~ Mixed", neutral:"→ Neutral" };
  return `<span class="sentiment-tag sent-${s||"neutral"}">${map[s]||"→ Neutral"}</span>`;
}
function sectionLabel(text) {
  const d = document.createElement("div");
  d.className = "feed-section-label";
  d.textContent = text;
  return d;
}
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls)  e.className   = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
function esc(str) {
  return String(str||"")
    .replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

// ── Skeletons ─────────────────────────────────────────────
function showSkeletons() {
  newsFeed.innerHTML = `
    <div class="skel-grid">
      ${Array.from({length:6},()=>`
        <div class="skel-card">
          <div class="skel-img"></div>
          <div class="skel-body">
            <div class="skel-line w80"></div>
            <div class="skel-line"></div>
            <div class="skel-line w60"></div>
            <div class="skel-line h32"></div>
          </div>
        </div>`).join("")}
    </div>`;
}
function showError(msg) {
  newsFeed.innerHTML = `
    <div class="feed-state">
      <div class="feed-state-icon">⚠️</div>
      <h3>Couldn't load analysis</h3>
      <p>${esc(msg||"Something went wrong.")}</p>
      <button class="retry-btn" onclick="loadNews('${currentCountry}')">Try Again</button>
    </div>`;
}

// ── Filters ───────────────────────────────────────────────
filterBtns.forEach(btn => {
  btn.addEventListener("click", () => {
    currentFilter = btn.dataset.filter;
    filterBtns.forEach(b => b.classList.toggle("active", b===btn));
    if (currentData) renderFeed(currentData.newsAnalysis||[]);
  });
});

// ── Navigation ────────────────────────────────────────────
navRefresh.addEventListener("click", () => {
  if (currentCountry) { delete sessionCache[currentCountry]; loadNews(currentCountry); }
});
navBack.addEventListener("click", goHome);
homeLink.addEventListener("click", e => { e.preventDefault(); goHome(); });

function goHome() {
  currentCountry = currentData = null;
  currentFilter  = "all";
  homepage.style.display      = "block";
  newspage.style.display      = "none";
  mastheadNav.style.display   = "none";
  sectionRibbon.style.display = "none";
  buildHomepage();
  window.scrollTo({ top:0, behavior:"smooth" });
}

// ── Diagnostics ───────────────────────────────────────────
// Runs once on page load. Open DevTools Console (F12) to see results.
// Tells you definitively whether Pollinations.AI is reachable from YOUR browser.
async function runImageDiagnostics() {
  console.log("%c━━━ IMAGE DIAGNOSTICS ━━━", "color:#C0392B;font-weight:bold;font-size:14px");

  const banner = document.getElementById("debugBanner");
  function showBanner(text, isError) {
    if (!banner) return;
    banner.style.display = "block";
    banner.style.background = isError ? "#3a1a1a" : "#1a3a1a";
    banner.textContent = text;
  }

  const testUrl = "https://image.pollinations.ai/prompt/test%20image?width=64&height=64&nologo=true";
  console.log("[DIAG] Testing Pollinations reachability:", testUrl);
  showBanner("🔍 Testing image service reachability...", false);

  const testImg = new Image();
  const diagStart = performance.now();

  testImg.onload = () => {
    const ms = Math.round(performance.now() - diagStart);
    console.log(`%c[DIAG] ✅ Pollinations IS reachable (loaded in ${ms}ms)`, "color:#0a0;font-weight:bold");
    console.log("[DIAG] If story images still aren't showing, the issue is in buildImgEl() logic, not network.");
    showBanner(`✅ Image service OK (${ms}ms) — if cards still show no image, check console for per-card [IMG #N] errors.`, false);
    setTimeout(() => { if (banner) banner.style.display = "none"; }, 6000);
  };
  testImg.onerror = () => {
    const ms = Math.round(performance.now() - diagStart);
    console.error(`%c[DIAG] ❌ Pollinations NOT reachable (failed after ${ms}ms)`, "color:#c00;font-weight:bold");
    console.warn("[DIAG] Possible causes:");
    console.warn("  1. Ad-blocker or browser extension blocking image.pollinations.ai");
    console.warn("  2. Firewall/network blocking the domain");
    console.warn("  3. Pollinations.ai service is down — check https://status.pollinations.ai");
    console.warn("  4. CORS or mixed-content policy (check Network tab for the actual error)");
    console.log("[DIAG] → Open DevTools Network tab, filter by 'pollinations', reload page, check status code");
    showBanner(`❌ IMAGE SERVICE UNREACHABLE (failed after ${ms}ms). Likely an ad-blocker, firewall, or extension blocking image.pollinations.ai. Open DevTools (F12) → Network tab → filter "pollinations" → reload to see the real error.`, true);
  };
  testImg.src = testUrl;

  try {
    const res = await fetch(testUrl, { mode: "no-cors" });
    console.log("[DIAG] Fetch test completed (opaque response expected with no-cors):", res.type);
  } catch (err) {
    console.error("[DIAG] Fetch test threw an error:", err.message);
    console.warn("[DIAG] This usually means: network blocked, DNS failure, or CSP blocking the request.");
  }

  const metaCSP = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
  if (metaCSP) {
    console.warn("[DIAG] Page has a CSP meta tag — check if img-src allows image.pollinations.ai:", metaCSP.content);
  } else {
    console.log("[DIAG] No CSP meta tag found on page (good — unlikely to be the blocker)");
  }

  console.log("%c━━━━━━━━━━━━━━━━━━━━━━━━", "color:#C0392B;font-weight:bold");
}

// ── Init ──────────────────────────────────────────────────
(function init() {
  runImageDiagnostics();
  buildHomepage();
  const code = (new URLSearchParams(window.location.search).get("country")||"").toUpperCase();
  if (code && COUNTRIES[code]) selectCountry(code);
})();
