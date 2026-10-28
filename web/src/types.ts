export type Status = 'available' | 'in_use' | 'pending' | 'repair' | 'scrapped'

export interface Me {
  id: number
  username: string
  fullName: string
  isAdmin: boolean
  mustChangePassword: boolean
}

export interface AssetRow {
  id: number
  subCategoryId: number
  subCategoryName: string
  categoryName: string
  assetTag: string
  serialNumber: string
  model: string
  companyId: number | null
  companyName: string | null
  status: Status
  repairSince: string | null
  purchaseDate: string
  warrantyEnd: string
  invoiceNumber: string
  supplierName: string
  price: number
  employeeId: number | null
  employeeName: string | null
  deliveredAt: string | null
  signed: boolean
  signatureKind: 'drawn' | 'photo' | null
  disposalReason: string | null
  disposedAt: string | null
}

export interface CatalogSub {
  id: number
  name: string
  prefix: string
  defaultModel: string | null
  defaultWarrantyMonths: number
  nextTag: string
  activeCount: number
}

export interface CatalogCategory {
  id: number
  name: string
  icon: string
  subCategories: CatalogSub[]
}

export interface Counts {
  available: number
  inUse: number
  pending: number
  repair: number
  scrapped: number
  active: number
  value: number
}

export interface AuditItem {
  id: number
  at: string
  action: string
  text: string
  assetId: number | null
  subCategoryId?: number | null
  user: string | null
}

export interface Dashboard {
  totals: Counts
  categories: { id: number; name: string; icon: string; subCategories: { id: number; name: string; counts: Counts }[] }[]
  pending: AssetRow[]
  repair: AssetRow[]
  warrantySoon: AssetRow[]
  monthDisposals: { count: number; value: number; byReason: { reason: string; count: number }[] }
  recent: AuditItem[]
  today: string
}

export interface SubPage {
  id: number
  name: string
  prefix: string
  category: { id: number; name: string; icon: string }
  nextTag: string
  defaultModel: string | null
  defaultWarrantyMonths: number
  kpis: {
    active: number
    inUse: number
    pending: number
    available: number
    repair: number
    scrapped: number
    unitPrice: number | null
    value: number
    supplier: string | null
  }
  lastPurchase: { supplierName: string; unitPrice: number; purchaseDate: string; warrantyEnd: string } | null
  assets: AssetRow[]
}

export interface Company {
  id: number
  name: string
  companyNumber: string
}

export interface Employee {
  id: number
  employeeNumber: number | null
  fullName: string
  department: string | null
  isActive: boolean
  holding: number
  unsigned: number
}

export interface EmployeeLookup {
  id: number
  fullName: string
  department: string | null
  isActive: boolean
  signed: AssetRow[]
  pending: AssetRow[]
  signedValue: number
}

export interface AssetDetails {
  asset: AssetRow
  history: { id: number; employee: string; deliveredAt: string; returnedAt: string | null; signed: boolean; signatureKind: string | null }[]
  disposal: {
    reason: string
    description: string | null
    returnedToWarehouse: boolean
    disposedAt: string
    approver: string
    hasPhoto: boolean
    previousEmployee: string | null
  } | null
  log: { at: string; action: string; text: string; user: string | null }[]
}

/** בחירת עובד: קיים מהרשימה, או שם חדש שייווצר בשמירה. */
export type EmployeeChoice =
  | { employeeId: number; name: string }
  | { newEmployeeName: string; newEmployeeDepartment?: string; name: string }
