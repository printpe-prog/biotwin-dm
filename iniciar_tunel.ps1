# iniciar_tunel.ps1 — Expone BioTwin-DM en una URL privada (Cloudflare Tunnel).
#
# Uso:
#   .\iniciar_tunel.ps1                  # genera una contraseña aleatoria
#   .\iniciar_tunel.ps1 -Pass "miClave"  # usa tu propia contraseña
#
# - El backend (FastAPI + simglucose + RL) sirve también el frontend en :8001.
# - Se exige usuario/contraseña (HTTP Basic Auth) → la URL es privada.
# - Nada de OhioT1DM se publica: solo / , /js y /css quedan accesibles.
# - Cierra esta ventana (Ctrl+C) para bajar el túnel y el servidor.

param([string]$Pass = "")

$ErrorActionPreference = "Stop"
$proj    = Split-Path -Parent $MyInvocation.MyCommand.Path   # carpeta de este script
$backend = Join-Path $proj "backend"
$python  = Join-Path $backend "venv\Scripts\python.exe"
$cf      = (Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\Cloudflare.cloudflared_*\cloudflared.exe" -ErrorAction SilentlyContinue | Select-Object -First 1).FullName
if (-not $cf) { $cf = (Get-Command cloudflared -ErrorAction SilentlyContinue).Source }
if (-not $cf) { Write-Host "ERROR: cloudflared no encontrado. Instala con: winget install Cloudflare.cloudflared"; exit 1 }

if (-not $Pass) {
  $Pass = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 14 | ForEach-Object { [char]$_ })
}

# Liberar el puerto 8001 si quedó algo corriendo
$old = (Get-NetTCPConnection -LocalPort 8001 -State Listen -ErrorAction SilentlyContinue).OwningProcess | Select-Object -Unique
foreach ($pid in $old) { Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue }

# Credenciales para el proceso del backend (las hereda uvicorn)
$env:BIOTWIN_USER = "biotwin"
$env:BIOTWIN_PASS = $Pass

# Arrancar el backend unificado (oculto)
$uvi = Start-Process -FilePath $python `
  -ArgumentList "-m", "uvicorn", "app.main:app", "--port", "8001" `
  -WorkingDirectory $backend -WindowStyle Hidden -PassThru
Start-Sleep -Seconds 5

Write-Host ""
Write-Host "==================== BioTwin-DM — Acceso privado ====================" -ForegroundColor Cyan
Write-Host "  Usuario:    biotwin"
Write-Host "  Contrasena: $Pass" -ForegroundColor Yellow
Write-Host "  (La URL https publica aparece abajo, generada por Cloudflare)"
Write-Host "  Deja esta ventana abierta. Ctrl+C para cerrar el acceso."
Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host ""

# Abrir el túnel (bloquea e imprime la URL trycloudflare.com)
& $cf tunnel --url http://localhost:8001

# Al cerrar cloudflared, bajar también el backend
if ($uvi -and -not $uvi.HasExited) { Stop-Process -Id $uvi.Id -Force -ErrorAction SilentlyContinue }
