import { NextResponse } from 'next/server'
import { AUTH_COOKIE_NAME, useSecureCookies } from '@/lib/auth'

export async function POST() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set({
    name: AUTH_COOKIE_NAME,
    value: '',
    httpOnly: true,
    secure: useSecureCookies(),
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
  return res
}
