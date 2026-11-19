// Лид-радар: рабочий стол. Три панели — поиск, отбор, карточка клиента.
const $ = (s) => document.querySelector(s);
const state = { leads: [], orders: [], profile: {}, statuses: [], selected: null, categories: [] };

const STATUS_LABEL = {
  new: "Новый", audited: "Проверен", drafted: "Сообщение готово", contacted: "Написали",
  replied: "Ответил", call: "Созвон", won: "Клиент", lost: "Отказ", skip: "Пропустить",
};
const ACTIVE = ["new", "audited", "drafted", "contacted", "replied", "call"];

async function api(path, opts = {}) {
  const res = await fetch(path, {
    method: opts.method || "GET",
    headers: { "Content-Type": "application/json" },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Ошибка " + res.status);
  return data;
}

const esc = (s) =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

async function load() {
  const data = await api("/api/state");
  state.leads = data.leads || [];
  state.profile = data.profile || {};
  state.statuses = data.statuses || [];
  state.categories = data.categories || [];
  renderCats();
  renderQueue();
  renderSettings();
  $("#queueCount").textContent = `${state.leads.filter((l) => ACTIVE.includes(l.status)).length} в очереди`;
  if (state.selected) renderCard(findLead(state.selected));
}

const findLead = (id) => state.leads.find((l) => l.id === id);

function renderCats() {
  $("#cats").innerHTML = state.categories
    .map((c) => `<button data-cat="${esc(c)}">${esc(c)}</button>`)
    .join("");
  $("#cats").onclick = (e) => {
    const b = e.target.closest("button[data-cat]");
    if (!b) return;
    $("#q").value = b.dataset.cat;
    $("#city").focus();
  };
}

function visibleLeads() {
  const onlyActive = $("#onlyActive").checked;
  const f = $("#filter").value.trim().toLowerCase();
  return state.leads.filter((l) => {
    if (onlyActive && !ACTIVE.includes(l.status)) return false;
    if (!f) return true;
    return (l.name + " " + l.city + " " + l.niche).toLowerCase().includes(f);
  });
}

function renderQueue() {
  const list = visibleLeads();
  $("#queue").innerHTML = list.length
    ? list
        .map((l) => {
          const badges = [];
          if (l.source) badges.push(`<span class="badge">${esc(l.source)}</span>`);
          if (l.audit && l.audit.ok) badges.push(`<span class="badge ok">сайт проверен</span>`);
          else if (l.audit) badges.push(`<span class="badge warn">есть замечания</span>`);
          else badges.push(`<span class="badge">не проверен</span>`);
          if (l.messages) badges.push(`<span class="badge info">${esc(STATUS_LABEL[l.status] || l.status)}</span>`);
          return `<div class="qitem ${l.id === state.selected ? "sel" : ""}" data-id="${l.id}">
            <div class="qname">${esc(l.name)}</div>
            <div class="qmeta">${esc(l.niche || "")}${l.city ? " · " + esc(l.city) : ""}</div>
            <div>${badges.join("")}</div>
          </div>`;
        })
        .join("")
    : `<div class="empty">Пока пусто. Задайте нишу и нажмите «Найти клиентов».</div>`;
  $("#queue").onclick = (e) => {
    const it = e.target.closest(".qitem");
    if (!it) return;
    state.selected = it.dataset.id;
    renderQueue();
    renderCard(findLead(state.selected));
  };
}

function renderCard(l) {
  if (!l) {
    $("#cardBox").innerHTML = `<h2 class="muted">Клиент не выбран</h2>`;
    return;
  }
  const a = l.audit;
  const auditText = a
    ? a.ok
      ? "Сайт в порядке — можно предлагать."
      : (a.problems || []).join("; ") || "Есть замечания."
    : "Ещё не проверена.";
  const yandexLink = l.site
    ? `https://yandex.ru/maps/?text=${encodeURIComponent(l.name + " " + l.city)}`
    : `https://yandex.ru/maps/?text=${encodeURIComponent(l.name + " " + (l.city || ""))}`;
  const avitoLink = `https://www.avito.ru/${encodeURIComponent((l.city || "").replace(/ /g, "/"))}?q=${encodeURIComponent(l.name)}`;
  const wa = l.phone ? "https://wa.me/7" + String(l.phone).replace(/\D/g, "").slice(-10) : "";
  $("#cardBox").innerHTML = `
    <h2>${esc(l.name)}</h2>
    <div class="row">
      <span class="badge">${esc(STATUS_LABEL[l.status] || l.status)}</span>
      ${l.source ? `<span class="badge">${esc(l.source)}</span>` : ""}
    </div>
    <div class="label">ПРОВЕРКА САЙТА</div>
    <p class="small">${esc(auditText)}</p>
    <div class="row">
      <a href="${yandexLink}" target="_blank">Открыть на карте ↗</a>
      <a href="${avitoLink}" target="_blank">Найти на Авито ↗</a>
    </div>
    <div class="row" style="margin-top:12px">
      <button class="primary" data-act="audit">Проверить сайт</button>
      <button data-act="message">Составить сообщение</button>
      <button data-act="landing">Лендинг-превью</button>
    </div>
    <div id="cardOut"></div>
    <div class="label">ДАННЫЕ КЛИЕНТА</div>
    <dl class="kv">
      <dt>САЙТ</dt><dd>${l.site ? `<a href="${esc(l.site)}" target="_blank">${esc(l.site)}</a>` : "Не указан"}</dd>
      <dt>ТЕЛЕФОН</dt><dd>${esc(l.phone || "Не указан")}</dd>
      <dt>TELEGRAM</dt><dd>${esc(l.telegram || "Не указан")}</dd>
      <dt>WHATSAPP</dt><dd>${wa ? `<a href="${wa}" target="_blank">${esc(l.phone)}</a>` : "Не указан"}</dd>
      <dt>АДРЕС</dt><dd>${esc(l.address || "Не указан")}</dd>
      ${l.url ? `<dt>АВИТО</dt><dd><a href="${esc(l.url)}" target="_blank">Объявление ↗</a></dd>` : ""}
      ${l.notes ? `<dt>ЗАМЕТКА</dt><dd>${esc(l.notes)}</dd>` : ""}
    </dl>
    <div class="label">СТАТУС</div>
    <select id="statusSel">${state.statuses
      .map((s) => `<option value="${s.id}" ${s.id === l.status ? "selected" : ""}>${esc(s.label)}</option>`)
      .join("")}</select>`;

  $("#cardBox").onclick = async (e) => {
    const btn = e.target.closest("button[data-act]");
    if (!btn) return;
    const act = btn.dataset.act;
    btn.disabled = true;
    const out = $("#cardOut");
    try {
      if (act === "audit") {
        out.innerHTML = `<div class="muted small">Проверяю сайт…</div>`;
        await api(`/api/lead/${l.id}/audit`, { method: "POST", body: {} });
      }
      if (act === "message") {
        out.innerHTML = `<div class="muted small">Готовлю сообщение…</div>`;
        await api(`/api/lead/${l.id}/message`, { method: "POST", body: {} });
      }
      if (act === "landing") {
        const r = await api(`/api/lead/${l.id}/landing`, { method: "POST", body: {} });
        out.innerHTML = `<div class="msgbox">Превью готово: <a href="${r.url}" target="_blank">${r.url}</a></div>`;
      }
      await load();
      const fresh = findLead(l.id);
      if (fresh?.messages?.first) {
        $("#cardOut").innerHTML = `<div class="label">СООБЩЕНИЕ</div><div class="msgbox">${esc(fresh.messages.first)}</div>`;
      }
    } catch (err) {
      out.innerHTML = `<div class="msgbox">Не получилось: ${esc(err.message)}</div>`;
    } finally {
      btn.disabled = false;
    }
  };
  $("#statusSel").onchange = async (e) => {
    await api(`/api/lead/${l.id}`, { method: "POST", body: { status: e.target.value } });
    await load();
  };
}

async function loadOrders() {
  try {
    const r = await api("/api/orders");
    state.orders = r.orders || [];
    const good = state.orders.filter((o) => o.score > 0).length;
    $("#ordersBox").innerHTML = state.orders.length
      ? `${state.orders.length} заказов, ${good} подходящих`
      : "Заказов пока нет — запустите расширение «Авито-сканер». ";
  } catch {
    $("#ordersBox").textContent = "Не удалось загрузить заказы";
  }
}

async function doSearch() {
  const q = $("#q").value.trim();
  if (!q) return ($("#searchMsg").textContent = "Укажите нишу или услугу");
  const sources = [...document.querySelectorAll('input[name="src"]:checked')].map((i) => i.value);
  $("#searchMsg").textContent = "Ищу…";
  $("#searchBtn").disabled = true;
  try {
    const parts = [];
    if (sources.includes("egrul") || sources.includes("yandex")) {
      const r = await api("/api/discover", {
        method: "POST",
        body: { query: q, city: $("#city").value.trim(), sources: sources.filter((s) => s !== "avito") },
      });
      parts.push(`найдено ${r.found}, добавлено ${r.added}`);
      if (r.errors?.length) parts.push(r.errors.join("; "));
    }
    if (sources.includes("avito")) {
      const r = await api("/api/avito/queue", { method: "POST", body: {} });
      parts.push(`Авито: добавлено ${r.added}`);
    }
    $("#searchMsg").textContent = parts.join(" · ");
    await load();
  } catch (e) {
    $("#searchMsg").textContent = "Ошибка: " + e.message;
  } finally {
    $("#searchBtn").disabled = false;
  }
}

function renderSettings() {
  const p = state.profile;
  $("#sName").value = p.name || "";
  $("#sOffer").value = p.offer || "";
  $("#sPortfolio").value = p.portfolio || "";
  $("#sContact").value = p.contact || "";
  $("#sModel").value = p.aiModel || "";
  $("#sProvider").innerHTML = (state.providers || [])
    .map((pr) => `<option value="${pr.id}" ${pr.id === p.aiProvider ? "selected" : ""}>${esc(pr.label)}</option>`)
    .join("");
  $("#sProvider").innerHTML = (window.__providers || [])
    .map((pr) => `<option value="${pr.id}" ${pr.id === p.aiProvider ? "selected" : ""}>${esc(pr.label)}</option>`)
    .join("");
}

async function openSettings() {
  const data = await api("/api/state");
  window.__providers = data.providers || [];
  renderSettings();
  $("#settings").showModal();
}

$("#settingsBtn").onclick = openSettings;
$("#searchBtn").onclick = doSearch;
$("#filter").oninput = renderQueue;
$("#onlyActive").onchange = renderQueue;
$("#refreshOrders").onclick = loadOrders;
$("#importAvito").onclick = async () => {
  const r = await api("/api/avito/queue", { method: "POST", body: {} });
  $("#ordersBox").textContent = `Добавлено в очередь: ${r.added}`;
  await load();
};
$("#prepareBtn").onclick = async (e) => {
  e.target.disabled = true;
  e.target.textContent = "Готовлю…";
  try {
    const r = await api("/api/prepare", { method: "POST", body: { limit: 10 } });
    e.target.textContent = `Готово: ${r.prepared}`;
    await load();
  } finally {
    setTimeout(() => {
      e.target.disabled = false;
      e.target.textContent = "Подготовить до 10";
    }, 1500);
  }
};

$("#settings").addEventListener("close", async () => {
  const res = $("#settings").returnValue;
  if (res === "save" || res === "test") {
    const body = {
      name: $("#sName").value,
      offer: $("#sOffer").value,
      portfolio: $("#sPortfolio").value,
      contact: $("#sContact").value,
      aiProvider: $("#sProvider").value,
      aiModel: $("#sModel").value,
    };
    if ($("#sAiKey").value) body.aiKey = $("#sAiKey").value;
    if ($("#sYandexKey").value) body.yandexKey = $("#sYandexKey").value;
    if ($("#s2gisKey").value) body.twogisKey = $("#s2gisKey").value;
    await api("/api/profile", { method: "POST", body });
    $("#settingsMsg").textContent = res === "test" ? "Проверяю…" : "Сохранено";
    if (res === "test") {
      const r = await api("/api/ai/test", { method: "POST", body: {} });
      $("#settingsMsg").textContent = "ИИ отвечает: " + (r.answer || "ок");
    }
    await load();
  }
});

load();
loadOrders();
