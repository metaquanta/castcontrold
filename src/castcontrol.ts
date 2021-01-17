#!/bin/env -S node

import { CastController } from "./CastController.js";

const stdin = process.stdin;
stdin.setRawMode(true);
stdin.resume();
stdin.setEncoding("utf8");

const host = process.argv[1];
const port = process.argv[2] ?? 8009;
if(host === undefined) {
  console.error("No Chromecast provided");
}
const cc = await CastController.connect(host, port);

let paused = false;
stdin.on("data", function (key: string) {
  // ctrl-c ( end of text )
  if (key === "\u0003") {
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
      if (paused) cc.resume();
      else cc.pause();
      paused = !paused;
      break;
    case "s":
      cc.stop();
      break;
    case "q":
      console.log(cc.volume);
  }
});

