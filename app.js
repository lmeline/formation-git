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
};

const content = document.querySelector("#dashboard-content");
const tabs = [...document.querySelectorAll("[data-tab]")];
const usernameInput = document.querySelector("#username-input");
const searchInput = document.querySelector("#search-input");
const repoSelect = document.querySelector("#repo-select");
const errorMessage = document.querySelector("#error-message");
const statusText = document.querySelector("#connection-status");
const statusDot = document.querySelector(".status-dot");

const pageLabels = {
  today: "Ma journée",
  issues: "Issues",
  pulls: "Pull requests",
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

function filteredItems(items) {
  const query = state.search.trim().toLocaleLowerCase("fr");
  return items.filter((item) => {
    if (state.repo !== "all" && repoName(item) !== state.repo) return false;
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

function makeItemCard(item, pull = Boolean(item.pull_request)) {
  const card = element("article", "item-card");
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
  metadata.append(element("span", "", `Mis à jour le ${shortDate(item.updated_at)}`));
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
  return card;
}

function appendItems(parent, items, pull = null) {
  if (!items.length) {
    parent.append(emptyState("Rien à afficher", "Aucun élément ne correspond à ces filtres."));
    return;
  }
  const list = element("div", "work-list");
  items.forEach((item) => list.append(makeItemCard(item, pull === null ? Boolean(item.pull_request) : pull)));
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

function makeStat(label, number, symbol) {
  const card = element("article", "stat-card");
  const text = element("div");
  text.append(element("p", "stat-label", label), element("p", "stat-number", String(number)));
  card.append(text, element("span", "stat-icon", symbol));
  return card;
}

function renderStats() {
  const grid = element("div", "stats-grid");
  grid.append(
    makeStat("Issues ouvertes", state.issues.length, "◉"),
    makeStat("Pull requests ouvertes", state.pulls.length, "⑂"),
    makeStat("Dépôts publics", state.repos.length, "▦"),
  );
  return grid;
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

function render() {
  content.replaceChildren();
  const title = document.querySelector("#page-title");
  const description = document.querySelector("#page-description");
  const breadcrumb = document.querySelector("#breadcrumb-current");
  const messages = {
    today: ["Bonjour, organisons la journée.", "Un aperçu clair de vos issues, pull requests et dépôts."],
    issues: ["Issues ouvertes", "Suivez les demandes et problèmes des dépôts Pankosmia."],
    pulls: ["Pull requests ouvertes", "Retrouvez les changements en cours dans l’organisation."],
    repos: ["Les dépôts Pankosmia", "Explorez les projets publics et leur activité récente."],
  };
  title.textContent = messages[state.tab][0];
  description.textContent = messages[state.tab][1];
  breadcrumb.textContent = pageLabels[state.tab];
  if (state.tab === "today") {
    content.append(renderStats());
    const username = state.username.trim().replace(/^@/, "").toLocaleLowerCase();
    if (!username) {
      content.append(sectionHeading("Votre espace de travail", "Personnalisez votre suivi"));
      content.append(emptyState("Quel est votre identifiant GitHub ?", "Saisissez-le ci-dessus pour mettre en avant les issues et pull requests qui vous sont assignées."));
      content.append(sectionHeading("Activité récente", "Derniers éléments mis à jour"));
      appendItems(content, [...state.issues, ...state.pulls]
        .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
        .slice(0, 5));
      return;
    }
    const assignedIssues = filteredItems(state.issues.filter((item) =>
      item.assignees?.some((person) => person.login.toLocaleLowerCase() === username)));
    const assignedPulls = filteredItems(state.pulls.filter((item) =>
      item.user?.login?.toLocaleLowerCase() === username ||
      item.assignees?.some((person) => person.login.toLocaleLowerCase() === username)));
    content.append(sectionHeading("Mes issues", `${assignedIssues.length} assignée(s)`, "issues"));
    appendItems(content, assignedIssues);
    content.append(sectionHeading("Mes pull requests", `${assignedPulls.length} assignée(s)`, "pulls"));
    appendItems(content, assignedPulls, true);
    return;
  }

  if (state.tab === "issues" || state.tab === "pulls") {
    const isPull = state.tab === "pulls";
    const items = filteredItems(isPull ? state.pulls : state.issues);
    content.append(sectionHeading(`${items.length} élément(s)`, "Éléments ouverts · triés par mise à jour"));
    appendItems(content, items, isPull);
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

function setTab(tab) {
  state.tab = tab;
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
    const [repos, issues, pulls] = await Promise.all([
      getJson(`${API_ROOT}/orgs/${ORGANIZATION}/repos?per_page=100&sort=updated`),
      getSearchResults(`org:${ORGANIZATION} is:open is:issue`),
      getSearchResults(`org:${ORGANIZATION} is:open is:pr`),
    ]);
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
usernameInput.value = state.username;
usernameInput.addEventListener("input", () => {
  state.username = usernameInput.value.trim();
  try {
    localStorage.setItem("pankosmia-dashboard-username", state.username);
  } catch {
    // The dashboard remains usable when browser storage is unavailable.
  }
  if (state.tab === "today") render();
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
