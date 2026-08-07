# Fork Architecture Guidelines

This fork treats VirtualTabletop as shared infrastructure for multiple game packages. Platform changes are allowed when they expose genuinely reusable capabilities, but game-specific behavior should remain in the game package that consumes those capabilities.

## Platform boundary

Prefer changing VirtualTabletop when a capability describes a general platform fact or service that could reasonably be useful to more than one game. Typical examples include player/session identity, networking, synchronization, voice state, media transport, camera/navigation primitives, generic admin inspection, input/device state, and reusable extension hooks.

Do not add game-specific semantics to the platform. Concepts such as named roles, turn states, skill rules, special zones, card meanings, faction/identity logic, or a particular game's visual treatment belong in that game's package.

## Design rule for new platform APIs

When a game needs information that only the platform can know, add the smallest stable game-agnostic API/event needed to expose that information, then implement the concrete behavior in the game package.

Example: if a game wants to highlight the player who is currently speaking, speaking detection belongs to the VTT voice layer. VTT may expose a generic participant-speaking state/event containing platform-level identifiers such as player/session and speaking=true/false. The game package decides whether that means highlighting a seat, animating an avatar, showing an icon, or doing nothing.

Good platform API:

```text
voiceParticipantSpeakingChanged({ player, sessionID, speaking })
```

Bad platform API:

```text
highlightSanguoshaSeatWhenSpeaking(...)
```

## Decision checklist

Before changing VTT, ask:

1. Could another VTT game reasonably use this capability?
2. Does it describe platform infrastructure or state rather than one game's rules/presentation?
3. Can VTT expose a narrow generic primitive while leaving the concrete behavior to the game package?

If the answers support a platform change, implement the smallest reusable interface rather than a game-specific shortcut. If the requirement is mainly rules, presentation, terminology, or workflow unique to one game, keep it in that game package.

The goal is not to freeze VTT, and not to make every feature depend on VTT changes. The goal is a clean dependency direction: VTT provides reusable infrastructure; game packages declare configuration and consume generic capabilities to implement game-specific behavior.
