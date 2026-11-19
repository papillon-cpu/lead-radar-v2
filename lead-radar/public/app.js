// Интерфейс лид-радара v2. Всё общение — с тем же сервером, что и для расширения Авито.
const $ = (s) => document.querySelector(s);
const el = (id) => document.getElementById(id);
let state = { leads: [], profile: {}, statuses: [], providers: [] };
let orders = [];

function toast(msg) {
  const t = el("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2600);
}

async function api(path, body) {
  const res = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || `Ошибка ${res.status}`);
  return j;
}

// ---------- вкладки ----------
document.querySelectorAll(".tab").forEach((b) =>
  b.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((x) => x.classList.remove("active"));
    document.querySelectorAll(".pane").forEach((x) => x.classList.remove("active"));
    b.classList.add("active");
    el(b.dataset.tab).classList.add("active");
  })
);

// ---------- заказы ----------
async function loadOrders(analyze = true) {
  const saved = await api("/api/orders");
  orders = saved.orders || [];
  if (!orders.length) {
    el("ordersList").innerHTML = '<div class="card muted">Заказов пока нет. Откройте раздел «Заказы» на Авито и запустите расширение «Авито-сканер» — он пришлёт находки сюда.</div>';
    el("ordersSummary").textContent = "";
    return;
  }
  if (analyze) {
    el("status").textContent = "Оцениваю заказы…";
    try {
      const r = await api("/api/avito/analyze", { orders, ai: el("useAI").checked });
      orders = r.orders;
      el("ordersSummary").textContent = `Всего ${r.total}, подходящих ${r.relevant}${r.ai ? `, оценено моделью ${r.aiScored}` : ""}.`;
    } catch (e) {
      toast(e.message);
    }
  }
  renderOrders();
}

function renderOrders() {
  const onlyGood = el("onlyGood").checked;
  const list = el("ordersList");
  list.innerHTML = "";
  const items = orders.filter((o) => (onlyGood ? o.score > 0 : true));
  for (const o of items.slice(0, 40)) {
    const div = document.createElement("div");
    div.className = "item";
    const meta = [
      o.city ? `<span>${o.city}</span>` : "",
      o.budget ? `<span>${o.budget} ₽</span>` : "",
      `<span class="pill ${o.score > 0 ? "good" : "bad"}">${o.score > 0 ? "подходит" : "мимо"}</span>`,
      o.ai ? `<span class="pill good">ИИ: ${o.score}/10</span>` : "",
      (o.services || []).length ? `<span>${o.services.map((s) => s.label || s).join(", ")}</span>` : "",
    ].join("");
    div.innerHTML = `<div class="t"></div><div class="m">${meta}</div><div class="r muted"></div><div class="acts"><a href="#" target="_blank" rel="noreferrer">Открыть заказ</a></div>`;
    div.querySelector(".t").textContent = o.title || "(без названия)";
    div.querySelector("a").href = o.url || "#";
    div.querySelector(".r").textContent = o.reason || "";
    if (o.reply) {
      const ta = document.createElement("textarea");
      ta.rows = 4;
      ta.value = o.reply;
      ta.readOnly = true;
      div.appendChild(ta);
      const copy = document.createElement("button");
      copy.textContent = "Скопировать ответ";
      copy.onclick = async () => {
        await navigator.clipboard.writeText(o.reply);
        copy.textContent = "Скопировано";
        setTimeout(() => (copy.textContent = "Скопировать ответ"), 1500);
      };
      const imp = document.createElement("button");
      imp.textContent = "В лиды";
      imp.onclick = async () => {
        try {
          const r = await api("/api/avito/import", { urls: [o.url] });
          toast(`В лиды: ${r.added}, дублей: ${r.skipped}`);
        } catch (e) {
          toast(e.message);
        }
      };
      div.querySelector(".acts").append(copy, imp);
    }
    list.appendChild(div);
  }
}

// ---------- лиды ----------
function renderLeads() {
  const q = el("leadSearch").value.trim().toLowerCase();
  const list = el("leadsList");
  list.innerHTML = "";
  const items = state.leads.filter((l) => !q || `${l.name} ${l.niche} ${l.city} ${l.site}`.toLowerCase().includes(q));
  el("leadsSummary").textContent = `Лидов: ${state.leads.length}, показано: ${items.length}.`;
  for (const l of items.slice(0, 60)) {
    const div = document.createElement("div");
    div.className = "item";
    const status = state.statuses.find((s) => s.id === l.status);
    div.innerHTML = `<div class="t"></div><div class="m"><span class="pill">${status ? status.label : l.status}</span><span>${l.city || ""}</span><span>${l.niche || ""}</span></div><div class="acts"><button class="msg">Черновик сообщения</button><button class="copy">Скопировать</button></div>`;
    div.querySelector(".t").textContent = l.name || "(без названия)";
    div.querySelector(".copy").onclick = async () => {
      const text = l.messages?.first || `${l.name}\n${l.phone || l.telegram || ""}`;
      await navigator.clipboard.writeText(text);
      toast("Скопировано");
    };
    div.querySelector(".msg").onclick = async () => {
      try {
        const r = await api(`/api/lead/${l.id}/message`, { ai: true });
        const m = r.messages?.first || "";
        const ta = document.createElement("textarea");
        ta.rows = 4;
        ta.value = m;
        ta.readOnly = true;
        div.appendChild(ta);
        toast("Черновик готов");
      } catch (e) {
        toast(e.message);
      }
    };
    list.appendChild(div);
  }
}

// ---------- настройки ----------
function fillProfile(p) {
  el("pName").value = p.name || "";
  el("pOffer").value = p.offer || "";
  el("pPortfolio").value = p.portfolio || "";
  el("pContact").value = p.contact || "";
  el("pFreePreview").checked = p.freePreview !== false;
  el("aiProvider").value = p.aiProvider || "gigachat";
  el("aiModel").value = p.aiModel || "";
  el("aiKey").placeholder = p.aiKey ? "ключ задан" : "вставьте ключ";
  el("twogisKey").placeholder = p.twogisKey ? "ключ задан" : "dev.2gis.ru";
}

async function refreshState() {
  state = await api("/api/state");
  fillProfile(state.profile);
  renderLeads();
  el("status").textContent = "";
}

// ---------- события ----------
el("refreshOrders").onclick = () => loadOrders(true);
el("onlyGood").onchange = renderOrders;
el("useAI").onchange = () => loadOrders(true);
el("importAll").onclick = async () => {
  try {
    const r = await api("/api/avito/import", {});
    toast(`Импортировано: ${r.added}, дублей: ${r.skipped}`);
    refreshState();
  } catch (e) {
    toast(e.message);
  }
};
el("refreshLeads").onclick = refreshState;
el("leadSearch").oninput = renderLeads;
el("auditAll").onclick = async () => {
  el("status").textContent = "Проверяю сайты…";
  try {
    const r = await api("/api/audit-all", {});
    toast(`Проверено: ${r.audited}`);
    refreshState();
  } catch (e) {
    toast(e.message);
  }
};
el("saveProfile").onclick = async () => {
  const body = {
    name: el("pName").value,
    offer: el("pOffer").value,
    portfolio: el("pPortfolio").value,
    contact: el("pContact").value,
    freePreview: el("pFreePreview").checked,
    aiProvider: el("aiProvider").value,
    aiModel: el("aiModel").value,
  };
  if (el("aiKey").value.trim()) body.aiKey = el("aiKey").value.trim();
  if (el("twogisKey").value.trim()) body.twogisKey = el("twogisKey").value.trim();
  try {
    await api("/api/profile", body);
    el("aiKey").value = "";
    el("twogisKey").value = "";
    toast("Сохранено");
    refreshState();
  } catch (e) {
    toast(e.message);
  }
};
el("testAI").onclick = async () => {
  el("status").textContent = "Проверяю ключ…";
  try {
    await api("/api/profile", {
      aiProvider: el("aiProvider").value,
      aiModel: el("aiModel").value,
      ...(el("aiKey").value.trim() ? { aiKey: el("aiKey").value.trim() } : {}),
    });
    const r = await api("/api/ai/test", {});
    toast(r.ok ? "Модель отвечает: " + r.answer : "Модель молчит");
  } catch (e) {
    toast(e.message);
  }
  el("status").textContent = "";
};
el("doSearch").onclick = async () => {
  el("status").textContent = "Ищу…";
  try {
    const r = await api("/api/search", { query: el("searchQuery").value, city: el("searchCity").value });
    toast(`Найдено: ${r.found}, добавлено: ${r.added}`);
    refreshState();
  } catch (e) {
    toast(e.message);
  }
  el("status").textContent = "";
};
el("doImport").onclick = async () => {
  try {
    const r = await api("/api/import", { text: el("importText").value });
    toast(`Добавлено: ${r.added}, дублей: ${r.skipped}`);
    el("importText").value = "";
    refreshState();
  } catch (e) {
    toast(e.message);
  }
};

refreshState().then(() => loadOrders(true)).catch((e) => {
  el("status").textContent = e.message;
});
