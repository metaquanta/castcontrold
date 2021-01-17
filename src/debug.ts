export function error(s:string) {
  console.error(color(9, s));
}

export function warning(s:string) {
  console.error(color(1, s));
}

export function debug(s:string) {
  console.debug(color(8, s));
}

export function notice(s:string) {
  console.debug(color(15, s));
}

export function info(s:string) {
  console.log(s);
}

export function c(s: string): string {
  if (s === undefined) return color(9, "undefined");
  let h =
    (s
      .split("")
      .map((c) => c.codePointAt(0))
      .reduce((a, b) => ((a ?? 0) + (b ?? 0)) % 10) ?? 0) + 2;
  if (h > 6) h = h + 3;
  return color(h, s);
}

function color(c: number, s: string): string {
  return `\u001b[38;5;${c}m${s}\u001b[39;49m`;
}
