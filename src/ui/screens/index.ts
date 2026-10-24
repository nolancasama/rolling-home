import type { Result } from '../../sim/core';
import type { Game } from '../../game/game';
import type { Action } from '../../game/interactions';
import { h } from '../dom';
import { cargoScreen, dockScreen, jobBoardScreen, remoteWorkScreen } from './jobs';
import {
  actionMenu, campSetupScreen, confirmScreen, cookScreen, dialogScreen, diyScreen, eatScreen, inspectScreen, pretripScreen,
  rangerScreen, sleepScreen, sleepSummaryScreen, storageScreen, timed,
} from './living';
import { loadScreen, mainMenu, newGameScreen, pauseScreen, settingsScreen } from './menus';
import { phoneScreen } from './phone';
import {
  campgroundScreen, dumpScreen, fuelScreen, hookupsScreen, lockerScreen, paidShowerScreen, procedureScreen, propaneScreen,
  serviceScreen, waterScreen,
} from './services';
import { shopScreen } from './shop';
import { furnishPanel } from './furnishPanel';

/** One place to open any screen. */
export class ScreenHub {
  constructor(private g: Game) {}

  mainMenu() { mainMenu(this.g); }
  newGame() { newGameScreen(this.g); }
  settings() { settingsScreen(this.g); }
  saveMenu() { loadScreen(this.g, true); }
  pause() { pauseScreen(this.g); }

  escape() {
    const g = this.g;
    const top = g.ui.top;
    if (top && top.escClose !== false) {
      g.ui.close();
      return;
    }
    if (g.mode === 'furnish') {
      if (g.furnish.moving) g.furnish.cancelMove();
      else g.furnish.done();
      return;
    }
    if (g.mode !== 'menu' && !top) this.pause();
  }

  togglePhone() {
    if (this.g.ui.isOpen('phone')) this.g.ui.closeId('phone');
    else if (!this.g.ui.blocking || this.g.mode === 'drive') this.openPhone();
  }

  openPhone(app?: 'home' | 'map' | 'jobs' | 'finance' | 'rv' | 'inventory' | 'journal') {
    this.g.ui.open(phoneScreen(this.g, app));
  }

  actionMenu(title: string, actions: Action[]) { actionMenu(this.g, title, actions); }
  shop(id: string) { shopScreen(this.g, id); }
  jobBoard(id: string) { jobBoardScreen(this.g, id); }
  dock(anchorId: string) { dockScreen(this.g, anchorId); }
  cargo(jobId: string) { cargoScreen(this.g, jobId); }
  fuel(anchorId: string) { fuelScreen(this.g, anchorId); }
  water(anchorId: string) { waterScreen(this.g, anchorId); }
  dump(anchorId: string) { dumpScreen(this.g, anchorId); }
  propane(anchorId: string) { propaneScreen(this.g, anchorId); }
  service(id: string) { serviceScreen(this.g, id); }
  campground(id: string) { campgroundScreen(this.g, id); }
  hookups() { hookupsScreen(this.g); }
  locker() { lockerScreen(this.g); }
  paidShower(anchorId: string) { paidShowerScreen(this.g, anchorId); }
  procedure(id: string, done: () => void) { procedureScreen(this.g, id, done); }
  dialog(npc: string) { dialogScreen(this.g, npc); }
  ranger() { rangerScreen(this.g); }
  inspect() { inspectScreen(this.g); }
  campSetup() { campSetupScreen(this.g); }
  diy() { diyScreen(this.g); }
  eat() { eatScreen(this.g); }
  cook() { cookScreen(this.g); }
  sleep(nap: boolean) { sleepScreen(this.g, nap); }
  storage(comp: string) { storageScreen(this.g, comp); }
  remoteWork(atTable: boolean) { remoteWorkScreen(this.g, atTable); }
  pretrip(go: () => void, back: () => void) { pretripScreen(this.g, go, back); }
  furnishPanel() { furnishPanel(this.g); }
  confirm(title: string, text: string, ok: () => void, label?: string) { confirmScreen(this.g, title, text, ok, label); }
  timed(fn: () => Result<{ minutes: number }>, caption: string) { timed(this.g, fn, caption); }

  doSleep(nap: boolean) {
    const g = this.g;
    const card = h('div', { class: 'fade-card' }, h('div', { class: 'big' }, nap ? 'A short nap...' : 'Goodnight'), h('div', { class: 'small' }, 'Zzz'));
    void g.ui.fade(async () => {
      await new Promise((r) => setTimeout(r, 900));
      const sum = g.sim!.sleep(nap);
      g.audio.chime();
      sleepSummaryScreen(g, sum, nap);
      g.save('auto');
    }, 600, card);
  }
}
