/* DKP site: loads the sheet tabs (CSV), runs the engine and renders the pages. */
(function () {
  "use strict";
  const CFG = window.DKP_CONFIG || { sheets: {} };
  const TABS = ["config", "raids", "prices", "players", "runs", "loot", "adjustments", "attendance"];
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = n => (Math.round(n * 10) / 10).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 1 });
  const signed = n => (n > 0 ? "+" : "") + fmt(n);
  const dateBR = iso => iso ? iso.split("-").reverse().join("/") : "";

  let result = null, currentRaid = null, currentPlayer = null, usingSample = false;

  async function loadTab(name) {
    const url = (CFG.sheets || {})[name];
    const src = url && url.trim() ? url.trim() : `data/${name}.csv`;
    if (!url || !url.trim()) usingSample = true;
    const sep = src.includes("?") ? "&" : "?";
    const res = await fetch(src + sep + "_=" + Date.now(), { cache: "no-store" });   // avoid stale cache
    if (!res.ok) throw new Error(`Não consegui carregar a aba "${name}" (${res.status}).`);
    return DKP.parseCSV(await res.text());
  }

  async function load() {
    $("status").textContent = "Carregando dados...";
    try {
      const tables = {};
      await Promise.all(TABS.map(async t => {
        try { tables[t] = await loadTab(t); }
        catch (e) { if (t === "attendance" || t === "adjustments") tables[t] = []; else throw e; }
      }));
      result = DKP.compute(tables);
      const ids = Object.keys(result.pools);
      if (!currentRaid || !result.pools[currentRaid]) {
        currentRaid = ids.find(id => result.pools[id].runs.length) || ids[0];
      }
      $("title").textContent = `${CFG.guildName || "Guild"} · DKP`;
      $("status").innerHTML = `Atualizado em ${new Date().toLocaleString("pt-BR")} · ` +
        (usingSample ? "<b>usando dados de exemplo</b> (configure os links em config.js) · " : "") +
        `<button class="btn" id="reload">Recarregar</button>`;
      $("reload").onclick = () => { currentPlayer = null; usingSample = false; load(); };
      renderWarnings(); renderTabs(); render();
      $("app").hidden = false;
    } catch (e) {
      $("status").textContent = "Erro: " + e.message;
    }
  }

  function renderWarnings() {
    const w = result.warnings;
    $("warnings").innerHTML = w.length
      ? `<div class="warn"><b>Atenção (para os officers):</b><ul>${w.map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>` : "";
  }

  function renderTabs() {
    $("raidTabs").innerHTML = Object.values(result.pools).map(p =>
      `<button data-raid="${esc(p.raid.id)}" class="${p.raid.id === currentRaid ? "active" : ""}">${esc(p.raid.name)} (${p.raid.size})</button>`).join("");
    $("raidTabs").querySelectorAll("button").forEach(b => b.onclick = () => {
      currentRaid = b.dataset.raid; currentPlayer = null; renderTabs(); render();
    });
  }

  function render() {
    const pool = result.pools[currentRaid];
    if (!pool) return;
    const r = pool.raid;

    $("stats").innerHTML = [
      ["Raid", `${esc(r.name)}`], ["Jogadores", r.size], ["Runs", pool.runs.length],
      ["Jogadores com saldo", pool.rows.length], ["Mediana dos saldos", fmt(pool.median)],
    ].map(([k, v]) => `<div><span class="muted">${k}</span><b>${v}</b></div>`).join("");

    renderRanking();
    renderPlayer();

    $("runs").innerHTML = pool.runs.length ? pool.runs.slice().reverse().map(run => `
      <details>
        <summary><b>${esc(run.run)}</b> · ${dateBR(run.date)} · pote ${fmt(run.pot)} · cota ${fmt(run.share)} · ${run.present} presentes · ${run.bench} no banco${run.note ? " · " + esc(run.note) : ""}</summary>
        <div class="scroll"><table>
          <tr><th>Personagem</th><th>Item</th><th>Tipo</th><th>Spec</th><th class="num">Preço</th><th class="num">Pago</th></tr>
          ${run.items.map(i => `<tr><td>${esc(i.player)}</td><td>${esc(i.item)}</td><td>${esc(i.type)}</td><td>${esc(i.spec)}</td><td class="num">${fmt(i.price)}</td><td class="num">${fmt(i.paid)}</td></tr>`).join("") || `<tr><td colspan="6" class="muted">Nenhum item registrado.</td></tr>`}
        </table></div>
      </details>`).join("") : `<p class="muted">Nenhuma run registrada nesta raid ainda.</p>`;

    const c = result.config, m = r.mult;
    $("rules").innerHTML = `
      <ul class="rules">
        <li>Valores na escala desta raid (${r.size} jogadores = ${m}x a escala de 10).</li>
        <li>Saldo inicial de quem faz a primeira run da guild nesta raid: <b>${fmt(c.founder_start * m)}</b>.</li>
        <li>Tudo que é gasto em itens vira o pote, dividido igualmente entre os presentes até o fim da raid.</li>
        <li>Banco pronto: <b>${Math.round(c.bench_pct * 100)}%</b> da cota. Pontualidade: <b>+${fmt(c.ontime_bonus * m)}</b>.</li>
        <li>No-show sem aviso: <b>-${fmt(c.noshow_penalty * m)}</b> (no mês, a partir do segundo: <b>-${fmt(c.noshow_repeat_penalty * m)}</b>). Quem avisa não perde nada.</li>
        <li>Saiu antes do fim sem combinar: não recebe a cota.</li>
        <li>Quem tem menos que o preço leva pagando todo o saldo. Nenhum saldo fica negativo.</li>
        <li>Decay de <b>${Math.round(c.decay_pct * 100)}%</b> em todos os saldos no dia ${c.decay_day} de cada mês.</li>
        <li>Offspec ou item que ninguém precisa: roll livre, preço 0.</li>
      </ul>
      <div class="scroll"><table>
        <tr><th>Tipo</th><th>Descrição</th><th class="num">Preço nesta raid</th></tr>
        ${Object.values(result.prices).map(p => `<tr><td>${esc(p.type)}</td><td>${esc(p.desc)}</td><td class="num">${fmt(p.price * m)}</td></tr>`).join("")}
      </table></div>`;
  }

  function renderRanking() {
    const pool = result.pools[currentRaid];
    const role = $("roleFilter").value.toLowerCase();
    const q = $("search").value.trim().toLowerCase();
    const rows = pool.rows.filter(x => (!role || String(x.role).toLowerCase().includes(role)) && (!q || x.name.toLowerCase().includes(q)));
    $("ranking").innerHTML = `<tr><th class="num">#</th><th>Personagem</th><th>Classe</th><th>Função</th><th class="num">Saldo</th></tr>` +
      (rows.map((x, i) => `<tr class="click" data-key="${esc(x.key)}"><td class="num">${i + 1}</td><td>${esc(x.name)}</td><td>${esc(x.cls)}</td><td>${esc(x.role)}</td><td class="num"><b>${fmt(x.balance)}</b></td></tr>`).join("")
        || `<tr><td colspan="5" class="muted">Nenhum jogador encontrado.</td></tr>`);
    $("ranking").querySelectorAll("tr.click").forEach(tr => tr.onclick = () => { currentPlayer = tr.dataset.key; renderPlayer(); $("playerSection").scrollIntoView({ behavior: "smooth" }); });
  }

  function renderPlayer() {
    const pool = result.pools[currentRaid];
    if (!currentPlayer) { $("playerSection").hidden = true; return; }
    const lines = pool.ledger.filter(e => e.player === currentPlayer);
    const name = lines.length ? lines[0].name : currentPlayer;
    $("playerSection").hidden = false;
    $("playerTitle").textContent = `Histórico de ${name} em ${pool.raid.name}`;
    $("playerLedger").innerHTML = `<tr><th>Data</th><th>Run</th><th>Motivo</th><th class="num">Pontos</th><th class="num">Saldo</th></tr>` +
      lines.slice().reverse().map(e => `<tr><td>${dateBR(e.date)}</td><td>${esc(e.run)}</td><td>${esc(e.reason)}</td><td class="num ${e.delta > 0 ? "pos" : e.delta < 0 ? "neg" : ""}">${signed(e.delta)}</td><td class="num">${fmt(e.balance)}</td></tr>`).join("");
  }

  $("roleFilter").onchange = renderRanking;
  $("search").oninput = renderRanking;
  load();
})();
