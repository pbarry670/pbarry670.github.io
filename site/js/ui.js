const nav = document.querySelector("[data-nav]");
const toggle = document.querySelector("[data-nav-toggle]");
if (toggle && nav) {
  toggle.addEventListener("click", () => {
    const open = nav.classList.toggle("is-open");
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
  });
  nav.querySelectorAll("a").forEach((a) => {
    a.addEventListener("click", () => {
      nav.classList.remove("is-open");
      toggle.setAttribute("aria-expanded", "false");
    });
  });
}

document.querySelectorAll("[data-tabs]").forEach((root) => {
  const tabs = [...root.querySelectorAll("[role='tab']")];
  const panels = [...root.querySelectorAll("[role='tabpanel']")];
  function select(id) {
    tabs.forEach((tab) => {
      const on = tab.getAttribute("aria-controls") === id;
      tab.setAttribute("aria-selected", on ? "true" : "false");
      tab.tabIndex = on ? 0 : -1;
    });
    panels.forEach((panel) => {
      panel.hidden = panel.id !== id;
    });
  }
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => select(tab.getAttribute("aria-controls")));
    tab.addEventListener("keydown", (event) => {
      const i = tabs.indexOf(tab);
      if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
        const next = tabs[(i + (event.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
        next.focus();
        select(next.getAttribute("aria-controls"));
      }
    });
  });
});

const bookSearch = document.querySelector("[data-book-search]");
const bookFilter = document.querySelectorAll("[data-book-filter]");
const books = [...document.querySelectorAll("[data-book]")];
function applyBooks() {
  const q = (bookSearch?.value || "").trim().toLowerCase();
  const mode = document.querySelector("[data-book-filter][aria-pressed='true']")?.dataset.bookFilter || "all";
  books.forEach((li) => {
    const title = li.dataset.title.toLowerCase();
    const read = li.dataset.read === "true";
    const kindOk = mode === "all" || mode === "read" ? true : mode === "unread" ? !read : li.dataset.kind === mode;
    const readOk = mode === "read" ? read : mode === "unread" ? !read : true;
    const textOk = !q || title.includes(q);
    li.hidden = !(kindOk && readOk && textOk);
  });
}
bookFilter.forEach((button) => {
  button.addEventListener("click", () => {
    bookFilter.forEach((b) => b.setAttribute("aria-pressed", b === button ? "true" : "false"));
    applyBooks();
  });
});
bookSearch?.addEventListener("input", applyBooks);
