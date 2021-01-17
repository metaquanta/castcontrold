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
  state: "PLAYING" | "PAUSED" | "LOADING" | "IDLE";
  media?: {
    description: string;
    duration?: number;
    position?: number;
  };
};

function controller(conn: CastConnection.Link): CastController {
  const root = new Root(conn);
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
    resume: () => root.receiver?.play(),
    pause: () => root.receiver?.pause(),
    seek: (p) => root.receiver?.seek(p),
    rseek(delta) {
      const pos = root.receiver?.media?.getMediaTime();
      if (pos === undefined) return;
      this.seek(pos + delta);
    },
    get state() {
      const state = root.receiver?.media?.state;
      if (
        state === undefined ||
        state === "BUFFERING" ||
        state === "BUFFERED"
      ) {
        return "LOADING";
      }
      return state as "PLAYING" | "PAUSED" | "LOADING" | "IDLE";
    }
  };
}

class Root {
  static ns = "urn:x-cast:com.google.cast.receiver";
  private channel: CastConnection.Channel;
  volume?: { level: number; stepInterval: number };
  private transportId?: string;
  receiver?: MediaReceiver;
  constructor(private connection: CastConnection.Link) {
    this.channel = this.connection.openChannel("sender-0", "receiver-0");
    this.channel.onValidatedMessageNs(
      Root.ns,
      (m) => this.parseMessage(m),
      ReceiverStatusMessage.is
    );
    this.channel.send(Root.ns, "GET_STATUS");
  }

  setVolume(v: number | undefined) {
    if (v === undefined) return;
    if (v < 0) v = 0;
    if (v > 1) v = 1;
    this.channel.send(Root.ns, "SET_VOLUME", {
      volume: { level: v }
    });
  }

  stop() {
    if (this.transportId)
      this.channel.send(Root.ns, "STOP", {
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

    this.transportId = application.transportId;
    if (this.receiver !== undefined) this.receiver.close();
    this.receiver = new MediaReceiver(this.connection, this.transportId);
  }
}

class MediaReceiver {
  static ns = "urn:x-cast:com.google.cast.media";
  private channel: CastConnection.Channel;
  private mediaSessionId?: string;
  media?: MediaSession;
  constructor(private connection: CastConnection.Link, receiver: string) {
    this.channel = this.connection.openChannel("client-17558", receiver);
    this.channel.onValidatedMessageNs(
      MediaReceiver.ns,
      (m) => this.parseMessage(m),
      MediaStatusMessage.is,
      (m) => m.status !== undefined && m.status.length === 1
    );
    this.channel.send(MediaReceiver.ns, "GET_STATUS");
  }

  parseMessage(m: MediaStatusMessage): void {
    if (this.mediaSessionId === m.status[0].mediaSessionId) {
      this.media?.update(m.status[0]);
    } else {
      this.mediaSessionId = m.status[0].mediaSessionId;
      if (this.media !== undefined) this.media.close();
      this.media = new MediaSession(m.status[0]);
    }
  }

  play(): void {
    this.channel.send(MediaReceiver.ns, "PLAY", {
      mediaSessionId: this.media?.sessionId
    });
  }

  pause(): void {
    this.channel.send(MediaReceiver.ns, "PAUSE", {
      mediaSessionId: this.media?.sessionId
    });
  }

  seek(time: number): void {
    if (this.media) {
      debug(
        `seek ${this.media.getMediaTime().toFixed(1)} ↦  ${time.toFixed(1)})`
      );
      if (time < 0) time = 0;
      if (this.media.duration && this.media.duration < time) {
        time = this.media.duration;
      }
      this.media.setMediaTime(time);
      this.channel.send(MediaReceiver.ns, "SEEK", {
        mediaSessionId: this.media?.sessionId,
        currentTime: time,
        resumeState: "PLAYBACK_UNCHANGED"
      });
    }
  }

  close(): void {}
}

class MediaSession {
  sessionId: string;
  state: string;
  mediaTime: number = 0;
  mediaTimeAt: number;
  duration?: number;
  description?: string;
  constructor(m: MediaStatusMessage.Status) {
    this.sessionId = m.mediaSessionId.toString();
    this.state = m.playerState;
    this.mediaTime = m.currentTime ?? 0;
    this.mediaTimeAt = Date.now() / 1000;
    this.duration = m.media?.duration;
    info(
      `⚡[${c(this.sessionId)}] ${this.mediaTime.toFixed(
        1
      )}s/${this.duration?.toFixed(1)}s ${c(this.state)}`
    );
    if (m.media?.metadata) {
      const meta = m.media.metadata;
      this.description =
        meta.title ?? "" + meta.seriesTitle ?? "" + meta.subtitle ?? "";
      notice(this.description);
    }
  }

  setMediaTime(pos: number): void {
    this.mediaTime = pos;
    this.mediaTimeAt = Date.now() / 1000;
  }

  getMediaTime(): number {
    if (this.state === "PLAYING") {
      const now = Date.now() / 1000;
      return now - this.mediaTimeAt + this.mediaTime;
    } else return this.mediaTime;
  }

  update(m: MediaStatusMessage.Status): void {
    const now = Date.now() / 1000;
    const oldMediaTime = this.getMediaTime();
    if (m.playerState !== this.state) {
      info(`🗘 [${c(this.sessionId)}] ${c(this.state)} ⇒ ${c(m.playerState)}`);
      this.state = m.playerState;
    }
    if (m.currentTime !== undefined) {
      info(
        `🗘 [${c(this.sessionId)}] ` +
          `${m.currentTime.toFixed(1)}s ± ` +
          Math.abs(oldMediaTime - m.currentTime).toFixed(2) +
          "s"
      );
      this.mediaTime = m.currentTime;
      this.mediaTimeAt = now;
    }
    if (this.description === undefined && m.media?.metadata !== undefined) {
      const meta = m.media.metadata;
      this.description =
        meta.title ?? "" + meta.seriesTitle ?? "" + meta.subtitle ?? "";
    }
  }

  close(): void {
    info(`Media.close() [${c(this.sessionId)}]`);
  }
}
