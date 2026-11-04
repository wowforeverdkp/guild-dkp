/* DKP engine: zero-sum with starting balance, bench share, punctuality bonus,
   no-show penalty and monthly decay. One independent pool per raid.
   Pure functions, no DOM: works in the browser and in Node (for tests). */
(function (root) {
  "use strict";

  // ---------------------------------------------------------------- CSV
  function parseCSV(text) {
    const rows = [];
    let row = [], field = "", i = 0, inQuotes = false;
    text = String(text || "").replace(/^﻿/, "");
    while (i < text.length) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
          inQuotes = false; i++; continue;
        }
        field += c; i++; continue;
      }
      if (c === '"') { inQuotes = true; i++; continue; }
      if (c === ",") { row.push(field); field = ""; i++; continue; }
      if (c === "\r") { i++; continue; }
      if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; i++; continue; }
      field += c; i++;
    }
    if (field !== "" || row.length) { row.push(field); rows.push(row); }
    const nonEmpty = rows.filter(r => r.some(v => String(v).trim() !== ""));
    if (!nonEmpty.length) return [];
    const headers = nonEmpty[0].map(normHeader);
    return nonEmpty.slice(1).map(r => {
      const o = {};
      headers.forEach((h, k) => { o[h] = (r[k] || "").trim(); });
      return o;
    });
  }

  function stripAccents(s) {
    return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "");
  }
  function normHeader(h) {
    return stripAccents(h).trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  }
  const key = s => stripAccents(s).trim().toLowerCase().replace(/\s+/g, " ");
  const num = v => {
    const n = parseFloat(String(v == null ? "" : v).replace(",", "."));
    return isNaN(n) ? 0 : n;
  };
  const list = v => String(v || "").split(/[,;\n]/).map(s => s.trim()).filter(Boolean);
  const yes = v => ["sim", "s", "yes", "y", "true", "x", "1", "ok", "aprovado"].includes(key(v));

  // dates as "YYYY-MM-DD" strings (also accepts DD/MM/YYYY)
  function toISO(v) {
    const s = String(v || "").trim();
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    return "";
  }
  function addMonth(iso) {
    let [y, m] = iso.split("-").map(Number);
    m += 1; if (m > 12) { m = 1; y += 1; }
    return `${y}-${String(m).padStart(2, "0")}`;
  }

  // pick a column by several possible names (normalized)
  function col(row, ...names) {
    for (const n of names) {
      const k = normHeader(n);
      if (row[k] !== undefined) return row[k];
    }
    // partial match as a fallback (useful for Google Forms headers)
    for (const n of names) {
      const k = normHeader(n);
      const found = Object.keys(row).find(h => h.includes(k));
      if (found) return row[found];
    }
    return "";
  }

  // ---------------------------------------------------------------- engine
  function compute(tables, today) {
    today = toISO(today) || new Date().toISOString().slice(0, 10);
    const warnings = [];

    // config
    const cfg = {
      founder_start: 100, bench_pct: 0.3, ontime_bonus: 5,
      noshow_penalty: 10, noshow_repeat_penalty: 20, decay_pct: 0.1, decay_day: 1,
    };
    (tables.config || []).forEach(r => {
      const k = normHeader(col(r, "chave", "key"));
      if (k in cfg) cfg[k] = num(col(r, "valor", "value"));
    });

    // raids
    const raids = {};
    (tables.raids || []).forEach(r => {
      const id = col(r, "raid_id", "id").toUpperCase();
      if (!id) return;
      const size = num(col(r, "tamanho", "size")) || 10;
      raids[id] = { id, name: col(r, "nome", "name") || id, size, mult: size / 10 };
    });

    // prices (10-player scale)
    const prices = {};
    (tables.prices || []).forEach(r => {
      const t = col(r, "tipo", "type").toUpperCase();
      if (t) prices[t] = { type: t, desc: col(r, "descricao", "description"), price: num(col(r, "preco", "price")) };
    });

    // players
    const players = {};
    function player(name) {
      const k = key(name);
      if (!players[k]) players[k] = { name: String(name).trim(), cls: "", role: "", known: false };
      return players[k];
    }
    (tables.players || []).forEach(r => {
      const n = col(r, "personagem", "player", "nome");
      if (!n) return;
      const p = player(n);
      p.name = n.trim(); p.cls = col(r, "classe", "class"); p.role = col(r, "funcao", "role"); p.known = true;
    });

    // approved form attendance, by run
    const formAtt = {};
    (tables.attendance || []).forEach(r => {
      const run = col(r, "run", "codigo").toUpperCase();
      const who = col(r, "personagem", "character", "nome");
      if (!run || !who || !yes(col(r, "aprovado", "approved"))) return;
      const st = key(col(r, "status"));
      (formAtt[run] = formAtt[run] || { present: [], bench: [] })[st.startsWith("banco") || st.startsWith("bench") ? "bench" : "present"].push(who);
    });

    // loot by run (sheet order)
    const lootByRun = {};
    (tables.loot || []).forEach((r, idx) => {
      const run = col(r, "run_id", "run").toUpperCase();
      if (!run) return;
      (lootByRun[run] = lootByRun[run] || []).push({
        idx, player: col(r, "personagem", "player"), item: col(r, "item"),
        type: col(r, "tipo", "type").toUpperCase(), spec: col(r, "spec").toUpperCase() || "MS",
      });
    });

    // pools
    const pools = {};
    Object.values(raids).forEach(r => { pools[r.id] = { raid: r, bal: {}, ledger: [], runs: [], started: false }; });
    const getPool = id => {
      if (!pools[id]) {
        warnings.push(`Raid "${id}" não existe na aba raids. Usando tamanho 10.`);
        raids[id] = { id, name: id, size: 10, mult: 1 };
        pools[id] = { raid: raids[id], bal: {}, ledger: [], runs: [], started: false };
      }
      return pools[id];
    };
    const r1 = v => Math.round(v * 10) / 10;
    function move(pool, date, run, who, delta, reason) {
      const k = key(who);
      if (!players[k] || !players[k].known) {
        player(who);
        if (!warnings.some(w => w.includes(`"${who}"`))) warnings.push(`"${who}" não está na aba players.`);
      }
      const before = pool.bal[k] || 0;
      let after = before + delta;
      if (after < 0) after = 0;          // balances never go below zero
      pool.bal[k] = after;
      pool.ledger.push({ date, run, player: k, delta: after - before, balance: after, reason });
    }

    // events
    const events = [];
    (tables.runs || []).forEach((r, idx) => {
      const id = col(r, "run_id", "run").toUpperCase();
      const date = toISO(col(r, "data", "date"));
      const raid = col(r, "raid_id", "raid").toUpperCase();
      if (!id || !date || !raid) { warnings.push(`Run na linha ${idx + 2} sem run_id, data ou raid_id.`); return; }
      events.push({ kind: "run", date, order: 2, idx, id, raid, row: r });
    });
    (tables.adjustments || []).forEach((r, idx) => {
      const date = toISO(col(r, "data", "date"));
      const raid = col(r, "raid_id", "raid").toUpperCase();
      const who = col(r, "personagem", "player");
      if (!date || !raid || !who) { warnings.push(`Ajuste na linha ${idx + 2} incompleto.`); return; }
      events.push({ kind: "adj", date, order: 1, idx, raid, who, value: num(col(r, "valor", "value")), reason: col(r, "motivo", "reason") || "Ajuste" });
    });
    events.sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order || a.idx - b.idx);

    // decay events: day decay_day of every month after the first event, up to today
    if (events.length && cfg.decay_pct > 0) {
      const day = String(Math.min(28, Math.max(1, Math.round(cfg.decay_day)))).padStart(2, "0");
      let ym = addMonth(events[0].date);
      const decays = [];
      while (`${ym}-${day}` <= today) { decays.push({ kind: "decay", date: `${ym}-${day}`, order: 0, idx: 0 }); ym = addMonth(ym + "-01"); }
      events.push(...decays);
      events.sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order || a.idx - b.idx);
    }

    const noshowCount = {}; // player|YYYY-MM -> count (across all raids)

    for (const ev of events) {
      if (ev.kind === "decay") {
        Object.values(pools).forEach(pool => {
          Object.keys(pool.bal).forEach(k => {
            if (pool.bal[k] > 0) move(pool, ev.date, "", players[k].name, -pool.bal[k] * cfg.decay_pct, `Decay mensal (${Math.round(cfg.decay_pct * 100)}%)`);
          });
        });
        continue;
      }
      const pool = getPool(ev.raid);
      const m = pool.raid.mult;

      if (ev.kind === "adj") { move(pool, ev.date, "", ev.who, ev.value, ev.reason); continue; }

      // ---- run
      const r = ev.row, run = ev.id, date = ev.date;
      const fa = formAtt[run] || { present: [], bench: [] };
      const uniq = arr => { const seen = new Set(); return arr.filter(n => { const k = key(n); if (seen.has(k)) return false; seen.add(k); return true; }); };
      const noshow = uniq(list(col(r, "noshow_sem_aviso", "noshow")));
      const benchList = uniq([...list(col(r, "banco", "bench")), ...fa.bench]);
      const benchK = new Set(benchList.map(key)), noshowK = new Set(noshow.map(key));
      const present = uniq([...list(col(r, "presentes", "present")), ...fa.present]).filter(n => !benchK.has(key(n)) && !noshowK.has(key(n)));
      const late = new Set(list(col(r, "atrasados", "late")).map(key));
      const left = new Set(list(col(r, "sairam_sem_combinar", "left")).map(key));

      // founders: first run of this raid gets the starting balance (present + bench)
      if (!pool.started) {
        pool.started = true;
        [...present, ...benchList].forEach(n => {
          if (!(key(n) in pool.bal)) move(pool, date, run, n, cfg.founder_start * m, "Saldo inicial (fundador da raid)");
        });
      }

      // loot: each buyer pays the price, or the whole balance if lower
      let pot = 0;
      const items = [];
      (lootByRun[run] || []).forEach(l => {
        const p = prices[l.type];
        if (!p) warnings.push(`Tipo de item "${l.type}" (run ${run}) não está na aba prices. Preço 0.`);
        const price = l.spec === "OS" ? 0 : r1((p ? p.price : 0) * m);
        const bal = pool.bal[key(l.player)] || 0;
        const paid = Math.min(price, bal);
        const note = price === 0 ? "offspec / roll livre" : paid < price ? `pagou o saldo disponível (preço ${price})` : "";
        move(pool, date, run, l.player, -paid, `Item: ${l.item || l.type}${note ? " (" + note + ")" : ""}`);
        pot += paid;
        items.push({ ...l, price, paid });
      });

      // pot split at the end among those present until the end
      const receivers = present.filter(n => !left.has(key(n)));
      const share = receivers.length ? pot / receivers.length : 0;
      if (share > 0) receivers.forEach(n => move(pool, date, run, n, share, `Cota da raid (pote ${r1(pot)} / ${receivers.length})`));
      benchList.forEach(n => move(pool, date, run, n, share * cfg.bench_pct, `Banco pronto (${Math.round(cfg.bench_pct * 100)}% da cota)`));  // listed even if 0, so bench presence is visible
      receivers.filter(n => !late.has(key(n))).forEach(n => move(pool, date, run, n, cfg.ontime_bonus * m, "Bônus de pontualidade"));
      present.filter(n => left.has(key(n))).forEach(n => move(pool, date, run, n, 0, "Saiu antes do fim sem combinar: sem cota"));

      noshow.forEach(n => {
        const ck = key(n) + "|" + date.slice(0, 7);
        noshowCount[ck] = (noshowCount[ck] || 0) + 1;
        const pen = (noshowCount[ck] === 1 ? cfg.noshow_penalty : cfg.noshow_repeat_penalty) * m;
        move(pool, date, run, n, -pen, noshowCount[ck] === 1 ? "No-show sem aviso" : "No-show sem aviso (reincidência no mês)");
      });

      pool.runs.push({ run, date, pot: r1(pot), share: r1(share), present: present.length, bench: benchList.length, items, note: col(r, "observacao", "note") });
    }

    // results
    const out = {};
    Object.values(pools).forEach(pool => {
      const rows = Object.keys(pool.bal).map(k => ({ key: k, name: players[k].name, cls: players[k].cls, role: players[k].role, balance: r1(pool.bal[k]) }))
        .sort((a, b) => b.balance - a.balance || a.name.localeCompare(b.name));
      const sorted = rows.map(x => x.balance).sort((a, b) => a - b);
      const median = sorted.length ? (sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2) : 0;
      out[pool.raid.id] = {
        raid: pool.raid, rows, median: r1(median),
        ledger: pool.ledger.map(e => ({ ...e, name: players[e.player].name, delta: r1(e.delta), balance: r1(e.balance) })),
        runs: pool.runs,
      };
    });
    return { config: cfg, raids, prices, pools: out, warnings, today };
  }

  const api = { parseCSV, compute, normHeader };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.DKP = api;
})(this);
