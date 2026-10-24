import './ui/styles.css';
import { Game } from './game/game';
import { installTestApi } from './debug/testApi';

const canvas = document.getElementById('view') as HTMLCanvasElement;
const game = new Game(canvas);
installTestApi(game);
game.init().catch((e) => {
  console.error(e);
  const el = document.getElementById('ui');
  if (el) el.textContent = `Rolling Home failed to start: ${e?.message ?? e}`;
});
