function fmtHour(h) {
  const suffix = h >= 12 ? 'PM' : 'AM';
  return `${((h + 11) % 12) + 1}:00${suffix}`;
}
const FLOOR_NAMES = { 2: 'Second Floor', 3: 'Third Floor' };
function today() { return new Date().toISOString().slice(0, 10); }
function hourOptions(from, to, withRange) {
  let html = '';
  for (let h = from; h <= to; h++) {
    html += `<option value="${h}">${withRange ? fmtHour(h) + ' – ' + fmtHour(h + 1) : fmtHour(h)}</option>`;
  }
  return html;
}