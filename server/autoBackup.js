import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BACKUP_DIR = path.join(__dirname, 'data', 'backups');
const MAX_BACKUP_AGE_DAYS = 30;

/**
 * Creates a complete JSON backup of all MongoDB collections in the active database.
 */
export async function runDatabaseBackup() {
  try {
    if (!mongoose.connection || mongoose.connection.readyState !== 1) {
      console.warn('⚠️ Auto-backup skipped: MongoDB connection is not active.');
      return null;
    }

    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }

    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();
    const backupData = {};
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    for (const col of collections) {
      const docs = await db.collection(col.name).find({}).toArray();
      backupData[col.name] = docs;
    }

    const backupFileName = `tce_appraisal_autobackup_${timestamp}.json`;
    const backupFilePath = path.join(BACKUP_DIR, backupFileName);

    fs.writeFileSync(backupFilePath, JSON.stringify(backupData, null, 2), 'utf-8');

    console.log(`\n✅ [AUTO-BACKUP SUCCESS] Backup file created at: ${backupFilePath}`);

    // Cleanup old backups (older than 30 days)
    cleanOldBackups();

    return { filePath: backupFilePath, fileName: backupFileName, data: backupData };
  } catch (err) {
    console.error('❌ [AUTO-BACKUP ERROR] Failed to run automated backup:', err.message);
    return null;
  }
}

/**
 * Deletes backup files older than 30 days to save disk space.
 */
function cleanOldBackups() {
  try {
    if (!fs.existsSync(BACKUP_DIR)) return;
    const files = fs.readdirSync(BACKUP_DIR);
    const now = Date.now();
    const maxAgeMs = MAX_BACKUP_AGE_DAYS * 24 * 60 * 60 * 1000;

    files.forEach((file) => {
      if (file.endsWith('.json')) {
        const filePath = path.join(BACKUP_DIR, file);
        const stats = fs.statSync(filePath);
        if (now - stats.mtimeMs > maxAgeMs) {
          fs.unlinkSync(filePath);
          console.log(`🗑️ [AUTO-BACKUP CLEANUP] Removed old backup file: ${file}`);
        }
      }
    });
  } catch (err) {
    console.error('⚠️ Error cleaning old backups:', err.message);
  }
}

/**
 * Schedules daily automated backups at 2:00 AM server time (or every 24 hours).
 */
export function scheduleDailyAutoBackup() {
  // Run an immediate initial backup 10 seconds after server startup
  setTimeout(() => {
    console.log('🔄 Running initial startup auto-backup...');
    runDatabaseBackup();
  }, 10000);

  // Calculate ms until next 2:00 AM
  const now = new Date();
  const nextRun = new Date();
  nextRun.setHours(2, 0, 0, 0);
  if (now.getHours() >= 2) {
    nextRun.setDate(nextRun.getDate() + 1);
  }

  const msUntilNextRun = nextRun.getTime() - now.getTime();
  console.log(`⏰ [AUTO-BACKUP SCHEDULED] Next automated backup in ${(msUntilNextRun / 3600000).toFixed(2)} hours (at 02:00 AM).`);

  setTimeout(() => {
    runDatabaseBackup();
    // After first 2 AM trigger, repeat every 24 hours
    setInterval(() => {
      runDatabaseBackup();
    }, 24 * 60 * 60 * 1000);
  }, msUntilNextRun);
}
