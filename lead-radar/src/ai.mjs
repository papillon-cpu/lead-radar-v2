// Мозг для лид-радара: оценка заказов и черновики ответов через языковую модель.
// Провайдеры: GigaChat (Сбер), OpenAI, OpenRouter. Ключ хранится в профиле, в файле на диске.
// Если ключа нет или модель не ответила — всё продолжает работать на обычных правилах.

const PROVIDERS = {
  gigachat: { label: "GigaChat (Сбер)", base: "https://giga.sberbank.ru/api/v2/chat/completions", models: ["GigaChat-3-Pro", "GigaChat-3", "GigaChat-2-Pro"], oauth: "https://giga.sberbank.ru/api/v1/oauth/token?scope=GIGACHAT_PREVIEW" },
  openai: { label: "OpenAI (ChatGPT)", base: "https://api.openai.com/v1/chat/completions", models: ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini"] },
  openrouter: { label: "OpenRouter", base: "https://openrouter.ai/api/v1/chat/completions", models: ["openai/gpt-4o-mini", "anthropic/claude-3.5-sonnet", "google/gemini-flash-1.5"] },
};

export const AI_PROVIDERS = Object.entries(PROVIDERS).map(([id, p]) => ({ id, label: p.label, models: p.models }));

async function gigachatToken(key) {
  const res = await fetch(PROVIDERS.gigachat.oauth, {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(key).toString("base64")}`, "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error(`GigaChat OAuth ${res.status}`);
  const j = await res.json();
  if (!j.access_token) throw new Error("GigaChat не вернул токен");
  return j.access_token;
}

/** Один запрос к модели. Возвращает текст ответа или null, если ИИ недоступен. */
export async function askAI({ provider = "gigachat", key = "", model = "", system = "", user = "", json = false, fetchImpl = fetch, timeoutMs = 45000 }) {
  const p = PROVIDERS[provider];
  if (!p || !key) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = { "Content-Type": "application/json" };
    let url = p.base;
    if (provider === "gigachat") {
      const token = await gigachatToken(key);
      headers.Authorization = `Bearer ${token}`;
    } else {
      headers.Authorization = `Bearer ${key}`;
    }
    const body = {
      model: model || p.models[0],
      messages: [
        ...(system ? [{ role: "system", content: system }] : []),
        { role: "user", content: user },
      ],
      temperature: 0.4,
    };
    if (json) body.response_format = { type: "json_object" };
    const res = await fetchImpl(url, { method: "POST", headers, body: JSON.stringify(body), signal: controller.signal });
    if (!res.ok) throw new Error(`${p.label} ${res.status}`);
    const j = await res.json();
    const text = j?.choices?.[0]?.message?.content ?? "";
    return text || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Достаём JSON из ответа модели: модель любит оборачивать его в текст. */
export function parseJSON(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {}
  const m = String(text).match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}

const SCORE_SYSTEM = `Ты — фильтр заказов с Авито для веб-разработчика.
Отвечай ТОЛЬКО JSON без markdown: {"score": 0-10, "services": ["лендинг","сайт","Telegram-бот","автоматизация","AI-решение","CRM","дизайн","контент","API","реклама"], "reason": "коротко, до 120 символов", "reply": "черновик ответа заказчику, до 900 символов", "risks": ["..."]}.
score: 10 — идеально подходит, 1-3 — сомнительно, 0 — не наша услуга (вакансии, быт, ремонт, курсы).
reply — обращение на «вы», по-человечески, без выдуманных фактов и без обещаний сроков, с вопросом о бюджете и задаче, в конце — приглашение перейти в мессенджер и ссылка на портфолио, если она дана в профиле.`;

export async function scoreOrderWithAI(order, profile = {}, opts = {}) {
  const prof = profile || {};
  const payload = {
    title: order.title || "",
    text: (order.text || "").slice(0, 1200),
    budget: order.budget || "",
    city: order.city || "",
    author: {
      name: prof.name || "",
      offer: prof.offer || "",
      portfolio: prof.portfolio || "",
      contact: prof.contact || "",
    },
  };
  const raw = await askAI({
    ...opts,
    system: SCORE_SYSTEM,
    user: `Оцени заказ:\n${JSON.stringify(payload, null, 2)}`,
    json: true,
  });
  const j = parseJSON(raw);
  if (!j || typeof j.score !== "number") return null;
  return {
    score: Math.max(0, Math.min(10, Math.round(j.score))),
    services: Array.isArray(j.services) ? j.services.slice(0, 4) : [],
    reason: String(j.reason || "").slice(0, 200),
    reply: String(j.reply || "").slice(0, 2000),
    risks: Array.isArray(j.risks) ? j.risks.slice(0, 3).map(String) : [],
    ai: true,
  };
}

/** Черновик сообщения холодному лиду с проверкой сайта. */
export async function messageWithAI(lead, audit, profile = {}, opts = {}) {
  const raw = await askAI({
    ...opts,
    system: `Ты пишешь короткие деловые сообщения потенциальным клиентам в Telegram.
Правила: только то, что реально известно из карточки и проверки сайта; никаких выдуманных цифр, отзывов и сроков; тон спокойный, без давления; 3-6 предложений; в конце — один простой вопрос. Только plain text, без markdown.`,
    user: `Клиент: ${lead.name || "(без названия)"}\nНиша: ${lead.niche || "неизвестна"}\nГород: ${lead.city || "неизвестен"}\nСайт: ${lead.site || "нет"}\nКонтакты: ${lead.phone || lead.telegram || "не указаны"}\nЗаметка: ${lead.notes || "нет"}\nПроверка сайта: ${JSON.stringify(audit || {})}\nПрофиль автора: ${JSON.stringify(profile || {})}`
  });
  if (!raw) return null;
  return { text: raw.trim().slice(0, 3000), ai: true };
}
