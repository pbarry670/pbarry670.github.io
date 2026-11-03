import { mkdir, readFile, writeFile, cp, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const site = JSON.parse(await readFile(path.join(root, "content", "site.json"), "utf8"));
const resumeDoc = JSON.parse(await readFile(path.join(root, "content", "resume.json"), "utf8"));

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function norm(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function linkKing(data) {
  const bib = data.reading.king.bibliography.map((book) => ({ ...book, read: false, favorite: false }));
  const unmatched = [];
  for (const item of data.reading.king.read) {
    const hit = bib.find(
      (book) => norm(book.title) === norm(item.title) || (book.aliases || []).some((alias) => norm(alias) === norm(item.title))
    );
    if (!hit) unmatched.push(item.title);
    else {
      hit.read = true;
      if (item.favorite) hit.favorite = true;
      item.canonical = hit.title;
    }
  }
  if (unmatched.length) {
    console.error("King read list titles with no bibliography match:", unmatched.join(", "));
    process.exit(1);
  }
  const readCount = bib.filter((book) => book.read).length;
  const novels = bib.filter((book) => book.kind === "novel");
  const collections = bib.filter((book) => book.kind === "collection");
  return {
    bib,
    readCount,
    total: bib.length,
    novelsRead: novels.filter((book) => book.read).length,
    novels: novels.length,
    collectionsRead: collections.filter((book) => book.read).length,
    collections: collections.length,
  };
}

const king = linkKing(site);
const projectBySlug = Object.fromEntries(site.projects.map((project) => [project.slug, project]));

function page({ title, description, prefix, body, mainClass = "" }) {
  const depth = prefix;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <meta name="theme-color" content="#090b10">
  <link rel="icon" href="${depth}favicon.svg" type="image/svg+xml">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Outfit:wght@400;500;600&family=Syne:wght@600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="${depth}css/styles.css">
</head>
<body>
  <a class="skip" href="#main">Skip to content</a>
  ${header(depth)}
  <main id="main" class="${mainClass}">${body}</main>
  ${footer(depth)}
  <script src="${depth}js/ui.js"></script>
  <script type="module" src="${depth}js/viz.js"></script>
</body>
</html>`;
}

function header(prefix) {
  const links = [
    ["Work", `${prefix}#work`],
    ["Lab", `${prefix}#lab`],
    ["Experience", `${prefix}#experience`],
    ["Skills", `${prefix}#skills`],
    ["Reading", `${prefix}reading/`],
    ["Beyond", `${prefix}#beyond`],
    ["Resume", `${prefix}resume/`],
  ];
  return `<header class="site-header">
    <div class="wrap header-inner">
      <a class="brand" href="${prefix}">${esc(site.person.shortName)}</a>
      <button class="nav-toggle" type="button" data-nav-toggle aria-expanded="false" aria-controls="site-nav">Menu</button>
      <nav id="site-nav" class="nav" data-nav>
        ${links.map(([label, href]) => `<a href="${href}">${label}</a>`).join("")}
      </nav>
    </div>
  </header>`;
}

function footer() {
  return `<footer class="site-footer">
    <div class="wrap">
      <p>${esc(site.person.name)} · ${esc(site.person.email)} · <a href="${esc(site.person.github)}">GitHub</a> · <a href="${esc(site.person.linkedin)}">LinkedIn</a></p>
    </div>
  </footer>`;
}

function actions(prefix) {
  return `<div class="actions">
    <a class="button primary" href="${prefix}#work">Selected Work</a>
    <a class="button ghost" href="${prefix}resume/">Resume</a>
    <a class="button ghost" href="mailto:${esc(site.person.email)}">Email</a>
  </div>`;
}

function vizBlock(id, label, speed) {
  const control = speed
    ? `<label>Target <input data-speed type="range" min="0.5" max="1.5" step="0.1" value="1" aria-label="Desired speed in meters per second"></label>`
    : "";
  return `<div class="viz" data-viz="${esc(id)}">
    <canvas role="img" aria-label="${esc(label)}" width="800" height="360"></canvas>
    <footer><span data-readout></span>${control}</footer>
  </div>`;
}

function home() {
  const chips = site.heroChips
    .map((chip) => `<li><a href="#skills">${esc(chip)}</a></li>`)
    .join("");
  const projectOrder = ["racecar", "planetary-supply-drop", "missile-tracking", "drone-ddp", "thrust-vector", "current-sensor", "jet-vanes", "quad-gnc"];
  const ordered = projectOrder.map((slug) => projectBySlug[slug]).filter(Boolean);
  const cards = ordered
    .map((project) => {
      const photo = project.card
        ? `<div class="shot"><img class="card-photo" src="${esc(project.card.src)}" alt="${esc(project.card.alt)}" width="${project.card.width || 800}" height="${project.card.height || 500}" loading="lazy" decoding="async"></div>`
        : "";
      return `<article class="card">
        ${photo}
        <p class="meta"><span>${esc(project.when)}</span><span>${esc(project.role)}</span></p>
        <h3><a href="projects/${esc(project.slug)}.html">${esc(project.title)}</a></h3>
        <p>${esc(project.summary)}</p>
        <p class="meta">${project.tags.map((tag) => `<span>${esc(tag)}</span>`).join("")}</p>
        <p class="more"><a href="projects/${esc(project.slug)}.html">Open Project</a>${
          project.repo ? ` · <a href="${esc(project.repo)}">Repo</a>` : ""
        }</p>
      </article>`;
    })
    .join("");

  const tabs = site.lab
    .map(
      (item, index) =>
        `<button type="button" role="tab" id="tab-${esc(item.id)}" aria-controls="panel-${esc(item.id)}" aria-selected="${
          index === 0 ? "true" : "false"
        }" tabindex="${index === 0 ? "0" : "-1"}">${esc(item.title)}</button>`
    )
    .join("");
  const panels = site.lab
    .map((item, index) => {
      const project = projectBySlug[item.project];
      return `<div role="tabpanel" id="panel-${esc(item.id)}" aria-labelledby="tab-${esc(item.id)}" ${index === 0 ? "" : "hidden"}>
        <div class="stage">
          ${vizBlock(item.id, item.canvasLabel, item.speed)}
          <div class="note">
            <h3>${esc(item.title)}</h3>
            <p>${esc(item.blurb)}</p>
            <p><a href="projects/${esc(project.slug)}.html">${esc(project.title)}</a></p>
          </div>
        </div>
      </div>`;
    })
    .join("");

  const jobs = site.experience
    .map(
      (job) => `<li>
        <div class="when">${esc(job.when)}<br>${esc(job.where)}</div>
        <div>
          <h3>${esc(job.role)}</h3>
          <p class="org">${esc(job.org)}</p>
          <ul>${job.bullets.map((bullet) => `<li>${esc(bullet)}</li>`).join("")}</ul>
        </div>
      </li>`
    )
    .join("");

  const schools = site.education
    .map(
      (school) => `<article class="edu-card">
        <h3>${esc(school.credential)}</h3>
        <p class="org">${esc(school.school)}</p>
        <p class="meta"><span>${esc(school.when)}</span></p>
        <p>${esc(school.detail)}</p>
      </article>`
    )
    .join("");

  const pubs = site.publications
    .map(
      (pub) => `<article class="pub">
        <h3><a href="${esc(pub.href)}">${esc(pub.title)}</a></h3>
        <p>${esc(pub.authors)}. ${esc(pub.venue)}.</p>
      </article>`
    )
    .join("");

  const skills = site.skills
    .map((group) => {
      const items = group.items
        .map((item) => {
          const links = (item.projects || [])
            .map((slug) => {
              const project = projectBySlug[slug];
              return project ? `<a href="projects/${esc(project.slug)}.html">${esc(project.shortTitle || project.title)}</a>` : "";
            })
            .filter(Boolean)
            .join(" · ");
          return `<div class="skill">
            <b>${esc(item.name)}</b><span class="level">${esc(item.level)}</span>
            <small>${esc(item.detail || "")}${links ? ` ${links}` : ""}</small>
          </div>`;
        })
        .join("");
      return `<div class="skill-group"><h3>${esc(group.group)}</h3>${items}</div>`;
    })
    .join("");

  const interests = site.interests
    .map((item) => {
      const video = item.video
        ? `<figure class="shot">
            <video autoplay muted loop playsinline preload="metadata" poster="${esc(item.video.poster)}">
              <source src="${esc(item.video.src)}" type="video/mp4">
            </video>
            <figcaption>${esc(item.video.caption)}</figcaption>
          </figure>`
        : "";
      return `<article class="interest${item.video ? " wide" : ""}">
        <h3>${esc(item.title)}</h3>
        <p>${esc(item.body)}</p>
        ${video}
      </article>`;
    })
    .join("");
  const photoStrip = (site.photos || [])
    .map(
      (photo) => `<figure class="shot">
        <img src="${esc(photo.src)}" alt="${esc(photo.alt)}" loading="lazy" decoding="async">
        <figcaption>${esc(photo.caption)}</figcaption>
      </figure>`
    )
    .join("");

  const snippets = site.code
    .map(
      (block) => `<article class="card">
        <h3>${esc(block.title)}</h3>
        <p class="meta"><span>${esc(block.language)}</span><a href="${esc(block.repo)}">${esc(block.file)}</a></p>
        <p>${esc(block.caption)}</p>
        <pre><code>${esc(block.code)}</code></pre>
      </article>`
    )
    .join("");

  const body = `
  <section class="hero">
    <div class="wrap hero-grid">
      <div>
        <p class="kicker">${esc(site.person.kicker)}</p>
        <h1>${esc(site.person.name)}</h1>
        <p class="lede">${esc(site.person.lede)}</p>
        <ul class="chips">${chips}</ul>
        ${actions("")}
        <div class="now"><strong>Now</strong><p>${esc(site.now)}</p></div>
      </div>
      <figure class="portrait">
        <img src="${esc(site.person.photo)}" alt="${esc(site.person.photoAlt)}" width="720" height="1200">
        ${site.person.photoCaption ? `<figcaption>${esc(site.person.photoCaption)}</figcaption>` : ""}
      </figure>
    </div>
  </section>
  <section>
    <div class="wrap prose">
      ${site.about.map((paragraph) => `<p>${esc(paragraph)}</p>`).join("")}
    </div>
  </section>
  <section id="work">
    <div class="wrap">
      <div class="section-head">
        <p class="kicker">Work</p>
        <h2>Projects</h2>
        <p>${esc(site.workIntro)}</p>
      </div>
      <div class="work-grid">${cards}</div>
    </div>
  </section>
  <section id="lab">
    <div class="wrap">
      <div class="section-head">
        <p class="kicker">Lab</p>
        <h2>A Few Loops, Running</h2>
        <p>Interactive sketches of the models in the repos. The plots further down each project are the actual figures, or a figure generated from those models and labeled as such.</p>
      </div>
      <div data-tabs>
        <div class="tablist" role="tablist" aria-label="Interactive sketches">${tabs}</div>
        ${panels}
      </div>
    </div>
  </section>
  <section>
    <div class="wrap">
      <div class="section-head">
        <p class="kicker">Code</p>
        <h2>Short Highlights</h2>
      </div>
      <div class="work-grid">${snippets}</div>
    </div>
  </section>
  <section id="experience">
    <div class="wrap">
      <div class="section-head">
        <p class="kicker">Experience</p>
        <h2>Where the Work Happened</h2>
      </div>
      <ol class="timeline">${jobs}</ol>
    </div>
  </section>
  <section id="education">
    <div class="wrap">
      <div class="section-head"><p class="kicker">Education</p><h2>Georgia Tech</h2></div>
      <div class="split">${schools}</div>
      <div class="split" style="margin-top:16px">${pubs}</div>
    </div>
  </section>
  <section id="skills">
    <div class="wrap">
      <div class="section-head">
        <p class="kicker">Skills</p>
        <h2>What I Use, and Where It Shows Up</h2>
        <p>Levels are the ones I put on my portfolio. Links go to a project that actually uses the tool.</p>
      </div>
      <div class="skill-groups">${skills}</div>
    </div>
  </section>
  <section id="beyond">
    <div class="wrap">
      <div class="section-head">
        <p class="kicker">Beyond Engineering</p>
        <h2>Off the Problem Set</h2>
      </div>
      <div class="interest-grid">
        ${interests}
        <article class="interest wide">
          <h3>Reading</h3>
          <p>${esc(site.reading.teaser)}</p>
          <p><a href="reading/">Reading list</a></p>
        </article>
      </div>
      <div class="photo-strip">${photoStrip}</div>
    </div>
  </section>
  <section id="contact">
    <div class="wrap">
      <div class="section-head"><p class="kicker">Contact</p><h2>Say Hello</h2></div>
      <div class="contact-row">
        <a class="button primary" href="mailto:${esc(site.person.email)}">${esc(site.person.email)}</a>
        <a class="button ghost" href="${esc(site.person.github)}">GitHub</a>
        <a class="button ghost" href="${esc(site.person.linkedin)}">LinkedIn</a>
        <a class="button ghost" href="resume/">Resume</a>
      </div>
    </div>
  </section>`;

  return page({
    title: `${site.person.name} · Aerospace & GNC`,
    description: site.person.lede,
    prefix: "",
    body,
  });
}

function projectPage(project) {
  const sections = (project.sections || [])
    .map(
      (section) => `<section>
        <h2>${esc(section.heading)}</h2>
        ${section.paragraphs.map((paragraph) => `<p>${esc(paragraph)}</p>`).join("")}
      </section>`
    )
    .join("");
  const figures = (project.images || [])
    .map(
      (image) => `<figure>
        <img src="../${esc(image.src)}" alt="${esc(image.alt)}" loading="lazy" decoding="async">
        <figcaption>${esc(image.caption)}</figcaption>
      </figure>`
    )
    .join("");
  const videos = (project.videos || [])
    .map(
      (video) => `<figure>
        <iframe src="https://drive.google.com/file/d/${esc(video.driveId)}/preview" title="${esc(video.title)}" allow="autoplay" allowfullscreen></iframe>
        <figcaption>${esc(video.title)} · <a href="https://drive.google.com/file/d/${esc(video.driveId)}/view">Open in Drive</a></figcaption>
      </figure>`
    )
    .join("");
  const code = (project.code || [])
    .map((block) => site.code.find((item) => item.id === block))
    .filter(Boolean)
    .map(
      (block) => `<section>
        <h2>${esc(block.title)}</h2>
        <p>${esc(block.caption)} <a href="${esc(block.repo)}">${esc(block.file)}</a></p>
        <pre><code>${esc(block.code)}</code></pre>
      </section>`
    )
    .join("");
  const links = [
    project.repo ? `<a class="button primary" href="${esc(project.repo)}">Repository</a>` : "",
    ...(project.links || []).map((link) => `<a class="button ghost" href="${esc(link.href)}">${esc(link.label)}</a>`),
  ].join("");
  const viz = project.viz ? vizBlock(project.viz, project.vizLabel || project.title, project.viz === "mppi") : "";
  const credits = project.credits?.length ? `<p>With ${project.credits.map((name) => esc(name)).join(", ")}.</p>` : "";
  const body = `<article class="wrap project-hero prose">
    <p class="kicker"><a href="../#work">Work</a> · ${esc(project.when)}</p>
    <h1>${esc(project.title)}</h1>
    <p class="lede">${esc(project.summary)}</p>
    <p class="meta"><span>${esc(project.role)}</span>${project.tags.map((tag) => `<span>${esc(tag)}</span>`).join("")}</p>
    <div class="actions">${links}</div>
    ${credits}
    ${viz}
    ${sections}
    ${figures ? `<div class="gallery">${figures}</div>` : ""}
    ${videos ? `<div class="video-grid">${videos}</div>` : ""}
    ${code}
  </article>`;
  return page({
    title: `${project.title} · ${site.person.name}`,
    description: project.summary,
    prefix: "../",
    body,
  });
}

const resumePdf = "../assets/resume/Patrick_Barry_Resume.pdf";

function readingPage() {
  const pct = Math.round((king.readCount / king.total) * 1000) / 10;
  const shelf = site.reading.king.read
    .map(
      (item) =>
        `<li>${item.favorite ? `<span class="star">Favorite · </span>` : ""}${esc(item.canonical || item.title)}</li>`
    )
    .join("");
  const bookList = king.bib
    .map(
      (book) => `<li data-book data-read="${book.read}" data-kind="${esc(book.kind)}" data-title="${esc(book.title)}">
        <span>${book.favorite ? "★ " : ""}${esc(book.title)}</span>
        <span class="mark">${book.read ? "Read" : "—"} · ${esc(book.year)} · ${esc(book.kind === "novel" ? "Novel" : "Collection")}</span>
      </li>`
    )
    .join("");
  const favs = (site.reading.favorites || [])
    .map(
      (book) => `<article class="fav-card">
        <p class="mark">Favorite</p>
        <h3>${esc(book.title)}</h3>
        <p>${esc(book.author)}</p>
        ${book.note ? `<p>${esc(book.note)}</p>` : ""}
      </article>`
    )
    .join("");
  const body = `<article class="wrap prose">
    <p class="kicker"><a href="../">Home</a></p>
    <h1>Reading</h1>
    <p class="lede">${esc(site.reading.intro)}</p>
    <div class="fav-grid">${favs}</div>
    <p>${esc(site.reading.also)}</p>
    <h2>Stephen King</h2>
    <div class="tracker">
      <div>
        <p class="fraction">${king.readCount} <span>/ ${king.total}</span></p>
        <div class="bar" role="img" aria-label="${king.readCount} of ${king.total} Stephen King novels and collections"><i style="width:${pct}%"></i></div>
        <p class="meta"><span>${king.novelsRead} of ${king.novels} novels</span><span>${king.collectionsRead} of ${king.collections} collections</span></p>
        <p class="fav"><strong>Favorite:</strong> ${esc(site.reading.king.favorite)}</p>
        <p class="note">${esc(site.reading.king.source)}</p>
      </div>
      <div>
        <h3>Logged So Far</h3>
        <ul class="read-shelf">${shelf}</ul>
        <div class="tools">
          <input data-book-search type="search" placeholder="Find a Title" aria-label="Filter Stephen King titles">
          <button type="button" data-book-filter="all" aria-pressed="true">All</button>
          <button type="button" data-book-filter="read" aria-pressed="false">Read</button>
          <button type="button" data-book-filter="unread" aria-pressed="false">Not Yet</button>
          <button type="button" data-book-filter="novel" aria-pressed="false">Novels</button>
          <button type="button" data-book-filter="collection" aria-pressed="false">Collections</button>
        </div>
        <ul class="books">${bookList}</ul>
      </div>
    </div>
  </article>`;
  return page({
    title: `Reading · ${site.person.name}`,
    description: site.reading.teaser,
    prefix: "../",
    body,
  });
}

function resumeJobs(entries) {
  return entries
    .map(
      (entry) => `<article class="resume-job">
        <h3>${esc(entry.org)}</h3>
        <p class="resume-role">${esc(entry.title)}</p>
        <ul>${entry.bullets.map((bullet) => `<li>${esc(bullet)}</li>`).join("")}</ul>
      </article>`
    )
    .join("");
}

function resumePage() {
  const doc = resumeDoc;
  const edu = `<p class="org">${esc(doc.education.school)}</p>
    <ul>${doc.education.degrees.map((line) => `<li>${esc(line)}</li>`).join("")}</ul>
    <p>${esc(doc.education.coursework)}</p>`;
  const skills = doc.skills
    .map((row) => `<p><strong>${esc(row.label)}:</strong> ${esc(row.text)}</p>`)
    .join("");
  const achievements = doc.achievements.map((line) => `<p>${esc(line)}</p>`).join("");
  const pubs = doc.publications
    .map(
      (paper) => `<p>${esc(paper.authors)} <em>${esc(paper.title)}</em> ${esc(paper.venue)} <a href="${esc(paper.href)}">${esc(paper.href)}</a></p>`
    )
    .join("");
  const row = (label, inner) => `<section class="resume-row"><h2>${label}</h2><div>${inner}</div></section>`;
  const body = `<article class="wrap resume-sheet">
    <header class="resume-top">
      <div>
        <p class="kicker">Resume</p>
        <h1>${esc(site.person.name)}</h1>
        <p>${esc(doc.contact)}</p>
        <p class="resume-links">
          <a href="mailto:${esc(site.person.email)}">${esc(site.person.email)}</a>
          <a href="${esc(site.person.github)}">GitHub</a>
          <a href="${esc(site.person.linkedin)}">LinkedIn</a>
        </p>
      </div>
      <a class="button primary" href="${resumePdf}">Download PDF</a>
    </header>
    <div class="pdf-frame">
      <iframe src="${resumePdf}" title="Patrick Barry resume PDF"></iframe>
    </div>
    <p class="pdf-fallback">Inline PDF viewers are unreliable on phones. <a href="${resumePdf}">Download the PDF</a>.</p>
    <div class="resume-copy">
      ${row("Education", edu)}
      ${row("Skills", skills)}
      ${row("Achievements", achievements)}
      ${row("Publications", pubs)}
      <h2 class="resume-banner">Experience</h2>
      ${resumeJobs(doc.experience)}
      <h2 class="resume-banner">Projects</h2>
      ${resumeJobs(doc.projects)}
    </div>
  </article>`;
  return page({
    title: `Resume · ${site.person.name}`,
    description: `Resume for ${site.person.name}`,
    prefix: "../",
    body,
  });
}

await rm(dist, { recursive: true, force: true });
await mkdir(path.join(dist, "projects"), { recursive: true });
await mkdir(path.join(dist, "resume"), { recursive: true });
await mkdir(path.join(dist, "reading"), { recursive: true });
await mkdir(path.join(dist, "assets", "resume"), { recursive: true });
await writeFile(path.join(dist, "index.html"), home());
for (const project of site.projects) {
  await writeFile(path.join(dist, "projects", `${project.slug}.html`), projectPage(project));
}
await writeFile(path.join(dist, "resume", "index.html"), resumePage());
await writeFile(path.join(dist, "reading", "index.html"), readingPage());
await cp(path.join(root, "site", "css"), path.join(dist, "css"), { recursive: true });
await cp(path.join(root, "site", "js"), path.join(dist, "js"), { recursive: true });
await cp(path.join(root, "assets", "img"), path.join(dist, "assets", "img"), { recursive: true });
await cp(path.join(root, "assets", "photo"), path.join(dist, "photo"), { recursive: true });
await cp(path.join(root, "assets", "video"), path.join(dist, "video"), { recursive: true });
await cp(path.join(root, "assets", "resume", "Patrick_Barry_Resume.pdf"), path.join(dist, "assets", "resume", "Patrick_Barry_Resume.pdf"));
await cp(path.join(root, "site", "favicon.svg"), path.join(dist, "favicon.svg"));

console.log(
  `Built ${site.projects.length} projects. King tracker ${king.readCount}/${king.total} (${king.novelsRead}/${king.novels} novels, ${king.collectionsRead}/${king.collections} collections).`
);
