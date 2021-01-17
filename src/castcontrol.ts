#!/bin/env -S node

import { CastController } from "./CastController.js";

const stdin = process.stdin;
stdin.setRawMode(true);
stdin.resume();
stdin.setEncoding("utf8");

const host = process.argv[2];
const port = process.argv[3] ?? 8009;
if (host === undefined) {
  console.error("No Chromecast provided");
}
const cc = await CastController.connect(host, port);

stdin.on("data", function (key: string) {
  // ctrl-c/ctrl-d
  if (key === "\u0003" || key === "\u0004") {
    process.exit();
  }
  switch (key) {
    case "u":
      cc.volumeUp();
      break;
    case "d":
      cc.volumeDown();
      break;
    case "f":
      cc.rseek(10);
      break;
    case "b":
      cc.rseek(-10);
      break;
    case " ":
      if (cc.state === "PAUSED") cc.resume();
      else if (cc.state === "PLAYING") cc.pause();
      break;
    case "s":
      cc.stop();
      break;
    case "q":
      console.log(cc.volume);
  }
});
