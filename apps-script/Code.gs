/**
 * 바람길 제주 · Google Sheets 백엔드
 *
 * 사용 순서
 * 1. Google Sheets > 확장 프로그램 > Apps Script
 * 2. 이 파일 전체를 Code.gs에 붙여넣기
 * 3. setupSheets()를 한 번 실행
 * 4. 배포 > 새 배포 > 웹 앱
 * 5. 발급된 /exec URL을 프론트 config.js의 API_BASE_URL에 입력
 */

const SHEET_NAMES = Object.freeze({
  WIND: 'wind_data',
  ZONES: 'wind_zones',
  PLACES: 'places',
  REPORTS: 'reports',
});

const HEADERS = Object.freeze({
  wind_data: ['timestamp', 'direction', 'directionDeg', 'speed', 'gust', 'source'],
  wind_zones: ['id', 'label', 'lat', 'lng', 'radius', 'level', 'active'],
  places: ['name', 'aliases', 'lat', 'lng'],
  reports: ['id', 'createdAt', 'severity', 'locationText', 'comment', 'lat', 'lng', 'userAgent', 'status'],
});

function doGet(e) {
  try {
    const action = String((e && e.parameter && e.parameter.action) || 'bootstrap').toLowerCase();

    if (action === 'health') {
      return jsonResponse_({ ok: true, service: 'baramgil-jeju', now: new Date().toISOString() });
    }

    if (action === 'bootstrap') {
      return jsonResponse_(getBootstrapData_());
    }

    return jsonResponse_({ ok: false, error: '지원하지 않는 action입니다.' });
  } catch (error) {
    console.error(error);
    return jsonResponse_({ ok: false, error: String(error && error.message ? error.message : error) });
  }
}

function doPost(e) {
  try {
    const payload = parsePostBody_(e);
    const action = String(payload.action || 'report').toLowerCase();

    if (action === 'report') {
      return jsonResponse_(saveWindReport_(payload));
    }

    return jsonResponse_({ ok: false, error: '지원하지 않는 action입니다.' });
  } catch (error) {
    console.error(error);
    return jsonResponse_({ ok: false, error: String(error && error.message ? error.message : error) });
  }
}

/** 기본 시트와 데모 행을 생성합니다. 최초 1회 직접 실행하세요. */
function setupSheets() {
  const spreadsheet = getSpreadsheet_();
  Object.keys(HEADERS).forEach(function (sheetName) {
    ensureSheet_(spreadsheet, sheetName, HEADERS[sheetName]);
  });

  const windSheet = spreadsheet.getSheetByName(SHEET_NAMES.WIND);
  if (windSheet.getLastRow() === 1) {
    windSheet.appendRow([new Date(), '북서풍', 315, 7.2, 12.8, '관리자 입력']);
  }

  const zoneSheet = spreadsheet.getSheetByName(SHEET_NAMES.ZONES);
  if (zoneSheet.getLastRow() === 1) {
    zoneSheet.getRange(2, 1, 3, HEADERS.wind_zones.length).setValues([
      ['east-coast', '동부 해안 강풍', 33.54, 126.76, 6000, 'high', true],
      ['aewol-crosswind', '애월 횡풍', 33.45, 126.39, 4500, 'medium', true],
      ['mid-mountain-shelter', '중산간 방풍', 33.39, 126.62, 5500, 'shelter', true],
    ]);
  }

  const placeSheet = spreadsheet.getSheetByName(SHEET_NAMES.PLACES);
  if (placeSheet.getLastRow() === 1) {
    placeSheet.getRange(2, 1, 5, HEADERS.places.length).setValues([
      ['제주국제공항', '제주공항,공항', 33.5104, 126.4914],
      ['제주시청', '시청,제주시청사', 33.4996, 126.5312],
      ['함덕해수욕장', '함덕,함덕해변', 33.5432, 126.6696],
      ['성산일출봉', '성산,일출봉', 33.4581, 126.9425],
      ['협재해수욕장', '협재,협재해변', 33.3940, 126.2390],
    ]);
  }

  formatSheets_(spreadsheet);
  CacheService.getScriptCache().remove('bootstrap-v1');
  return '설정 완료';
}

function getBootstrapData_() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get('bootstrap-v1');
  if (cached) return JSON.parse(cached);

  const spreadsheet = getSpreadsheet_();
  const windRows = readObjects_(spreadsheet.getSheetByName(SHEET_NAMES.WIND));
  const zoneRows = readObjects_(spreadsheet.getSheetByName(SHEET_NAMES.ZONES));
  const placeRows = readObjects_(spreadsheet.getSheetByName(SHEET_NAMES.PLACES));

  const currentWind = windRows
    .filter(function (row) { return row.timestamp; })
    .sort(function (a, b) { return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(); })[0] || null;

  const payload = {
    ok: true,
    currentWind: currentWind ? {
      timestamp: toIsoString_(currentWind.timestamp),
      updatedAt: toIsoString_(currentWind.timestamp),
      direction: String(currentWind.direction || '북서풍'),
      directionDeg: toNumber_(currentWind.directionDeg, 315),
      speed: toNumber_(currentWind.speed, 0),
      gust: toNumber_(currentWind.gust, 0),
      source: String(currentWind.source || 'Google Sheets'),
    } : null,
    zones: zoneRows
      .filter(function (row) { return toBoolean_(row.active); })
      .map(function (row) {
        return {
          id: String(row.id || ''),
          label: String(row.label || ''),
          lat: toNumber_(row.lat, 0),
          lng: toNumber_(row.lng, 0),
          radius: toNumber_(row.radius, 0),
          level: String(row.level || 'medium'),
        };
      }),
    places: placeRows.map(function (row) {
      return {
        name: String(row.name || ''),
        aliases: String(row.aliases || '').split(',').map(function (value) { return value.trim(); }).filter(Boolean),
        lat: toNumber_(row.lat, 0),
        lng: toNumber_(row.lng, 0),
      };
    }),
    updatedAt: new Date().toISOString(),
  };

  cache.put('bootstrap-v1', JSON.stringify(payload), 30);
  return payload;
}

function saveWindReport_(payload) {
  const locationText = sanitizeText_(payload.locationText, 80);
  const comment = sanitizeText_(payload.comment, 300);
  const severity = Math.max(1, Math.min(5, Math.round(toNumber_(payload.severity, 3))));

  if (!locationText) throw new Error('locationText가 필요합니다.');

  const row = [
    Utilities.getUuid(),
    new Date(),
    severity,
    locationText,
    comment,
    toNumber_(payload.lat, ''),
    toNumber_(payload.lng, ''),
    sanitizeText_(payload.userAgent, 180),
    'new',
  ];

  const lock = LockService.getScriptLock();
  lock.waitLock(8000);
  try {
    const spreadsheet = getSpreadsheet_();
    const sheet = ensureSheet_(spreadsheet, SHEET_NAMES.REPORTS, HEADERS.reports);
    sheet.appendRow(row);
  } finally {
    lock.releaseLock();
  }

  return { ok: true, id: row[0], savedAt: new Date().toISOString() };
}

function parsePostBody_(e) {
  if (!e) return {};
  if (e.postData && e.postData.contents) {
    const raw = String(e.postData.contents || '').trim();
    if (raw) {
      try { return JSON.parse(raw); } catch (ignore) { /* form fallback below */ }
    }
  }
  return e.parameter || {};
}

function getSpreadsheet_() {
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (id) return SpreadsheetApp.openById(id);
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (!active) throw new Error('연결된 스프레드시트를 찾을 수 없습니다. SPREADSHEET_ID를 설정해주세요.');
  return active;
}

function ensureSheet_(spreadsheet, sheetName, headers) {
  let sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) sheet = spreadsheet.insertSheet(sheetName);

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  } else {
    const existing = sheet.getRange(1, 1, 1, Math.max(headers.length, sheet.getLastColumn())).getDisplayValues()[0];
    const isDifferent = headers.some(function (header, index) { return existing[index] !== header; });
    if (isDifferent) sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  return sheet;
}

function readObjects_(sheet) {
  if (!sheet || sheet.getLastRow() < 2) return [];
  const values = sheet.getDataRange().getValues();
  const headers = values.shift().map(String);
  return values
    .filter(function (row) { return row.some(function (cell) { return cell !== '' && cell !== null; }); })
    .map(function (row) {
      return headers.reduce(function (object, header, index) {
        object[header] = row[index];
        return object;
      }, {});
    });
}

function formatSheets_(spreadsheet) {
  Object.keys(HEADERS).forEach(function (sheetName) {
    const sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet) return;
    const width = HEADERS[sheetName].length;
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, width)
      .setFontWeight('bold')
      .setBackground('#D7F1FC')
      .setFontColor('#183B56');
    sheet.autoResizeColumns(1, width);
  });
}

function sanitizeText_(value, maxLength) {
  return String(value || '').replace(/[<>]/g, '').trim().slice(0, maxLength);
}

function toNumber_(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function toBoolean_(value) {
  if (typeof value === 'boolean') return value;
  return ['true', '1', 'yes', 'y', '사용', '활성'].includes(String(value || '').trim().toLowerCase());
}

function toIsoString_(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? String(value || '') : date.toISOString();
}

function jsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
