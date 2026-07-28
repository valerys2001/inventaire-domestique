import type { ReactNode } from 'react';
import type { LiquidFolder } from '@inventaire/shared';
import '../../styles/LiquidFolders.css';

interface LiquidFoldersProps<T> {
  folders: Array<LiquidFolder<T>>;
  /** Doit renvoyer un élément <li> (avec sa propre key) : les dossiers/sous-groupes ne sont que des séparateurs visuels autour de <ul>. */
  renderItem: (item: T) => ReactNode;
}

/**
 * Rendu commun des "dossiers" liquides (par nom de produit, sous-groupés par taille de
 * contenant) — partagé entre Inventaire, Besoins, Sortie et Construction de liste pour que le
 * regroupement reste identique partout (cf. discussion sur le classement par taille de contenant).
 */
export function LiquidFolders<T>({ folders, renderItem }: LiquidFoldersProps<T>) {
  return (
    <>
      {folders.map((folder) => (
        <div key={folder.nom} className="liquid-folder">
          <h2 className="liquid-folder__title">{folder.nom}</h2>
          {folder.sizeGroups.map((group, index) => (
            <div key={index} className="liquid-folder__size-group">
              <h3 className="liquid-folder__size-title">
                {group.contenanceUnitaire !== null ? `Format ${group.contenanceUnitaire} L` : 'Format inconnu'}
              </h3>
              <ul className="liquid-folder__items">{group.lines.map((item) => renderItem(item))}</ul>
            </div>
          ))}
        </div>
      ))}
    </>
  );
}
