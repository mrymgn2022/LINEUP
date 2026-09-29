# =============================================================================
# fix_ages_xlsx.ps1 — メンバーサイトマスターExcelの「年齢」列を補正する
#   なぜ必要か: Excelの年齢は記入時点で固定され、日々ズレる（サイトと同じ問題）。
#               AiScore突合のたびに「年齢だけ違う」ノイズが出るのを消す。
#   正の源泉  : ①J1系シート = そのシート自身の「生年月日」列(6)   ←最も確実
#               ②海外系シート = docs/index.html の BIRTH（Name|NAT → DOB）
#   シート構成: 20シート … 背番号|漢字名|ローマ字名|ポジション|年齢|生年月日|身長|利足|国籍|MV|DB|備考
#               36シート … 背番号|選手名(カナ)|選手名(ローマ字)|ポジション|年齢|身長|体重|国籍|備考
#               ※どちらも 3列目=ローマ字名 / 5列目=年齢 で共通
#   安全策    : 同名で異なるDOBの選手は触らない／DOB不明は据え置き／冪等
#   使い方    : powershell -File pipeline\scripts\fix_ages_xlsx.ps1 [-DryRun]
#   注意      : UTF-8 BOM必須(PS5.1)。Excelを開いたままだと保存できない。
# =============================================================================
param([switch]$DryRun)
$ErrorActionPreference='Stop'

$ROOT = 'G:\共有ドライブ\Alfaras（株）\football lineup【2】'
$XL   = Join-Path $ROOT '_internal\メンバーサイトマスター.xlsx'
$IDX  = Join-Path $ROOT 'docs\index.html'

# ---- 1) BIRTH を読む（ローマ字名 -> DOB。同名で食い違うものは除外） ----
$html = [IO.File]::ReadAllText($IDX, [Text.Encoding]::UTF8)
$dob = @{}; $ambig = @{}
foreach($m in [regex]::Matches($html, '"([^"\\]+)\|[A-Z]{3}[^"]*":"(\d{4}-\d{2}-\d{2})"')){
  $nm = $m.Groups[1].Value; $d = $m.Groups[2].Value
  if($dob.ContainsKey($nm)){ if($dob[$nm] -ne $d){ $ambig[$nm] = $true } }
  else { $dob[$nm] = $d }
}
Write-Output ("BIRTH索引: {0}名 (同名で曖昧={1}名は対象外)" -f $dob.Count, $ambig.Count)

$today = Get-Date
function AgeOf([string]$d){
  if($d -notmatch '^(\d{4})-(\d{2})-(\d{2})$'){ return $null }
  $b = Get-Date -Year ([int]$matches[1]) -Month ([int]$matches[2]) -Day ([int]$matches[3])
  $a = $today.Year - $b.Year
  if($today.Month -lt $b.Month -or ($today.Month -eq $b.Month -and $today.Day -lt $b.Day)){ $a-- }
  if($a -lt 0 -or $a -ge 120){ return $null }
  return $a
}

# ---- 2) Excel を開いて各シートを走査 ----
$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false; $excel.DisplayAlerts = $false
$fixed = 0; $log = @()
try{
  $wb = $excel.Workbooks.Open($XL)
  foreach($ws in $wb.Worksheets){
    $sheet = $ws.Name
    # ヘッダで年齢列(5)とローマ字名列(3)を確認。説明シート等は飛ばす
    $h3 = "$($ws.Cells.Item(1,3).Value2)"; $h5 = "$($ws.Cells.Item(1,5).Value2)"; $h6 = "$($ws.Cells.Item(1,6).Value2)"
    if($h5 -ne '年齢' -or $h3 -notlike '*ローマ字*'){ continue }
    $hasDOB = ($h6 -eq '生年月日')

    $last = $ws.UsedRange.Rows.Count
    for($r=2; $r -le $last; $r++){
      $name = "$($ws.Cells.Item($r,3).Value2)"
      if($name -eq ''){ continue }
      $cur  = "$($ws.Cells.Item($r,5).Value2)"

      $d = $null
      if($hasDOB){ $d = "$($ws.Cells.Item($r,6).Value2)" }          # J1系: シート自身のDOBが最優先
      if($d -notmatch '^\d{4}-\d{2}-\d{2}$'){
        if($ambig.ContainsKey($name)){ continue }                    # 同名は触らない
        if(-not $dob.ContainsKey($name)){ continue }                 # DOB不明は据え置き
        $d = $dob[$name]
      }
      $real = AgeOf $d
      if($null -eq $real){ continue }
      if($cur -ne "$real"){
        $log += ("{0}: {1}  {2}→{3}" -f $sheet, $name, $(if($cur -eq ''){'(空)'}else{$cur}), $real)
        if(-not $DryRun){ $ws.Cells.Item($r,5).Value2 = $real }
        $fixed++
      }
    }
  }
  if($DryRun){ $wb.Close($false) } else { $wb.Save(); $wb.Close($true) }
}
finally{
  $excel.Quit()
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) | Out-Null
}

Write-Output ""
Write-Output ("=== 補正{0} ===" -f $(if($DryRun){'(DRY RUN)'}else{''}))
$log | ForEach-Object { Write-Output ("  " + $_) }
Write-Output ""
Write-Output ("{0}件を補正{1}" -f $fixed, $(if($DryRun){' ※ドライラン（未書込）'}else{''}))
