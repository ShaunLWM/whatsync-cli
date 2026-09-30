import pkg from "whatsapp-web.js"
const { Client, LocalAuth, MessageMedia } = pkg
import type { Client as ClientType } from "whatsapp-web.js"
import type { WhatsAppContact } from "../types.js"
import { getSessionDir } from "./config.js"
import { normalizePhone } from "./phone.js"
import { debug } from "./log.js"

type WhatsAppCallbacks = {
  onQr: (qr: string) => void
  onConnecting: () => void
  onReady: () => void
  onError: (error: string) => void
}

export const whatsappStore: {
  client: ClientType | null
  contacts: Map<string, WhatsAppContact>
} = {
  client: null,
  contacts: new Map(),
}

export function initWhatsApp(callbacks: WhatsAppCallbacks): ClientType {
  const client = new Client({
    authStrategy: new LocalAuth({
      dataPath: getSessionDir(),
    }),
    puppeteer: {
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    },
  })

  client.on("qr", (qr: string) => {
    debug("wa", `QR received (${qr.length} chars)`)
    callbacks.onQr(qr)
  })
  client.on("loading_screen", () => {
    debug("wa", "loading_screen event")
    callbacks.onConnecting()
  })
  client.on("ready", () => {
    debug("wa", "ready event")
    callbacks.onReady()
  })
  client.on("auth_failure", (msg: string) => {
    debug("wa", `auth_failure: ${msg}`)
    callbacks.onError(`Auth failed: ${msg}`)
  })
  client.on("disconnected", (reason: string) => {
    debug("wa", `disconnected: ${reason}`)
    callbacks.onError(`Disconnected: ${reason}`)
  })

  debug("wa", "calling client.initialize()")
  client.initialize().catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err)
    debug("wa", `initialize error: ${msg}`)
    callbacks.onError(msg)
  })
  return client
}

export async function loadWhatsAppContacts(
  client: ClientType
): Promise<Map<string, WhatsAppContact>> {
  const contacts = await client.getContacts()
  const contactMap = new Map<string, WhatsAppContact>()

  for (const contact of contacts) {
    if (!contact.id?.user || contact.isGroup) continue

    const phone = contact.id.user
    const normalized = normalizePhone(phone)
    const entry: WhatsAppContact = {
      id: contact.id.user,
      name: contact.name ?? contact.pushname,
      phone: normalized ?? phone,
      serializedId: contact.id._serialized,
    }

    contactMap.set(phone, entry)
    if (normalized && normalized !== phone) {
      contactMap.set(normalized, entry)
    }
  }

  return contactMap
}

/**
 * Resolve a contact's profile picture URL via WhatsApp Web internals.
 *
 * client.getProfilePicUrl() uses an internal chat object which is null for
 * contacts without an open chat — the majority of an address book. Instead we
 * evaluate directly in the WhatsApp Web page using the internal
 * WAWebContactProfilePicThumbBridge, falling back through Contact → Chat → raw wid.
 *
 * Adapted from github.com/guyzyl/whatsapp-contact-sync
 */
async function resolveProfilePicUrl(
  client: ClientType,
  contactId: string
): Promise<string | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const page = (client as any).pupPage
  if (!page) return null

  // Pass as string to avoid TypeScript transpilation injecting __name helpers
  // into the browser evaluate context
  return page.evaluate(`(async () => {
    const cid = ${JSON.stringify(contactId)};
    const req = globalThis.require;
    const bridge = req("WAWebContactProfilePicThumbBridge");
    const collections = req("WAWebCollections");
    const wid = req("WAWebWidFactory").createWid(cid);

    async function attempt(target) {
      if (!target) return undefined;
      try {
        const pic = await bridge.requestProfilePicFromServer(target);
        return pic && pic.eurl ? pic.eurl : null;
      } catch (e) {
        if (e && e.name === "ServerStatusCodeError") return null;
        return undefined;
      }
    }

    let result = await attempt(collections.Contact.get(wid));
    if (result === undefined) result = await attempt(collections.Chat.get(wid));
    if (result === undefined) result = await attempt(wid);
    return result !== undefined ? result : null;
  })()`)
}

export async function downloadProfilePhoto(
  client: ClientType,
  contactId: string
): Promise<string | null> {
  try {
    debug("wa", `resolving profile pic for ${contactId}`)
    const url = await resolveProfilePicUrl(client, contactId)
    if (!url) {
      debug("wa", `no profile pic for ${contactId}`)
      return null
    }
    debug("wa", `downloading photo for ${contactId}`)
    const media = await MessageMedia.fromUrl(url)
    debug("wa", `downloaded ${media.data.length} chars base64`)
    return media.data
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    debug("wa", `download error for ${contactId}: ${msg}`)
    return null
  }
}

export async function destroyWhatsApp(): Promise<void> {
  if (whatsappStore.client) {
    try {
      await whatsappStore.client.destroy()
    } catch {
      // ignore cleanup errors
    }
    whatsappStore.client = null
  }
}
