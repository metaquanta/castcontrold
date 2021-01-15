#!/usr/bin/env -S node --trace-warnings

import { listenToCast } from "./CastConnection.js";

export class CastControl {
  stop() {}

  pause() {}

  play() {}

  volumeUp() {}

  volumeDown() {}

  setVolume(level: number) {}

  fastForward() {  }

  rewind() {}

  seek(time: number) {}
}

listenToCast();
