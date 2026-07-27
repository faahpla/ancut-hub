# AnCut HUB — aplicador de atualizacao (roda ELEVADO).
#
# Chamado pelo run-update.ps1 que o app gera, ja com os parametros embutidos.
# Copia o payload ja baixado e conferido por cima da instalacao.
#
#   1) espera o app e o motor Python saírem
#   2) robocopy do payload por cima da pasta instalada
#   3) relanca o app
#
# Params:
#   -Source   pasta com o conteudo extraido (espelha a raiz da instalacao)
#   -Install  pasta instalada (normalmente C:\Program Files\AnCut HUB)
#   -Exe      executavel a relancar

param(
    [Parameter(Mandatory = $true)][string]$Source,
    [Parameter(Mandatory = $true)][string]$Install,
    [string]$Exe = 'AnCut HUB.exe',
    [switch]$NoRelaunch
)

$ErrorActionPreference = 'Continue'

$logDir = Join-Path $env:LOCALAPPDATA 'AnCut HUB\logs'
New-Item -ItemType Directory -Path $logDir -Force -ErrorAction SilentlyContinue | Out-Null
$log = Join-Path $logDir 'apply-update.log'
"[$(Get-Date -Format s)] aplicando de '$Source' para '$Install'" | Out-File $log -Append -Encoding utf8

# 1) Esperar os processos sairem. O motor Python conta: durante uma analise ele
# segura CorteCenas.exe aberto, e o robocopy nao sobrescreve arquivo em uso.
$names = @([System.IO.Path]::GetFileNameWithoutExtension($Exe), 'CorteCenas')
$waited = 0
while ($waited -lt 20) {
    $alive = $names | ForEach-Object { Get-Process -Name $_ -ErrorAction SilentlyContinue }
    if (-not $alive) { break }
    Start-Sleep -Seconds 1
    $waited++
}
foreach ($n in $names) {
    Get-Process -Name $n -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
}
Start-Sleep -Milliseconds 700

# 2) Copiar. /E mescla e preserva o que nao veio no delta — os ~5 GB de
# torch/CUDA/Chromium ficam intactos, so o que mudou e sobrescrito.
robocopy $Source $Install /E /R:3 /W:1 /NP /NDL /LOG+:$log | Out-Null

# Robocopy usa 0-7 para sucesso (0 = nada mudou, 1 = copiou, ...). 8+ e falha.
if ($LASTEXITCODE -ge 8) {
    "[$(Get-Date -Format s)] FALHOU com codigo $LASTEXITCODE" | Out-File $log -Append -Encoding utf8
    exit 1
}
"[$(Get-Date -Format s)] ok (robocopy $LASTEXITCODE)" | Out-File $log -Append -Encoding utf8

# 3) Relancar via explorer.exe DE PROPOSITO: este script roda elevado, e um
# Start-Process direto passaria a elevacao adiante. App elevado = o Windows
# bloqueia arrastar-e-soltar vindo do Explorer (UIPI), e o AnCut vive de
# arrastar episodio pra dentro. Pelo explorer.exe ele nasce sem elevacao.
if (-not $NoRelaunch) {
    $exePath = Join-Path $Install $Exe
    if (Test-Path $exePath) {
        Start-Process -FilePath 'explorer.exe' -ArgumentList "`"$exePath`""
    }
}

exit 0
