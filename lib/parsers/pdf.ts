import { execFile } from "child_process"
import { writeFile, unlink } from "fs/promises"
import { existsSync } from "fs"
import { join } from "path"
import { randomUUID } from "crypto"
import { tmpdir } from "os"

function pdftotextCandidates(): string[] {
  return [
    process.env.PDFTOTEXT_BIN,
    "pdftotext",
    "/opt/homebrew/bin/pdftotext",
    "/opt/homebrew/opt/poppler/bin/pdftotext",
    "/usr/local/bin/pdftotext",
  ].filter((candidate): candidate is string => Boolean(candidate))
}

async function runPdftotext(tmpPath: string): Promise<string> {
  const errors: string[] = []

  for (const bin of pdftotextCandidates()) {
    if (bin.includes("/") && !existsSync(bin)) continue

    try {
      return await new Promise<string>((resolve, reject) => {
        execFile(bin, ["-layout", tmpPath, "-"], (error, stdout, stderr) => {
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

  throw new Error(
    `pdftotext failed. Tried: ${errors.join("; ") || "no candidates"}`
  )
}

async function extractTextWithPdfParse(buffer: Buffer): Promise<string> {
  await import("pdf-parse/worker")
  const { PDFParse } = await import("pdf-parse")
  const parser = new PDFParse({ data: buffer })

  try {
    const result = await parser.getText()
    return result.text
  } finally {
    await parser.destroy()
  }
}

/**
 * Extract text from a PDF buffer. Uses pdf-parse (pure JS, runs on Vercel);
 * falls back to pdftotext -layout (poppler) only if pdf-parse fails.
 */
export async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  const tmpPath = join(tmpdir(), `upload-${randomUUID()}.pdf`)

  // pdf-parse first so local and Vercel (no pdftotext binary) parse the same
  // text; pdftotext is only a fallback if pdf-parse can't read the file.
  try {
    return await extractTextWithPdfParse(buffer)
  } catch (pdfParseError) {
    try {
      await writeFile(tmpPath, buffer)
      return await runPdftotext(tmpPath)
    } catch (pdftotextError) {
      const pdfParseMessage =
        pdfParseError instanceof Error
          ? pdfParseError.message
          : String(pdfParseError)
      const pdftotextMessage =
        pdftotextError instanceof Error
          ? pdftotextError.message
          : String(pdftotextError)
      throw new Error(
        `pdf-parse failed: ${pdfParseMessage}; ${pdftotextMessage}`
      )
    }
  } finally {
    await unlink(tmpPath).catch(() => {})
  }
}
