export type SyncMode = "all" | "missing"

export type ContactStatus = "pending" | "synced" | "skipped" | "failed"

export type WhatsAppContact = {
  id: string
  name: string | undefined
  phone: string
  serializedId: string
}

export type GoogleContact = {
  resourceName: string
  name: string | undefined
  phones: string[]
  hasPhoto: boolean
}

export type MatchedContact = {
  whatsapp: WhatsAppContact
  google: GoogleContact
  status: ContactStatus
  selected: boolean
  error: string | undefined
}

export type SyncResult = {
  synced: number
  skipped: number
  failed: number
  total: number
}

export type AppConfig = {
  googleClientId: string
  googleClientSecret: string
}

export type GoogleTokens = {
  accessToken: string
  refreshToken: string
  expiryDate: number
}
