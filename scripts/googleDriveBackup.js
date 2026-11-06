import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbz4Xx1qZKkXiR03Ok8RazqYgVGImQce5WUJlQPWSUuSM7obVZOe2DxEBcdLm-Y7VgZrgA/exec';

/**
 * Uploads a local JSON backup file to the faculty Google Drive folder month-wise via the Google Apps Script Webhook.
 *
 * @param {string} filePath - Absolute or relative path to local backup JSON file
 */
export async function uploadBackupToGoogleDrive(filePath) {
  const webhookUrl = process.env.GDRIVE_WEBHOOK_URL || DEFAULT_WEBHOOK_URL;

  if (!fs.existsSync(filePath)) {
    console.error(`❌ Backup file does not exist: ${filePath}`);
    return { success: false, reason: 'FILE_NOT_FOUND' };
  }

  try {
    const fileName = path.basename(filePath);
    const fileContent = fs.readFileSync(filePath, 'utf-8');

    // Calculate month folder name: e.g. "2026-11 (November)"
    const now = new Date();
    const monthFolderLabel = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')} (${now.toLocaleString('en-US', { month: 'long' })})`;

    console.log(`☁️ [GOOGLE DRIVE] Uploading ${fileName} (${(fileContent.length / 1024 / 1024).toFixed(2)} MB) to folder "${monthFolderLabel}"...`);

    const payload = {
      monthFolder: monthFolderLabel,
      fileName: fileName,
      content: fileContent,
    };

    const res = await axios.post(webhookUrl, JSON.stringify(payload), {
      maxRedirects: 5,
      timeout: 120000, // 2 minutes timeout for large files
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
    });

    if (res.data && res.data.success) {
      console.log('✅ [GOOGLE DRIVE SUCCESS] Backup successfully uploaded to Google Drive!');
      console.log(`📁 File Name: ${fileName}`);
      console.log(`🆔 File ID: ${res.data.fileId}`);
      if (res.data.url) {
        console.log(`🔗 View File in Drive: ${res.data.url}`);
      }
      return {
        success: true,
        fileId: res.data.fileId,
        url: res.data.url,
      };
    } else {
      console.error('❌ [GOOGLE DRIVE ERROR] Upload failed:', res.data?.error || 'Unknown error');
      return { success: false, error: res.data?.error };
    }
  } catch (err) {
    console.error('❌ [GOOGLE DRIVE ERROR] Request failed:', err.response?.data || err.message);
    return { success: false, error: err.message };
  }
}

// If invoked directly from CLI
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const target = process.argv[2] || 'server/data/backups/chandramathi_backup_1792136398826.json';
  uploadBackupToGoogleDrive(target)
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
