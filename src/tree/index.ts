// MOD-Tree — row model, RULE-12 groups, virtual list, copy/reveal (ADR-0007). Lazy chunk: loaded
// the first time the tree view is shown, not part of the startup critical path (NFR-05).
import './tree.css';

export { mountTree, type TreeDeps, type TreeHandle } from './view';
export { RowModel, geometry, MAX_SPACER, type Row } from './rowmodel';
