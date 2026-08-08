$project=2
$owner="heidary100"

$issues=1..16


foreach($issue in $issues){

$url="https://github.com/$owner/sabz-system/issues/$issue"


gh project item-add `
$project `
--owner $owner `
--url $url


Write-Host "Added issue #$issue"

}