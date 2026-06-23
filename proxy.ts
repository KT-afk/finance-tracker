import { NextRequest, NextResponse } from 'next/server'
import {
  AUTH_COOKIE_NAME,
  getAppPassword,
  requiresAppPassword,
  verifySessionToken,
} from './lib/auth'

const PUBLIC_PATHS = [
  '/login',
  '/api/login',
  '/api/logout',
  '/favicon.ico',
  '/manifest.webmanifest',
]

function isPublicPath(pathname: string): boolean {
  return (
    PUBLIC_PATHS.includes(pathname) ||
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/static/')
  )
}

export async function proxy(req: NextRequest) {
  const password = getAppPassword()
  if (isPublicPath(req.nextUrl.pathname)) {
    return NextResponse.next()
  }

  if (!password) {
    if (requiresAppPassword()) {
      return NextResponse.json(
        { error: 'APP_PASSWORD is required for hosted deployments' },
        { status: 503 }
      )
    }
    return NextResponse.next()
  }

  const token = req.cookies.get(AUTH_COOKIE_NAME)?.value
  if (await verifySessionToken(token, password)) {
    return NextResponse.next()
  }

  if (req.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  const loginUrl = new URL('/login', req.url)
  loginUrl.searchParams.set('next', req.nextUrl.pathname + req.nextUrl.search)
  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: ['/((?!_next/image|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico)$).*)'],
}
