import type { MatchedContact, SyncMode, WhatsAppContact } from "../types.js"
import { matchCandidates, inferRegion } from "./phone.js"
import { listGoogleContacts, updateContactPhoto, googleStore } from "./google.js"
import { downloadProfilePhoto, whatsappStore } from "./whatsapp.js"
import { debug } from "./log.js"

export async function buildMatches(
  waStore: typeof whatsappStore,
  gStore: typeof googleStore
): Promise<MatchedContact[]> {
  if (!gStore.auth) throw new Error("Google not authenticated")

  const googleContacts = await listGoogleContacts(gStore.auth)
  const waContacts = waStore.contacts
  const matched: MatchedContact[] = []

  const ownNumber = waStore.client?.info?.wid?.user
  const region = inferRegion(ownNumber)
  debug("sync", `region: ${region ?? "unknown"}, WA: ${waContacts.size}, Google: ${googleContacts.length}`)

  for (const gc of googleContacts) {
    let waMatch: WhatsAppContact | undefined

    for (const phone of gc.phones) {
      const candidates = matchCandidates(phone, region)
      for (const candidate of candidates) {
        const found = waContacts.get(candidate)
        if (found) {
          waMatch = found
          break
        }
      }
      if (waMatch) break
    }

    if (!waMatch) continue

    matched.push({
      whatsapp: waMatch,
      google: gc,
      status: "pending",
      selected: false,
      error: undefined,
    })
  }

  return matched
}

export async function syncContacts(
  matches: MatchedContact[],
  mode: SyncMode,
  onProgress: (index: number, updated: MatchedContact) => void
): Promise<void> {
  if (!whatsappStore.client || !googleStore.auth) return

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i]

    if (mode === "missing" && match.google.hasPhoto) {
      onProgress(i, { ...match, status: "skipped" })
      continue
    }

    try {
      const photo = await downloadProfilePhoto(
        whatsappStore.client,
        match.whatsapp.serializedId
      )

      if (!photo) {
        onProgress(i, { ...match, status: "skipped" })
        continue
      }

      await updateContactPhoto(
        googleStore.auth,
        match.google.resourceName,
        photo
      )

      onProgress(i, { ...match, status: "synced" })
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Unknown error"
      onProgress(i, {
        ...match,
        status: "failed",
        error: errMsg,
      })
    }

    // Rate limit: ~60 req/min
    if (i < matches.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
  }
}
