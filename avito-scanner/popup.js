// Панель расширения v2: сканируем страницу, шлём заказы в лид-радар (в облаке по умолчанию),
// получаем оценку и черновик ответа, импортируем лиды. Отклики не отправляются.
const DEFAULT_API = "https://lead-radar.spru.run";
const $ = (id) => document.getElementById(id);

let orders = [];
let scored = [];

function setStatus(text, ok = true) {
  $("status").textContent = text;
  $("status").style.color = ok ? "var(--muted)" : "#ff9a92";
}

function apiBase() {
  return ($("apiBase").value || DEFAULT_API).replace(/\/+$/, "");
}

async function api(path, body, method = "POST") {
  const res = await fetch(apiBase() + path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: method === "GET" ? undefined : JSON.stringify(body || {}),
  });
  if (!res.ok) throw new Error(`радар ответил ${res.status}`);
  return res.json();
}

// Сохраняем адрес радара между запусками.
chrome.storage.local.get(["apiBase"], (r) => {
  $("apiBase").value = r.apiBase || DEFAULT_API;
});
$("saveApi").onclick = () => {
  chrome.storage.local.set({ apiBase: apiBase() });
  setStatus("Адрес сохранён");
};

async function scan() {
  setStatus("Сканирую…");
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return setStatus("Нет вкладки", false);
  if (!/avito\.ru/.test(tab.url || "")) return setStatus("Откройте раздел заказов Авито", false);

  let data = { orders: [] };
  try {
    data = await chrome.tabs.sendMessage(tab.id, { type: "scan-now" });
  } catch {
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
      await new Promise((r) => setTimeout(r, 600));
      data = await chrome.tabs.sendMessage(tab.id, { type: "scan-now" });
    } catch {
      return setStatus("Не удалось прочитать страницу — обновите вкладку", false);
    }
  }
  orders = (data?.orders || []).map((o) => ({ ...o }));
  if (!orders.length) return setStatus("Заказы не найдены — прокрути страницу", false);

  setStatus(`Найдено: ${orders.length}`);
  await analyze();
}

async function analyze() {
  try {
    const res = await api("/api/avito/analyze", { orders, ai: $("useAI").checked });
    scored = res.orders || [];
    const note = res.ai ? `, оценено моделью ${res.aiScored}` : "";
    $("summary").textContent = `Всего ${scored.length}, подходящих ${scored.filter((o) => o.score > 0).length}${note}.`;
    render();
  } catch (e) {
    setStatus("Лид-радар не отвечает (" + e.message + ")", false);
  }
}

function render() {
  const onlyGood = $("onlyGood").checked;
  const items = scored.filter((o) => (onlyGood ? o.score > 0 : true));
  $("summary").textContent += ` Показываю ${items.length}.`;
  const list = $("list");
  list.innerHTML = "";
  for (const o of items.slice(0, 30)) {
    const div = document.createElement("div");
    div.className = "item";
    const meta = [
      o.city ? `<span>${o.city}</span>` : "",
      o.budget ? `<span>${o.budget} ₽</span>` : "",
      `<span class="pill ${o.score > 0 ? "good" : "bad"}">${o.score > 0 ? "подходит" : "мимо"}</span>`,
      o.ai ? `<span class="pill good">ИИ ${o.score}/10</span>` : "",
      o.services?.length ? `<span>${o.services.map((s) => s.label).join(", ")}</span>` : "",
    ].filter(Boolean).join("");
    div.innerHTML = `
      <div class="t"></div>
      <div class="m">${meta}</div>
      <div class="acts"><a href="#" target="_blank" rel="noreferrer">Открыть заказ</a></div>
    `;
    div.querySelector(".t").textContent = o.title || "(без названия)";
    div.querySelector("a").href = o.url || "#";
    if (o.reply) {
      const ta = document.createElement("textarea");
      ta.rows = 4;
      ta.value = o.reply;
      ta.readOnly = true;
      div.appendChild(ta);
      const btn = document.createElement("button");
      btn.textContent = "Скопировать ответ";
      btn.onclick = async () => {
        await navigator.clipboard.writeText(o.reply);
        btn.textContent = "Скопировано";
        setTimeout(() => (btn.textContent = "Скопировать ответ"), 1500);
      };
      div.querySelector(".acts").append(btn);
    }
    list.appendChild(div);
  }
}

// Сохранить заказы в радаре, чтобы они не потерялись между сессиями.
$("saveBtn").onclick = async () => {
  if (!orders.length) return setStatus("Сначала просканируйте страницу", false);
  try {
    const res = await api("/api/avito/orders", { orders });
    setStatus(`Сохранено новых: ${res.added}, всего в радаре: ${res.total}`);
  } catch (e) {
    setStatus("Не сохранилось (" + e.message + ")", false);
  }
};

async function importLeads() {
  const good = scored.filter((o) => o.score > 0);
  if (!good.length) return setStatus("Нет подходящих заказов", false);
  try {
    const res = await api("/api/avito/import", { urls: good.map((o) => o.url) });
    setStatus(`Импортировано: ${res.added}, дублей: ${res.skipped}`);
    chrome.notifications.create({
      type: "basic",
      title: "Лид-радар",
      message: `Импортировано заказов: ${res.added}`,
    });
  } catch (e) {
    setStatus("Импорт не удался (" + e.message + ")", false);
  }
}

$("scanBtn").onclick = scan;
$("importBtn").onclick = importLeads;
$("onlyGood").onchange = render;
$("useAI").onchange = () => analyze();

function citySlug() {
  return ($("city").value || "moscow").trim().replace(/^https?:\/\/.*avito\.ru\//i, "").split("/")[0];
}
$("openBtn").onclick = async () => {
  await chrome.tabs.create({ url: `https://www.avito.ru/${citySlug()}/zakazy` });
  window.close();
};
$("openServicesBtn").onclick = async () => {
  await chrome.tabs.create({ url: `https://www.avito.ru/${citySlug()}/predlozheniya_uslug` });
  window.close();
};

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "avito-orders") {
    orders = msg.orders || [];
    setStatus(`Найдено: ${orders.length}`);
    analyze();
  }
});
