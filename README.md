# pbarry670.github.io

Personal site for Patrick Barry. The built pages are static HTML generated from [`content/site.json`](content/site.json).

The live site is [https://pbarry670.github.io](https://pbarry670.github.io).

## One-time GitHub Pages setting

In the repo on GitHub: **Settings → Pages → Build and deployment → Source → GitHub Actions**.

Pushes to `main` run [`.github/workflows/pages.yml`](.github/workflows/pages.yml), which builds `dist/` and deploys it with `actions/deploy-pages`. The site is served from the root of `pbarry670.github.io`, not from a `/docs` folder.

## Preview locally

```bash
node scripts/build.mjs
python3 -m http.server -d dist 8080
```

Then open `http://localhost:8080`.

## Edit the content

All copy, projects, jobs, skills, and the reading tracker live in `content/site.json`. Change the file, rebuild, and commit the JSON. You do not need to touch the HTML.

Photos from the old Google Site are the WebP files in `assets/img/site/`. Two plots in `assets/img/generated/` are redrawn from the public models by `scripts/generate_figures.py` (the MPPI bicycle rollout and the MEO constellation). They are not frames from the MATLAB runs.

### Add a project

Add an object to the `projects` array:

| Field | What it is |
| --- | --- |
| `slug` | URL piece. The page is built at `projects/<slug>.html`. Use lowercase and hyphens. |
| `title`, `shortTitle` | Full name, and the shorter name used on skill links. |
| `when`, `role`, `summary` | Card and page header. |
| `tags` | Short labels. |
| `repo` | GitHub URL, or omit it. |
| `links` | Extra buttons: `{ "label", "href" }`. |
| `sections` | `{ "heading", "paragraphs": ["..."] }`. |
| `images` | `{ "src", "alt", "caption" }`. Put the file in `assets/img/` and point `src` at `assets/img/your-file.jpg`. |
| `videos` | `{ "driveId", "title" }`. The page embeds `https://drive.google.com/file/d/<driveId>/preview`. |
| `viz` | Optional sketch: `jetvane`, `mppi`, `globe`, `ddp`, or `supply`. |
| `code` | Ids from the top-level `code` array to show on the page. |
| `credits` | Names to list under the summary. |

To feature it in the lab, add an entry to `lab` with the same `id` as `viz` and `project` set to the slug.

### Skills

Each skill can list `projects` by slug. Those become links. Leave `projects` empty when there is no project to point at.

### Experience, education, about

`experience`, `education`, and `about` are the timeline and the intro. The résumé page and the PDF come from `content/resume.json`, not these fields. The phone number and the street address are intentionally not in either file.

### Reading tracker

`reading.king.read` is the list of Stephen King books already finished. `reading.king.bibliography` is the denominator (novels and collections). To log a book, add `{ "title": "Carrie" }` to `read`. The title has to match a bibliography title or one of its `aliases`, or the build fails. Set `"favorite": true` on at most the book you want called out. `11/22/63` is the current favorite.

The reading page is `/reading/`. Favorites live in `reading.favorites`. Right now those are *11/22/63*, *Ender's Game*, and *Hyperion*. *Children of the Mind* is mentioned there and is not part of the King count.

The progress line is `read / bibliography`. The source note in the JSON says what the bibliography includes.

### Resume PDF

The résumé PDF served by the site is `assets/resume/Patrick_Barry_Resume.pdf`. Wording lives in `content/resume.json`. `python3 scripts/render_resume.py` reprints that file with headless Chromium. The page at `/resume/` is built from the same JSON.

## What is not in the site

- Phone number.
- Street address.
- The original résumé PDF from Google Drive, because that file contains both.

<!-- Trigger Pages deploy -->
