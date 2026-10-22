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

let gameStarted = false;
let lastTime = 0;

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

  // سفینه به سمت بالای صفحه قرار دارد.
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

  // نرمال‌سازی حرکت مورب
  const length = Math.hypot(dx, dy);

  if (length > 0) {
    dx /= length;
    dy /= length;
  }

  player.x += dx * player.speed * deltaTime;
  player.y += dy * player.speed * deltaTime;

  // جلوگیری از خروج سفینه از صفحه
  player.x = Math.max(player.radius, Math.min(WIDTH - player.radius, player.x));

  player.y = Math.max(
    player.radius,
    Math.min(HEIGHT - player.radius, player.y),
  );
}

function render(timestamp = 0) {
  // زمان بین دو فریم، بر حسب ثانیه
  const deltaTime = Math.min((timestamp - lastTime) / 1000, 0.05);
  lastTime = timestamp;

  drawBackground();

  if (gameStarted) {
    updatePlayer(deltaTime);
  }

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
