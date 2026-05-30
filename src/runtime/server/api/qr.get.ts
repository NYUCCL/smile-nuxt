// @ts-expect-error — qrcode-svg has no type declarations
import QRCode from 'qrcode-svg'
import { defineEventHandler, getQuery, getRequestURL, setResponseHeader } from 'h3'

export default defineEventHandler((event) => {
  const query = getQuery(event)

  // Use ?url= query param, fall back to request origin
  const requestUrl = getRequestURL(event)
  let targetUrl = (query.url as string) || requestUrl.origin

  // Strip trailing slash for cleaner QR
  targetUrl = targetUrl.replace(/\/$/, '')

  const qr = new QRCode({
    content: targetUrl,
    padding: 4,
    width: 256,
    height: 256,
    color: '#000000',
    background: '#ffffff',
    ecl: 'M',
  })

  setResponseHeader(event, 'Content-Type', 'image/svg+xml')
  setResponseHeader(event, 'Cache-Control', 'public, max-age=86400')
  return qr.svg()
})
