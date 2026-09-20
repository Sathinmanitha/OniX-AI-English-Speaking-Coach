Write-Host "OniX AI - Gemini setup"
npm install
if (-not (Test-Path ".env")) { Copy-Item ".env.example" ".env" }
Write-Host "Setup complete. Open .env and add GEMINI_API_KEY, then run npm run dev."
