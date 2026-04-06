function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("Agents")
    .addItem("Technical Specification Enhancer Agent", "showSidebar")
    .addToUi();
}

/**
 * Simple hook Apps Script calls when the user changes selection.
 * Note: sidebars can't receive push events; the sidebar UI should poll.
 * @param {GoogleAppsScript.Events.SheetsOnSelectionChange} e
 */
function onSelectionChange(e) {
  // Intentionally lightweight. Keeping this function present enables future enhancements
  // (e.g., storing last-active sheet) without breaking deployments.
  return;
}

function getActiveSheetName() {
  return SpreadsheetApp.getActiveSheet().getName();
}

/**
 * Safe for HTML attribute values (Apps Script has no Utilities.htmlEncode).
 * @param {string} value
 * @return {string}
 */
function escapeHtmlAttribute_(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/'/g, "&#39;");
}

function showSidebar() {
  const template = HtmlService.createTemplateFromFile("index");
  template.sheetName = SpreadsheetApp.getActiveSheet().getName();
  const html = template.evaluate().setTitle("Technical Specification Enhancer Agent");
  SpreadsheetApp.getUi().showSidebar(html);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function getRows() {
  const rows = [];
  const sheet = SpreadsheetApp.getActiveSheet();
  const lastRow = sheet.getLastRow();

  for (let i = 0; i < lastRow; i++) {
    rows[i] = i + 1;
  }

  return rows;
}

function getActiveSelection() {
  const sheet = SpreadsheetApp.getActiveSheet();
  const range = sheet.getActiveRange();
  if (!range) return null;
  return {
    a1: range.getA1Notation(),   // e.g. "B2:D5"
    _1Based: rangeTo1Based(range),
    values: range.getValues(),   // 2D array of display values
    sheetName: sheet.getName(),
  };
}

function readByIndices(r1, c1, r2, c2) {
  const sheet = SpreadsheetApp.getActiveSheet();
  const range = sheet.getRange(r1, c1, r2, c2); // row 2–10, cols A–E
  return range.getValues();
}

function getValues(range) {
  const sheet = SpreadsheetApp.getActiveSheet();
  const fetchRange = sheet.getRange(range);
  return fetchRange.getValues();
}

function rangeTo1Based(range) {
  const r1 = range.getRow();           // top row (1-based)
  const c1 = range.getColumn();        // left column (1-based)
  const r2 = r1 + range.getNumRows() - 1;
  const c2 = c1 + range.getNumColumns() - 1;
  return { r1, c1, r2, c2 };
  // e.g. { r1: 2, c1: 1, r2: 10, c2: 4 }  → rows 2–10, cols A–D
}

function writeCell(r1, c1, r2, c2, value) {
  const sheet = SpreadsheetApp.getActiveSheet();
  const range = sheet.getRange(r1, c1, r2, c2);
  if (!range) return null;

  range.setValue(value);
}
