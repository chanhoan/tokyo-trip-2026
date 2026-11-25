// Vercel Routing Middleware: runs before every request (pages, assets, API) and writes one line to the runtime logs.
export default function middleware(request) {
  const h = request.headers;
  const url = new URL(request.url);
  console.log('[REQ]', JSON.stringify({
    method: request.method,
    path: url.pathname + url.search,
    ip: h.get('x-forwarded-for') ?? h.get('x-real-ip'),
    country: h.get('x-vercel-ip-country'),
    city: decodeURIComponent(h.get('x-vercel-ip-city') ?? ''),
    ua: h.get('user-agent'),
  }));
  // Hand the request on, as @vercel/functions next() does; returning nothing left API calls empty under vercel dev.
  return new Response(null, { headers: { 'x-middleware-next': '1' } });
}
