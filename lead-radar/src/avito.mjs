// Разбор заказов с Авито: оценка, подходит ли он под наши услуги, какая услуга нужна.
// Никакого обхода защиты и парсинга закрытых данных — только то, что браузер уже показал на странице.

export const SERVICE_RULES = [
  { id: "landing", label: "лендинг", re: /лендинг|одностраничник|landing|промо-?страниц/i },
  { id: "site", label: "сайт", re: /сайт|интернет-?магазин|магазин\s+на|каталог|витрина|вёрстк|верстк/i },
  { id: "bot", label: "Telegram-бот", re: /бот\b|bot\b|телеграм|telegram|тг-?бот|chat ?bot|вк-?бот/i },
  { id: "automation", label: "автоматизация", re: /автоматиз|интеграц|парсер|парсинг|скрипт|workflow|n8n|автомат/i },
  { id: "ai", label: "AI-решение", re: /нейросет|нейро|chatgpt|gpt-?4|claude|gemini|\bllm\b|\brag\b|ии-?(агент|ассистент)|ai-?(агент|ассистент)|промпт/i },
  { id: "webapp", label: "веб-приложение", re: /веб-?приложение|web-?app|pwa|single-?page|\bspa\b|mini ?app|мини-?приложение/i },
  { id: "crm", label: "CRM/учёт", re: /\bcrm\b|amo(crm)?|битрикс24|bitrix24|1с|один\s+с\b/i },
  { id: "design", label: "дизайн", re: /дизайн|макет|фирменный стиль|логотип|айдентика/i },
  { id: "content", label: "контент/карточки", re: /контент|копирайт|описания товаров|карточки товаров|наполнени|заполнени/i },
  { id: "api", label: "API/обмен данными", re: /\bapi\b|webhook|выгрузк|обмен данными|парсер данных/i },
  { id: "ads", label: "реклама", re: /реклам|таргет|продвижени|контекст/i },
];

// То, что не про разработку. Отсекаем на входе, чтобы в базу не сыпались вакансии и быт.
export const NEGATIVE_RE =
  /ваканси|ищу\s+(работу|сотрудник|исполн|специалист|подработ)|резюме|требуется\s+(сотрудник|менеджер|продавец|водитель|курьер|уборщик|мастер)|репетитор|курсы|обучение|ремонт|юрист|бухгалтер|переезд|грузчик|фотосесси|свадьб|выгул/i;

export const CITIES = {
  moscow: "Москва", spb: "Санкт-Петербург", ekaterinburg: "Екатеринбург", kazan: "Казань",
  novosibirsk: "Новосибирск", nizhniy: "Нижний Новгород", chelyabinsk: "Челябинск", samara: "Самара",
  omsk: "Омск", rostov: "Ростов-на-Дону", krasnodar: "Краснодар", voronezh: "Воронеж", perm: "Пермь",
  volgograd: "Волгоград", krasnoyarsk: "Красноярск", vladivostok: "Владивосток", irkutsk: "Иркутск",
  tula: "Тула", kaliningrad: "Калининград", udmurtia: "Ижевск", barnaul: "Барнаул", msk: "Москва",
};

export function detectCity(url = "") {
  const m = String(url).match(/avito\.ru\/([a-z0-9-]+)/i);
  const slug = m ? m[1] : "";
  return CITIES[slug] || (slug ? slug : "");
}

export function detectBudget(text = "") {
  const m = String(text).match(/(\d[\d\s\u00a0]*)\s*(?:₽|руб(?:\.|лей)?|р\.?)/i);
  if (!m) return "";
  const n = Number(m[1].replace(/\s|\u00a0/g, ""));
  return Number.isFinite(n) ? String(n) : "";
}

export function normalizeUrl(url = "") {
  try {
    const u = new URL(url);
    u.hash = "";
    u.search = "";
    return u.origin + u.pathname.replace(/\/+$/, "");
  } catch {
    return String(url);
  }
}

/** Оценивает заказ: подходит ли под наши услуги и какая именно нужна. */
export function matchOrder(order = {}) {
  const title = String(order.title || "").trim();
  const text = String(order.text || "").trim();
  const hay = `${title}. ${text}`;
  const services = SERVICE_RULES.filter((r) => r.re.test(hay)).map((r) => ({ id: r.id, label: r.label }));
  const negative = NEGATIVE_RE.test(hay);
  let score = Math.min(services.length * 2, 8);
  if (negative) score -= 5;
  if (services.length === 0) score = 0;
  if (score < 0) score = 0;
  const budget = detectBudget(hay);
  return {
    score,
    services,
    budget,
    city: order.city || detectCity(order.url || ""),
    negative,
    reason: services.length ? services.map((s) => s.label).join(", ") : "не найдено наших услуг",
  };
}

/** Разбор одного заказа целиком: оценка + данные для CRM. */
export function analyzeOrder(order = {}, profile = {}) {
  const m = matchOrder(order);
  const title = String(order.title || "").trim().slice(0, 160);
  return {
    ...order,
    title,
    url: normalizeUrl(order.url || ""),
    text: String(order.text || "").slice(0, 1200),
    budget: order.budget || m.budget,
    city: m.city,
    score: m.score,
    services: m.services,
    reason: m.reason,
    // Готовый черновик ответа собирает message.mjs — здесь только то, что ему нужно.
    orderText: `${title}. ${String(order.text || "")}`.trim(),
  };
}

export function summarize(orders = [], profile = {}) {
  const list = orders.map((o) => analyzeOrder(o, profile));
  return {
    total: list.length,
    relevant: list.filter((o) => o.score > 0).length,
    orders: list.sort((a, b) => b.score - a.score),
  };
}
