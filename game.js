"use strict";

const canvas = document.getElementById("game-canvas");
const ctx = canvas.getContext("2d");

const scoreValue = document.getElementById("score-value");
const bestValue = document.getElementById("best-value");
const livesValue = document.getElementById("lives-value");
const threatValue = document.getElementById("threat-value");

const overlay = document.getElementById("game-overlay");
const overlayEyebrow = document.getElementById("overlay-eyebrow");
const overlayTitle = document.getElementById("overlay-title");
const overlayMessage = document.getElementById("overlay-message");
const startButton = document.getElementById("start-button");

const soundButton = document.getElementById("sound-button");
const pauseButton = document.getElementById("pause-button");
const statusLabel = document.getElementById("status-label");
const statusChip = document.querySelector(".status-chip");
const fireButton = document.getElementById("fire-button");

const WIDTH = canvas.width;
const HEIGHT = canvas.height;

const PLAYER_SPEED = 280;
const PLAYER_SIZE = 15;
const PLAYER_FIRE_INTERVAL = 0.22;
const PLAYER_INVULNERABILITY = 1.2;

const INITIAL_SPAWN_INTERVAL = 1.05;
const MIN_SPAWN_INTERVAL = 0.28;
const INITIAL_ENEMY_SPEED = 95;
const MAX_ENEMY_SPEED = 220;

const MAX_PARTICLES = 650;
const BEST_SCORE_KEY = "neon-strike-best-score";

const keys = new Set();
const touchControls = new Set();

let state = "ready";
let score = 0;
let bestScore = loadBestScore();
let lives = 3;
let threatLevel = 1;

let elapsedTime = 0;
let spawnTimer = 0;
let fireTimer = 0;
let damageCooldown = 0;
let lastFrameTime = 0;
let animationId = 0;

let soundEnabled = true;
let audioContext = null;

let bullets = [];
let enemies = [];
let particles = [];
let stars = [];

const player = {
  x: WIDTH / 2,
  y: HEIGHT - 72,
  radius: PLAYER_SIZE,
  invulnerable: 0,
};

function loadBestScore() {
  try {
    const value = Number(localStorage.getItem(BEST_SCORE_KEY));
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  } catch {
    return 0;
  }
}

function saveBestScore() {
  try {
    localStorage.setItem(BEST_SCORE_KEY, String(bestScore));
  } catch {
    // The game remains playable when storage is unavailable.
  }
}

function formatScore(value) {
  return String(value).padStart(6, "0");
}

function updateScore() {
  scoreValue.textContent = formatScore(score);

  if (score > bestScore) {
    bestScore = score;
    bestValue.textContent = formatScore(bestScore);
    saveBestScore();
  }

  updateThreatLevel();
}

function updateThreatLevel() {
  threatLevel = Math.floor(score / 100) + 1;
  threatValue.textContent = String(threatLevel).padStart(2, "0");
}

function updateLives() {
  livesValue.textContent = `${"♥ ".repeat(Math.max(0, lives))}`.trim() || "—";
}

function getSpawnInterval() {
  return Math.max(
    MIN_SPAWN_INTERVAL,
    INITIAL_SPAWN_INTERVAL - (threatLevel - 1) * 0.08,
  );
}

function getEnemySpeed() {
  return Math.min(MAX_ENEMY_SPEED, INITIAL_ENEMY_SPEED + (threatLevel - 1) * 8);
}

function setStatus(label, mode = "") {
  statusLabel.textContent = label;
  statusChip.classList.toggle("is-paused", mode === "paused");
  statusChip.classList.toggle("is-over", mode === "over");
}

function showOverlay({ eyebrow, title, message, button, hint }) {
  overlayEyebrow.textContent = eyebrow;
  overlayTitle.innerHTML = title;
  overlayMessage.textContent = message;
  startButton.textContent = button;
  startButton.hidden = !button;
  overlay.querySelector(".overlay-hint").textContent = hint;
  overlay.classList.remove("is-hidden");
}

function hideOverlay() {
  overlay.classList.add("is-hidden");
}

function makeStars() {
  stars = Array.from({ length: 100 }, () => ({
    x: Math.random() * WIDTH,
    y: Math.random() * HEIGHT,
    size: Math.random() * 1.7 + 0.3,
    speed: Math.random() * 22 + 8,
    alpha: Math.random() * 0.6 + 0.15,
  }));
}

function resetPlayer() {
  player.x = WIDTH / 2;
  player.y = HEIGHT - 72;
  player.invulnerable = 0;
}

function clearControls() {
  keys.clear();
  touchControls.clear();

  document.querySelectorAll(".control-button, .fire-button").forEach(button => {
    button.classList.remove("is-pressed");
  });
}

function resetGame() {
  score = 0;
  lives = 3;
  threatLevel = 1;
  elapsedTime = 0;
  spawnTimer = 0.45;
  fireTimer = 0;
  damageCooldown = 0;

  bullets = [];
  enemies = [];
  particles = [];

  resetPlayer();
  clearControls();
  updateScore();
  updateLives();
}

function startGame() {
  if (state === "running") return;

  resetGame();
  state = "running";

  hideOverlay();
  setStatus("IN COMBAT");
  pauseButton.disabled = false;
  pauseButton.textContent = "PAUSE";

  lastFrameTime = performance.now();
  playTone(520, 0.09, "sine", 0.025);

  if (!animationId) {
    animationId = requestAnimationFrame(gameLoop);
  }
}

function pauseGame() {
  if (state !== "running") return;

  state = "paused";
  clearControls();
  setStatus("PAUSED", "paused");
  pauseButton.textContent = "RESUME";

  showOverlay({
    eyebrow: "SYSTEM PAUSED",
    title: "Take a <span>Breather.</span>",
    message: "Your run is paused. Resume when you're ready.",
    button: "RESUME GAME",
    hint: "PRESS P OR ESC TO RESUME",
  });
}

function resumeGame() {
  if (state !== "paused") return;

  state = "running";
  clearControls();
  hideOverlay();
  setStatus("IN COMBAT");
  pauseButton.textContent = "PAUSE";
  lastFrameTime = performance.now();
}

function endGame() {
  state = "gameover";
  clearControls();
  setStatus("GAME OVER", "over");
  pauseButton.disabled = true;
  pauseButton.textContent = "PAUSE";

  showOverlay({
    eyebrow: "MISSION FAILED",
    title: "Grid <span>Compromised.</span>",
    message: `Final score: ${score}. Best score: ${bestScore}.`,
    button: "PLAY AGAIN",
    hint: "PRESS ENTER TO RESTART",
  });

  playTone(145, 0.35, "sawtooth", 0.035);
}

function togglePause() {
  if (state === "running") {
    pauseGame();
  } else if (state === "paused") {
    resumeGame();
  }
}

function getAudioContext() {
  if (!soundEnabled) return null;

  try {
    if (!audioContext) {
      const AudioContextClass =
        window.AudioContext || window.webkitAudioContext;

      if (!AudioContextClass) return null;
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

function playTone(frequency, duration, type = "sine", volume = 0.04) {
  if (!soundEnabled) return;

  const audio = getAudioContext();
  if (!audio) return;

  try {
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    const now = audio.currentTime;

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(
      Math.max(35, frequency * 0.55),
      now + duration,
    );

    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    oscillator.connect(gain);
    gain.connect(audio.destination);

    oscillator.start(now);
    oscillator.stop(now + duration);
  } catch {
    // Audio is optional; continue without sound if the browser blocks it.
  }
}

function toggleSound() {
  soundEnabled = !soundEnabled;
  soundButton.textContent = `SOUND: ${soundEnabled ? "ON" : "OFF"}`;

  if (soundEnabled) {
    playTone(650, 0.08, "sine", 0.025);
  }
}

function isControlPressed(name) {
  return keys.has(name) || touchControls.has(name);
}

function fireBullet() {
  bullets.push({
    x: player.x,
    y: player.y - player.radius - 7,
    radius: 3,
    speed: 480,
  });

  playTone(720, 0.07, "square", 0.018);
}

function spawnEnemy() {
  const radius = 12 + Math.random() * 8;

  enemies.push({
    x: radius + Math.random() * (WIDTH - radius * 2),
    y: -radius - 5,
    radius,
    speed: getEnemySpeed() * (0.8 + Math.random() * 0.4),
    drift: (Math.random() - 0.5) * 36,
    phase: Math.random() * Math.PI * 2,
    color: Math.random() > 0.5 ? "#ff4fa3" : "#a78bfa",
  });
}

function createExplosion(x, y, color, amount = 18) {
  const available = MAX_PARTICLES - particles.length;
  const count = Math.min(amount, available);

  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * 150 + 35;
    const life = Math.random() * 0.45 + 0.25;

    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: Math.random() * 3 + 1,
      color,
      life,
      maxLife: life,
    });
  }
}

function damagePlayer() {
  if (state !== "running" || damageCooldown > 0) return;

  lives -= 1;
  damageCooldown = 0.65;
  player.invulnerable = PLAYER_INVULNERABILITY;

  updateLives();
  createExplosion(player.x, player.y, "#48f2ff", 26);
  playTone(180, 0.22, "sawtooth", 0.04);

  if (lives <= 0) {
    endGame();
  }
}

function updatePlayer(deltaTime) {
  let dx = 0;
  let dy = 0;

  if (isControlPressed("left")) dx -= 1;
  if (isControlPressed("right")) dx += 1;
  if (isControlPressed("up")) dy -= 1;
  if (isControlPressed("down")) dy += 1;

  if (dx !== 0 && dy !== 0) {
    const magnitude = Math.sqrt(dx * dx + dy * dy);
    dx /= magnitude;
    dy /= magnitude;
  }

  player.x += dx * PLAYER_SPEED * deltaTime;
  player.y += dy * PLAYER_SPEED * deltaTime;

  player.x = Math.max(
    player.radius + 4,
    Math.min(WIDTH - player.radius - 4, player.x),
  );
  player.y = Math.max(
    player.radius + 4,
    Math.min(HEIGHT - player.radius - 4, player.y),
  );

  player.invulnerable = Math.max(0, player.invulnerable - deltaTime);
  damageCooldown = Math.max(0, damageCooldown - deltaTime);

  fireTimer -= deltaTime;

  if (isControlPressed("fire") && fireTimer <= 0) {
    fireBullet();
    fireTimer = PLAYER_FIRE_INTERVAL;
  }
}

function updateBullets(deltaTime) {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const bullet = bullets[i];
    bullet.y -= bullet.speed * deltaTime;

    if (bullet.y + bullet.radius < 0) {
      bullets.splice(i, 1);
    }
  }
}

function updateEnemies(deltaTime) {
  spawnTimer -= deltaTime;

  if (spawnTimer <= 0) {
    spawnEnemy();
    spawnTimer = getSpawnInterval() * (0.8 + Math.random() * 0.4);
  }

  for (let i = enemies.length - 1; i >= 0; i--) {
    const enemy = enemies[i];

    enemy.y += enemy.speed * deltaTime;
    enemy.x +=
      Math.sin(elapsedTime * 1.8 + enemy.phase) * enemy.drift * deltaTime;

    enemy.x = Math.max(enemy.radius, Math.min(WIDTH - enemy.radius, enemy.x));

    if (enemy.y - enemy.radius > HEIGHT) {
      enemies.splice(i, 1);
      damagePlayer();

      if (state !== "running") return;
    }
  }
}

function updateParticles(deltaTime) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const particle = particles[i];

    particle.x += particle.vx * deltaTime;
    particle.y += particle.vy * deltaTime;
    particle.vx *= Math.pow(0.06, deltaTime);
    particle.vy *= Math.pow(0.06, deltaTime);
    particle.life -= deltaTime;

    if (particle.life <= 0) {
      particles.splice(i, 1);
    }
  }
}

function circlesOverlap(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const distance = a.radius + b.radius;

  return dx * dx + dy * dy <= distance * distance;
}

function checkCollisions() {
  for (let enemyIndex = enemies.length - 1; enemyIndex >= 0; enemyIndex--) {
    const enemy = enemies[enemyIndex];

    if (player.invulnerable <= 0 && circlesOverlap(player, enemy)) {
      enemies.splice(enemyIndex, 1);
      damagePlayer();

      if (state !== "running") return;
      continue;
    }

    let enemyDestroyed = false;

    for (
      let bulletIndex = bullets.length - 1;
      bulletIndex >= 0;
      bulletIndex--
    ) {
      const bullet = bullets[bulletIndex];

      if (!circlesOverlap(enemy, bullet)) continue;

      bullets.splice(bulletIndex, 1);
      enemies.splice(enemyIndex, 1);

      createExplosion(enemy.x, enemy.y, enemy.color, 18);
      playTone(260, 0.1, "triangle", 0.025);

      score += 10;
      updateScore();

      enemyDestroyed = true;
      break;
    }

    if (enemyDestroyed) continue;
  }
}

function updateStars(deltaTime) {
  for (const star of stars) {
    star.y += star.speed * deltaTime;

    if (star.y > HEIGHT) {
      star.y = 0;
      star.x = Math.random() * WIDTH;
    }
  }
}

function update(deltaTime) {
  elapsedTime += deltaTime;

  updateStars(deltaTime);
  updatePlayer(deltaTime);
  updateBullets(deltaTime);
  updateEnemies(deltaTime);

  if (state !== "running") return;

  checkCollisions();
  updateParticles(deltaTime);
}

function drawBackground() {
  ctx.fillStyle = "#050914";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const glow = ctx.createRadialGradient(
    WIDTH / 2,
    HEIGHT * 0.4,
    20,
    WIDTH / 2,
    HEIGHT * 0.4,
    HEIGHT * 0.8,
  );

  glow.addColorStop(0, "rgba(24, 53, 100, 0.23)");
  glow.addColorStop(1, "rgba(5, 9, 20, 0)");

  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.strokeStyle = "rgba(75, 119, 174, 0.07)";
  ctx.lineWidth = 1;

  for (let x = 0; x <= WIDTH; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, HEIGHT);
    ctx.stroke();
  }

  for (let y = 0; y <= HEIGHT; y += 40) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(WIDTH, y);
    ctx.stroke();
  }

  for (const star of stars) {
    ctx.globalAlpha = star.alpha;
    ctx.fillStyle = "#b8e8ff";
    ctx.fillRect(star.x, star.y, star.size, star.size * 1.5);
  }

  ctx.globalAlpha = 1;
}

function drawPlayer() {
  if (
    player.invulnerable > 0 &&
    Math.floor(player.invulnerable * 12) % 2 === 0
  ) {
    return;
  }

  ctx.save();
  ctx.translate(player.x, player.y);

  ctx.shadowBlur = 20;
  ctx.shadowColor = "#48f2ff";

  ctx.fillStyle = "#48f2ff";
  ctx.beginPath();
  ctx.moveTo(0, -PLAYER_SIZE - 5);
  ctx.lineTo(PLAYER_SIZE, PLAYER_SIZE);
  ctx.lineTo(0, PLAYER_SIZE - 5);
  ctx.lineTo(-PLAYER_SIZE, PLAYER_SIZE);
  ctx.closePath();
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.fillStyle = "#eafcff";
  ctx.beginPath();
  ctx.moveTo(0, -PLAYER_SIZE + 3);
  ctx.lineTo(5, 7);
  ctx.lineTo(-5, 7);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#a78bfa";
  ctx.fillRect(-4, PLAYER_SIZE, 3, 7 + Math.random() * 4);
  ctx.fillRect(1, PLAYER_SIZE, 3, 7 + Math.random() * 4);

  ctx.restore();
}

function drawBullets() {
  for (const bullet of bullets) {
    ctx.save();
    ctx.shadowBlur = 14;
    ctx.shadowColor = "#48f2ff";
    ctx.fillStyle = "#d9fcff";
    ctx.fillRect(bullet.x - 2, bullet.y - 8, 4, 13);
    ctx.restore();
  }
}

function drawEnemies() {
  for (const enemy of enemies) {
    ctx.save();
    ctx.translate(enemy.x, enemy.y);
    ctx.rotate(elapsedTime * 0.7);

    ctx.shadowBlur = 17;
    ctx.shadowColor = enemy.color;
    ctx.strokeStyle = enemy.color;
    ctx.fillStyle = "rgba(255, 79, 163, 0.12)";
    ctx.lineWidth = 2;

    ctx.beginPath();

    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i - Math.PI / 2;
      const x = Math.cos(angle) * enemy.radius;
      const y = Math.sin(angle) * enemy.radius;

      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }

    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.fillStyle = "#fff0fa";
    ctx.beginPath();
    ctx.arc(0, 0, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}

function drawParticles() {
  for (const particle of particles) {
    ctx.globalAlpha = Math.max(0, particle.life / particle.maxLife);
    ctx.fillStyle = particle.color;
    ctx.fillRect(particle.x, particle.y, particle.size, particle.size);
  }

  ctx.globalAlpha = 1;
}

function drawPauseTint() {
  if (state !== "paused") return;

  ctx.fillStyle = "rgba(5, 9, 20, 0.25)";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
}

function render() {
  drawBackground();
  drawParticles();
  drawBullets();
  drawEnemies();

  if (state !== "gameover") {
    drawPlayer();
  }

  drawPauseTint();
}

function gameLoop(timestamp) {
  animationId = 0;

  const deltaTime = lastFrameTime
    ? Math.min((timestamp - lastFrameTime) / 1000, 0.033)
    : 0;

  lastFrameTime = timestamp;

  if (state === "running") {
    update(deltaTime);
  } else if (state !== "paused") {
    updateStars(deltaTime);
    updateParticles(deltaTime);
  }

  render();
  animationId = requestAnimationFrame(gameLoop);
}

function setControl(control, pressed) {
  if (pressed) {
    touchControls.add(control);
  } else {
    touchControls.delete(control);
  }
}

document.querySelectorAll("[data-control]").forEach(button => {
  const control = button.dataset.control;

  button.addEventListener("pointerdown", event => {
    event.preventDefault();
    if (state !== "running") return;

    button.setPointerCapture?.(event.pointerId);
    setControl(control, true);
    button.classList.add("is-pressed");
  });

  const release = event => {
    if (event) event.preventDefault();
    setControl(control, false);
    button.classList.remove("is-pressed");
  };

  button.addEventListener("pointerup", release);
  button.addEventListener("pointercancel", release);
  button.addEventListener("lostpointercapture", release);
});

fireButton.addEventListener("pointerdown", event => {
  event.preventDefault();
  if (state !== "running") return;

  fireButton.setPointerCapture?.(event.pointerId);
  setControl("fire", true);
  fireButton.classList.add("is-pressed");
});

function releaseFire(event) {
  if (event) event.preventDefault();
  setControl("fire", false);
  fireButton.classList.remove("is-pressed");
}

fireButton.addEventListener("pointerup", releaseFire);
fireButton.addEventListener("pointercancel", releaseFire);
fireButton.addEventListener("lostpointercapture", releaseFire);

const keyMap = {
  ArrowUp: "up",
  KeyW: "up",
  ArrowDown: "down",
  KeyS: "down",
  ArrowLeft: "left",
  KeyA: "left",
  ArrowRight: "right",
  KeyD: "right",
  Space: "fire",
};

window.addEventListener("keydown", event => {
  const control = keyMap[event.code];

  if (control) {
    event.preventDefault();
    keys.add(control);
  }

  if (event.repeat) return;

  if (event.code === "KeyP" || event.code === "Escape") {
    event.preventDefault();
    togglePause();
    return;
  }

  if (event.code === "Enter") {
    if (state === "ready" || state === "gameover") {
      startGame();
    } else if (state === "paused") {
      resumeGame();
    }
  }
});

window.addEventListener("keyup", event => {
  const control = keyMap[event.code];

  if (control) {
    keys.delete(control);
  }
});

window.addEventListener("blur", () => {
  clearControls();

  if (state === "running") {
    pauseGame();
  }
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden && state === "running") {
    pauseGame();
  }
});

startButton.addEventListener("click", () => {
  if (state === "paused") {
    resumeGame();
  } else {
    startGame();
  }
});

pauseButton.addEventListener("click", () => {
  togglePause();
});

soundButton.addEventListener("click", toggleSound);

makeStars();
updateScore();
updateLives();
render();

setStatus("READY");

showOverlay({
  eyebrow: "SYSTEM READY",
  title: "Ready to <span>Strike?</span>",
  message: "Pilot your ship, destroy incoming enemies, and protect the grid.",
  button: "START GAME",
  hint: "WASD / ARROWS TO MOVE · SPACE TO FIRE",
});

animationId = requestAnimationFrame(gameLoop);
