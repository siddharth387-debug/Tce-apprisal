import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleAuth } from 'google-auth-library';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_FOLDER_ID = '1rZ5YqoN5bqcBryd5B8SXOglMNJlMbU1g';

/**
 * Returns GoogleAuth client or null if no credentials configured.
 */
function getGoogleAuthClient() {
  try {
    let credentials = null;

    // 1. Check for raw JSON string in environment variable
    if (process.env.GDRIVE_SERVICE_ACCOUNT_KEY) {
      try {
        credentials = JSON.parse(process.env.GDRIVE_SERVICE_ACCOUNT_KEY);
      } catch (err) {
        console.warn('⚠️ GDRIVE_SERVICE_ACCOUNT_KEY is present but could not be parsed as JSON:', err.message);
      }
    }

    // 2. Check for file path in environment variable
    if (!credentials && process.env.GDRIVE_KEY_FILE && fs.existsSync(process.env.GDRIVE_KEY_FILE)) {
      credentials = JSON.parse(fs.readFileSync(process.env.GDRIVE_KEY_FILE, 'utf-8'));
    }

    // 3. Check for standard local key file in root directory
    const defaultKeyPath = path.join(__dirname, '..', 'google-service-account.json');
    if (!credentials && fs.existsSync(defaultKeyPath)) {
      credentials = JSON.parse(fs.readFileSync(defaultKeyPath, 'utf-8'));
    }

    if (!credentials) {
      return null;
    }

    const auth = new GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/drive'],
    });

    return auth;
  } catch (err) {
    console.error('⚠️ Error initializing Google Drive Auth:', err.message);
    return null;
  }
}

/**
 * Find or create a subfolder (e.g. "2026-11 (November)") inside the root Google Drive folder.
 */
async function getOrCreateMonthFolder(client, rootFolderId, monthName) {
  try {
    const query = `'${rootFolderId}' in parents and name = '${monthName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    const searchRes = await client.request({
      url: `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)&spaces=drive`,
      method: 'GET',
    });

    if (searchRes.data && searchRes.data.files && searchRes.data.files.length > 0) {
      return searchRes.data.files[0].id;
    }

    // Create folder if it doesn't exist
    const createRes = await client.request({
      url: 'https://www.googleapis.com/drive/v3/files',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      data: JSON.stringify({
        name: monthName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [rootFolderId],
      }),
    });

    return createRes.data.id;
  } catch (err) {
    console.warn(`⚠️ Could not create/find month folder on Google Drive (${err.message}). Defaulting to root folder.`);
    return rootFolderId;
  }
}

/**
 * Uploads a local JSON backup file to the faculty Google Drive folder, inside a month-wise subfolder.
 *
 * @param {string} filePath - Absolute path to local backup JSON file
 * @param {string} [folderId] - Optional Google Drive parent folder ID
 */
export async function uploadBackupToGoogleDrive(filePath, folderId = null) {
  const targetFolderId = folderId || process.env.GDRIVE_BACKUP_FOLDER_ID || DEFAULT_FOLDER_ID;

  if (!fs.existsSync(filePath)) {
    console.error(`❌ Backup file does not exist: ${filePath}`);
    return { success: false, reason: 'FILE_NOT_FOUND' };
  }

  const auth = getGoogleAuthClient();
  if (!auth) {
    console.log('\nℹ️ [GOOGLE DRIVE BACKUP] Skipped: No Google Service Account key found.');
    console.log('   To enable automatic Google Drive upload, add your service account JSON to:');
    console.log('   - File: google-service-account.json (in project root), OR');
    console.log('   - Environment variable: GDRIVE_SERVICE_ACCOUNT_KEY=<json_string>');
    return { success: false, reason: 'NO_CREDENTIALS' };
  }

  try {
    const client = await auth.getClient();
    const now = new Date();
    const monthFolderLabel = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')} (${now.toLocaleString('en-US', { month: 'long' })})`;

    console.log(`☁️ [GOOGLE DRIVE] Checking/Creating month folder: "${monthFolderLabel}"...`);
    const destinationFolderId = await getOrCreateMonthFolder(client, targetFolderId, monthFolderLabel);

    const fileName = path.basename(filePath);
    const fileContent = fs.readFileSync(filePath, 'utf-8');

    console.log(`☁️ [GOOGLE DRIVE] Uploading ${fileName} (${(fileContent.length / 1024 / 1024).toFixed(2)} MB)...`);

    const boundary = '-------GDriveBackup' + Date.now().toString(16);
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    const metadata = {
      name: fileName,
      parents: [destinationFolderId],
    };

    const multipartRequestBody =
      delimiter +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata) +
      delimiter +
      'Content-Type: application/json\r\n\r\n' +
      fileContent +
      closeDelimiter;

    const uploadRes = await client.request({
      url: 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink',
      method: 'POST',
      headers: {
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      data: multipartRequestBody,
    });

    const uploadedFile = uploadRes.data;
    console.log('✅ [GOOGLE DRIVE SUCCESS] File uploaded successfully!');
    console.log(`📁 File Name: ${uploadedFile.name}`);
    console.log(`🆔 File ID: ${uploadedFile.id}`);
    if (uploadedFile.webViewLink) {
      console.log(`🔗 Link: ${uploadedFile.webViewLink}`);
    }

    return {
      success: true,
      fileId: uploadedFile.id,
      name: uploadedFile.name,
      link: uploadedFile.webViewLink,
    };
  } catch (err) {
    console.error('❌ [GOOGLE DRIVE ERROR] Upload failed:', err.response?.data?.error?.message || err.message);
    return { success: false, error: err.message };
  }
}
