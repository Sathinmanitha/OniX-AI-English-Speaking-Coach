@echo off
echo ==========================================
echo   OniX AI - Gemini setup
echo ==========================================
call npm install
if not exist .env copy .env.example .env
echo.
echo Setup complete.
echo Open .env and add your GEMINI_API_KEY.
echo Then run: npm run dev
pause
