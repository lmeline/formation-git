const ORGANIZATION = "pankosmia";
const API_ROOT = "https://api.github.com";
const state = {
  tab: "today",
  repos: [],
  issues: [],
  pulls: [],
  username: "",
  search: "",
  repo: "all",
  person: "all",
  label: "all",
  milestone: "all",
  priority: "all",
  reviewRequests: [],
  closedIssues: [],
};

const DAY = 86400000;
const THRESHOLDS = {
  review: { warn: 2, alert: 5 },
  pull: { warn: 3, alert: 7 },
  issue: { warn: 14, alert: 30 },
};
const HIGH_PRIORITY = /(priorit[ée]|urgent|critique|critical|blocker|bloquant|high|haute|\bp[01]\b)/i;
const LIST_TABS = ["review", "myissues", "mypulls", "issues", "pulls"];

const content = document.querySelector("#dashboard-content");
const tabs = [...document.querySelectorAll("[data-tab]")];
const usernameInput = document.querySelector("#username-input");
const searchInput = document.querySelector("#search-input");
const repoSelect = document.querySelector("#repo-select");
const personSelect = document.querySelector("#person-select");
const labelSelect = document.querySelector("#label-select");
const milestoneSelect = document.querySelector("#milestone-select");
const prioritySelect = document.querySelector("#priority-select");
const toolbar = document.querySelector("#list-toolbar");
const errorMessage = document.querySelector("#error-message");
const statusText = document.querySelector("#connection-status");
const statusDot = document.querySelector(".status-dot");

const pageLabels = {
  today: "Ma journée",
  review: "PR à valider",
  myissues: "Mes issues",
  mypulls: "Mes PR",
  issues: "Toutes les issues",
  pulls: "Toutes les PR",
  repos: "Dépôts",
};

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function shortDate(date) {
  if (!date) return "Date inconnue";
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" }).format(new Date(date));
}

function repoName(item) {
  return item.repository?.name || item.repository_url?.split("/").pop() || "Dépôt";
}

function login() {
  return state.username.trim().replace(/^@/, "").toLocaleLowerCase();
}

function people(item) {
  return [item.user?.login, ...(item.assignees || []).map((person) => person.login)]
    .filter(Boolean).map((name) => name.toLocaleLowerCase());
}

function isHighPriority(item) {
  return (item.labels || []).some((label) => HIGH_PRIORITY.test(label.name));
}

function ageDays(item, from = item.created_at, to = Date.now()) {
  return Math.max(0, (new Date(to) - new Date(from)) / DAY);
}

function formatDays(days) {
  if (days < 1) return "moins d’un jour";
  const rounded = Math.round(days);
  return `${rounded} jour${rounded > 1 ? "s" : ""}`;
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function alertLevel(item, kind) {
  const days = ageDays(item);
  const limits = THRESHOLDS[kind];
  if (days >= limits.alert) return "alert";
  if (days >= limits.warn) return "warn";
  return "ok";
}

function filteredItems(items) {
  const query = state.search.trim().toLocaleLowerCase("fr");
  return items.filter((item) => {
    if (state.repo !== "all" && repoName(item) !== state.repo) return false;
    if (state.person !== "all" && !people(item).includes(state.person)) return false;
    if (state.label !== "all" && !(item.labels || []).some((label) => label.name === state.label)) return false;
    if (state.milestone !== "all" && item.milestone?.title !== state.milestone) return false;
    if (state.priority === "high" && !isHighPriority(item)) return false;
    if (state.priority === "normal" && isHighPriority(item)) return false;
    if (!query) return true;
    const searchable = [
      item.title,
      item.body,
      repoName(item),
      ...(item.labels || []).map((label) => label.name),
      ...(item.assignees || []).map((assignee) => assignee.login),
    ].join(" ").toLocaleLowerCase("fr");
    return searchable.includes(query);
  });
}

function makeItemCard(item, pull = Boolean(item.pull_request), kind = pull ? "pull" : "issue") {
  const level = alertLevel(item, kind);
  const card = element("article", `item-card level-${level}`);
  card.append(element("span", `item-symbol${pull ? " pull" : ""}`, pull ? "⑂" : "◉"));

  const main = element("div", "item-main");
  const title = element("a", "item-title", item.title || "Sans titre");
  title.href = item.html_url;
  title.target = "_blank";
  title.rel = "noreferrer";
  main.append(title);

  const metadata = element("div", "item-meta");
  const repoLink = element("a", "", repoName(item));
  repoLink.href = `https://github.com/${ORGANIZATION}/${encodeURIComponent(repoName(item))}`;
  repoLink.target = "_blank";
  repoLink.rel = "noreferrer";
  metadata.append(repoLink);
  metadata.append(element("span", "", `#${item.number}`));
  metadata.append(element("span", "age", `Ouverte depuis ${formatDays(ageDays(item))}`));
  metadata.append(element("span", "", `Mis à jour le ${shortDate(item.updated_at)}`));
  if (item.milestone?.title) metadata.append(element("span", "", `Milestone : ${item.milestone.title}`));
  if (!pull && !item.assignees?.length) metadata.append(element("span", "unassigned", "Non assignée"));
  if (item.assignees?.length) {
    metadata.append(element("span", "", `Assigné à ${item.assignees.map((person) => person.login).join(", ")}`));
  }
  main.append(metadata);

  if (item.labels?.length) {
    const labels = element("div", "label-list");
    item.labels.slice(0, 5).forEach((label) => labels.append(element("span", "label-chip", label.name)));
    main.append(labels);
  }
  card.append(main);
  const badges = element("div", "badges");
  if (isHighPriority(item)) badges.append(element("span", "badge priority", "Prioritaire"));
  if (level === "alert") badges.append(element("span", "badge alert", "En retard"));
  else if (level === "warn") badges.append(element("span", "badge warn", "À traiter"));
  if (badges.children.length) card.append(badges);
  return card;
}

function appendItems(parent, items, pull = null, kind = undefined) {
  if (!items.length) {
    parent.append(emptyState("Rien à afficher", "Aucun élément ne correspond à ces filtres."));
    return;
  }
  const list = element("div", "work-list");
  items.forEach((item) => list.append(makeItemCard(item, pull === null ? Boolean(item.pull_request) : pull, kind)));
  parent.append(list);
}

function emptyState(title, detail) {
  const empty = element("div", "empty-state");
  empty.append(element("strong", "", title), element("span", "", detail));
  return empty;
}

function sectionHeading(title, detail, linkTab) {
  const heading = element("div", "section-heading");
  heading.append(element("h2", "", title));
  if (linkTab) {
    const link = element("a", "", detail);
    link.href = "#";
    link.addEventListener("click", (event) => {
      event.preventDefault();
      setTab(linkTab);
    });
    heading.append(link);
  } else {
    heading.append(element("p", "", detail));
  }
  return heading;
}

function makeStat(label, number, symbol, hint) {
  const card = element("article", "stat-card");
  const text = element("div");
  text.append(element("p", "stat-label", label), element("p", "stat-number", String(number)));
  if (hint) text.append(element("p", "stat-hint", hint));
  card.append(text, element("span", "stat-icon", symbol));
  return card;
}

function myIssues() {
  const me = login();
  return state.issues.filter((item) => item.assignees?.some((person) => person.login.toLocaleLowerCase() === me));
}

function myPulls() {
  const me = login();
  return state.pulls.filter((item) => people(item).includes(me));
}

function reviewPulls() {
  const me = login();
  return state.reviewRequests.filter((item) => item.user?.login?.toLocaleLowerCase() !== me);
}

function medianHint(days) {
  return days === null ? "Pas assez de données" : `Âge médian : ${formatDays(days)}`;
}

function renderStats() {
  const resolution = state.closedIssues.map((item) => ageDays(item, item.created_at, item.closed_at));
  const resolved = median(resolution);
  const grid = element("div", "stats-grid");
  grid.append(
    makeStat("PR à valider", reviewPulls().length, "✓", medianHint(median(reviewPulls().map((item) => ageDays(item))))),
    makeStat("Mes PR ouvertes", myPulls().length, "⑂", medianHint(median(myPulls().map((item) => ageDays(item))))),
    makeStat("Issues résolues (30 j)", state.closedIssues.length,
      "◉", resolved === null ? "Pas assez de données" : `Résolution médiane : ${formatDays(resolved)}`),
  );
  return grid;
}

function renderAlerts(parent, entries) {
  const urgent = entries.filter(({ item, kind }) => alertLevel(item, kind) === "alert");
  parent.append(sectionHeading("Alertes", `${urgent.length} élément(s) en retard`));
  if (!urgent.length) {
    parent.append(emptyState("Tout est à jour", "Aucun élément ne dépasse les seuils d’alerte."));
    return;
  }
  const list = element("div", "work-list");
  urgent.forEach(({ item, kind }) => list.append(makeItemCard(item, kind !== "issue", kind)));
  parent.append(list);
}

function thresholdLegend() {
  return element("p", "threshold-legend",
    `Seuils (à traiter / en retard) : PR à valider ${THRESHOLDS.review.warn} j / ${THRESHOLDS.review.alert} j · ` +
    `PR ${THRESHOLDS.pull.warn} j / ${THRESHOLDS.pull.alert} j · issues ${THRESHOLDS.issue.warn} j / ${THRESHOLDS.issue.alert} j.`);
}

function makeRepoCard(repo) {
  const card = element("article", "repo-card");
  const header = element("div", "repo-card-head");
  const link = element("a", "", repo.name);
  link.href = repo.html_url;
  link.target = "_blank";
  link.rel = "noreferrer";
  header.append(link, element("span", "", repo.language || "Dépôt"));
  card.append(header, element("p", "", repo.description || "Aucune description fournie."));
  const metadata = element("div", "repo-card-meta");
  const issueCount = state.issues.filter((item) => repoName(item) === repo.name).length;
  const pullCount = state.pulls.filter((item) => repoName(item) === repo.name).length;
  metadata.append(
    element("span", "", `${issueCount} issues ouvertes`),
    element("span", "", `${pullCount} PR ouvertes`),
    element("span", "", `Mis à jour le ${shortDate(repo.updated_at)}`),
  );
  card.append(metadata);
  return card;
}

function renderRepos(parent, repositories) {
  if (!repositories.length) {
    parent.append(emptyState("Aucun dépôt trouvé", "Essayez une autre recherche."));
    return;
  }
  const grid = element("div", "repo-grid");
  repositories.forEach((repo) => grid.append(makeRepoCard(repo)));
  parent.append(grid);
}

function requireUsername(parent) {
  parent.append(emptyState("Quel est votre identifiant GitHub ?", "Saisissez-le ci-dessus pour afficher ce qui vous concerne."));
}

function render() {
  content.replaceChildren();
  const messages = {
    today: ["Bonjour, voici votre journée.", "Ce que vous avez à faire aujourd’hui, du plus urgent au plus récent."],
    review: ["Pull requests à valider", "Les PR pour lesquelles on vous demande une review."],
    myissues: ["Mes issues", "Les issues ouvertes qui vous sont assignées."],
    mypulls: ["Mes pull requests", "Les PR que vous avez ouvertes ou qui vous sont assignées."],
    issues: ["Toutes les issues ouvertes", "Vue d’ensemble de l’organisation Pankosmia."],
    pulls: ["Toutes les pull requests ouvertes", "Vue d’ensemble de l’organisation Pankosmia."],
    repos: ["Les dépôts Pankosmia", "Explorez les projets publics et leur activité récente."],
  };
  document.querySelector("#page-title").textContent = messages[state.tab][0];
  document.querySelector("#page-description").textContent = messages[state.tab][1];
  document.querySelector("#breadcrumb-current").textContent = pageLabels[state.tab];
  toolbar.hidden = state.tab === "today";
  updateCounts();

  const mine = ["today", "review", "myissues", "mypulls"].includes(state.tab);
  if (mine && !login()) {
    requireUsername(content);
    return;
  }

  const byAge = (a, b) => new Date(a.created_at) - new Date(b.created_at);
  if (state.tab === "today") {
    const reviews = reviewPulls().sort(byAge);
    const pulls = myPulls().sort(byAge);
    const issues = myIssues().sort(byAge);
    content.append(renderStats());
    renderAlerts(content, [
      ...reviews.map((item) => ({ item, kind: "review" })),
      ...pulls.map((item) => ({ item, kind: "pull" })),
      ...issues.map((item) => ({ item, kind: "issue" })),
    ]);
    content.append(sectionHeading("PR à valider", `${reviews.length} en attente`, "review"));
    appendItems(content, reviews.slice(0, 5), true, "review");
    content.append(sectionHeading("Mes issues à faire", `${issues.length} assignée(s)`, "myissues"));
    appendItems(content, issues.slice(0, 5), false, "issue");
    content.append(sectionHeading("Mes pull requests", `${pulls.length} ouverte(s)`, "mypulls"));
    appendItems(content, pulls.slice(0, 5), true, "pull");
    content.append(thresholdLegend());
    return;
  }

  if (LIST_TABS.includes(state.tab)) {
    const sources = {
      review: [reviewPulls(), true, "review"],
      myissues: [myIssues(), false, "issue"],
      mypulls: [myPulls(), true, "pull"],
      issues: [state.issues, false, "issue"],
      pulls: [state.pulls, true, "pull"],
    };
    const [source, isPull, kind] = sources[state.tab];
    const items = filteredItems(source).sort(byAge);
    content.append(sectionHeading(`${items.length} élément(s)`, "Du plus ancien au plus récent"));
    appendItems(content, items, isPull, kind);
    content.append(thresholdLegend());
    return;
  }

  const query = state.search.trim().toLocaleLowerCase("fr");
  const repositories = state.repos.filter((repo) =>
    state.repo === "all" || repo.name === state.repo)
    .filter((repo) => !query || `${repo.name} ${repo.description || ""} ${repo.language || ""}`
      .toLocaleLowerCase("fr").includes(query));
  content.append(sectionHeading(`${repositories.length} dépôt(s)`, "Dépôts publics de l’organisation"));
  renderRepos(content, repositories);
}

function updateCounts() {
  const hasUser = Boolean(login());
  const counts = {
    "today-tab-count": hasUser ? reviewPulls().length + myIssues().length + myPulls().length : "—",
    "review-tab-count": hasUser ? reviewPulls().length : "—",
    "myissues-tab-count": hasUser ? myIssues().length : "—",
    "mypulls-tab-count": hasUser ? myPulls().length : "—",
  };
  Object.entries(counts).forEach(([id, value]) => { document.querySelector(`#${id}`).textContent = value; });
}

function fillSelect(select, allLabel, values) {
  const previous = select.value;
  select.replaceChildren(new Option(allLabel, "all"));
  [...new Set(values)].filter(Boolean).sort((a, b) => a.localeCompare(b, "fr")).forEach((value) => select.add(new Option(value, value)));
  select.value = [...select.options].some((option) => option.value === previous) ? previous : "all";
  return select.value;
}

function fillFilters() {
  const all = [...state.issues, ...state.pulls];
  state.person = fillSelect(personSelect, "Toutes les personnes", all.flatMap(people));
  state.label = fillSelect(labelSelect, "Tous les labels", all.flatMap((item) => (item.labels || []).map((label) => label.name)));
  state.milestone = fillSelect(milestoneSelect, "Tous les milestones", all.map((item) => item.milestone?.title));
}

function setTab(tab) {
  state.tab = tab;
  [[personSelect, "person"], [labelSelect, "label"], [milestoneSelect, "milestone"], [prioritySelect, "priority"]]
  .forEach(([select, key]) => select.addEventListener("change", () => {
    state[key] = select.value;
    render();
  }));
tabs.forEach((button) => {
    const selected = button.dataset.tab === tab;
    button.classList.toggle("active", selected);
    if (selected) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  render();
}

async function getJson(url) {
  const response = await fetch(url, { headers: { Accept: "application/vnd.github+json" } });
  if (!response.ok) {
    if (response.status === 403 || response.status === 429) {
      throw new Error("Limite de requêtes GitHub atteinte. Attendez un peu, puis actualisez.");
    }
    throw new Error(`GitHub a répondu avec l’erreur ${response.status}.`);
  }
  return response.json();
}

async function getSearchResults(query) {
  const results = [];
  let total = 0;
  for (let page = 1; page <= 10; page += 1) {
    const params = new URLSearchParams({ q: query, per_page: "100", page: String(page) });
    const response = await getJson(`${API_ROOT}/search/issues?${params}`);
    total = response.total_count;
    results.push(...response.items);
    if (results.length >= total || response.items.length < 100) break;
  }
  return results;
}

async function loadDashboard() {
  const refresh = document.querySelector("#refresh-button");
  errorMessage.hidden = true;
  statusText.textContent = "Actualisation des données publiques…";
  statusDot.classList.remove("online");
  refresh.disabled = true;
  refresh.setAttribute("aria-busy", "true");
  content.replaceChildren(element("div", "loading-state", "Chargement des données publiques de Pankosmia…"));

  try {
    const me = login();
    const since = new Date(Date.now() - 30 * DAY).toISOString().slice(0, 10);
    const [repos, issues, pulls, reviews, closed] = await Promise.all([
      getJson(`${API_ROOT}/orgs/${ORGANIZATION}/repos?per_page=100&sort=updated`),
      getSearchResults(`org:${ORGANIZATION} is:open is:issue`),
      getSearchResults(`org:${ORGANIZATION} is:open is:pr`),
      me ? getSearchResults(`org:${ORGANIZATION} is:open is:pr review-requested:${me}`) : [],
      me ? getSearchResults(`org:${ORGANIZATION} is:issue is:closed assignee:${me} closed:>=${since}`) : [],
    ]);
    state.reviewRequests = reviews;
    state.closedIssues = closed;
    fillFilters();
    state.repos = repos;
    state.issues = issues.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
    state.pulls = pulls.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
    document.querySelector("#issue-tab-count").textContent = state.issues.length;
    document.querySelector("#pull-tab-count").textContent = state.pulls.length;
    document.querySelector("#repo-tab-count").textContent = state.repos.length;
    const previousRepo = repoSelect.value;
    repoSelect.replaceChildren(new Option("Tous les dépôts", "all"));
    state.repos.forEach((repo) => repoSelect.add(new Option(repo.name, repo.name)));
    repoSelect.value = state.repos.some((repo) => repo.name === previousRepo) ? previousRepo : "all";
    state.repo = repoSelect.value;
    statusText.textContent = "Données publiques à jour";
    statusDot.classList.add("online");
    render();
  } catch (error) {
    statusText.textContent = "Données indisponibles";
    errorMessage.textContent = `${error.message} Vérifiez votre connexion et réessayez.`;
    errorMessage.hidden = false;
    content.replaceChildren(emptyState("Impossible de charger les données", "Le tableau de bord lit les données publiques de GitHub ; aucune modification n’est effectuée."));
  } finally {
    refresh.disabled = false;
    refresh.removeAttribute("aria-busy");
  }
}

try {
  state.username = localStorage.getItem("pankosmia-dashboard-username") || "";
} catch {
  state.username = "";
}
let reloadTimer;
usernameInput.value = state.username;
usernameInput.addEventListener("input", () => {
  state.username = usernameInput.value.trim();
  try {
    localStorage.setItem("pankosmia-dashboard-username", state.username);
  } catch {
    // The dashboard remains usable when browser storage is unavailable.
  }
  render();
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(loadDashboard, 700);
});
searchInput.addEventListener("input", () => {
  state.search = searchInput.value;
  render();
});
repoSelect.addEventListener("change", () => {
  state.repo = repoSelect.value;
  render();
});
tabs.forEach((button) => button.addEventListener("click", () => setTab(button.dataset.tab)));
document.querySelector("#refresh-button").addEventListener("click", loadDashboard);

render();
loadDashboard();
