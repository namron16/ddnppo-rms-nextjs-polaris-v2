// lib/data201.ts
import { supabase } from './supabase'
import type { Personnel201, Doc201Item, Doc201Status } from '@/types'

const ARCHIVE_AFTER_YEARS = 15

function isSeparatedAndExpired(dateOfSeparation?: string | null): boolean {
  if (!dateOfSeparation) return false
  const separated = new Date(dateOfSeparation)
  const threshold = new Date(separated)
  threshold.setFullYear(threshold.getFullYear() + ARCHIVE_AFTER_YEARS)
  return new Date() >= threshold
}

// ── Types for createPersonnel201 input ────────
interface CreatePersonnel201Input {
  name: string
  rank: string
  serialNo: string
  unit: string
  initials: string
  avatarColor: string
  status?: string
  inactiveReason?: string
  separatedReason?: string
  dateOfSeparation?: string
}

/**
 * Scans personnel records passed in and persists Archived status
 * for records older than ARCHIVE_AFTER_YEARS.
 *
 * Accepts the raw DB rows already fetched by the caller to avoid
 * a second round-trip. Returns the set of IDs that were archived.
 */
export async function archiveExpiredPersonnel201Records(
  records: Array<{
    id: string
    status?: string | null
    date_of_separation?: string | null
  }>
): Promise<Set<string>> {
  // Find records that should be auto-archived
  const expiredIds = records
    .filter(
      (r) =>
        r.status === 'Separated from Service' &&
        isSeparatedAndExpired(r.date_of_separation ?? undefined)
    )
    .map((r) => r.id)

  if (expiredIds.length === 0) return new Set()

  const today = new Date().toISOString().split('T')[0]

  const { error } = await supabase
    .from('personnel_201')
    .update({ status: 'Archived', last_updated: today, archived: true })
    .in('id', expiredIds)

  if (error) {
    console.warn('archiveExpiredPersonnel201Records warning:', error.message)
    return new Set()
  }

  return new Set(expiredIds)
}

// ── Checklist template ────────────────────────
function blankChecklist(): Omit<Doc201Item, 'id'>[] {
  return [
    { category: 'PERSONAL_DATA',  label: 'Updated PDS (DPRM Form)',                          sublabel: 'With latest 2x2 ID in Type A GOA Uniform',      status: 'MISSING', dateUpdated: '' },
    { category: 'CIVIL_DOCUMENTS',label: 'Birth Certificate',                                 sublabel: 'PSA copy',                                       status: 'MISSING', dateUpdated: '' },
    { category: 'CIVIL_DOCUMENTS',label: 'Marriage Contract',                                 sublabel: 'PSA copy (if applicable)',                        status: 'MISSING', dateUpdated: '' },
    { category: 'CIVIL_DOCUMENTS',label: 'Birth Certificates of all Children',                sublabel: 'PSA copy',                                       status: 'MISSING', dateUpdated: '' },
    { category: 'ACADEMIC',       label: 'College Diploma',                                                                                               status: 'MISSING', dateUpdated: '' },
    { category: 'ACADEMIC',       label: 'Transcript of Records and CAV',                     sublabel: 'School Records or CAV',                          status: 'MISSING', dateUpdated: '' },
    { category: 'TRAINING',       label: 'Mandatory Training Documents',                      sublabel: 'Diploma, Final Order of Merits, Declaration of Graduates', status: 'MISSING', dateUpdated: '' },
    { category: 'TRAINING',       label: 'Specialized Training / Seminars Attended',          sublabel: 'Certificate of Graduation/Attendance',           status: 'MISSING', dateUpdated: '' },
    { category: 'ELIGIBILITY',    label: 'Eligibilities',                                     sublabel: 'Highest/Appropriate — attested copies',          status: 'MISSING', dateUpdated: '' },
    { category: 'SPECIAL_ORDERS', label: 'Attested Appointment / Special Orders',             sublabel: 'Temp/Perm — attested and approved',              status: 'MISSING', dateUpdated: '' },
    { category: 'ASSIGNMENTS',    label: 'Order of Assignment, Designation / Detail',                                                                     status: 'MISSING', dateUpdated: '' },
    { category: 'ASSIGNMENTS',    label: 'Service Records',                                   sublabel: 'Indicate Longevity and RCA Orders',              status: 'MISSING', dateUpdated: '' },
    { category: 'PROMOTIONS',     label: 'Promotion / Demotion Orders',                       sublabel: 'Include Absorption Order and Appointments',      status: 'MISSING', dateUpdated: '' },
    { category: 'AWARDS',         label: 'Awards, Decorations and Commendations',                                                                         status: 'MISSING', dateUpdated: '' },
    { category: 'FIREARMS',       label: 'Firearms Records',                                  sublabel: 'Property Accountability Receipt (P.A.R)',        status: 'MISSING', dateUpdated: '' },
    { category: 'MEDICAL',        label: 'Latest Medical Records',                                                                                        status: 'MISSING', dateUpdated: '' },
    { category: 'CASES',          label: 'Cases / Offenses',                                  sublabel: 'All administrative and criminal cases',          status: 'MISSING', dateUpdated: '' },
    { category: 'LEAVE',          label: 'Leave Records',                                                                                                 status: 'MISSING', dateUpdated: '' },
    { category: 'PAY_RECORDS',    label: 'RCA / Longevity Pay Orders',                        sublabel: 'All pay orders',                                 status: 'MISSING', dateUpdated: '' },
    { category: 'PAY_RECORDS',    label: 'Latest Per FM Previous Unit',                                                                                   status: 'MISSING', dateUpdated: '' },
    { category: 'FINANCIAL',      label: 'Statement of Assets, Liabilities & Net Worth',      sublabel: 'SALN — latest copy',                            status: 'MISSING', dateUpdated: '' },
    { category: 'TAXATION',       label: 'Individual Income Tax Return (ITR)',                 sublabel: 'Latest filed ITR',                               status: 'MISSING', dateUpdated: '' },
    { category: 'TAXATION',       label: 'Photocopy of Tax Identification Card (TIN)',                                                                    status: 'MISSING', dateUpdated: '' },
    { category: 'IDENTIFICATION', label: '1 PC Latest 2x2 ID Picture',                        sublabel: 'GOA Type A Uniform',                            status: 'MISSING', dateUpdated: '' },
  ]
}

// ── Category labels ───────────────────────────
export const CATEGORY_LABELS: Record<string, string> = {
  PERSONAL_DATA:  'Personal Data Sheet',
  CIVIL_DOCUMENTS:'Civil Documents',
  ACADEMIC:       'Academic Records',
  ELIGIBILITY:    'Eligibilities',
  ASSIGNMENTS:    'Assignment & Service Records',
  SPECIAL_ORDERS: 'Appointment / Special Orders',
  TRAINING:       'Training & Seminars',
  AWARDS:         'Awards & Commendations',
  PROMOTIONS:     'Promotions & Demotions',
  FIREARMS:       'Firearms Records',
  MEDICAL:        'Medical Records',
  CASES:          'Cases & Offenses',
  LEAVE:          'Leave Records',
  PAY_RECORDS:    'Pay Records',
  FINANCIAL:      'Financial Disclosures',
  TAXATION:       'Tax Documents',
  IDENTIFICATION: 'Identification',
}

// ── CRUD Functions ────────────────────────────

/**
 * Create a new Personnel 201 record with blank checklist documents.
 * Now accepts status, inactiveReason, separatedReason, dateOfSeparation.
 */
export async function createPersonnel201(
  input: CreatePersonnel201Input
): Promise<Personnel201 | null> {
  const today = new Date().toISOString().split('T')[0]
  const id    = `p201-${Date.now()}`

  const checklist = blankChecklist()
  const documents: Doc201Item[] = checklist.map((d, i) => ({
    ...d,
    id: `${id}-doc-${i + 1}`,
  }))

  const effectiveStatus = input.status ?? 'In Service'

  const newRecord: Personnel201 & {
    inactiveReason?: string
    separatedReason?: string
    dateOfSeparation?: string
  } = {
    id,
    name:            input.name,
    rank:            input.rank,
    serialNo:        input.serialNo,
    unit:            input.unit,
    initials:        input.initials,
    avatarColor:     input.avatarColor,
    dateCreated:     today,
    lastUpdated:     today,
    status:          effectiveStatus,
    inactiveReason:  input.inactiveReason,
    separatedReason: input.separatedReason,
    dateOfSeparation: input.dateOfSeparation,
    documents,
  }

  try {
    // Build the DB row — only include reason/date columns when relevant
    const dbRow: Record<string, unknown> = {
      id:           newRecord.id,
      name:         newRecord.name,
      rank:         newRecord.rank,
      serial_no:    newRecord.serialNo,
      unit:         newRecord.unit,
      initials:     newRecord.initials,
      avatar_color: newRecord.avatarColor,
      date_created: newRecord.dateCreated,
      last_updated: newRecord.lastUpdated,
      status:       effectiveStatus,
      // Reason fields — null when not applicable
      inactive_reason:    effectiveStatus === 'Inactive'               ? (input.inactiveReason  ?? null) : null,
      separated_reason:   effectiveStatus === 'Separated from Service' ? (input.separatedReason ?? null) : null,
      date_of_separation: effectiveStatus === 'Separated from Service' ? (input.dateOfSeparation ?? today) : null,
      archived:           false,
    }

    const { error: personnelError } = await supabase
      .from('personnel_201')
      .insert(dbRow)

    if (personnelError) {
      console.warn('Supabase insert personnel warning:', personnelError.message)
      // Return in-memory record even if DB fails
      return newRecord
    }

    // Insert all 24 blank checklist documents
    const docsToInsert = documents.map(d => ({
      id:           d.id,
      personnel_id: newRecord.id,
      category:     d.category,
      label:        d.label,
      sublabel:     d.sublabel ?? null,
      status:       d.status,
      date_updated: null,
      filed_by:     null,
      file_size:    null,
      file_url:     null,
      remarks:      null,
    }))

    const { error: docsError } = await supabase
      .from('personnel_201_docs')
      .insert(docsToInsert)

    if (docsError) {
      console.warn('Supabase insert docs warning:', docsError.message)
    }
  } catch (e) {
    console.warn('Supabase unavailable, using local data:', e)
  }

  return newRecord
}

/**
 * Update a single Doc201Item's status in Supabase.
 */
export async function updateDoc201Status(
  docId: string,
  status: Doc201Status,
  filedBy: string
): Promise<void> {
  const today = new Date().toISOString().split('T')[0]
  try {
    const { error } = await supabase
      .from('personnel_201_docs')
      .update({ status, filed_by: filedBy, date_updated: today })
      .eq('id', docId)
    if (error) console.warn('updateDoc201Status warning:', error.message)
  } catch (e) {
    console.warn('Supabase unavailable:', e)
  }
}

/**
 * Upload a file for a Doc201Item to Supabase Storage.
 * Returns the public URL on success, or null on failure.
 */
export async function uploadDoc201File(
  docId: string,
  file: File,
  filedBy: string
): Promise<string | null> {
  try {
    const fileName = `201-docs/${docId}-${Date.now()}-${file.name.replace(/\s+/g, '_')}`
    const { data: storageData, error: storageError } = await supabase.storage
      .from('documents')
      .upload(fileName, file, { cacheControl: '3600', upsert: false })

    if (storageError) {
      console.warn('uploadDoc201File storage error:', storageError.message)
      return null
    }

    const { data: urlData } = supabase.storage
      .from('documents')
      .getPublicUrl(storageData.path)

    const today    = new Date().toISOString().split('T')[0]
    const fileSize = (file.size / 1024 / 1024).toFixed(1) + ' MB'

    const { error: updateError } = await supabase
      .from('personnel_201_docs')
      .update({
        status:       'COMPLETE',
        filed_by:     filedBy,
        date_updated: today,
        file_url:     urlData.publicUrl,
        file_size:    fileSize,
      })
      .eq('id', docId)

    if (updateError) console.warn('uploadDoc201File update error:', updateError.message)

    return urlData.publicUrl
  } catch (e) {
    console.warn('uploadDoc201File error:', e)
    return null
  }
}

/**
 * Delete a Personnel 201 record from Supabase.
 */
export async function deletePersonnel201(id: string): Promise<void> {
  try {
    await supabase.from('personnel_201_docs').delete().eq('personnel_id', id)
    const { error } = await supabase.from('personnel_201').delete().eq('id', id)
    if (error) console.warn('deletePersonnel201 warning:', error.message)
  } catch (e) {
    console.warn('Supabase unavailable:', e)
  }
}

// Keep PERSONNEL_201 export as empty array (no more dummy data)
export const PERSONNEL_201: Personnel201[] = []