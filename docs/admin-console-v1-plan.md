# Admin Console V1 plan

## Goal

Add a separate, read-only room inspection page that can be opened in another browser tab without joining the room as a player. Keep V1 small while leaving a clean path to a dedicated observer transport and a single server password later.

## V1 scope

- Add a standalone `admin.html` page served by the existing static client hosting.
- Open a room by query parameter, for example `/admin.html?room=ABCD`.
- Reuse the existing read-only `GET /state/:room` endpoint on a short polling interval.
- Keep the admin page completely separate from the tabletop UI and player lifecycle.
- Read game-defined panel declarations from a hidden `admin-console-config` state widget.
- Implement one generic panel type: `holderInspector`.
- For a holder inspector, show direct-child structure, recursively flattened physical card order, card metadata resolved through deck/cardType, and current z/parent values.
- Keep the transport behind a small state-source abstraction so polling can later be replaced with an observer WebSocket without changing panel rendering.

## Why a config widget

The existing public room-state endpoint intentionally returns only limited `_meta` data, so game-specific admin declarations cannot depend on `_meta.info`. A hidden normal state widget survives the same read-only state transport as the objects being inspected and requires no server protocol change.

## Explicit non-goals for V1

- No player/admin account model.
- No write operations from the admin page.
- No shuffle/event history yet.
- No arbitrary JavaScript supplied by a game package.
- No UI-only password that would give a false sense of security while `/state/:room` remains directly readable.

## Authentication direction

If/when the admin transport is isolated from the public state endpoint, add one optional server-level `adminPassword` only. Do not introduce users, roles, or per-room accounts unless a future requirement proves they are needed.

## Game package contract

Games may add one hidden state widget containing data-only declarations:

```json
{
  "id": "admin-console-config",
  "type": "basic",
  "display": false,
  "adminPanels": [
    {
      "id": "draw-pile-audit",
      "type": "holderInspector",
      "title": "Draw pile audit",
      "holder": "draw-pile"
    }
  ]
}
```

VTT owns rendering and validation. Game files choose what to inspect but cannot inject admin-side JavaScript.

## Extension path

1. Replace polling state source with a dedicated read-only observer WebSocket.
2. Add optional single-password authentication at the server boundary.
3. Add semantic engine events such as shuffle/move audit records.
4. Add more safe declarative panel types.

## Acceptance criteria

- Opening the admin page does not create a VTT player or occupy a seat.
- The page tracks room changes without reloading.
- A declared holder panel shows the real current top-to-bottom physical card order.
- Existing tabletop behavior and WebSocket player protocol remain unchanged.
