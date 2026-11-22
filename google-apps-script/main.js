// =============================================================================
// Backend Google Sheets untuk Aplikasi Manajemen RT/RW
// Deploy: Extensions > Apps Script > Deploy > New deployment > Web app
//   - Execute as: Me
//   - Who has access: Anyone
// Setelah mengganti kode ini, WAJIB "Deploy > Manage deployments > Edit > New version".
// =============================================================================

// --- KONFIGURASI ---
const SPREADSHEET_ID = "YOUR_SPREADSHEET_ID"; // <- isi dengan ID spreadsheet Anda
// Folder Drive untuk foto laporan (opsional, kosong = root Drive)
const UPLOAD_FOLDER_ID = "";
// Kunci rahasia antara server aplikasi dan script ini. Isi SAMA dengan GAS_SECRET di .env server.
// Selama masih kosong, script menerima request tanpa kunci (mode transisi).
const API_SECRET = "";

// Urutan kolom setiap sheet (kolom pertama selalu "id").
// Kolom baru selalu DITAMBAHKAN DI AKHIR agar data lama tidak bergeser.
const SCHEMAS = {
  Residents: ["id", "name", "nik", "address", "rt", "rw", "status", "phone", "gender", "maritalStatus", "familyRelationship", "familyCardNumber", "password", "verified"],
  Announcements: ["id", "title", "content", "date", "rt"],
  Letters: ["id", "residentName", "type", "status", "date", "rt", "content", "residentId"],
  Transactions: ["id", "type", "amount", "category", "description", "date", "rt"],
  Reports: ["id", "residentId", "residentName", "title", "description", "date", "status", "rt", "image"],
  Admins: ["id", "username", "password", "role", "rtId", "name", "phone"],
  Mutations: ["id", "residentId", "residentName", "type", "date", "details", "rt"],
};

// Kolom yang harus disimpan sebagai TEKS. Jika disimpan sebagai angka, Sheets membulatkan
// NIK/KK 16 digit (presisi hanya 15 digit) dan membuang angka 0 di depan nomor HP.
const TEXT_KEYS = ["nik", "familyCardNumber", "phone", "residentId", "rtId", "rt", "rw", "password"];

function toCell(key, value) {
  if (value === undefined || value === null) return "";
  if (TEXT_KEYS.indexOf(key) >= 0 && value !== "") return "'" + String(value);
  return value;
}

// =============================================================================
// ENTRY POINT
// =============================================================================

function doGet(e) {
  try {
    checkSecret(e.parameter.secret);
    const action = e.parameter.action || "";
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

    // Kompatibilitas nama action lama: getResidents, getAnnouncements, dst.
    const legacy = {
      getResidents: "Residents", getAnnouncements: "Announcements", getLetters: "Letters",
      getTransactions: "Transactions", getReports: "Reports", getAdmins: "Admins", getMutations: "Mutations",
    };
    const sheetName = legacy[action] || (action === "list" ? e.parameter.sheet : null);
    if (!sheetName || !SCHEMAS[sheetName]) return responseJSON({ error: "Action not found" });

    return responseJSON(readRows(ss, sheetName));
  } catch (err) {
    return responseJSON({ error: err.toString() });
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    const body = JSON.parse(e.postData.contents);
    checkSecret(body.secret);
    lock.waitLock(20000); // cegah ID bentrok saat dua request bersamaan
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const data = body.data || {};

    switch (body.action) {
      // Generik
      case "create": return responseJSON(createRow(ss, body.sheet, data));
      case "update": return responseJSON(updateRow(ss, body.sheet, data.id, data));
      case "delete": return responseJSON(deleteRow(ss, body.sheet, data.id));
      case "addReport": return responseJSON(addReport(ss, data));

      // Kompatibilitas action lama
      case "addResident": return responseJSON(createRow(ss, "Residents", data));
      case "addAnnouncement": return responseJSON(createRow(ss, "Announcements", data));
      case "addLetter": return responseJSON(createRow(ss, "Letters", data));
      case "addTransaction": return responseJSON(createRow(ss, "Transactions", data));
      case "updateReportStatus": return responseJSON(updateRow(ss, "Reports", data.id, { status: data.status }));
      case "updateResidentPhone": return responseJSON(updateResidentPhone(ss, data.nik, data.phone));
    }
    return responseJSON({ error: "Action not found" });
  } catch (err) {
    return responseJSON({ error: err.toString() });
  } finally {
    lock.releaseLock();
  }
}

// =============================================================================
// HELPER
// =============================================================================

function checkSecret(secret) {
  if (API_SECRET && secret !== API_SECRET) throw new Error("Unauthorized");
}

/** Ambil sheet; buat otomatis beserta header bila belum ada. */
function getSheet(ss, sheetName) {
  const schema = SCHEMAS[sheetName];
  if (!schema) throw new Error("Sheet tidak dikenal: " + sheetName);

  let ws = ss.getSheetByName(sheetName);
  if (!ws) ws = ss.insertSheet(sheetName);
  if (ws.getLastRow() === 0) {
    ws.appendRow(schema);
    ws.getRange(1, 1, 1, schema.length).setFontWeight("bold").setBackground("#f3f4f6");
  }
  return ws;
}

function readRows(ss, sheetName) {
  const ws = getSheet(ss, sheetName);
  const schema = SCHEMAS[sheetName];
  const lastRow = ws.getLastRow();
  if (lastRow < 2) return [];

  const values = ws.getRange(2, 1, lastRow - 1, schema.length).getValues();
  return values
    .filter(row => row[0] !== "" && row[0] !== null)
    .map(row => {
      const obj = {};
      schema.forEach((key, i) => {
        let v = row[i];
        // Tanggal dikirim sebagai yyyy-mm-dd, bukan objek Date
        if (v instanceof Date) v = Utilities.formatDate(v, Session.getScriptTimeZone(), "yyyy-MM-dd");
        obj[key] = v;
      });
      return obj;
    });
}

/** Cari nomor baris (1-based) berdasarkan id. */
function findRowById(ws, id) {
  const lastRow = ws.getLastRow();
  if (lastRow < 2) return -1;
  const ids = ws.getRange(2, 1, lastRow - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) return i + 2;
  }
  return -1;
}

/** ID baru = ID terbesar + 1 (aman walau ada baris yang dihapus). */
function nextId(ws) {
  const lastRow = ws.getLastRow();
  if (lastRow < 2) return 1;
  const ids = ws.getRange(2, 1, lastRow - 1, 1).getValues().map(r => Number(r[0]) || 0);
  return Math.max.apply(null, ids.concat([0])) + 1;
}

function createRow(ss, sheetName, data) {
  const ws = getSheet(ss, sheetName);
  const schema = SCHEMAS[sheetName];
  const id = nextId(ws);
  const row = schema.map(key => (key === "id" ? id : toCell(key, data[key])));
  ws.appendRow(row);

  const obj = {};
  schema.forEach((key, i) => (obj[key] = key === "id" ? id : (data[key] === undefined || data[key] === null ? "" : data[key])));
  return { status: "success", id: id, data: obj };
}

/** Update sebagian kolom saja (kolom yang tidak dikirim tidak berubah). */
function updateRow(ss, sheetName, id, data) {
  const ws = getSheet(ss, sheetName);
  const schema = SCHEMAS[sheetName];
  const rowNum = findRowById(ws, id);
  if (rowNum < 0) return { error: "Data tidak ditemukan" };

  const range = ws.getRange(rowNum, 1, 1, schema.length);
  const current = range.getValues()[0];
  const row = current.slice();
  const obj = {};
  schema.forEach((key, i) => {
    if (key !== "id" && data[key] !== undefined) {
      row[i] = toCell(key, data[key]);
      obj[key] = data[key] === null ? "" : data[key];
    } else {
      // Kolom teks yang tidak diubah ditulis ulang apa adanya sebagai teks
      row[i] = key !== "id" && TEXT_KEYS.indexOf(key) >= 0 ? toCell(key, current[i]) : current[i];
      obj[key] = current[i] instanceof Date ? Utilities.formatDate(current[i], Session.getScriptTimeZone(), "yyyy-MM-dd") : current[i];
    }
  });
  range.setValues([row]);
  return { status: "success", data: obj };
}

function deleteRow(ss, sheetName, id) {
  const ws = getSheet(ss, sheetName);
  const rowNum = findRowById(ws, id);
  if (rowNum < 0) return { error: "Data tidak ditemukan" };
  ws.deleteRow(rowNum);
  return { status: "success" };
}

function addReport(ss, data) {
  let imageUrl = "";
  if (data.image) {
    try {
      const blob = Utilities.newBlob(Utilities.base64Decode(data.image), "image/jpeg", "report_" + Date.now() + ".jpg");
      const folder = UPLOAD_FOLDER_ID ? DriveApp.getFolderById(UPLOAD_FOLDER_ID) : DriveApp.getRootFolder();
      const file = folder.createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      // Link thumbnail bisa langsung ditampilkan di <img>
      imageUrl = "https://drive.google.com/thumbnail?sz=w1000&id=" + file.getId();
    } catch (err) {
      imageUrl = "";
    }
  }
  const result = createRow(ss, "Reports", Object.assign({}, data, { image: imageUrl }));
  result.imageUrl = imageUrl;
  return result;
}

function updateResidentPhone(ss, nik, newPhone) {
  const resident = readRows(ss, "Residents").filter(r => String(r.nik) === String(nik))[0];
  if (!resident) return { error: "Resident not found" };
  return updateRow(ss, "Residents", resident.id, { phone: newPhone });
}

function responseJSON(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
