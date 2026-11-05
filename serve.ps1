# Chạy Aura Player (cần Node.js)
Set-Location $PSScriptRoot
$env:PORT = if ($env:PORT) { $env:PORT } else { '8765' }
node .\serve.js
