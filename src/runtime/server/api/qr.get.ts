// @ts-expect-error — qrcode-svg has no type declarations
import QRCode from 'qrcode-svg'
import { createError, defineEventHandler, getQuery, getRequestURL, setResponseHeader } from 'h3'

// The QR library throws when the content does not fit in a code; a link to a
// study is far shorter than this.
const MAX_URL_LENGTH = 2000

export default defineEventHandler((event) => {
  const query = getQuery(event)

  // Use ?url= query param, fall back to request origin
  const requestUrl = getRequestURL(event)
  // A repeated ?url= arrives as an array
  if (query.url !== undefined && typeof query.url !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'url must be given once' })
  }
  let targetUrl = query.url || requestUrl.origin
  if (targetUrl.length > MAX_URL_LENGTH) {
    throw createError({ statusCode: 400, statusMessage: `url is longer than ${MAX_URL_LENGTH} characters` })
  }

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
