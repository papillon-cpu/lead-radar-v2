// Таблица клиентов в обычном файле data/leads.json. Без базы данных: вы можете открыть и поправить её руками.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

export const STATUSES = ["new", "audited", "drafted", "contacted", "replied", "call", "won", "lost", "skip"];
export const STATUS_LABEL = {
  new: "Новый", audited: "Проверен", drafted: "Сообщение готово", contacted: "Написали", replied: "Ответил",
  call: "Созвон", won: "Клиент", lost: "Отказ", skip: "Пропустить",
};

export function createStore(file) {
  const dir = path.dirname(file);
  const load = () => {
    if (!existsSync(file)) return [];
    try {
      return JSON.parse(readFileSync(file, "utf8"));
    } catch {
      return [];
    }
  };
  const save = (leads) => {
    mkdirSync(dir, { recursive: true });
    const tmp = file + ".tmp";
    writeFileSync(tmp, JSON.stringify(leads, null, 2));
    renameSync(tmp, file);
  };
  return { load, save };
}

export const digits = (s) => String(s || "").replace(/\D/g, "").slice(-10);
export const host = (s) => {
  try {
    return new URL(/^https?:\/\//i.test(s) ? s : "https://" + s).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
};

/** Ключ для поиска дублей: ссылка на заказ, потом телефон, потом сайт, потом название и город. */
export function dedupeKey(l) {
  if (l.url) return "u:" + String(l.url).replace(/\/+$/, "");
  if (digits(l.phone).length === 10) return "p:" + digits(l.phone);
  if (l.site && host(l.site)) return "s:" + host(l.site);
  return "n:" + String(l.name || "").toLowerCase().replace(/[^a-zа-я0-9]/gi, "") + "|" + String(l.city || "").toLowerCase();
}

export function makeLead(input) {
  const base = {
    name: String(input.name || "").trim(),
    niche: String(input.niche || "").trim(),
    city: String(input.city || "").trim(),
    phone: String(input.phone || "").trim(),
    site: String(input.site || "").trim(),
    telegram: String(input.telegram || "").trim(),
    source: String(input.source || "").trim(),
    service: String(input.service || "").trim(),
    address: String(input.address || "").trim(),
    url: String(input.url || "").trim(),
  };
  const id = createHash("sha1").update(dedupeKey(base)).digest("hex").slice(0, 10);
  const now = new Date().toISOString();
  return { id, ...base, status: "new", notes: "", audit: null, messages: null, followUpAt: null, contactedAt: null, createdAt: now, updatedAt: now };
}

/** Добавляет лиды, пропуская дубли. Возвращает сколько добавлено и сколько пропущено. */
export function addLeads(leads, inputs) {
  const keys = new Set(leads.map(dedupeKey));
  let added = 0;
  let skipped = 0;
  for (const input of inputs) {
    const lead = makeLead(input);
    if (!lead.name && !lead.phone && !lead.site) {
      skipped++;
      continue;
    }
    const k = dedupeKey(lead);
    if (keys.has(k)) {
      skipped++;
      continue;
    }
    keys.add(k);
    leads.push(lead);
    added++;
  }
  return { added, skipped };
}

/** Строки вида «название; ниша; город; телефон; сайт» или CSV из браузера. Пустые поля допустимы. */
export function parseLines(text, defaults = {}) {
  return String(text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/[;\t]/).map((s) => s.trim());
      if (parts.length === 1 && /^(https?:\/\/|www\.)|\.[a-zа-я]{2,}$/i.test(parts[0])) return { ...defaults, site: parts[0], name: host(parts[0]) };
      const [name, niche, city, phone, site, telegram] = parts;
      return { ...defaults, name, niche: niche || defaults.niche, city: city || defaults.city, phone, site, telegram };
    });
}

export function dueFollowUps(leads, now = new Date()) {
  return leads.filter((l) => l.followUpAt && new Date(l.followUpAt) <= now && !["won", "lost", "skip"].includes(l.status));
}

export function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}
