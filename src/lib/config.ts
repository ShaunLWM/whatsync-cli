import { mkdir, readFile, writeFile, rm } from "node:fs/promises"
import { join } from "node:path"
import { homedir } from "node:os"
import { existsSync } from "node:fs"
import type { AppConfig, GoogleTokens } from "../types.js"

let customConfigDir: string | undefined

export function setConfigDir(dir: string): void {
  customConfigDir = dir
}

export function getConfigDir(): string {
  if (customConfigDir) return customConfigDir
  const xdg = process.env.XDG_CONFIG_HOME
  return xdg
    ? join(xdg, "whasync-cli")
    : join(homedir(), ".config", "whasync-cli")
}

async function ensureDir(): Promise<string> {
  const dir = getConfigDir()
  await mkdir(dir, { recursive: true })
  return dir
}

async function readJson<T>(filename: string): Promise<T | null> {
  try {
    const dir = getConfigDir()
    const raw = await readFile(join(dir, filename), "utf-8")
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

async function writeJson(filename: string, data: unknown): Promise<void> {
  const dir = await ensureDir()
  await writeFile(join(dir, filename), JSON.stringify(data, null, 2), "utf-8")
}

export async function loadConfig(): Promise<AppConfig | null> {
  return readJson<AppConfig>("config.json")
}

export async function saveConfig(config: AppConfig): Promise<void> {
  await writeJson("config.json", config)
}

export async function loadGoogleTokens(): Promise<GoogleTokens | null> {
  return readJson<GoogleTokens>("google-tokens.json")
}

export async function saveGoogleTokens(tokens: GoogleTokens): Promise<void> {
  await writeJson("google-tokens.json", tokens)
}

export function getSessionDir(): string {
  return join(getConfigDir(), "wa-session")
}

export async function resetConfig(): Promise<void> {
  const dir = getConfigDir()
  if (existsSync(dir)) {
    await rm(dir, { recursive: true })
  }
}

export async function showConfigInfo(): Promise<void> {
  const dir = getConfigDir()
  console.log(`Config directory: ${dir}`)
  console.log()

  const config = await loadConfig()
  if (config) {
    const masked = (s: string) => s.length > 8 ? s.slice(0, 4) + "..." + s.slice(-4) : "****"
    console.log(`  Client ID:     ${masked(config.googleClientId)}`)
    console.log(`  Client Secret: ${masked(config.googleClientSecret)}`)
  } else {
    console.log("  No config found")
  }

  const tokens = await loadGoogleTokens()
  if (tokens) {
    const expiry = new Date(tokens.expiryDate).toLocaleString()
    console.log(`  Google tokens: saved (expires ${expiry})`)
  } else {
    console.log("  Google tokens: none")
  }

  const sessionDir = getSessionDir()
  console.log(`  WA session:    ${existsSync(sessionDir) ? "exists" : "none"}`)
}
