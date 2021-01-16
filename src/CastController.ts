#!/bin/env -S node

import {
  ReceiverStatusMessage,
  MediaStatusMessage,
  Message
} from "./CastMessage.js";
import { CastConnection } from "./CastConnection.js";

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
  transportId: string | undefined;
  volume: number = 0;
  volumeStep: number = 0;
  muted: boolean = false;
  constructor(private connection: CastConnection) {
    this.connection.openTpChannel().send("CONNECT");
    const channel = this.connection.openReceiverChannel();
    channel.onMessage((m) => this.parseMessage(m));
    channel.send("GET_STATUS");
  }

  getVolume(): number {
    return this.volume;
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
    if (m.status.volume !== undefined) {
      const vol = m.status.volume;
      if (this.muted !== vol.muted) {
        console.debug(`Link.muted: ${vol.muted}`);
        this.muted = vol.muted;
      }
      if (this.volume != vol.level) {
        console.debug(`Link.volume: ${vol.level}`);
        this.volume = vol.level;
      }
      if (this.volumeStep !== vol.stepInterval) {
        console.debug(`Link.volumeStep: ${vol.stepInterval}`);
        this.volumeStep = vol.stepInterval;
      }
    }
    const application = m.status.applications[0];
    if (application.transportId === this.transportId) {
      console.debug("Link: duplicate application");
    } else if (
      application.namespaces.findIndex(
        (ns) => ns.name === CastConnection.mediaNs
      ) >= 0
    ) {
      console.debug(`Link.transportId: ${application.transportId}`);
      this.transportId = application.transportId;
      if (this.receiver !== undefined) this.receiver.close();
      this.receiver = new Application(
        this.connection,
        m.status.applications[0]
      );
    }
  }
}

class Application {
  media: Media | undefined;
  status: string;
  sessionId: string;
  constructor(
    private connection: CastConnection,
    message: ReceiverStatusMessage.Application
  ) {
    const receiver = message.transportId;
    this.status = message.statusText;
    this.sessionId = message.sessionId;
    console.debug(`new Application("${receiver}")`);
    this.connection
      .openTpChannel(CastConnection.mediaSender, receiver)
      .send("CONNECT");
    const channel = this.connection.openMediaChannel(receiver);
    channel.onMessage((m) => this.parseMessage(m));
    channel.send("GET_STATUS");
  }

  parseMessage(m: Message): void {
    if (!MediaStatusMessage.is(m)) {
      console.debug("Application.parseMessage() - error", m);
      return;
    }
    const newMedia = new Media(m.status[0]);
    if (this.media === undefined) {
      console.debug(`Application.media: ${newMedia}`);
      this.media = newMedia;
    } else if (this.media.sessionId === newMedia.sessionId) {
      this.media.update(newMedia);
    } else {
      this.media.close();
      console.debug(`Application.media: ${newMedia}`);
      this.media = newMedia;
    }
  }

  close(): void {}
}

class Media {
  sessionId: string | undefined;
  state: string;
  mediaTime: number;
  mediaTimeAt: number;
  media: MediaStatusMessage.Media | undefined;
  constructor(m: MediaStatusMessage.Status) {
    console.debug(`new Media`, JSON.stringify(m, null, "  "));
    this.media = m.media;
    this.sessionId = m.mediaSessionId;
    this.state = m.playerState;
    this.mediaTime = m.currentTime ?? -1;
    this.mediaTimeAt = Date.now() / 1000;
  }

  currentTime(): number {
    return this.mediaTime > 0
      ? this.mediaTime + Date.now() / 1000 - this.mediaTimeAt
      : -1;
  }

  update(m: Media): void {
    if (m.state !== this.state) {
      console.debug(`Media.state: ${this.state} ⇒ ${m.state}`);
      this.state = m.state;
    }
    if (m.mediaTime && this.mediaTime > -1) {
      console.debug(`Media.mediaTime: ${this.currentTime()} ⇒ ${m.mediaTime}`);
      this.mediaTime = m.mediaTime;
      this.mediaTimeAt = Date.now();
    }
  }

  close(): void {
    console.debug(`Media.close() [${this.sessionId}]`);
  }
}

CastController.open("192.168.31.102");
