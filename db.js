import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, 'data');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const DB_PATH = path.join(dataDir, 'tracker.db');
export const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS entries (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id               TEXT    NOT NULL,
    user_name             TEXT    NOT NULL,
    date                  TEXT    NOT NULL,

    -- General
    weight_kg             REAL,
    bmi                   REAL,
    body_fat_pct          REAL,
    body_water_pct        REAL,
    metabolic_age         INTEGER,
    bmr_kcal              INTEGER,
    physique_rating       INTEGER,

    -- Body composition
    muscle_mass_kg        REAL,
    bone_mass_kg          REAL,
    visceral_fat          REAL,

    -- Left arm
    left_arm_muscle_kg    REAL,
    left_arm_fat_pct      REAL,

    -- Right arm
    right_arm_muscle_kg   REAL,
    right_arm_fat_pct     REAL,

    -- Left leg
    left_leg_muscle_kg    REAL,
    left_leg_fat_pct      REAL,

    -- Right leg
    right_leg_muscle_kg   REAL,
    right_leg_fat_pct     REAL,

    -- Trunk
    trunk_muscle_kg       REAL,
    trunk_fat_pct         REAL,

    created_at            TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// ── Queries ────────────────────────────────────────────────────────────────

const stmtGetAll = db.prepare(`
  SELECT * FROM entries ORDER BY date ASC, created_at ASC
`);

const stmtGetByUser = db.prepare(`
  SELECT * FROM entries WHERE user_name = ? ORDER BY date ASC, created_at ASC
`);

const stmtGetById = db.prepare(`SELECT * FROM entries WHERE id = ?`);

const stmtInsert = db.prepare(`
  INSERT INTO entries (
    user_id, user_name, date,
    weight_kg, bmi, body_fat_pct, body_water_pct, metabolic_age, bmr_kcal, physique_rating,
    muscle_mass_kg, bone_mass_kg, visceral_fat,
    left_arm_muscle_kg, left_arm_fat_pct,
    right_arm_muscle_kg, right_arm_fat_pct,
    left_leg_muscle_kg, left_leg_fat_pct,
    right_leg_muscle_kg, right_leg_fat_pct,
    trunk_muscle_kg, trunk_fat_pct
  ) VALUES (
    @user_id, @user_name, @date,
    @weight_kg, @bmi, @body_fat_pct, @body_water_pct, @metabolic_age, @bmr_kcal, @physique_rating,
    @muscle_mass_kg, @bone_mass_kg, @visceral_fat,
    @left_arm_muscle_kg, @left_arm_fat_pct,
    @right_arm_muscle_kg, @right_arm_fat_pct,
    @left_leg_muscle_kg, @left_leg_fat_pct,
    @right_leg_muscle_kg, @right_leg_fat_pct,
    @trunk_muscle_kg, @trunk_fat_pct
  )
`);

const stmtUpdate = db.prepare(`
  UPDATE entries SET
    date = @date,
    weight_kg = @weight_kg, bmi = @bmi, body_fat_pct = @body_fat_pct,
    body_water_pct = @body_water_pct, metabolic_age = @metabolic_age, bmr_kcal = @bmr_kcal,
    physique_rating = @physique_rating,
    muscle_mass_kg = @muscle_mass_kg, bone_mass_kg = @bone_mass_kg, visceral_fat = @visceral_fat,
    left_arm_muscle_kg = @left_arm_muscle_kg, left_arm_fat_pct = @left_arm_fat_pct,
    right_arm_muscle_kg = @right_arm_muscle_kg, right_arm_fat_pct = @right_arm_fat_pct,
    left_leg_muscle_kg = @left_leg_muscle_kg, left_leg_fat_pct = @left_leg_fat_pct,
    right_leg_muscle_kg = @right_leg_muscle_kg, right_leg_fat_pct = @right_leg_fat_pct,
    trunk_muscle_kg = @trunk_muscle_kg, trunk_fat_pct = @trunk_fat_pct
  WHERE id = @id
`);

const stmtDelete = db.prepare(`DELETE FROM entries WHERE id = ?`);

const stmtDistinctUsers = db.prepare(`
  SELECT DISTINCT user_name FROM entries ORDER BY user_name ASC
`);

export function getAllEntries(userName) {
  if (userName) return stmtGetByUser.all(userName);
  return stmtGetAll.all();
}

export function getEntryById(id) {
  return stmtGetById.get(id);
}

export function createEntry(data) {
  const result = stmtInsert.run(data);
  return stmtGetById.get(result.lastInsertRowid);
}

export function updateEntry(id, data) {
  stmtUpdate.run({ ...data, id });
  return stmtGetById.get(id);
}

export function deleteEntry(id) {
  return stmtDelete.run(id);
}

export function getDistinctUsers() {
  return stmtDistinctUsers.all().map(r => r.user_name);
}

// ── User profiles ──────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS user_profiles (
    user_id       TEXT PRIMARY KEY,
    user_name     TEXT NOT NULL,
    date_of_birth TEXT NOT NULL,
    height_cm     REAL NOT NULL,
    sex           TEXT NOT NULL CHECK(sex IN ('male','female')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

const stmtGetProfile = db.prepare(`
  SELECT * FROM user_profiles WHERE user_id = ?
`);

const stmtUpsertProfile = db.prepare(`
  INSERT INTO user_profiles (user_id, user_name, date_of_birth, height_cm, sex, updated_at)
  VALUES (@user_id, @user_name, @date_of_birth, @height_cm, @sex, datetime('now'))
  ON CONFLICT(user_id) DO UPDATE SET
    user_name     = excluded.user_name,
    date_of_birth = excluded.date_of_birth,
    height_cm     = excluded.height_cm,
    sex           = excluded.sex,
    updated_at    = excluded.updated_at
`);

export function getProfile(userId) {
  return stmtGetProfile.get(userId) ?? null;
}

export function upsertProfile(userId, data) {
  stmtUpsertProfile.run({
    user_id: userId,
    user_name: data.user_name,
    date_of_birth: data.date_of_birth,
    height_cm: Number(data.height_cm),
    sex: data.sex,
  });
  return stmtGetProfile.get(userId);
}
