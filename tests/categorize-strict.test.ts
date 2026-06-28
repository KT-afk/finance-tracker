import assert from 'node:assert/strict'
import { categorize } from '../lib/categorize'

async function main() {
  const previousKey = process.env.ANTHROPIC_API_KEY
  delete process.env.ANTHROPIC_API_KEY

  try {
    await assert.rejects(
      () => categorize('NETS QR PURCHASE PU TIAN', { requireAi: true }),
      /ANTHROPIC_API_KEY is not configured/
    )
  } finally {
    if (previousKey === undefined) {
      delete process.env.ANTHROPIC_API_KEY
    } else {
      process.env.ANTHROPIC_API_KEY = previousKey
    }
  }

  console.log('strict categorization test passed')
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
