// Скан страницы Авито: одна копия логики для расширения и для сборщика через CDP.
// Возвращает { url, title, orders:[{title,url,text,budget,city}] }.
function avitoScanPage() {
  const ORDER_HINTS = ["/zakazy", "/predlozheniya_uslug", "/uslugi_", "/vakansii"];
  const clean = (s) => String(s || "").replace(/\s+/g, " ").trim();
  const absUrl = (href) => {
    try {
      return new URL(href, location.href).href;
    } catch {
      return "";
    }
  };
  const CITIES = {
    moscow: "Москва", spb: "Санкт-Петербург", ekaterinburg: "Екатеринбург", kazan: "Казань",
    novosibirsk: "Новосибирск", nizhniy: "Нижний Новгород", chelyabinsk: "Челябинск", samara: "Самара",
    omsk: "Омск", rostov: "Ростов-на-Дону", krasnodar: "Краснодар", voronezh: "Воронеж", perm: "Пермь",
    volgograd: "Волгоград", krasnoyarsk: "Красноярск", vladivostok: "Владивосток", irkutsk: "Иркутск",
    tula: "Тула", kaliningrad: "Калининград", barnaul: "Барнаул", udmurtia: "Ижевск",
  };
  const cityFromUrl = (url) => {
    const m = String(url).match(/avito\.ru\/([a-z0-9-]+)/i);
    return CITIES[m ? m[1] : ""] || "";
  };
  const budgetFrom = (text) => {
    const m = String(text).match(/(\d[\d\s ]*)\s*(?:₽|руб(?:\.|лей)?)/i);
    if (!m) return "";
    const n = Number(m[1].replace(/[\s ]/g, ""));
    return Number.isFinite(n) ? String(n) : "";
  };
  const withoutNoise = (el) => {
    const clone = el.cloneNode(true);
    clone.querySelectorAll("script,style,pre,noscript,template").forEach((n) => n.remove());
    const parts = [];
    const walk = (node) => {
      for (const child of node.childNodes) {
        if (child.nodeType === 3) parts.push(child.nodeValue);
        else if (child.nodeType === 1) walk(child);
      }
    };
    walk(clone);
    return clean(parts.join(" "));
  };
  const cardText = (el, title) => {
    let node = el;
    for (let i = 0; i < 5 && node; i++) {
      const txt = withoutNoise(node);
      if (txt.length > title.length + 30 && txt.length < 4000) return txt.slice(0, 900);
      node = node.parentElement;
    }
    return withoutNoise(el.parentElement || el).slice(0, 900);
  };

  const anchors = Array.from(document.querySelectorAll("a[href]"));
  let candidates = anchors.filter((a) => ORDER_HINTS.some((h) => a.href.includes(h)));
  if (!candidates.length) {
    candidates = anchors.filter((a) => a.href.includes("avito.ru") && clean(a.textContent).length > 18);
  }

  const out = [];
  const seen = new Set();
  for (const a of candidates) {
    const title = clean(a.getAttribute("title") || a.textContent);
    if (!title || title.length < 8) continue;
    const url = absUrl(a.getAttribute("href"));
    if (!url || seen.has(url)) continue;
    if (!/^https?:\/\/(www\.)?avito\.ru\//i.test(url)) continue;
    seen.add(url);
    const text = cardText(a, title);
    out.push({
      title: title.slice(0, 160),
      url,
      text,
      budget: budgetFrom(text),
      city: cityFromUrl(url),
    });
  }
  return { url: location.href, title: document.title, orders: out };
}
