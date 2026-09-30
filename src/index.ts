#!/usr/bin/env node

import { Command } from "commander"
import { createInterface } from "node:readline"
import QRCode from "qrcode"
import open from "open"
import {
  loadConfig,
  saveConfig,
  loadGoogleTokens,
  setConfigDir,
  resetConfig,
  showConfigInfo,
} from "./lib/config.js"
import {
  initWhatsApp,
  loadWhatsAppContacts,
  whatsappStore,
  destroyWhatsApp,
} from "./lib/whatsapp.js"
import {
  createOAuthClient,
  refreshAccessToken,
  generateAuthUrl,
  exchangeCode,
  googleStore,
} from "./lib/google.js"
import { startOAuthServer, stopOAuthServer } from "./lib/oauth-server.js"
import { buildMatches, syncContacts } from "./lib/sync.js"
import { ui, setVerbose } from "./lib/log.js"
import type { SyncMode } from "./types.js"

async function authenticateGoogle(
  clientId: string,
  clientSecret: string
): Promise<void> {
  ui.step("Google authentication")

  const tokens = await loadGoogleTokens()
  if (tokens?.refreshToken) {
    try {
      const client = createOAuthClient(clientId, clientSecret)
      client.setCredentials({
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
        expiry_date: tokens.expiryDate,
      })
      await refreshAccessToken(client)
      googleStore.auth = client
      ui.success("Authenticated with saved tokens")
      return
    } catch {
      ui.warn("Saved tokens expired, opening browser...")
    }
  }

  const { port, codePromise } = await startOAuthServer()
  const redirectUri = `http://localhost:${port}/callback`
  const client = createOAuthClient(clientId, clientSecret, redirectUri)
  const authUrl = generateAuthUrl(client, redirectUri)

  ui.info("Opening browser for authorization...")
  await open(authUrl)

  const code = await codePromise
  await stopOAuthServer()
  await exchangeCode(client, code, redirectUri)
  googleStore.auth = client
  ui.success("Google authenticated")
}

async function connectWhatsApp(): Promise<void> {
  ui.blank()
  ui.step("WhatsApp connection")

  return new Promise((resolve, reject) => {
    let lastQrLines = 0
    const client = initWhatsApp({
      onQr: async (qr) => {
        // Clear previous QR code
        if (lastQrLines > 0) {
          process.stdout.write(`\x1b[${lastQrLines}A\x1b[0J`)
        } else {
          ui.info("Scan this QR code with WhatsApp:")
          ui.blank()
        }
        const qrString = await QRCode.toString(qr, {
          type: "terminal",
          small: true,
        })
        console.log(qrString)
        lastQrLines = qrString.split("\n").length + 1
      },
      onConnecting: () => ui.info("Connecting..."),
      onReady: async () => {
        ui.success("WhatsApp connected")
        ui.info("Loading contacts...")
        const contacts = await loadWhatsAppContacts(client)
        whatsappStore.client = client
        whatsappStore.contacts = contacts
        ui.success(`Loaded ${contacts.size} WhatsApp contacts`)
        resolve()
      },
      onError: (err) => reject(new Error(err)),
    })
    whatsappStore.client = client
  })
}

async function cleanup(): Promise<never> {
  await destroyWhatsApp()
  process.exit(0)
}

async function run(opts: {
  clientId?: string
  clientSecret?: string
  verbose?: boolean
  config?: string | true
  reset?: boolean
}): Promise<void> {
  if (opts.verbose) setVerbose(true)
  if (typeof opts.config === "string") setConfigDir(opts.config)

  if (opts.reset) {
    await resetConfig()
    ui.success("All config, tokens, and session data cleared.")
    process.exit(0)
  }

  if (opts.config !== undefined && typeof opts.config !== "string") {
    await showConfigInfo()
    process.exit(0)
  }

  ui.header("whasync — WhatsApp Photo Sync")

  // 1. Resolve Google credentials
  const config = await loadConfig()
  const clientId = opts.clientId ?? config?.googleClientId
  const clientSecret = opts.clientSecret ?? config?.googleClientSecret

  if (!clientId || !clientSecret) {
    ui.step("Google OAuth Setup")
    ui.blank()
    console.log("  whasync needs Google OAuth credentials to access your contacts.")
    console.log("  Here's how to set them up:\n")
    console.log("  1. Go to https://console.cloud.google.com/apis/credentials")
    console.log("  2. Create a project (or select an existing one)")
    console.log("  3. Go to 'APIs & Services' > 'Library'")
    console.log("     Search for 'People API' and click 'Enable'")
    console.log("  4. Go to 'APIs & Services' > 'Credentials'")
    console.log("     Click 'Create Credentials' > 'OAuth client ID'")
    console.log("  5. Set application type to 'Desktop app'")
    console.log("  6. Copy the Client ID and Client Secret, then run:\n")
    console.log("     whasync --client-id <YOUR_ID> --client-secret <YOUR_SECRET>\n")
    process.exit(1)
  }

  if (opts.clientId || opts.clientSecret) {
    await saveConfig({
      googleClientId: clientId,
      googleClientSecret: clientSecret,
    })
    ui.success("Credentials saved")
  }

  // 2. Google auth first (fast fail before WhatsApp QR scan)
  await authenticateGoogle(clientId, clientSecret)

  // 3. WhatsApp auth
  await connectWhatsApp()

  // 4. Build matches
  ui.blank()
  ui.step("Matching contacts")
  const allMatches = await buildMatches(whatsappStore, googleStore)
  const withPhoto = allMatches.filter((m) => m.google.hasPhoto).length
  const withoutPhoto = allMatches.length - withPhoto
  ui.summary("Matched", `${allMatches.length} contacts`)
  ui.summary("With photo", withPhoto)
  ui.summary("Without photo", withoutPhoto)

  // 5. Choose sync mode
  ui.blank()
  ui.step("Choose sync mode")
  console.log("    1) Missing only — only contacts without a Google photo")
  console.log("    2) All — overwrite all Google photos")
  console.log("    q) Exit")

  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const choice = await new Promise<string>((resolve) => {
    rl.question("\n    Choose [1/2/q] (default: 1): ", (answer) => {
      rl.close()
      resolve(answer.trim().toLowerCase())
    })
  })

  if (choice === "q" || choice === "exit") {
    ui.info("Exiting.")
    await cleanup()
  }

  const mode: SyncMode = choice === "2" ? "all" : "missing"
  const toSync =
    mode === "missing"
      ? allMatches.filter((m) => !m.google.hasPhoto)
      : allMatches

  if (toSync.length === 0) {
    ui.success("Nothing to sync — all contacts have photos!")
    await cleanup()
  }

  // 6. Sync
  ui.blank()
  ui.step(`Syncing ${toSync.length} contacts (${mode === "missing" ? "missing only" : "all"})`)
  ui.blank()

  let synced = 0
  let skipped = 0
  let failed = 0

  await syncContacts(toSync, mode, (index, updated) => {
    const name = updated.google.name ?? updated.google.phones[0]
    const count = `[${index + 1}/${toSync.length}]`
    switch (updated.status) {
      case "synced":
        synced++
        ui.progress(index + 1, toSync.length, `\x1b[32msynced\x1b[0m  ${name}`)
        break
      case "skipped":
        skipped++
        ui.progress(index + 1, toSync.length, `\x1b[90mskipped\x1b[0m ${name}`)
        break
      case "failed":
        failed++
        ui.progress(index + 1, toSync.length, `\x1b[31mfailed\x1b[0m  ${name} — ${updated.error}`)
        break
    }
  })

  // 7. Summary
  ui.blank()
  ui.header("Summary")
  ui.summary("Synced", synced)
  ui.summary("Skipped", skipped)
  ui.summary("Failed", failed)
  ui.blank()

  await cleanup()
}

process.on("SIGINT", () => {
  ui.blank()
  ui.info("Interrupted. Cleaning up...")
  void cleanup()
})

const program = new Command()
  .name("whasync")
  .description("Sync WhatsApp profile photos to Google Contacts")
  .version("0.0.1")
  .option("--client-id <id>", "Google OAuth Client ID")
  .option("--client-secret <secret>", "Google OAuth Client Secret")
  .option("--config [path]", "Show config info, or use custom config directory")
  .option("--reset", "Clear all saved config, tokens, and session data")
  .option("-v, --verbose", "Show debug logs")
  .action(run)

program.parse()
