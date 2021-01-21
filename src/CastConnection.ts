import { connect, TLSSocket } from "tls";
import { extensions as proto } from "../build/cast_channel.proto.js";
import { debug } from "./debug.js";

export type CastConnection = {
  onReceipt(
    f: (src: string, dest: string, ns: string, data: string) => void
  ): void;
  send(
    sourceId: string,
    destinationId: string,
    namespace: string,
    data: string
  ): void;
};

export namespace CastConnection {
  export async function open(
    host: string,
    port = 8009
  ): Promise<CastConnection> {
    const socket = await openTLSSocket(host, port);
    return new CastClient(socket);
  }
}
class CastClient {
  constructor(private socket: TLSSocket) {}

  onReceipt(
    f: (src: string, dest: string, ns: string, data: string) => void
  ): void {
    this.socket.on("readable", () => {
      while (true) {
        const header = this.socket.read(4);
        if (header === null) return;
        const packet = this.socket.read(header.readUInt32BE(0));
        if (packet === null) return;
        const m = proto.api.cast_channel.CastMessage.decode(packet);
        debug(
          `CastConnection.onReceipt(` +
            `${m.sourceId}, ${m.destinationId}, ${m.namespace}, ${m.payloadUtf8})`
        );
        f(m.sourceId, m.destinationId, m.namespace, m.payloadUtf8);
      }
    });
  }

  send(
    sourceId: string,
    destinationId: string,
    namespace: string,
    payloadUtf8: string
  ): void {
    debug(
      `CastClient.send(${sourceId}, ${destinationId}, ${namespace}, ${payloadUtf8})`
    );
    const buf = proto.api.cast_channel.CastMessage.encode({
      protocolVersion: 0,
      payloadType: 0,
      payloadUtf8,
      sourceId,
      destinationId,
      namespace
    }).finish();
    const header = Buffer.alloc(4);
    header.writeUInt32BE(buf.length, 0);
    this.socket.write(Buffer.concat([header, buf]));
  }
}

function openTLSSocket(host: string, port: number): Promise<TLSSocket> {
  debug(`Connecting to ${host}:${port}...`);
  return new Promise((resolve, reject) => {
    const socket = connect({ host, port, rejectUnauthorized: false }, () => {
      resolve(socket);
    });
    socket.on("error", (error) => reject(error.message));
  });
}

export default CastConnection;
