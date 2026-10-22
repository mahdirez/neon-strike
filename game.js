"use strict";

const canvas = document.getElementById("game-canvas");
const ctx = canvas.getContext("2d");

const $ = selector => document.querySelector(selector);

const scoreValue = $("#score-value");
const bestValue = $("#best-value");
const livesValue = $("#lives-value");
const threatValue = $("#threat-value");
const waveValue = $("#wave-value");
const powerupValue = $("#powerup-value");
const waveProgressFill = $("#wave-progress-fill");

const bossPanel = $("#boss-panel");
const bossName = $("#boss-name");
const bossHealthText = $("#boss-health-text");
const bossHealthFill = $("#boss-health-fill");

const overlay = $("#game-overlay");
const overlayEyebrow = $("#overlay-eyebrow");
const overlayTitle = $("#overlay-title");
const overlayMessage = $("#overlay-message");
const startButton = $("#start-button");

const soundButton = $("#sound-button");
const pauseButton = $("#pause-button");
const statusLabel = $("#status-label");
const statusChip = $(".status-chip");
const fireButton = $("#fire-button");

const WIDTH = canvas.width;
const HEIGHT = canvas.height;

const PLAYER_SPEED = 280;
const PLAYER_SIZE = 15;
const NORMAL_FIRE_INTERVAL = 0.22;
const RAPID_FIRE_INTERVAL = 0.085;
const PLAYER_INVULNERABILITY = 1.2;

const INITIAL_SPAWN_INTERVAL = 1.05;
const MIN_SPAWN_INTERVAL = 0.28;
const INITIAL_ENEMY_SPEED = 95;
const MAX_ENEMY_SPEED = 220;

const WAVE_DURATION = 20;
const BOSS_EVERY_WAVES = 3;
const POWERUP_DURATION = 8;
const MAX_PARTICLES = 650;
const BEST_SCORE_KEY = "neon-strike-best-score";

const keys = new Set();
const touchControls = new Set();

let state = "ready";
let score = 0;
let bestScore = loadBestScore();
let lives = 3;
let threatLevel = 1;
let wave = 1;

let elapsedTime = 0;
let waveTime = 0;
let spawnTimer = 0;
let powerupSpawnTimer = 7;
let fireTimer = 0;
let damageCooldown = 0;
let lastFrameTime = 0;
let animationId = 0;
let boss = null;
let bossDefeatedCount = 0;

let soundEnabled = true;
let audioContext = null;

let bullets = [];
let enemyBullets = [];
let enemies = [];
let particles = [];
let powerups = [];
let stars = [];

const effects = {
  rapidFire: 0,
  shield: 0,
};

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
    // Storage is optional.
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

  threatLevel = Math.floor(score / 100) + 1;
  threatValue.textContent = String(threatLevel).padStart(2, "0");
}

function updateLives() {
  livesValue.textContent = "♥ ".repeat(Math.max(0, lives)).trim() || "—";
}

function updatePowerupUI() {
  const active = [];

  if (effects.rapidFire > 0) {
    active.push(`RAPID ${Math.ceil(effects.rapidFire)}s`);
  }

  if (effects.shield > 0) {
    active.push(`SHIELD ${Math.ceil(effects.shield)}s`);
  }

  powerupValue.textContent = active.join(" · ") || "NONE";
}

function updateWaveUI() {
  waveValue.textContent = String(wave).padStart(2, "0");
  waveProgressFill.style.width = `${Math.min(100, (waveTime / WAVE_DURATION) * 100)}%`;
}

function updateBossUI() {
  if (!boss) {
    bossPanel.hidden = true;
    return;
  }

  bossPanel.hidden = false;
  bossName.textContent = boss.name;

  const ratio = Math.max(0, boss.hp / boss.maxHp);
  bossHealthFill.style.width = `${ratio * 100}%`;
  bossHealthText.textContent = `${Math.ceil(ratio * 100)}%`;
}

function getSpawnInterval() {
  const waveAdjustment = Math.min(0.25, (wave - 1) * 0.035);
  const scoreAdjustment = (threatLevel - 1) * 0.055;

  return Math.max(
    MIN_SPAWN_INTERVAL,
    INITIAL_SPAWN_INTERVAL - scoreAdjustment - waveAdjustment,
  );
}

function getEnemySpeed() {
  return Math.min(
    MAX_ENEMY_SPEED,
    INITIAL_ENEMY_SPEED + (threatLevel - 1) * 8 + (wave - 1) * 5,
  );
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
  startButton.textContent = button || "";
  startButton.hidden = !button;
  $(".overlay-hint").textContent = hint;
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

  document
    .querySelectorAll(".control-button, .fire-button")
    .forEach(button => button.classList.remove("is-pressed"));
}

function resetGame() {
  score = 0;
  lives = 3;
  threatLevel = 1;
  wave = 1;

  elapsedTime = 0;
  waveTime = 0;
  spawnTimer = 0.45;
  powerupSpawnTimer = 7;
  fireTimer = 0;
  damageCooldown = 0;
  boss = null;
  bossDefeatedCount = 0;

  effects.rapidFire = 0;
  effects.shield = 0;

  bullets = [];
  enemyBullets = [];
  enemies = [];
  particles = [];
  powerups = [];

  resetPlayer();
  clearControls();

  updateScore();
  updateLives();
  updatePowerupUI();
  updateWaveUI();
  updateBossUI();
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
  if (state === "gameover") return;

  state = "gameover";
  clearControls();
  setStatus("GAME OVER", "over");
  pauseButton.disabled = true;
  pauseButton.textContent = "PAUSE";

  showOverlay({
    eyebrow: "MISSION FAILED",
    title: "Grid <span>Compromised.</span>",
    message: `Score: ${score}. Best: ${bestScore}. Wave: ${wave}. Bosses defeated: ${bossDefeatedCount}.`,
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
    // Audio is optional.
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
    x: player.x + (effects.rapidFire > 0 ? (Math.random() - 0.5) * 4 : 0),
    y: player.y - player.radius - 7,
    radius: 3,
    speed: 480,
    damage: 1,
  });

  playTone(720, 0.07, "square", 0.018);
}

function spawnEnemy() {
  const roll = Math.random();
  let type = "normal";

  if (wave >= 2 && roll > 0.82) {
    type = "tank";
  } else if (wave >= 2 && roll > 0.57) {
    type = "fast";
  }

  let radius;
  let speed;
  let hp;
  let color;
  let points;

  if (type === "fast") {
    radius = 10;
    speed = getEnemySpeed() * 1.65;
    hp = 1;
    color = "#ffd166";
    points = 15;
  } else if (type === "tank") {
    radius = 23;
    speed = getEnemySpeed() * 0.62;
    hp = 3;
    color = "#ff4fa3";
    points = 30;
  } else {
    radius = 15;
    speed = getEnemySpeed() * (0.8 + Math.random() * 0.4);
    hp = 1;
    color = "#a78bfa";
    points = 10;
  }

  enemies.push({
    type,
    x: radius + Math.random() * (WIDTH - radius * 2),
    y: -radius - 5,
    radius,
    speed,
    drift: (Math.random() - 0.5) * (type === "fast" ? 75 : 36),
    phase: Math.random() * Math.PI * 2,
    color,
    hp,
    maxHp: hp,
    points,
  });
}

function spawnPowerup(
  x = Math.random() * (WIDTH - 50) + 25,
  y = -20,
  forcedType = null,
) {
  const types = ["rapid", "shield", "repair"];
  const type = forcedType || types[Math.floor(Math.random() * types.length)];

  powerups.push({
    type,
    x,
    y,
    radius: 12,
    speed: 75,
    phase: Math.random() * Math.PI * 2,
  });
}

function createExplosion(x, y, color, amount = 18) {
  const count = Math.min(amount, MAX_PARTICLES - particles.length);

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

  if (effects.shield > 0) {
    createExplosion(player.x, player.y, "#48f2ff", 8);
    playTone(480, 0.07, "sine", 0.025);
    return;
  }

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

function activatePowerup(type) {
  if (type === "rapid") {
    effects.rapidFire = Math.max(effects.rapidFire, POWERUP_DURATION);
    playTone(850, 0.16, "triangle", 0.04);
  } else if (type === "shield") {
    effects.shield = Math.max(effects.shield, POWERUP_DURATION);
    playTone(620, 0.2, "sine", 0.04);
  } else if (type === "repair") {
    if (lives < 3) {
      lives += 1;
      updateLives();
      playTone(740, 0.2, "sine", 0.04);
    } else {
      score += 20;
      updateScore();
      playTone(500, 0.1, "triangle", 0.03);
    }
  }

  updatePowerupUI();
}

function startBossFight() {
  if (boss || state !== "running") return;

  enemies = [];
  enemyBullets = [];
  spawnTimer = 1.5;

  const bossNumber = Math.floor(wave / BOSS_EVERY_WAVES);
  const maxHp = 30 + bossNumber * 12;

  boss = {
    name: bossNumber % 2 === 0 ? "NEON DESTROYER" : "VOID TITAN",
    x: WIDTH / 2,
    y: -90,
    targetY: 105,
    radius: 48 + Math.min(12, bossNumber * 2),
    hp: maxHp,
    maxHp,
    speed: 90 + Math.min(45, bossNumber * 5),
    direction: 1,
    attackTimer: 1.2,
    pattern: 0,
    entering: true,
    flash: 0,
    phase: Math.random() * Math.PI * 2,
  };

  updateBossUI();
  setStatus("BOSS FIGHT");

  playTone(100, 0.65, "sawtooth", 0.05);
  createExplosion(WIDTH / 2, 75, "#ff4fa3", 28);
}

function defeatBoss() {
  if (!boss) return;

  const defeatedBoss = boss;
  createExplosion(defeatedBoss.x, defeatedBoss.y, "#ff4fa3", 90);

  score += 250 + wave * 25;
  bossDefeatedCount += 1;

  boss = null;
  enemyBullets = [];
  updateBossUI();
  updateScore();

  // Guaranteed reward after a boss encounter.
  spawnPowerup(WIDTH / 2, 80, Math.random() > 0.5 ? "shield" : "repair");

  setStatus("BOSS DEFEATED");
  playTone(440, 0.18, "triangle", 0.05);
  window.setTimeout(() => {
    if (state === "running" && !boss) setStatus("IN COMBAT");
  }, 1400);
}

function fireBossPattern() {
  if (!boss) return;

  const originY = boss.y + boss.radius * 0.65;

  if (boss.pattern % 2 === 0) {
    // Aimed three-shot spread.
    const baseAngle = Math.atan2(player.y - originY, player.x - boss.x);

    for (const offset of [-0.18, 0, 0.18]) {
      const angle = baseAngle + offset;
      const speed = 190 + Math.min(60, wave * 4);

      enemyBullets.push({
        x: boss.x,
        y: originY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: 6,
        color: "#ff4fa3",
      });
    }
  } else {
    // A fan of projectiles spread across the arena.
    const count = 7;
    const spread = 1.05;
    const startAngle = Math.PI / 2 - spread / 2;
    const speed = 170 + Math.min(55, wave * 3);

    for (let i = 0; i < count; i++) {
      const angle = startAngle + (spread * i) / (count - 1);

      enemyBullets.push({
        x: boss.x,
        y: originY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: 5,
        color: "#a78bfa",
      });
    }
  }

  boss.pattern += 1;
  playTone(170, 0.06, "square", 0.012);
}

function updatePlayer(deltaTime) {
  let dx = 0;
  let dy = 0;

  if (isControlPressed("left")) dx -= 1;
  if (isControlPressed("right")) dx += 1;
  if (isControlPressed("up")) dy -= 1;
  if (isControlPressed("down")) dy += 1;

  if (dx !== 0 && dy !== 0) {
    const magnitude = Math.hypot(dx, dy);
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
  effects.rapidFire = Math.max(0, effects.rapidFire - deltaTime);
  effects.shield = Math.max(0, effects.shield - deltaTime);

  updatePowerupUI();

  fireTimer -= deltaTime;

  if (isControlPressed("fire") && fireTimer <= 0) {
    fireBullet();
    fireTimer =
      effects.rapidFire > 0 ? RAPID_FIRE_INTERVAL : NORMAL_FIRE_INTERVAL;
  }
}

function updateBullets(deltaTime) {
  for (let i = bullets.length - 1; i >= 0; i--) {
    bullets[i].y -= bullets[i].speed * deltaTime;

    if (bullets[i].y + bullets[i].radius < 0) {
      bullets.splice(i, 1);
    }
  }

  for (let i = enemyBullets.length - 1; i >= 0; i--) {
    const bullet = enemyBullets[i];

    bullet.x += bullet.vx * deltaTime;
    bullet.y += bullet.vy * deltaTime;

    if (
      bullet.y - bullet.radius > HEIGHT ||
      bullet.x + bullet.radius < 0 ||
      bullet.x - bullet.radius > WIDTH
    ) {
      enemyBullets.splice(i, 1);
    }
  }
}

function updateEnemies(deltaTime) {
  // Regular enemy waves are suspended while a boss is active.
  if (boss) return;

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

function updateBoss(deltaTime) {
  if (!boss) return;

  boss.flash = Math.max(0, boss.flash - deltaTime);

  if (boss.entering) {
    boss.y += 90 * deltaTime;

    if (boss.y >= boss.targetY) {
      boss.y = boss.targetY;
      boss.entering = false;
    }
  } else {
    boss.x += boss.direction * boss.speed * deltaTime;

    if (boss.x >= WIDTH - boss.radius - 8) {
      boss.x = WIDTH - boss.radius - 8;
      boss.direction = -1;
    } else if (boss.x <= boss.radius + 8) {
      boss.x = boss.radius + 8;
      boss.direction = 1;
    }

    boss.y = boss.targetY + Math.sin(elapsedTime * 1.8 + boss.phase) * 12;

    boss.attackTimer -= deltaTime;

    if (boss.attackTimer <= 0) {
      fireBossPattern();
      boss.attackTimer = Math.max(0.58, 1.35 - wave * 0.035);
    }
  }

  // Contact with the boss also damages the player.
  if (
    player.invulnerable <= 0 &&
    circlesOverlap(player, {
      x: boss.x,
      y: boss.y,
      radius: boss.radius * 0.78,
    })
  ) {
    damagePlayer();
  }

  updateBossUI();
}

function updatePowerups(deltaTime) {
  for (let i = powerups.length - 1; i >= 0; i--) {
    const powerup = powerups[i];

    powerup.y += powerup.speed * deltaTime;
    powerup.x += Math.sin(elapsedTime * 2 + powerup.phase) * 25 * deltaTime;

    if (powerup.y - powerup.radius > HEIGHT) {
      powerups.splice(i, 1);
      continue;
    }

    if (circlesOverlap(player, powerup)) {
      powerups.splice(i, 1);
      activatePowerup(powerup.type);
      createExplosion(powerup.x, powerup.y, getPowerupColor(powerup.type), 14);
    }
  }

  if (boss) return;

  powerupSpawnTimer -= deltaTime;

  if (powerupSpawnTimer <= 0) {
    if (powerups.length < 3) spawnPowerup();
    powerupSpawnTimer = 10 + Math.random() * 5;
  }
}

function updateWave(deltaTime) {
  if (boss) {
    updateWaveUI();
    return;
  }

  waveTime += deltaTime;

  if (waveTime >= WAVE_DURATION) {
    waveTime -= WAVE_DURATION;
    wave += 1;

    createExplosion(WIDTH / 2, 42, "#48f2ff", 24);
    playTone(580, 0.18, "triangle", 0.04);

    if (wave % BOSS_EVERY_WAVES === 0) {
      startBossFight();
    }
  }

  updateWaveUI();
}

function updateParticles(deltaTime) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const particle = particles[i];

    particle.x += particle.vx * deltaTime;
    particle.y += particle.vy * deltaTime;
    particle.vx *= Math.pow(0.06, deltaTime);
    particle.vy *= Math.pow(0.06, deltaTime);
    particle.life -= deltaTime;

    if (particle.life <= 0) particles.splice(i, 1);
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

    for (
      let bulletIndex = bullets.length - 1;
      bulletIndex >= 0;
      bulletIndex--
    ) {
      const bullet = bullets[bulletIndex];

      if (!circlesOverlap(enemy, bullet)) continue;

      bullets.splice(bulletIndex, 1);
      enemy.hp -= bullet.damage;

      if (enemy.hp <= 0) {
        enemies.splice(enemyIndex, 1);
        createExplosion(
          enemy.x,
          enemy.y,
          enemy.color,
          enemy.type === "tank" ? 30 : 18,
        );
        score += enemy.points;
        updateScore();
        playTone(300, 0.1, "triangle", 0.025);

        if (Math.random() < 0.12 && powerups.length < 3) {
          spawnPowerup(enemy.x, enemy.y);
        }
      } else {
        createExplosion(enemy.x, enemy.y, enemy.color, 5);
      }

      break;
    }
  }

  if (boss) {
    for (let i = bullets.length - 1; i >= 0; i--) {
      const bullet = bullets[i];

      if (
        !circlesOverlap(bullet, {
          x: boss.x,
          y: boss.y,
          radius: boss.radius * 0.82,
        })
      ) {
        continue;
      }

      bullets.splice(i, 1);
      boss.hp -= bullet.damage;
      boss.flash = 0.08;

      createExplosion(bullet.x, bullet.y, "#ff8ac5", 3);

      if (boss.hp <= 0) {
        defeatBoss();
        break;
      }
    }
  }

  for (let i = enemyBullets.length - 1; i >= 0; i--) {
    const bullet = enemyBullets[i];

    if (player.invulnerable <= 0 && circlesOverlap(player, bullet)) {
      enemyBullets.splice(i, 1);
      damagePlayer();

      if (state !== "running") return;
    }
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

  updateBoss(deltaTime);

  if (state !== "running") return;

  updatePowerups(deltaTime);
  updateWave(deltaTime);
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

  if (effects.shield > 0) {
    ctx.strokeStyle = "rgba(72, 242, 255, 0.8)";
    ctx.lineWidth = 2;
    ctx.shadowBlur = 18;
    ctx.shadowColor = "#48f2ff";
    ctx.beginPath();
    ctx.arc(
      0,
      0,
      PLAYER_SIZE + 10 + Math.sin(elapsedTime * 7) * 2,
      0,
      Math.PI * 2,
    );
    ctx.stroke();
  }

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
    ctx.shadowColor = effects.rapidFire > 0 ? "#ffd166" : "#48f2ff";
    ctx.fillStyle = effects.rapidFire > 0 ? "#fff0b5" : "#d9fcff";
    ctx.fillRect(bullet.x - 2, bullet.y - 8, 4, 13);
    ctx.restore();
  }

  for (const bullet of enemyBullets) {
    ctx.save();
    ctx.shadowBlur = 14;
    ctx.shadowColor = bullet.color;
    ctx.fillStyle = bullet.color;
    ctx.beginPath();
    ctx.arc(bullet.x, bullet.y, bullet.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawEnemies() {
  for (const enemy of enemies) {
    ctx.save();
    ctx.translate(enemy.x, enemy.y);
    ctx.rotate(elapsedTime * (enemy.type === "fast" ? 1.8 : 0.7));

    ctx.shadowBlur = 17;
    ctx.shadowColor = enemy.color;
    ctx.strokeStyle = enemy.color;
    ctx.fillStyle = `${enemy.color}20`;
    ctx.lineWidth = enemy.type === "tank" ? 3 : 2;

    if (enemy.type === "fast") {
      ctx.beginPath();
      ctx.moveTo(0, -enemy.radius - 3);
      ctx.lineTo(enemy.radius, enemy.radius);
      ctx.lineTo(0, enemy.radius * 0.5);
      ctx.lineTo(-enemy.radius, enemy.radius);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else {
      const sides = enemy.type === "tank" ? 8 : 6;

      ctx.beginPath();

      for (let i = 0; i < sides; i++) {
        const angle = (Math.PI * 2 * i) / sides - Math.PI / 2;
        const x = Math.cos(angle) * enemy.radius;
        const y = Math.sin(angle) * enemy.radius;

        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }

      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    ctx.restore();

    if (enemy.type === "tank" && enemy.hp < enemy.maxHp) {
      const barWidth = enemy.radius * 2;
      const barY = enemy.y - enemy.radius - 9;

      ctx.fillStyle = "rgba(255,255,255,0.15)";
      ctx.fillRect(enemy.x - barWidth / 2, barY, barWidth, 3);

      ctx.fillStyle = enemy.color;
      ctx.fillRect(
        enemy.x - barWidth / 2,
        barY,
        barWidth * (enemy.hp / enemy.maxHp),
        3,
      );
    }
  }
}

function drawBoss() {
  if (!boss) return;

  ctx.save();
  ctx.translate(boss.x, boss.y);

  const pulse = 1 + Math.sin(elapsedTime * 5) * 0.035;
  ctx.scale(pulse, pulse);

  ctx.shadowBlur = 35;
  ctx.shadowColor = boss.flash > 0 ? "#ffffff" : "#ff4fa3";
  ctx.fillStyle = boss.flash > 0 ? "#ffffff" : "#35122e";
  ctx.strokeStyle = boss.flash > 0 ? "#ffffff" : "#ff4fa3";
  ctx.lineWidth = 4;

  // Main armored body.
  ctx.beginPath();
  ctx.moveTo(0, -boss.radius);
  ctx.lineTo(boss.radius * 0.8, -boss.radius * 0.55);
  ctx.lineTo(boss.radius, boss.radius * 0.15);
  ctx.lineTo(boss.radius * 0.65, boss.radius * 0.75);
  ctx.lineTo(0, boss.radius);
  ctx.lineTo(-boss.radius * 0.65, boss.radius * 0.75);
  ctx.lineTo(-boss.radius, boss.radius * 0.15);
  ctx.lineTo(-boss.radius * 0.8, -boss.radius * 0.55);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.shadowBlur = 20;
  ctx.fillStyle = "#ff4fa3";
  ctx.beginPath();
  ctx.moveTo(0, -boss.radius * 0.52);
  ctx.lineTo(boss.radius * 0.42, 0);
  ctx.lineTo(0, boss.radius * 0.4);
  ctx.lineTo(-boss.radius * 0.42, 0);
  ctx.closePath();
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(0, 0, 6, 0, Math.PI * 2);
  ctx.fill();

  // Side cannons.
  ctx.fillStyle = "#a78bfa";
  ctx.fillRect(-boss.radius - 5, -8, 12, 24);
  ctx.fillRect(boss.radius - 7, -8, 12, 24);

  ctx.restore();
}

function getPowerupColor(type) {
  if (type === "rapid") return "#ffd166";
  if (type === "shield") return "#48f2ff";
  return "#7dffbb";
}

function getPowerupSymbol(type) {
  if (type === "rapid") return "R";
  if (type === "shield") return "S";
  return "+";
}

function drawPowerups() {
  for (const powerup of powerups) {
    const color = getPowerupColor(powerup.type);

    ctx.save();
    ctx.translate(powerup.x, powerup.y);
    ctx.rotate(Math.sin(elapsedTime * 2 + powerup.phase) * 0.15);
    ctx.shadowBlur = 20;
    ctx.shadowColor = color;
    ctx.strokeStyle = color;
    ctx.fillStyle = `${color}25`;
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.arc(
      0,
      0,
      powerup.radius + Math.sin(elapsedTime * 5) * 1.5,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.fillStyle = color;
    ctx.font = "bold 14px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(getPowerupSymbol(powerup.type), 0, 1);

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

function drawWaveBanner() {
  if (waveTime < 0.15) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, (0.15 - waveTime) * 6);
    ctx.fillStyle = "#48f2ff";
    ctx.font = "bold 24px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`WAVE ${String(wave).padStart(2, "0")}`, WIDTH / 2, 52);
    ctx.restore();
  }
}

function drawPauseTint() {
  if (state !== "paused") return;

  ctx.fillStyle = "rgba(5, 9, 20, 0.25)";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
}

function render() {
  drawBackground();
  drawParticles();
  drawPowerups();
  drawBullets();
  drawEnemies();
  drawBoss();

  if (state !== "gameover") {
    drawPlayer();
  }

  if (state === "running" && !boss) {
    drawWaveBanner();
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
  if (pressed) touchControls.add(control);
  else touchControls.delete(control);
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
  if (control) keys.delete(control);
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

pauseButton.addEventListener("click", togglePause);
soundButton.addEventListener("click", toggleSound);

makeStars();
updateScore();
updateLives();
updatePowerupUI();
updateWaveUI();
updateBossUI();
setStatus("READY");

showOverlay({
  eyebrow: "SYSTEM READY",
  title: "Ready to <span>Strike?</span>",
  message: "Destroy enemies, survive the waves, and defeat the Void Titan.",
  button: "START GAME",
  hint: "WASD / ARROWS TO MOVE · SPACE TO FIRE",
});

animationId = requestAnimationFrame(gameLoop);
