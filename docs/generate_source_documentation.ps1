$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Split-Path -Parent $PSScriptRoot)).Path
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$outFile = Join-Path $PSScriptRoot ("SOURCE_CODE_FULL_GENERATED-" + $timestamp + ".md")
$rootPrefix = ($repoRoot -replace "/", "\\").TrimEnd("\\")

$includeExt = @(
  ".py", ".js", ".jsx", ".ts", ".tsx", ".css", ".json", ".yml", ".yaml", ".md", ".txt"
)

$excludeDirPattern = "\\(node_modules|venv|\.venv|v|__pycache__|build|dist|seed|firestore_export)\\"
$excludeFilePattern = "(serviceAccountKey|get-pip\.py|\.min\.)"

$explicitFiles = @(
  "Dockerfile",
  "docker-compose.yml",
  "docker-compose.override.yml",
  "apphosting.yaml",
  "firebase.json",
  "policy.yaml",
  "requirements.txt",
  "package.json"
)

function To-RelativePath([string]$fullPath) {
  $normalized = $fullPath.Replace("/", "\\")
  if ($normalized.StartsWith($rootPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    return $normalized.Substring($rootPrefix.Length).TrimStart("\\")
  }
  return $normalized
}

$targets = @("backend", "frontend\\src", "functions", "config")
$all = @()

foreach ($target in $targets) {
  $targetPath = Join-Path $repoRoot $target
  if (-not (Test-Path $targetPath)) {
    continue
  }

  $collected = Get-ChildItem -Path $targetPath -Recurse -File | Where-Object {
    $full = $_.FullName.Replace("/", "\\")
    ($full -notmatch $excludeDirPattern) -and
    ($_.Name -notmatch $excludeFilePattern) -and
    ($includeExt -contains $_.Extension.ToLower())
  }

  $all += $collected
}

foreach ($rootFile in $explicitFiles) {
  $candidate = Join-Path $repoRoot $rootFile
  if (Test-Path $candidate) {
    $all += Get-Item $candidate
  }
}

$all = $all | Sort-Object FullName -Unique

$header = @(
  "# BIS Complete Source Code Reference",
  "",
  "Generated on: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')",
  "",
  "This document is auto-generated from project source files.",
  ""
)

Set-Content -Path $outFile -Value $header -Encoding UTF8

foreach ($file in $all) {
  $rel = To-RelativePath -fullPath $file.FullName
  $lang = "text"

  switch ($file.Extension.ToLower()) {
    ".py" { $lang = "python" }
    ".js" { $lang = "javascript" }
    ".jsx" { $lang = "javascript" }
    ".ts" { $lang = "typescript" }
    ".tsx" { $lang = "tsx" }
    ".css" { $lang = "css" }
    ".json" { $lang = "json" }
    ".yml" { $lang = "yaml" }
    ".yaml" { $lang = "yaml" }
    ".md" { $lang = "markdown" }
    default { $lang = "text" }
  }

  Add-Content -Path $outFile -Value "## $rel"
  Add-Content -Path $outFile -Value ""
  Add-Content -Path $outFile -Value ('```' + $lang)

  try {
    Get-Content -Path $file.FullName -Raw -Encoding UTF8 | Add-Content -Path $outFile
  }
  catch {
    Add-Content -Path $outFile -Value "<failed to read file: $($_.Exception.Message)>"
  }

  Add-Content -Path $outFile -Value '```'
  Add-Content -Path $outFile -Value ""
}

Write-Host "Generated: $outFile"
Write-Host "Files included: $($all.Count)"
