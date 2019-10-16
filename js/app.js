// A cross-browser requestAnimationFrame
// See https://hacks.mozilla.org/2011/08/animating-with-javascript-from-setinterval-to-requestanimationframe/
var requestAnimFrame = (function(){
    return window.requestAnimationFrame       ||
        window.webkitRequestAnimationFrame ||
        window.mozRequestAnimationFrame    ||
        window.oRequestAnimationFrame      ||
        window.msRequestAnimationFrame     ||
        function(callback){
            window.setTimeout(callback, 1000 / 60);
        };
})();

// Create the canvas
var canvas = document.createElement("canvas");
var ctx = canvas.getContext("2d");
canvas.width = 512;
canvas.height = 480;
document.body.appendChild(canvas);

// The main game loop
var lastTime;
function main() {
    var now = Date.now();
    var dt = (now - lastTime) / 1000.0;

    update(dt);
    render();

    lastTime = now;
    requestAnimFrame(main);
};

function getRandomInt(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function init() {
    terrainPattern = ctx.createPattern(resources.get('img/terrain.png'), 'repeat');

    document.getElementById('play-again').addEventListener('click', function() {
        reset();
    });

    reset();
    lastTime = Date.now();
    main();
}

resources.load([
    'img/sprites_02.png',
    'img/terrain.png'
]);
resources.onReady(init);

// Game state
var player = {
    pos: [0, 0],
    sprite: new Sprite('img/sprites_02.png', [0, 0], [39, 39], 16, [0, 1])
};

var bullets = [];
var enemies = [];
var explosions = [];
var megalits = [];
var manna = [];

var lastFire = Date.now();
var gameTime = 0;
var isGameOver;
var terrainPattern;

var score = 0;
var scoreEl = document.getElementById('score');

var mannaScore = 0;
var mannaScoreEl = document.getElementById('manna');

// Speed in pixels per second
var playerSpeed = 200;
var bulletSpeed = 500;
var enemySpeed = 100;

// Update game objects
function update(dt) {
    gameTime += dt;

    handleInput(dt);
    updateEntities(dt);

    // It gets harder over time by adding enemies using this
    // equation: 1-.993^gameTime
    if(Math.random() < 1 - Math.pow(.993, gameTime)) {
        enemies.push({
            pos: [canvas.width,
                  Math.random() * (canvas.height - 39)],
            sprite: new Sprite('img/sprites_02.png', [0, 78], [80, 39],
                               6, [0, 1, 2, 3, 2, 1]),
            seed: getRandomInt(0, 1) == 0 ? 1 : -1
        });
    }

    checkCollisions();

    scoreEl.innerHTML = score;
    mannaScoreEl.innerHTML = mannaScore;
};

function handleInput(dt) {

    var oldx = player.pos[0];
    var oldy = player.pos[1];

    if(input.isDown('DOWN') || input.isDown('s')) {
        player.pos[1] += playerSpeed * dt;
    }

    if(input.isDown('UP') || input.isDown('w')) {
        player.pos[1] -= playerSpeed * dt;
    }

    if(input.isDown('LEFT') || input.isDown('a')) {
        player.pos[0] -= playerSpeed * dt;
    }

    if(input.isDown('RIGHT') || input.isDown('d')) {
        player.pos[0] += playerSpeed * dt;
    }

    if(hasInteresect(player, megalits) >= 0) {
        player.pos[0] = oldx;
        player.pos[1] = oldy;
    }

    if(input.isDown('SPACE') &&
       !isGameOver &&
       Date.now() - lastFire > 100) {
        var x = player.pos[0] + player.sprite.size[0] / 2;
        var y = player.pos[1] + player.sprite.size[1] / 2;

        bullets.push({ pos: [x, y],
                       dir: 'forward',
                       sprite: new Sprite('img/sprites_02.png', [0, 39], [18, 8]) });
        bullets.push({ pos: [x, y],
                       dir: 'up',
                       sprite: new Sprite('img/sprites_02.png', [0, 50], [9, 5]) });
        bullets.push({ pos: [x, y],
                       dir: 'down',
                       sprite: new Sprite('img/sprites_02.png', [0, 60], [9, 5]) });

        lastFire = Date.now();
    }
}

function tcas(pos, size, pos2, size2)
{
    var safe = 30;
    return !(pos[1] + size[1] <= pos2[1] || pos[1] > pos2[1] + size2[1] ||
        pos[0] + size[0] + safe<= pos2[0] || pos[0] > pos2[0] + size2[0] + safe);
}

function updateEntities(dt) {
    // Update the player sprite animation
    player.sprite.update(dt);

    for (var i=0; i < manna.length; i++) {
        manna[i].sprite.update(dt);
    }

    // Update all the bullets
    for(var i=0; i<bullets.length; i++) {
        var bullet = bullets[i];

        switch(bullet.dir) {
        case 'up': bullet.pos[1] -= bulletSpeed * dt; break;
        case 'down': bullet.pos[1] += bulletSpeed * dt; break;
        default:
            bullet.pos[0] += bulletSpeed * dt;
        }

        // Remove the bullet if it goes offscreen
        if(bullet.pos[1] < 0 || bullet.pos[1] > canvas.height ||
           bullet.pos[0] > canvas.width) {
            bullets.splice(i, 1);
            i--;
        }
    }

    // Update all the enemies
    for(var i=0; i<enemies.length; i++) {
        enemies[i].pos[0] -= enemySpeed * dt;
        enemies[i].sprite.update(dt);


        for (var k = 0; k < megalits.length; k++) {
            if (tcas(enemies[i].pos, enemies[i].sprite.size, megalits[k].pos, megalits[k].sprite.size)) {
                enemies[i].pos[1] += (enemySpeed * dt * enemies[i].seed);
            }
        }

        // Remove if offscreen
        if(enemies[i].pos[0] + enemies[i].sprite.size[0] < 0) {
            enemies.splice(i, 1);
            i--;
        }
    }

    // Update all the explosions
    for(var i=0; i<explosions.length; i++) {
        explosions[i].sprite.update(dt);

        // Remove if animation is done
        if(explosions[i].sprite.done) {
            explosions.splice(i, 1);
            i--;
        }
    }

    if (manna.length <= 2)
        generateManna(getRandomInt(0, 4));
}

// Collisions

function collides(x, y, r, b, x2, y2, r2, b2) {
    return !(r <= x2 || x > r2 ||
             b <= y2 || y > b2);
}

function boxCollides(pos, size, pos2, size2) {
    return collides(pos[0], pos[1],
                    pos[0] + size[0], pos[1] + size[1],
                    pos2[0], pos2[1],
                    pos2[0] + size2[0], pos2[1] + size2[1]);
}

function makeExplosions(pos) {
    explosions.push({
        pos: pos,
        sprite: new Sprite('img/sprites_02.png',
                           [0, 117],
                           [39, 39],
                           16,
                           [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
                           null,
                           true)
    });
}

function checkCollisions() {
    checkPlayerBounds();
    
    // Run collision detection for all enemies and bullets

    for(var i=0; i<enemies.length; i++) {
        var pos = enemies[i].pos;
        var size = enemies[i].sprite.size;


        var bulletIndex = hasInteresect(enemies[i], bullets);
        if (bulletIndex >= 0) {
            enemies.splice(i, 1);
            i--;

            // Add score
            score += 100;

            // Add an explosion
            makeExplosions(pos);

            // Remove the bullet and stop this iteration
            bullets.splice(bullet_index, 1);
            break;
        }
 

        if(boxCollides(pos, size, player.pos, player.sprite.size)) {
            gameOver();
        }

        if (hasInteresect(enemies[i], megalits) >= 0) {
            enemies.splice(i, 1);
            i--;
            // Add an explosion
            makeExplosions(pos);
        }
    }

    for(var k=0; k<megalits.length; k++) {
        var bullet_index = hasInteresect(megalits[k], bullets);

        if (bullet_index >= 0) {
            bullets.splice(bullet_index, 1);
        }
    }

    var mannaIndex = hasInteresect(player, manna);
    if (mannaIndex >= 0) {
        explosions.push({
            pos: manna[mannaIndex].pos,
            sprite: new Sprite('img/sprites_02.png',
                               [0, 172], 
                               [60, 40],
                               8,
                               [0, 1, 2, 3],
                               null,
                               true)
        });

        manna.splice(mannaIndex, 1);
        mannaScore++;
    }

}

function checkPlayerBounds() {
    // Check bounds
    if(player.pos[0] < 0) {
        player.pos[0] = 0;
    }
    else if(player.pos[0] > canvas.width - player.sprite.size[0]) {
        player.pos[0] = canvas.width - player.sprite.size[0];
    }

    if(player.pos[1] < 0) {
        player.pos[1] = 0;
    }
    else if(player.pos[1] > canvas.height - player.sprite.size[1]) {
        player.pos[1] = canvas.height - player.sprite.size[1];
    }
}

// Draw everything
function render() {
    ctx.fillStyle = terrainPattern;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Render the player if the game isn't over
    if(!isGameOver) {
        renderEntity(player);
    }

    renderEntities(bullets);
    renderEntities(enemies);
    renderEntities(explosions);
    renderEntities(megalits);
    renderEntities(manna);
};

function renderEntities(list) {
    for(var i=0; i<list.length; i++) {
        renderEntity(list[i]);
    }    
}

function renderEntity(entity) {
    ctx.save();
    ctx.translate(entity.pos[0], entity.pos[1]);
    entity.sprite.render(ctx);
    ctx.restore();
}

// Game over
function gameOver() {
    document.getElementById('game-over').style.display = 'block';
    document.getElementById('game-over-overlay').style.display = 'block';
    isGameOver = true;
}

function generateMegalits()
{
    var megalithsCount = getRandomInt(4, 8);
    var sprites = [[4, 215], [4, 274]];
    var spriteSizes = [[50, 53], [47, 42]]

    for (var i = 0; i < megalithsCount; i++) {
        var pos_x = getRandomInt(80, canvas.width - 56);
        var pos_y = getRandomInt(0, canvas.height - 100);
        var type = getRandomInt(0, 1);

        var enity = {
            pos: [pos_x, pos_y],
            sprite: new Sprite('img/sprites_02.png', sprites[type], spriteSizes[type])
        };

        if (boxCollides(enity.pos, enity.sprite.size, player.pos, player.sprite.size)) {
            i--;
            continue;
        }

        megalits.push(enity);
    }
}

function hasInteresect(enity, list)
{
    for (var j = 0; j < list.length; j++) {
        if (boxCollides(enity.pos, enity.sprite.size, list[j].pos, list[j].sprite.size))
            return j;
    }

    return -1;
}

function generateManna(mannCount)
{
    for (var i = 0; i < mannCount; i++) {
        let pos_x = getRandomInt(0, canvas.width - 56);
        let pos_y = getRandomInt(0, canvas.height - 40);

        let enity = {
            pos: [pos_x, pos_y],
            sprite: new Sprite('img/sprites_02.png', [0, 172], [60, 40], 6, [0, 1])
        };

        if ((hasInteresect(enity, megalits) >= 0) ||
            boxCollides(player.pos, player.sprite.size, enity.pos, enity.sprite.size)) {
            i--;
            continue;
        }

        manna.push(enity);
    }
}

// Reset game to original state
function reset() {
    document.getElementById('game-over').style.display = 'none';
    document.getElementById('game-over-overlay').style.display = 'none';
    isGameOver = false;
    gameTime = 0;
    score = 0;
    mannaScore = 0;

    enemies = [];
    bullets = [];
    megalits = [];
    manna = [];

    generateMegalits();
    generateManna(getRandomInt(4, 12));

    player.pos = [50, canvas.height / 2];
};