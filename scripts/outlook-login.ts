/**
 * One-time Outlook sign-in for reading Payment Alert emails.
 * Prints a refresh token to put in Vercel as OUTLOOK_REFRESH_TOKEN.
 * Never paste the token anywhere else or commit it.
 *
 * Usage:
 *   OUTLOOK_CLIENT_ID=... npm run outlook:login
 */

const AUTHORITY = "https://login.microsoftonline.com/consumers/oauth2/v2.0"
const SCOPE = "https://graph.microsoft.com/Mail.Read offline_access"

type DeviceCode = {
  device_code: string
  user_code: string
  verification_uri: string
  interval: number
  expires_in: number
  message: string
}

type TokenResponse = {
  refresh_token?: string
  error?: string
  error_description?: string
}

async function post<T>(url: string, form: Record<string, string>): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form),
  })
  return (await res.json()) as T
}

async function main() {
  const clientId = process.env.OUTLOOK_CLIENT_ID?.trim()
  if (!clientId) throw new Error("OUTLOOK_CLIENT_ID is required")

  const code = await post<DeviceCode>(`${AUTHORITY}/devicecode`, {
    client_id: clientId,
    scope: SCOPE,
  })
  if (!code.device_code) throw new Error(JSON.stringify(code))
  console.log(code.message)

  const deadline = Date.now() + code.expires_in * 1000
  let interval = code.interval * 1000
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, interval))
    const token = await post<TokenResponse>(`${AUTHORITY}/token`, {
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      client_id: clientId,
      device_code: code.device_code,
    })
    if (token.refresh_token) {
      console.log("\nSigned in. Put this in Vercel as OUTLOOK_REFRESH_TOKEN:\n")
      console.log(token.refresh_token)
      return
    }
    if (token.error === "slow_down") interval += 5000
    else if (token.error !== "authorization_pending") {
      throw new Error(token.error_description ?? token.error)
    }
  }
  throw new Error("Sign-in timed out. Run it again.")
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
