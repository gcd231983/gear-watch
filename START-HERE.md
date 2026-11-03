# Set up Gear Watch from your phone

About 10 minutes. Use your phone's browser (Safari or Chrome) at github.com for steps 1 to 5. The GitHub app can't upload files or change these settings.

## 1. Make the repo

1. Go to github.com and tap **+** (top right), then **New repository**.
2. Name it `gear-watch`.
3. Choose **Public**. GitHub Pages and unlimited Actions minutes are free only on public repos.
4. Check **Add a README file**.
5. Tap **Create repository**.

## 2. Turn on Pages

1. In the repo, tap **Settings**, then **Pages** (under "Code and automation").
2. Under **Build and deployment**, set **Source** to **GitHub Actions**.

## 3. Upload the zip

1. Go back to the repo's main page (tap **Code**).
2. Tap **Add file**, then **Upload files**.
3. Choose `gear-watch.zip` from your Downloads. Don't unzip it.
4. Tap **Commit changes**.

## 4. Add the workflow (this starts everything)

1. Tap **Add file**, then **Create new file**.
2. In the name box, type exactly: `.github/workflows/gear-watch.yml`
   (typing the slashes creates the folders).
3. Paste the whole workflow text into the big box.
4. Tap **Commit changes**, then **Commit changes** again.

## 5. Watch the first run

1. Tap **Actions**. A run called "Gear Watch" starts within a minute.
2. When it shows a green check (2 to 3 minutes), open it and scroll to the summary to see what each source found.
3. Your pages are live:
   - Picks: `https://gcd231983.github.io/gear-watch/`
   - Price board: `https://gcd231983.github.io/gear-watch/watch.html`

If the run is red at **configure-pages**, step 2 didn't save. Set the Pages source again, then on the failed run tap **Re-run all jobs**.

## 6. Turn on phone notifications

1. In the **GitHub app**, open your profile, then **Settings**, then **Notifications**.
2. Turn on push notifications.
3. Make sure you're watching the repo: open `gear-watch`, tap **Watch**, and choose **All Activity**.

Price alerts and "source not answering" alerts arrive as issues in the repo.

## Changing things later

Ask Codex in the ChatGPT app ("Gear Watch: change the MacBook Neo target to $499" or "publish the Mac mini pick"), or edit the files in `watch/` in the GitHub web editor. Each change republishes the pages.
