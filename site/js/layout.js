// Shared header and footer, injected on every page so nav changes happen in one place.
import { config } from "./config.js";
import { isDemo } from "./data.js";

const NAV = [
  ["index.html", "Home"],
  ["events.html", "Events"],
  ["leaderboard.html", "Leaderboard"],
];

const page = location.pathname.split("/").pop() || "index.html";

document.querySelector("#site-header").innerHTML = `
  ${isDemo ? `<div class="demo-banner">Demo mode: showing sample data. Add Supabase keys in <code>js/config.js</code> to go live.</div>` : ""}
  <div class="container header-inner">
    <a class="brand" href="index.html">
      <picture>
        <source srcset="assets/logo/sase-wordmark-dark.png" media="(prefers-color-scheme: dark)" />
        <img src="assets/logo/sase-wordmark.png" alt="${config.orgName}" width="168" height="36" />
      </picture>
      <span class="brand-school">Wichita State<br />University</span>
    </a>
    <button class="nav-toggle" aria-expanded="false" aria-controls="site-nav" aria-label="Menu">
      <span></span><span></span><span></span>
    </button>
    <nav id="site-nav" class="site-nav">
      ${NAV.map(([href, label]) => `<a href="${href}"${href === page ? ' aria-current="page"' : ""}>${label}</a>`).join("")}
      <a class="btn btn-accent btn-sm" href="${config.links.join}">Join</a>
    </nav>
  </div>`;

document.querySelector("#site-footer").innerHTML = `
  <div class="container footer-inner">
    <div class="footer-brand">
      <img src="assets/logo/sase-icon.png" alt="" width="47" height="64" />
      <div>
        <strong>${config.orgFullName}</strong><br />
        ${config.school}<br />
        <a href="mailto:${config.contactEmail}">${config.contactEmail}</a>
      </div>
    </div>
    <div class="footer-links">
      <a href="${config.links.instagram}">Instagram</a>
      <a href="${config.links.discord}">Discord</a>
      <a href="${config.links.linkedin}">LinkedIn</a>
      <a href="admin.html">Officer login</a>
    </div>
  </div>`;

const toggle = document.querySelector(".nav-toggle");
toggle.addEventListener("click", () => {
  const open = toggle.getAttribute("aria-expanded") === "true";
  toggle.setAttribute("aria-expanded", String(!open));
  document.querySelector("#site-nav").classList.toggle("open", !open);
});
