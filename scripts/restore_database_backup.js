import dotenv from 'dotenv';
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const mongoUri = process.env.MONGO_URI;

if (!mongoUri) {
  console.error('❌ MONGO_URI is missing in .env file!');
  process.exit(1);
}

const targetFile = process.argv[2];

if (!targetFile) {
  console.log('⚠️ Usage: node scripts/restore_database_backup.js <path-to-json-backup-file>');
  console.log('Example: node scripts/restore_database_backup.js server/data/backups/tce_appraisal_backup_2026-10-08T08-49-11-231Z.json');
  process.exit(0);
}

async function restoreFullDatabaseBackup() {
  try {
    const backupPath = path.resolve(targetFile);
    if (!fs.existsSync(backupPath)) {
      console.error(`❌ Backup file not found at: ${backupPath}`);
      process.exit(1);
    }

    console.log(`🔄 Reading backup file from: ${backupPath}...`);
    const rawData = fs.readFileSync(backupPath, 'utf-8');
    const backupData = JSON.parse(rawData);

    console.log('🔄 Connecting to MongoDB target cluster...');
    await mongoose.connect(mongoUri);
    console.log('✓ Connected to MongoDB successfully.');

    const db = mongoose.connection.db;

    for (const colName of Object.keys(backupData)) {
      const docs = backupData[colName];
      if (docs && docs.length > 0) {
        console.log(`⚡ Restoring collection [${colName}] (${docs.length} documents)...`);
        await db.collection(colName).deleteMany({});
        await db.collection(colName).insertMany(docs);
        console.log(`✓ Collection [${colName}] restored successfully.`);
      }
    }

    console.log('\n==================================================');
    console.log('✅ DATABASE RESTORE COMPLETED SUCCESSFULLY!');
    console.log('==================================================\n');

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error restoring database backup:', error);
    process.exit(1);
  }
}

restoreFullDatabaseBackup();
