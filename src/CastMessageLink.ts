import CastConnection from "./CastConnection.js";
import { EventEmitter } from "events";
import { c, debug, info } from "./debug.js";

export type CastMessageLink = {
  close(): void;
  openChannel(src: string, dest: string): CastMessageLink.Channel;
};

export namespace CastMessageLink {
  export async function open(
    host: string,
    port: number
  ): Promise<CastMessageLink> {
    return new _Link(await CastConnection.open(host, port));
  }

  export type Channel = {
    send(ns: string, type: string, data?: Record<string, unknown>): number;
    onMessage(f: (m: Record<string, unknown>) => void): void;
    onMessageNs(ns: string, f: (m: Record<string, unknown>) => void): void;
    onValidatedMessageNs<T extends Record<string, unknown>>(
      ns: string,
      f: (m: T) => void,
      guard: (m: Record<string, unknown>) => m is T,
      validator?: (m: T) => boolean
    ): void;
    close(): void;
  };
}

class _Link {
  private heartbeat: NodeJS.Timeout;
  private requestId: number = 1;
  private channels: Map<string, Map<string, _Channel>> = new Map();
  private _lastRequestId: number | undefined;
  private _lastRequestAt: number | undefined;
  constructor(private client: CastConnection) {
    this.client.onReceipt((src, dest, namespace, payload) =>
      this.parseMessage(src, dest, namespace, payload)
    );
    this.heartbeat = setInterval(() => {
      this.send(
        "sender-0",
        "receiver-0",
        "urn:x-cast:com.google.cast.heartbeat",
        "PING"
      );
    }, 5000);
    debug("link up.");
  }

  parseMessage(
    src: string,
    dest: string,
    namespace: string,
    data: string
  ): void {
    const json = JSON.parse(data);
    info(`[${c(dest)}] ⟵  [${c(src)}] (${c(namespace)} ${c(json.type)})`);

    if (json.requestId === this._lastRequestId) {
      debug(`⇆ ${(Date.now() - (this._lastRequestAt as number)).toFixed(1)}ms`);
    }
    (dest === "*"
      ? Array.from(this.channels.get(src)?.values() ?? [])
      : [this.channels.get(src)?.get(dest)]
    )
      .filter((v) => v !== undefined)
      .forEach((channel) => channel?.consume(namespace, json));
  }

  send(
    src: string,
    dest: string,
    namespace: string,
    type: string,
    data: Record<string, unknown> = {}
  ): number {
    if (type !== "PING")
      info(`[${c(src)}] ⟶  [${c(dest)}] (${c(namespace)} ${c(type)})`);
    const requestId = this.newRequestId();
    this._lastRequestId = requestId;
    this._lastRequestAt = Date.now();
    this.client.send(
      src,
      dest,
      namespace,
      JSON.stringify({ type, requestId, ...data })
    );
    return requestId;
  }

  close(channel?: _Channel): void {
    if (channel !== undefined) {
      this.channels.get(channel.dest)?.delete(channel.source);
    } else {
      clearInterval(this.heartbeat);
      Array.from(this.channels.values()).map((m) =>
        Array.from(m.keys()).forEach((k) => m.delete(k))
      );
    }
  }

  newRequestId(): number {
    return this.requestId++;
  }

  openChannel(sender: string, receiver: string): CastMessageLink.Channel {
    if (!this.channels.has(receiver)) this.channels.set(receiver, new Map());
    if (!this.channels.get(receiver)?.has(sender)) {
      info(`[${c(sender)}] ⟷  [${c(receiver)}]`);
      this.channels
        .get(receiver)
        ?.set(sender, new _Channel(this, sender, receiver));
    }
    return this.channels.get(receiver)?.get(sender) as CastMessageLink.Channel;
  }
}

class _Channel extends EventEmitter {
  constructor(private link: _Link, public source: string, public dest: string) {
    super();
    link.send(
      source,
      dest,
      "urn:x-cast:com.google.cast.tp.connection",
      "CONNECT"
    );
  }

  send(ns: string, type: string, data: Record<string, unknown> = {}): number {
    return this.link.send(this.source, this.dest, ns, type, data);
  }

  consume(ns: string, message: Record<string, unknown>): void {
    this.emit("message", [ns, message]);
  }

  onMessage(f: (m: Record<string, unknown>) => void): void {
    this.on("message", (tuple) => f(tuple[1]));
  }

  onMessageNs(ns: string, f: (m: Record<string, unknown>) => void): void {
    this.on("message", (tuple) => {
      if (ns === tuple[0]) f(tuple[1]);
    });
  }

  onValidatedMessageNs<T extends Record<string, unknown>>(
    ns: string,
    f: (m: Record<string, unknown>) => void,
    guard: (m: Record<string, unknown>) => m is T,
    validator: (m: T) => boolean = (m: T) => true
  ): void {
    this.on("message", (tuple) => {
      if (ns === tuple[0] && guard(tuple[1]) && validator(tuple[1]))
        f(tuple[1]);
    });
  }

  close() {
    this.link.close(this);
  }
}

export default CastMessageLink;