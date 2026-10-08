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

async function exportFullDatabaseBackup() {
  try {
    console.log('🔄 Connecting to MongoDB to create full database backup...');
    await mongoose.connect(mongoUri);
    console.log('✓ Connected to MongoDB successfully.');

    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();

    const backupData = {};
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = path.join(__dirname, '..', 'server', 'data', 'backups');

    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    for (const col of collections) {
      const colName = col.name;
      console.log(`📦 Exporting collection: ${colName}...`);
      const documents = await db.collection(colName).find({}).toArray();
      backupData[colName] = documents;
    }

    const backupFileName = `tce_appraisal_backup_${timestamp}.json`;
    const backupFilePath = path.join(backupDir, backupFileName);

    fs.writeFileSync(backupFilePath, JSON.stringify(backupData, null, 2), 'utf-8');

    console.log('\n==================================================');
    console.log('✅ FULL DATABASE BACKUP COMPLETED SUCCESSFULLY!');
    console.log(`📁 Backup File Saved: ${backupFilePath}`);
    console.log(`📊 Summary of Collections Backed Up:`);
    Object.keys(backupData).forEach((col) => {
      console.log(`   - ${col}: ${backupData[col].length} documents`);
    });
    console.log('==================================================\n');

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error exporting database backup:', error);
    process.exit(1);
  }
}

exportFullDatabaseBackup();
