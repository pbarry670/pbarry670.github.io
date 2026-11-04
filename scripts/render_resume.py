#!/usr/bin/env python3
"""Print assets/resume/Patrick_Barry_Resume.pdf from content/resume.json.

Uses headless Chromium so the PDF matches the HTML layout. Contact details
are only what is in content/resume.json: no street address and no phone number.
"""

import json
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "content" / "resume.json"
OUT = ROOT / "assets" / "resume" / "Patrick_Barry_Resume.pdf"
BLUE = "#1F4E79"
LINK = "#0563C1"

resume = json.loads(DATA.read_text())


def esc(text):
    return (
        str(text)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def bullets(items):
    return "<ul>" + "".join(f"<li>{esc(item)}</li>" for item in items) + "</ul>"


def job(entry):
    return (
        '<article class="job">'
        f'<p class="org">{esc(entry["org"])}</p>'
        f'<p class="role">{esc(entry["title"])}</p>'
        f"{bullets(entry['bullets'])}"
        "</article>"
    )


education = resume["education"]
edu = f'<p class="org">{esc(education["school"])}</p>' + "".join(
    "<ul><li>"
    + esc(degree["line"])
    + "</li></ul>"
    + f'<p class="course"><strong>Relevant Coursework:</strong> {esc(degree["coursework"])}</p>'
    for degree in education["degrees"]
)
skills = "".join(
    f'<p><strong>{esc(row["label"])}:</strong> {esc(row["text"])}</p>' for row in resume["skills"]
)
achievements = "".join(f"<p>{esc(line)}</p>" for line in resume["achievements"])
publications = "".join(
    "<p>"
    f'{esc(paper["authors"])} <em>{esc(paper["title"])}</em> {esc(paper["venue"])} '
    f'<a href="{esc(paper["href"])}">{esc(paper["href"])}</a>'
    "</p>"
    for paper in resume["publications"]
)

rows = [
    ("EDUCATION", edu),
    ("SKILLS", skills),
    ("ACHIEVEMENTS", achievements),
    ("PUBLICATIONS", publications),
]
row_html = "".join(
    f'<section class="row"><h2>{label}</h2><div>{body}</div></section>' for label, body in rows
)
experience = "".join(job(entry) for entry in resume["experience"])
projects = "".join(job(entry) for entry in resume["projects"])

html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>{esc(resume["name"])}</title>
<style>
  @page {{ size: letter; margin: 0.55in 0.65in 0.5in; }}
  * {{ box-sizing: border-box; }}
  html, body {{ margin: 0; padding: 0; }}
  body {{
    font-family: "Times New Roman", Times, "Liberation Serif", serif;
    font-size: 10.5pt;
    line-height: 1.16;
    color: #111;
  }}
  h1 {{
    margin: 0;
    text-align: center;
    font-size: 22pt;
    letter-spacing: 0.08em;
    font-weight: 700;
    color: {BLUE};
  }}
  .rule {{
    border: 0;
    border-top: 1.25pt solid {BLUE};
    margin: 4pt 0 5pt;
  }}
  .contact {{
    margin: 0 0 8pt;
    text-align: center;
    font-size: 10.5pt;
  }}
  .row {{
    display: grid;
    grid-template-columns: 1.45in 1fr;
    column-gap: 12pt;
    margin: 0 0 5pt;
  }}
  h2 {{
    margin: 0;
    color: {BLUE};
    font-size: 11.5pt;
    letter-spacing: 0.03em;
    font-weight: 700;
  }}
  .banner {{
    margin: 6pt 0 2pt;
    color: {BLUE};
    font-size: 11.5pt;
    letter-spacing: 0.04em;
    font-weight: 700;
  }}
  .org, .role {{ margin: 0; font-weight: 700; }}
  .job {{ margin: 0 0 4pt; break-inside: avoid; }}
  .course, p {{ margin: 1pt 0; }}
  ul {{ margin: 1pt 0 2pt 1.05em; padding: 0; }}
  li {{ margin: 0; padding: 0; }}
  a {{ color: {LINK}; text-decoration: underline; }}
  strong {{ font-weight: 700; }}
</style>
</head>
<body>
  <h1>{esc(resume["name"])}</h1>
  <hr class="rule">
  <p class="contact">{esc(resume["contact"])}</p>
  {row_html}
  <h2 class="banner">EXPERIENCE</h2>
  {experience}
  <h2 class="banner">PROJECTS</h2>
  {projects}
</body>
</html>
"""

with tempfile.TemporaryDirectory() as tmp:
    page = Path(tmp) / "resume.html"
    page.write_text(html)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    profile = Path(tmp) / "chrome"
    try:
        subprocess.run(
            [
                "google-chrome",
                "--headless=new",
                "--disable-gpu",
                "--no-sandbox",
                "--no-pdf-header-footer",
                f"--user-data-dir={profile}",
                f"--print-to-pdf={OUT}",
                page.as_uri(),
            ],
            check=False,
            timeout=25,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    except subprocess.TimeoutExpired:
        subprocess.run(["pkill", "-f", "print-to-pdf"], check=False)
    if not OUT.exists() or OUT.stat().st_size < 1000:
        raise SystemExit("Chrome did not write the resume PDF")

print(f"Wrote {OUT} ({OUT.stat().st_size} bytes)")
