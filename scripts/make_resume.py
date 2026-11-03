#!/usr/bin/env python3
"""Write a text resume PDF from content/site.json. No phone number, no street address."""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
site = json.loads((ROOT / "content" / "site.json").read_text())


def wrap(text, width=92):
    words = text.split()
    lines, cur = [], ""
    for word in words:
        trial = word if not cur else cur + " " + word
        if len(trial) <= width:
            cur = trial
        else:
            if cur:
                lines.append(cur)
            cur = word
    if cur:
        lines.append(cur)
    return lines or [""]


lines = []
p = site["person"]
lines.append(p["name"].upper())
lines.append(f"{p['location']}  |  {p['email']}")
lines.append(p["github"])
lines.append(p["linkedin"])
lines.append(site["resumeNote"])
lines.append("")
lines.append("EDUCATION")
for school in site["education"]:
    lines.append(f"{school['credential']}, {school['school']} — {school['when']}")
    lines.extend(wrap(school["detail"]))
lines.extend(wrap(site["coursework"]))
lines.append("")
lines.append("EXPERIENCE")
for job in site["experience"]:
    lines.append(f"{job['role']} — {job['org']}")
    lines.append(f"{job['where']}  |  {job['when']}")
    for bullet in job["bullets"]:
        wrapped = wrap(bullet, 88)
        lines.append("- " + wrapped[0])
        for extra in wrapped[1:]:
            lines.append("  " + extra)
    lines.append("")
lines.append("PUBLICATIONS")
for pub in site["publications"]:
    lines.extend(wrap(f"{pub['title']}. {pub['authors']}. {pub['venue']}. {pub['href']}"))
lines.append("")
lines.append("PROJECTS")
for project in site["projects"]:
    repo = f" {project['repo']}" if project.get("repo") else ""
    lines.extend(wrap(f"{project['title']}. {project['summary']}{repo}"))

# PDF with Helvetica, one or more pages.
PAGE_W, PAGE_H = 612, 792
MARGIN_X, MARGIN_Y = 54, 54
LEADING = 13
usable = PAGE_H - 2 * MARGIN_Y
per_page = usable // LEADING

def pdf_escape(text):
    text = (
        text.replace("—", " - ")
        .replace("–", "-")
        .replace("×", "x")
        .replace("’", "'")
        .replace("“", '"')
        .replace("”", '"')
        .replace("±", "+/-")
        .replace("Δ", "delta ")
        .replace("°", " deg")
    )
    return text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")

pages = [lines[i : i + per_page] for i in range(0, len(lines), per_page)] or [[]]
objects = []

def add(obj):
    objects.append(obj)
    return len(objects)

font = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
contents = []
for page_lines in pages:
    commands = ["BT", "/F1 10 Tf", f"{LEADING} TL", f"1 0 0 1 {MARGIN_X} {PAGE_H - MARGIN_Y} Tm"]
    for line in page_lines:
        commands.append(f"({pdf_escape(line)}) Tj")
        commands.append("T*")
    commands.append("ET")
    stream = "\n".join(commands).encode("latin-1", "replace")
    contents.append(
        add(f"<< /Length {len(stream)} >>\nstream\n".encode("ascii") + stream + b"\nendstream")
    )

page_ids = []
for content_id in contents:
    page_ids.append(
        add(
            f"<< /Type /Page /Parent PARENT /MediaBox [0 0 {PAGE_W} {PAGE_H}] "
            f"/Contents {content_id} 0 R /Resources << /Font << /F1 {font} 0 R >> >> >>"
        )
    )
kids = " ".join(f"{pid} 0 R" for pid in page_ids)
pages_id = add(f"<< /Type /Pages /Count {len(page_ids)} /Kids [{kids}] >>")
for pid in page_ids:
    objects[pid - 1] = objects[pid - 1].replace("PARENT", f"{pages_id} 0 R")
catalog = add(f"<< /Type /Catalog /Pages {pages_id} 0 R >>")

out = bytearray(b"%PDF-1.4\n")
offsets = [0]
for i, obj in enumerate(objects, start=1):
    offsets.append(len(out))
    if isinstance(obj, bytes):
        out += f"{i} 0 obj\n".encode() + obj + b"\nendobj\n"
    else:
        out += f"{i} 0 obj\n{obj}\nendobj\n".encode("latin-1")
xref = len(out)
out += f"xref\n0 {len(objects)+1}\n".encode()
out += b"0000000000 65535 f \n"
for offset in offsets[1:]:
    out += f"{offset:010d} 00000 n \n".encode()
out += f"trailer << /Size {len(objects)+1} /Root {catalog} 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()

dest = Path(sys.argv[1])
dest.parent.mkdir(parents=True, exist_ok=True)
dest.write_bytes(out)
print(f"Wrote {dest} ({len(pages)} pages)")
