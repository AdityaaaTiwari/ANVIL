<#
.SYNOPSIS
  ANVIL GitHub Achievements PR Helper Script
.DESCRIPTION
  Creates lightweight documentation/chore branches with valid Co-authored-by
  commit trailers and pushes them to GitHub. Merging these PRs advances:
  - Pull Shark (Tier 1: 2 PRs, Tier 2: 16 PRs, Tier 3: 128 PRs)
  - Pair Extraordinaire (Tier 1: 1 PR, Tier 2: 10 PRs, Tier 3: 24 PRs)
  - YOLO (Merge without requesting code review)
#>

param(
  [int]$Count = 1,
  [string]$Remote = "origin",
  [string]$CoAuthorName = "github-actions[bot]",
  [string]$CoAuthorEmail = "41898282+github-actions[bot]@users.noreply.github.com"
)

$CurrentBranch = (git branch --show-current).Trim()
Write-Host "Current branch: $CurrentBranch" -ForegroundColor Cyan

for ($i = 1; $i -le $Count; $i++) {
  $BranchName = "achievement/pr-$((Get-Date).ToString('yyyyMMdd-HHmmss'))-$i"
  Write-Host "Creating $BranchName..." -ForegroundColor Yellow

  git checkout -b $BranchName main
  $Timestamp = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
  $NoteFile = "docs/achievement-log.md"

  Add-Content -Path $NoteFile -Value "- [$Timestamp] Automated contribution entry $i"
  git add $NoteFile

  $CommitMsg = "chore: automated contribution sync #$i`n`nCo-authored-by: $CoAuthorName <$CoAuthorEmail>"
  git commit -m $CommitMsg

  Write-Host "Pushing $BranchName to $Remote..." -ForegroundColor Green
  git push $Remote $BranchName

  Write-Host "Pushed $BranchName! Open a PR on GitHub and click 'Merge pull request' without review." -ForegroundColor Green
}

git checkout $CurrentBranch
Write-Host "Returned to $CurrentBranch. Done!" -ForegroundColor Cyan
