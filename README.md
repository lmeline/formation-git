# Pankosmia — mon espace de travail

Un tableau de bord personnel pour suivre les dépôts publics, issues et pull requests ouvertes de l’organisation [pankosmia](https://github.com/pankosmia). L’interface est en français et organise le travail avec des onglets : Ma journée, Issues, Pull requests et Dépôts.

## Démarrer

Ouvrez `index.html` dans un navigateur, ou servez ce dossier localement :

```sh
python3 -m http.server 8000
```

Puis visitez <http://localhost:8000>.

Indiquez votre identifiant GitHub pour mettre en avant les éléments qui vous sont assignés. La recherche et le filtre par dépôt s’appliquent aux listes d’issues et de pull requests.

## Données et confidentialité

Le tableau de bord récupère les dépôts publics et les éléments ouverts depuis l’API publique GitHub. Il ne nécessite pas de jeton, n’effectue aucune écriture et ne peut pas afficher les dépôts privés. L’identifiant saisi reste dans le navigateur ; aucune donnée n’est envoyée ailleurs que dans les requêtes de lecture à `api.github.com`.

L’accès anonyme à l’API GitHub est soumis à une limite de requêtes. En cas de dépassement, attendez avant de réessayer.
