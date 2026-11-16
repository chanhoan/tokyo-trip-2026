// Hands the browser its Google Maps key. Browser keys are public by design;
// protect it with HTTP-referrer + API restrictions in Google Cloud Console.
export default function handler(req, res) {
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.status(200).json({ mapsKey: process.env.GOOGLE_MAPS_BROWSER_KEY ?? '' });
}
