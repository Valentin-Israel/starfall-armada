// Ship roster — free + purchasable with in-game credits.
// stats values are 1-5 for the UI bars only.

export const SHIPS = [
  {
    id: 'viper',
    name: 'VIPER',
    cost: 0,
    skin: 'default',
    color: '#1fd9ff',
    desc: 'Balanced interceptor. Fast, agile, reliable.',
    speed: 560, accel: 9, fireRate: 0.16, weaponLevel: 1,
    lives: 3, bombs: 3, shieldMax: 2.2, shieldCdMax: 7,
    stats: { speed: 3, hp: 2, bombs: 2, fire: 2 },
  },
  {
    id: 'titan',
    name: 'TITAN',
    cost: 1500,
    skin: 'nebula',
    color: '#b06cff',
    desc: 'Heavy cruiser. More lives, stronger starter weapons, tougher shield.',
    speed: 420, accel: 6, fireRate: 0.20, weaponLevel: 2,
    lives: 5, bombs: 4, shieldMax: 3.0, shieldCdMax: 8,
    stats: { speed: 1, hp: 5, bombs: 3, fire: 3 },
  },
  {
    id: 'specter',
    name: 'SPECTER',
    cost: 3500,
    skin: 'void',
    color: '#6c5cff',
    desc: 'Stealth scout. Blistering speed and fast-recharging shield, but fragile.',
    speed: 760, accel: 14, fireRate: 0.11, weaponLevel: 1,
    lives: 2, bombs: 2, shieldMax: 1.8, shieldCdMax: 4.5,
    stats: { speed: 5, hp: 1, bombs: 1, fire: 4 },
  },
  {
    id: 'warlord',
    name: 'WARLORD',
    cost: 7000,
    skin: 'inferno',
    color: '#ff7b3b',
    desc: 'Gunship. Starts with quad cannons and stockpiles extra bombs.',
    speed: 500, accel: 8, fireRate: 0.16, weaponLevel: 3,
    lives: 3, bombs: 5, shieldMax: 2.2, shieldCdMax: 7,
    stats: { speed: 2, hp: 2, bombs: 5, fire: 4 },
  },
  {
    id: 'phantom',
    name: 'PHANTOM',
    cost: 12000,
    skin: 'default',
    color: '#00ffcc',
    desc: 'Prototype. Maximum firepower, near-instant shield recharge, and elite speed.',
    speed: 680, accel: 11, fireRate: 0.10, weaponLevel: 3,
    lives: 4, bombs: 4, shieldMax: 2.5, shieldCdMax: 4,
    stats: { speed: 4, hp: 3, bombs: 4, fire: 5 },
  },
];

export function getShip(id) {
  return SHIPS.find((s) => s.id === id) || SHIPS[0];
}
