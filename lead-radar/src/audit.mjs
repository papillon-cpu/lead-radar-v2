// Проверка сайта бизнеса. Читает только публичную главную страницу, как обычный посетитель: один запрос.
// score — насколько сайт слабый (0 — отличный, 100 — очень слабый): чем выше, тем лучше «лид» для вас.

const BUILDERS = [
  ["Tilda", /tilda(cdn|publishing)|t-records|data-tilda/i],
  ["Wix", /wixstatic|wix\.com|_wixCIDX/i],
  ["WordPress", /wp-content|wp-includes/i],
  ["1С-Битрикс", /\/bitrix\/|bitrix_sessid/i],
  ["Яндекс Бизнес/Конструктор", /yandex\.ru\/sprav|site\.yandex|ya\.site|turbo\.site/i],
  ["uCoz", /ucoz\.(ru|net|com)/i],
  ["Nethouse", /nethouse\.ru/i],
];

// Многие сайты зависают или отдают заглушку на неизвестного «робота». Мы заходим как с телефона: так видно, как сайт выглядит для большинства клиентов, и сайты с отдельной мобильной версией не считаются неадаптивными.
const BROWSER_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

export function normalizeUrl(input) {
  const s = String(input || "").trim();
  if (!s) return null;
  try {
    return new URL(/^https?:\/\//i.test(s) ? s : "https://" + s).toString();
  } catch {
    return null;
  }
}

const SOCIAL = /(^|\.)(vk\.com|vk\.ru|t\.me|instagram\.com|facebook\.com|ok\.ru|2gis\.ru|avito\.ru|wa\.me)$/i;
// Яндекс сам по себе не карточка: считаем только страницы карт, справочника и профилей.
const YANDEX_CARD = /^\/(maps|sprav|profile|uslugi)(\/|$)/i;

/** Ссылка на соцсеть или карточку на карте — это не сайт: у бизнеса сайта фактически нет. */
export function isNotARealSite(url) {
  try {
    const u = new URL(url);
    return SOCIAL.test(u.hostname) || (/(^|\.)yandex\.(ru|com)$/i.test(u.hostname) && YANDEX_CARD.test(u.pathname));
  } catch {
    return false;
  }
}

/** Разбор HTML без сети: отдельная функция, чтобы проверять её тестами. */
export function analyzeHtml(html, { https = true, loadMs = null, status = 200 } = {}) {
  const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const years = [...text.matchAll(/(?:©|&copy;|copyright)[^0-9]{0,20}((?:19|20)\d\d)(?:\s*[–—-]\s*((?:19|20)\d\d))?/gi)].flatMap((m) => [m[1], m[2]].filter(Boolean).map(Number));
  const lastYear = years.length ? Math.max(...years) : null;
  const builder = BUILDERS.find(([, re]) => re.test(html))?.[0] ?? null;
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").replace(/\s+/g, " ").trim();
  const f = {
    https,
    status,
    title,
    builder,
    lastYear,
    loadMs,
    sizeKB: Math.round(Buffer.byteLength(html) / 1024),
    mobile: /<meta[^>]+name=["']viewport["']/i.test(html),
    form: /<form[\s>]/i.test(html) || /заказать|оставить заявку|записаться|обратный звонок/i.test(text),
    phoneLink: /href=["']tel:/i.test(html),
    messenger: /(t\.me\/|wa\.me\/|api\.whatsapp\.com|viber:\/\/)/i.test(html),
    tableLayout: (html.match(/<table/gi) || []).length >= 3 && !/@media/i.test(html),
    flash: /\.swf|<embed|<object/i.test(html),
    // Страница собирается скриптом: без выполнения JS текста мало, это не значит, что сайт пустой.
    spa: /id=["'](root|app|__next)["']|__NUXT__|ng-version|data-reactroot/i.test(html),
    textLength: text.length,
  };
  const problems = [];
  let score = 0;
  const add = (points, msg) => {
    score += points;
    problems.push(msg);
  };
  if (!f.https) add(15, "нет HTTPS: браузер показывает «не защищено»");
  if (!f.mobile) add(25, "нет адаптации под телефон (нет viewport): на смартфоне сайт мелкий или ломается");
  if (f.lastYear && new Date().getFullYear() - f.lastYear >= 3) add(15, `в подвале указан © ${f.lastYear}: сайт выглядит заброшенным`);
  if (!f.form && !f.messenger) add(15, "нет формы заявки и кнопки мессенджера: клиенту нечем быстро связаться");
  if (!f.phoneLink) add(8, "телефон не кликабелен (нет ссылки tel:): на телефоне нельзя позвонить одним нажатием");
  if (f.tableLayout || f.flash) add(15, "устаревшая вёрстка (таблицы или Flash)");
  if (f.textLength < 400 && !f.spa) add(10, "очень мало текста: страница почти пустая");
  if (f.sizeKB > 2500) add(5, `тяжёлая страница (${f.sizeKB} КБ): медленно грузится на мобильном интернете`);
  if (f.loadMs && f.loadMs > 3500) add(8, `долго отвечает сервер (${(f.loadMs / 1000).toFixed(1)} с)`);
  if (!title) add(4, "нет заголовка страницы (title): плохо для поиска");
  return { ...f, score: Math.min(100, score), problems };
}

export async function auditSite(input, { timeoutMs = 12000, fetchImpl = fetch } = {}) {
  const url = normalizeUrl(input);
  if (!url) return { url: null, reachable: false, noSite: true, score: 100, problems: ["сайт не указан"] };
  if (isNotARealSite(url)) {
    return { url, reachable: true, noSite: true, score: 100, problems: ["вместо сайта указана соцсеть или карточка на карте"] };
  }
  const started = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { signal: ctrl.signal, redirect: "follow", headers: { "user-agent": BROWSER_UA, accept: "text/html", "accept-language": "ru-RU,ru;q=0.9" } });
    const html = (await res.text()).slice(0, 2_000_000);
    const finalUrl = res.url || url;
    if (!res.ok) {
      return { url: finalUrl, reachable: false, status: res.status, noSite: false, score: 90, problems: [`сайт отвечает ошибкой ${res.status}`] };
    }
    return { url: finalUrl, reachable: true, noSite: false, ...analyzeHtml(html, { https: finalUrl.startsWith("https:"), loadMs: Date.now() - started, status: res.status }) };
  } catch (e) {
    const timedOut = e?.name === "AbortError";
    return { url, reachable: false, noSite: false, score: 90, problems: [timedOut ? "сайт не открылся за 12 секунд" : "сайт не открывается (ошибка соединения)"] };
  } finally {
    clearTimeout(timer);
  }
}

/** Одна самая весомая находка для сообщения: то, что можно увидеть и проверить за секунду. */
export function topFinding(audit) {
  if (!audit) return null;
  if (audit.noSite) return "сайта у вас, похоже, нет";
  if (audit.reachable === false) return "ваш сайт сейчас не открывается";
  const order = [
    [!audit.mobile, "на телефоне ваш сайт открывается мелко и неудобно"],
    [!audit.https, "браузер помечает ваш сайт как «не защищено»"],
    [audit.lastYear && new Date().getFullYear() - audit.lastYear >= 3, `на сайте внизу стоит ${audit.lastYear} год, он выглядит давно не обновлявшимся`],
    [!audit.form && !audit.messenger, "на сайте нет формы заявки, клиент не может быстро вам написать"],
    [!audit.phoneLink, "по телефону на сайте нельзя позвонить одним нажатием"],
  ];
  return order.find(([cond]) => cond)?.[1] ?? null;
}
