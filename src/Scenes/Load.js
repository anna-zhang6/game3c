// Load.js — Invisible loading scene.
// Preloads every asset the game needs and registers all shared animations,
// then immediately hands off to the Platformer scene.
// Animations are created here (not in Platformer) so they live in the global
// animation manager and are available across all scenes.

class Load extends Phaser.Scene {
    constructor() {
        super('load');
    }

    preload() {
        // ── Tilemap ──────────────────────────────────────────────────────────────
        this.load.tilemapTiledJSON('map', 'assets/Game3.tmj');

        // Load as a spritesheet so individual frames can be used for collectible
        // sprites.  The tilemap renderer also uses this texture key.
        this.load.spritesheet('tiles', 'assets/tilemap_packed.png', {
            frameWidth: 18,
            frameHeight: 18,
        });

        // ── Character atlas (TexturePacker XML format) ───────────────────────────
        this.load.atlasXML(
            'myAtlas',
            'assets/spritesheet-characters-double.png',
            'assets/spritesheet-characters-double.xml'
        );

        // ── Particle atlas (multiatlas: one JSON + multiple PNGs) ────────────────
        this.load.multiatlas('kenny-particles', 'assets/kenny-particles.json', 'assets/');

        // ── Audio ────────────────────────────────────────────────────────────────
        this.load.audio('bgmusic',    'assets/bgmusic.mp3');
        this.load.audio('jump',       'assets/jump.ogg');
        this.load.audio('winning',    'assets/winning.ogg');
        this.load.audio('lost',       'assets/lost.ogg');
        this.load.audio('food',       'assets/food.ogg');
        this.load.audio('powerup',    'assets/powerup.ogg');
        this.load.audio('slowdowns',  'assets/slowdowns.ogg');
    }

    create() {
        this.createPlayerAnimations();
        this.createCollectibleAnimations();
        this.scene.start('platformer');
    }

    // ── Player animations ──────────────────────────────────────────────────────
    // All frames come from the 'myAtlas' texture atlas (XML format).
    // Single-frame animations still use anims.create so the Player class can
    // call sprite.play() uniformly without special-casing single frames.
    createPlayerAnimations() {
        // Standing still
        this.anims.create({
            key: 'idle',
            frames: [{ key: 'myAtlas', frame: 'character_beige_idle' }],
            frameRate: 1,
            repeat: -1,
        });

        // Running left or right
        this.anims.create({
            key: 'walk',
            frames: [
                { key: 'myAtlas', frame: 'character_beige_walk_a' },
                { key: 'myAtlas', frame: 'character_beige_walk_b' },
            ],
            frameRate: 10,
            repeat: -1,
        });

        // Crouching (Down key held)
        this.anims.create({
            key: 'duck',
            frames: [{ key: 'myAtlas', frame: 'character_beige_duck' }],
            frameRate: 1,
            repeat: -1,
        });

        // In the air
        this.anims.create({
            key: 'jump',
            frames: [{ key: 'myAtlas', frame: 'character_beige_jump' }],
            frameRate: 1,
            repeat: 0,
        });
    }

    // ── Collectible tile animations ────────────────────────────────────────────
    // Frame indices are 0-based (the tileset spritesheet is 0-indexed).
    createCollectibleAnimations() {
        // Food cycles through three fruit/food icons
        this.anims.create({
            key: 'food-anim',
            frames: this.anims.generateFrameNumbers('tiles', { start: 13, end: 15 }),
            frameRate: 8,
            repeat: -1,
        });

        // Powerup pulses between two blue energy frames
        this.anims.create({
            key: 'powerup-anim',
            frames: this.anims.generateFrameNumbers('tiles', { start: 107, end: 108 }),
            frameRate: 8,
            repeat: -1,
        });

        // Slowdown cycles through three red/purple hazard frames
        this.anims.create({
            key: 'slowdown-anim',
            frames: this.anims.generateFrameNumbers('tiles', { start: 90, end: 92 }),
            frameRate: 8,
            repeat: -1,
        });
    }
}
