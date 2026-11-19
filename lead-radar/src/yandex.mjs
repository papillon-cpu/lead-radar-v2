// Поиск по Яндекс.Картам через официальный Search API.
// Нужен ключ Яндекс.Облака с доступом к «поиску по организациям» — вводится в настройках радара.
// Без ключа источник просто выключается: остальные работают как раньше.

const ENDPOINT = "https://search-maps.yandex.ru/v1/";

export async function searchYandex({ query, city = "", key, limit = 20, fetchImpl = fetch }) {
  if (!key) throw new Error("Не задан ключ Яндекс.Карт (YANDEX_KEY или настройка в профиле).");
  const q = [query, city].filter(Boolean).join(" ");
  const u = new URL(ENDPOINT);
  u.search = new URLSearchParams({
    apikey: key,
    text: q,
    type: "biz",
    results: String(Math.min(limit, 50)),
    lang: "ru_RU",
  }).toString();
  const res = await fetchImpl(u, { headers: { "Referer": "https://yandex.ru/maps/" } });
  if (!res.ok) throw new Error(`Яндекс ответил ${res.status}`);
  const json = await res.json();
  const items = Array.isArray(json?.items) ? json.items : [];
  return items.map((it) => {
    const snippet = (it.snippets || []).find((s) => s?.text) || {};
    const links = it.links || [];
    const siteLink = links.find((l) => l?.type === "self" || /href/.test(l?.href || ""));
    const contact = (it.contacts || [])[0] || {};
    return {
      name: it.name || "",
      address: it.address || snippet.text || "",
      phone: contact.text || "",
      site: siteLink?.href || "",
      telegram: "",
      rating: it.rating || null,
      reviews: it.reviews?.count ?? null,
      source: "Яндекс.Карты",
      uri: it.uri || "",
    };
  });
}
