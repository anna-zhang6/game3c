// Platformer.js — Main gameplay scene for Foodie Chase.
//
// Responsibilities (split into focused helpers to keep create/update short):
//   • Tilemap construction, collision, and moving-platform extraction
//   • Player instantiation and physics hookup
//   • Collectible (food / powerup / slowdown / goal) spawning from Tiled objects
//   • Two-camera setup: world camera (2.5× zoom, follows player) + UI camera (HUD)
//   • Hunger bar HUD, hunger drain timer, and colour-coded fill
//   • Win / lose sequences and end-screen overlay
//   • Moving-platform "carrier" behaviour that nudges the player each frame
//   • Footstep-dust particle camera routing

class Platformer extends Phaser.Scene {
    constructor() {
        super('platformer');
    }

    // ============================================================
    //  SCENE LIFECYCLE
    // ============================================================

    create() {
        // Reset per-run state
        this.gameOver = false;
        this.hunger   = 100;

        // UI elements that should only be visible on the HUD camera
        this.uiElements = [];

        this.createTilemap();
        this.createMovingPlatforms();
        this.createPlayer();
        this.createCollectibles();
        this.createHUD();
        this.setupCameras();
        this.createAudio();
        this.setupInput();
        this.startHungerTimer();
    }

    update(/* time, delta */) {
        // ── Global controls (always active) ─────────────────────────────────
        if (Phaser.Input.Keyboard.JustDown(this.rKey)) {
            this.cleanupAndRestart();
            return;
        }

        // Toggle arcade-physics debug overlay with D
        if (Phaser.Input.Keyboard.JustDown(this.dKey)) {
            this.physics.world.drawDebug = !this.physics.world.drawDebug;
            // createDebugGraphic() is a no-op if the graphic already exists
            if (this.physics.world.drawDebug) {
                this.physics.world.createDebugGraphic();
            } else if (this.physics.world.debugGraphic) {
                this.physics.world.debugGraphic.clear();
            }
        }

        if (this.gameOver) return;

        // ── Lose check ───────────────────────────────────────────────────────
        if (this.hunger <= 0) {
            this.triggerLose();
            return;
        }

        // ── Player update ────────────────────────────────────────────────────
        this.player.update(this.cursors, this.sounds.jump);

        // ── Carrier nudge: push player with moving platform ──────────────────
        // _deltaY is kept current by each platform's tween onUpdate callback
        this.applyPlatformCarry();

        // ── Redraw hunger bar each frame ─────────────────────────────────────
        this.drawHungerBar();
    }

    // ============================================================
    //  TILEMAP & TERRAIN
    // ============================================================

    createTilemap() {
        this.map = this.make.tilemap({ key: 'map' });

        // First arg must match the tileset name stored in the .tmj file
        const tileset = this.map.addTilesetImage('tilemap_packed', 'tiles');

        // Background layer — decorative, no collision
        this.backgroundLayer = this.map.createLayer('background', tileset, 0, 0);

        // Solid terrain layer — collision set by the custom tile property
        this.groundLayer = this.map.createLayer('ground-n-platform', tileset, 0, 0);
        this.groundLayer.setCollisionByProperty({ collides: true });

        // Expand the Arcade physics world to the full tilemap dimensions
        this.physics.world.setBounds(
            0, 0,
            this.map.widthInPixels,
            this.map.heightInPixels
        );
    }

    // ── Moving platforms ───────────────────────────────────────────────────────
    // Tiles tagged with the custom property `moving: true` in Tiled are pulled
    // out of the static tile layer and replaced with tweened physics sprites.
    createMovingPlatforms() {
        this.movingPlatforms = this.physics.add.group();

        // filterTiles scans the whole layer for tiles matching the predicate
        const movingTiles = this.groundLayer.filterTiles(
            tile => tile.properties && tile.properties.moving === true
        );

        movingTiles.forEach(tile => {
            const worldX = tile.getCenterX();
            const worldY = tile.getCenterY();

            // Tiled tile IDs are 1-indexed; spritesheet frames are 0-indexed
            const frame = tile.index - 1;

            // Remove the static tile so it doesn't also collide
            this.groundLayer.removeTileAt(tile.x, tile.y);

            // Create a physics sprite at the same position
            const platform = this.physics.add.sprite(worldX, worldY, 'tiles', frame);
            platform.setImmovable(true);
            platform.body.setAllowGravity(false);

            // _deltaY is updated each frame by the tween's onUpdate callback.
            // This avoids scene.update() vs tween.update() ordering uncertainty.
            platform._deltaY    = 0;
            platform._tweenPrevY = worldY;

            // Tween: oscillate 48 px upward and back, 2 000 ms per half-cycle
            this.tweens.add({
                targets:  platform,
                y:        worldY - 48,
                duration: 2000,
                ease:     'Linear',
                yoyo:     true,
                repeat:   -1,
                onUpdate: (_tween, target) => {
                    platform._deltaY     = target.y - platform._tweenPrevY;
                    platform._tweenPrevY = target.y;
                },
            });

            this.movingPlatforms.add(platform);
        });
    }

    // ============================================================
    //  PLAYER
    // ============================================================

    createPlayer() {
        // Spawn position derived from canvas dimensions (≈ tile col 9, row 5)
        const spawnX = 1440 / 13;
        const spawnY = 900 / 5;

        this.player = new Player(this, spawnX, spawnY);
        this.player.setCollideWorldBounds(true);

        // Collide with static tilemap terrain
        this.physics.add.collider(this.player, this.groundLayer);

        // Collide with moving platform sprites
        this.physics.add.collider(this.player, this.movingPlatforms);
    }

    // ============================================================
    //  COLLECTIBLES
    // ============================================================

    // Object-layer objects in this .tmj are tile objects (they have a `gid`).
    // For tile objects Tiled stores (x, y) as the BOTTOM-LEFT corner, so the
    // sprite centre is offset by (+width/2, -height/2).
    createCollectibles() {
        this.createFoodItems();
        this.createPowerupItems();
        this.createSlowdownItems();
        this.createGoalZones();
    }

    // Helper: build a physics sprite at the centre of a Tiled tile object
    _spawnCollectible(obj, textureKey, frame, animKey) {
        const cx = obj.x + obj.width  / 2;
        const cy = obj.y - obj.height / 2;   // tile objects: y = bottom edge
        const sprite = this.physics.add.sprite(cx, cy, textureKey, frame);
        sprite.body.setAllowGravity(false);
        sprite.body.setImmovable(true);
        if (animKey) sprite.play(animKey);
        return sprite;
    }

    createFoodItems() {
        this.foods = this.add.group();
        const layer = this.map.getObjectLayer('food');
        if (!layer) return;

        layer.objects
            .filter(obj => obj.name === 'food')
            .forEach(obj => {
                const sprite = this._spawnCollectible(obj, 'tiles', 13, 'food-anim');
                this.foods.add(sprite, false); // false = don't re-add to scene
            });

        this.physics.add.overlap(
            this.player, this.foods,
            this._onCollectFood, null, this
        );
    }

    createPowerupItems() {
        this.powerups = this.add.group();
        const layer = this.map.getObjectLayer('powerups');
        if (!layer) return;

        layer.objects
            .filter(obj => obj.name === 'powerup')
            .forEach(obj => {
                const sprite = this._spawnCollectible(obj, 'tiles', 107, 'powerup-anim');
                this.powerups.add(sprite, false);
            });

        this.physics.add.overlap(
            this.player, this.powerups,
            this._onCollectPowerup, null, this
        );
    }

    createSlowdownItems() {
        this.slowdowns = this.add.group();
        const layer = this.map.getObjectLayer('slowdowns');
        if (!layer) return;

        layer.objects
            .filter(obj => obj.name === 'slowdowns')
            .forEach(obj => {
                const sprite = this._spawnCollectible(obj, 'tiles', 90, 'slowdown-anim');
                this.slowdowns.add(sprite, false);
            });

        this.physics.add.overlap(
            this.player, this.slowdowns,
            this._onCollectSlowdown, null, this
        );
    }

    // Goal zones are invisible — we still need a physics body for overlap.
    // Using a transparent sprite is the simplest approach for a static-body zone.
    createGoalZones() {
        this.goals = this.add.group();
        const layer = this.map.getObjectLayer('goal');
        if (!layer) return;

        layer.objects
            .filter(obj => obj.name === 'goal')
            .forEach(obj => {
                const cx = obj.x + obj.width  / 2;
                const cy = obj.y - obj.height / 2;
                const zone = this.physics.add.sprite(cx, cy, 'tiles', 0);
                zone.setAlpha(0);                               // fully invisible
                zone.body.setAllowGravity(false);
                zone.body.setImmovable(true);
                zone.body.setSize(obj.width * 2, obj.height * 2); // generous hit area
                this.goals.add(zone, false);
            });

        this.physics.add.overlap(
            this.player, this.goals,
            this._onReachGoal, null, this
        );
    }

    // ============================================================
    //  COLLECTIBLE CALLBACKS
    // ============================================================

    _onCollectFood(player, food) {
        food.destroy();
        this.hunger = Math.min(100, this.hunger + 12);
        this.sounds.food.play();
    }

    _onCollectPowerup(player, powerup) {
        powerup.destroy();
        this.sounds.powerup.play();
        this.player.applyPowerup();
    }

    _onCollectSlowdown(player, slowdown) {
        slowdown.destroy();
        this.sounds.slowdown.play();
        this.player.applySlowdown();
    }

    _onReachGoal(player, goal) {
        if (this.gameOver) return;
        // Capture goal position before we modify anything
        const goalX = goal.x;
        const goalY = goal.y;
        this.triggerWin(goalX, goalY);
    }

    // ============================================================
    //  HUD — HUNGER BAR
    // ============================================================

    createHUD() {
        // Background rectangle includes a 2 px black border
        this.hungerBarBg   = this.add.graphics();
        this.hungerBarFill = this.add.graphics();

        // Register as UI elements (main camera will ignore these)
        this.uiElements.push(this.hungerBarBg, this.hungerBarFill);

        // Draw initial full bar
        this.drawHungerBar();
    }

    // Redraws both layers of the hunger bar every frame.
    // The bar is at screen coordinates (10, 10) — the UI camera renders it there.
    drawHungerBar() {
        // ── Border + dark-red background ────────────────────────────────────
        this.hungerBarBg.clear();
        this.hungerBarBg.fillStyle(0x000000);
        this.hungerBarBg.fillRect(8, 8, 304, 54);   // 2 px border
        this.hungerBarBg.fillStyle(0x440000);
        this.hungerBarBg.fillRect(10, 10, 300, 50); // empty bar colour

        // ── Coloured fill ────────────────────────────────────────────────────
        // Green ≥ 60 %, Yellow < 60 %, Red < 30 %
        let color;
        if      (this.hunger >= 60) color = 0x00ff00;
        else if (this.hunger >= 30) color = 0xffff00;
        else                        color = 0xff0000;

        const fillWidth = 300 * (this.hunger / 100);
        this.hungerBarFill.clear();
        this.hungerBarFill.fillStyle(color);
        this.hungerBarFill.fillRect(10, 10, fillWidth, 50);
    }

    // ============================================================
    //  CAMERAS
    // ============================================================

    // Called after all game objects exist so ignore lists can be built completely.
    setupCameras() {
        // ── Camera 1: world camera (main) ────────────────────────────────────
        const cam = this.cameras.main;
        cam.setZoom(2.5);
        cam.startFollow(this.player, true, 0.25, 0.25);
        cam.setDeadzone(10, 10);
        cam.setBounds(0, 0, this.map.widthInPixels, this.map.heightInPixels);

        // Main camera must NOT render HUD graphics
        cam.ignore(this.uiElements);

        // ── Camera 2: UI camera (fixed, no zoom) ─────────────────────────────
        this.uiCamera = this.cameras.add(0, 0, 1440, 900);
        this.uiCamera.setScroll(0, 0);  // fixed — never follows anything

        // Build the list of every world object the UI camera should ignore
        const worldObjects = [
            this.backgroundLayer,
            this.groundLayer,
            this.player,
            this.player.dustEmitter,
            ...this.movingPlatforms.getChildren(),
            ...this.foods.getChildren(),
            ...this.powerups.getChildren(),
            ...this.slowdowns.getChildren(),
            ...this.goals.getChildren(),
        ];
        this.uiCamera.ignore(worldObjects);
    }

    // Tells BOTH cameras to ignore a newly created UI element.
    // Call this whenever a UI object is created after setupCameras().
    _addToUI(gameObject) {
        this.uiElements.push(gameObject);
        this.cameras.main.ignore(gameObject);
        // uiCamera does NOT need to be updated; new objects render there by default
    }

    // ============================================================
    //  AUDIO
    // ============================================================

    createAudio() {
        // Background music starts immediately and loops the whole game
        this.bgMusic = this.sound.add('bgmusic', { volume: 0.4, loop: true });
        this.bgMusic.play();

        // Sound-effect references used by callbacks and triggerWin/Loss
        this.sounds = {
            jump:     this.sound.add('jump',      { volume: 0.5 }),
            win:      this.sound.add('winning',   { volume: 0.7 }),
            lose:     this.sound.add('lost',      { volume: 0.7 }),
            food:     this.sound.add('food',      { volume: 0.6 }),
            powerup:  this.sound.add('powerup',   { volume: 0.6 }),
            slowdown: this.sound.add('slowdowns', { volume: 0.6 }),
        };
    }

    // ============================================================
    //  INPUT
    // ============================================================

    setupInput() {
        // createCursorKeys() gives us up / down / left / right + shift + space
        this.cursors = this.input.keyboard.createCursorKeys();
        this.rKey    = this.input.keyboard.addKey('R');
        this.dKey    = this.input.keyboard.addKey('D');
    }

    // ============================================================
    //  HUNGER TIMER
    // ============================================================

    startHungerTimer() {
        // Deduct 3 hunger points once per second
        this.hungerTimer = this.time.addEvent({
            delay:         1000,
            callback:      () => { if (!this.gameOver) this.hunger = Math.max(0, this.hunger - 3); },
            callbackScope: this,
            loop:          true,
        });
    }

    // ============================================================
    //  MOVING PLATFORM CARRIER BEHAVIOUR
    // ============================================================

    // Nudge the player vertically to match the platform they are standing on.
    // _deltaY on each platform is kept current by the tween's onUpdate callback,
    // so this simply reads the latest value and applies it.
    applyPlatformCarry() {
        if (!this.player.body.blocked.down) return;

        const playerBounds = this.player.getBounds();

        this.movingPlatforms.getChildren().forEach(platform => {
            if (!platform._deltaY) return;

            const platBounds = platform.getBounds();
            if (Phaser.Geom.Rectangle.Overlaps(playerBounds, platBounds)) {
                this.player.y += platform._deltaY;
            }
        });
    }

    // ============================================================
    //  WIN / LOSE
    // ============================================================

    triggerWin(goalX, goalY) {
        this.gameOver = true;
        this.physics.pause();
        this.bgMusic.stop();

        // Player "warps" into the goal: scale to 0 with a Back.In (suck-in) curve
        this.tweens.add({
            targets:  this.player,
            scale:    0,
            duration: 700,
            ease:     'Back.In',
            onComplete: () => {
                this.player.setPosition(goalX, goalY);
                this.sounds.win.play();
                this.showEndScreen('You win!');
            },
        });
    }

    triggerLose() {
        this.gameOver = true;
        this.physics.pause();
        this.bgMusic.stop();
        this.sounds.lose.play();
        this.showEndScreen('Your stomach is empty!');
    }

    // Displays the end-screen overlay on the UI camera.
    // Text objects are added to the UI layer so the main (world) camera ignores them.
    showEndScreen(message) {
        const cx = 720;   // canvas centre X

        // Semi-transparent dark panel for readability
        const panel = this.add.rectangle(cx, 450, 600, 200, 0x000000, 0.65);
        this._addToUI(panel);

        const msgText = this.add.text(cx, 420, message, {
            fontSize: '52px',
            fontStyle: 'bold',
            color: '#ffffff',
            align: 'center',
        }).setOrigin(0.5);
        this._addToUI(msgText);

        const restartText = this.add.text(cx, 490, 'Press R to play again', {
            fontSize: '30px',
            color: '#ffff00',
            align: 'center',
        }).setOrigin(0.5);
        this._addToUI(restartText);
    }

    // ============================================================
    //  RESTART
    // ============================================================

    // Stop music cleanly before restarting to avoid overlapping tracks.
    cleanupAndRestart() {
        if (this.bgMusic && this.bgMusic.isPlaying) this.bgMusic.stop();
        this.scene.restart();
    }
}
