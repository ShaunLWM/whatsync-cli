import { google } from "googleapis"
import type { Auth } from "googleapis"
import { saveGoogleTokens } from "./config.js"
import type { GoogleContact } from "../types.js"
import { debug } from "./log.js"

const SCOPES = ["https://www.googleapis.com/auth/contacts"]

export const googleStore: {
  auth: Auth.OAuth2Client | null
} = {
  auth: null,
}

export function createOAuthClient(
  clientId: string,
  clientSecret: string,
  redirectUri?: string
): Auth.OAuth2Client {
  debug("google", "creating OAuth client")
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri)
}

export function generateAuthUrl(
  client: Auth.OAuth2Client,
  redirectUri: string
): string {
  debug("google", `generating auth URL with redirect: ${redirectUri}`)
  return client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
    redirect_uri: redirectUri,
  })
}

export async function exchangeCode(
  client: Auth.OAuth2Client,
  code: string,
  redirectUri: string
): Promise<void> {
  debug("google", "exchanging code for tokens")
  const { tokens } = await client.getToken({ code, redirect_uri: redirectUri })
  client.setCredentials(tokens)

  if (tokens.refresh_token) {
    await saveGoogleTokens({
      accessToken: tokens.access_token ?? "",
      refreshToken: tokens.refresh_token,
      expiryDate: tokens.expiry_date ?? 0,
    })
    debug("google", "tokens saved")
  }
}

export async function refreshAccessToken(
  client: Auth.OAuth2Client
): Promise<void> {
  debug("google", "refreshing access token")
  const { credentials } = await client.refreshAccessToken()
  client.setCredentials(credentials)

  if (credentials.refresh_token) {
    await saveGoogleTokens({
      accessToken: credentials.access_token ?? "",
      refreshToken: credentials.refresh_token,
      expiryDate: credentials.expiry_date ?? 0,
    })
  }
}

async function getAccessToken(client: Auth.OAuth2Client): Promise<string> {
  const { token } = await client.getAccessToken()
  if (!token) throw new Error("No access token available")
  return token
}

export async function listGoogleContacts(
  client: Auth.OAuth2Client
): Promise<GoogleContact[]> {
  const token = await getAccessToken(client)
  const contacts: GoogleContact[] = []
  let nextPageToken: string | undefined
  let page = 0

  do {
    page++
    debug("google", `fetching page ${page}`)
    const params = new URLSearchParams({
      pageSize: "250",
      personFields: "names,phoneNumbers,photos",
    })
    if (nextPageToken) params.set("pageToken", nextPageToken)

    const res = await fetch(
      `https://people.googleapis.com/v1/people/me/connections?${params}`,
      { headers: { Authorization: `Bearer ${token}` } }
    )

    if (!res.ok) {
      const body = await res.text()
      throw new Error(`People API error ${res.status}: ${body}`)
    }

    const data = await res.json()
    const connections = data.connections ?? []
    debug("google", `page ${page}: ${connections.length} connections`)

    for (const person of connections) {
      if (!person.phoneNumbers?.length) continue

      const phones = person.phoneNumbers
        .map((p: { canonicalForm?: string; value?: string }) => p.canonicalForm ?? p.value ?? "")
        .filter(Boolean)

      const hasPhoto = person.photos
        ? person.photos.some((p: { default?: boolean }) => !p.default)
        : false

      const name = person.names?.[0]?.displayName ?? undefined

      contacts.push({
        resourceName: person.resourceName ?? "",
        name,
        phones,
        hasPhoto,
      })
    }

    nextPageToken = data.nextPageToken ?? undefined
  } while (nextPageToken)

  return contacts
}

export async function updateContactPhoto(
  client: Auth.OAuth2Client,
  resourceName: string,
  photoBase64: string
): Promise<void> {
  debug("google", `updating photo for ${resourceName}`)
  const token = await getAccessToken(client)
  const res = await fetch(
    `https://people.googleapis.com/v1/${resourceName}:updateContactPhoto`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ photoBytes: photoBase64 }),
    }
  )

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Update photo error ${res.status}: ${body}`)
  }
}
