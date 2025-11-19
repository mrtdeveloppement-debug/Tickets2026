const normalizeValue = (value) => (value ?? '').toString().trim()

const normalizeCode = (code) => normalizeValue(code).toUpperCase()

const normalizeName = (name) =>
  normalizeValue(name)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

const NKC_CODES = new Set(['NKC', '15'])
const NDB_CODES = new Set(['NDB', '08'])

const matchNouakchott = (name, code) => {
  const normalizedCode = normalizeCode(code)
  if (NKC_CODES.has(normalizedCode)) return true
  const normalizedName = normalizeName(name)
  return normalizedName.includes('nouakchott')
}

const matchNouadhibou = (name, code) => {
  const normalizedCode = normalizeCode(code)
  if (NDB_CODES.has(normalizedCode)) return true
  const normalizedName = normalizeName(name)
  const compactName = normalizedName.replace(/\s+/g, '')
  return (
    compactName.includes('nouadhibou') ||
    compactName.includes('nouahdibou') ||
    compactName.replace(/h/g, '').includes('nouadibou')
  )
}

export const formatWilayaName = (wilayaName, wilayaCode) => {
  if (matchNouakchott(wilayaName, wilayaCode)) return 'NKC'
  if (matchNouadhibou(wilayaName, wilayaCode)) return 'NDB'
  const trimmedName = normalizeValue(wilayaName)
  if (trimmedName) return trimmedName
  const normalizedCode = normalizeCode(wilayaCode)
  return normalizedCode || 'Non spécifié'
}

export const formatTicketWilaya = (ticket) => formatWilayaName(ticket?.wilayas?.name_fr, ticket?.wilaya_code)

export const isTicketInNouakchott = (ticket) => matchNouakchott(ticket?.wilayas?.name_fr, ticket?.wilaya_code)

export const requiresRegionSelection = (wilayaName, wilayaCode) => matchNouakchott(wilayaName, wilayaCode)


