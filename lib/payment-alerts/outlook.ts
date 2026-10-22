import { eq } from "drizzle-orm"
import { db } from "../db"
import { integrationTokens } from "../schema"
import type { AlertEmail } from "./parse"

const TOKEN_URL =
  "https://login.microsoftonline.com/consumers/oauth2/v2.0/token"
const SCOPE = "https://graph.microsoft.com/Mail.Read offline_access"
const TOKEN_NAME = "outlook_refresh_token"
// Not a secret: the public client registered for this app
const DEFAULT_CLIENT_ID = "2312b33c-bbaf-471b-b336-1a1d4da91e9f"
// Payment Alert senders; anything else in the inbox is never fetched
const ALERT_SENDER_DOMAINS = ["ocbc.com", "uobgroup.com", "trustbank.sg"]

export class OutlookAuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "OutlookAuthError"
  }
}

export type InboxEmail = AlertEmail & {
  id: string
  receivedAt: string
}

/**
 * A Graph access token from the stored refresh token. Microsoft may hand
 * back a new refresh token; it replaces the stored one.
 */
async function accessToken(): Promise<string> {
  const [row] = await db
    .select()
    .from(integrationTokens)
    .where(eq(integrationTokens.name, TOKEN_NAME))
  if (!row) throw new OutlookAuthError("Outlook is not signed in")

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: process.env.OUTLOOK_CLIENT_ID?.trim() || DEFAULT_CLIENT_ID,
      refresh_token: row.value,
      scope: SCOPE,
    }),
  })
  const token = (await res.json()) as {
    access_token?: string
    refresh_token?: string
    error?: string
  }
  if (!token.access_token) {
    throw new OutlookAuthError(
      `Outlook sign-in failed: ${token.error ?? res.status}`
    )
  }
  if (token.refresh_token && token.refresh_token !== row.value) {
    await db
      .update(integrationTokens)
      .set({ value: token.refresh_token, updated_at: new Date().toISOString() })
      .where(eq(integrationTokens.name, TOKEN_NAME))
  }
  return token.access_token
}

type GraphMessage = {
  id: string
  subject: string | null
  receivedDateTime: string
  from?: { emailAddress?: { address?: string } }
  body?: { content?: string }
}

function isAlertSender(address: string): boolean {
  const domain = address.toLowerCase().split("@")[1] ?? ""
  return ALERT_SENDER_DOMAINS.some(
    (d) => domain === d || domain.endsWith(`.${d}`)
  )
}

/** Bank emails received at or after `since`, oldest first. */
export async function fetchAlertEmails(since: Date): Promise<InboxEmail[]> {
  const token = await accessToken()
  const params = new URLSearchParams({
    $filter: `receivedDateTime ge ${since.toISOString()}`,
    $orderby: "receivedDateTime asc",
    $select: "id,subject,receivedDateTime,from,body",
    $top: "50",
  })
  let url: string | undefined =
    `https://graph.microsoft.com/v1.0/me/messages?${params}`
  const emails: InboxEmail[] = []

  while (url) {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Prefer: 'outlook.body-content-type="text"',
      },
    })
    if (!res.ok) throw new Error(`Outlook returned ${res.status}`)
    const page = (await res.json()) as {
      value: GraphMessage[]
      "@odata.nextLink"?: string
    }
    for (const message of page.value) {
      const from = message.from?.emailAddress?.address ?? ""
      if (!isAlertSender(from)) continue
      emails.push({
        id: message.id,
        receivedAt: message.receivedDateTime,
        from,
        subject: message.subject ?? "",
        body: message.body?.content ?? "",
      })
    }
    url = page["@odata.nextLink"]
  }
  return emails
}
