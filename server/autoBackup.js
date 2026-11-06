import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import { fileURLToPath } from 'url';
import { uploadBackupToGoogleDrive } from '../scripts/googleDriveBackup.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BACKUP_DIR = path.join(__dirname, 'data', 'backups');
const MAX_BACKUP_AGE_DAYS = 30;

/**
 * Creates a complete JSON backup of all MongoDB collections in the active database.
 * Organizes files month-wise and automatically uploads to Google Drive if configured.
 */
export async function runDatabaseBackup() {
  try {
    if (!mongoose.connection || mongoose.connection.readyState !== 1) {
      console.warn('⚠️ Auto-backup skipped: MongoDB connection is not active.');
      return null;
    }

    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-');
    const year = now.getFullYear().toString();
    const month = `${String(now.getMonth() + 1).padStart(2, '0')}-${now.toLocaleString('en-US', { month: 'long' })}`;

    const monthBackupDir = path.join(BACKUP_DIR, year, month);
    if (!fs.existsSync(monthBackupDir)) {
      fs.mkdirSync(monthBackupDir, { recursive: true });
    }

    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();
    const backupData = {};

    for (const col of collections) {
      const docs = await db.collection(col.name).find({}).toArray();
      backupData[col.name] = docs;
    }

    const backupFileName = `tce_appraisal_autobackup_${timestamp}.json`;
    const backupFilePath = path.join(monthBackupDir, backupFileName);

    fs.writeFileSync(backupFilePath, JSON.stringify(backupData, null, 2), 'utf-8');

    console.log(`\n✅ [AUTO-BACKUP SUCCESS] Month-wise backup file created: ${backupFilePath}`);

    // Automatically attempt Google Drive upload
    try {
      await uploadBackupToGoogleDrive(backupFilePath);
    } catch (gdriveErr) {
      console.warn('⚠️ Google Drive background upload error:', gdriveErr.message);
    }

    // Cleanup old backups
    cleanOldBackups();

    return { filePath: backupFilePath, fileName: backupFileName, data: backupData };
  } catch (err) {
    console.error('❌ [AUTO-BACKUP ERROR] Failed to run automated backup:', err.message);
    return null;
  }
}

/**
 * Deletes backup files older than 30 days recursively to save disk space.
 */
function cleanOldBackups(dir = BACKUP_DIR) {
  try {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const now = Date.now();
    const maxAgeMs = MAX_BACKUP_AGE_DAYS * 24 * 60 * 60 * 1000;

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        cleanOldBackups(fullPath);
        // Remove empty directory if empty
        try {
          if (fs.readdirSync(fullPath).length === 0) {
            fs.rmdirSync(fullPath);
          }
        } catch (_) {}
      } else if (entry.isFile() && entry.name.endsWith('.json')) {
        const stats = fs.statSync(fullPath);
        if (now - stats.mtimeMs > maxAgeMs) {
          fs.unlinkSync(fullPath);
          console.log(`🗑️ [AUTO-BACKUP CLEANUP] Removed old backup file: ${entry.name}`);
        }
      }
    }
  } catch (err) {
    console.error('⚠️ Error cleaning old backups:', err.message);
  }
}

/**
 * Schedules daily automated backups at 2:00 AM server time (or every 24 hours).
 */
export function scheduleDailyAutoBackup() {
  // Run an initial backup 10 seconds after server startup
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
