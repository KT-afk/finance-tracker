/** The webhook rejects requests without Telegram's secret token. */
import assert from "node:assert/strict"

async function main() {
  process.env.TELEGRAM_WEBHOOK_SECRET = "s3cret"
  const { isTelegramRequest } = await import("../app/api/telegram/route")
  const request = (token?: string) =>
    new Request("http://localhost/api/telegram", {
      method: "POST",
      headers: token ? { "x-telegram-bot-api-secret-token": token } : {},
    })
  assert.equal(isTelegramRequest(request("s3cret")), true)
  assert.equal(isTelegramRequest(request("wrong")), false)
  assert.equal(isTelegramRequest(request()), false)
  // Same string length, different byte length: rejected, not thrown
  assert.equal(isTelegramRequest(request("s3crét")), false)

  const { splitMessage } = await import("../lib/telegram")
  assert.deepEqual(splitMessage("short"), ["short"])
  assert.deepEqual(splitMessage("aaaa\nbbbb\ncc", 9), ["aaaa\nbbbb", "cc"])
  assert.deepEqual(splitMessage("abcdefghij", 4), ["abcd", "efgh", "ij"])
  assert.ok(splitMessage("x".repeat(9000)).every((part) => part.length <= 4096))
  delete process.env.TELEGRAM_WEBHOOK_SECRET
  assert.equal(
    isTelegramRequest(request("")),
    false,
    "no secret configured means nothing is accepted"
  )
  console.log("telegram-webhook: passed")
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
