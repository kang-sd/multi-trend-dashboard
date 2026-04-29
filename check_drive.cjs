const { google } = require('googleapis');
const fs = require('fs');

async function main() {
  try {
    const key = JSON.parse(fs.readFileSync('E:/Projects/kquant/kquant_collector/service-account.json'));
    const auth = new google.auth.GoogleAuth({
      credentials: key,
      scopes: ['https://www.googleapis.com/auth/drive'],
    });
    
    const drive = google.drive({ version: 'v3', auth });
    
    const folderId = '1lZnZbqVg3OTGTPvyy2xEuS7KT-i1apqc';
    console.log(`--- Listing Files in Folder ${folderId} ---`);
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'files(id, name, mimeType, size)',
      pageSize: 100,
    });
    
    console.log(`Total files: ${res.data.files.length}`);
    res.data.files.forEach(f => {
      console.log(`- ${f.name} (${f.mimeType}) [${f.id}]`);
    });

  } catch (err) {
    console.error('Error:', err.message);
  }
}

main();
