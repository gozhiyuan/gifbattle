import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
export const workingCatalogPath=workspace=>resolve(workspace,'media-work/catalog.json');
// A tiny checked-in fixture bootstraps new checkouts. All growing inventory is ignored.
export const catalogPath=workspace=>existsSync(workingCatalogPath(workspace))?workingCatalogPath(workspace):resolve(workspace,'public/media/catalog.json');
