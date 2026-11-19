// Лид-радар v2 — сервер: лиды, заказы Авито, ИИ-оценка и черновики ответов.
// Данные в /data (живут между деплоями). Ничего не отправляется наружу само: только черновики.
import { createServer } from "node:http";
import { mkdirSync, readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { auditSite } from "./audit.mjs";
import { STATUSES, STATUS_LABEL, addDays, addLeads, createStore, dueFollowUps, parseLines } from "./crm.mjs";
import { buildLanding } from "./landing.mjs";
import { buildMessages, buildOrderReply, DEFAULT_PROFILE } from "./message.mjs";
import { search2gis } from "./twogis.mjs";
import { analyzeOrder, summarize } from "./avito.mjs";
import { AI_PROVIDERS, askAI, messageWithAI, parseJSON, scoreOrderWithAI } from "./ai.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = process.env.DATA_DIR || "/data";
const PUBLIC_DIR = path.join(ROOT, "public");

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".json": "application/json; charset=utf-8" };

export function createApp({ dataDir = DATA_DIR, audit = auditSite, search = search2gis, fetchImpl = fetch } = {}) {
  const store = createStore(path.join(dataDir, "leads.json"));
  const profileFile = path.join(dataDir, "profile.json");
  const ordersFile = path.join(dataDir, "avito-orders.json");

  const loadProfile = () => {
    let saved = {};
    try {
      saved = JSON.parse(readFileSync(profileFile, "utf8"));
    } catch {}
    const envKey = process.env.AI_KEY || "";
    return {
      ...DEFAULT_PROFILE,
      ...saved,
      aiProvider: saved.aiProvider || process.env.AI_PROVIDER || "gigachat",
      aiKey: saved.aiKey || envKey,
      aiModel: saved.aiModel || "",
      twogisKey: saved.twogisKey || process.env.TWOGIS_KEY || "",
    };
  };
  const saveProfile = (p) => {
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(profileFile, JSON.stringify(p, null, 2));
  };
  const loadOrders = () => {
    try {
      return JSON.parse(readFileSync(ordersFile, "utf8"));
    } catch {
      return [];
    }
  };
  const saveOrders = (o) => {
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(ordersFile, JSON.stringify(o, null, 2));
  };

  const ID = /^[a-f0-9]{10}$/;
  const PATCHABLE = ["name", "niche", "city", "phone", "site", "telegram", "service", "address", "url", "notes", "status", "followUpAt"];
  const touch = (lead) => (lead.updatedAt = new Date().toISOString());
  const find = (leads, id) => leads.find((l) => l.id === id);
  const publicProfile = (p) => ({ ...p, aiKey: p.aiKey ? "задан" : "", twogisKey: p.twogisKey ? "задан" : "" });

  const aiOpts = (prof) => ({ provider: prof.aiProvider, key: prof.aiKey, model: prof.aiModel, fetchImpl });

  async function handle(method, url, body) {
    const p = url.pathname;

    if (method === "GET" && p === "/api/state") {
      const leads = store.load();
      const prof = loadProfile();
      return {
        leads,
        profile: publicProfile(prof),
        providers: AI_PROVIDERS,
        statuses: STATUSES.map((s) => ({ id: s, label: STATUS_LABEL[s] })),
        due: dueFollowUps(leads).map((l) => l.id),
      };
    }
    if (method === "GET" && p === "/api/orders") {
      return { orders: loadOrders() };
    }

    if (method === "POST" && p === "/api/import") {
      const leads = store.load();
      const input = Array.isArray(body.leads) && body.leads.length ? body.leads : parseLines(body.text, body.defaults || {});
      const res = addLeads(leads, input);
      store.save(leads);
      return res;
    }

    // Заказы Авито: правила + (если есть ключ) ИИ-оценка и черновик ответа.
    if (method === "POST" && p === "/api/avito/analyze") {
      const orders = Array.isArray(body.orders) ? body.orders : [];
      const prof = loadProfile();
      const useAI = body.ai !== false && !!prof.aiKey;
      const out = summarize(orders, prof).orders.map((o) => ({
        ...o,
        reply: o.score > 0 ? buildOrderReply(o.orderText, prof) : "",
      }));
      if (useAI) {
        const limit = Math.min(out.length, Number(body.limit) || 12);
        for (let i = 0; i < limit; i++) {
          const ai = await scoreOrderWithAI(out[i], prof, aiOpts(prof));
          if (!ai) continue;
          out[i] = { ...out[i], ...ai, reply: ai.reply || out[i].reply };
        }
      }
      return {
        total: out.length,
        relevant: out.filter((o) => o.score > 0).length,
        ai: useAI,
        aiScored: out.filter((o) => o.ai).length,
        orders: out,
      };
    }

    // Приём заказов от расширения «Авито-сканер»: сохраняем, чтобы не терять между сессиями.
    if (method === "POST" && p === "/api/avito/orders") {
      const incoming = Array.isArray(body.orders) ? body.orders : [];
      const known = loadOrders();
      const seen = new Set(known.map((o) => o.url));
      let added = 0;
      for (const o of incoming) {
        if (!o?.url || seen.has(o.url)) continue;
        seen.add(o.url);
        known.unshift({ ...o, seenAt: new Date().toISOString(), imported: false });
        added++;
      }
      saveOrders(known.slice(0, 500));
      return { added, total: known.length };
    }

    // Импорт заказов Авито в лиды одним кликом.
    if (method === "POST" && p === "/api/avito/import") {
      const prof = loadProfile();
      const known = loadOrders();
      const urls = new Set((Array.isArray(body.urls) ? body.urls : []).map(String));
      const picks = urls.size ? known.filter((o) => urls.has(o.url)) : known.filter((o) => o.score > 0);
      const leads = store.load();
      const res = addLeads(
        leads,
        picks.map((o) => ({
          name: o.title || "Заказ с Авито",
          niche: (o.services || []).map((s) => s.label || s).join(", ") || "заказ с Авито",
          city: o.city || "",
          source: "Авито",
          service: (o.services || []).map((s) => s.label || s).join(", "),
          url: o.url || "",
          address: o.budget ? `Бюджет: ${o.budget} ₽` : "",
          notes: o.reason || "",
        }))
      );
      store.save(leads);
      for (const o of known) if (urls.has(o.url)) o.imported = true;
      saveOrders(known);
      return { ...res, imported: picks.length };
    }

    if (method === "POST" && p === "/api/profile") {
      const cur = loadProfile();
      const next = { ...cur };
      for (const k of ["name", "offer", "portfolio", "contact"]) if (typeof body[k] === "string") next[k] = body[k].slice(0, 300);
      for (const k of ["aiProvider", "aiModel"]) if (typeof body[k] === "string" && body[k].trim()) next[k] = body[k].trim().slice(0, 80);
      if (typeof body.freePreview === "boolean") next.freePreview = body.freePreview;
      if (typeof body.aiKey === "string" && body.aiKey.trim()) next.aiKey = body.aiKey.trim();
      if (typeof body.twogisKey === "string" && body.twogisKey.trim()) next.twogisKey = body.twogisKey.trim();
      saveProfile(next);
      return { ok: true };
    }

    // Проверка ключа ИИ: один короткий запрос.
    if (method === "POST" && p === "/api/ai/test") {
      const prof = loadProfile();
      const raw = await askAI({ ...aiOpts(prof), user: "Ответь одним словом: ok", timeoutMs: 20000 });
      if (!raw) return { httpStatus: 502, error: "Модель не ответила. Проверьте ключ и провайдера." };
      return { ok: true, answer: String(raw).slice(0, 100) };
    }

    if (method === "POST" && p === "/api/search") {
      const key = process.env.TWOGIS_KEY || loadProfile().twogisKey;
      const found = await search({ query: String(body.query || ""), city: String(body.city || ""), key, pages: Number(body.pages) || 1 });
      const leads = store.load();
      const res = addLeads(leads, found.map((f) => ({ ...f, niche: body.query, city: body.city })));
      store.save(leads);
      return { ...res, found: found.length };
    }

    if (method === "POST" && p === "/api/reply") {
      const prof = loadProfile();
      const rules = buildOrderReply(String(body.text || ""), prof);
      if (body.ai !== false && prof.aiKey) {
        const ai = await scoreOrderWithAI({ title: body.title || "", text: body.text || "" }, prof, aiOpts(prof));
        if (ai?.reply) return { text: ai.reply, ai: true, score: ai.score };
      }
      return { text: rules, ai: false };
    }

    if (method === "POST" && p === "/api/audit-all") {
      const leads = store.load();
      const todo = leads.filter((l) => !l.audit && !["won", "lost", "skip"].includes(l.status)).slice(0, 30);
      for (let i = 0; i < todo.length; i += 3) {
        await Promise.all(
          todo.slice(i, i + 3).map(async (l) => {
            l.audit = await audit(l.site);
            if (l.status === "new") l.status = "audited";
            touch(l);
          })
        );
      }
      store.save(leads);
      return { audited: todo.length };
    }

    const m = p.match(/^\/api\/lead\/([a-f0-9]{10})(?:\/(\w+))?$/);
    if (m) {
      const [, id, action] = m;
      const leads = store.load();
      const lead = find(leads, id);
      if (!lead) return { httpStatus: 404, error: "Лид не найден" };
      if (method === "DELETE" && !action) {
        store.save(leads.filter((l) => l.id !== id));
        return { ok: true };
      }
      if (method === "POST" && !action) {
        for (const k of PATCHABLE) if (typeof body[k] === "string") lead[k] = body[k].slice(0, 2000);
        if (body.status && !STATUSES.includes(body.status)) return { httpStatus: 400, error: "Неизвестный статус" };
        if (lead.followUpAt === "") lead.followUpAt = null;
        touch(lead);
        store.save(leads);
        return lead;
      }
      if (method === "POST" && action === "audit") {
        lead.audit = await audit(lead.site);
        if (lead.status === "new") lead.status = "audited";
        touch(lead);
        store.save(leads);
        return lead;
      }
      if (method === "POST" && action === "message") {
        const prof = loadProfile();
        const rules = buildMessages(lead, lead.audit, prof);
        let messages = rules;
        if (body.ai !== false && prof.aiKey) {
          const ai = await messageWithAI(lead, lead.audit, prof, aiOpts(prof));
          if (ai?.text) messages = { ...rules, first: ai.text, ai: true };
        }
        lead.messages = messages;
        if (["new", "audited"].includes(lead.status)) lead.status = "drafted";
        touch(lead);
        store.save(leads);
        return lead;
      }
      if (method === "POST" && action === "landing") {
        const dir = path.join(dataDir, "landings", id);
        mkdirSync(dir, { recursive: true });
        writeFileSync(path.join(dir, "index.html"), buildLanding(lead, { author: loadProfile().name }));
        return { url: `/preview/${id}/` };
      }
      if (method === "POST" && action === "contacted") {
        lead.status = "contacted";
        lead.contactedAt = new Date().toISOString();
        lead.followUpAt = addDays(new Date(), 3);
        touch(lead);
        store.save(leads);
        return lead;
      }
    }
    return { httpStatus: 404, error: "Не найдено" };
  }

  const readBody = (req) =>
    new Promise((resolve) => {
      let raw = "";
      req.on("data", (c) => {
        raw += c;
        if (raw.length > 8 * 1024 * 1024) req.destroy();
      });
      req.on("end", () => {
        try {
          resolve(raw ? JSON.parse(raw) : {});
        } catch {
          resolve({});
        }
      });
    });

  const send = (res, status, data, type = "application/json; charset=utf-8") => {
    res.writeHead(status, { "Content-Type": type, "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS" });
    if (Buffer.isBuffer(data)) return res.end(data);
    res.end(type.startsWith("application/json") ? JSON.stringify(data) : data);
  };

  async function handler(req, res) {
    const url = new URL(req.url, "http://x");
    if (req.method === "OPTIONS") return send(res, 204, "");
    const method = req.method;

    if (method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
      const file = path.join(PUBLIC_DIR, "index.html");
      if (!existsSync(file)) return send(res, 500, "Нет интерфейса", "text/plain; charset=utf-8");
      return send(res, 200, readFileSync(file), MIME[".html"]);
    }
    const asset = path.join(PUBLIC_DIR, path.normalize(url.pathname).replace(/^(\.\.[/\\])+/, ""));
    if (method === "GET" && asset.startsWith(PUBLIC_DIR) && existsSync(asset) && statSync(asset).isFile()) {
      return send(res, 200, readFileSync(asset), MIME[path.extname(asset)] || "application/octet-stream");
    }

    const preview = url.pathname.match(/^\/preview\/([a-f0-9]{10})\/(.*)$/);
    if (method === "GET" && preview) {
      const file = path.join(dataDir, "landings", preview[1], preview[2] || "index.html");
      if (!existsSync(file)) return send(res, 404, "Нет лендинга", "text/plain; charset=utf-8");
      return send(res, 200, readFileSync(file), MIME[".html"]);
    }

    if (url.pathname.startsWith("/api/")) {
      const body = method === "GET" ? {} : await readBody(req);
      try {
        const out = await handle(method, url, body);
        if (out?.httpStatus) return send(res, out.httpStatus, { error: out.error || "Ошибка" });
        return send(res, 200, out);
      } catch (e) {
        return send(res, 500, { error: String(e?.message || e) });
      }
    }
    return send(res, 404, { error: "Не найдено" });
  }

  return { handler, handle, store, loadProfile, saveProfile };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const app = createApp();
  const port = Number(process.env.PORT || 3000);
  createServer(app.handler).listen(port, "0.0.0.0", () => console.log(`lead-radar v2 на ${port}`));
}
