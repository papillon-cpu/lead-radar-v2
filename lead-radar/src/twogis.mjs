// Поиск компаний через официальный API 2ГИС (нужен ваш ключ с dev.2gis.ru). Никакого обхода и парсинга страниц.
// ВНИМАНИЕ: названия полей ответа взяты из документации по памяти; с настоящим ключом не проверялось.
// Разбор ответа сделан осторожным: если поле не нашлось, оно остаётся пустым, а не падает.

export function parseItems(json) {
  const items = json?.result?.items ?? [];
  return items.map((it) => {
    const contacts = (it.contact_groups ?? []).flatMap((g) => g.contacts ?? []);
    const first = (type) => contacts.find((c) => c.type === type);
    const site = first("website");
    const phone = first("phone");
    const tg = first("telegram");
    return {
      name: it.name || it.name_ex?.primary || "",
      address: it.address_name || "",
      phone: phone?.text || phone?.value || "",
      site: site?.url || site?.value || "",
      telegram: tg?.url || tg?.value || "",
      source: "2ГИС",
    };
  });
}

export async function search2gis({ query, city = "", key, pages = 1, fetchImpl = fetch }) {
  if (!key) throw new Error("Не задан ключ 2ГИС (TWOGIS_KEY или настройка в профиле).");
  const q = [query, city].filter(Boolean).join(" ");
  const out = [];
  for (let page = 1; page <= Math.min(pages, 5); page++) {
    const u = new URL("https://catalog.api.2gis.com/3.0/items");
    u.search = new URLSearchParams({
      q,
      type: "branch",
      page: String(page),
      page_size: "10",
      fields: "items.contact_groups,items.address_name",
      key,
    }).toString();
    const res = await fetchImpl(u);
    if (!res.ok) throw new Error(`2ГИС ответил ${res.status}`);
    const json = await res.json();
    const items = parseItems(json);
    out.push(...items);
    if (items.length < 10) break;
  }
  return out;
}
