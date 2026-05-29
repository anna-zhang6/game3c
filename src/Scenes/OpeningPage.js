// OpeningPage.js — Title / instructions screen displayed on launch.
// Shows item icons loaded from the tileset spritesheet, a blinking start prompt,
// and waits for the player to press Space before transitioning to the Load scene.

class OpeningPage extends Phaser.Scene {
    constructor() {
        super('openingPage');
    }

    preload() {
        // We only need the tileset here to draw the item icons.
        // Load.js will re-load it for the actual game (Phaser caches it so no double fetch).
        this.load.spritesheet('tiles', 'assets/tilemap_packed.png', {
            frameWidth: 18,
            frameHeight: 18,
        });
    }

    create() {
        const { width, height } = this.cameras.main;
        const cx = width / 2;

        // ── Background ──────────────────────────────────────────────────────────
        this.add.rectangle(cx, height / 2, width, height, 0x9b48b1);

        // ── Title ───────────────────────────────────────────────────────────────
        this.add.text(cx, 100, 'FOODIE CHASE', {
            fontSize: '80px',
            fontStyle: 'bold',
            color: '#ffffff',
            stroke: '#4a1060',
            strokeThickness: 6,
        }).setOrigin(0.5);

        // ── Subtitle ─────────────────────────────────────────────────────────────
        this.add.text(cx, 210, 'Survive hunger and reach the portal!', {
            fontSize: '30px',
            color: '#ffff99',
        }).setOrigin(0.5);

        // ── Item explanation rows ─────────────────────────────────────────────
        // Frames are 0-indexed in the spritesheet (matching DESIGN.md sec. 13.1)
        this.createItemRow(cx - 380, 360, 13,  'FOOD',     'Restores hunger meter\nKeeps you alive longer');
        this.createItemRow(cx,       360, 107, 'POWERUP',  'Temporarily boosts jump height');
        this.createItemRow(cx + 380, 360, 90,  'SLOWDOWN', 'Reduces movement speed\nand acceleration');

        // ── Controls hint ────────────────────────────────────────────────────────
        this.add.text(cx, 530, 'Arrow Keys to Move and Jump', {
            fontSize: '26px',
            color: '#ffffff',
        }).setOrigin(0.5);

        // ── Blinking "PRESS SPACE TO START" ─────────────────────────────────────
        const startPrompt = this.add.text(cx, 640, 'PRESS SPACE TO START', {
            fontSize: '36px',
            fontStyle: 'bold',
            color: '#ffffff',
        }).setOrigin(0.5);

        // Alpha blinks: 1.0 → 0.3 over 800 ms, then back (yoyo), loops forever
        this.tweens.add({
            targets: startPrompt,
            alpha: 0.3,
            duration: 800,
            ease: 'Linear',
            yoyo: true,
            repeat: -1,
        });

        // ── Input ────────────────────────────────────────────────────────────────
        // 'once' so pressing Space multiple times doesn't queue multiple transitions
        this.input.keyboard.once('keydown-SPACE', () => {
            this.scene.start('load');
        });
    }

    // Creates a column with a scaled tile icon, a label, and a description.
    createItemRow(x, y, tileFrame, label, description) {
        // Scale the 18×18 tile up so it is visible at 1440×900
        this.add.image(x, y, 'tiles', tileFrame).setScale(4).setOrigin(0.5, 0.5);

        this.add.text(x, y + 50, label, {
            fontSize: '22px',
            fontStyle: 'bold',
            color: '#ffffff',
        }).setOrigin(0.5);

        this.add.text(x, y + 90, description, {
            fontSize: '16px',
            color: '#dddddd',
            align: 'center',
            wordWrap: { width: 280 },
        }).setOrigin(0.5, 0);
    }
}
