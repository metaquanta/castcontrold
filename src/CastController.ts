#!/bin/env -S node

import {
  ReceiverStatusMessage,
  MediaStatusMessage,
  Message
} from "./CastMessage";
import { CastConnection } from "./CastConnection";

export namespace CastController {
  export async function open(host: string): Promise<Link> {
    const conn = await CastConnection.open(host);
    return new Link(conn);
  }

  export type Application = {
    media: Media | undefined;
  };

  export type Media = {};
}

class Link {
  receiver: Application | undefined;
  constructor(private connection: CastConnection) {
    this.connection.openTpChannel().send("CONNECT");
    const channel = this.connection.openReceiverChannel();
    channel.onMessage((m) => this.parseMessage(m));
    channel.send("GET_STATUS");
  }

  parseMessage(m: Message): void {
    if (
      !ReceiverStatusMessage.is(m) ||
      m.status.applications === undefined ||
      m.status.applications.length === 0
    ) {
      console.debug("Cast.parseMessage() - error", m);
      return;
    }
    this.receiver = new Application(this.connection, m.status.applications[0]);
  }
}

class Application {
  media: Media | undefined;
  //private channel: CastConnection.Channel;
  constructor(
    private connection: CastConnection,
    message: ReceiverStatusMessage.Application
  ) {
    const receiver = message.transportId;
    console.debug(`new Receiver("${receiver}")`);
    this.connection
      .openTpChannel(CastConnection.mediaSender, receiver)
      .send("CONNECT");
    const channel = this.connection.openMediaChannel(receiver);
    channel.onMessage((m) => this.parseMessage(m));
    channel.send("GET_STATUS");
  }

  parseMessage(m: Message): void {
    if (!MediaStatusMessage.is(m)) {
      console.debug("Receiver.parseMessage() - error", m);
      return;
    }
    this.media = new Media(m);
  }
}
class Media {
  constructor(m: MediaStatusMessage) {
    console.debug(`new Media`, JSON.stringify(m, null, "  "));
  }
}

CastController.open("192.168.31.102");
