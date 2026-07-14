Add-Type -AssemblyName System.IO.Compression.FileSystem

function Get-WorksheetRows {
  param([string]$Path)

  $zip = [System.IO.Compression.ZipFile]::OpenRead($Path)
  try {
    $sharedStrings = @()
    $sharedEntry = $zip.Entries | Where-Object { $_.FullName -eq 'xl/sharedStrings.xml' }
    if ($sharedEntry) {
      $reader = New-Object System.IO.StreamReader($sharedEntry.Open())
      [xml]$sharedXml = $reader.ReadToEnd()
      $reader.Dispose()
      foreach ($si in $sharedXml.sst.si) {
        $parts = @()
        if ($si.t) { $parts += $si.t.'#text' }
        elseif ($si.r) {
          foreach ($run in $si.r) {
            if ($run.t) { $parts += $run.t.'#text' }
          }
        }
        $sharedStrings += ($parts -join '')
      }
    }

    $sheetEntry = $zip.Entries | Where-Object { $_.FullName -eq 'xl/worksheets/sheet1.xml' }
    if (-not $sheetEntry) { return @() }

    $reader = New-Object System.IO.StreamReader($sheetEntry.Open())
    [xml]$sheetXml = $reader.ReadToEnd()
    $reader.Dispose()

    $rows = @()
    foreach ($row in $sheetXml.worksheet.sheetData.row) {
      $vals = @()
      foreach ($c in $row.c) {
        $cellType = $c.GetAttribute('t')
        $value = ''
        if ($c.v) { $value = [string]$c.v.'#text' }
        if ($cellType -eq 's' -and $value -ne '') {
          $value = $sharedStrings[[int]$value]
        }
        $vals += $value
      }
      $rows += ,$vals
    }
    return $rows
  }
  finally {
    $zip.Dispose()
  }
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$files = Get-ChildItem "$scriptDir\*.xlsx" | Sort-Object Name
foreach ($file in $files) {
  Write-Host "=== $($file.Name) ==="
  $rows = Get-WorksheetRows -Path $file.FullName
  foreach ($row in $rows | Select-Object -First 15) {
    Write-Host ($row -join ' | ')
  }
  Write-Host "rows: $($rows.Count)"
  Write-Host ''
}
