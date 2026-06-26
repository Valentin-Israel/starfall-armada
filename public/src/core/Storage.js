// Persistent settings + leaderboard via localStorage (gracefully degrades).

const SETTINGS_KEY = 'starfall.settings.v1';
const SCORES_KEY = 'starfall.scores.v1';

const DEFAULT_SETTINGS = {
  sound: true,
  music: true,
  shake: true,
  quality: true,
};

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage may be unavailable (private mode) — ignore */
  }
}

export const Storage = {
  loadSettings() {
    return { ...DEFAULT_SETTINGS, ...read(SETTINGS_KEY, {}) };
  },
  saveSettings(settings) {
    write(SETTINGS_KEY, settings);
  },
  loadScores() {
    const scores = read(SCORES_KEY, []);
    return Array.isArray(scores) ? scores : [];
  },
  saveScores(list) {
    write(SCORES_KEY, list.slice(0, 10));
  },
  renameEntry(rank, name) {
    const list = this.loadScores();
    if (list[rank]) {
      list[rank].name = (name || 'PILOT').slice(0, 12).toUpperCase();
      this.saveScores(list);
    }
  },
  /** Add a score, keep top 10, return { rank, list } (rank is 0-based, -1 if off-board). */
  addScore(name, score, wave) {
    const list = this.loadScores();
    const entry = { name: (name || 'PILOT').slice(0, 12).toUpperCase(), score: Math.floor(score), wave, t: 0 };
    list.push(entry);
    list.sort((a, b) => b.score - a.score);
    const trimmed = list.slice(0, 10);
    write(SCORES_KEY, trimmed);
    const rank = trimmed.indexOf(entry);
    return { rank, list: trimmed };
  },
  best() {
    const list = this.loadScores();
    return list.length ? list[0].score : 0;
  },
  clearScores() {
    write(SCORES_KEY, []);
  },
};
