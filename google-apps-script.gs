/**
 * 바람길 제주 · Google Sheets 신고 저장 백엔드
 *
 * Google Sheets에서:
 * 1) 확장 프로그램 → Apps Script
 * 2) 기존 Code.gs 내용을 모두 지우고 이 코드 전체를 붙여넣기
 * 3) setupSheets()를 한 번 실행하고 권한 승인
 * 4) 배포 → 새 배포 → 웹 앱
 *    - 실행 사용자: 나
 *    - 액세스 권한: 모든 사용자
 * 5) 생성된 /exec URL을 config.js의 API_BASE_URL에 입력
 *
 * 저장되는 항목:
 * - 응답 시각
 * - 체감 바람 세기
 * - 위치
 * - 메모
 */

const REPORT_SHEET_NAME = 'reports';

const REPORT_HEADERS = Object.freeze([
  '응답 시각',
  '체감 바람 세기',
  '위치',
  '메모',
]);

const SEVERITY_LABELS = Object.freeze({
  1: '1 · 잔잔',
  2: '2 · 약함',
  3: '3 · 보통',
  4: '4 · 강함',
  5: '5 · 매우 강함',
});

/**
 * 최초 한 번 직접 실행합니다.
 * reports 시트를 만들고 현재 스프레드시트 ID를 저장합니다.
 */
function setupSheets() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();

  if (!spreadsheet) {
    throw new Error(
      'Google Sheets의 확장 프로그램 → Apps Script에서 실행해주세요.'
    );
  }

  PropertiesService.getScriptProperties().setProperty(
    'SPREADSHEET_ID',
    spreadsheet.getId()
  );

  const sheet = ensureReportSheet_(spreadsheet);
  formatReportSheet_(sheet);

  return '설정 완료: reports 시트가 준비되었습니다.';
}

/**
 * 연결 확인용 GET API입니다.
 *
 * /exec?action=health
 * /exec?action=bootstrap
 */
function doGet(e) {
  try {
    const params = (e && e.parameter) || {};
    const action = String(params.action || 'health').trim().toLowerCase();

    if (action === 'health') {
      return jsonResponse_({
        ok: true,
        service: 'baramgil-jeju-reports',
        now: new Date().toISOString(),
      });
    }

    /*
     * 기존 app.js가 시작할 때 bootstrap을 요청하므로
     * 오류가 나지 않도록 비어 있는 정상 응답을 돌려줍니다.
     */
    if (action === 'bootstrap') {
      return jsonResponse_({
        ok: true,
        currentWind: null,
        zones: [],
        places: [],
        updatedAt: new Date().toISOString(),
      });
    }

    return jsonResponse_({
      ok: false,
      error: '지원하지 않는 action입니다.',
    });
  } catch (error) {
    console.error(error);

    return jsonResponse_({
      ok: false,
      error: getErrorMessage_(error),
    });
  }
}

/**
 * 현재 웹 신고 폼의 값을 받아 reports 시트에 저장합니다.
 * 프론트에서 보내는 lat, lng, userAgent 등의 추가 값은 저장하지 않습니다.
 */
function doPost(e) {
  try {
    const payload = parsePostBody_(e);
    const action = String(payload.action || 'report').trim().toLowerCase();

    if (action !== 'report') {
      return jsonResponse_({
        ok: false,
        error: '지원하지 않는 action입니다.',
      });
    }

    const result = saveReport_(payload);
    return jsonResponse_(result);
  } catch (error) {
    console.error(error);

    return jsonResponse_({
      ok: false,
      error: getErrorMessage_(error),
    });
  }
}

function saveReport_(payload) {
  const severityNumber = Math.max(
    1,
    Math.min(5, Math.round(toNumber_(payload.severity, 3)))
  );

  const locationText = safeCellText_(payload.locationText, 80);
  const comment = safeCellText_(payload.comment, 300);

  if (!locationText) {
    throw new Error('위치를 입력해주세요.');
  }

  const spreadsheet = getSpreadsheet_();
  const sheet = ensureReportSheet_(spreadsheet);

  const row = [
    new Date(),
    SEVERITY_LABELS[severityNumber],
    locationText,
    comment,
  ];

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    sheet.appendRow(row);
  } finally {
    lock.releaseLock();
  }

  return {
    ok: true,
    savedAt: new Date().toISOString(),
  };
}

function parsePostBody_(e) {
  if (!e) return {};

  if (e.postData && e.postData.contents) {
    const raw = String(e.postData.contents || '').trim();

    if (raw) {
      try {
        return JSON.parse(raw);
      } catch (ignore) {
        // JSON이 아니면 아래의 폼 파라미터를 사용합니다.
      }
    }
  }

  return e.parameter || {};
}

function getSpreadsheet_() {
  const spreadsheetId = PropertiesService
    .getScriptProperties()
    .getProperty('SPREADSHEET_ID');

  if (spreadsheetId) {
    return SpreadsheetApp.openById(spreadsheetId);
  }

  const activeSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();

  if (!activeSpreadsheet) {
    throw new Error(
      '스프레드시트를 찾을 수 없습니다. setupSheets()를 먼저 실행해주세요.'
    );
  }

  return activeSpreadsheet;
}

function ensureReportSheet_(spreadsheet) {
  let sheet = spreadsheet.getSheetByName(REPORT_SHEET_NAME);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(REPORT_SHEET_NAME);
  }

  const headerRange = sheet.getRange(
    1,
    1,
    1,
    REPORT_HEADERS.length
  );

  const currentHeaders = headerRange.getDisplayValues()[0];
  const headersAreDifferent = REPORT_HEADERS.some(function (header, index) {
    return currentHeaders[index] !== header;
  });

  if (sheet.getLastRow() === 0 || headersAreDifferent) {
    headerRange.setValues([REPORT_HEADERS]);
  }

  return sheet;
}

function formatReportSheet_(sheet) {
  sheet.setFrozenRows(1);

  sheet
    .getRange(1, 1, 1, REPORT_HEADERS.length)
    .setFontWeight('bold')
    .setBackground('#D7F1FC')
    .setFontColor('#183B56');

  sheet.getRange('A:A').setNumberFormat('yyyy-mm-dd hh:mm:ss');
  sheet.setColumnWidth(1, 165);
  sheet.setColumnWidth(2, 125);
  sheet.setColumnWidth(3, 260);
  sheet.setColumnWidth(4, 420);
  sheet.getRange('C:D').setWrap(true);
}

/**
 * 셀 수식 삽입을 막고 길이를 제한합니다.
 */
function safeCellText_(value, maxLength) {
  let text = String(value == null ? '' : value)
    .replace(/[<>]/g, '')
    .trim()
    .slice(0, maxLength);

  if (/^[=+\-@]/.test(text)) {
    text = "'" + text;
  }

  return text;
}

function toNumber_(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function getErrorMessage_(error) {
  return String(
    error && error.message
      ? error.message
      : error || '알 수 없는 오류가 발생했습니다.'
  );
}

function jsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
