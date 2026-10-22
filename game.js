const canvas = document.querySelector("#game-canvas");
const ctx = canvas.getContext("2d");

const WIDTH = canvas.width;
const HEIGHT = canvas.height;

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

function render() {
  drawBackground();
  requestAnimationFrame(render);
}

render();
