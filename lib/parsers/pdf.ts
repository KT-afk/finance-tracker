import { execFile } from 'child_process'
import { writeFile, unlink } from 'fs/promises'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { tmpdir } from 'os'

/**
 * Extract text from a PDF buffer using pdftotext (poppler).
 * Uses -layout flag to preserve column alignment.
 */
export async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  const tmpPath = join(tmpdir(), `upload-${randomUUID()}.pdf`)

  try {
    await writeFile(tmpPath, buffer)

    const text = await new Promise<string>((resolve, reject) => {
      execFile('pdftotext', ['-layout', tmpPath, '-'], (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`pdftotext failed: ${stderr || error.message}`))
        } else {
          resolve(stdout)
        }
      })
    })

    return text
  } finally {
    await unlink(tmpPath).catch(() => {})
  }
}
