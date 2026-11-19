// Сбор заказов с страницы Авито. Работает только с тем, что браузер уже показал: разметка меняется,
// поэтому карточки ищем устойчиво — по ссылкам на заказы и по тексту рядом с ними.
// Логика сканирования — в avito-scan-fn.js (общая с сборщиком через CDP).
(() => {
  const scan = () => (typeof avitoScanPage === "function" ? avitoScanPage() : { url: location.href, title: document.title, orders: [] });

  window.__avitoScan = scan;

  function report() {
    try {
      const data = scan();
      chrome.runtime.sendMessage({ type: "avito-orders", orders: data.orders, url: location.href });
    } catch {
      /* страница могла закрыться — тихо выходим */
    }
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === "scan-now") {
      try {
        sendResponse({ orders: scan().orders });
      } catch (e) {
        sendResponse({ orders: [], error: String(e) });
      }
      return true;
    }
    return false;
  });

  report();
})();
