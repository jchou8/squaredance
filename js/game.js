'use strict';

// Set up the canvas
var canvas = document.getElementById('canvas');
var brush = canvas.getContext('2d');

// Define game constants
const UPDATE_INTERVAL = 1000.0 / 60.0;

const GAME_WIDTH = 800;
const GAME_HEIGHT = 600;

const PLAYER_RADIUS = 10;
const PLR_INITIAL_X = 100;
const PLR_INITIAL_Y = GAME_HEIGHT / 2;
const TRAIL_LENGTH = 15;

const BASE_GRAPPLE_SPEED = 2.5;
const MAX_SPEED = 8;
const FRICTION = 0.85;

const BASE_SCROLL_SPEED = 5;
const MAX_SCROLL_SPEED = 7.5;
const SCROLL_SPEED_INCREMENT = 0.5;
const SCORE_MILESTONE = 15;

const OBSTACLE_SIZE = 50;
const OBSTACLE_MIN_DISTANCE = OBSTACLE_SIZE * 6;
const MAX_VERT_OBSTACLES = GAME_HEIGHT / OBSTACLE_SIZE;
const OBSTACLE_SPAWN_X = 900;

// Control the frequency of each obstacle pattern
const PATTERN_WEIGHTS = {
    vertGap: 16,
    vertMoving: 2,
    vertMovingGap: 2,
    vertMovingSineGap: 2,
    alternate: 3,
    tunnel: 1,
    tunnelWave: 1,
    tunnelSpikes: 1,
    tunnelMoving: 1,
    tunnelSnake: 1,
    movingRows: 1,
    staircase: 1,
    movingStairs: 1,
    checkerboard: 1,
    singleSpike: 1,
    doubleSpike: 1,
    piston: 1
};

// Keep track of the game's state
var game = {
    screen: 'menu',  // Current game screen - menu, pause, gameplay, or gameover

    // Stats
    time: 0,
    score: 0,
    highscore: localStorage.getItem("highscore"),
    highscoreAchieved: false,

    // Game speed
    scrollSpeed: BASE_SCROLL_SPEED,

    // Control obstacle spawning
    obstacleDistance: OBSTACLE_MIN_DISTANCE,
    borderDistance: 0,

    // Keyboard controls
    upPressed: false,
    downPressed: false,

    // Mouse controls
    mousePressed: false,
    mouseX: 0,
    mouseY: 0,

    // Visual effects
    hue: 0,
    hueBase: 0,
    saturation: 100,
    shiftX: 0,
    shiftY: 0,
    kickMag: 0,

    // Audio
    muted: false,

    //  Obstacle arrays that keep track of obstacles and their spawning
    obstacles: [],
    patternQueue: [],
    checkpoints: []
};

// Player object that keeps track of player position and movement
var plr = {
    // Position
    x: PLR_INITIAL_X,
    y: PLR_INITIAL_Y,

    // Velocity
    vx: 0,
    vy: 0,
    // Acceleration
    ax: 0,
    ay: 0,

    // Grapple status
    grapple: false,
    canGrapple: true,
    grappleX: -1,
    grapplyY: -1,
    grappleObstacle: {},
    grappleYOffset: 0,

    // Particle trail, stores previous player positions
    trail: []
};

// Store update loop so it can be stopped later
var mainLoop;

// Load in assets
loadSounds();

// Set up audio analyzer
var audio = document.getElementById("music");
var dancer = new Dancer();
setupAudio();

// Get high score from local storage
updateHighscore();

// Initialize game
$(document).ready(function () {
    // Set up modal for later
    $('#highscore-modal').modal({
        // Automatically close self after popping up
        ready: function (modal) {
            setTimeout(function () {
                modal.modal('close');
            }, 1000);
        }
    });

    // Set canvas dimensions
    canvas.width = GAME_WIDTH;
    canvas.height = GAME_HEIGHT;

    if ($(window).width() < 992) {
        canvas.style.width = GAME_WIDTH * 0.75;
        canvas.style.height = GAME_HEIGHT * 0.75;
    }

    // Show the main menu when all fonts are loaded
    var fontLight = new FontFaceObserver('Saira Semi Condensed', { weight: 100 });
    var fontBold = new FontFaceObserver('Saira Semi Condensed', { weight: 700 });
    Promise.all([fontLight.load(), fontBold.load()]).then(showMenu);
});

// Draw the main menu that shows up when game is first loaded
function showMenu() {
    drawBackground();

    // Draw menu elements
    brush.font = '700 80px Saira Semi Condensed';
    brush.textAlign = 'center';
    brush.fillStyle = 'white';
    brush.fillText('SQUAREDANCE', GAME_WIDTH / 2, GAME_HEIGHT / 2);

    brush.font = '100 30px Saira Semi Condensed';
    brush.fillText('GRAPPLE ONTO SQUARES TO MOVE', GAME_WIDTH / 2, GAME_HEIGHT / 2 + 35);
    brush.fillText('AVOID THE SQUARES', GAME_WIDTH / 2, GAME_HEIGHT / 2 + 65);

    brush.font = '100 40px Saira Semi Condensed';
    brush.fillText('CLICK TO START', GAME_WIDTH / 2, GAME_HEIGHT / 2 + 160);
}

// Set up game and start the update loop
function startGame() {
    // Set initial game state
    resetGameState();

    // Reset DOM elements
    $('#time').text('0.0s');
    $('#score').text('0');
    $('#speed').text('100%');

    // Close modal if it's still open
    $('#highscore-modal').modal('close');

    // Start game loop
    // Make sure it's global so it can be stopped later
    mainLoop = window.setInterval(gameLoop, UPDATE_INTERVAL);

    dancer.play();
}

// Main loop that updates the game every frame
function gameLoop() {
    // Clear screen
    brush.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // Move the player
    movePlayer();

    // Add obstacles
    spawnObstacles();

    // Move obstacles
    moveObstacles();

    // Check where the player is aiming to grapple
    checkGrapple();

    // Update score if player passed a checkpoint
    updateScore();

    // Check for collision between the player and obstacles, game over if collision
    if (checkPlayerCollision()) {
        gameOver();
    }

    // Draw everything
    drawBackground();
    drawObstacles();

    if (plr.grappleX > -1 && plr.grappleY > -1) {
        drawGrapple();
    }

    drawPlayer();

    // If the player died, overlay the game over text
    if (game.screen == 'gameover') {
        drawGameOver();
    }

    // Update visual modifications
    if (game.scrollSpeed < MAX_SCROLL_SPEED) {
        game.hue = 45 * (game.hueBase + 0.66 * Math.cos(game.time * game.scrollSpeed * 0.25)) - 20;
    } else {
        game.hue = 120 * Math.cos(game.time * 1.5) + 80;
    }

    game.shiftX = dancer.getFrequency(150, 200) * 200;
    game.shiftY = dancer.getFrequency(150, 200) * 100;

    // Increase timer
    game.time += UPDATE_INTERVAL / 1000;

    // Update displayed time
    $('#timer').text(parseFloat(Math.round(game.time * 10) / 10).toFixed(1) + 's');
}

// Updates high score
function updateHighscore() {
    if (game.highscore !== null) {
        // New high score
        if (game.score > game.highscore) {
            game.highscore = game.score;
            localStorage.setItem('highscore', game.score);

            $('#highscore-modal').modal('open');
            $('#modal-score').text(game.highscore);
        }
    } else {
        // No scores saved, initialize to 0
        game.highscore = 0;
        localStorage.setItem('highscore', game.score);
    }

    $('#highscore').text(game.highscore);
}

// Controls the player's movement
function movePlayer() {
    // Store the player's previous position in trail
    plr.trail.unshift({ x: plr.x, y: plr.y });

    // Handle grapple movement
    if (plr.grapple) {
        let grappleRadius = distance(plr.x, plr.y, plr.grappleX, plr.grappleY);
        let direction = { x: (plr.grappleX - plr.x) / grappleRadius, y: (plr.grappleY - plr.y) / grappleRadius };
        let grappleSpeed = BASE_GRAPPLE_SPEED * (game.scrollSpeed / BASE_SCROLL_SPEED);

        if (game.upPressed && !game.downPressed) {
            plr.ax = direction.x * grappleSpeed;
            plr.ay = direction.y * grappleSpeed;
        } else if (game.downPressed && !game.upPressed) {
            plr.ax = -direction.x * grappleSpeed;
            plr.ay = -direction.y * grappleSpeed;
        } else {
            plr.ax = 0;
            plr.ay = 0;
        }
    } else {
        plr.ay = 0;
    }

    // Adjust velocity based on acceleration
    plr.vx += plr.ax;
    plr.vy += plr.ay;

    // Limit velocity
    if (plr.vx > MAX_SPEED) {
        plr.vx = MAX_SPEED;
    } else if (plr.vx <= -MAX_SPEED) {
        plr.vx = -MAX_SPEED;
    }
    if (plr.vy > MAX_SPEED) {
        plr.vy = MAX_SPEED;
    } else if (plr.vy <= -MAX_SPEED) {
        plr.vy = -MAX_SPEED;
    }

    // Move player based on velocity
    plr.x += plr.vx;
    plr.y += plr.vy;

    // Modify velocity for friction
    plr.vx *= FRICTION;
    plr.vy *= FRICTION;

    // Prevent player from going out of bounds
    if (plr.x - PLAYER_RADIUS < 0) {
        plr.x = PLAYER_RADIUS;
        plr.vx = 0;
    } else if (plr.x + PLAYER_RADIUS > GAME_WIDTH) {
        plr.x = GAME_WIDTH - PLAYER_RADIUS;
        plr.vx = 0;
    }

    if (plr.y - PLAYER_RADIUS < 0) {
        plr.y = PLAYER_RADIUS;
        plr.vy = 0;
    } else if (plr.y + PLAYER_RADIUS > GAME_HEIGHT) {
        plr.y = GAME_HEIGHT - PLAYER_RADIUS;
        plr.vy = 0;
    }
}

// Displays the player
function drawPlayer() {

    // Update and draw trail
    brush.lineCap = 'round';
    plr.trail.forEach(function (position, index) {
        // Draw a line to each trail position
        brush.strokeStyle = 'hsla(' + game.hue + ', ' + game.saturation + '%, 90%, ' + 0.1 * (1 - index / TRAIL_LENGTH) + ')';
        brush.lineWidth = (PLAYER_RADIUS + game.kickMag * 10) * 1.5 * (1 - index / TRAIL_LENGTH);

        brush.beginPath();
        brush.moveTo(plr.x + game.shiftX, plr.y + game.shiftY);
        brush.lineTo(position.x + game.shiftX, position.y + game.shiftY);
        brush.stroke();

        // Update trail positions
        position.x -= game.scrollSpeed;
        if (index >= TRAIL_LENGTH) {
            plr.trail.pop();
        }
    });

    // Draw player circle
    if (plr.grapple) {
        brush.fillStyle = '#ffffff';
    } else {
        brush.fillStyle = '#cccccc';
    }

    brush.beginPath();
    brush.arc(plr.x + game.shiftX, plr.y + game.shiftY, PLAYER_RADIUS + game.kickMag * 10, 0, 2 * Math.PI);
    brush.fill();

    // Draw pulsing ring
    brush.strokeStyle = 'hsla(' + game.hue + ', ' + game.saturation + '%, 90%, 0.5)';
    brush.lineWidth = 1;
    brush.beginPath();
    brush.arc(plr.x + game.shiftX, plr.y + game.shiftY, PLAYER_RADIUS + game.kickMag * 50, 0, 2 * Math.PI);
    brush.stroke();
}

// Check if the player hit any obstacles, return true if so
function checkPlayerCollision() {
    let collision = false;
    game.obstacles.forEach(function (obstacle) {
        collision = collision ||
            rectCircleColliding(plr.x, plr.y, PLAYER_RADIUS,
                obstacle.x - OBSTACLE_SIZE / 2, obstacle.y - OBSTACLE_SIZE / 2,
                OBSTACLE_SIZE, OBSTACLE_SIZE);
    });

    return collision;
}

// Check if the player has passed a checkpoint and update score accordingly
function updateScore() {
    let frontCheck = game.checkpoints[0];

    // If the player passed the frontmost checkpoint, increase score and remove checkpoint
    if (frontCheck && plr.x > frontCheck) {
        game.score++;
        game.checkpoints.shift();

        if (!game.muted) {
            createjs.Sound.play('pointSound');
        }

        // Special display if new high score
        if (game.score > game.highscore && !game.highscoreAchieved && game.highscore > 0) {
            if (!game.muted) {
                createjs.Sound.play('highscoreSound');
            }
            game.highscoreAchieved = true;
            $('#score').css('color', '#00ff00');

            // Popup notification
            Materialize.toast('<i class="fa fa-trophy" aria-hidden="true"></i> NEW HIGH SCORE!', 1000, 'highscore-toast');
        }

        // Update score display
        $('#score').text(game.score);

        // Increase speed if milestones are reached
        if (game.score % SCORE_MILESTONE === 0 && game.scrollSpeed < MAX_SCROLL_SPEED) {
            game.scrollSpeed += SCROLL_SPEED_INCREMENT;

            if (!game.muted) {
                createjs.Sound.play('levelupSound');
            }

            // Update displayed speed
            if (game.scrollSpeed >= MAX_SCROLL_SPEED) {
                $('#speed').text('MAX');
            } else {
                $('#speed').text(Math.floor(game.scrollSpeed / BASE_SCROLL_SPEED * 100) + '%');
            }

            // Change game color
            game.hueBase = (game.hueBase + 1) % 5;

            // Popup notification
            Materialize.toast('<i class="fa fa-angle-double-up" aria-hidden="true"></i> SPEED UP!', 1000, 'speedup-toast');
        }
    }
}

// Spawn the block patterns
function spawnObstacles() {
    // Spawn floor and ceiling
    if (game.borderDistance < 0) {
        game.obstacles.push({ x: OBSTACLE_SPAWN_X, y: OBSTACLE_SIZE / 2 });
        game.obstacles.push({ x: OBSTACLE_SPAWN_X, y: GAME_HEIGHT - OBSTACLE_SIZE / 2 });
        game.borderDistance = OBSTACLE_SIZE - 3;
    }

    // Spawn obstacle patterns
    if (game.obstacleDistance <= 0 || game.obstacleDistance < game.borderDistance) {
        // Call the last pattern in the queue and remove it
        let patternName = game.patternQueue.pop();
        if (patterns[patternName]) {
            patterns[patternName]();
        }

        // Restock pattern queue if it's empty
        if (game.patternQueue.length <= 0) {
            populatePatternQueue();
        }
    }
}

// Make obstacles scroll across the screen
function moveObstacles() {
    game.obstacles.forEach(function (obstacle) {
        obstacle.x -= game.scrollSpeed;

        // Handle Y-moving obstacles
        if (obstacle.moveY) {
            let moveAmount = obstacle.moveY;

            // Sinusoidal obstacles
            if (obstacle.movePeriod && obstacle.moveOffset) {
                moveAmount *= obstacle.movePeriod * Math.cos(game.time * obstacle.movePeriod + obstacle.moveOffset);
            }

            obstacle.y += moveAmount;

            // Obstacles wrap vertically if they go off screen
            if (obstacle.y < -OBSTACLE_SIZE) {
                obstacle.y += 2 * OBSTACLE_SIZE + GAME_HEIGHT;
            } else if (obstacle.y > GAME_HEIGHT + OBSTACLE_SIZE) {
                obstacle.y += -2 * OBSTACLE_SIZE - GAME_HEIGHT;
            }
        }
    });

    // Move checkpoints
    game.checkpoints = game.checkpoints.map(function (checkpoint) {
        return checkpoint - game.scrollSpeed;
    });

    // Remove obstacles that are off-screen
    game.obstacles = game.obstacles.filter(function (obstacle) {
        return obstacle.x > -OBSTACLE_SIZE;
    });

    // Update pattern spawning delay
    game.obstacleDistance -= game.scrollSpeed;
    game.borderDistance -= game.scrollSpeed;
}

// Draw all obstacles
function drawObstacles() {
    // Slightly alter appearance based on music
    let darkness = Math.round(dancer.getFrequency(190, 200) * 1500);
    let lightness = 50 + Math.round(dancer.getFrequency(0, 10) * 300);
    let fill = 'rgb(' + darkness + ', ' + darkness + ', ' + darkness + ')';
    brush.strokeStyle = 'hsl(' + game.hue + ', ' + game.saturation + '%, ' + lightness + '%)';

    game.obstacles.forEach(function (obstacle) {
        // Slight pseudo-randomized size change for pulsing effect
        let sizeShift = dancer.getFrequency(150, 200) * 45 * ((Math.round((8 * obstacle.x + 7 * obstacle.y) / 50) % 9) - 4);
        let newSize = OBSTACLE_SIZE + sizeShift + game.kickMag * 5;

        // Special appearance for currently attached obstacle
        if (plr.grapple && obstacle == plr.grappleObstacle) {
            brush.fillStyle = 'hsl(' + game.hue + ', ' + game.saturation + '%, ' + (Math.floor(lightness * 0.5) - 15) + '%)';
        } else {
            brush.fillStyle = fill;
        }

        brush.beginPath();
        brush.rect(obstacle.x - newSize / 2 + game.shiftX, obstacle.y - newSize / 2 + game.shiftY, newSize, newSize);
        brush.fill();
        brush.stroke();
    });
}

// Calculate and update grapple behavior
function checkGrapple() {
    if (!plr.grapple) {
        if (game.mousePressed && plr.canGrapple && plr.grappleObstacle !== null) {
            // Enable grapple
            plr.grapple = true;
            if (!game.muted) {
                createjs.Sound.play('grappleSound');
            }
        } else {
            // Figure out where to grapple
            calculateGrapplePoint();
        }
    } else {
        // Detach grapple if the player releases it or it goes off screen
        if (!game.mousePressed || plr.grappleX < 0 || plr.grappleY < 0 || plr.grappleY > GAME_HEIGHT) {
            plr.grapple = false;
            plr.grappleObstacle = null;
            plr.ax = 0;
            plr.ay = 0;

            // Disable automatic re-grappling if it was a forced detachment
            if (game.mousePressed) {
                plr.canGrapple = false;
            }
        } else {
            // Move grapple with the obstacles
            plr.grappleX -= game.scrollSpeed;

            if (plr.grappleObstacle.moveY) {
                plr.grappleY = plr.grappleObstacle.y + plr.grappleYOffset;
            }
        }
    }
}

// Calculate the point where the grapple will latch to
function calculateGrapplePoint() {
    // Calculate angle from player to cursor
    let angle = Math.atan2(game.mouseY - plr.y, game.mouseX - plr.x);

    // Calculate collisions with obstacles
    let maxDist = 1000;
    let plrPoint = { x: plr.x, y: plr.y };
    let plrProjected = { x: plr.x + maxDist * Math.cos(angle), y: plr.y + maxDist * Math.sin(angle) };

    // Find the closest obstacle that the player is aiming at and place the grapple point
    game.obstacles.forEach(function (obstacle) {
        let intersections = lineSquareColliding(plrPoint, plrProjected, obstacle);
        intersections.forEach(function (intersection) {
            if (intersection) {
                let dist = distance(plr.x, plr.y, intersection.x, intersection.y);
                if (dist < maxDist) {
                    maxDist = dist;
                    plr.grappleX = intersection.x;
                    plr.grappleY = intersection.y;
                    plr.grappleObstacle = obstacle;
                    plr.grappleYOffset = plr.grappleY - obstacle.y;
                }
            }
        });
    });

    // Not colliding with any obstacles
    if (maxDist >= 1000) {
        plr.grappleX = -1;
        plr.grappleY = -1;
        plr.grappleObstacle = null;
    }
}

// Displays the grappling hook
function drawGrapple() {
    // Draw line from player to grapple point
    if (plr.grapple) {
        brush.strokeStyle = 'hsl(' + game.hue + ', ' + game.saturation + '%, 60%)';
    } else {
        brush.strokeStyle = 'rgba(100, 100, 100, 0.9)';
    }

    brush.lineWidth = 2;

    brush.beginPath();
    brush.moveTo(plr.x + game.shiftX, plr.y + game.shiftY);
    brush.lineTo(plr.grappleX + game.shiftX, plr.grappleY + game.shiftY);
    brush.stroke();

    // Draw circle at grapple point if currently grappling
    if (plr.grapple) {
        brush.fillStyle = 'hsl(' + game.hue + ', ' + game.saturation + '%, 50%)';
        brush.beginPath();
        brush.arc(plr.grappleX + game.shiftX, plr.grappleY + game.shiftY, 5, 0, 2 * Math.PI);
        brush.fill();
    }
}

// Draw the background
function drawBackground() {
    // 3 colored stripes
    for (let i = 0; i < 3; i++) {
        brush.fillStyle = 'hsl(' + game.hue + ', ' + game.saturation + '%, ' + (15 - 3 * i) + '%)';
        let magnitude = dancer.getFrequency(i * 80, i * 80 + 10) * 1000;
        brush.fillRect(0, GAME_HEIGHT * i / 6 - magnitude, GAME_WIDTH, GAME_HEIGHT * (3 - i) / 3 + magnitude * 2);
    }

    // Audio spectrum visualizer
    for (let i = 0; i < 52; i++) {
        brush.fillStyle = 'hsl(' + game.hue + ', ' + game.saturation + '%, ' + '5%)';

        let magnitude = dancer.getFrequency(i * 5, (i + 1) * 5) * 1000;
        brush.fillRect(i * GAME_WIDTH / 52, GAME_HEIGHT / 2 - magnitude, GAME_WIDTH / 52, magnitude * 2);
    }
}

// Draw pause overlay
function drawPause() {
    brush.fillStyle = 'rgba(0, 0, 0, 0.5)';
    brush.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    brush.fillStyle = 'rgba(255, 255, 255, 0.6)';
    brush.fillRect(GAME_WIDTH * 0.5 - 80, GAME_HEIGHT * 0.5 - 80, 60, 160);
    brush.fillRect(GAME_WIDTH * 0.5 + 20, GAME_HEIGHT * 0.5 - 80, 60, 160);
}

// Ends the game
function gameOver() {
    window.clearInterval(mainLoop);
    game.screen = 'gameover';
    game.saturation = 0;

    if (!game.muted) {
        createjs.Sound.play('deathSound');
    }

    // Update high score
    updateHighscore();
}

// Draw gameover text
function drawGameOver() {
    brush.fillStyle = 'rgba(0, 0, 0, 0.3)';
    brush.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    brush.font = '700 80px Saira Semi Condensed';
    brush.textAlign = 'center';
    brush.fillStyle = 'white';
    brush.fillText('GAME OVER', GAME_WIDTH / 2, GAME_HEIGHT / 2);

    brush.font = '100 40px Saira Semi Condensed';
    brush.fillText('PRESS R TO RESTART', GAME_WIDTH / 2, GAME_HEIGHT / 2 + 40);
}

// Reset all necessary game state variables
function resetGameState() {
    game.time = 0;
    game.score = 0;
    game.highscoreAchieved = false;
    $('#score').css('color', 'white');

    game.screen = 'gameplay';

    game.scrollSpeed = BASE_SCROLL_SPEED;
    game.obstacleDistance = OBSTACLE_MIN_DISTANCE;
    game.borderDistance = 0;

    game.hueBase = Math.floor(Math.random() * 5);
    game.saturation = 100;

    plr.x = PLR_INITIAL_X;
    plr.y = PLR_INITIAL_Y;
    plr.vx = 0;
    plr.vy = 0;
    plr.ax = 0;
    plr.ay = 0;
    plr.grapple = false;
    plr.grappleX = -1;
    plr.grappleY = -1;
    plr.trail = [];

    game.obstacles = [];
    game.patternQueue = [];
    game.checkpoints = [];
}

// Set high score back to 0
function resetHighscore() {
    game.highscore = 0;
    localStorage.setItem('highscore', 0);
    $('#highscore').text('0');
}

// Load in sounds
function loadSounds() {
    createjs.Sound.registerSound('./assets/point.wav', 'pointSound');
    createjs.Sound.registerSound('./assets/death.wav', 'deathSound');
    createjs.Sound.registerSound('./assets/highscore.wav', 'highscoreSound');
    createjs.Sound.registerSound('./assets/levelup.wav', 'levelupSound');
    createjs.Sound.registerSound('./assets/attach.wav', 'grappleSound');
}

// Set up audio plugin for playback and visualization
function setupAudio() {
    Dancer.setOptions({
        flashJS: './lib/soundmanager2.js',
        flashSWF: './lib/soundmanager2.swf'
    });

    dancer.load(audio);
    dancer.setVolume(0.33);

    // Detect low-frequency kicks for visual effects
    var kick = dancer.createKick({
        frequency: [0, 8],
        onKick: function (mag) {
            game.kickMag = mag;
        },

        offKick: function (mag) {
            game.kickMag = mag;

            // Update canvas border color to the music
            $('canvas').css('border-color', 'hsl(0, 0%, ' + Math.floor(mag * 300) + '%)');
        },

        decay: 0.03,
        threshold: 0.8
    });

    kick.on();
}

/******************
 * Input handlers *
 ******************/
// Keyboard input
window.addEventListener('keydown', function (event) {

    let key = event.keyCode;

    // Prevent scrolling with arrow keys
    if (key >= 37 && key <= 40) {
        event.preventDefault();
    }

    // Up arrow or W key
    if (key == 38 || key == 87) {
        game.upPressed = true;
    }

    // Down arrow or S key
    if (key == 40 || key == 83) {
        game.downPressed = true;
    }

    // R to restart game if dead
    if (key == 82 && game.screen == 'gameover') {
        startGame();
    }

    // P to pause or unpause
    if (key == 80 && (game.screen == 'gameplay' || game.screen == 'pause')) {
        if (game.screen == 'pause') {
            game.screen = 'gameplay';
            dancer.play();
            mainLoop = window.setInterval(gameLoop, UPDATE_INTERVAL);
        } else {
            game.screen = 'pause';
            dancer.pause();
            window.clearInterval(mainLoop);
            drawPause();
        }
    }

    // M to toggle audio mute
    if (key == 77) {
        let volText = $('#volume');
        let volIndicator = $('#volume-icon');
        if (game.muted) {
            dancer.setVolume(0.33);
            volIndicator.addClass('fa-volume-up');
            volIndicator.removeClass('fa-volume-off');
            volText.text('Audio On');
        } else {
            dancer.setVolume(0);
            volIndicator.addClass('fa-volume-off');
            volIndicator.removeClass('fa-volume-up');
            volText.text('Audio Off');
        }

        game.muted = !game.muted;
    }
});

window.addEventListener('keyup', function (event) {
    let key = event.keyCode;

    // Up arrow or W key
    if (key == 38 || key == 87) {
        game.upPressed = false;
    }

    // Down arrow or S key
    if (key == 40 || key == 83) {
        game.downPressed = false;
    }
});

// Get mouse position
canvas.addEventListener('mousemove', function (event) {
    let rect = canvas.getBoundingClientRect();
    game.mouseX = (event.clientX - rect.left) / (rect.right - rect.left) * GAME_WIDTH;
    game.mouseY = (event.clientY - rect.top) / (rect.bottom - rect.top) * GAME_HEIGHT;
});

// Get mouse input
canvas.addEventListener('mousedown', function (event) {
    game.mousePressed = true;

    // If the player is on the main menu, start the game
    if (game.screen == 'menu') {
        startGame();
    }

    // Stop double-clicking from highlighting text and ruining everything
    event.preventDefault();
});

canvas.addEventListener('mouseup', function () {
    game.mousePressed = false;
    plr.canGrapple = true;
});

// Reset highscore if button is presed
$('#reset-btn').click(resetHighscore);


/*********************
 * Obstacle patterns *
 *********************/
// Shuffle and add patterns to the queue
function populatePatternQueue() {
    $.each(PATTERN_WEIGHTS, function (pattern, weight) {
        for (let i = 0; i < weight; i++) {
            game.patternQueue.push(pattern);
        }
    });

    // Randomize order of pattern appearance
    shuffle(game.patternQueue);
}

// Spawn a block with the given position and movement properties
function spawnBlock(xOffset, yOffset, move, movePeriod, moveOffset) {
    let y = (yOffset + 0.5) * OBSTACLE_SIZE;
    if (move && movePeriod && moveOffset) {
        y += move * Math.sin(movePeriod * game.time + moveOffset) * OBSTACLE_SIZE;
    }

    game.obstacles.push({
        x: OBSTACLE_SPAWN_X + xOffset * OBSTACLE_SIZE,
        y: y,
        moveY: move,
        movePeriod: movePeriod,
        moveOffset: moveOffset
    });
}

// Spawn a checkpoint with the given position
function spawnCheckpoint(xOffset) {
    game.checkpoints.push(OBSTACLE_SPAWN_X + OBSTACLE_SIZE * xOffset);
}

// Object containing all the pattern functions
// Each pattern has three main components:
// 1. Spawn blocks
// 2. Spawn a checkpoint that will increase score if the obstacle is passed
// 3. Set a delay until the next pattern spawns
var patterns = {

    // Wall of blocks except for a small gap
    vertGap: function () {
        // Spawn blocks
        let gapStart = Math.floor(Math.random() * ((MAX_VERT_OBSTACLES) - 4)) + 1;

        for (let i = 1; i < MAX_VERT_OBSTACLES - 1; i++) {
            if (i < gapStart || i > gapStart + 2) {
                spawnBlock(0, i);
            }
        }

        // Spawn checkpoint
        spawnCheckpoint(1);

        // Set delay
        game.obstacleDistance = OBSTACLE_MIN_DISTANCE;
    },


    // Two sets of three moving blocks
    vertMoving: function () {
        // Spawn blocks
        let movement = (Math.floor(Math.random() * 2) * 2 - 1) * OBSTACLE_SIZE * 0.025 * (Math.floor(Math.random() * 4) + 2);
        for (let i = 0; i < 3; i++) {
            spawnBlock(0, i, movement);
            spawnBlock(0, i + MAX_VERT_OBSTACLES * 0.5 + 1, movement);
        }

        // Spawn checkpoint
        spawnCheckpoint(1);

        // Set delay
        game.obstacleDistance = OBSTACLE_MIN_DISTANCE;
    },

    // Wall of blocks except for a moving gap
    vertMovingGap: function () {
        // Spawn blocks
        let movement = (Math.floor(Math.random() * 2) * 2 - 1) * OBSTACLE_SIZE * 0.025 * (Math.floor(Math.random() * 4) + 2);

        for (let i = -1; i < MAX_VERT_OBSTACLES - 6; i++) {
            spawnBlock(0, i, movement);
        }

        // Spawn checkpoint
        spawnCheckpoint(1);

        // Set delay
        game.obstacleDistance = OBSTACLE_MIN_DISTANCE;
    },

    // Wall of blocks except for a gap moving up and down
    vertMovingSineGap: function () {
        // Spawn blocks
        let gapStart = MAX_VERT_OBSTACLES * 0.5 - 2;
        let movement = (Math.floor(Math.random() * 2) * 2 - 1) * OBSTACLE_SIZE * 0.05;
        let period = Math.random() + 2;

        for (let i = -1; i < MAX_VERT_OBSTACLES + 1; i++) {
            if (i < gapStart || i > gapStart + 3) {
                spawnBlock(0, i, movement, period, 1);
            }
        }

        // Spawn checkpoint
        spawnCheckpoint(1);

        // Set delay
        game.obstacleDistance = OBSTACLE_MIN_DISTANCE;
    },

    // Wall of blocks except for center two + wall of blocks except for top and bottom two, in random order
    alternate: function () {
        // Spawn blocks
        let order = Math.floor(Math.random() * 2);

        for (let i = 1; i < MAX_VERT_OBSTACLES - 1; i++) {
            if (i < MAX_VERT_OBSTACLES / 2 - 1 || i > MAX_VERT_OBSTACLES / 2) {
                spawnBlock(order * 5, i);
            }
        }

        for (let i = 3; i < MAX_VERT_OBSTACLES - 3; i++) {
            spawnBlock((1 - order) * 5, i);
        }

        // Spawn checkpoints for both columns
        spawnCheckpoint(1);
        spawnCheckpoint(6);

        // Set delay
        game.obstacleDistance = OBSTACLE_SIZE * 5 + OBSTACLE_MIN_DISTANCE;
    },

    // Wall of blocks distributed across three columns
    checkerboard: function () {
        // Spawn blocks
        for (let i = 1; i < MAX_VERT_OBSTACLES - 1; i++) {
            spawnBlock((i % 3) * 3, i);
        }

        // Spawn checkpoint
        spawnCheckpoint(7);

        // Set delay
        game.obstacleDistance = OBSTACLE_SIZE * 7 + OBSTACLE_MIN_DISTANCE;
    },

    // Long wall of blocks with a gap
    tunnel: function () {
        // Spawn blocks
        let tunnelHeight = Math.floor(Math.random() * ((MAX_VERT_OBSTACLES) - 3)) + 1;
        let tunnelLength = Math.floor(Math.random() * 5) + 5;

        for (let i = 0; i < tunnelLength; i++) {
            for (let j = 1; j < MAX_VERT_OBSTACLES - 1; j++) {
                if (j < tunnelHeight || j > tunnelHeight + 1) {
                    spawnBlock(i, j);
                }
            }
        }

        // Spawn checkpoint at end of tunnel
        spawnCheckpoint(tunnelLength);

        // Set delay
        game.obstacleDistance = OBSTACLE_SIZE * (tunnelLength - 1) + OBSTACLE_MIN_DISTANCE;
    },

    // Long wall of blocks with a gap that shifts up and down
    tunnelWave: function () {
        // Spawn blocks
        let tunnelHeight = Math.floor(Math.random() * (MAX_VERT_OBSTACLES - 8)) + 3;
        let tunnelLength = Math.floor(Math.random() * 5) + 10;
        let direction = Math.floor(Math.random() * 2) * 2 - 1;

        for (let i = 0; i < tunnelLength; i++) {
            for (let j = 1; j < MAX_VERT_OBSTACLES - 1; j++) {
                let tunnelHeightShift = tunnelHeight + Math.round(Math.sin(i * Math.PI * 0.2) * 2 * direction);
                if (j < tunnelHeightShift || j > tunnelHeightShift + 3) {
                    spawnBlock(i, j);
                }
            }
        }

        // Spawn checkpoint at end of tunnel
        spawnCheckpoint(tunnelLength);

        // Set delay
        game.obstacleDistance = OBSTACLE_SIZE * (tunnelLength - 1) + OBSTACLE_MIN_DISTANCE;
    },


    // Long wall of blocks with a 4-tall gap with alternating 'spikes'
    tunnelSpikes: function () {
        // Spawn blocks
        let tunnelHeight = Math.floor(Math.random() * (MAX_VERT_OBSTACLES - 6)) + 1;
        let tunnelLength = Math.floor(Math.random() * 2) + 3;
        let spikeDir = Math.floor(Math.random() * 2);

        for (let i = 0; i < tunnelLength; i++) {
            for (let j = 1; j < MAX_VERT_OBSTACLES - 1; j++) {
                if (j < tunnelHeight || j > tunnelHeight + 4) {
                    for (let k = 0; k < 4 && (i != tunnelLength - 1 || k === 0); k++) {
                        spawnBlock(4 * i + k, j);
                    }
                }
            }

            for (let j = 0; j < 3; j++) {
                spawnBlock(4 * i, tunnelHeight + spikeDir * 2 + j);
            }

            spikeDir = 1 - spikeDir;
        }

        // Spawn checkpoint at end of tunnel
        spawnCheckpoint(tunnelLength * 4 - 3);

        // Set delay
        game.obstacleDistance = OBSTACLE_SIZE * (tunnelLength * 4 - 2) + OBSTACLE_MIN_DISTANCE;
    },

    // Long wall of blocks with a sinusoidal moving gap
    tunnelMoving: function () {
        // Spawn blocks
        let tunnelHeight = MAX_VERT_OBSTACLES * 0.5 - 2;
        let tunnelLength = Math.floor(Math.random() * 5) + 5;
        let movement = (Math.floor(Math.random() * 2) * 2 - 1) * OBSTACLE_SIZE * 0.035;

        for (let i = 0; i < tunnelLength; i++) {
            for (let j = -1; j < MAX_VERT_OBSTACLES + 1; j++) {
                if (j < tunnelHeight || j > tunnelHeight + 3) {
                    spawnBlock(i, j, movement, 2.5, 1 + 0.25 * i);
                }
            }
        }

        // Spawn checkpoint at end of tunnel
        spawnCheckpoint(tunnelLength);

        // Set delay
        game.obstacleDistance = OBSTACLE_SIZE * (tunnelLength - 1) + OBSTACLE_MIN_DISTANCE;
    },


    // Wall of blocks with gap in center of screen along with a waving line of blocks crossing the gap
    tunnelSnake: function () {
        // Spawn blocks
        let movement = (Math.floor(Math.random() * 2) * 2 - 1) * OBSTACLE_SIZE * 0.035;

        for (let i = 0; i < 3; i++) {
            for (let j = 0; j < 12 - 2 * i; j++) {
                spawnBlock(i + j, i + 1);
                spawnBlock(i + j, MAX_VERT_OBSTACLES - 2 - i);
            }
        }

        for (let i = 0; i < 8; i++) {
            spawnBlock(2 + i, MAX_VERT_OBSTACLES * 0.5, movement, game.scrollSpeed * 0.5, -1 - 0.5 * i);
        }

        // Spawn checkpoint at end of tunnel
        spawnCheckpoint(10);

        // Set delay
        game.obstacleDistance = OBSTACLE_SIZE * 11 + OBSTACLE_MIN_DISTANCE;
    },

    // Long rows of moving blocks
    movingRows: function () {
        // Spawn blocks
        let tunnelLength = Math.floor(Math.random() * 3) + 5;
        let movement = (Math.floor(Math.random() * 2) * 2 - 1) * OBSTACLE_SIZE * 0.03 * (Math.floor(Math.random() * 2) + 2);

        for (let i = 0; i < tunnelLength; i++) {
            spawnBlock(i, 0, movement);
            spawnBlock(i, (GAME_HEIGHT / OBSTACLE_SIZE) * 0.5 + 1, movement);
        }

        // Spawn checkpoint
        spawnCheckpoint(tunnelLength);

        // Set delay
        game.obstacleDistance = OBSTACLE_SIZE * (tunnelLength - 1) + OBSTACLE_MIN_DISTANCE;
    },

    // Wall of blocks with a gap that moves to span the screen
    staircase: function () {
        // Spawn blocks
        let direction = Math.floor(Math.random() * 2);

        for (let i = 1; i < MAX_VERT_OBSTACLES - 3; i++) {
            for (let j = 1; j < MAX_VERT_OBSTACLES - 1; j++) {
                let stairHeight;
                if (direction === 0) {
                    stairHeight = i;
                } else {
                    stairHeight = MAX_VERT_OBSTACLES - 3 - i;
                }

                if (j < stairHeight || j > stairHeight + 3) {
                    spawnBlock(i, j);
                }
            }
        }

        // Spawn checkpoint at end of staircase
        spawnCheckpoint(MAX_VERT_OBSTACLES - 3);

        // Set delay
        game.obstacleDistance = OBSTACLE_SIZE * (MAX_VERT_OBSTACLES - 2) + OBSTACLE_MIN_DISTANCE;
    },


    // Diagonal line of moving blocks
    movingStairs: function () {
        // Spawn blocks
        let stairDir = Math.floor(Math.random() * 2) * 2 - 1;
        let movement = -stairDir * OBSTACLE_SIZE * 0.025 * (Math.floor(Math.random() * 4) + 4);

        for (let i = 0; i < MAX_VERT_OBSTACLES - 3; i++) {
            spawnBlock(i, i * stairDir, movement);
            spawnBlock(i, i * stairDir + MAX_VERT_OBSTACLES * 0.5 + 1, movement);
        }

        // Spawn checkpoint
        spawnCheckpoint(MAX_VERT_OBSTACLES - 3);

        // Set delay
        game.obstacleDistance = OBSTACLE_SIZE * (MAX_VERT_OBSTACLES - 3) + OBSTACLE_MIN_DISTANCE;
    },

    // Spike of blocks spanning the entire screen
    spike: function (startOffset, direction) {
        // Spawn blocks
        for (let i = 0; i < 4; i++) {
            for (let j = 0; j < MAX_VERT_OBSTACLES - 5 - 2 * i; j++) {
                for (let k = 0; k < 2; k++) {
                    let yPos = 2 * i + k + 2 - direction;

                    if (direction === 0) {
                        yPos = MAX_VERT_OBSTACLES - yPos;
                    }

                    spawnBlock(i + j + startOffset, yPos);
                }
            }
        }

        // Spawn checkpoint at peak of spike
        spawnCheckpoint(4 + startOffset);
    },

    // Spawn one spike in a random direction
    singleSpike: function () {
        this.spike(0, Math.floor(Math.random() * 2));

        // Set delay
        game.obstacleDistance = OBSTACLE_SIZE * 5 + OBSTACLE_MIN_DISTANCE;
    },


    // Spawn two spikes in opposite directions
    doubleSpike: function () {
        let dir = Math.floor(Math.random() * 2);
        this.spike(0, dir);
        this.spike(7, 1 - dir);

        // Set delay
        game.obstacleDistance = OBSTACLE_SIZE * 13 + OBSTACLE_MIN_DISTANCE;
    },

    // Two horizontal lines of blocks that move sinusoidally
    piston: function (startOffset, direction) {
        // Spawn blocks
        let movement = (Math.floor(Math.random() * 2) * 2 - 1) * OBSTACLE_SIZE * 0.04;

        for (let i = -1; i < 4; i++) {
            spawnBlock(2, i, movement, 3, 1);
            spawnBlock(2, MAX_VERT_OBSTACLES - i, movement, 3, 1);
        }

        for (let i = 0; i < 5; i++) {
            spawnBlock(i, 4, movement, 3, 1);
            spawnBlock(i, MAX_VERT_OBSTACLES - 4, movement, 3, 1);
        }

        // Spawn checkpoint
        spawnCheckpoint(6);

        // Set delay
        game.obstacleDistance = OBSTACLE_SIZE * 5 + OBSTACLE_MIN_DISTANCE;
    },
};

/********************
 * Helper functions *
 ********************/
// Check for collision between rectangle and circle
// Adapted from https://stackoverflow.com/a/21096179
function rectCircleColliding(circX, circY, circRadius, rectX, rectY, rectW, rectH) {
    let distX = Math.abs(circX - rectX - rectW / 2);
    let distY = Math.abs(circY - rectY - rectH / 2);

    if (distX > rectW / 2 + circRadius || distY > rectH / 2 + circRadius) {
        return false;
    }

    if (distX <= rectW / 2 || distY <= rectH / 2) {
        return true;
    }

    let dx = distX - rectW / 2;
    let dy = distY - rectH / 2;
    return dx * dx + dy * dy <= circRadius * circRadius;
}

// Check for collision between two points and an obstacle
function lineSquareColliding(plrPoint, plrProjected, obstacle) {
    let intersections = [
        segment_intersection(plrPoint.x, plrPoint.y, plrProjected.x, plrProjected.y,
            obstacle.x - OBSTACLE_SIZE * 0.5, obstacle.y - OBSTACLE_SIZE * 0.5,
            obstacle.x + OBSTACLE_SIZE * 0.5, obstacle.y - OBSTACLE_SIZE * 0.5),
        segment_intersection(plrPoint.x, plrPoint.y, plrProjected.x, plrProjected.y,
            obstacle.x - OBSTACLE_SIZE * 0.5, obstacle.y - OBSTACLE_SIZE * 0.5,
            obstacle.x - OBSTACLE_SIZE * 0.5, obstacle.y + OBSTACLE_SIZE * 0.5),
        segment_intersection(plrPoint.x, plrPoint.y, plrProjected.x, plrProjected.y,
            obstacle.x + OBSTACLE_SIZE * 0.5, obstacle.y - OBSTACLE_SIZE * 0.5,
            obstacle.x + OBSTACLE_SIZE * 0.5, obstacle.y + OBSTACLE_SIZE * 0.5),
        segment_intersection(plrPoint.x, plrPoint.y, plrProjected.x, plrProjected.y,
            obstacle.x - OBSTACLE_SIZE * 0.5, obstacle.y + OBSTACLE_SIZE * 0.5,
            obstacle.x + OBSTACLE_SIZE * 0.5, obstacle.y + OBSTACLE_SIZE * 0.5),
    ];

    return intersections;
}

// Calculate the intersection of two line segments
// Taken from https://gist.github.com/gordonwoodhull/50eb65d2f048789f9558
var eps = 0.0000001;
function between(a, b, c) {
    return a - eps <= b && b <= c + eps;
}

function segment_intersection(x1, y1, x2, y2, x3, y3, x4, y4) {
    var x = ((x1 * y2 - y1 * x2) * (x3 - x4) - (x1 - x2) * (x3 * y4 - y3 * x4)) /
        ((x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4));
    var y = ((x1 * y2 - y1 * x2) * (y3 - y4) - (y1 - y2) * (x3 * y4 - y3 * x4)) /
        ((x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4));
    if (isNaN(x) || isNaN(y)) {
        return false;
    } else {
        if (x1 >= x2) {
            if (!between(x2, x, x1)) { return false; }
        } else {
            if (!between(x1, x, x2)) { return false; }
        }
        if (y1 >= y2) {
            if (!between(y2, y, y1)) { return false; }
        } else {
            if (!between(y1, y, y2)) { return false; }
        }
        if (x3 >= x4) {
            if (!between(x4, x, x3)) { return false; }
        } else {
            if (!between(x3, x, x4)) { return false; }
        }
        if (y3 >= y4) {
            if (!between(y4, y, y3)) { return false; }
        } else {
            if (!between(y3, y, y4)) { return false; }
        }
    }
    return { x: x, y: y };
}

// Shuffle an array
// Taken from https://stackoverflow.com/a/6274381
function shuffle(a) {
    var j, x, i;
    for (i = a.length - 1; i > 0; i--) {
        j = Math.floor(Math.random() * (i + 1));
        x = a[i];
        a[i] = a[j];
        a[j] = x;
    }
}

// Calculate the distance between two points
function distance(point1x, point1y, point2x, point2y) {
    return Math.sqrt((point2y - point1y) * (point2y - point1y) + (point2x - point1x) * (point2x - point1x));
}