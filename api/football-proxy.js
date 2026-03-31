// Vercel serverless function — proxies football-data.org so the API key
// stays server-side and CORS is never an issue in production.
//
// Route: /football-api/* → /api/football-proxy?path=*  (via vercel.json rewrite)

export default async function handler(req, res) {
  const { path, ...rest } = req.query

  // path is an array like ['competitions','WC','matches'] from the wildcard capture
  const apiPath = Array.isArray(path) ? path.join('/') : (path || '')

  // Pass through any other query params (e.g. ?season=2026)
  const qs = Object.keys(rest).length
    ? '?' + new URLSearchParams(rest).toString()
    : ''

  const url = `https://api.football-data.org/v4/${apiPath}${qs}`

  try {
    const upstream = await fetch(url, {
      headers: { 'X-Auth-Token': process.env.VITE_FOOTBALL_DATA_API_KEY || '' },
    })
    const data = await upstream.json()
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=30')
    res.status(upstream.status).json(data)
  } catch (err) {
    res.status(502).json({ error: 'Proxy error', detail: err.message })
  }
}
