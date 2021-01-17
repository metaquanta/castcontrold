import { Client } from "castv2";
import { EventEmitter } from "events";

export namespace CastConnection {
  export function open(address: string): Promise<Link> {
    console.debug(`CastConnection.open("${address}")`);
    return new Promise((resolve, reject) => {
      const client = new Client();
      client.on("error", (error: string) => {
        console.error(`CastConnection.open() failed ${error}`);
        reject(error);
      });
      client.connect(address, () => {
        resolve(new _Link(client));
      });
    });
  }

  export type Link = {
    close(): void;
    openChannel(src: string, dest: string): CastConnection.Channel;
  };

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
  };
}

class _Link {
  private heartbeat: NodeJS.Timeout;
  private requestId: number = 1;
  private channels: Map<string, Map<string, _Channel>> = new Map();
  constructor(private client: Client) {
    this.client.on("message", (src, dest, namespace, payload) =>
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
    console.debug("link up.");
  }

  parseMessage(
    src: string,
    dest: string,
    namespace: string,
    data: string
  ): void {
    const json = JSON.parse(data);
    console.debug(`[${dest}] ⟵  [${src}] (${namespace} <${json.type}>)`);
    //console.debug(JSON.stringify(json, null, "  "));
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
      console.debug(`[${src}] ⟶  [${dest}] (${namespace}) <${type}>`);
    const requestId = this.newRequestId();
    this.client.send(
      src,
      dest,
      namespace,
      JSON.stringify({ type, requestId, ...data })
    );
    return requestId;
  }

  close(): void {
    clearInterval(this.heartbeat);
  }

  newRequestId(): number {
    return this.requestId++;
  }

  openChannel(sender: string, receiver: string): CastConnection.Channel {
    if (!this.channels.has(receiver)) this.channels.set(receiver, new Map());
    if (!this.channels.get(receiver)?.has(sender)) {
      console.debug(`[${sender}] ⟷  [${receiver}]`);
      this.channels
        .get(receiver)
        ?.set(sender, new _Channel(this, sender, receiver));
    }
    return this.channels.get(receiver)?.get(sender) as CastConnection.Channel;
  }
}

class _Channel extends EventEmitter {
  constructor(
    private link: _Link,
    private source: string,
    private dest: string
  ) {
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
}
