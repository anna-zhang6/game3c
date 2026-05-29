# DESIGN.md — Foodie Chase: Game Design Document

> **Purpose:** This document describes the game design of *Foodie Chase* completely enough that the game can be re-implemented from scratch given this document, the level file (`Game3.tmj`), the tileset image (`tilemap_packed.png`), the character spritesheet, and the audio assets. Implementation technology is noted where it affects behavior, but technology choices are not prescribed.

---

## 1. Game Overview

**Title:** Foodie Chase  
**Genre:** 2D side-scrolling platformer  
**Perspective:** Side view, single screen width visible at a time (camera follows player)  
**Win Condition:** Reach the goal portal before the hunger meter empties  
**Lose Condition:** Hunger meter reaches zero  
**Restart:** Press R at any time during or after the game to restart the level from the beginning  

### Core Loop
The player navigates a horizontally scrolling platformer level while managing a steadily draining hunger meter. Collecting food items slows the drain. Powerup items temporarily improve jumping ability; slowdown items temporarily impair movement. The goal is to reach a hidden portal zone before starving.

---

## 2. Canvas and Display

| Property | Value |
|----------|-------|
| Canvas width | 1440 px |
| Canvas height | 900 px |
| Renderer | Pixel art mode (no smoothing/anti-aliasing on scaled sprites) |
| Camera zoom | 2.5× (the tilemap world is rendered at 2.5× its native pixel size) |
| Camera follow | Smooth lerp follow: lerp X = 0.25, lerp Y = 0.25 |
| Camera deadzone | 10 × 10 px (player must move this far from center before camera moves) |
| Camera bounds | Clamped to the tilemap world bounds (player cannot scroll past the map edges) |

---

## 3. Scene / Screen Structure

The game has three screens that play in sequence:

### 3.1 Opening / Instructions Screen
Displayed on launch. Purple background (`#9b48b1`).  
Shows:
- Game title: **FOODIE CHASE**
- Subtitle: *"Survive hunger and reach the portal!"*
- Three item explanations (with sprite icons from the tileset):
  - **FOOD** (tileset frame 13): "Restores hunger meter / Keeps you alive longer"
  - **POWERUP** (tileset frame 107): "Temporarily boosts jump height"
  - **SLOWDOWN** (tileset frame 90): "Reduces movement speed and acceleration"
- Controls reminder: "Arrow Keys to Move and Jump"
- A blinking **PRESS SPACE TO START** prompt (fades to 30% alpha and back over 800 ms, loops)

**Transition:** Press Spacebar → Loading screen → Gameplay

### 3.2 Loading Screen
Invisible to the player (no visible UI). Loads all assets and creates all shared animations, then immediately transitions to the gameplay scene.

### 3.3 Gameplay Scene
The main game. See all subsequent sections.

---

## 4. Level / World

### 4.1 Tilemap
| Property | Value |
|----------|-------|
| Map file | `assets/Game3.tmj` (Tiled JSON format) |
| Tile size | 18 × 18 px (native, before camera zoom) |
| Map width | 120 tiles |
| Map height | 25 tiles |
| World pixel size | 2160 × 450 px (native); 5400 × 1125 px at 2.5× zoom |
| Tileset image | `assets/tilemap_packed.png` |
| Tileset name (in Tiled) | `tilemap_packed` |
| Tileset frame size | 18 × 18 px |

### 4.2 Tilemap Layers
The map has the following layers, listed back to front:

| Layer name (in Tiled) | Type | Purpose | Collision |
|-----------------------|------|---------|-----------|
| `background` | Tile layer | Decorative backdrop | None |
| `ground-n-platform` | Tile layer | Solid terrain and static platforms | Yes — tiles with property `collides: true` are solid |

All tiles that should block the player must have the custom tile property `collides` set to `true` in Tiled.

### 4.3 Moving Platforms
Moving platforms are **ordinary tiles on the `ground-n-platform` layer** that have the custom tile property `moving: true` set in Tiled.

At runtime they are handled as follows:
1. The tile is removed from the tile layer (so it does not also act as a static collider).
2. A physics sprite is created at the exact center pixel of that tile, using the same tile image.
3. The sprite is set as immovable (it cannot be pushed by the player) and exempt from gravity.
4. The sprite is tweened **vertically only**: it oscillates 48 px upward from its spawn position and back, over a period of **2000 ms per half-cycle** (so a full up-and-down cycle takes 4000 ms), with **linear easing**, looping indefinitely.
5. Full solid collision is registered between the player and all moving platform sprites.
6. **Carrier behavior:** While the player is standing on a moving platform, the player's Y position is nudged each frame by the platform's current Y velocity × `(1/60)` to approximate being carried. *(Note: this is an approximation tied to 60 Hz; a re-implementation should use the actual elapsed delta time for accuracy.)*

### 4.4 Object Layers
The map contains the following Tiled object layers used to place game entities:

| Layer name | Object name property | Entity type |
|------------|---------------------|-------------|
| `powerups` | `powerup` | Jump-boost collectible |
| `slowdowns` | `slowdowns` | Movement-impair collectible |
| `food` | `food` | Hunger-restore collectible |
| `goal` | `goal` | Win trigger zone (invisible) |

All objects are loaded by their layer name and filtered by their `name` property. Each collectible is given a static (non-moving) physics body for overlap detection. The goal zone object is invisible (no sprite rendered).

---

## 5. Player Avatar

### 5.1 Sprite
| Property | Value |
|----------|-------|
| Spritesheet atlas | `assets/spritesheet-characters-double.png` + `spritesheet-characters-double.xml` |
| Atlas key | `myAtlas` |
| Default frame | `character_beige_idle` |
| Render scale | 0.11 (the source art is large; it is scaled down to fit the 18 px tile grid) |
| Origin | Center: (0.5, 0.5) |
| Spawn position | Approximately tile column 9, tile row 5 (derived from `canvas_width / 13`, `canvas_height / 5` at 1440 × 900) |

### 5.2 Physics Body
| Property | Value |
|----------|-------|
| Body type | Dynamic arcade body |
| Hitbox size (standing) | 150 × 210 (in the sprite's unscaled coordinate space, centered) |
| Hitbox size (ducking) | 150 × 140 (in the sprite's unscaled coordinate space, centered) |
| Collides with world bounds | Yes (player cannot leave the tilemap rectangle) |
| Max velocity X | 300 px/s |
| Max velocity Y | 1000 px/s |

### 5.3 Movement Physics Constants
| Constant | Value | Notes |
|----------|-------|-------|
| Gravity Y | 1050 px/s² | Applied to the physics world, not just the player |
| Gravity X | 0 | No horizontal gravity |
| Horizontal acceleration (grounded) | 300 px/s² | Full acceleration while on the ground |
| Horizontal acceleration (airborne) | 120 px/s² | 40% of ground acceleration while in the air |
| Drag X | 1500 px/s² | Applied constantly to horizontal velocity; brings the player to rest when no input is given |
| Max horizontal speed | 300 px/s | Hard cap on X velocity |
| Max vertical speed | 1000 px/s | Hard cap on Y velocity (terminal velocity) |
| Jump velocity Y | −360 px/s | Instantaneous upward velocity impulse on jump |
| Jump velocity X at jump | Clamped current X velocity, range [−400, 400] | The horizontal velocity at the moment of jumping is preserved but clamped |

### 5.4 Movement Rules
- **Left / Right movement:** Horizontal acceleration is applied in the direction of input. When no directional key is held, acceleration is set to 0 and drag decelerates the player to a stop.
- **Air control:** Horizontal acceleration is reduced to 40% while the player is not touching the ground (`body.blocked.down = false`).
- **Jump:** The player may only jump when the player is confirmed to be on the ground (`body.blocked.down = true`). Jump is triggered on the initial key-press frame only (not held). On jump, vertical velocity is set to −360 px/s (upward) and current horizontal velocity is preserved (clamped to ±400).
- **Ducking:** Holding the Down arrow plays the duck animation and reduces the physics hitbox height to 140 (from 210). Releasing Down restores the hitbox to 210.
- **World boundary:** The player cannot move outside the tilemap world rectangle.

### 5.5 Animations
All animations are defined in the loading screen and use the `myAtlas` spritesheet.

| Key | Frames | Frame Rate | Loop | Trigger |
|-----|--------|-----------|------|---------|
| `idle` | `character_beige_idle` | — | Yes | No directional input; on ground |
| `walk` | `character_beige_walk_a`, `character_beige_walk_b` | 10 fps | Yes | Left or right input |
| `duck` | `character_beige_duck` | — | Yes | Down key held |
| `jump` | `character_beige_jump` | — | No | Player is not touching the ground |

**Sprite flipping:** The sprite faces right by default. When moving left the sprite is flipped horizontally. When moving right the flip is cleared.

**Animation priority** (highest wins):
1. `duck` — if Down is held, overrides walk/idle
2. `jump` — if airborne, overrides walk/idle (but duck can still override if Down is held)
3. `walk` — if left or right is held and grounded
4. `idle` — fallback when grounded and no directional input

---

## 6. Collectibles

All collectibles are placed in Tiled object layers, start with static physics bodies for overlap detection, and are **permanently destroyed** (removed from the world) when the player touches them. Each triggers a sound effect on collection.

### 6.1 Food
| Property | Value |
|----------|-------|
| Tiled layer | `food` |
| Object name | `food` |
| Tileset frames (animation) | 13 → 14 → 15, looping at 8 fps |
| Effect | Instantly restores **+12 hunger points**, capped at `HUNGER_MAX` (100) |
| Duration | Permanent (instant restore, no timer) |
| Sound | `assets/food.ogg` |
| Visual feedback | Animated sprite (cycling food icons) |

### 6.2 Powerup (Jump Boost)
| Property | Value |
|----------|-------|
| Tiled layer | `powerups` |
| Object name | `powerup` |
| Tileset frames (animation) | 107 → 108, looping at 8 fps |
| Effect | Increases jump velocity from −360 to **−600 px/s** (a ~67% boost) |
| Duration | **1500 ms**, then reverts to −360 px/s |
| Sound | `assets/powerup.ogg` |
| Visual feedback | Animated sprite (blue energy icon) |

### 6.3 Slowdown (Movement Impairment)
| Property | Value |
|----------|-------|
| Tiled layer | `slowdowns` |
| Object name | `slowdowns` |
| Tileset frames (animation) | 90 → 91 → 92, looping at 8 fps |
| Effect | Reduces horizontal acceleration from 300 to **100 px/s²** and drag from 1500 to **1000 px/s²** |
| Duration | **1300 ms**, then reverts both values |
| Sound | `assets/slowdowns.ogg` |
| Visual feedback | Animated sprite (red/purple hazard icon) |

> **Note for re-implementors:** In the original implementation, the drag is saved and restored but not applied at the start of the effect (a bug). A faithful re-implementation should still apply the reduced drag value when the effect begins. The acceleration reduction does take effect immediately.

### 6.4 Goal Zone
| Property | Value |
|----------|-------|
| Tiled layer | `goal` |
| Object name | `goal` |
| Visual | **Invisible** — no sprite is rendered |
| Effect | Triggers the win condition on player overlap |
| Collision | Overlap (not a solid collider) |

---

## 7. Hunger System

The hunger system is the central time-pressure mechanic.

| Property | Value |
|----------|-------|
| Starting hunger | 100 |
| Maximum hunger | 100 |
| Minimum hunger | 0 |
| Drain rate | −3 per second (once per 1000 ms tick) |
| Food restore amount | +12 per food item collected (capped at 100) |
| Time to starve from full (no food) | ~33 seconds |

### Hunger Bar (HUD)
The hunger bar is displayed in the **top-left corner** of the screen, fixed to the viewport (unaffected by camera scroll or zoom).

| Property | Value |
|----------|-------|
| Position | Top-left, offset (10, 10) from screen edge |
| Size | 300 × 50 px |
| Border | 2 px black border (fills a 304 × 54 rect behind the bar) |
| Background (empty) | Dark red `#440000` |
| Fill color — high (≥ 60%) | Green `#00ff00` |
| Fill color — medium (< 60%) | Yellow `#ffff00` |
| Fill color — low (< 30%) | Red `#ff0000` |

The fill width is proportional to current hunger: `fill_width = 300 * (current_hunger / 100)`.

---

## 8. Win and Lose Conditions

### 8.1 Win
Triggered when the player overlaps the invisible goal zone.

**Sequence:**
1. Physics simulation pauses immediately.
2. Player controls are locked.
3. The player sprite animates: scales from its current size down to 0 over **700 ms**, using a `Back.In` easing curve (slight overshoot / "suck in" effect).
4. When the tween completes, the player is repositioned to the goal zone's center coordinates.
5. The win sound plays (`assets/winning.ogg`).
6. The end screen is shown with the message **"You win!"**

### 8.2 Lose (Starvation)
Triggered when hunger reaches 0 (checked every game update frame).

**Sequence:**
1. Physics simulation pauses.
2. The lost sound plays (`assets/lost.ogg`).
3. The end screen is shown with the message **"Your stomach is empty!"**

*(No animation plays on losing — the player sprite remains visible and stationary.)*

### 8.3 End Screen
Displayed for both win and lose states. Fixed to the viewport (unaffected by camera).

| Element | Content | Style |
|---------|---------|-------|
| Message text | "You win!" or "Your stomach is empty!" | White, 12 px, centered at (720, 430) |
| Restart prompt | "Press R to play again" | Yellow `#ffff00`, 12 px, centered at (720, 470) |

**Restart:** Pressing **R** at any time restarts the gameplay scene from the beginning (all state reset, hunger refilled, player respawned at start).

---

## 9. Camera System

The game uses **two cameras** rendering simultaneously:

### Camera 1 — World Camera (main)
- Follows the player with smooth lerp (X: 0.25, Y: 0.25) and a 10×10 px deadzone.
- Bounded to the tilemap world rectangle.
- Renders: tilemap layers, player sprite, all collectibles, moving platforms, particle effects.
- Does **not** render: hunger bar, end-screen text.

### Camera 2 — UI Camera
- Fixed position, no scroll, no zoom (1:1 with canvas pixels).
- Renders: hunger bar, end-screen text and restart prompt.
- Does **not** render: any world objects (all world objects are in its ignore list).

This separation ensures HUD elements are always pixel-perfect in the corner of the screen regardless of world camera zoom or scroll.

---

## 10. Visual Effects

### 10.1 Footstep Dust Particles
A particle emitter produces dust/smoke puffs at the player's feet while walking on the ground.

| Property | Value |
|----------|-------|
| Particle atlas | `assets/kenny-particles.json` (multiatlas) |
| Frames used | `smoke_03.png`, `smoke_09.png` (chosen randomly) |
| Scale | Starts at 0.02, grows to 0.08 |
| Lifespan | 350 ms |
| Gravity Y on particles | −200 (particles float upward) |
| Alpha | Starts at 1.0, fades to 0.1 |
| Active condition | Player is moving left or right **and** is grounded |
| Position | Offset slightly from player center toward the trailing foot: +5 px when moving left (right foot trail), −5 px when moving right (left foot trail); Y at player's bottom edge |
| Deactivated | When player is airborne, or when no directional input is held |

### 10.2 Win Portal Tween
On win: player sprite scales to 0 over 700 ms with `Back.In` easing. (See Section 8.1.)

### 10.3 Opening Screen Blink Tween
"PRESS SPACE TO START" text blinks: alpha tweens from 1.0 → 0.3 over 800 ms, yoyos back, loops infinitely.

---

## 11. Audio

All audio is loaded from the `assets/` directory. Background music loops throughout gameplay.

| Role | File | Volume | Loop |
|------|------|--------|------|
| Background music | `bgmusic.mp3` | 0.4 | Yes |
| Jump | `jump.ogg` | 0.5 | No |
| Win | `winning.ogg` | 0.7 | No |
| Lose / game over | `lost.ogg` | 0.7 | No |
| Food collected | `food.ogg` | 0.6 | No |
| Powerup collected | `powerup.ogg` | 0.6 | No |
| Slowdown collected | `slowdowns.ogg` | 0.6 | No |

Background music begins playing immediately when the gameplay scene starts. Sound effects play at the moment the corresponding event occurs.

---

## 12. Input Bindings

| Key | Action |
|-----|--------|
| Left Arrow | Move player left |
| Right Arrow | Move player right |
| Up Arrow | Jump (only on initial press; must be grounded) |
| Down Arrow | Duck (hold to crouch; reduces hitbox height) |
| R | Restart the gameplay scene |
| D | Toggle physics debug overlay (developer tool) |
| Space | Start game (opening screen only) |

---

## 13. Art Asset Reference

### 13.1 Tileset
| File | Format | Frame size | Usage |
|------|--------|-----------|-------|
| `assets/tilemap_packed.png` | PNG spritesheet | 18 × 18 px per frame | All tile layers and collectible sprites |

**Key tile frames used by collectibles and moving platforms** (0-indexed):

| Frame index | Used for |
|-------------|---------|
| 13–15 | Food item animation (3 frames) |
| 90–92 | Slowdown item animation (3 frames) |
| 107–108 | Powerup item animation (2 frames) |
| 13 | Food icon on opening screen |
| 107 | Powerup icon on opening screen |
| 90 | Slowdown icon on opening screen |
| Varies | Moving platform tile — uses whatever `tile.index` the Tiled author assigned; the sprite frame is `tile.index - 1` (Tiled is 1-indexed, the spritesheet is 0-indexed) |

### 13.2 Character Spritesheet
| File | Format | Usage |
|------|--------|-------|
| `assets/spritesheet-characters-double.png` | PNG |  Player sprite frames |
| `assets/spritesheet-characters-double.xml` | XML (TexturePacker atlas) | Frame name → pixel rect mapping |

**Named frames used:**

| Frame name | Used in animation |
|------------|------------------|
| `character_beige_idle` | `idle` (single frame) |
| `character_beige_walk_a` | `walk` frame 1 |
| `character_beige_walk_b` | `walk` frame 2 |
| `character_beige_duck` | `duck` (single frame) |
| `character_beige_jump` | `jump` (single frame) |

### 13.3 Particle Atlas
| File | Format | Usage |
|------|--------|-------|
| `assets/kenny-particles.json` | Phaser multiatlas (JSON + referenced PNGs) | Footstep dust particle frames |

Frames used from this atlas: `smoke_03.png`, `smoke_09.png`

### 13.4 Level File
| File | Format | Usage |
|------|--------|-------|
| `assets/Game3.tmj` | Tiled map JSON | Complete level layout, collision properties, object placement |

The level file contains all tile layer data, tile custom properties (`collides`, `moving`), and all object layer data (food, powerup, slowdown, and goal placements). It references the tileset by the internal name `tilemap_packed`.

### 13.5 Audio Files

| File | Format |
|------|--------|
| `assets/bgmusic.mp3` | MP3 |
| `assets/jump.ogg` | OGG |
| `assets/winning.ogg` | OGG |
| `assets/lost.ogg` | OGG |
| `assets/food.ogg` | OGG |
| `assets/powerup.ogg` | OGG |
| `assets/slowdowns.ogg` | OGG |

### 13.6 Third-Party Library
| File | Purpose |
|------|---------|
| `lib/phaser.js` | Phaser 3 (v3.70.0) game framework |
| `lib/AnimatedTiles.js` | Phaser plugin that drives tile animations defined in Tiled |

---

## 14. Quick-Reference: All Numeric Design Values

| Parameter | Value |
|-----------|-------|
| Canvas size | 1440 × 900 px |
| Camera zoom | 2.5× |
| Camera lerp | 0.25 (X and Y) |
| Camera deadzone | 10 × 10 px |
| Tile size | 18 × 18 px |
| Map size | 120 × 25 tiles |
| Gravity Y | 1050 px/s² |
| Ground acceleration | 300 px/s² |
| Air acceleration | 120 px/s² (40% of ground) |
| Drag X | 1500 px/s² |
| Max speed X | 300 px/s |
| Max speed Y | 1000 px/s |
| Jump velocity | −360 px/s |
| Jump velocity (powerup active) | −600 px/s |
| Slowdown acceleration | 100 px/s² |
| Slowdown drag | 1000 px/s² |
| Powerup duration | 1500 ms |
| Slowdown duration | 1300 ms |
| Hunger max | 100 |
| Hunger start | 100 |
| Hunger drain | −3 per 1000 ms |
| Food restore | +12 (capped at 100) |
| Moving platform travel | 48 px upward from spawn |
| Moving platform half-cycle | 2000 ms (full cycle: 4000 ms) |
| Moving platform easing | Linear |
| Player sprite scale | 0.11 |
| Player hitbox (standing) | 150 × 210 (sprite-space units) |
| Player hitbox (ducking) | 150 × 140 (sprite-space units) |
| Win tween duration | 700 ms |
| Win tween easing | Back.In |
| Title blink duration | 800 ms half-cycle |
| Title blink min alpha | 0.3 |
| Hunger bar position | (10, 10) screen px |
| Hunger bar size | 300 × 50 px |
| End text position | Center of canvas, Y − 20 px from center |
| Restart text position | Center of canvas, Y + 30 px from center |
