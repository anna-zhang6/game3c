// main.js — Entry point. Configures and launches the Phaser game.
// Scenes run in the order: OpeningPage → Load → Platformer.

const config = {
    type: Phaser.AUTO,
    width: 1440,
    height: 900,

    // Pixel art mode: disable texture smoothing so tiles stay crisp at 2.5x zoom
    pixelArt: true,
    roundPixels: true,

    parent: 'phaser-game',

    physics: {
        default: 'arcade',
        arcade: {
            // World gravity applies to all dynamic bodies (player, etc.)
            gravity: { x: 0, y: 1050 },
            debug: false,
        },
    },

    scene: [OpeningPage, Load, Platformer],
};

const game = new Phaser.Game(config);
