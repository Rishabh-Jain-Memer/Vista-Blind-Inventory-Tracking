/*
  Shared spreadsheet export helpers.
  Keeps every Excel button on the same guarded SheetJS path, with a CSV fallback
  when the CDN library is unavailable.
*/

function todayStamp() {
  return new Date().toISOString().slice(0, 10)
}

function sanitizeSheetName(name) {
  return String(name || 'Sheet1').replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Sheet1'
}

function downloadCsv(rows, filename) {
  const csv = rows.map(row => row.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.replace(/\.xlsx$/i, '.csv')
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function exportWorkbook(sheets, filename) {
  const validSheets = (sheets || []).filter(s => s && Array.isArray(s.rows) && s.rows.length)
  if (!validSheets.length) {
    toast('No rows to export', 'error')
    return false
  }

  if (typeof XLSX === 'undefined') {
    downloadCsv(validSheets[0].rows, filename)
    toast('Excel library unavailable. Downloaded CSV instead.', 'error')
    return false
  }

  const wb = XLSX.utils.book_new()
  validSheets.forEach(sheet => {
    const ws = XLSX.utils.aoa_to_sheet(sheet.rows)
    if (sheet.cols) ws['!cols'] = sheet.cols
    XLSX.utils.book_append_sheet(wb, ws, sanitizeSheetName(sheet.name))
  })
  XLSX.writeFile(wb, filename)
  return true
}
