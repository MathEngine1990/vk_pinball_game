const saveKey = 'rikoshet-local-v1';
let saveAvailable = true;

function loadLocal() {
  const fresh = {wave: 1, xp: 0, shards: 0, mmr: 1000};
  try {
    const stored = JSON.parse(localStorage.getItem(saveKey));
    if (stored && ['wave', 'xp', 'shards'].every(key =>
      Number.isSafeInteger(stored[key]) && stored[key] >= 0) && stored.wave > 0) {
      return {...fresh, wave: stored.wave, xp: stored.xp, shards: stored.shards};
    }
  } catch {
    saveAvailable = false;
  }
  return fresh;
}

function endLocal(finished) {
  if (!game) return;
  const won = finished && game.winner === 0;
  const reward = finished ? rewards(game, 0) : {xp: 0, shards: 0, wave: 0};
  const wave = game.wave;
  profile.xp += reward.xp;
  profile.shards += reward.shards;
  profile.wave += reward.wave;
  if (finished) {
    try {
      localStorage.setItem(saveKey, JSON.stringify(profile));
      saveAvailable = true;
    } catch {
      saveAvailable = false;
    }
  }
  game = null;
  resetInput();
  controls(false);
  progress(profile);
  showResult({won, reward: finished, earned: reward, wave, saved: saveAvailable});
}

function send(message) {
  if (!game) return;
  if (message.type === 'input') input(game, 0, message.x, message.hit);
  if (message.type === 'leave') endLocal(false);
}

function pauseSession(paused) {
  if (!game) return;
  game.paused = paused;
  resetInput();
  updatePause();
}

function start(type) {
  if (type !== 'solo' || game) return;
  profile = loadLocal();
  game = arena(true, profile.wave);
  target = 500;
  resetInput();
  resetFeedback();
  controls(true);
  $('hint').textContent = 'Защищай оранжевые ворота внизу. Забивай в три бирюзовых.';
  $('mode').textContent = 'ВОЛНА ' + game.wave;
  $('solo').blur();
}

function connect() {
  online = true;
  profile = loadLocal();
  progress(profile);
  controls(false);
  $('account').textContent = 'Одиночная игра';
  $('join').hidden = true;
  $('create').hidden = true;
  $('hint').textContent = 'Защити свои ворота и обыграй трёх ботов.';
  $('save-note').textContent = saveAvailable ?
    'Прогресс хранится на этом устройстве.' :
    'Сохранение недоступно. Прогресс сохранится только до закрытия игры.';

  let previous = performance.now();
  let accumulated = 0;
  function simulate(now) {
    const elapsed = Math.min(0.1, (now - previous) / 1000);
    previous = now;
    if (!game || game.paused || document.hidden) {
      accumulated = 0;
    } else {
      accumulated += elapsed;
      while (accumulated >= 1 / 60 && game) {
        accumulated -= 1 / 60;
        step(game, 1 / 60);
        if (game.winner !== null) endLocal(true);
      }
    }
    requestAnimationFrame(simulate);
  }
  requestAnimationFrame(simulate);
}
