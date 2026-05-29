// Player.js — Player-controlled character.
//
// Extends Phaser.Physics.Arcade.Sprite so it gets a dynamic arcade body.
// Encapsulates movement logic, animation state machine, duck hitbox resizing,
// powerup / slowdown effect timers, and the footstep dust particle emitter.
//
// Usage:
//   const player = new Player(scene, x, y);
//   // In Platformer.update():
//   player.update(cursors, jumpSound);

class Player extends Phaser.Physics.Arcade.Sprite {

    // ── Physics constants (defaults; modified by power-ups) ──────────────────
    static GROUND_ACCEL = 300;   // px/s² when grounded
    static AIR_FACTOR   = 0.4;   // air accel = groundAccel × this
    static BASE_DRAG    = 1500;  // horizontal drag px/s²
    static BASE_JUMP_VY = -360;  // jump impulse (negative = up)
    static MAX_VX       = 300;   // terminal horizontal speed
    static MAX_VY       = 1000;  // terminal fall speed

    constructor(scene, x, y) {
        // Start with the idle atlas frame so the body is sized to the right texture
        super(scene, x, y, 'myAtlas', 'character_beige_idle');

        // Register with scene's display list and physics world
        scene.add.existing(this);
        scene.physics.add.existing(this);

        // Scale: the source frames are 256×256 — scale down to fit 18 px tiles
        this.setScale(0.11);
        this.setOrigin(0.5, 0.5);

        // Physics body setup (hitbox in sprite-local / unscaled space)
        this.body.setSize(150, 210);
        this.setMaxVelocity(Player.MAX_VX, Player.MAX_VY);
        this.setDragX(Player.BASE_DRAG);
        this.setCollideWorldBounds(true);

        // Mutable movement values (slowdown / powerup change these temporarily)
        this.currentGroundAccel = Player.GROUND_ACCEL;
        this.currentJumpVY      = Player.BASE_JUMP_VY;

        // Track duck state to avoid redundant body-size calls
        this._isDucking = false;

        // Active effect timers (kept so we can cancel them on restart)
        this._powerupTimer  = null;
        this._slowdownTimer = null;

        // Create the footstep dust particle emitter (parked off-screen initially)
        this._createDustEmitter(scene);

        // Play the initial idle animation
        this.play('idle');
    }

    // ── Dust emitter ──────────────────────────────────────────────────────────
    // Uses Phaser 3.60+ ParticleEmitter API: add.particles(x, y, key, config).
    _createDustEmitter(scene) {
        this.dustEmitter = scene.add.particles(0, -9999, 'kenny-particles', {
            frame: ['smoke_03.png', 'smoke_09.png'],
            scale:    { start: 0.02, end: 0.08 },
            alpha:    { start: 1.0,  end: 0.1  },
            lifespan: 350,
            gravityY: -200,   // particles float upward
            frequency: 80,    // ms between each puff
            emitting: false,  // inactive until the player walks
        });
    }

    // ── Main update ───────────────────────────────────────────────────────────
    // Called every frame by Platformer.update().  jumpSound is the Phaser Sound
    // object for the jump effect so the Player can trigger it directly.
    update(cursors, jumpSound) {
        this._handleMovement(cursors);
        this._handleJump(cursors, jumpSound);
        this._handleDuck(cursors);
        this._updateAnimations(cursors);
        this._updateDust(cursors);
    }

    // ── Horizontal movement ───────────────────────────────────────────────────
    _handleMovement(cursors) {
        const onGround = this.body.blocked.down;
        // Air acceleration is 40 % of the current ground acceleration value
        const accel = onGround
            ? this.currentGroundAccel
            : this.currentGroundAccel * Player.AIR_FACTOR;

        if (cursors.left.isDown) {
            this.setAccelerationX(-accel);
            this.setFlipX(true);   // face left
        } else if (cursors.right.isDown) {
            this.setAccelerationX(accel);
            this.setFlipX(false);  // face right
        } else {
            // No input — zero acceleration; drag brings the player to rest
            this.setAccelerationX(0);
        }
    }

    // ── Jump ──────────────────────────────────────────────────────────────────
    // JustDown fires only on the first frame the key is pressed, preventing
    // held-key auto-repeat.  Jump is only allowed when touching the ground.
    _handleJump(cursors, jumpSound) {
        if (Phaser.Input.Keyboard.JustDown(cursors.up) && this.body.blocked.down) {
            // Preserve current horizontal momentum (clamped to ±400 px/s)
            const clampedVx = Phaser.Math.Clamp(this.body.velocity.x, -400, 400);
            this.setVelocityY(this.currentJumpVY);
            this.setVelocityX(clampedVx);
            jumpSound.play();
        }
    }

    // ── Duck ──────────────────────────────────────────────────────────────────
    // Reduces the physics body height while Down is held, allowing the player
    // to slide under low ceilings.  Body size is in unscaled (sprite-local)
    // coordinates — Phaser multiplies by scaleX/Y internally.
    _handleDuck(cursors) {
        if (cursors.down.isDown && !this._isDucking) {
            this.body.setSize(150, 140);
            this._isDucking = true;
        } else if (!cursors.down.isDown && this._isDucking) {
            this.body.setSize(150, 210);
            this._isDucking = false;
        }
    }

    // ── Animation state machine ───────────────────────────────────────────────
    // Priority (highest first): duck > jump > walk > idle
    _updateAnimations(cursors) {
        const onGround      = this.body.blocked.down;
        const movingLateral = cursors.left.isDown || cursors.right.isDown;

        if (cursors.down.isDown) {
            this.play('duck', true);
        } else if (!onGround) {
            this.play('jump', true);
        } else if (movingLateral) {
            this.play('walk', true);
        } else {
            this.play('idle', true);
        }
    }

    // ── Footstep dust ─────────────────────────────────────────────────────────
    // Emitter trails slightly behind the player's foot while walking on ground.
    _updateDust(cursors) {
        const onGround      = this.body.blocked.down;
        const movingLateral = cursors.left.isDown || cursors.right.isDown;

        if (movingLateral && onGround) {
            // Offset: +5 px when moving left (right foot leads), -5 when moving right
            const xOff = cursors.left.isDown ? 5 : -5;
            // Y at the very bottom of the (scaled) sprite
            this.dustEmitter.setPosition(
                this.x + xOff,
                this.y + this.displayHeight * 0.5
            );
            if (!this.dustEmitter.emitting) this.dustEmitter.start();
        } else {
            if (this.dustEmitter.emitting) this.dustEmitter.stop();
        }
    }

    // ── Powerup effect ────────────────────────────────────────────────────────
    // Boosts jump velocity to -600 for 1 500 ms, then reverts.
    applyPowerup() {
        // Cancel any in-flight powerup timer so stacking resets the duration
        if (this._powerupTimer) {
            this._powerupTimer.remove(false);
            this._powerupTimer = null;
        }
        this.currentJumpVY = -600;
        this._powerupTimer = this.scene.time.delayedCall(1500, () => {
            this.currentJumpVY = Player.BASE_JUMP_VY;
            this._powerupTimer = null;
        });
    }

    // ── Slowdown effect ───────────────────────────────────────────────────────
    // Reduces acceleration to 100 and drag to 1 000 for 1 300 ms, then reverts.
    applySlowdown() {
        if (this._slowdownTimer) {
            this._slowdownTimer.remove(false);
            this._slowdownTimer = null;
        }
        this.currentGroundAccel = 100;
        // Apply reduced drag immediately (the design notes that the reference
        // implementation had a bug where drag wasn't applied at effect start)
        this.setDragX(1000);

        this._slowdownTimer = this.scene.time.delayedCall(1300, () => {
            this.currentGroundAccel = Player.GROUND_ACCEL;
            this.setDragX(Player.BASE_DRAG);
            this._slowdownTimer = null;
        });
    }
}
