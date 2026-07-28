# Checklist de recette manuelle — Inventaire Domestique

Cette checklist couvre tout ce qui ne peut pas (ou ne doit pas) être vérifié par des
tests automatisés : auth Google réelle, permissions caméra sur vrai matériel,
installation PWA, comportement réseau réel, et l'extension Chrome. Les règles de
fusion/calcul de quantités (packages/shared) sont couvertes par des tests unitaires
(`npm run test:shared`) et ne sont testées ici que sur appareil réel, en re-vérification
de non-régression.

Convention : chaque case à cocher décrit une action ET son résultat attendu explicite.
Cocher uniquement si le résultat attendu est observé tel quel.

## 1. Installation PWA

### iOS Safari
- [ ] Ouvrir l'URL de l'app dans Safari iOS, appuyer sur Partager > "Sur l'écran d'accueil" → une icône avec le bon visuel (icône `icon-192`/`icon-512`, fond `#1b5e20`) apparaît sur l'écran d'accueil, avec le nom court "Inventaire".
- [ ] Lancer l'app depuis cette icône → l'app s'ouvre en mode standalone : aucune barre d'adresse ni barre d'onglets Safari visible.
- [ ] Vérifier la couleur de la barre de statut/thème (`theme_color: #1b5e20`) → cohérente avec le design, pas de bande blanche ou noire incongrue en haut d'écran.
- [ ] Fermer l'app puis la relancer depuis l'icône (pas depuis Safari) → l'inventaire déjà en cache s'affiche immédiatement, sans écran blanc prolongé.

### Android Chrome
- [ ] Ouvrir l'URL dans Chrome Android → une bannière d'installation apparaît OU l'option "Installer l'application" est présente dans le menu ⋮.
- [ ] Installer l'app → une icône est créée sur l'écran d'accueil / dans le tiroir d'applications, avec le bon visuel.
- [ ] Lancer l'app installée → elle s'ouvre en mode standalone (pas de barre d'adresse Chrome visible, pas de bouton "Retour" du navigateur superflu).
- [ ] Vérifier que le splash screen généré automatiquement (nom + icône + `background_color: #ffffff`) s'affiche brièvement au lancement, sans erreur visuelle.

## 2. Mode offline

- [ ] Couper le réseau (mode avion ou throttling "Offline" des devtools), faire une **entrée** de stock manuelle → la ligne apparaît immédiatement dans la liste (mise à jour optimiste), et le compteur "X en attente de synchronisation" s'incrémente de 1 sans délai perceptible.
- [ ] Toujours hors ligne, faire une **sortie** de stock sur cette même ligne → la quantité affichée décrémente immédiatement, le compteur "en attente" s'incrémente à nouveau (2 opérations en file).
- [ ] Rétablir le réseau avec un token Google déjà en cache (utilisateur déjà connecté récemment) → la synchronisation automatique se déclenche sans action de l'utilisateur (écouteur `online`), le compteur "en attente" retombe à 0, et les valeurs restent cohérentes après le flush (pas de double-comptage).
- [ ] Rétablir le réseau **sans aucun token en cache** (ex. après expiration ou session jamais authentifiée) → l'app n'échoue pas silencieusement : le compteur "en attente" reste visible et non nul, et un moyen explicite existe pour l'utilisateur de relancer une synchronisation interactive (bouton "Synchroniser maintenant" dans Réglages / bouton ⟳ dans la liste), qui déclenche alors le popup de consentement Google.
- [ ] Couper le réseau **pendant** qu'un flush est en cours (plusieurs opérations en file, couper juste après le démarrage de la synchronisation) → aucune opération n'est perdue : l'opération en cours d'envoi au moment de la coupure reste dans la file (elle n'est retirée d'IndexedDB qu'après confirmation serveur réussie, cf. `removePendingOperation` appelé seulement après succès de `upsertInventoryLine` + `appendMovement`). Au retour du réseau, un nouveau flush la reprend et la mène à bien, sans duplication ni perte.
- [ ] Vérifier qu'un rechargement complet de la page (F5 / fermeture-réouverture) pendant que des opérations sont en attente ne les fait pas disparaître → le compteur "en attente" affiche toujours le même nombre après rechargement, et les données optimistes restent visibles dans la liste (persistance IndexedDB).

## 3. Scan de code-barre

- [ ] Scanner un produit alimentaire présent sur Open Food Facts (ex. eau minérale connue) → le formulaire se pré-remplit (nom, marque, contenance, catégorie suggérée, image) avec le titre "Confirmez le produit détecté".
- [ ] Scanner un cosmétique présent uniquement sur Open Beauty Facts (pas sur OFF) → la cascade OFF→OBF fonctionne : le formulaire se pré-remplit correctement via OBF, catégorie suggérée = "Cosmétiques / hygiène".
- [ ] Scanner un code-barre introuvable sur les 3 bases (OFF/OBF/OPF) → bascule automatique en saisie manuelle, code-barre pré-rempli dans le champ correspondant, titre "Produit inconnu — complétez les informations", tous les autres champs vides.
- [ ] Refuser la permission caméra (ou la révoquer dans les réglages système puis relancer le scan) → message clair affiché ("Accès à la caméra refusé ou indisponible...") avec repli explicite vers la saisie manuelle, pas d'écran bloqué/blanc. **À re-tester sur vrais appareils iOS et Android** : le comportement de la Permissions API et les noms d'exceptions (`NotAllowedError`, etc.) diffèrent parfois de Chrome desktop utilisé en dev.
- [ ] Sur iOS Safari spécifiquement, vérifier que le flux vidéo démarre bien avec `playsInline` (pas de passage plein écran natif imposé par iOS) et que couper l'onglet/l'app coupe effectivement la caméra (pas de LED caméra allumée en arrière-plan).

## 4. Unités non standards

- [ ] Créer/scanner un produit exprimé en `%` (ex. flacon de crème solaire, "% restant") → le sélecteur d'unité affiche bien un slider 0–100 avec pas de 5, et la valeur affichée porte le suffixe "%".
- [ ] Scanner un produit dont la contenance n'a pas pu être parsée automatiquement (`quantity_raw` dans un format non reconnu, ex. "lot de plusieurs pièces") → le champ contenance unitaire reste vide et modifiable manuellement, sans blocage de la soumission une fois rempli.
- [ ] Saisir une quantité très petite (ex. `0.001` L ou `0.001` kg) → acceptée, stockée et affichée sans être arrondie à 0 (vérifier `roundForDisplay` : arrondi à 2 décimales, donc `0.001` s'affiche `0` à l'écran — noter si ce comportement d'affichage est le comportement voulu ou surprend l'utilisateur en pratique).
- [ ] Saisir une quantité très grande (ex. `10000`) → acceptée sans dépassement visuel dans la liste (troncature de texte, débordement de layout) ni erreur de calcul.
- [ ] Vérifier qu'une contenance ou un nombre de contenants à 0 ou négatif est bien rejeté par le formulaire de saisie manuelle (le bouton "Ajouter au stock" ne doit pas déclencher `computeDeltaFromPack` avec une valeur invalide qui lèverait une exception non gérée dans l'UI).

## 5. Règle de fusion/séparation (§3bis) — re-vérification sur appareil réel

- [ ] Sur un appareil réel (pas seulement en dev desktop) : saisir un pack de 6×1.5 L d'une marque, puis scanner/saisir une bouteille seule de 1.5 L de la même marque → fusion silencieuse en une seule ligne, toast "+1.5 litres ajoutés à ..." affiché, quantité totale correcte.
- [ ] Sur le même appareil, saisir un produit identique (même nom/marque) mais en contenance différente (33 cl vs 50 cl) → **deux lignes distinctes** dans l'inventaire, pas de fusion.
- [ ] **Risque de régression explicitement à surveiller** : cliquer "Annuler la fusion" sur le toast après une fusion → la ligne fusionnée retrouve sa quantité précédente (delta retiré), et **aucune ligne dupliquée n'apparaît** dans la liste (une ancienne version du code avait recréé une seconde ligne au lieu de simplement retirer le delta sur la ligne existante — vérifier qu'il n'y a toujours qu'une seule ligne pour cette `cle_fusion` après annulation).
- [ ] Laisser le toast expirer sans cliquer "Annuler" (6 secondes) → le toast disparaît de lui-même, la fusion reste appliquée, aucune ligne fantôme.
- [ ] Après un "Annuler la fusion", vérifier le compteur "en attente de synchronisation" : l'annulation doit elle-même être mise en file (une opération de sens inverse), pas juste un rollback local silencieux qui désynchroniserait le Sheet au prochain flush.

## 6. Multi-appareils / édition concurrente

- [ ] Sur l'appareil A, passer hors-ligne puis faire une entrée de +2 unités sur un produit existant.
- [ ] Pendant ce temps, sur l'appareil B (en ligne), faire une entrée de +3 unités sur ce même produit et laisser la synchronisation se faire normalement.
- [ ] Repasser l'appareil A en ligne et déclencher/laisser la synchronisation automatique se faire → le total final dans le Sheet doit refléter la somme des deux deltas (valeur de départ + 2 + 3), **sans qu'aucun des deux appareils n'écrase la contribution de l'autre**. (Le mécanisme attendu : le flush relit la ligne serveur par `cle_fusion` juste avant d'appliquer son propre delta, cf. `flushOne` dans `offlineQueue.ts` — à valider en conditions réelles, pas seulement en lecture de code.)
- [ ] Vérifier le journal `Mouvements` après ce scénario → deux entrées distinctes apparaissent (une par appareil), avec le bon `utilisateur` pour chacune, permettant de tracer qui a fait quoi.
- [ ] Rejouer le même scénario mais avec les deux appareils hors-ligne simultanément puis reconnectés l'un après l'autre → même résultat final (additivité), indépendamment de l'ordre de reconnexion.

## 7. Extension Chrome

- [ ] **Prérequis à valider avant ce bloc** : les sélecteurs DOM dans `apps/chrome-extension/content-scripts/chronodrive-scraper.ts` (`ARTICLE_CONTAINER_SELECTORS`, `FIELD_SELECTORS`) sont des suppositions non vérifiées contre le DOM réel de chronodrive.com (voir commentaire en tête de fichier) — inspecter une vraie page de panier/commande Chronodrive et ajuster ces sélecteurs avant de considérer ce bloc comme testable en conditions réelles.
- [ ] Charger l'extension en mode développeur (`chrome://extensions` → Mode développeur → "Charger l'extension non empaquetée") → l'extension apparaît sans erreur de manifeste, icône visible dans la barre d'outils.
- [ ] Ouvrir le popup de l'extension, renseigner l'ID du Google Sheet → sauvegardé (vérifiable en rouvrant le popup après fermeture).
- [ ] Se connecter avec un compte Google via le flux `chrome.identity.getAuthToken` (interactif) → consentement demandé pour le scope Sheets, jeton obtenu sans erreur.
- [ ] Aller sur une page de panier/commande Chronodrive réelle → le bouton flottant "Importer vers l'inventaire" apparaît en bas à droite de la page.
- [ ] Cliquer sur le bouton → les articles détectés sont listés/comptés correctement (nombre d'articles affiché cohérent avec le contenu réel du panier), puis importés dans le Sheet.
- [ ] Vérifier dans le Sheet `Inventaire` que les nouvelles lignes utilisent bien la catégorie par défaut (`epicerie_salee`) et l'unité par défaut (`unite`), et que le journal `Mouvements` correspondant porte un commentaire signalant explicitement "catégorie par défaut à vérifier dans la PWA".
- [ ] Ouvrir la PWA et recatégoriser manuellement un produit importé par l'extension → la catégorie se met à jour correctement et la ligne apparaît désormais dans le bon filtre de catégorie.
- [ ] Réimporter le même panier (ou relancer l'import) → les articles déjà présents fusionnent (cumul de quantité) plutôt que de créer des doublons, via la même `cle_fusion` que la PWA utiliserait pour ce produit/marque/contenance.

## 8. Stock bas

- [ ] Faire descendre la quantité d'une ligne en dessous du seuil par défaut de son unité (ex. moins d'1 contenant pour un produit en litres, moins de 100 g pour un produit en grammes, moins de 1 unité, moins de 15% restant) → le badge/indicateur visuel "Stock bas" apparaît sur cette ligne dans la liste d'inventaire.
- [ ] Configurer un `seuil_alerte` personnalisé sur une ligne (différent du seuil par défaut de son unité) → l'indicateur "Stock bas" respecte ce seuil personnalisé et non plus le seuil par défaut.
- [ ] Faire remonter la quantité au-dessus du seuil (nouvelle entrée) → le badge "Stock bas" disparaît immédiatement.
- [ ] Vérifier le cas limite : quantité exactement égale au seuil (`quantite_totale === seuil`) → le badge doit s'afficher (comparaison `<=`, pas `<`), à confirmer visuellement que ce choix de bord est bien celui voulu.
