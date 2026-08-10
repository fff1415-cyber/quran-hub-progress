/**
 * API load test — measures latency & error rate at increasing concurrency.
 *
 * Usage:
 *   node scripts/load-test-api.mjs
 *   LOAD_BASE=https://m1.msht.io LOAD_COMPLEX_ID=1 node scripts/load-test-api.mjs
 */

const BASE = (process.env.LOAD_BASE ?? "https://msht.io").replace(/\/$/, "");
const COMPLEX_ID = process.env.LOAD_COMPLEX_ID ?? "1";
const SUBDOMAIN = process.env.LOAD_SUBDOMAIN ?? "m1";
const DURATION_SEC = Number(process.env.LOAD_DURATION ?? "8");
const LEVELS = (process.env.LOAD_LEVELS ?? "5,10,25,50,75,100")
  .split(",")
  .map((s) => Number(s.trim()))
  .filter((n) => n > 0);

function rphp(path) {
  const q = path.includes("?") ? path : path;
  const [pathname, query = ""] = q.split("?");
  let url = `${BASE}/api/r.php?path=${encodeURIComponent(pathname.startsWith("/") ? pathname : `/${pathname}`)}`;
  if (query) url += `&${query}`;
  return url;
}

const SCENARIOS = [
  {
    id: "health",
    label: "Health (DB ping + SHOW TABLES)",
    url: () => rphp("/health"),
  },
  {
    id: "tenant-info",
    label: "Tenant info (login page)",
    url: () => rphp(`/tenant-info?subdomain=${SUBDOMAIN}`),
  },
  {
    id: "students-public",
    label: "Students public list (sync-like read)",
    url: () => rphp(`/students/public?complexId=${COMPLEX_ID}`),
  },
  {
    id: "halaqat-public",
    label: "Halaqat public list",
    url: () => rphp(`/halaqat/public?complexId=${COMPLEX_ID}`),
  },
];

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

async function oneRequest(url) {
  const start = performance.now();
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(30_000),
    });
    const ms = performance.now() - start;
    const text = await res.text();
    let ok = res.ok;
    if (ok) {
      try {
        const body = JSON.parse(text);
        if (body.ok === false || body.error) ok = false;
      } catch {
        ok = false;
      }
    }
    return { ok, ms, status: res.status };
  } catch (e) {
    return { ok: false, ms: performance.now() - start, status: 0, err: String(e) };
  }
}

async function runLevel(url, concurrency, durationSec) {
  const endAt = Date.now() + durationSec * 1000;
  const latencies = [];
  let ok = 0;
  let fail = 0;
  let inFlight = 0;
  let errors = new Map();

  await new Promise((resolve) => {
    const tick = () => {
      while (inFlight < concurrency && Date.now() < endAt) {
        inFlight++;
        void oneRequest(url).then((r) => {
          inFlight--;
          latencies.push(r.ms);
          if (r.ok) ok++;
          else {
            fail++;
            const key = r.err ?? `HTTP ${r.status}`;
            errors.set(key, (errors.get(key) ?? 0) + 1);
          }
          if (Date.now() < endAt || inFlight > 0) tick();
          else resolve();
        });
      }
      if (Date.now() >= endAt && inFlight === 0) resolve();
    };
    tick();
  });

  latencies.sort((a, b) => a - b);
  const total = ok + fail;
  const rps = total / durationSec;
  return {
    concurrency,
    total,
    ok,
    fail,
    errorRate: total ? ((fail / total) * 100).toFixed(1) : "0",
    rps: rps.toFixed(1),
    p50: percentile(latencies, 50).toFixed(0),
    p95: percentile(latencies, 95).toFixed(0),
    p99: percentile(latencies, 99).toFixed(0),
    max: latencies.length ? latencies[latencies.length - 1].toFixed(0) : "0",
    topErrors: [...errors.entries()].slice(0, 3),
  };
}

async function probe(url) {
  const r = await oneRequest(url);
  return r;
}

async function main() {
  console.log(`\n🔬 Load test — ${BASE}`);
  console.log(`   Complex: ${COMPLEX_ID} | Subdomain: ${SUBDOMAIN} | ${DURATION_SEC}s per level\n`);

  for (const scenario of SCENARIOS) {
    const url = scenario.url();
    const probeResult = await probe(url);
    if (!probeResult.ok) {
      console.log(`⏭  ${scenario.id}: skipped (probe failed — ${probeResult.status || probeResult.err})`);
      continue;
    }

    console.log(`\n━━ ${scenario.label} ━━`);
    console.log(
      "  conc │  req/s │  p50 ms │  p95 ms │  p99 ms │  max ms │ err % │  ok/total",
    );
    console.log(
      "  ─────┼────────┼─────────┼─────────┼─────────┼─────────┼───────┼──────────",
    );

    let breakAt = null;
    for (const conc of LEVELS) {
      const r = await runLevel(url, conc, DURATION_SEC);
      const warn = Number(r.errorRate) > 5 || Number(r.p95) > 5000 ? " ⚠" : "";
      console.log(
        `  ${String(conc).padStart(4)} │ ${String(r.rps).padStart(6)} │ ${String(r.p50).padStart(7)} │ ${String(r.p95).padStart(7)} │ ${String(r.p99).padStart(7)} │ ${String(r.max).padStart(7)} │ ${String(r.errorRate).padStart(5)} │ ${r.ok}/${r.total}${warn}`,
      );
      if (Number(r.errorRate) > 10 && !breakAt) {
        breakAt = conc;
        if (conc < LEVELS[LEVELS.length - 1]) {
          console.log(`  → error rate >10% — stopping higher levels for this scenario`);
          break;
        }
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
  }

  console.log("\n📋 Notes:");
  console.log("  • Read endpoints only — writes (grades/app_state) need auth and are heavier.");
  console.log("  • health hits DB hard (SHOW TABLES) — real login sync is closer to students+tenant.");
  console.log("  • Safe concurrent *teachers saving grades* is usually lower than read RPS here.\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
