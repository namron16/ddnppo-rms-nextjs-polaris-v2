import ExcelJS from 'exceljs'
import { getServiceClient } from '@/lib/gdrive-pool/db'

export async function exportAdminLogsAsXlsx(
  fromDate: Date,
  toDate: Date
): Promise<Buffer> {
  const db = getServiceClient()

  const { data: logs } = await db
    .from('admin_logs')
    .select('id, role, action, description, created_at')
    .gte('created_at', fromDate.toISOString())
    .lte('created_at', toDate.toISOString())
    .order('created_at', { ascending: false })

  const rows = (logs ?? []).map(log => ({
    'Log ID':      log.id,
    'Role':        log.role,
    'Action':      log.action,
    'Description': log.description,
    'Timestamp':   new Date(log.created_at).toLocaleString('en-PH'),
  }))

  const workbook  = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet('Admin Logs')

  const columns = ['Log ID', 'Role', 'Action', 'Description', 'Timestamp'] as const

  // Define columns with auto-sizing (min width 20)
  worksheet.columns = columns.map(header => ({
    header,
    key:   header,
    width: Math.max(header.length, 20),
  }))

  // Bold header row
  worksheet.getRow(1).font = { bold: true }

  // Add data rows
  for (const row of rows) {
    worksheet.addRow(row)
  }

  const buffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(buffer)
}