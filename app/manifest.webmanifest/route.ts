import { NextResponse } from 'next/server'

export function GET() {
  return NextResponse.json({
    name: 'Finance Tracker',
    short_name: 'Finance',
    description: 'Personal finance tracker for SG bank accounts',
    start_url: '/',
    display: 'standalone',
    background_color: '#000000',
    theme_color: '#09090b',
    icons: [
      {
        src: '/window.svg',
        sizes: 'any',
        type: 'image/svg+xml',
      },
    ],
  })
}
