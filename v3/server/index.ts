// Constellation v3 game server: WebSocket multiplayer sessions, cloud saves
// and (optionally) LLM-driven rivals. Run with `npm run server`.
//
// Environment:
//   PORT                (default 8787)
//   DB_PATH             (default ./data/constellation.db)
//   OPENROUTER_API_KEY  enables LLM rivals (never sent to clients)
//   LLM_MODEL           (default z-ai/glm-5.3-flash)
//   LLM_BASE_URL        (default https://openrouter.ai/api/v1)

import { createServer } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { Db } from "./db";
import { Hub } from "./hub";
import { attachLlm, createLlmClient } from "./llm";
import type { ServerMessage } from "../src/net/protocol";

const PORT = Number(process.env.PORT ?? 8787);
const DB_PATH = process.env.DB_PATH ?? "./data/constellation.db";
const TICK_MS = 50;
const MAX_MSGS_PER_SECOND = 40;

export function startServer(port = PORT, dbPath = DB_PATH) {
  const db = new Db(dbPath);
  const llm = createLlmClient();
  const hub = new Hub(db);
  if (llm) {
    attachLlm(hub, llm);
    console.log(`LLM rivals enabled (model ${llm.model})`);
  }

  const http = createServer((req, res) => {
    if (req.url === "/health" || req.url === "/api/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, sessions: hub.sessions.size, connections: hub.conns.size, llm: !!llm }));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  const wss = new WebSocketServer({ server: http, path: "/ws", maxPayload: 8 * 1024 * 1024, perMessageDeflate: { threshold: 1024 } });

  wss.on("connection", (ws: WebSocket) => {
    const send = (msg: ServerMessage) => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
    };
    const conn = hub.connect(send);
    let windowStart = Date.now();
    let count = 0;
    ws.on("message", (data) => {
      const now = Date.now();
      if (now - windowStart > 1000) {
        windowStart = now;
        count = 0;
      }
      if (++count > MAX_MSGS_PER_SECOND) return send({ t: "error", message: "Slow down" });
      let parsed: unknown;
      try {
        parsed = JSON.parse(data.toString());
      } catch {
        return send({ t: "error", message: "Malformed JSON" });
      }
      try {
        hub.handle(conn, parsed);
      } catch (err) {
        console.error("handler error", err);
        send({ t: "error", message: "Server error" });
      }
    });
    ws.on("close", () => hub.disconnect(conn));
  });

  let last = Date.now();
  const timer = setInterval(() => {
    const now = Date.now();
    try {
      hub.tick(now - last);
    } catch (err) {
      console.error("tick error", err);
    }
    last = now;
  }, TICK_MS);

  http.listen(port, () => console.log(`Constellation server listening on :${port} (LLM ${llm ? "enabled" : "disabled"})`));

  const shutdown = () => {
    clearInterval(timer);
    hub.saveAll();
    hub.stopped = true;
    for (const ws of wss.clients) ws.terminate();
    wss.close();
    http.close();
    db.close();
  };
  return { hub, http, wss, shutdown };
}

if (process.argv[1] && /server[\\/]index\.ts$/.test(process.argv[1])) {
  const srv = startServer();
  for (const sig of ["SIGINT", "SIGTERM"] as const)
    process.on(sig, () => {
      console.log("Saving sessions and shutting down…");
      srv.shutdown();
      process.exit(0);
    });
}
