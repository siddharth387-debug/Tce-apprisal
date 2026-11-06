import dotenv from 'dotenv';
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { uploadBackupToGoogleDrive } from './googleDriveBackup.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const mongoUri = process.env.MONGO_URI;

if (!mongoUri) {
  console.error('❌ MONGO_URI is missing in .env file!');
  process.exit(1);
}

export async function exportFullDatabaseBackup(customBackupDir = null) {
  try {
    console.log('🔄 Connecting to MongoDB to create full database backup...');
    await mongoose.connect(mongoUri);
    console.log('✓ Connected to MongoDB successfully.');

    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();

    const backupData = {};
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-');
    const year = now.getFullYear().toString();
    const month = `${String(now.getMonth() + 1).padStart(2, '0')}-${now.toLocaleString('en-US', { month: 'long' })}`;

    const baseBackupDir = customBackupDir || path.join(__dirname, '..', 'server', 'data', 'backups');
    const monthBackupDir = path.join(baseBackupDir, year, month);

    if (!fs.existsSync(monthBackupDir)) {
      fs.mkdirSync(monthBackupDir, { recursive: true });
    }

    for (const col of collections) {
      const colName = col.name;
      console.log(`📦 Exporting collection: ${colName}...`);
      const documents = await db.collection(colName).find({}).toArray();
      backupData[colName] = documents;
    }

    const backupFileName = `tce_appraisal_backup_${timestamp}.json`;
    const backupFilePath = path.join(monthBackupDir, backupFileName);

    fs.writeFileSync(backupFilePath, JSON.stringify(backupData, null, 2), 'utf-8');

    console.log('\n==================================================');
    console.log('✅ FULL DATABASE BACKUP COMPLETED SUCCESSFULLY!');
    console.log(`📁 Backup File Saved (Month-wise): ${backupFilePath}`);
    console.log(`📊 Summary of Collections Backed Up:`);
    Object.keys(backupData).forEach((col) => {
      console.log(`   - ${col}: ${backupData[col].length} documents`);
    });
    console.log('==================================================\n');

    // Attempt Google Drive upload (if configured)
    await uploadBackupToGoogleDrive(backupFilePath);

    await mongoose.disconnect();
    return backupFilePath;
  } catch (error) {
    console.error('❌ Error exporting database backup:', error);
    try {
      await mongoose.disconnect();
    } catch (_) {}
    throw error;
  }
}

// If invoked directly from CLI
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  exportFullDatabaseBackup()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
