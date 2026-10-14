# Design sources

The designs were published as claude.ai artifacts from the work Claude account. Artifacts can't be moved between accounts, so the source files are kept here and can be republished from the personal account (`claude-personal`).

| Folder | Published as (work account) | What it is |
|---|---|---|
| `canvas/` | JSON Formatter Designs, https://claude.ai/artifact/8xP24369wHcxHjdw7QtKgW (v75) | The approved design canvas (G2): 44 boards plus `canvas.json` (pages, layout); `support.js` comes from the Design type |
| `style-directions/index.html` | JSON Formatter Styles, https://claude.ai/artifact/LkKrHevgjd7DKgGsZP5uUS | The three style directions (A Workbench was chosen, D-010) |

To republish from the personal account, start `claude-personal` in this folder and ask Claude to:
- publish `design/style-directions/index.html` as a new artifact;
- recreate the canvas from the Design type with the files in `design/canvas/`.

Then update `design_canvas_url` and `style_directions_url` in `.build-my-app/state.json` to the new links.
