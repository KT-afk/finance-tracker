import { execFile } from 'child_process'
import { writeFile, unlink } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { tmpdir } from 'os'

function pdftotextCandidates(): string[] {
  return [
    process.env.PDFTOTEXT_BIN,
    'pdftotext',
    '/opt/homebrew/bin/pdftotext',
    '/opt/homebrew/opt/poppler/bin/pdftotext',
    '/usr/local/bin/pdftotext',
  ].filter((candidate): candidate is string => Boolean(candidate))
}

async function runPdftotext(tmpPath: string): Promise<string> {
  const errors: string[] = []

  for (const bin of pdftotextCandidates()) {
    if (bin.includes('/') && !existsSync(bin)) continue

    try {
      return await new Promise<string>((resolve, reject) => {
        execFile(bin, ['-layout', tmpPath, '-'], (error, stdout, stderr) => {
          if (error) {
            reject(new Error(stderr || error.message))
          } else {
            resolve(stdout)
          }
        })
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      errors.push(`${bin}: ${message}`)
    }
  }

  throw new Error(`pdftotext failed. Tried: ${errors.join('; ') || 'no candidates'}`)
}

/**
 * Extract text from a PDF buffer using pdftotext (poppler).
 * Uses -layout flag to preserve column alignment.
 */
export async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  const tmpPath = join(tmpdir(), `upload-${randomUUID()}.pdf`)

  try {
    await writeFile(tmpPath, buffer)
    return await runPdftotext(tmpPath)
  } finally {
    await unlink(tmpPath).catch(() => {})
  }
}
