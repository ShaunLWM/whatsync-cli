const c = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
  white: "\x1b[37m",
}

export const ui = {
  step: (msg: string) =>
    console.log(`${c.cyan}${c.bold}>>>${c.reset} ${msg}`),

  success: (msg: string) =>
    console.log(`${c.green}  ✓${c.reset} ${msg}`),

  skip: (msg: string) =>
    console.log(`${c.gray}  - ${msg}${c.reset}`),

  fail: (msg: string) =>
    console.log(`${c.red}  ✗${c.reset} ${msg}`),

  info: (msg: string) =>
    console.log(`${c.white}  ${msg}${c.reset}`),

  progress: (current: number, total: number, msg: string) =>
    console.log(`${c.dim}  [${current}/${total}]${c.reset} ${msg}`),

  summary: (label: string, value: string | number) =>
    console.log(`${c.white}  ${label}: ${c.bold}${value}${c.reset}`),

  blank: () => console.log(),

  warn: (msg: string) =>
    console.log(`${c.yellow}  ! ${msg}${c.reset}`),

  header: (msg: string) =>
    console.log(`\n${c.bold}${c.white}${msg}${c.reset}\n`),
}

let verbose = false

export function setVerbose(v: boolean) {
  verbose = v
}

export function debug(tag: string, msg: string) {
  if (verbose) {
    process.stderr.write(`${c.dim}[${tag}] ${msg}${c.reset}\n`)
  }
}
