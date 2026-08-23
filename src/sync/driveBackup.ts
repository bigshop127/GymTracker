import { exportBackupData, importBackupData } from '../lib/backup';

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3/files';
const BACKUP_FOLDER_NAME = 'GymTracker 備份';
const BOUNDARY = 'gymtracker-backup-boundary';

export interface DriveBackupFile {
  id: string;
  name: string;
  createdTime: string;
}

async function driveFetch(accessToken: string, url: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, {
    ...init,
    headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Google Drive 操作失敗 (HTTP ${res.status})`);
  }
  return res;
}

// 找（或建立）專門放備份檔的資料夾，避免每次上傳散在雲端硬碟根目錄。
async function ensureBackupFolderId(accessToken: string): Promise<string> {
  const q = encodeURIComponent(
    `name='${BACKUP_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false and 'me' in owners`
  );
  const searchRes = await driveFetch(accessToken, `${DRIVE_API}/files?q=${q}&fields=files(id)&spaces=drive`);
  const searchData = await searchRes.json();
  const existingId = searchData.files?.[0]?.id;
  if (existingId) return existingId;

  const createRes = await driveFetch(accessToken, `${DRIVE_API}/files?fields=id`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: BACKUP_FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' }),
  });
  const created = await createRes.json();
  return created.id;
}

function formatBackupFilename(date: Date): string {
  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const d = date.getDate().toString().padStart(2, '0');
  const hh = date.getHours().toString().padStart(2, '0');
  const mm = date.getMinutes().toString().padStart(2, '0');
  return `${y}-${m}-${d} ${hh}${mm} 更新檔.json`;
}

/** 匯出目前全部資料，存成一份帶時間戳記檔名的新檔案到雲端硬碟的備份資料夾（不覆蓋舊檔）。*/
export async function uploadBackupToDrive(accessToken: string): Promise<DriveBackupFile> {
  const folderId = await ensureBackupFolderId(accessToken);
  const content = await exportBackupData();
  const metadata = { name: formatBackupFilename(new Date()), parents: [folderId], mimeType: 'application/json' };

  const body =
    `--${BOUNDARY}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
    `--${BOUNDARY}\r\nContent-Type: application/json\r\n\r\n${content}\r\n` +
    `--${BOUNDARY}--`;

  const res = await driveFetch(
    accessToken,
    `${DRIVE_UPLOAD_API}?uploadType=multipart&fields=id,name,createdTime`,
    {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${BOUNDARY}` },
      body,
    }
  );
  return res.json();
}

/** 列出備份資料夾裡最新的幾份備份檔，新到舊排序（預設只拿最新 5 份）。*/
export async function listBackupsFromDrive(accessToken: string, limit = 5): Promise<DriveBackupFile[]> {
  const folderId = await ensureBackupFolderId(accessToken);
  const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
  const res = await driveFetch(
    accessToken,
    `${DRIVE_API}/files?q=${q}&fields=files(id,name,createdTime)&orderBy=createdTime desc&pageSize=${limit}&spaces=drive`
  );
  const data = await res.json();
  return data.files ?? [];
}

/** 下載指定備份檔並整份覆蓋回本機資料庫（沿用本機 JSON 備份的還原邏輯）。*/
export async function downloadBackupFromDrive(accessToken: string, fileId: string): Promise<void> {
  const res = await driveFetch(accessToken, `${DRIVE_API}/files/${fileId}?alt=media`);
  const text = await res.text();
  await importBackupData(text);
}
