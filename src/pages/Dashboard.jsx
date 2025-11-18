import React, { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getOverdueTicketsCount, checkAndUpdateOverdueTickets } from '../utils/ticketStatus'
import { 
  Ticket, 
  CheckCircle, 
  Clock, 
  AlertCircle,
  TrendingUp,
  RefreshCw,
  Search,
  X,
  Settings
} from 'lucide-react'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js'
import { Bar, Pie } from 'react-chartjs-2'

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
)

// Plugin pour afficher les valeurs au-dessus des barres
const valueLabelPlugin = {
  id: 'valueLabel',
  afterDatasetsDraw(chart, args, pluginOptions) {
    const { ctx } = chart
    chart.data.datasets.forEach((dataset, datasetIndex) => {
      const meta = chart.getDatasetMeta(datasetIndex)
      meta.data.forEach((bar, index) => {
        const value = dataset.data[index]
        if (value == null || value === 0) return
        
        // Get the bar position and dimensions
        const x = bar.x
        const y = bar.y
        const height = bar.height
        const width = bar.width
        
        ctx.save()
        ctx.fillStyle = '#fff' // White text
        ctx.font = 'bold 11px sans-serif' // Bold font
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        // Draw text in the middle of the bar
        ctx.fillText(String(value), x, y + height / 2)
        ctx.restore()
      })
    })
  }

}

ChartJS.register(valueLabelPlugin)

export default function Dashboard() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchInput, setSearchInput] = useState('')
  const searchInputRef = useRef(null)
  const searchSelectionRef = useRef({ start: 0, end: 0 })
  const [dashboardCategory, setDashboardCategory] = useState('reclamation')
  const [timeRange, setTimeRange] = useState('all')
  const [stats, setStats] = useState({
    total: 0,
    open: 0,
    closed: 0,
    late: 0,
    assigned: 0,
    payment: 0,
    inProgress: 0,
    unreachable: 0,
    optimisation: 0
  })
  const [wilayaData, setWilayaData] = useState([])
  const [regionData, setRegionData] = useState([])
  const [serviceData, setServiceData] = useState([])
  const [recentTickets, setRecentTickets] = useState([])
  const [loading, setLoading] = useState(true)
  
  // New chart states for open tickets analysis
  const [openTickets, setOpenTickets] = useState([])
  const [serviceDelayData, setServiceDelayData] = useState({})
  const [creationDateData, setCreationDateData] = useState([])
  const [lateTicketsByDays, setLateTicketsByDays] = useState([])
  const [sawiByRegion, setSawiByRegion] = useState([])
  const [lateSawiByRegion, setLateSawiByRegion] = useState([])
  const [lateSawiNkcByZone, setLateSawiNkcByZone] = useState([])
  const [sawiNkcByZone, setSawiNkcByZone] = useState([])
  const [overdueCount, setOverdueCount] = useState(0)
  const [updatingOverdue, setUpdatingOverdue] = useState(false)
  const [installStats, setInstallStats] = useState({ total: 0, byStatus: {} })
  const [installStatusOverrideById, setInstallStatusOverrideById] = useState({})
  const [installOverdueCount, setInstallOverdueCount] = useState(0)

  const INSTALLATION_STATUSES = ['matériel','équipe_installation','installé','annulé','injoignable','installation_impossible','optimisation','extension','manque_de_materiel']

  const mapAllowedToInstallStatus = (status) => {
    switch (String(status)) {
      case 'assigné':
        return 'matériel'
      case 'en_cours':
        return 'équipe_installation'
      case 'fermé':
        return 'installé'
      case 'optimisation':
        return 'optimisation'
      case 'injoignable':
        return 'injoignable'
      default:
        return 'matériel'
    }
  }

  const getInstallationStatus = (ticket) => {
    const over = installStatusOverrideById[ticket.id]
    if (over) return over
    const raw = ticket.installation_status
    const has = raw && String(raw).trim() !== ''
    if (has) return String(raw)
    return mapAllowedToInstallStatus(ticket.status || '')
  }

  const normalizeStatus = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_')

  const isInstallationOverdue = (ticket) => {
    try {
      const hours = Math.floor((new Date() - new Date(ticket.created_at)) / (1000 * 60 * 60))
      const inst = normalizeStatus(getInstallationStatus(ticket))
      const overdueStatuses = new Set(['materiel', 'equipe_installation', 'optimisation', 'extension', 'manque_de_materiel'])
      return hours >= 24 && overdueStatuses.has(inst)
    } catch (e) {
      return false
    }
  }

  useEffect(() => {
    loadDashboardData()
  }, [timeRange, dashboardCategory])

  const loadDashboardData = async () => {
    try {
      const now = new Date()
      const from = new Date(now)
      if (timeRange === 'day') from.setDate(now.getDate() - 1)
      else if (timeRange === 'month') from.setMonth(now.getMonth() - 1)
      else if (timeRange === 'year') from.setFullYear(now.getFullYear() - 1)
      const fromIso = from.toISOString()
      let query = supabase
        .from('tickets')
        .select('*, wilayas(name_fr), regions(name_fr)')
        .order('created_at', { ascending: false })
      if (timeRange !== 'all') {
        query = query.gte('created_at', fromIso)
      }
      const { data: tickets, error } = await query

      if (error) throw error

      let baseTickets = (tickets || []).filter(t => (
        dashboardCategory === 'installation'
          ? (t.category === 'installation' || !!t.installation_status || t.complaint_type == null)
          : (t.category === 'reclamation' || (t.category == null && t.complaint_type != null))
      ))

      let histIds = new Set()
      if ((tickets || []).length > 0) {
        const ids = (tickets || []).map(t => t.id)
        const { data: hist } = await supabase
          .from('ticket_history')
          .select('ticket_id, to_status, action, created_at')
          .in('ticket_id', ids)
          .eq('action', 'installation_status_change')
          .order('created_at', { ascending: false })
        const map = {}
        for (const h of (hist || [])) {
          if (!map[h.ticket_id]) {
            map[h.ticket_id] = h.to_status || 'matériel'
          }
          histIds.add(h.ticket_id)
        }
        setInstallStatusOverrideById(map)
      } else {
        setInstallStatusOverrideById({})
      }

      if (dashboardCategory === 'installation' && histIds.size > 0) {
        baseTickets = (tickets || []).filter(t => (
          t.category === 'installation' || histIds.has(t.id) || !!t.installation_status || t.complaint_type == null
        ))
      }

      // Calculate stats
      const total = baseTickets.length
      const open = baseTickets.filter(t => t.status !== 'fermé').length
      const closed = baseTickets.filter(t => t.status === 'fermé').length
      const late = baseTickets.filter(t => t.status === 'en_retard').length
      const assigned = baseTickets.filter(t => t.status === 'assigné').length
      const payment = baseTickets.filter(t => t.status === 'paiement').length
      const inProgress = baseTickets.filter(t => t.status === 'en_cours').length
      const unreachable = baseTickets.filter(t => t.status === 'injoignable').length
      const optimisation = baseTickets.filter(t => t.status === 'optimisation').length

      setStats({ total, open, closed, late, assigned, payment, inProgress, unreachable, optimisation })

      // Load overdue tickets count
      await loadOverdueCount()

      // Group by wilaya
      const wilayaGroups = baseTickets.reduce((acc, ticket) => {
        const wilaya = ticket.wilayas?.name_fr || ticket.wilaya_code
        acc[wilaya] = (acc[wilaya] || 0) + 1
        return acc
      }, {})
      setWilayaData(Object.entries(wilayaGroups))

      // Group by region (Nouakchott only) — accept both 'NKC' and '15'
      const nkcTickets = baseTickets.filter(t => t.wilaya_code === 'NKC' || t.wilaya_code === '15')
      const regionGroups = nkcTickets.reduce((acc, ticket) => {
        const region = ticket.regions?.name_fr || 'Non spécifié'
        acc[region] = (acc[region] || 0) + 1
        return acc
      }, {})
      setRegionData(Object.entries(regionGroups))

      // Group by service
      const serviceGroups = baseTickets.reduce((acc, ticket) => {
        acc[ticket.subscription_type] = (acc[ticket.subscription_type] || 0) + 1
        return acc
      }, {})
      setServiceData(Object.entries(serviceGroups))

      // Recent tickets
      setRecentTickets(baseTickets.slice(0, 5))

      // Installation stats (counts by installation_status)
      if (dashboardCategory === 'installation') {
        const byStatus = {}
        baseTickets.forEach(t => {
          const s = getInstallationStatus(t)
          byStatus[s] = (byStatus[s] || 0) + 1
        })
        const overdueCount = baseTickets.filter(isInstallationOverdue).length
        setInstallStats({ total: baseTickets.length, byStatus })
        setInstallOverdueCount(overdueCount)
      } else {
        setInstallStats({ total: 0, byStatus: {} })
        setInstallOverdueCount(0)
      }

      // ========== NEW CHARTS FOR OPEN TICKETS ==========
      // Filter for open tickets only (not closed)
      const openTicketsOnly = baseTickets.filter(t => t.status !== 'fermé')
      setOpenTickets(openTicketsOnly)

      // Chart 1: General situation by service and delay (ALL open tickets)
      const serviceDelayGroups = {}
      openTicketsOnly.forEach(ticket => {
        const service = ticket.subscription_type || 'Autre'
        if (!serviceDelayGroups[service]) {
          serviceDelayGroups[service] = { total: 0, late: 0 }
        }
        serviceDelayGroups[service].total++
        if (ticket.status === 'en_retard') {
          serviceDelayGroups[service].late++
        }
      })
      setServiceDelayData(serviceDelayGroups)

      // Chart 2: Tickets by creation date (open tickets)
      const creationDateGroups = {}
      openTicketsOnly.forEach(ticket => {
        const date = new Date(ticket.created_at).toLocaleDateString('fr-FR')
        creationDateGroups[date] = (creationDateGroups[date] || 0) + 1
      })
      const sortedDates = Object.entries(creationDateGroups)
        .sort((a, b) => new Date(b[0]) - new Date(a[0])) // Sort descending: newest first (right to left)
        .slice(-10) // Last 10 days
      setCreationDateData(sortedDates)

      // Chart 3: Tickets by number of days (ALL open tickets)
      const lateByDaysCount = {}
      openTicketsOnly.forEach(ticket => {
        const createdDate = new Date(ticket.created_at)
        const now = new Date()
        const daysLate = Math.floor((now - createdDate) / (1000 * 60 * 60 * 24))
        lateByDaysCount[daysLate] = (lateByDaysCount[daysLate] || 0) + 1
      })
      const sortedByDays = Object.entries(lateByDaysCount)
        .map(([days, count]) => [Number(days), count])
        .sort((a, b) => b[0] - a[0]) // Sort by days descending (highest to lowest, right to left)
      setLateTicketsByDays(sortedByDays)

      // Helper function to map wilaya names to codes
      const mapWilayaName = (name) => {
        const mapping = {
          'Nouakchott': 'NKC',
          'Nouadhibou': 'NDB'
        }
        return mapping[name] || name
      }

      // Chart 4: SAWI tickets by wilaya/region (ALL open SAWI tickets)
      const sawiTickets = openTicketsOnly.filter(t => t.subscription_type === 'SAWI')
      const sawiRegionGroups = {}
      sawiTickets.forEach(ticket => {
        const wilaya = mapWilayaName(ticket.wilayas?.name_fr || ticket.wilaya_code || 'Non spécifié')
        sawiRegionGroups[wilaya] = (sawiRegionGroups[wilaya] || 0) + 1
      })
      setSawiByRegion(Object.entries(sawiRegionGroups))

      // Chart 5: Late SAWI tickets by wilaya/region (open late tickets with allowed statuses)
      const lateSawiTickets = sawiTickets.filter(t => t.status === 'en_retard')
      const lateSawiRegionGroups = {}
      lateSawiTickets.forEach(ticket => {
        const wilaya = mapWilayaName(ticket.wilayas?.name_fr || ticket.wilaya_code || 'Non spécifié')
        lateSawiRegionGroups[wilaya] = (lateSawiRegionGroups[wilaya] || 0) + 1
      })
      setLateSawiByRegion(Object.entries(lateSawiRegionGroups))

      // Chart 7: SAWI tickets in NKC by zone (open SAWI NKC tickets with allowed statuses)
      const sawiNkcTickets = sawiTickets.filter(t => t.wilaya_code === 'NKC' || t.wilaya_code === '15')
      const sawiNkcZoneGroups = {}
      sawiNkcTickets.forEach(ticket => {
        const zone = ticket.regions?.name_fr || 'Non spécifié'
        sawiNkcZoneGroups[zone] = (sawiNkcZoneGroups[zone] || 0) + 1
      })
      setSawiNkcByZone(Object.entries(sawiNkcZoneGroups))

      // Chart 6: Late SAWI tickets in NKC by zone (open late SAWI NKC tickets with allowed statuses)
      const lateSawiNkcTickets = lateSawiTickets.filter(t => t.wilaya_code === 'NKC' || t.wilaya_code === '15')
      const lateSawiNkcZoneGroups = {}
      lateSawiNkcTickets.forEach(ticket => {
        const zone = ticket.regions?.name_fr || 'Non spécifié'
        lateSawiNkcZoneGroups[zone] = (lateSawiNkcZoneGroups[zone] || 0) + 1
      })
      setLateSawiNkcByZone(Object.entries(lateSawiNkcZoneGroups))

    } catch (error) {
      console.error('Error loading dashboard:', error)
    } finally {
      setLoading(false)
    }
  }

  // Function to manually update overdue tickets
  const handleUpdateOverdueTickets = async () => {
    setUpdatingOverdue(true)
    try {
      const result = await checkAndUpdateOverdueTickets()
      if (result.success) {
        // Refresh the dashboard data
        await loadDashboardData()
        alert(t('dashboard.overdueTicketsUpdated'))
      } else {
        alert(t('common.error') + ': ' + result.error)
      }
    } catch (error) {
      console.error('Error updating overdue tickets:', error)
      alert(t('common.error'))
    } finally {
      setUpdatingOverdue(false)
    }
  }

  // Function to get overdue tickets count
  const loadOverdueCount = async () => {
    try {
      const result = await getOverdueTicketsCount()
      if (result.success) {
        setOverdueCount(result.count)
      }
    } catch (error) {
      console.error('Error loading overdue count:', error)
    }
  }

  // Load overdue count on component mount
  useEffect(() => {
    loadOverdueCount()
  }, [])

  const statCards = [
    { 
      label: t('dashboard.total'), 
      value: stats.total, 
      icon: Ticket, 
      color: 'bg-blue-500',
      statusParam: null
    },
    { 
      label: t('dashboard.open'), 
      value: stats.open, 
      icon: TrendingUp, 
      color: 'bg-green-500',
      statusParam: null
    },
    { 
      label: t('dashboard.closed'), 
      value: stats.closed, 
      icon: CheckCircle, 
      color: 'bg-gray-500',
      statusParam: 'fermé'
    },
    { 
      label: t('dashboard.late'), 
      value: stats.late, 
      icon: AlertCircle, 
      color: 'bg-red-500',
      statusParam: 'en_retard'
    },
    { 
      label: t('status.assigné'), 
      value: stats.assigned, 
      icon: Clock, 
      color: 'bg-yellow-500',
      statusParam: 'assigné'
    },
    { 
      label: t('status.paiement'), 
      value: stats.payment, 
      icon: AlertCircle, 
      color: 'bg-orange-500',
      statusParam: 'paiement'
    },
    { 
      label: t('status.en_cours'), 
      value: stats.inProgress, 
      icon: Clock, 
      color: 'bg-indigo-500',
      statusParam: 'en_cours'
    },
    { 
      label: t('status.injoignable'), 
      value: stats.unreachable, 
      icon: AlertCircle, 
      color: 'bg-purple-500',
      statusParam: 'injoignable'
    },
    { 
      label: t('status.optimisation'), 
      value: stats.optimisation, 
      icon: Settings, 
      color: 'bg-purple-600',
      statusParam: 'optimisation'
    },
  ]

  const installCards = [
    { label: 'Total', value: installStats.total, icon: Ticket, color: 'bg-blue-500', statusParam: null },
    { label: t('dashboard.late') || 'En retard', value: installOverdueCount, icon: AlertCircle, color: 'bg-red-500', statusParam: 'en_retard' },
    ...INSTALLATION_STATUSES.map(s => ({
      label: s,
      value: installStats.byStatus[s] || 0,
      icon: Clock,
      color: 'bg-gray-600',
      statusParam: s
    }))
  ]

  const wilayaChartData = {
    labels: wilayaData.map(([name]) => name),
    datasets: [{
      label: t('dashboard.byWilaya'),
      data: wilayaData.map(([, count]) => count),
      backgroundColor: '#FFD700',
    }]
  }

  const serviceChartData = {
    labels: serviceData.map(([name]) => name),
    datasets: [{
      data: serviceData.map(([, count]) => count),
      backgroundColor: ['#22AA66', '#2bc47a', '#1a8850', '#15704a'],
    }]
  }

  const regionChartData = {
    labels: regionData.map(([name]) => name),
    datasets: [{
      label: t('dashboard.byRegion') || 'Par zone (Nouakchott)',
      data: regionData.map(([, count]) => count),
      backgroundColor: '#006400',
    }]
  }

  
  const lateTicketsByDaysSorted = [...lateTicketsByDays].sort((a, b) => b[1] - a[1])
  const sawiByRegionSorted = [...sawiByRegion].sort((a, b) => b[1] - a[1])
  const lateSawiByRegionSorted = [...lateSawiByRegion].sort((a, b) => b[1] - a[1])
  const lateSawiNkcByZoneSorted = [...lateSawiNkcByZone].sort((a, b) => b[1] - a[1])
  const sawiNkcByZoneSorted = [...sawiNkcByZone].sort((a, b) => b[1] - a[1])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-gray-600">{t('common.loading')}</p>
        </div>
      </div>
    )
  }

  class ErrorBoundary extends React.Component {
    constructor(props) {
      super(props)
      this.state = { hasError: false }
    }
    static getDerivedStateFromError() {
      return { hasError: true }
    }
    render() {
      if (this.state.hasError) {
        return (
          <div className="p-6 text-center">
            <p className="text-red-600">Une erreur s'est produite sur le tableau de bord.</p>
          </div>
        )
      }
      return this.props.children
    }
  }

  return (
    <ErrorBoundary>
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {(!location.pathname.includes('reclamation')) && (
            <>
              <button onClick={() => setDashboardCategory('reclamation')} className={`px-3 py-1 rounded-full border ${dashboardCategory==='reclamation'?'bg-primary text-white border-primary':'bg-white text-gray-700 border-gray-300'}`}>Réclamations</button>
              <button onClick={() => setDashboardCategory('installation')} className={`px-3 py-1 rounded-full border ${dashboardCategory==='installation'?'bg-primary text-white border-primary':'bg-white text-gray-700 border-gray-300'}`}>Installations</button>
            </>
          )}
          <button onClick={() => setTimeRange('day')} className={`px-3 py-1 rounded-full border ${timeRange==='day'?'bg-primary text-white border-primary':'bg-white text-gray-700 border-gray-300'}`}>Jours</button>
          <button onClick={() => setTimeRange('month')} className={`px-3 py-1 rounded-full border ${timeRange==='month'?'bg-primary text-white border-primary':'bg-white text-gray-700 border-gray-300'}`}>Mois</button>
          <button onClick={() => setTimeRange('year')} className={`px-3 py-1 rounded-full border ${timeRange==='year'?'bg-primary text-white border-primary':'bg-white text-gray-700 border-gray-300'}`}>Année</button>
          <button onClick={() => setTimeRange('all')} className={`px-3 py-1 rounded-full border ${timeRange==='all'?'bg-primary text-white border-primary':'bg-white text-gray-700 border-gray-300'}`}>Voir tout</button>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            <input
              ref={searchInputRef}
              type="text"
              value={searchInput}
              onChange={(e) => {
                try {
                  searchSelectionRef.current.start = e.target.selectionStart || 0
                  searchSelectionRef.current.end = e.target.selectionEnd || 0
                } catch (err) {
                  searchSelectionRef.current.start = searchSelectionRef.current.end = 0
                }
                setSearchInput(e.target.value)
                setTimeout(() => {
                  try {
                    const el = searchInputRef.current
                    if (el) {
                      el.focus()
                      el.setSelectionRange(searchSelectionRef.current.start, searchSelectionRef.current.end)
                    }
                  } catch (e) {}
                }, 0)
              }}
              onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/tickets?category=${dashboardCategory}&q=${encodeURIComponent(searchInput)}`) }}
              placeholder={t('ticket.search')}
              className="w-full pl-10 pr-10 py-3 rounded-full bg-white shadow border border-gray-200 focus:ring-2 focus:ring-primary focus:outline-none"
            />
            {searchInput && (
              <button
                onClick={() => setSearchInput('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X size={18} />
              </button>
            )}
          </div>
          <button
            onClick={() => navigate(`/tickets?category=${dashboardCategory}&q=${encodeURIComponent(searchInput)}`)}
            className="px-4 py-2 rounded-full bg-primary text-white hover:bg-primary-dark"
          >
            Rechercher
          </button>
        </div>
      </div>
      

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {(dashboardCategory === 'installation' ? installCards : statCards).map((stat, index) => (
          <button
            key={index}
            className="bg-white rounded-lg shadow-md p-6 text-left hover:bg-gray-50"
            onClick={() => {
              if (stat.statusParam) {
                if (dashboardCategory === 'installation') {
                  if (stat.statusParam === 'en_retard') {
                    navigate(`/tickets?category=installation&overdue=24`)
                  } else {
                    navigate(`/tickets?category=installation&install_status=${encodeURIComponent(stat.statusParam)}`)
                  }
                } else {
                  navigate(`/tickets?category=reclamation&status=${encodeURIComponent(stat.statusParam)}`)
                }
              } else {
                navigate(`/tickets?category=${dashboardCategory}`)
              }
            }}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">{stat.label}</p>
                <p className="text-3xl font-bold text-gray-800 mt-2">{stat.value || 0}</p>
              </div>
              <div className={`${stat.color} p-3 rounded-lg`}>
                <stat.icon className="text-white" size={24} />
              </div>
            </div>
          </button>
        ))}
      </div>

      

      {/* Charts */}

      {/* NEW CHARTS - OPEN TICKETS ANALYSIS */}
      <div className="space-y-6 mt-8">
        

        {/* Row 1: Chart 1 & 2 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Chart 1: Service + Delay */}
          <div className="bg-gradient-to-br from-white to-gray-50 rounded-xl shadow-lg hover:shadow-xl transition-shadow p-6 border border-gray-100">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold text-gray-900">
                  Graph 1: Situation par Service et Retard
                </h3>
                <p className="text-xs text-gray-500 mt-1">Comparaison total vs retard</p>
              </div>
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <span className="text-lg">📈</span>
              </div>
            </div>
            {Object.keys(serviceDelayData).length > 0 ? (
              <div style={{ height: '350px' }}>
                <Bar
                  data={{
                    labels: Object.keys(serviceDelayData),
                    datasets: [
                      {
                        label: 'Total',
                        data: Object.values(serviceDelayData).map(d => d.total),
                      },
                      {
                        label: 'En Retard',
                        data: Object.values(serviceDelayData).map(d => d.late),
                        backgroundColor: '#dc2626',
                      }
                    ]
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: { position: 'bottom', labels: { font: { size: 11, weight: 500 } } },
                      valueLabel: { color: '#fff', font: 'bold 11px sans-serif' }
                    },
                    scales: { y: { beginAtZero: true, ticks: { stepSize: 1, precision: 0, font: { size: 11 } } } }
                  }}
                />
              </div>
            ) : (
              <p className="text-gray-500 text-sm text-center py-8">Aucune donnée disponible</p>
            )}
          </div>

          {/* Chart 2: Creation Date */}
          <div className="bg-gradient-to-br from-white to-gray-50 rounded-xl shadow-lg hover:shadow-xl transition-shadow p-6 border border-gray-100">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold text-gray-900">
                  Graph 2: Tickets par Date de Création
                </h3>
                <p className="text-xs text-gray-500 mt-1">Derniers 10 jours</p>
              </div>
              <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                <span className="text-lg">📅</span>
              </div>
            </div>
            {creationDateData.length > 0 ? (
              <div style={{ height: '350px' }}>
                <Bar
                  data={{
                    labels: creationDateData.map(([date]) => date),
                    datasets: [{
                      label: 'Tickets Créés',
                      data: creationDateData.map(([, count]) => count),
                      backgroundColor: '#ff7f50',
                    }]
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: { position: 'bottom', labels: { font: { size: 11, weight: 500 } } },
                      valueLabel: { color: '#fff', font: 'bold 11px sans-serif' }
                    },
                    scales: { y: { beginAtZero: true, ticks: { stepSize: 1, precision: 0, font: { size: 11 } } } }
                  }}
                />
              </div>
            ) : (
              <p className="text-gray-500 text-sm text-center py-8">Aucune donnée disponible</p>
            )}
          </div>
        </div>

        {/* Row 2: Chart 4 - Late Tickets by Days (directly after Chart 2) */}
        <div className="grid grid-cols-1 lg:grid-cols-1 gap-6">
          {/* Chart 4: Late Tickets by Days */}
          <div className="bg-gradient-to-br from-white to-gray-50 rounded-xl shadow-lg hover:shadow-xl transition-shadow p-6 border border-gray-100">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold text-gray-900">
                  Graph 4: Tickets en Retard par Jours
                </h3>
                <p className="text-xs text-gray-500 mt-1">Distribution des retards</p>
              </div>
              <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                <span className="text-lg">⏰</span>
              </div>
            </div>
            {lateTicketsByDays.length > 0 ? (
              <div style={{ height: '350px' }}>
                <Bar
                  data={{
                    labels: lateTicketsByDaysSorted.map(([days]) => `${days} jour${days !== 1 ? 's' : ''}`),
                    datasets: [{
                      label: 'Nombre de Tickets',
                      data: lateTicketsByDaysSorted.map(([, count]) => count),
                      backgroundColor: lateTicketsByDaysSorted.map(([days]) => 
                        days === 0 ? '#22c55e' : '#ef4444'
                      ),
                    }]
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: { position: 'bottom', labels: { font: { size: 11, weight: 500 } } },
                      valueLabel: { color: '#fff', font: 'bold 11px sans-serif' }
                    },
                    scales: { y: { beginAtZero: true, ticks: { stepSize: 1, precision: 0, font: { size: 11 } } } }
                  }}
                />
              </div>
            ) : (
              <p className="text-gray-500 text-sm text-center py-8">Aucun ticket en retard</p>
            )}
          </div>
        </div>

        {/* Row 3: Chart 3 & 5 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Chart 3: SAWI NKC by Zone */}
          <div className="bg-gradient-to-br from-white to-gray-50 rounded-xl shadow-lg hover:shadow-xl transition-shadow p-6 border border-gray-100">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold text-gray-900">
                  Graph 3: SAWI NKC par Zone
                </h3>
                <p className="text-xs text-gray-500 mt-1">Répartition par zones de Nouakchott</p>
              </div>
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <span className="text-lg">🟦</span>
              </div>
            </div>
            {sawiNkcByZone.length > 0 ? (
              <div style={{ height: '350px' }}>
                <Bar
                  data={{
                    labels: sawiNkcByZoneSorted.map(([zone]) => zone),
                    datasets: [{
                      label: 'Tickets SAWI NKC',
                      data: sawiNkcByZoneSorted.map(([, count]) => count),
                      backgroundColor: '#2563eb',
                    }]
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: { position: 'bottom', labels: { font: { size: 11, weight: 500 } } },
                      valueLabel: { color: '#fff', font: 'bold 11px sans-serif' }
                    },
                    scales: { y: { beginAtZero: true, ticks: { stepSize: 1, precision: 0, font: { size: 11 } } } }
                  }}
                />
              </div>
            ) : (
              <p className="text-gray-500 text-sm text-center py-8">Aucun ticket SAWI NKC</p>
            )}
          </div>

          {/* Chart 5: SAWI by Region (Wilaya) */}
          <div className="bg-gradient-to-br from-white to-gray-50 rounded-xl shadow-lg hover:shadow-xl transition-shadow p-6 border border-gray-100">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold text-gray-900">
                  Graph 5: SAWI par Région
                </h3>
                <p className="text-xs text-gray-500 mt-1">Répartition géographique</p>
              </div>
              <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
                <span className="text-lg">🗺️</span>
              </div>
            </div>
            {sawiByRegion.length > 0 ? (
              <div style={{ height: '350px' }}>
                <Bar
                  data={{
                    labels: sawiByRegionSorted.map(([region]) => region),
                    datasets: [{
                      label: 'Tickets SAWI',
                      data: sawiByRegionSorted.map(([, count]) => count),
                      backgroundColor: '#ffbf00',
                    }]
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: { position: 'bottom', labels: { font: { size: 11, weight: 500 } } },
                      valueLabel: { color: '#111', font: 'bold 11px sans-serif' }
                    },
                    scales: { y: { beginAtZero: true, ticks: { stepSize: 1, precision: 0, font: { size: 11 } } } }
                  }}
                />
              </div>
            ) : (
              <p className="text-gray-500 text-sm text-center py-8">Aucun ticket SAWI</p>
            )}
          </div>
        </div>

        {/* Row 4: Chart 6 */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Chart 6: Late SAWI by Region (Wilaya) */}
          <div className="bg-gradient-to-br from-white to-gray-50 rounded-xl shadow-lg hover:shadow-xl transition-shadow p-6 border border-gray-100">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold text-gray-900">
                  Graph 6: SAWI en Retard par Région
                </h3>
                <p className="text-xs text-gray-500 mt-1">Tickets critiques par zone</p>
              </div>
              <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                <span className="text-lg">⚠️</span>
              </div>
            </div>
            {lateSawiByRegion.length > 0 ? (
              <div style={{ height: '350px' }}>
                <Bar
                  data={{
                    labels: lateSawiByRegionSorted.map(([region]) => region),
                    datasets: [{
                      label: 'Tickets SAWI en Retard',
                      data: lateSawiByRegionSorted.map(([, count]) => count),
                      backgroundColor: '#ef4444',
                    }]
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: { position: 'bottom', labels: { font: { size: 11, weight: 500 } } },
                      valueLabel: { color: '#fff', font: 'bold 11px sans-serif' }
                    },
                    scales: { y: { beginAtZero: true, ticks: { stepSize: 1, precision: 0, font: { size: 11 } } } }
                  }}
                />
              </div>
            ) : (
              <p className="text-gray-500 text-sm text-center py-8">Aucun ticket SAWI en retard</p>
            )}
          </div>
        </div>
      </div>

      {/* Row 4: Chart 7 */}
      <div className="grid grid-cols-1 lg:grid-cols-1 gap-6">
        {/* Chart 7: Late SAWI NKC by Zone */}
        <div className="bg-gradient-to-br from-white to-gray-50 rounded-xl shadow-lg hover:shadow-xl transition-shadow p-6 border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-bold text-gray-900">
                Graph 7: SAWI NKC en Retard par Zone
              </h3>
              <p className="text-xs text-gray-500 mt-1">Zones Nouakchott en retard</p>
            </div>
            <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
              <span className="text-lg">🚨</span>
            </div>
          </div>
          {lateSawiNkcByZone.length > 0 ? (
            <div style={{ height: '350px' }}>
              <Bar
                data={{
                  labels: lateSawiNkcByZoneSorted.map(([zone]) => zone),
                  datasets: [{
                    label: 'Tickets SAWI NKC en Retard',
                    data: lateSawiNkcByZoneSorted.map(([, count]) => count),
                    backgroundColor: '#ef4444',
                  }]
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: { position: 'bottom', labels: { font: { size: 11, weight: 500 } } },
                    valueLabel: { color: '#fff', font: 'bold 11px sans-serif' }
                  },
                  scales: { y: { beginAtZero: true, ticks: { stepSize: 1, precision: 0, font: { size: 11 } } } }
                }}
              />
            </div>
          ) : (
            <p className="text-gray-500 text-sm text-center py-8">Aucun ticket SAWI NKC en retard</p>
          )}
        </div>
      </div>

      {/* Recent Tickets */}
      <div className="bg-gradient-to-br from-white to-gray-50 rounded-xl shadow-lg border border-gray-100 p-6 mt-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-2 flex items-center gap-2">
          <span>📋</span>
          {t('dashboard.recentTickets')}
        </h2>
        <p className="text-gray-500 text-sm mb-4">Les 5 derniers tickets créés</p>
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  {t('ticket.number')}
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  {t('ticket.phone')}
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  {t('ticket.status')}
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  {t('ticket.createdAt')}
                </th>
              </tr>
            </thead>
            <tbody>
              {recentTickets.map((ticket) => (
                <tr key={ticket.id} className="border-b border-gray-100 hover:bg-blue-50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-blue-600 hover:text-blue-800">
                    <Link to={`/tickets/${ticket.id}`} className="hover:underline">{ticket.ticket_number}</Link>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {ticket.phone}
                    {ticket.client_name && (
                      <div className="text-xs text-gray-500 mt-1">{ticket.client_name}</div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-3 py-1 text-xs font-bold rounded-full ${
                      ticket.status === 'fermé' ? 'bg-gray-200 text-gray-800' :
                      ticket.status === 'en_retard' ? 'bg-red-200 text-red-800' :
                      ticket.status === 'en_cours' ? 'bg-blue-200 text-blue-800' :
                      ticket.status === 'assigné' ? 'bg-yellow-200 text-yellow-800' :
                      'bg-green-200 text-green-800'
                    }`}>
                      {t(`status.${ticket.status}`)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                    {new Date(ticket.created_at).toLocaleDateString('fr-FR')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
    </ErrorBoundary>
  )
}
