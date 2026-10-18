import type { Metadata } from "next"
import { Suspense } from "react"
import { OwedView } from "./OwedView"

export const metadata: Metadata = {
  title: "Owed · Finance Tracker",
}

export default function OwedPage() {
  // useSearchParams needs a Suspense boundary for static rendering
  return (
    <Suspense>
      <OwedView />
    </Suspense>
  )
}
