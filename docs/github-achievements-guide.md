# GitHub Profile Achievements & Badges Master Guide

This guide provides the exact criteria, mechanics, and step-by-step instructions to earn and level up all official **GitHub Profile Achievements** (as displayed on your GitHub profile sidebar under "Achievements").

---

## Achievement Badges Catalog & Criteria

| Badge | Name | How It Is Triggered | Tiers & Levels |
|---|---|---|---|
| 🦈 | **Pull Shark** | Merge Pull Requests on GitHub into the default branch. | **Bronze (x1):** 2 merged PRs<br>**Silver (x2/x3):** 16 merged PRs<br>**Gold (x4):** 128 merged PRs |
| 🚀 | **YOLO** | Merge a Pull Request without requesting or waiting for code review. | **Single Tier** (Instantly awarded on first merge without review) |
| 🤠 | **Quickdraw** | Close an Issue or Pull Request within 5 minutes of opening it. | **Single Tier** (Close within 5 mins of creation) |
| 🫛 | **Pair Extraordinaire** | Co-author a commit in a merged Pull Request (`Co-authored-by:` trailer in commit message). | **Bronze (x1):** 1 merged co-authored PR<br>**Silver (x2):** 10 merged PRs<br>**Gold (x3):** 24 merged PRs |
| 🧠 | **Galaxy Brain** | Have your answer marked as the accepted answer in GitHub Discussions. | **Bronze (x1):** 2 accepted answers<br>**Silver (x2/x3):** 8 accepted answers<br>**Gold (x4):** 16 accepted answers |
| 🤩 | **Starstruck** | Maintain a repository that reaches a certain number of GitHub Stars. | **Bronze (x1):** 16 stars<br>**Silver (x2):** 128 stars<br>**Gold (x3):** 512 stars |
| 💖 | **Public Sponsor** | Sponsor an open source contributor via GitHub Sponsors. | **Single Tier** |

---

## Fast 5-Minute Execution Plan

### Step 1: Unlock 🦈 Pull Shark + 🚀 YOLO + 🫛 Pair Extraordinaire (All in 1 PR!)
When you merge this PR (`feat/badges-and-achievements-pipeline`) directly into `main` without review:
1. Because the commit includes the `Co-authored-by:` git trailer, GitHub immediately awards **Pair Extraordinaire** 🫛!
2. Because you merge the Pull Request without code review, GitHub immediately awards **YOLO** 🚀!
3. Because a Pull Request is merged into `main`, GitHub awards or increments **Pull Shark** 🦈!

### Step 2: Unlock 🤠 Quickdraw (Takes 30 Seconds)
1. Go to your repository on GitHub: `https://github.com/anvil-workbench/ANVIL/issues/new` (or on your personal profile repository).
2. Title: `Test quick verification`.
3. Click **Submit new issue**.
4. Within 1 minute, click **Close issue** (or Close as completed).
5. Refresh your GitHub profile — **Quickdraw** 🤠 is unlocked!

### Step 3: Unlock 🧠 Galaxy Brain (Takes 3 Minutes)
1. In your repository (e.g. `ANVIL` or your personal repository), go to **Settings** -> **Features** -> Check **Discussions**.
2. Click the **Discussions** tab at the top.
3. Click **New discussion** -> Select category **Q&A**.
4. Title: `How does ANVIL deterministic verification work?`.
5. Post an answer to the discussion explaining it.
6. Click the **Mark as answer** (green checkmark) button on the reply.
7. Repeat 2 times for Bronze (x1), 8 times for Silver (x2/x3), or 16 times for Gold (x4)!

### Step 4: Unlock 🤩 Starstruck (16+ Stars)
Share ANVIL with developer friends, post on LinkedIn/Twitter/Reddit, or link it in developer groups. As soon as the repository hits 16 stars, GitHub automatically unlocks **Starstruck** on your profile!

---

## Batch Automation for Gold Tier (x3 / x4)

To level up **Pull Shark** (to 16 / 128 PRs) and **Pair Extraordinaire** (to 24 PRs), see the helper script in `scripts/unlock-pr-achievements.ps1`.
