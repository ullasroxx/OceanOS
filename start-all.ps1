# OceanOS Platform — Start All Services
# Run this script from the project root

$ROOT = $PSScriptRoot

Write-Host ""
Write-Host "  =========================================" -ForegroundColor Cyan
Write-Host "  OceanOS Platform — Starting All Services" -ForegroundColor Cyan
Write-Host "  =========================================" -ForegroundColor Cyan
Write-Host ""

# Start Backend (port 3001)
Write-Host "  [1/4] Starting Backend (port 3001)..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$ROOT\backend'; node server.js" -WindowStyle Minimized

Start-Sleep -Seconds 2

# Start Dashboard (port 3002)
Write-Host "  [2/4] Starting Dashboard (port 3002)..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$ROOT\dashboard'; npx -y serve -l 3002" -WindowStyle Minimized

# Start Fisherman App (port 3003)
Write-Host "  [3/4] Starting Fisherman App (port 3003)..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$ROOT\fisherman-app'; npx -y serve -l 3003" -WindowStyle Minimized

# Start Simulation (port 3004)
Write-Host "  [4/4] Starting Simulation (port 3004)..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$ROOT\simulation'; npx -y serve -l 3004" -WindowStyle Minimized

Start-Sleep -Seconds 3

Write-Host ""
Write-Host "  All services started!" -ForegroundColor Yellow
Write-Host ""
Write-Host "  Dashboard:     http://localhost:3002" -ForegroundColor White
Write-Host "  Fisherman App: http://localhost:3003" -ForegroundColor White
Write-Host "  Simulation:    http://localhost:3004" -ForegroundColor White
Write-Host "  Backend API:   http://localhost:3001" -ForegroundColor White
Write-Host ""
Write-Host "  Press any key to open Dashboard in browser..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
Start-Process "http://localhost:3002"
