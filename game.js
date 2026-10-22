const canvas = document.querySelector("#game-canvas");
const ctx = canvas.getContext("2d");

const scoreElement = document.querySelector("#score");
const overlay = document.querySelector("#game-overlay");
const startButton = document.querySelector("#start-button");

const WIDTH = canvas.width;
const HEIGHT = canvas.height;

const keys = new Set();

const player = {
  x: WIDTH / 2,
  y: HEIGHT / 2,
  radius: 16,
  speed: 260,
};

const bullets = [];
const enemies = [];

let score = 0;
let gameStarted = false;
let lastTime = 0;
let shootCooldown = 0;
let spawnTimer = 0;

const SHOOT_INTERVAL = 0.22;
const ENEMY_SPAWN_INTERVAL = 0.9;

const stars = Array.from({ length: 100 }, () => ({
  x: Math.random() * WIDTH,
  y: Math.random() * HEIGHT,
  size: Math.random() * 2 + 0.5,
  alpha: Math.random() * 0.7 + 0.3,
}));

function drawBackground() {
  ctx.fillStyle = "#070b19";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  for (const star of stars) {
    ctx.globalAlpha = star.alpha;
    ctx.fillStyle = "#dce8ff";
    ctx.fillRect(star.x, star.y, star.size, star.size);
  }

  ctx.globalAlpha = 1;
}

function drawPlayer() {
  ctx.save();
  ctx.translate(player.x, player.y);

  ctx.shadowColor = "#44f0db";
  ctx.shadowBlur = 18;
  ctx.fillStyle = "#44f0db";

  ctx.beginPath();
  ctx.moveTo(0, -player.radius);
  ctx.lineTo(player.radius * 0.75, player.radius);
  ctx.lineTo(0, player.radius * 0.55);
  ctx.lineTo(-player.radius * 0.75, player.radius);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

function updatePlayer(deltaTime) {
  let dx = 0;
  let dy = 0;

  if (keys.has("w") || keys.has("arrowup")) dy -= 1;
  if (keys.has("s") || keys.has("arrowdown")) dy += 1;
  if (keys.has("a") || keys.has("arrowleft")) dx -= 1;
  if (keys.has("d") || keys.has("arrowright")) dx += 1;

  const length = Math.hypot(dx, dy);

  if (length > 0) {
    dx /= length;
    dy /= length;
  }

  player.x += dx * player.speed * deltaTime;
  player.y += dy * player.speed * deltaTime;

  player.x = Math.max(player.radius, Math.min(WIDTH - player.radius, player.x));

  player.y = Math.max(
    player.radius,
    Math.min(HEIGHT - player.radius, player.y),
  );
}

function shoot() {
  bullets.push({
    x: player.x,
    y: player.y - player.radius,
    radius: 4,
    speed: 520,
  });
}

function updateBullets(deltaTime) {
  for (const bullet of bullets) {
    bullet.y -= bullet.speed * deltaTime;
  }

  // حذف تیرهایی که از صفحه خارج شده‌اند
  for (let i = bullets.length - 1; i >= 0; i--) {
    if (bullets[i].y + bullets[i].radius < 0) {
      bullets.splice(i, 1);
    }
  }
}

function drawBullets() {
  ctx.save();
  ctx.fillStyle = "#44f0db";
  ctx.shadowColor = "#44f0db";
  ctx.shadowBlur = 12;

  for (const bullet of bullets) {
    ctx.beginPath();
    ctx.roundRect(
      bullet.x - bullet.radius,
      bullet.y - bullet.radius * 2,
      bullet.radius * 2,
      bullet.radius * 4,
      3,
    );
    ctx.fill();
  }

  ctx.restore();
}

function spawnEnemy() {
  const radius = 14 + Math.random() * 8;

  enemies.push({
    x: radius + Math.random() * (WIDTH - radius * 2),
    y: -radius,
    radius,
    speed: 85 + Math.random() * 55,
  });
}

function updateEnemies(deltaTime) {
  for (const enemy of enemies) {
    enemy.y += enemy.speed * deltaTime;
  }

  // فعلاً دشمن‌هایی که از پایین صفحه خارج شوند حذف می‌شوند.
  for (let i = enemies.length - 1; i >= 0; i--) {
    if (enemies[i].y - enemies[i].radius > HEIGHT) {
      enemies.splice(i, 1);
    }
  }
}

function drawEnemies() {
  ctx.save();

  for (const enemy of enemies) {
    ctx.fillStyle = "#ff477e";
    ctx.shadowColor = "#ff477e";
    ctx.shadowBlur = 16;

    ctx.beginPath();
    ctx.moveTo(enemy.x, enemy.y - enemy.radius);
    ctx.lineTo(enemy.x + enemy.radius, enemy.y);
    ctx.lineTo(enemy.x, enemy.y + enemy.radius);
    ctx.lineTo(enemy.x - enemy.radius, enemy.y);
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
}

function checkCollisions() {
  // از آخر به اول حرکت می‌کنیم تا حذف عناصر باعث
  // جا افتادن عناصر بعدی در آرایه نشود.
  for (let i = enemies.length - 1; i >= 0; i--) {
    const enemy = enemies[i];
    let destroyed = false;

    for (let j = bullets.length - 1; j >= 0; j--) {
      const bullet = bullets[j];

      const dx = enemy.x - bullet.x;
      const dy = enemy.y - bullet.y;
      const distance = Math.hypot(dx, dy);

      if (distance < enemy.radius + bullet.radius) {
        enemies.splice(i, 1);
        bullets.splice(j, 1);

        score += 10;
        scoreElement.textContent = String(score).padStart(6, "0");

        destroyed = true;
        break;
      }
    }

    if (destroyed) {
      continue;
    }
  }
}

function update(deltaTime) {
  updatePlayer(deltaTime);

  shootCooldown -= deltaTime;

  if (keys.has(" ") && shootCooldown <= 0) {
    shoot();
    shootCooldown = SHOOT_INTERVAL;
  }

  updateBullets(deltaTime);

  spawnTimer += deltaTime;

  if (spawnTimer >= ENEMY_SPAWN_INTERVAL) {
    spawnEnemy();
    spawnTimer -= ENEMY_SPAWN_INTERVAL;
  }

  updateEnemies(deltaTime);
  checkCollisions();
}

function render(timestamp = 0) {
  const deltaTime = Math.min((timestamp - lastTime) / 1000, 0.05);
  lastTime = timestamp;

  drawBackground();

  if (gameStarted) {
    update(deltaTime);
  }

  drawBullets();
  drawEnemies();
  drawPlayer();

  requestAnimationFrame(render);
}

window.addEventListener("keydown", event => {
  const key = event.key.toLowerCase();

  if (
    [
      "w",
      "a",
      "s",
      "d",
      "arrowup",
      "arrowdown",
      "arrowleft",
      "arrowright",
      " ",
    ].includes(key)
  ) {
    event.preventDefault();
    keys.add(key);
  }
});

window.addEventListener("keyup", event => {
  keys.delete(event.key.toLowerCase());
});

window.addEventListener("blur", () => {
  keys.clear();
});

startButton.addEventListener("click", () => {
  gameStarted = true;
  overlay.hidden = true;
});

render();
