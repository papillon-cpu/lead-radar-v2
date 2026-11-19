// Черновик лендинга под конкретного лида. Правило: ничего не выдумываем.
// Название, телефон, город, адрес и услуги берутся только из карточки лида. Всё остальное (цены, отзывы, годы опыта, адрес)
// остаётся видимой пометкой «ПОДСТАВИТЬ», чтобы черновик нельзя было по ошибке выдать за настоящий сайт компании.

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export const NICHES = {
  repair: {
    match: /ремонт|отделк|строит|ванн|сантех|плитк|электрик/i,
    label: "Ремонт и отделка",
    accent: "#e07a1f",
    headline: (n) => `${n}: ремонт без сюрпризов`,
    sub: "Оставьте заявку, и мы рассчитаем стоимость по вашему объекту.",
    services: ["Ремонт под ключ", "Отделочные работы", "Сантехника и электрика"],
    steps: ["Заявка и звонок", "Замер и смета", "Договор и работы", "Сдача объекта"],
    cta: "Рассчитать стоимость",
  },
  auto: {
    match: /авто|шиномонтаж|детейлинг|кузов|сто\b|мойк/i,
    label: "Автосервис",
    accent: "#d7263d",
    headline: (n) => `${n}: запишитесь на удобное время`,
    sub: "Диагностика и ремонт. Назовите марку и проблему, мы подскажем стоимость.",
    services: ["Диагностика", "Ремонт и обслуживание", "Шиномонтаж"],
    steps: ["Запись онлайн", "Диагностика", "Согласование цены", "Ремонт и выдача"],
    cta: "Записаться",
  },
  beauty: {
    match: /барбер|салон|красот|маникюр|парикмахер|косметолог|стриж|ногт|брови/i,
    label: "Салон красоты",
    accent: "#b14aed",
    headline: (n) => `${n}: запись онлайн за минуту`,
    sub: "Выберите услугу и удобное время, мы подтвердим запись.",
    services: ["Стрижки и укладки", "Уход и процедуры", "Маникюр"],
    steps: ["Выберите услугу", "Выберите время", "Подтверждение", "Ждём вас"],
    cta: "Записаться",
  },
  clinic: {
    match: /клиник|стоматолог|врач|медиц|зуб|массаж|психолог|диагност/i,
    label: "Клиника",
    accent: "#1a9d8f",
    headline: (n) => `${n}: запись на приём`,
    sub: "Запишитесь на консультацию, администратор свяжется с вами.",
    services: ["Консультация", "Диагностика", "Лечение"],
    steps: ["Оставьте заявку", "Подтверждение записи", "Приём", "Рекомендации"],
    cta: "Записаться на приём",
  },
  legal: {
    match: /юрист|юридич|адвокат|нотариус|бухгалтер|консалтинг/i,
    label: "Юридические услуги",
    accent: "#2f5fd0",
    headline: (n) => `${n}: первичная консультация`,
    sub: "Расскажите о ситуации, мы подскажем, как действовать.",
    services: ["Консультация", "Подготовка документов", "Представительство"],
    steps: ["Обращение", "Консультация", "Договор", "Работа по делу"],
    cta: "Получить консультацию",
  },
  generic: {
    match: /./,
    label: "Услуги",
    accent: "#2e7d32",
    headline: (n) => n,
    sub: "Оставьте заявку, и мы свяжемся с вами.",
    services: ["Основная услуга", "Дополнительная услуга", "Консультация"],
    steps: ["Заявка", "Уточнение деталей", "Выполнение", "Результат"],
    cta: "Оставить заявку",
  },
};

export function detectNiche(text) {
  const t = String(text || "");
  return Object.entries(NICHES).find(([k, v]) => k !== "generic" && v.match.test(t))?.[0] ?? "generic";
}

const slot = (what) => `<span class="todo">[ПОДСТАВИТЬ: ${esc(what)}]</span>`;

export function buildLanding(lead, { author = "" } = {}) {
  const key = detectNiche(`${lead.niche} ${lead.name} ${lead.service}`);
  const n = NICHES[key];
  const name = lead.name || "Название компании";
  const services = lead.service ? lead.service.split(/[,;]\s*/).filter(Boolean) : n.services;
  const exampleServices = !lead.service;
  const tel = lead.phone ? `tel:+${String(lead.phone).replace(/\D/g, "").replace(/^8/, "7")}` : "";
  const tg = lead.telegram ? (lead.telegram.startsWith("http") ? lead.telegram : `https://t.me/${lead.telegram.replace(/^@/, "")}`) : "";
  const contact = tel
    ? `<a class="btn" href="${esc(tel)}">${esc(n.cta)}: ${esc(lead.phone)}</a>`
    : `<span class="btn off">${esc(n.cta)} ${slot("телефон")}</span>`;

  return `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(name)}${lead.city ? ", " + esc(lead.city) : ""}</title>
<style>
:root{--accent:${n.accent};--bg:#fff;--ink:#17181c;--mute:#5b6070;--line:#e4e6ec}
@media (prefers-color-scheme:dark){:root{--bg:#121316;--ink:#f1f2f5;--mute:#a0a5b3;--line:#2a2c33}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif}
.preview{background:#111;color:#fff;text-align:center;font:600 13px/1.4 system-ui;padding:8px 12px}
.wrap{max-width:960px;margin:0 auto;padding:0 20px}
header.hero{padding:64px 0 48px}
.tag{display:inline-block;color:var(--accent);font:600 13px/1 system-ui;letter-spacing:.08em;text-transform:uppercase}
h1{font-size:clamp(28px,5vw,46px);line-height:1.12;margin:12px 0}
.sub{color:var(--mute);max-width:560px;font-size:18px}
.btn{display:inline-block;margin-top:24px;background:var(--accent);color:#fff;text-decoration:none;padding:14px 26px;border-radius:999px;font-weight:600}
.btn.off{opacity:.7}
section{padding:40px 0;border-top:1px solid var(--line)}
h2{font-size:24px;margin:0 0 20px}
.grid{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}
.card{border:1px solid var(--line);border-radius:16px;padding:20px}
.card b{display:block;margin-bottom:6px}
ol.steps{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));padding:0;list-style:none;counter-reset:s}
ol.steps li{counter-increment:s;border:1px solid var(--line);border-radius:16px;padding:18px}
ol.steps li::before{content:counter(s);display:block;color:var(--accent);font:700 22px/1 system-ui;margin-bottom:8px}
.todo{background:#fff3b0;color:#5a4a00;border-radius:6px;padding:0 6px;font-size:.9em}
footer{padding:28px 0;color:var(--mute);font-size:14px;border-top:1px solid var(--line)}
</style></head><body>
<div class="preview">ПРЕВЬЮ-ЧЕРНОВИК${author ? " от " + esc(author) : ""}: это не сайт компании, а пример того, как он мог бы выглядеть. Жёлтые пометки заполняются данными заказчика.</div>
<header class="hero"><div class="wrap">
<span class="tag">${esc(n.label)}${lead.city ? " · " + esc(lead.city) : ""}</span>
<h1>${esc(n.headline(name))}</h1>
<p class="sub">${esc(n.sub)}</p>
${contact}
</div></header>
<section><div class="wrap"><h2>Услуги${exampleServices ? " " + slot("уточнить список у заказчика") : ""}</h2>
<div class="grid">${services.map((s) => `<div class="card"><b>${esc(s)}</b>${slot("описание и цена")}</div>`).join("")}</div></div></section>
<section><div class="wrap"><h2>Как мы работаем</h2><ol class="steps">${n.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol></div></section>
<section><div class="wrap"><h2>Отзывы клиентов</h2><p>${slot("настоящие отзывы клиентов, выдуманные не используем")}</p></div></section>
<section><div class="wrap"><h2>Контакты</h2>
<p>${lead.phone ? `Телефон: <a href="${esc(tel)}">${esc(lead.phone)}</a>` : "Телефон " + slot("номер")}</p>
<p>${lead.address ? "Адрес: " + esc(lead.address) : "Адрес " + slot("адрес и режим работы")}</p>
${tg ? `<p>Telegram: <a href="${esc(tg)}">${esc(lead.telegram)}</a></p>` : ""}
</div></section>
<footer><div class="wrap">© ${esc(name)}. Черновик подготовлен для обсуждения.</div></footer>
</body></html>`;
}
