import { Client } from "castv2";
import { EventEmitter } from "events";
import { Message } from "./CastMessage.js";

export namespace CastConnection {
  export function open(address: string): Promise<CastConnection> {
    console.debug(`CastConnection.open("${address}")`);
    return new Promise((resolve, reject) => {
      const client = new Client();
      client.on("error", (error: string) => {
        console.error(`CastConnection.openConnection() failed ${error}`);
        reject(error);
      });
      client.connect(address, () => {
        resolve(new _CastConnection(client));
      });
    });
  }

  export type Channel = {
    send(type: string, data?: Record<string, unknown>): number;
    sendAndListen(
      type: string,
      data?: Record<string, unknown>
    ): Promise<Message>;
    onMessage(f: (m: Message) => void): void;
  };

  export const mediaSender = "client-17558";
  export const mediaNs = "urn:x-cast:com.google.cast.media";
}

export type CastConnection = {
  openTpChannel(sender?: string, receiver?: string): CastConnection.Channel;
  openReceiverChannel(): CastConnection.Channel;
  openMediaChannel(receiver: string): CastConnection.Channel;
  send(
    src: string,
    dest: string,
    namespace: string,
    type: string,
    data?: Record<string, unknown>
  ): number;
  sendAndListen(
    src: string,
    dest: string,
    namespace: string,
    type: string,
    data?: Record<string, unknown>
  ): Promise<Message>;
  close(): void;
  openChannel(
    src: string,
    dest: string,
    namespace: string
  ): CastConnection.Channel;
};

class _CastConnection {
  private heartbeat: NodeJS.Timeout;
  private requestId: number = Math.floor(Math.random() * 10000);
  private channels: Map<
    string,
    Map<string, Map<string, _Channel>>
  > = new Map();
  constructor(private client: Client) {
    console.debug("CastConnection: connected");
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
  }

  openTpChannel(
    sender = "sender-0",
    receiver = "receiver-0"
  ): CastConnection.Channel {
    return this.openChannel(
      sender,
      receiver,
      "urn:x-cast:com.google.cast.tp.connection"
    );
  }

  openReceiverChannel(): CastConnection.Channel {
    return this.openChannel(
      "sender-0",
      "receiver-0",
      "urn:x-cast:com.google.cast.receiver"
    );
  }

  openMediaChannel(receiver: string): CastConnection.Channel {
    return this.openChannel(
      CastConnection.mediaSender,
      receiver,
      CastConnection.mediaNs
    );
  }

  parseMessage(
    src: string,
    dest: string,
    namespace: string,
    data: string
  ): void {
    const json = JSON.parse(data);
    console.debug(
      `[${dest}] ⟵  [${src}] (${namespace}): `,
      json.type
      //JSON.stringify(json, null, "  ")
    );
    (dest === "*"
      ? Array.from(this.channels.values()).map((v) =>
          v.get(src)?.get(namespace)
        )
      : [this.channels.get(dest)?.get(src)?.get(namespace)]
    )
      .filter((v) => v !== undefined)
      .forEach((channel) => channel?.consume(json));
  }

  send(
    src: string,
    dest: string,
    namespace: string,
    type: string,
    data: Record<string, unknown> = {}
  ): number {
    if (type !== "PING")
      console.debug(`[${src}] ⟶  [${dest}] (${namespace}): ${type}`, data.type);
    const requestId = this.newRequestId();
    this.client.send(
      src,
      dest,
      namespace,
      JSON.stringify({ type, requestId, data })
    );
    return requestId;
  }

  sendAndListen(
    src: string,
    dest: string,
    namespace: string,
    type: string,
    data: Record<string, unknown> = {}
  ): Promise<Message> {
    const requestId = this.send(src, dest, namespace, type, data);
    const receive = (
      resolve: (msg: Message) => void,
      reject: (msg: Message) => void
    ) => {
      this.client.once("message", (rsrc, rdest, rns, data: string) => {
        const message = JSON.parse(data);
        if (message.requestId === requestId) {
          resolve(message);
        } else if (src === rdest && dest === rsrc && namespace === rns) {
          reject(message);
        } else {
          receive(resolve, reject);
        }
      });
    };

    return new Promise((resolve, reject) => receive(resolve, reject));
  }

  close(): void {
    clearInterval(this.heartbeat);
  }

  newRequestId(): number {
    return this.requestId++;
  }

  openChannel(
    sender: string,
    receiver: string,
    namespace: string
  ): CastConnection.Channel {
    console.debug(`openChannel("${sender}", "${receiver}", "${namespace}")`);
    if (!this.channels.has(sender)) this.channels.set(sender, new Map());
    if (!this.channels.get(sender)?.has(receiver))
      this.channels.get(sender)?.set(receiver, new Map());
    if (!this.channels.get(sender)?.get(receiver)?.has(namespace)) {
      console.debug(`opening ["${sender}", "${receiver}", "${namespace}"]`);
      this.channels
        .get(sender)
        ?.get(receiver)
        ?.set(namespace, new _Channel(this, sender, receiver, namespace));
    }
    return this.channels
      .get(sender)
      ?.get(receiver)
      ?.get(namespace) as CastConnection.Channel;
  }
}

class _Channel extends EventEmitter {
  constructor(
    private bus: CastConnection,
    private source: string,
    private dest: string,
    private namespace: string
  ) {
    super();
  }

  send(type: string, data: Record<string, unknown> = {}): number {
    return this.bus.send(this.source, this.dest, this.namespace, type, data);
  }

  consume(message: Message): void {
    this.emit("message", message);
  }

  onMessage(f: (m: Message) => void): void {
    this.on("message", f);
  }

  sendAndListen(
    type: string,
    data: Record<string, unknown> = {}
  ): Promise<Message> {
    return this.bus.sendAndListen(
      this.source,
      this.dest,
      this.namespace,
      type,
      data
    );
  }
}
