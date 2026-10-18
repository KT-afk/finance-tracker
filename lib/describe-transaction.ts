/**
 * Display-only summary of a raw bank description: who the money went to or
 * came from (title) and what it was for (detail). Stored descriptions are
 * left untouched because transaction hashes are computed from them.
 */
export interface TransactionSummary {
  title: string
  detail?: string
}

// Statement text that PDF extraction sometimes appends to a description
const ARTIFACTS = [
  /\s*--\s*\d+\s+of\s+\d+\s*--.*$/i,
  /\s+[\d,]+\.\d{2}\s+BALANCE C\/F.*$/i,
  /\s+(?:LADY'S CARD|PREFERRED VISA)\s+\d{4}-\d{4}-.*$/i,
  /\s+WELCOME TO UOB\b.*$/i,
]

const GIRO_TYPES: Record<string, string> = {
  SALA: "Salary (GIRO)",
  COLL: "Bill (GIRO)",
  OTHR: "GIRO",
}

function clean(description: string): string {
  let d = description.replace(/\s+/g, " ").trim()
  for (const pattern of ARTIFACTS) d = d.replace(pattern, "")
  return d.trim()
}

// "OTHR", "Other", bare reference codes — nothing a person wrote
function isMeaningfulMemo(memo: string): boolean {
  const m = memo.trim()
  if (!m || /^(?:OTHR|OTHER)$/i.test(m)) return false
  if (/^[A-Za-z0-9:-]{8,}$/.test(m) && /\d/.test(m)) return false
  return true
}

// Drop trailing reference numbers / hex IDs from a name
function stripReferences(name: string): string {
  const words = name.split(" ")
  const firstRef = words.findIndex(
    (w, i) => i > 0 && /\d/.test(w) && w.length >= 6
  )
  return (firstRef === -1 ? words : words.slice(0, firstRef)).join(" ")
}

export function describeTransaction(description: string): TransactionSummary {
  const d = clean(description)

  // FAST PAYMENT / FUND TRANSFER / PAYMENT/TRANSFER … to|from NAME OTHR memo
  let m = d.match(
    /^(?:FAST PAYMENT|FUND TRANSFER|PAYMENT\/TRANSFER)\b(.*?)\b(to|from)\s+(.+?)(?:\s+OTHR\b\s*-?\s*(.*))?$/i
  )
  if (m) {
    const [, via, direction, name, memo = ""] = m
    const method = /PayNow/i.test(via) ? "PayNow" : "Transfer"
    const route = `${method} ${direction.toLowerCase()}`
    return {
      title: name.trim(),
      detail: isMeaningfulMemo(memo) ? `“${memo.trim()}” · ${route}` : route,
    }
  }

  m = d.match(/^NETS QR\s+\S+\s+NETS QR PURCHASE\s+(.+)$/i)
  if (m) return { title: m[1].trim(), detail: "NETS QR" }

  m = d.match(/^IBG GIRO\s+(SALA|COLL|OTHR)\s+(.+)$/i)
  if (m) {
    const name = stripReferences(m[2].replace(/^\d+\s+/, ""))
    return { title: name || m[2], detail: GIRO_TYPES[m[1].toUpperCase()] }
  }

  m = d.match(/^COLLECTION\/TRANSFER\s+(?:COLL|OTHR)\s+(.+)$/i)
  if (m) return { title: stripReferences(m[1]) || m[1], detail: "Collection" }

  return { title: d }
}
