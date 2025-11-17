import { useEffect, useState, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Bar } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js'
import { supabase } from '../lib/supabase'
import { Wrench, Users, CheckCircle2, XCircle, PhoneOff, Ban, Settings, Search, X, GitBranch, PackageOpen, Clock } from 'lucide-react'

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend)

export default function InstallationDashboard() {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(true)
  const [serviceDelayData, setServiceDelayData] = useState({})
  const [lateByDays, setLateByDays] = useState([])
  const [sawiByRegion, setSawiByRegion] = useState([])
  const [lateSawiByRegion, setLateSawiByRegion] = useState([])
  const [installationTickets, setInstallationTickets] = useState([])
  const [timeRange, setTimeRange] = useState('all')
  const [statusCounts, setStatusCounts] = useState({})
  const [selectedStatus, setSelectedStatus] = useState('')
  const [installSearch, setInstallSearch] = useState('')
  const [installSearchInput, setInstallSearchInput] = useState('')
  const ticketsRef = useRef(null)
  const navigate = useNavigate()
  const normalizeKey = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_')
  const getCount = (k) => statusCounts[k] || 0

  const selectStatus = (status) => {
    setSelectedStatus(prev => (prev === status ? '' : status))
    navigate(`/tickets?category=installation&install_status=${encodeURIComponent(status)}`)
    if (ticketsRef.current) ticketsRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  const selectOverdue = () => {
    setSelectedStatus('')
    navigate(`/tickets?category=installation&overdue=48`)
    if (ticketsRef.current) ticketsRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  useEffect(() => {
    const loadData = async () => {
      try {
        const currentDate = new Date()
        const from = new Date(currentDate)
        if (timeRange === 'day') from.setDate(currentDate.getDate() - 1)
        else if (timeRange === 'month') from.setMonth(currentDate.getMonth() - 1)
        else if (timeRange === 'year') from.setFullYear(currentDate.getFullYear() - 1)
        const fromIso = from.toISOString()
        await supabase
          .from('tickets')
          .update({ category: 'installation' })
          .is('category', null)
          .is('complaint_type', null)

        await supabase
          .from('tickets')
          .update({ category: 'reclamation' })
          .is('category', null)
          .not('complaint_type', 'is', null)
        
        await supabase
          .from('tickets')
          .update({ category: 'installation' })
          .is('category', null)
          .not('installation_status', 'is', null)

        // Cleanup: recategorize any ticket with installation_status set but wrong category
        await supabase
          .from('tickets')
          .update({ category: 'installation' })
          .not('installation_status', 'is', null)
          .neq('category', 'installation')
        await supabase
          .from('tickets')
          .update({ installation_status: 'matériel', updated_at: new Date().toISOString() })
          .eq('category', 'installation')
          .or("installation_status.is.null,installation_status.eq.''")

        await supabase
          .from('tickets')
          .update({ installation_status: null, updated_at: new Date().toISOString() })
          .eq('category', 'reclamation')
          .not('installation_status', 'is', null)
        let query = supabase
          .from('tickets')
          .select('*, wilayas(name_fr), regions(name_fr)')
          .order('created_at', { ascending: false })
        if (timeRange !== 'all') {
          query = query.gte('created_at', fromIso)
        }
        const { data, error } = await query

        if (error) throw error
        const loaded = data || []
        const allInstallation = loaded.filter(t => (
          t.category === 'installation' ||
          (!!t.installation_status && String(t.installation_status).trim() !== '') ||
          t.complaint_type == null
        ))
        const needInit = allInstallation.filter(t => (!t.installation_status || String(t.installation_status).trim() === ''))
        if (needInit.length > 0) {
          await supabase
            .from('tickets')
            .update({ installation_status: 'matériel', updated_at: new Date().toISOString() })
            .in('id', needInit.map(t => t.id))
        }
        const normalized = allInstallation.map(t => {
          const inst = getInstallationStatus(t)
          return { ...t, installation_status: inst }
        })
        setInstallationTickets(normalized)

        const allInstallationNormalized = normalized
        const openTickets = allInstallationNormalized.filter(t => t.installation_status !== 'installé' && t.installation_status !== 'annulé')

        const serviceGroups = {}
        openTickets.forEach(ticket => {
          const s = ticket.subscription_type || 'Autre'
          if (!serviceGroups[s]) serviceGroups[s] = { total: 0, late: 0 }
          serviceGroups[s].total++
          const createdDate = new Date(ticket.created_at)
          const days = Math.floor((new Date() - createdDate) / (1000 * 60 * 60 * 24))
          if (days >= 1) serviceGroups[s].late++
        })
        setServiceDelayData(serviceGroups)

        const counts = {}
        normalized.forEach(t => {
          const s = normalizeKey(getInstallationStatus(t))
          counts[s] = (counts[s] || 0) + 1
        })
        setStatusCounts(counts)

        const lateByDaysCount = {}
        let overdue48Count = 0
        openTickets.forEach(ticket => {
          const createdDate = new Date(ticket.created_at)
          const days = Math.floor((new Date() - createdDate) / (1000 * 60 * 60 * 24))
          lateByDaysCount[days] = (lateByDaysCount[days] || 0) + 1
          const hours = Math.floor((new Date() - createdDate) / (1000 * 60 * 60))
          const inst = getInstallationStatus(ticket)
          if (hours >= 48 && (
            inst === 'matériel' ||
            inst === 'équipe_installation' ||
            inst === 'optimisation' ||
            inst === 'extension'
          )) {
            overdue48Count++
          }
        })
        const lateDaysArr = Object.entries(lateByDaysCount)
          .map(([d, c]) => [Number(d), c])
          .sort((a, b) => b[1] - a[1])
        setLateByDays(lateDaysArr)

        const sawiTickets = openTickets.filter(t => t.subscription_type === 'SAWI')
        const sawiRegionGroups = {}
        sawiTickets.forEach(ticket => {
          const wilaya = ticket.wilayas?.name_fr || ticket.wilaya_code || 'Non spécifié'
          sawiRegionGroups[wilaya] = (sawiRegionGroups[wilaya] || 0) + 1
        })
        setSawiByRegion(Object.entries(sawiRegionGroups))

        const lateSawiRegionGroups = {}
        sawiTickets.forEach(ticket => {
          const createdDate = new Date(ticket.created_at)
          const days = Math.floor((new Date() - createdDate) / (1000 * 60 * 60 * 24))
          if (days >= 1) {
            const wilaya = ticket.wilayas?.name_fr || ticket.wilaya_code || 'Non spécifié'
            lateSawiRegionGroups[wilaya] = (lateSawiRegionGroups[wilaya] || 0) + 1
          }
        })
        setLateSawiByRegion(Object.entries(lateSawiRegionGroups))
        setStatusCounts(prev => ({ ...prev, overdue48: overdue48Count }))

        const now = Date.now()
        for (const t of allInstallation) {
          const created = new Date(t.created_at).getTime()
          const hours = Math.floor((now - created) / (1000 * 60 * 60))
          let apply = false
          let toStatus = t.status
          let note = ''
          if (t.installation_status === 'matériel' && hours >= 48 && t.status !== 'en_retard') {
            apply = true
            toStatus = 'en_retard'
            note = 'retard matériel (>48h)'
          } else if (t.installation_status === 'matériel' && hours >= 24 && (!t.notes || !t.notes.includes('retard matériel'))) {
            apply = true
            note = 'retard matériel (>24h)'
          } else if (t.installation_status === 'équipe_installation' && hours >= 48 && t.status !== 'en_retard') {
            apply = true
            toStatus = 'en_retard'
            note = 'retard installation (>48h)'
          }
          if (apply) {
            await supabase
              .from('tickets')
              .update({
                status: toStatus,
                notes: t.notes ? `${t.notes}\n${note}` : note,
                updated_at: new Date().toISOString()
              })
              .eq('id', t.id)
          }
        }
      } catch (e) {
        console.error('Error loading installation dashboard:', e)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [timeRange])

  const sawiByRegionSorted = [...sawiByRegion].sort((a, b) => b[1] - a[1])
  const lateSawiByRegionSorted = [...lateSawiByRegion].sort((a, b) => b[1] - a[1])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button onClick={() => setTimeRange('day')} className={`px-3 py-1 rounded-full border ${timeRange==='day'?'bg-primary text-white border-primary':'bg-white text-gray-700 border-gray-300'}`}>Jours</button>
          <button onClick={() => setTimeRange('month')} className={`px-3 py-1 rounded-full border ${timeRange==='month'?'bg-primary text-white border-primary':'bg-white text-gray-700 border-gray-300'}`}>Mois</button>
          <button onClick={() => setTimeRange('year')} className={`px-3 py-1 rounded-full border ${timeRange==='year'?'bg-primary text-white border-primary':'bg-white text-gray-700 border-gray-300'}`}>Année</button>
          <button onClick={() => setTimeRange('all')} className={`px-3 py-1 rounded-full border ${timeRange==='all'?'bg-primary text-white border-primary':'bg-white text-gray-700 border-gray-300'}`}>Voir tout</button>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              value={installSearchInput}
              onChange={(e) => setInstallSearchInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/tickets?category=installation&q=${encodeURIComponent(installSearchInput)}`) }}
              placeholder="Rechercher..."
              className="w-full pl-10 pr-10 py-3 rounded-full bg-white shadow border border-gray-200 focus:ring-2 focus:ring-primary focus:outline-none"
            />
            {installSearch && (
              <button
                onClick={() => { setInstallSearch(''); setInstallSearchInput('') }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X size={18} />
              </button>
            )}
          </div>
          <button
            onClick={() => navigate(`/tickets?category=installation&q=${encodeURIComponent(installSearchInput)}`)}
            className="px-4 py-2 rounded-full bg-primary text-white hover:bg-primary-dark"
          >
            Rechercher
          </button>
        </div>
      </div>

      {/* Statuts Installation - 7 icônes + En retard ≥48h */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-4 flex items-center justify-between cursor-pointer" onClick={() => selectStatus('matériel')}>
          <div>
            <div className="text-sm text-gray-500">Matériel</div>
            <div className="text-2xl font-bold">{getCount('materiel')}</div>
          </div>
          <button className={`p-3 bg-blue-600 rounded-lg flex items-center justify-center ${selectedStatus==='matériel'?'ring-2 ring-blue-400':''}`}>
            <Wrench className="text-white" size={24} />
          </button>
        </div>
        <div className="bg-white rounded-lg shadow p-4 flex items-center justify-between cursor-pointer" onClick={() => selectStatus('équipe_installation')}>
          <div>
            <div className="text-sm text-gray-500">Équipe installation</div>
            <div className="text-2xl font-bold">{getCount('equipe_installation')}</div>
          </div>
          <button className={`p-3 bg-indigo-600 rounded-lg flex items-center justify-center ${selectedStatus==='équipe_installation'?'ring-2 ring-indigo-400':''}`}>
            <Users className="text-white" size={24} />
          </button>
        </div>
        <div className="bg-white rounded-lg shadow p-4 flex items-center justify-between cursor-pointer" onClick={selectOverdue}>
          <div>
            <div className="text-sm text-gray-500">En retard (≥48h)</div>
            <div className="text-2xl font-bold">{getCount('overdue48')}</div>
          </div>
          <button className={`p-3 bg-red-600 rounded-lg flex items-center justify-center`}>
            <Clock className="text-white" size={24} />
          </button>
        </div>
        <div className="bg-white rounded-lg shadow p-4 flex items-center justify-between cursor-pointer" onClick={() => selectStatus('installé')}>
          <div>
            <div className="text-sm text-gray-500">Installé</div>
            <div className="text-2xl font-bold">{getCount('installe')}</div>
          </div>
          <button className={`p-3 bg-green-600 rounded-lg flex items-center justify-center ${selectedStatus==='installé'?'ring-2 ring-green-400':''}`}>
            <CheckCircle2 className="text-white" size={24} />
          </button>
        </div>
        <div className="bg-white rounded-lg shadow p-4 flex items-center justify-between cursor-pointer" onClick={() => selectStatus('annulé')}>
          <div>
            <div className="text-sm text-gray-500">Annulé</div>
            <div className="text-2xl font-bold">{getCount('annule')}</div>
          </div>
          <button className={`p-3 bg-orange-600 rounded-lg flex items-center justify-center ${selectedStatus==='annulé'?'ring-2 ring-orange-400':''}`}>
            <XCircle className="text-white" size={24} />
          </button>
        </div>
        <div className="bg-white rounded-lg shadow p-4 flex items-center justify-between cursor-pointer" onClick={() => selectStatus('injoignable')}>
          <div>
            <div className="text-sm text-gray-500">Injoignable</div>
            <div className="text-2xl font-bold">{getCount('injoignable')}</div>
          </div>
          <button className={`p-3 bg-yellow-600 rounded-lg flex items-center justify-center ${selectedStatus==='injoignable'?'ring-2 ring-yellow-400':''}`}>
            <PhoneOff className="text-white" size={24} />
          </button>
        </div>
        <div className="bg-white rounded-lg shadow p-4 flex items-center justify-between cursor-pointer" onClick={() => selectStatus('installation_impossible')}>
          <div>
            <div className="text-sm text-gray-500">Installation Impossible</div>
            <div className="text-2xl font-bold">{getCount('installation_impossible')}</div>
          </div>
          <button className={`p-3 bg-red-600 rounded-lg flex items-center justify-center ${selectedStatus==='installation_impossible'?'ring-2 ring-red-400':''}`}>
            <Ban className="text-white" size={24} />
          </button>
        </div>
        <div className="bg-white rounded-lg shadow p-4 flex items-center justify-between cursor-pointer" onClick={() => selectStatus('optimisation')}>
          <div>
            <div className="text-sm text-gray-500">Optimisation</div>
            <div className="text-2xl font-bold">{getCount('optimisation')}</div>
          </div>
          <button className={`p-3 bg-purple-600 rounded-lg flex items-center justify-center ${selectedStatus==='optimisation'?'ring-2 ring-purple-400':''}`}>
            <Settings className="text-white" size={24} />
          </button>
        </div>
        <div className="bg-white rounded-lg shadow p-4 flex items-center justify-between cursor-pointer" onClick={() => selectStatus('manque_de_materiel')}>
          <div>
            <div className="text-sm text-gray-500">Manque de matériel</div>
            <div className="text-2xl font-bold">{getCount('manque_de_materiel')}</div>
          </div>
          <button className={`p-3 bg-rose-600 rounded-lg flex items-center justify-center ${selectedStatus==='manque_de_materiel'?'ring-2 ring-rose-400':''}`}>
            <PackageOpen className="text-white" size={24} />
          </button>
        </div>
        <div className="bg-white rounded-lg shadow p-4 flex items-center justify-between cursor-pointer" onClick={() => selectStatus('extension')}>
          <div>
            <div className="text-sm text-gray-500">Extension</div>
            <div className="text-2xl font-bold">{getCount('extension')}</div>
          </div>
          <button className={`p-3 bg-teal-600 rounded-lg flex items-center justify-center ${selectedStatus==='extension'?'ring-2 ring-teal-400':''}`}>
            <GitBranch className="text-white" size={24} />
          </button>
        </div>
      </div>

      
  
        {/* Graphs Row 1 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Graph 1: Situation par Service et Retard */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Graph 1: Situation par Service et Retard</h3>
          {Object.keys(serviceDelayData).length > 0 ? (
            <div style={{ height: '350px' }}>
              <Bar
                data={{
                  labels: Object.keys(serviceDelayData),
                  datasets: [
                    {
                      label: 'Total',
                      data: Object.values(serviceDelayData).map(d => d.total),
                      backgroundColor: '#2563eb',
                    },
                    {
                      label: 'En Retard',
                      data: Object.values(serviceDelayData).map(d => d.late),
                      backgroundColor: '#ef4444',
                    }
                  ]
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: { legend: { position: 'bottom' } },
                }}
              />
            </div>
          ) : (
            <p className="text-gray-500 text-sm">Aucune donnée disponible</p>
          )}
        </div>

        {/* Graph 2: Tickets en Retard par Jours */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Graph 2: Tickets en Retard par Jours</h3>
          {lateByDays.length > 0 ? (
            <div style={{ height: '350px' }}>
              <Bar
                data={{
                  labels: lateByDays.map(([days]) => `${days} jour${days !== 1 ? 's' : ''}`),
                  datasets: [{
                    label: 'Nombre de Tickets',
                    data: lateByDays.map(([, count]) => count),
                    backgroundColor: lateByDays.map(([days]) => days === 0 ? '#22c55e' : '#ef4444')
                  }]
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: { legend: { position: 'bottom' } },
                }}
              />
            </div>
          ) : (
            <p className="text-gray-500 text-sm">Aucun ticket en retard</p>
          )}
        </div>
        </div>

        {/* Graphs Row 2 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Graph 3: SAWI par Région */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Graph 3: SAWI par Région</h3>
          {sawiByRegion.length > 0 ? (
            <div style={{ height: '350px' }}>
              <Bar
                data={{
                  labels: sawiByRegionSorted.map(([region]) => region),
                  datasets: [{
                    label: 'Tickets SAWI',
                    data: sawiByRegionSorted.map(([, count]) => count),
                    backgroundColor: '#ffbf00'
                  }]
                }}
                options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }}
              />
            </div>
          ) : (
            <p className="text-gray-500 text-sm">Aucun ticket SAWI</p>
          )}
        </div>

        {/* Graph 4: SAWI en Retard par Région */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Graph 4: SAWI en Retard par Région</h3>
          {lateSawiByRegion.length > 0 ? (
            <div style={{ height: '350px' }}>
              <Bar
                data={{
                  labels: lateSawiByRegionSorted.map(([region]) => region),
                  datasets: [{
                    label: 'Tickets SAWI en Retard',
                    data: lateSawiByRegionSorted.map(([, count]) => count),
                    backgroundColor: '#ef4444'
                  }]
                }}
                options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }}
              />
            </div>
          ) : (
            <p className="text-gray-500 text-sm">Aucun ticket SAWI en retard</p>
          )}
        </div>
        </div>

      {/* Tickets récents */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <div className="px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">Tickets récents</h2>
        </div>
        <div className="overflow-x-auto" ref={ticketsRef}>
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">N° Ticket</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">N° d&apos;abonné</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Téléphone</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Région</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Zone</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type d&apos;abonnement</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Statut installation</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {(() => {
                const base = selectedStatus ? installationTickets.filter(t => normalizeKey(getInstallationStatus(t)) === normalizeKey(selectedStatus)) : installationTickets
                const s = (installSearch || '').toLowerCase()
                const filtered = s
                  ? base.filter(t => (
                      (t.ticket_number || '').toLowerCase().includes(s) ||
                      (t.subscriber_number || '').toLowerCase().includes(s) ||
                      (t.phone || '').toLowerCase().includes(s) ||
                      (t.wilayas?.name_fr || t.wilaya_code || '').toLowerCase().includes(s) ||
                      (t.regions?.name_fr || '').toLowerCase().includes(s) ||
                      (t.subscription_type || '').toLowerCase().includes(s)
                    ))
                  : base
                const limited = selectedStatus ? filtered : filtered.slice(0, 10)
                return limited.map(t => (
                  <tr key={t.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm font-medium text-primary">{t.ticket_number}</td>
                    <td className="px-6 py-4 text-sm text-gray-900">{t.subscriber_number}</td>
                    <td className="px-6 py-4 text-sm text-gray-900">{t.phone}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{t.wilayas?.name_fr || t.wilaya_code}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{t.regions?.name_fr || '-'}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{t.subscription_type}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{getInstallationStatus(t) || '-'}</td>
                  </tr>
                ))
              })()}
              {installationTickets.length === 0 && (
                <tr>
                  <td className="px-6 py-4 text-center text-sm text-gray-500" colSpan="7">Aucun ticket d&apos;installation</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
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
  const getInstallationStatus = (t) => {
    const raw = t.installation_status
    const has = raw && String(raw).trim() !== ''
    if (has) return String(raw)
    return mapAllowedToInstallStatus(t.status || '')
  }
