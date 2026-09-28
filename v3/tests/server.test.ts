import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocket } from "ws";
import { Db } from "../server/db";
import { Hub } from "../server/hub";
import { startServer } from "../server/index";
import type { Conn } from "../server/session";
import { PROTOCOL_VERSION, type ServerMessage } from "../src/net/protocol";
import type { PlayerView } from "../src/sim/view";

interface TestClient {
  conn: Conn;
  inbox: ServerMessage[];
  last<T extends ServerMessage["t"]>(t: T): Extract<ServerMessage, { t: T }> | undefined;
  send(msg: unknown): void;
}

function client(hub: Hub, name: string, uuid?: string): TestClient {
  const inbox: ServerMessage[] = [];
  const conn = hub.connect((m) => inbox.push(m));
  const c: TestClient = {
    conn,
    inbox,
    last: (t) => [...inbox].reverse().find((m) => m.t === t) as never,
    send: (msg) => hub.handle(conn, msg),
  };
  c.send({ t: "hello", uuid, name, protocol: PROTOCOL_VERSION });
  return c;
}

const dirs: string[] = [];
function tempDb(): string {
  const d = mkdtempSync(join(tmpdir(), "constellation-"));
  dirs.push(d);
  return join(d, "test.db");
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function hostAndGuest() {
  const hub = new Hub(new Db(":memory:"));
  const host = client(hub, "Alice");
  host.send({ t: "create", settings: { seed: "mp-test", systemCount: 24, aiCount: 3, playerSpecies: "terrans" }, sessionName: "Friday night" });
  const code = host.last("session")!.info.code;
  const guest = client(hub, "Bob");
  guest.send({ t: "join", code });
  return { hub, host, guest, code };
}

describe("multiplayer hub", () => {
  it("assigns identities and hosts a game in the lobby", () => {
    const { host } = hostAndGuest();
    const welcome = host.last("welcome")!;
    expect(welcome.uuid).toMatch(/^[0-9a-f-]{36}$/);
    const info = host.last("session")!.info;
    expect(info.status).toBe("lobby");
    expect(info.youAreHost).toBe(true);
    expect(info.yourEmpireId).toBe("e0");
    expect(info.seats.filter((s) => s.playerName === null)).toHaveLength(3);
    expect(host.last("static")).toBeDefined();
    expect(host.last("view")!.data.playerId).toBe("e0");
  });

  it("lets a friend join by code, take an AI seat and play their own empire", () => {
    const { hub, host, guest } = hostAndGuest();
    const ginfo = guest.last("session")!.info;
    expect(ginfo.youAreHost).toBe(false);
    expect(ginfo.yourEmpireId).toBeNull();
    expect(guest.last("view")).toBeUndefined(); // no seat, no game data
    const seat = ginfo.seats.find((s) => s.playerName === null)!;
    guest.send({ t: "takeSeat", empireId: seat.empireId });
    expect(guest.last("session")!.info.yourEmpireId).toBe(seat.empireId);
    expect(guest.last("view")!.data.playerId).toBe(seat.empireId);
    const session = [...hub.sessions.values()][0];
    expect(session.game.state.empires[seat.empireId].ai).toBeNull();
    expect(session.game.state.empires[seat.empireId].isPlayer).toBe(true);
    // Seats can't be stolen.
    const third = client(hub, "Eve");
    third.send({ t: "join", code: session.code });
    third.send({ t: "takeSeat", empireId: seat.empireId });
    expect(third.last("error")!.message).toMatch(/Another player/);
    // Commands before the start are refused; after the host starts, they work on our own empire only.
    const myColony = Object.values(session.game.state.colonies).find((c) => c.empireId === seat.empireId)!;
    const hostColony = Object.values(session.game.state.colonies).find((c) => c.empireId === "e0")!;
    guest.send({ t: "cmd", id: 1, name: "queueShip", args: [myColony.id, "scout"] });
    expect(guest.last("cmdResult")!.ok).toBe(false);
    guest.send({ t: "start" });
    expect(guest.last("error")!.message).toMatch(/Only the host/);
    host.send({ t: "start" });
    expect(host.last("session")!.info.status).toBe("running");
    guest.send({ t: "cmd", id: 2, name: "queueShip", args: [myColony.id, "scout"] });
    expect(guest.last("cmdResult")).toMatchObject({ id: 2, ok: true });
    guest.send({ t: "cmd", id: 3, name: "queueShip", args: [hostColony.id, "scout"] });
    expect(guest.last("cmdResult")).toMatchObject({ id: 3, ok: false });
    guest.send({ t: "cmd", id: 4, name: "noSuchThing", args: [] });
    expect(guest.last("cmdResult")).toMatchObject({ id: 4, ok: false });
    guest.send({ t: "cmd", id: 5, name: "queueShip", args: [{ evil: true }, 42] });
    expect(guest.last("cmdResult")).toMatchObject({ id: 5, ok: false, error: "Bad arguments" });
  });

  it("runs the shared clock with host-controlled speed and pauses when everyone leaves", () => {
    const { hub, host, guest } = hostAndGuest();
    const session = [...hub.sessions.values()][0];
    guest.send({ t: "takeSeat", empireId: guest.last("session")!.info.seats.find((s) => !s.playerName)!.empireId });
    host.send({ t: "start" });
    hub.tick(1000);
    expect(session.game.state.day).toBeGreaterThan(0.8);
    guest.send({ t: "speed", index: 4 });
    expect(guest.last("error")!.message).toMatch(/Only the host/);
    guest.send({ t: "speed", index: 0 }); // anyone may pause
    const day = session.game.state.day;
    hub.tick(1000);
    expect(session.game.state.day).toBe(day);
    host.send({ t: "speed", index: 3 });
    hub.tick(1000);
    expect(session.game.state.day).toBeGreaterThan(day + 3);
    hub.disconnect(host.conn);
    hub.disconnect(guest.conn);
    const d2 = session.game.state.day;
    hub.tick(1000);
    expect(session.game.state.day).toBe(d2); // nobody online: paused
  });

  it("sends each player only what they can know", () => {
    const { hub, host, guest } = hostAndGuest();
    const session = [...hub.sessions.values()][0];
    const seat = guest.last("session")!.info.seats.find((s) => !s.playerName)!.empireId;
    guest.send({ t: "takeSeat", empireId: seat });
    host.send({ t: "start" });
    for (let i = 0; i < 8; i++) hub.tick(250);
    const view = guest.last("view")!.data as PlayerView;
    // Our own empire in full; rivals only publicly.
    expect(view.empires[seat].resources.credits).toBeGreaterThan(0);
    expect(view.empires.e0.resources.credits).toBe(0);
    expect(view.empires.e0.name).toBe("Unknown civilization");
    expect(Object.keys(view.empires.e0.explored)).toHaveLength(0);
    // Host's colony is in a system we haven't explored, so we don't see it.
    const hostColony = Object.values(session.game.state.colonies).find((c) => c.empireId === "e0")!;
    expect(view.colonies[hostColony.id]).toBeUndefined();
    // No foreign fleets outside our sensor range.
    for (const f of Object.values(view.fleets)) expect(f.empireId === seat || session.game.state.empires[seat].explored[f.systemId ?? ""]).toBeTruthy();
    // No log lines meant for others.
    expect(view.log.every((l) => !l.text.includes("Alice"))).toBe(true);
  });

  it("persists sessions and resumes them after a restart", () => {
    const path = tempDb();
    let hub = new Hub(new Db(path));
    const host = client(hub, "Alice");
    host.send({ t: "create", settings: { seed: "persist", systemCount: 20, aiCount: 2 } });
    host.send({ t: "start" });
    for (let i = 0; i < 20; i++) hub.tick(250);
    const code = host.last("session")!.info.code;
    const uuid = host.last("welcome")!.uuid;
    const day = [...hub.sessions.values()][0].game.state.day;
    hub.saveAll();
    hub.db.close();

    hub = new Hub(new Db(path));
    const again = client(hub, "Alice", uuid);
    again.send({ t: "mySessions" });
    expect(again.last("sessions")!.list[0]).toMatchObject({ code, status: "running" });
    again.send({ t: "join", code });
    const info = again.last("session")!.info;
    expect(info.yourEmpireId).toBe("e0");
    expect(info.youAreHost).toBe(true);
    expect(info.day).toBeCloseTo(day, 5);
    hub.db.close();
  });

  it("stores, lists, loads and caps cloud saves per player", () => {
    const hub = new Hub(new Db(":memory:"));
    const a = client(hub, "Alice");
    const b = client(hub, "Bob");
    a.send({ t: "cloudSave", name: "Campaign", data: JSON.stringify({ version: 1, day: 42 }) });
    expect(a.last("cloudSaves")!.list).toMatchObject([{ name: "Campaign", day: 42 }]);
    const id = a.last("cloudSaved")!.id;
    a.send({ t: "cloudLoad", id });
    expect(JSON.parse(a.last("cloudData")!.data).day).toBe(42);
    b.send({ t: "cloudLoad", id });
    expect(b.last("error")!.message).toMatch(/not found/); // saves are private
    a.send({ t: "cloudSave", name: "Campaign", data: JSON.stringify({ version: 1, day: 50 }) });
    expect(a.last("cloudSaves")!.list).toHaveLength(1); // same name overwrites
    for (let i = 0; i < 20; i++) a.send({ t: "cloudSave", name: `Slot ${i}`, data: "{}" });
    expect(a.last("cloudSaves")!.list.length).toBeLessThanOrEqual(12);
    a.send({ t: "cloudSave", name: "Bad", data: "not json" });
    expect(a.last("error")!.message).toMatch(/corrupt/);
  });
});

describe("websocket server", () => {
  it("speaks the protocol over a real socket", async () => {
    const srv = startServer(0, ":memory:");
    await new Promise<void>((r) => (srv.http.listening ? r() : srv.http.once("listening", () => r())));
    const port = (srv.http.address() as { port: number }).port;
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const inbox: ServerMessage[] = [];
    const waitFor = (t: string) =>
      new Promise<ServerMessage>((resolve, reject) => {
        const found = inbox.find((m) => m.t === t);
        if (found) return resolve(found);
        const timer = setTimeout(() => reject(new Error(`timeout waiting for ${t}`)), 5000);
        ws.on("message", function h(d) {
          const m = JSON.parse(d.toString()) as ServerMessage;
          if (m.t === t) {
            clearTimeout(timer);
            ws.off("message", h);
            resolve(m);
          }
        });
      });
    ws.on("message", (d) => inbox.push(JSON.parse(d.toString())));
    await new Promise((r) => ws.once("open", r));
    ws.send(JSON.stringify({ t: "hello", name: "Tester", protocol: PROTOCOL_VERSION }));
    const welcome = (await waitFor("welcome")) as Extract<ServerMessage, { t: "welcome" }>;
    expect(welcome.name).toBe("Tester");
    ws.send(JSON.stringify({ t: "create", settings: { seed: "ws", systemCount: 16, aiCount: 1 } }));
    const view = (await waitFor("view")) as Extract<ServerMessage, { t: "view" }>;
    expect(view.data.playerId).toBe("e0");
    ws.send("{not json");
    const err = (await waitFor("error")) as Extract<ServerMessage, { t: "error" }>;
    expect(err.message).toMatch(/Malformed/);
    ws.close();
    srv.shutdown();
  });
});
