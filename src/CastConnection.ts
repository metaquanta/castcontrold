import { Client } from "castv2";
import { Message,ReceiverStatusMessage } from "./CastMessage";

const mediaSender = "client-17558";

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
  };
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
      mediaSender,
      receiver,
      "urn:x-cast:com.google.cast.media"
    );
  }

  parseMessage(
    src: string,
    dest: string,
    namespace: string,
    data: string
  ): void {
    console.debug(
      `[${dest}] ⟵ [${src}] (${namespace}): `,
      JSON.stringify(JSON.parse(data), null, "  ")
    );
  }

  send(
    src: string,
    dest: string,
    namespace: string,
    type: string,
    data: Record<string, unknown> = {}
  ): number {
    console.debug(`[${src}] ⟶ [${dest}] (${namespace}): ${type}`, data);
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
    sourceId: string,
    destinationId: string,
    namespace: string
  ): CastConnection.Channel {
    return new _CastChannel(this, sourceId, destinationId, namespace);
  }
}

class _CastChannel {
  constructor(
    private bus: CastConnection,
    private source: string,
    private dest: string,
    private namespace: string
  ) {}

  send(type: string, data: Record<string, unknown> = {}): number {
    return this.bus.send(this.source, this.dest, this.namespace, type, data);
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

export async function listenToCast(): Promise<string> {
  const conn = await CastConnection.open("192.168.31.102");
  const tpChan = conn.openTpChannel();
  tpChan.send("CONNECT");
  const recChan = conn.openReceiverChannel();
  const message = await recChan.sendAndListen("GET_STATUS");
  if (ReceiverStatusMessage.is(message)) {
    const status = message.status;
    console.log("!!!", status.applications.length, status);
    if (status.applications.length > 0) {
      const transportId = status.applications[0].transportId;
      const tpMedia = conn.openTpChannel(mediaSender, transportId);
      tpMedia.send("CONNECT");
      const media = conn.openMediaChannel(transportId);
      const message = await media.sendAndListen("GET_STATUS");
      return JSON.stringify(message);
    }
  }
  return "";
}
