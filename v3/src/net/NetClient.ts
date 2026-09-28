// Browser connection to the game server: identity (UUID in localStorage),
// automatic reconnection, and typed message dispatch.

import { PROTOCOL_VERSION, type ClientMessage, type ServerMessage } from "./protocol";

const UUID_KEY = "constellation-uuid";
const NAME_KEY = "constellation-name";

type Handler<T extends ServerMessage["t"]> = (msg: Extract<ServerMessage, { t: T }>) => void;

function storageGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* private mode: identity lasts for this tab only */
  }
}

export class NetClient {
  private ws: WebSocket | null = null;
  private handlers = new Map<string, Set<(m: ServerMessage) => void>>();
  private queue: ClientMessage[] = [];
  private retry = 0;
  private closedByUser = false;
  connected = false;
  welcomed = false;
  uuid: string | null = storageGet(UUID_KEY);
  name: string = storageGet(NAME_KEY) ?? "";
  llmAvailable = false;
  onStatus: ((connected: boolean) => void) | null = null;

  constructor(private url = NetClient.defaultUrl()) {}

  static defaultUrl(): string {
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${location.host}/ws`;
  }

  connect(): void {
    this.closedByUser = false;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      this.connected = true;
      this.retry = 0;
      ws.send(JSON.stringify({ t: "hello", uuid: this.uuid, name: this.name || undefined, protocol: PROTOCOL_VERSION } satisfies ClientMessage));
    };
    ws.onmessage = (ev) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(ev.data as string) as ServerMessage;
      } catch {
        return;
      }
      if (msg.t === "welcome") {
        this.uuid = msg.uuid;
        this.name = msg.name;
        this.llmAvailable = msg.llm;
        storageSet(UUID_KEY, msg.uuid);
        storageSet(NAME_KEY, msg.name);
        this.welcomed = true;
        this.onStatus?.(true);
        for (const q of this.queue.splice(0)) ws.send(JSON.stringify(q));
      }
      for (const h of this.handlers.get(msg.t) ?? []) h(msg);
    };
    ws.onclose = () => {
      const was = this.welcomed;
      this.connected = false;
      this.welcomed = false;
      this.ws = null;
      if (was) this.onStatus?.(false);
      if (!this.closedByUser) this.scheduleReconnect();
    };
    ws.onerror = () => {
      /* onclose follows */
    };
  }

  private scheduleReconnect(): void {
    const delay = Math.min(15000, 500 * 2 ** this.retry++);
    setTimeout(() => this.connect(), delay);
  }

  close(): void {
    this.closedByUser = true;
    this.ws?.close();
  }

  send(msg: ClientMessage): void {
    if (this.ws && this.welcomed && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
    else this.queue.push(msg);
  }

  setName(name: string): void {
    this.name = name;
    storageSet(NAME_KEY, name);
    this.send({ t: "setName", name });
  }

  on<T extends ServerMessage["t"]>(t: T, h: Handler<T>): () => void {
    let set = this.handlers.get(t);
    if (!set) this.handlers.set(t, (set = new Set()));
    set.add(h as (m: ServerMessage) => void);
    return () => set!.delete(h as (m: ServerMessage) => void);
  }

  /** Resolve with the next message of type `t` (or reject after a timeout). */
  once<T extends ServerMessage["t"]>(t: T, timeoutMs = 10000): Promise<Extract<ServerMessage, { t: T }>> {
    return new Promise((resolve, reject) => {
      const off = this.on(t, (m) => {
        clearTimeout(timer);
        off();
        resolve(m);
      });
      const timer = setTimeout(() => {
        off();
        reject(new Error(`Timed out waiting for ${t}`));
      }, timeoutMs);
    });
  }
}
