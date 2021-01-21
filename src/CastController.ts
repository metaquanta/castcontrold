#!/bin/env -S node

import { ReceiverStatusMessage, MediaStatusMessage } from "./CastMessage.js";
import { CastConnection } from "./CastConnection.js";
import { c, debug, notice, info } from "./debug.js";

export namespace CastController {
  export async function connect(
    host: string,
    port: number | string
  ): Promise<CastController> {
    return controller(await CastConnection.open(host, parseInt(`${port}`)));
  }
}

export type CastController = {
  volume: number;
  setVolume(v: number): void;
  volumeUp(): void;
  volumeDown(): void;
  stop(): void;
  resume(): void;
  pause(): void;
  seek(p: number): void;
  rseek(d: number): void;
  status: string;
  state: "PLAYING" | "PAUSED" | "LOADING" | "IDLE";
  media?: {
    description: string;
    duration?: number;
    position?: number;
  };
};

function controller(conn: CastConnection.Link): CastController {
  const root = new RootReceiver(conn);
  return {
    get volume() {
      return root.volume?.level ?? 1;
    },
    setVolume: (v: number) => root.setVolume(v),
    volumeUp() {
      if (root.volume) {
        root.setVolume(root.volume.level + root.volume.stepInterval);
      }
    },
    volumeDown() {
      if (root.volume) {
        root.setVolume(root.volume.level - root.volume.stepInterval);
      }
    },
    stop: () => root.stop(),
    resume: () => root.applicationReceiver?.play(),
    pause: () => root.applicationReceiver?.pause(),
    seek: (p) => root.applicationReceiver?.seek(p),
    rseek(delta) {
      const pos = root.applicationReceiver?.position;
      if (pos === undefined) return;
      this.seek(pos + delta);
    },
    get state() {
      const state = root.applicationReceiver?.state;
      if (
        state === undefined ||
        state === "BUFFERING" ||
        state === "BUFFERED"
      ) {
        return "LOADING";
      }
      return state as "PLAYING" | "PAUSED" | "LOADING" | "IDLE";
    },
    get status() {
      return root.status;
    }
  };
}

class RootReceiver {
  static ns = "urn:x-cast:com.google.cast.receiver";
  private channel: CastConnection.Channel;
  volume?: { level: number; stepInterval: number };
  private transportId?: string;
  private applicationDescription?: string;
  applicationReceiver?: MediaReceiver;
  constructor(private connection: CastConnection.Link) {
    this.channel = this.connection.openChannel("sender-0", "receiver-0");
    this.channel.onValidatedMessageNs(
      RootReceiver.ns,
      (m) => this.parseMessage(m),
      ReceiverStatusMessage.is
    );
    this.channel.send(RootReceiver.ns, "GET_STATUS");
  }

  setVolume(v: number | undefined) {
    if (v === undefined) return;
    if (v < 0) v = 0;
    if (v > 1) v = 1;
    this.channel.send(RootReceiver.ns, "SET_VOLUME", {
      volume: { level: v }
    });
  }

  stop() {
    if (this.transportId)
      this.channel.send(RootReceiver.ns, "STOP", {
        sessionId: this.transportId
      });
  }

  parseMessage(m: ReceiverStatusMessage): void {
    if (m.status.volume !== undefined) {
      this.volume = m.status.volume;
    }
    if (m.status.applications === undefined) return;
    const application = m.status.applications
      .filter((app) => app.transportId !== this.transportId)
      .filter(
        (app) =>
          app.namespaces.findIndex((ns) => ns.name === MediaReceiver.ns) >= 0
      )[0];
    if (application === undefined) return;
    this.applicationDescription = application.displayName;
    this.transportId = application.transportId;
    if (this.applicationReceiver !== undefined)
      this.applicationReceiver.close();
    this.applicationReceiver = new MediaReceiver(
      this.connection,
      this.transportId
    );
  }

  get status() {
    return `[${this.applicationDescription}] ${
      this.applicationReceiver?.status ?? ""
    } ( volume: ${Math.round((this.volume?.level ?? 0) * 100)} / 100 )`;
  }
}

class MediaReceiver {
  static ns = "urn:x-cast:com.google.cast.media";
  private channel: CastConnection.Channel;
  private mediaSessionId?: number;
  state: string = "IDLE";
  private _position: number = 0;
  private _positionAt: number = 0;
  private media?: MediaStatusMessage.Media;
  private client_id = Math.round(Math.random() * 100000);
  constructor(private connection: CastConnection.Link, receiver: string) {
    this.channel = this.connection.openChannel(
      `client-${this.client_id}`,
      receiver
    );
    this.channel.onValidatedMessageNs(
      MediaReceiver.ns,
      (m) => this.parseMessage(m.status[0]),
      MediaStatusMessage.is,
      (m) => m.status !== undefined && m.status.length === 1
    );
    this.channel.send(MediaReceiver.ns, "GET_STATUS");
  }

  set position(pos: number) {
    this._position = pos;
    this._positionAt = Date.now() / 1000;
  }

  get position(): number {
    if (this.state === "PLAYING") {
      return Date.now() / 1000 - this._positionAt + this._position;
    } else {
      return this._position;
    }
  }

  parseMessage(m: MediaStatusMessage.Status): void {
    //console.log(m);
    this.mediaSessionId = m.mediaSessionId;
    if (m.currentTime) {
      if (this._position > 0) {
        debug(
          `${this.position.toFixed(1)}s ⇒ ${m.currentTime.toFixed(
            1
          )}s (±${Math.abs(this.position - m.currentTime).toFixed(1)}s)`
        );
      }
      this.position = m.currentTime;
    }
    info(
      `[${c(this.mediaSessionId.toString())}] ${c(this.state)} ⇒ ${c(
        m.playerState
      )}`
    );
    this.state = m.playerState;
    if (m.media) {
      if (
        this.media === undefined ||
        this.media.contentId !== m.media.contentId
      ) {
        this.media = m.media;
      } else {
        if (m.media.metadata) this.media.metadata = m.media.metadata;
        if (m.media.duration) this.media.duration = m.media.duration;
      }
      notice(this.description);
    }
  }

  play(): void {
    this.channel.send(MediaReceiver.ns, "PLAY", {
      mediaSessionId: this.mediaSessionId
    });
  }

  pause(): void {
    this.channel.send(MediaReceiver.ns, "PAUSE", {
      mediaSessionId: this.mediaSessionId
    });
  }

  seek(time: number): void {
    if (this.media) {
      debug(`seek ${this.position.toFixed(1)} ↦ ${time.toFixed(1)}`);
      if (time < 0) time = 0;
      if (this.media.duration && this.media.duration < time) {
        time = this.media.duration;
      }
      this.position = time;
      this.channel.send(MediaReceiver.ns, "SEEK", {
        mediaSessionId: this.mediaSessionId,
        currentTime: time,
        resumeState: "PLAYBACK_UNCHANGED"
      });
    }
  }

  close(): void {
    this.channel.close();
  }

  get description(): string {
    if (this.media?.metadata) {
      return [
        this.media.metadata.title,
        this.media.metadata.seriesTitle,
        this.media.metadata.subtitle
      ]
        .filter((v) => v !== undefined)
        .join(" | ");
    }
    if (this.media) return this.media.contentId;
    return "...";
  }

  get status(): string {
    const durationStr = this.media?.duration
      ? this.media?.duration.toFixed(1) + "s"
      : "∞";
    return `${c(this.state)}: ${this.description} - ${this.position.toFixed(
      1
    )}s / ${durationStr}`;
  }
}
