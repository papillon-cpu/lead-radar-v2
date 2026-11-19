// Заготовки сообщений. Только то, что можно проверить: ниша, наличие сайта и одна реальная находка из проверки.
// Рассылка автоматически не делается: текст копируете и отправляете вы сами, по одному человеку.
import { topFinding } from "./audit.mjs";

export const DEFAULT_PROFILE = {
  name: "",            // как вас зовут в сообщении
  offer: "лендинги и сайты под ключ",
  portfolio: "",       // ссылка на портфолио
  freePreview: true,   // предлагать бесплатный черновик первого экрана
  contact: "",         // куда ответить, если не в этом мессенджере
};

function pick(list, seed) {
  let h = 0;
  for (const ch of String(seed)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return list[h % list.length];
}

const GREET = ["Здравствуйте!", "Добрый день!", "Здравствуйте, добрый день!"];
const CTA = [
  "Удобно будет созвониться на 10 минут и обсудить?",
  "Если интересно, давайте на 10 минут созвонимся.",
  "Могу показать на примере, если вам это интересно.",
];

export function buildMessages(lead, audit, profile = {}) {
  const p = { ...DEFAULT_PROFILE, ...profile };
  const seed = lead.id || lead.name || "x";
  const who = p.name ? `Меня зовут ${p.name}.` : "";
  const company = lead.name ? `«${lead.name}»` : "вашу компанию";
  const where = lead.source ? ` на ${lead.source}` : " в интернете";
  const service = lead.service ? ` У вас отдельно есть ${lead.service}.` : "";
  const finding = topFinding(audit);
  const niche = lead.niche ? ` для ${lead.niche}` : "";

  const preview = p.freePreview ? " Могу сделать черновик первого экрана бесплатно, чтобы вы увидели, как это выглядело бы." : "";
  const portfolio = p.portfolio ? ` Мои работы: ${p.portfolio}` : "";
  const optOut = " Если неинтересно, просто напишите «нет», больше не побеспокою.";

  const first = [
    pick(GREET, seed),
    who,
    `Нашёл ${company}${where}.${service}`,
    finding ? `${finding[0].toUpperCase()}${finding.slice(1)}, а это теряет клиентов.` : "",
    `Я делаю ${p.offer}${niche}.${preview}${portfolio}`,
    pick(CTA, seed + "c") + optOut,
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  const followup3 = `Здравствуйте! Пишу ещё раз по ${company}: ${finding ? finding + ". " : ""}Если тема сейчас неактуальна, скажите, и я не буду беспокоить. Если актуальна, пришлю пример под вашу нишу.`;
  const followup7 = `Добрый день! Последнее напоминание: сделал примерный первый экран для ${company}. Если интересно, пришлю ссылку без обязательств. Если нет, ответ «нет» меня полностью устроит.`;

  return { first, followup3, followup7, length: first.length };
}

/** Черновик отклика на чужой заказ (Профи, Авито, Kwork): по тексту заказа, без выдуманных фактов. */
export function buildOrderReply(orderText, profile = {}) {
  const p = { ...DEFAULT_PROFILE, ...profile };
  const t = String(orderText || "").toLowerCase().replace(/ё/g, "е");
  const kinds = [];
  if (/лендинг|одностраничн|сайт-визитк|визитк/.test(t)) kinds.push("лендинг");
  if (/(?<![а-яa-z])(бот|телеграм|telegram|тг)/.test(t)) kinds.push("Telegram-бот");
  if (/автоматизац|интеграц|парсер|парсинг|скрипт|таблиц/.test(t)) kinds.push("автоматизацию");
  const what = kinds.length ? kinds.join(" и ") : "вашу задачу";
  const budget = (orderText.match(/(\d[\d\s ]*)\s*(?:₽|руб)/i) || [])[1];
  const lines = [
    "Здравствуйте!",
    p.name ? `Меня зовут ${p.name}.` : "",
    `Прочитал ваш заказ, могу взять ${what}.`,
    "Чтобы назвать срок и точную цену, уточню два момента: какой результат вы хотите получить и есть ли уже материалы (тексты, логотип, примеры сайтов, которые нравятся).",
    budget ? `Ваш бюджет (${budget.trim()} ₽) учту, подберу объём под него.` : "Подскажите, пожалуйста, на какой бюджет вы рассчитываете, и я подберу объём.",
    p.portfolio ? `Мои работы: ${p.portfolio}` : "",
    "Работаю с предоплатой 50%, остальное после показа готовой работы. Когда вам удобно коротко созвониться или переписаться?",
  ];
  return lines.filter(Boolean).join("\n");
}
