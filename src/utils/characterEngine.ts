/**
 * SpeedrunRPG Character Engine v2.0
 *
 * Changes from v1:
 * - Modifiers now use standard D&D 5e formula: floor((score - 10) / 2)
 *   No more per-stat offsets. What you see on the sheet matches any 5e reference.
 * - HP and display modifiers now use the same formula (no dual-modifier split)
 * - HP floor: minimum 1 HP per level, regardless of CON modifier
 * - Monk ATK stat changed from WIS to DEX
 * - Typos corrected: "Intimidating Presence", "Athletics", "Clumsy"
 *
 * AC Formula:
 *   Barbarian (id=1)  = 10 + STR_mod + DEX_mod
 *   Monk (id=3)       = 10 + DEX_mod + WIS_mod
 *   Sorcerer (id=10)  = 10 + DEX_mod
 *   Medium armor      = baseAC + min(DEX_mod, 2)  [if 11 < baseAC < 17]
 *   Heavy armor       = baseAC                     [if baseAC >= 17]
 *   Other             = baseAC
 *
 * HP Formula:
 *   base = classBaseHP + (10 * CON_mod) + (10 if Sorcerer)
 *   per level above/below 10: ± max(CON_mod, 1)   ← floor of 1 HP/level
 */

import races from './races.json';
import classes from './classes.json';
import abilities from './abilities.json';
import coreStats from './coreStats.json';

// ─── Core Modifier Formula ───────────────────────────────────────────────────

/** Standard D&D 5e ability score modifier. */
export function getModifier(score) {
  return Math.floor((score - 10) / 2);
}

export function formatMod(mod) {
  return mod >= 0 ? `+${mod}` : `${mod}`;
}

// ─── Dice Helpers ────────────────────────────────────────────────────────────

export function rollD100() { return Math.floor(Math.random() * 100) + 1; }
export function rollD12()  { return Math.floor(Math.random() * 12) + 1; }
export function rollD20()  { return Math.floor(Math.random() * 20) + 1; }

// ─── Core Generator ──────────────────────────────────────────────────────────

/**
 * Generate a complete SpeedrunRPG character.
 * @param {number} raceId  - 1–100 (weighted d100 table; duplicates are intentional)
 * @param {number} classId - 1–12
 * @param {number} level   - Character level (original sheet = 10)
 */
export function generateCharacter(raceId, classId, level = 10) {
  const BASE_LEVEL = 10;

  const race = races.find(r => r.id === raceId);
  const cls  = classes.find(c => c.id === classId);
  if (!race || !cls) throw new Error(`Invalid raceId=${raceId} or classId=${classId}`);

  // ── 1. Stats (class base + racial modifier) ──────────────────────────────
  const stats = {
    str: cls.baseStats.str + race.statMods.str,
    dex: cls.baseStats.dex + race.statMods.dex,
    con: cls.baseStats.con + race.statMods.con,
    int: cls.baseStats.int + race.statMods.int,
    wis: cls.baseStats.wis + race.statMods.wis,
    cha: cls.baseStats.cha + race.statMods.cha,
  };

  // ── 2. Standard 5e modifiers ─────────────────────────────────────────────
  const mods = {};
  for (const stat of Object.keys(stats)) {
    mods[stat] = getModifier(stats[stat]);
  }

  // ── 3. HP (with floor of 1 HP per level) ─────────────────────────────────
  const sorcBonus   = classId === 10 ? 10 : 0;
  const hpPerLevel  = Math.max(mods.con, 1);        // minimum 1 HP per level
  const hpAtLevel10 = cls.baseHP + (BASE_LEVEL * hpPerLevel) + sorcBonus;
  const hp          = hpAtLevel10 + ((level - BASE_LEVEL) * hpPerLevel);

  // ── 4. AC ─────────────────────────────────────────────────────────────────
  const normalAC = (() => {
    const base = cls.baseAC;
    if (base <= 10) return base;                        // unarmored / cloth
    if (base < 17)  return base + Math.min(mods.dex, 2); // medium armor
    return base;                                        // heavy armor
  })();

  const barbarianAC = 10 + mods.str + mods.dex;        // Barbarian unarmored defense
  const monkAC      = 10 + mods.dex + mods.wis;        // Monk unarmored defense
  const sorcererAC  = 10 + mods.dex;                   // Mage Armor base

  const finalAC = classId === 1  ? barbarianAC
                : classId === 3  ? monkAC
                : classId === 10 ? sorcererAC
                : normalAC;

  // ── 5. Attack bonus ───────────────────────────────────────────────────────
  const atkStatKey  = cls.atkStat.toLowerCase();
  const atkMod      = mods[atkStatKey];
  const oldAtkBonus = atkMod + cls.profBonus;
  const newAtkBonus = oldAtkBonus + 4;                  // Speedruns flat skill bonus

  // ── 6. Damage expression ─────────────────────────────────────────────────
  const damage          = `${cls.baseDmg}${formatMod(atkMod)}`;
  const attackExpressed = `+${newAtkBonus} to hit, range: ${cls.range}, ${damage} dmg${
    classId === 12 ? ' and target slowed 10 ft until next turn' : ''
  }`;

  // ── 7. Class abilities ────────────────────────────────────────────────────
  const resolvedAbilities = cls.abilityIDs.map(id => {
    const a = abilities.find(ab => ab.id === id);
    return a ?? { id, name: `Ability ${id}`, description: 'Description not found.' };
  });

  // ── 8. Derived values ────────────────────────────────────────────────────
  const speed      = 30 + race.speedMod + cls.speedMod;
  const initiative = cls.initiative;
  const saves      = cls.saves.join(' / ');
  const title      = `Level ${level} ${race.name} ${cls.name}`;

  return {
    title,
    race: {
      id:                       race.id,
      name:                     race.name,
      racialAbilityName:        race.racialAbilityName,
      racialAbilityDescription: race.racialAbilityDescription,
    },
    class: {
      id:         cls.id,
      name:       cls.name,
      armor:      cls.armor,
      baseWeapon: cls.baseWeapon,
      skills:     cls.skills,
      resist:     cls.resist,
    },
    level,
    hp,
    stats,
    mods: Object.fromEntries(
      Object.entries(mods).map(([k, v]) => [k, formatMod(v)])
    ),
    ac: { final: finalAC, normal: normalAC, barbarian: barbarianAC, monk: monkAC, sorcerer: sorcererAC },
    attack: {
      oldBonus:   oldAtkBonus,
      newBonus:   newAtkBonus,
      damage,
      expressed:  attackExpressed,
      numAttacks: cls.numAttacks,
    },
    speed,
    initiative,
    saves,
    abilities: resolvedAbilities,
  };
}

/** Roll a random character (weighted d100 race + d12 class). */
export function generateRandomCharacter(level = 10) {
  return generateCharacter(rollD100(), rollD12(), level);
}

/** Draw a random flaw. Pass imported flaws array. */
export function drawFlaw(flaws) {
  return flaws[Math.floor(Math.random() * flaws.length)];
}

/** Draw a random item from the weighted deck (respects card counts). */
export function drawItem(items) {
  const deck = items.flatMap(item => Array(item.count).fill(item));
  return deck[Math.floor(Math.random() * deck.length)];
}

/** Draw a random card from the Deck of Many Things. */
export function drawDeckOfManyThings(deck) {
  return deck[Math.floor(Math.random() * deck.length)];
}
