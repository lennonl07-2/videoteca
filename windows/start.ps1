$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
try {
  $existing = Invoke-RestMethod 'http://localhost:4317/api/status' -TimeoutSec 2
  if ($existing.sources) { Start-Process 'http://localhost:4317'; exit 0 }
} catch {}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Instala Node.js 22 o superior y vuelve a abrir este archivo: https://nodejs.org/' }
$major = [int]((& node -p 'process.versions.node.split(/[.]/)[0]') | Select-Object -First 1)
if ($major -lt 22) { throw 'Se necesita Node.js 22 o superior.' }
if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) { throw 'Instala FFmpeg y agregalo a PATH. Puedes usar: winget install --id Gyan.FFmpeg --exact. Despues vuelve a abrir este archivo.' }
# Use a Windows environment distinct from the macOS .venv folder.
if (-not (Test-Path '.venv-win\Scripts\python.exe')) {
  if (Get-Command py -ErrorAction SilentlyContinue) { & py -3 -m venv .venv-win }
  elseif (Get-Command python -ErrorAction SilentlyContinue) { & python -m venv .venv-win }
  else { throw 'Instala Python 3 desde https://www.python.org/downloads/windows/ y habilita Add Python to PATH.' }
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo crear el entorno de Python.' }
}
if (-not (Test-Path '.venv-win\Scripts\yt-dlp.exe')) {
  & '.\.venv-win\Scripts\python.exe' -m pip install 'yt-dlp[default]'
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo instalar yt-dlp. Revisa tu conexion.' }
}
if (-not (Test-Path 'node_modules\hls.js') -or -not (Test-Path 'node_modules\megajs')) {
  & npm.cmd ci
  if ($LASTEXITCODE -ne 0) { throw 'No se pudieron instalar las dependencias.' }
}
$env:YTDLP_PATH = Join-Path (Get-Location) '.venv-win\Scripts\yt-dlp.exe'
$nodePath = (Get-Command node).Source
$serverProcess = Start-Process -FilePath $nodePath -ArgumentList 'server.mjs' -WorkingDirectory (Get-Location).Path -NoNewWindow -PassThru
try {
  $ready = $false
  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    if ($serverProcess.HasExited) { throw 'El servidor no pudo iniciarse.' }
    try { $status = Invoke-RestMethod 'http://localhost:4317/api/status' -TimeoutSec 1; if ($status.sources) { $ready = $true; break } } catch {}
    Start-Sleep -Milliseconds 300
  }
  if (-not $ready) { throw 'El servidor no respondio.' }
  Start-Process 'http://localhost:4317'
  Write-Host 'Videoteca abierta. Deja esta ventana abierta mientras la usas. Ctrl+C para cerrar.'
  $serverProcess.WaitForExit()
} finally { if (-not $serverProcess.HasExited) { Stop-Process -Id $serverProcess.Id } }
