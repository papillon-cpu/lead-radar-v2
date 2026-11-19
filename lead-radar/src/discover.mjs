// Сбор компаний из нескольких источников сразу: Яндекс.Карты, 2ГИС, ЕГРЮЛ.
// Каждый источник отключается сам, если нет ключа или он вернул ошибку: остальные не ломаются.
import { searchYandex } from "./yandex.mjs";
import { search2gis } from "./twogis.mjs";
import { searchEgrul } from "./egrul.mjs";

export const CATEGORIES = [
  "Барбершоп", "Салон красоты", "Психолог", "Тренер", "Стоматология", "Автосервис",
  "Стройматериалы", "Юридические услуги", "Мебель на заказ", "Цветы",
];

function normUrl(s) {
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : "https://" + s);
    return u.hostname.replace(/^www\./, "") + (u.pathname === "/" ? "" : u.pathname);
  } catch {
    return String(s || "").trim().toLowerCase();
  }
}

/** Убирает дубли по названию+городу и по домену. */
export function dedupe(items) {
  const seenName = new Set();
  const seenHost = new Set();
  const out = [];
  for (const it of items) {
    const nameKey = `${String(it.name || "").toLowerCase().trim()}|${String(it.city || "").toLowerCase().trim()}`;
    const host = normUrl(it.site || "");
    if (!it.name) continue;
    if (host && seenHost.has(host)) continue;
    if (seenName.has(nameKey)) continue;
    seenName.add(nameKey);
    if (host) seenHost.add(host);
    out.push(it);
  }
  return out;
}

export async function discover({ query, city = "", sources = [], profile = {}, limit = 40, fetchImpl = fetch }) {
  const jobs = [];
  if (sources.includes("yandex") && profile.yandexKey) {
    jobs.push(
      searchYandex({ query, city, key: profile.yandexKey, limit, fetchImpl })
        .then((r) => r.map((x) => ({ ...x, city: x.city || city })))
        .catch((e) => ({ __error: "Яндекс.Карты: " + e.message, __empty: [] }))
    );
  }
  if (sources.includes("twogis") && profile.twogisKey) {
    jobs.push(
      search2gis({ query, city, key: profile.twogisKey, pages: 2, fetchImpl })
        .then((r) => r.map((x) => ({ ...x, city: x.city || city })))
        .catch((e) => ({ __error: "2ГИС: " + e.message, __empty: [] }))
    );
  }
  if (sources.includes("egrul")) {
    jobs.push(
      searchEgrul({ query, city, limit, fetchImpl })
        .then((r) => r.map((x) => ({ ...x, city: x.city || x.region || city, site: "", phone: "", telegram: "" })))
        .catch((e) => ({ __error: "ЕГРЮЛ: " + e.message, __empty: [] }))
    );
  }
  const settled = await Promise.all(jobs);
  const errors = [];
  let all = [];
  for (const s of settled) {
    if (s && s.__error) errors.push(s.__error);
    else all = all.concat(s || []);
  }
  return { items: dedupe(all).slice(0, limit), errors };
}
