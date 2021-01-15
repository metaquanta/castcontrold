#!/bin/env -S node

import { ReceiverStatusMessage, MediaStatusMessage } from "./CastMessage";
import { CastConnection } from "./CastConnection";

async function loadCast(host: string): Promise<Cast> {
  const conn = await CastConnection.open(host);
  conn.openTpChannel().send("CONNECT");
  const channel = conn.openReceiverChannel();
  const message = await channel.sendAndListen("GET_STATUS");
  return new Cast(conn, message as ReceiverStatusMessage);
}
class Cast {
  private current: Media | undefined;
  private channel: CastConnection.Channel;
  private stream: AsyncIterable<MediaStatusMessage>;
  constructor(
    private connection: CastConnection,
    message: ReceiverStatusMessage
  ) {
    const receiver = message.status.applications[0].transportId;
    this.connection.openTpChannel(CastConnection.mediaSender, receiver).send("CONNECT");
    this.channel = this.connection.openMediaChannel(receiver);
    this.stream = merge(
      filter(
        this.channel.stream(),
        (m) => m.type === "MEDIA_STATUS",
        MediaStatusMessage.is
      ),
      (a, b) => a.status[0].mediaSessionId === b.status[0].mediaSessionId
    );
    this.channel.send("GET_STATUS");

    setImmediate(async () => {
      for await (const message of this.stream) {
        this.current = new Media(message);
      }
    });
  }

  getCurrent(): Media | undefined {
    return this.current;
  }
}
class Media {
  constructor(m: MediaStatusMessage) {
    console.debug(`new Media(): ${m}`);
  }
}

async function* merge<T>(
  iter: AsyncIterable<T>,
  mergePredicate: (a: T, b: T) => boolean
): AsyncIterable<T> {
  let a;
  for await (const b of iter) {
    if (a == undefined || !mergePredicate(a, b)) yield b;
    a = b;
  }
}

async function* filter<T, U extends T>(
  iter: AsyncIterable<T>,
  f: (v: T) => boolean,
  isU: (v: T) => v is U
): AsyncIterable<U> {
  for await (const i of iter) {
    if (isU(i) && f(i)) yield i;
  }
}

loadCast("192.168.31.102");
