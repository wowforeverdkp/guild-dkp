/* DKP site: loads the sheet tabs (CSV), runs the engine and renders the pages.
   Navigation by hash:  #como  |  #saldos/BD  |  #runs  |  #regras  */
(function () {
  "use strict";
  const CFG = window.DKP_CONFIG || { sheets: {} };
  const TABS = ["config", "raids", "prices", "players", "runs", "loot", "adjustments", "attendance"];
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = n => (Math.round(n * 10) / 10).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 1 });
  const signed = n => (n > 0 ? "+" : "") + fmt(n);
  const pct = n => Math.round(n * 100) + "%";
  const dateBR = iso => iso ? iso.split("-").reverse().join("/") : "";

  let result = null, usingSample = false;
  const state = { player: null, role: "", search: "" };

  // ---------------------------------------------------------------- data
  async function loadTab(name) {
    const url = ((CFG.sheets || {})[name] || "").trim();
    const src = url || `data/${name}.csv`;
    if (!url) usingSample = true;
    const res = await fetch(src + (src.includes("?") ? "&" : "?") + "_=" + Date.now(), { cache: "no-store" });
    if (!res.ok) throw new Error(`Não consegui carregar a aba "${name}" (${res.status}).`);
    return DKP.parseCSV(await res.text());
  }

  async function load() {
    $("status").textContent = "Carregando dados...";
    usingSample = false;
    try {
      const tables = {};
      await Promise.all(TABS.map(async t => {
        try { tables[t] = await loadTab(t); }
        catch (e) { if (t === "attendance" || t === "adjustments") tables[t] = []; else throw e; }
      }));
      result = DKP.compute(tables);
      $("brand").textContent = `${CFG.guildName || "Guild"} · DKP`;
      $("status").innerHTML = `Atualizado em ${new Date().toLocaleString("pt-BR")}` +
        (usingSample ? "<br><b>Usando dados de exemplo</b>" : "") +
        `<br><button class="btn" id="reload" style="margin-top:8px">Recarregar dados</button>`;
      $("reload").onclick = load;
      $("warnings").innerHTML = result.warnings.length
        ? `<div class="warn"><b>Atenção (para os officers):</b><ul>${result.warnings.map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>` : "";
      route();
    } catch (e) {
      $("status").textContent = "Erro: " + e.message;
      $("view").innerHTML = `<p>Não foi possível carregar os dados. ${esc(e.message)}</p>`;
    }
  }

  // ---------------------------------------------------------------- navigation
  function renderNav(active) {
    const raids = Object.values(result.pools);
    $("nav").innerHTML =
      `<a href="#como" class="${active === "como" ? "active" : ""}">Como funciona</a>` +
      `<div class="group">Saldos</div>` +
      raids.map(p => `<a href="#saldos/${esc(p.raid.id)}" class="${active === "saldos/" + p.raid.id ? "active" : ""}">${esc(p.raid.name)} <span class="muted">(${p.raid.size})</span></a>`).join("") +
      `<div class="group">Registros</div>` +
      `<a href="#runs" class="${active === "runs" ? "active" : ""}">Runs e itens</a>` +
      `<a href="#regras" class="${active === "regras" ? "active" : ""}">Regras e preços</a>`;
    $("nav").querySelectorAll("a").forEach(a => a.onclick = () => $("sidebar").classList.remove("open"));
  }

  function route() {
    if (!result) return;
    const h = (location.hash || "#como").slice(1);
    const [page, arg] = h.split("/");
    if (page === "saldos" && result.pools[arg]) { renderNav("saldos/" + arg); viewBalances(arg); }
    else if (page === "runs") { renderNav("runs"); viewRuns(); }
    else if (page === "regras") { renderNav("regras"); viewRules(); }
    else { renderNav("como"); viewHow(); }
    window.scrollTo(0, 0);
  }
  window.addEventListener("hashchange", () => { state.player = null; route(); });
  $("menuToggle").onclick = () => $("sidebar").classList.toggle("open");

  // ---------------------------------------------------------------- pages
  function viewHow() {
    const c = result.config;
    const share = 350 / 10, bench = share * c.bench_pct;
    const pools = Object.values(result.pools);
    $("view").innerHTML = `
      <h1>Como o sistema funciona</h1>
      <p class="muted">Tudo o que está aqui é calculado automaticamente a partir dos registros dos officers. Qualquer saldo pode ser conferido linha por linha no histórico de cada jogador.</p>

      <div class="box"><b>Em uma frase:</b> quem participa acumula pontos, quem tem mais pontos tem prioridade no loot, e quem leva um item volta para o fim da fila.</div>

      <h2>1. Cada raid tem o seu próprio DKP</h2>
      <p>Os pontos ganhos numa raid só servem para comprar itens dela. O DKP da Onyxia não compra item da Barrow Deeps, e vice-versa.</p>
      <p>Raids e tamanhos: ${pools.map(p => `<b>${esc(p.raid.name)}</b> (${p.raid.size})`).join(", ")}. Os valores de pontos e preços são multiplicados pelo tamanho da raid (20 jogadores = 2x, 40 = 4x).</p>
      <div class="why"><b>Por quê:</b> evita que alguém acumule pontos numa raid fácil para gastar na difícil, e garante que quem se dedica a uma raid tenha prioridade justa nela. A escala mantém a cota por pessoa parecida em qualquer tamanho de raid.</div>

      <h2>2. Como você ganha pontos</h2>
      <p>Tudo que é gasto em itens durante uma raid vira um <b>pote</b>. No fim da raid, o pote é dividido igualmente entre todos que estavam presentes até o fim, inclusive quem comprou.</p>
      <div class="box">
        <b>Exemplo (raid de 10):</b> caíram itens que somam <b>350</b> pontos.<br>
        Cada um dos 10 presentes recebe 350 / 10 = <b>${fmt(share)}</b>.<br>
        Quem chegou no horário ganha mais <b>+${fmt(c.ontime_bonus)}</b> de pontualidade.<br>
        Quem estava no banco, pronto para entrar, recebe ${pct(c.bench_pct)} da cota: <b>${fmt(bench)}</b>.
      </div>
      <p>Os pontos da raid só entram no saldo quando ela termina. Você não usa naquela raid o que ganhou nela.</p>
      <div class="why"><b>Por quê:</b> esse modelo (zero-sum) não cria pontos do nada. O que um jogador gasta vai para os outros. Assim não há inflação, e a presença é recompensada naturalmente: quem está na raid recebe parte de cada item que cai.</div>

      <h2>3. Como o loot é decidido</h2>
      <ul>
        <li><b>Preço fixo</b> por tipo de item (arma, trinket, peito, anel...). Não existe leilão.</li>
        <li><b>Prioridade:</b> Main spec antes de Offspec. Dentro do Main spec, <b>Tank &gt; Healer = DPS</b>.</li>
        <li>Dentro do mesmo grupo de prioridade, leva <b>quem tem o maior saldo</b>. Empate: <b>/roll</b>.</li>
        <li>Quem tem menos pontos que o preço leva pagando <b>todo o saldo</b> e fica com 0. Nenhum saldo fica negativo e nenhum item fica sem dono.</li>
        <li>Item de offspec ou que ninguém precisa: <b>roll livre</b>, preço 0.</li>
      </ul>
      <div class="box"><b>Exemplo:</b> cai uma arma de duas mãos (60). Dois DPS querem: um tem 120, o outro 95. Leva quem tem 120, que fica com 60. Os 60 pontos entram no pote da raid.</div>
      <div class="why"><b>Por quê:</b> o preço fixo evita disputa de lance e drama. A prioridade de Tank ajuda a guild a progredir, porque um tank bem equipado segura a raid para todo mundo.</div>

      <h2>4. Saldo inicial</h2>
      <ul>
        <li><b>Fundadores:</b> quem participa da primeira run da guild numa raid (presente ou no banco) começa com <b>${fmt(c.founder_start)}</b> pontos (na escala de 10).</li>
        <li><b>Novos Raiders:</b> a primeira raid conta pontos normalmente. Quando aprovado como Raider, o jogador recebe um <b>headstart</b> definido pelos officers, entre 30% e 60% da mediana dos saldos daquela raid.</li>
      </ul>
      <div class="box"><b>Exemplo:</b> a mediana da raid é 200. O novato ganhou 40 na raid de avaliação. Aprovado com 45% da mediana, recebe +90 e fica com 130.</div>
      <div class="why"><b>Por quê:</b> o novato entra competitivo, mas sem passar na frente de quem está há semanas na raid.</div>

      <h2>5. Ausências e penalidades</h2>
      <ul>
        <li>Confirmou e <b>avisou</b> que não vai (até 4h antes, ou marcou Absence no Raid-Helper): <b>sem penalidade</b>.</li>
        <li>Confirmou e não apareceu <b>sem avisar</b>: <b>-${fmt(c.noshow_penalty)}</b>. A partir do segundo no mesmo mês: <b>-${fmt(c.noshow_repeat_penalty)}</b>.</li>
        <li>Atrasou: perde só o bônus de pontualidade.</li>
        <li>Saiu antes do fim sem combinar: não recebe a cota daquela raid. Saída combinada recebe normalmente.</li>
      </ul>
      <div class="why"><b>Por quê:</b> somos adultos com vida real. Imprevisto acontece e não é punido. O que a penalidade evita é deixar a raid na mão sem avisar.</div>

      <h2>6. Decay mensal</h2>
      <p>No dia ${c.decay_day} de cada mês, todos os saldos perdem <b>${pct(c.decay_pct)}</b>.</p>
      <div class="box"><b>Exemplo:</b> um saldo de 200 vira 180. Um de 50 vira 45.</div>
      <div class="why"><b>Por quê:</b> impede que alguém acumule um saldo enorme e domine o loot por meses, e mantém a fila sempre em movimento. Quem joga com frequência repõe os pontos rapidamente.</div>

      <h2>7. Transparência</h2>
      <p>Na seção <a href="#saldos/${esc(pools.find(p => p.runs.length) ? pools.find(p => p.runs.length).raid.id : pools[0].raid.id)}">Saldos</a>, clique em qualquer jogador para ver o histórico completo: cada ponto ganho ou gasto, com data, run e motivo. Em <a href="#runs">Runs e itens</a> está cada raid registrada, com o pote e os itens.</p>
    `;
  }

  function viewBalances(raidId) {
    const pool = result.pools[raidId], r = pool.raid;
    $("view").innerHTML = `
      <h1>${esc(r.name)} <span class="muted">· ${r.size} jogadores</span></h1>
      <div class="stats">
        <div><span class="muted">Runs</span><b>${pool.runs.length}</b></div>
        <div><span class="muted">Jogadores com saldo</span><b>${pool.rows.length}</b></div>
        <div><span class="muted">Mediana dos saldos</span><b>${fmt(pool.median)}</b></div>
      </div>
      <div class="bar">
        <label>Função <select id="roleFilter"><option value="">Todas</option><option>Tank</option><option>Healer</option><option>DPS</option></select></label>
        <label>Buscar <input id="search" placeholder="nome do personagem"></label>
      </div>
      <p class="muted">Prioridade de loot: Main spec &gt; Offspec. Tank &gt; Healer = DPS. Dentro do grupo, maior saldo. Empate: roll. Clique num jogador para ver o histórico.</p>
      <div class="scroll"><table id="ranking"></table></div>
      <section id="playerSection" hidden>
        <h2 id="playerTitle"></h2>
        <div class="scroll"><table id="playerLedger"></table></div>
      </section>`;
    $("roleFilter").value = state.role; $("search").value = state.search;
    $("roleFilter").onchange = e => { state.role = e.target.value; ranking(); };
    $("search").oninput = e => { state.search = e.target.value; ranking(); };
    ranking(); history();

    function ranking() {
      const role = state.role.toLowerCase(), q = state.search.trim().toLowerCase();
      const rows = pool.rows.filter(x => (!role || String(x.role).toLowerCase().includes(role)) && (!q || x.name.toLowerCase().includes(q)));
      $("ranking").innerHTML = `<tr><th class="num">#</th><th>Personagem</th><th>Classe</th><th>Função</th><th class="num">Saldo</th></tr>` +
        (rows.map((x, i) => `<tr class="click" data-key="${esc(x.key)}"><td class="num">${i + 1}</td><td>${esc(x.name)}</td><td>${esc(x.cls)}</td><td>${esc(x.role)}</td><td class="num"><b>${fmt(x.balance)}</b></td></tr>`).join("")
          || `<tr><td colspan="5" class="muted">Nenhum jogador encontrado.</td></tr>`);
      $("ranking").querySelectorAll("tr.click").forEach(tr => tr.onclick = () => {
        state.player = tr.dataset.key; history(); $("playerSection").scrollIntoView({ behavior: "smooth" });
      });
    }
    function history() {
      if (!state.player) { $("playerSection").hidden = true; return; }
      const lines = pool.ledger.filter(e => e.player === state.player);
      $("playerSection").hidden = false;
      $("playerTitle").textContent = `Histórico de ${lines.length ? lines[0].name : state.player} em ${r.name}`;
      $("playerLedger").innerHTML = `<tr><th>Data</th><th>Run</th><th>Motivo</th><th class="num">Pontos</th><th class="num">Saldo</th></tr>` +
        lines.slice().reverse().map(e => `<tr><td>${dateBR(e.date)}</td><td>${esc(e.run)}</td><td>${esc(e.reason)}</td><td class="num ${e.delta > 0 ? "pos" : e.delta < 0 ? "neg" : ""}">${signed(e.delta)}</td><td class="num">${fmt(e.balance)}</td></tr>`).join("");
    }
  }

  function viewRuns() {
    const pools = Object.values(result.pools);
    $("view").innerHTML = `<h1>Runs e itens</h1>` + pools.map(p => `
      <h2>${esc(p.raid.name)} <span class="muted">(${p.raid.size})</span></h2>
      ${p.runs.length ? p.runs.slice().reverse().map(run => `
        <details>
          <summary><b>${esc(run.run)}</b> · ${dateBR(run.date)} · pote ${fmt(run.pot)} · cota ${fmt(run.share)} · ${run.present} presentes · ${run.bench} no banco${run.note ? " · " + esc(run.note) : ""}</summary>
          <div class="scroll"><table>
            <tr><th>Personagem</th><th>Item</th><th>Tipo</th><th>Spec</th><th class="num">Preço</th><th class="num">Pago</th></tr>
            ${run.items.map(i => `<tr><td>${esc(i.player)}</td><td>${esc(i.item)}</td><td>${esc(i.type)}</td><td>${esc(i.spec)}</td><td class="num">${fmt(i.price)}</td><td class="num">${fmt(i.paid)}</td></tr>`).join("") || `<tr><td colspan="6" class="muted">Nenhum item registrado.</td></tr>`}
          </table></div>
        </details>`).join("") : `<p class="muted">Nenhuma run registrada ainda.</p>`}`).join("");
  }

  function viewRules() {
    const c = result.config, pools = Object.values(result.pools);
    $("view").innerHTML = `
      <h1>Regras e preços</h1>
      <p class="muted">Os valores vêm da planilha dos officers (aba config). A explicação completa está em <a href="#como">Como funciona</a>.</p>
      <h2>Parâmetros</h2>
      <div class="scroll"><table>
        <tr><th>Regra</th>${pools.map(p => `<th class="num">${esc(p.raid.name)}</th>`).join("")}</tr>
        <tr><td>Saldo inicial dos fundadores</td>${pools.map(p => `<td class="num">${fmt(c.founder_start * p.raid.mult)}</td>`).join("")}</tr>
        <tr><td>Bônus de pontualidade</td>${pools.map(p => `<td class="num">+${fmt(c.ontime_bonus * p.raid.mult)}</td>`).join("")}</tr>
        <tr><td>No-show sem aviso</td>${pools.map(p => `<td class="num">-${fmt(c.noshow_penalty * p.raid.mult)}</td>`).join("")}</tr>
        <tr><td>No-show (2º em diante no mês)</td>${pools.map(p => `<td class="num">-${fmt(c.noshow_repeat_penalty * p.raid.mult)}</td>`).join("")}</tr>
        <tr><td>Banco pronto</td>${pools.map(() => `<td class="num">${pct(c.bench_pct)} da cota</td>`).join("")}</tr>
        <tr><td>Decay mensal (dia ${c.decay_day})</td>${pools.map(() => `<td class="num">${pct(c.decay_pct)}</td>`).join("")}</tr>
      </table></div>
      <h2>Preços dos itens</h2>
      <div class="scroll"><table>
        <tr><th>Tipo</th><th>Descrição</th>${pools.map(p => `<th class="num">${esc(p.raid.name)}</th>`).join("")}</tr>
        ${Object.values(result.prices).map(pr => `<tr><td>${esc(pr.type)}</td><td>${esc(pr.desc)}</td>${pools.map(p => `<td class="num">${fmt(pr.price * p.raid.mult)}</td>`).join("")}</tr>`).join("")}
        <tr><td>OS</td><td>Offspec ou ninguém precisa</td>${pools.map(() => `<td class="num">0 (roll)</td>`).join("")}</tr>
      </table></div>`;
  }

  load();
})();
