param([int]$Port = 3000, [int]$DebugPort = 9223)

$url = "http://localhost:$Port"
$profileDir = Join-Path $env:LOCALAPPDATA 'Cinetech-dev-chrome'

# Wait for the dev server to accept connections (up to 2 minutes)
$ready = $false
for ($i = 0; $i -lt 120 -and -not $ready; $i++) {
    try {
        $c = New-Object System.Net.Sockets.TcpClient
        $c.Connect('127.0.0.1', $Port)
        $c.Close()
        $ready = $true
    } catch { Start-Sleep -Seconds 1 }
}
if (-not $ready) { exit 1 }

# Look for an existing localhost tab in the dev incognito Chrome
$tab = $null
try {
    $tab = Invoke-RestMethod "http://127.0.0.1:$DebugPort/json/list" -TimeoutSec 2 |
        Where-Object { $_.type -eq 'page' -and $_.url -like "$url*" } |
        Select-Object -First 1
} catch {}

if ($tab) {
    Invoke-WebRequest "http://127.0.0.1:$DebugPort/json/activate/$($tab.id)" -UseBasicParsing | Out-Null
    $ws = New-Object System.Net.WebSockets.ClientWebSocket
    $none = [Threading.CancellationToken]::None
    $ws.ConnectAsync([uri]$tab.webSocketDebuggerUrl, $none).Wait()
    $bytes = [Text.Encoding]::UTF8.GetBytes('{"id":1,"method":"Page.reload"}')
    $ws.SendAsync([ArraySegment[byte]]::new($bytes), 'Text', $true, $none).Wait()
    $ws.CloseAsync('NormalClosure', '', $none).Wait()
    exit 0
}

$chrome = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $chrome) { Write-Host 'Chrome not found'; exit 1 }

Start-Process $chrome -ArgumentList @(
    '--incognito',
    "--remote-debugging-port=$DebugPort",
    "--user-data-dir=$profileDir",
    '--no-first-run',
    $url
)
