$repo="heidary100/sabz-system"

$parentIssue=1

$children=@(
7,
8,
9,
10,
11,
12,
13,
14,
15,
16
)


foreach($child in $children){

    gh api `
    --method POST `
    repos/$repo/issues/$parentIssue/sub_issues `
    -f issue_id=$child

    Write-Host "Linked issue #$child to EPIC-001"

}