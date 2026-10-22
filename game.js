const canvas = document.querySelector("#game-canvas");
const ctx = canvas.getContext("2d");

const scoreElement = document.querySelector("#score");
const bestScoreElement = document.querySelector("#best-score");
const livesElement = document.querySelector("#lives");
const threatElement = document.querySelector("#threat-level");

const overlay = document.querySelector("#game-overlay");
const overlayEyebrow = document.querySelector("#overlay-eyebrow");
const overlayTitle = document.querySelector("#overlay-title");
const overlayDescription = document.querySelector("#overlay-description");
const startButton = document.querySelector("#start-button");

const soundButton = document.querySelector("#sound-button");
const soundIcon = document.querySelector("#sound-icon");
const soundLabel = document.querySelector("#sound-label");

const WIDTH = canvas.width;
const HEIGHT = canvas.height;

const INITIAL_LIVES = 3;
const SHOOT_INTERVAL = 0.22;
const INITIAL_SPAWN_INTERVAL = 0.9;
const MIN_SPAWN_INTERVAL = 0.28;
const STORAGE_KEY = "neon-strike-best-score";

const keys = new Set();
const bullets = [];
const enemies = [];
const particles = [];

const player = {
  x: WIDTH / 2,
  y: HEIGHT / 2,
  radius: 16,
  speed: 260,
  invulnerability: 0,
};

const stars = Array.from({ length: 100 }, () => ({
  x: Math.random() * WIDTH,
  y: Math.random() * HEIGHT,
  size: Math.random() * 2 + 0.5,
  alpha: Math.random() * 0.7 + 0.3,
}));

let score = 0;
let bestScore = loadBestScore();
let lives = INITIAL_LIVES;

let gameStarted = false;
let soundEnabled = true;

let shootCooldown = 0;
let spawnTimer = 0;
let lastTime = 0;
let audioContext = null;

function loadBestScore() {
  try {
    const value = Number(localStorage.getItem(STORAGE_KEY));

    return Number.isSafeInteger(value) && value >= 0 ? value : 0;
  } catch {
    return 0;
  }
}

function saveBestScore() {
  try {
    localStorage.setItem(STORAGE_KEY, String(bestScore));
  } catch {
    // بازی حتی در صورت غیرفعال بودن ذخیره‌سازی ادامه دارد.
  }
}

function updateScore() {
  scoreElement.textContent = String(score).padStart(6, "0");

  if (score > bestScore) {
    bestScore = score;
    bestScoreElement.textContent = String(bestScore).padStart(6, "0");
    saveBestScore();
  }

  updateThreatLevel();
}

function updateThreatLevel() {
  const level = Math.floor(score / 100) + 1;

  threatElement.textContent = String(level).padStart(2, "0");
}

function updateLives() {
  livesElement.textContent = Array.from(
    { length: INITIAL_LIVES },
    (_, index) => (index < lives ? "♥" : "♡"),
  ).join(" ");
}

function getSpawnInterval() {
  const level = Math.floor(score / 100);

  return Math.max(MIN_SPAWN_INTERVAL, INITIAL_SPAWN_INTERVAL - level * 0.08);
}

function getEnemySpeed() {
  const level = Math.floor(score / 100);

  return Math.min(220, 85 + Math.random() * 55 + level * 8);
}

// ---------- Audio ----------

function getAudioContext() {
  if (!soundEnabled) return null;

  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;

    if (!AudioContextClass) return null;

    if (!audioContext) {
      audioContext = new AudioContextClass();
    }

    if (audioContext.state === "suspended") {
      audioContext.resume().catch(() => {});
    }

    return audioContext;
  } catch {
    return null;
  }
}

function playTone({
  frequency,
  endFrequency = frequency,
  duration = 0.08,
  type = "square",
  volume = 0.035,
}) {
  const audio = getAudioContext();

  if (!audio) return;

  try {
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    const now = audio.currentTime;

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(
      Math.max(1, endFrequency),
      now + duration,
    );

    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    oscillator.connect(gain);
    gain.connect(audio.destination);

    oscillator.start(now);
    oscillator.stop(now + duration);
  } catch {
    // خطای صدا نباید منطق بازی را متوقف کند.
  }
}

function playShootSound() {
  playTone({
    frequency: 650,
    endFrequency: 240,
    duration: 0.07,
    volume: 0.018,
  });
}

function playExplosionSound() {
  playTone({
    frequency: 180,
    endFrequency: 45,
    duration: 0.16,
    type: "sawtooth",
    volume: 0.045,
  });
}

function updateSoundButton() {
  soundIcon.textContent = soundEnabled ? "♪" : "×";
  soundLabel.textContent = soundEnabled ? "SOUND ON" : "SOUND OFF";

  soundButton.setAttribute("aria-pressed", String(soundEnabled));
  soundButton.setAttribute(
    "aria-label",
    soundEnabled ? "Mute sound" : "Enable sound",
  );
}

// ---------- Drawing ----------

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
  // چشمک زدن کوتاه بعد از برخورد
  if (
    player.invulnerability > 0 &&
    Math.floor(player.invulnerability * 12) % 2 === 0
  ) {
    return;
  }

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

function drawParticles() {
  ctx.save();

  for (const particle of particles) {
    ctx.globalAlpha = Math.max(0, particle.life / particle.maxLife);
    ctx.fillStyle = particle.color;
    ctx.shadowColor = particle.color;
    ctx.shadowBlur = 8;

    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

// ---------- Player ----------

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

  player.invulnerability = Math.max(0, player.invulnerability - deltaTime);
}

// ---------- Bullets ----------

function shoot() {
  bullets.push({
    x: player.x,
    y: player.y - player.radius,
    radius: 4,
    speed: 520,
  });

  playShootSound();
}

function updateBullets(deltaTime) {
  for (const bullet of bullets) {
    bullet.y -= bullet.speed * deltaTime;
  }

  for (let i = bullets.length - 1; i >= 0; i--) {
    if (bullets[i].y + bullets[i].radius < 0) {
      bullets.splice(i, 1);
    }
  }
}

// ---------- Enemies ----------

function spawnEnemy() {
  const radius = 14 + Math.random() * 8;

  enemies.push({
    x: radius + Math.random() * (WIDTH - radius * 2),
    y: -radius,
    radius,
    speed: getEnemySpeed(),
  });
}

function updateEnemies(deltaTime) {
  for (const enemy of enemies) {
    enemy.y += enemy.speed * deltaTime;
  }

  for (let i = enemies.length - 1; i >= 0; i--) {
    if (enemies[i].y - enemies[i].radius > HEIGHT) {
      enemies.splice(i, 1);
    }
  }
}

// ---------- Explosions ----------

function createExplosion(x, y, color, count = 16) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 45 + Math.random() * 190;
    const size = 1.5 + Math.random() * 3;
    const life = 0.25 + Math.random() * 0.45;

    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size,
      color,
      life,
      maxLife: life,
    });
  }
}

function updateParticles(deltaTime) {
  for (const particle of particles) {
    particle.x += particle.vx * deltaTime;
    particle.y += particle.vy * deltaTime;

    particle.vx *= Math.max(0, 1 - 1.8 * deltaTime);
    particle.vy *= Math.max(0, 1 - 1.8 * deltaTime);

    particle.life -= deltaTime;
  }

  for (let i = particles.length - 1; i >= 0; i--) {
    if (particles[i].life <= 0) {
      particles.splice(i, 1);
    }
  }
}

// ---------- Collision detection ----------

function checkCollisions() {
  for (let i = enemies.length - 1; i >= 0; i--) {
    const enemy = enemies[i];

    for (let j = bullets.length - 1; j >= 0; j--) {
      const bullet = bullets[j];

      const dx = enemy.x - bullet.x;
      const dy = enemy.y - bullet.y;

      if (Math.hypot(dx, dy) < enemy.radius + bullet.radius) {
        enemies.splice(i, 1);
        bullets.splice(j, 1);

        createExplosion(enemy.x, enemy.y, "#ff477e");
        playExplosionSound();

        score += 10;
        updateScore();

        break;
      }
    }
  }
}

function checkPlayerCollisions() {
  if (player.invulnerability > 0) return;

  for (let i = enemies.length - 1; i >= 0; i--) {
    const enemy = enemies[i];

    const dx = enemy.x - player.x;
    const dy = enemy.y - player.y;

    if (Math.hypot(dx, dy) < enemy.radius + player.radius) {
      enemies.splice(i, 1);

      createExplosion(enemy.x, enemy.y, "#ff477e", 22);

      lives -= 1;
      updateLives();

      if (lives <= 0) {
        endGame();
        return;
      }

      // جلوگیری از کم شدن چند جان در یک برخورد پیاپی
      player.invulnerability = 1.2;
      break;
    }
  }
}

// ---------- Game state ----------

function endGame() {
  gameStarted = false;
  keys.clear();

  overlayEyebrow.textContent = "MISSION FAILED";
  overlayTitle.textContent = "GAME OVER";
  overlayDescription.textContent = `Final score: ${score} | Best: ${bestScore}`;
  startButton.textContent = "PLAY AGAIN";

  overlay.hidden = false;
}

function startGame() {
  bullets.length = 0;
  enemies.length = 0;
  particles.length = 0;
  keys.clear();

  player.x = WIDTH / 2;
  player.y = HEIGHT / 2;
  player.invulnerability = 0;

  score = 0;
  lives = INITIAL_LIVES;

  shootCooldown = 0;
  spawnTimer = 0;

  scoreElement.textContent = "000000";
  updateLives();
  updateThreatLevel();

  gameStarted = true;

  overlayEyebrow.textContent = "SYSTEM ONLINE";
  overlayTitle.textContent = "READY TO FIGHT?";
  overlayDescription.textContent = "Destroy enemies. Beat your high score.";
  startButton.textContent = "START GAME";

  overlay.hidden = true;

  // ایجاد AudioContext در تعامل مستقیم کاربر
  if (soundEnabled) {
    getAudioContext();
  }
}

function update(deltaTime) {
  updatePlayer(deltaTime);
  updateParticles(deltaTime);

  shootCooldown -= deltaTime;

  if (keys.has(" ") && shootCooldown <= 0) {
    shoot();
    shootCooldown = SHOOT_INTERVAL;
  }

  updateBullets(deltaTime);

  spawnTimer += deltaTime;

  const spawnInterval = getSpawnInterval();

  if (spawnTimer >= spawnInterval) {
    spawnEnemy();
    spawnTimer -= spawnInterval;
  }

  updateEnemies(deltaTime);
  checkCollisions();
  checkPlayerCollisions();
}

// ---------- Input ----------

const supportedKeys = [
  "w",
  "a",
  "s",
  "d",
  "arrowup",
  "arrowdown",
  "arrowleft",
  "arrowright",
  " ",
];

window.addEventListener("keydown", event => {
  const key = event.key.toLowerCase();

  if (supportedKeys.includes(key)) {
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

startButton.addEventListener("click", startGame);

soundButton.addEventListener("click", () => {
  soundEnabled = !soundEnabled;
  updateSoundButton();

  if (soundEnabled) {
    getAudioContext();
  }
});

// ---------- Main loop ----------

function render(timestamp = 0) {
  const deltaTime = Math.min((timestamp - lastTime) / 1000, 0.05);
  lastTime = timestamp;

  drawBackground();

  if (gameStarted) {
    update(deltaTime);
  } else {
    updateParticles(deltaTime);
  }

  drawBullets();
  drawEnemies();
  drawParticles();
  drawPlayer();

  requestAnimationFrame(render);
}

// ---------- Initial setup ----------

scoreElement.textContent = "000000";
bestScoreElement.textContent = String(bestScore).padStart(6, "0");

updateLives();
updateThreatLevel();
updateSoundButton();

render();
