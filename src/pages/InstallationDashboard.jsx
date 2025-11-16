import { useEffect, useState } from 'react'
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
import { Wrench, Users, CheckCircle2, XCircle, PhoneOff, Ban, Settings } from 'lucide-react'

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend)

export default function InstallationDashboard() {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(true)
  const [tickets, setTickets] = useState([])
  const [serviceDelayData, setServiceDelayData] = useState({})
  const [lateByDays, setLateByDays] = useState([])
  const [sawiByRegion, setSawiByRegion] = useState([])
  const [lateSawiByRegion, setLateSawiByRegion] = useState([])
  const [statusCounts, setStatusCounts] = useState({})

  useEffect(() => {
    const loadData = async () => {
      try {
        const { data, error } = await supabase
          .from('tickets')
          .select('*, wilayas(name_fr), regions(name_fr)')
          .eq('category', 'installation')
          .order('created_at', { ascending: false })

        if (error) throw error
        setTickets(data || [])

        const allInstallation = (data || [])
        const openTickets = allInstallation.filter(t => t.installation_status !== 'installé' && t.installation_status !== 'annulé')

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

        const lateByDaysCount = {}
        openTickets.forEach(ticket => {
          const createdDate = new Date(ticket.created_at)
          const days = Math.floor((new Date() - createdDate) / (1000 * 60 * 60 * 24))
          lateByDaysCount[days] = (lateByDaysCount[days] || 0) + 1
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
      } catch (e) {
        console.error('Error loading installation dashboard:', e)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [])

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
      <h1 className="text-2xl font-bold text-gray-900">{t('installation.title') || 'Dashboard Installation'}</h1>

      {/* Statuts Installation - 7 icônes */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Matériel */}
        <div className="bg-white rounded-lg shadow p-4 flex items-center justify-between">
          <div>
            <div className="text-sm text-gray-500">Matériel</div>
            <div className="text-2xl font-bold">{statusCounts['matériel'] || 0}</div>
          </div>
          <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
            <Wrench className="text-blue-600" size={20} />
          </div>
        </div>
        {/* Équipe installation */}
        <div className="bg-white rounded-lg shadow p-4 flex items-center justify-between">
          <div>
            <div className="text-sm text-gray-500">Équipe installation</div>
            <div className="text-2xl font-bold">{statusCounts['équipe_installation'] || 0}</div>
          </div>
          <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
            <Users className="text-indigo-600" size={20} />
          </div>
        </div>
        {/* Installé */}
        <div className="bg-white rounded-lg shadow p-4 flex items-center justify-between">
          <div>
            <div className="text-sm text-gray-500">Installé</div>
            <div className="text-2xl font-bold">{statusCounts['installé'] || 0}</div>
          </div>
          <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
            <CheckCircle2 className="text-green-600" size={20} />
          </div>
        </div>
        {/* Annulé */}
        <div className="bg-white rounded-lg shadow p-4 flex items-center justify-between">
          <div>
            <div className="text-sm text-gray-500">Annulé</div>
            <div className="text-2xl font-bold">{statusCounts['annulé'] || 0}</div>
          </div>
          <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
            <XCircle className="text-orange-600" size={20} />
          </div>
        </div>
        {/* Injoignable */}
        <div className="bg-white rounded-lg shadow p-4 flex items-center justify-between">
          <div>
            <div className="text-sm text-gray-500">Injoignable</div>
            <div className="text-2xl font-bold">{statusCounts['injoignable'] || 0}</div>
          </div>
          <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
            <PhoneOff className="text-yellow-600" size={20} />
          </div>
        </div>
        {/* Installation Impossible */}
        <div className="bg-white rounded-lg shadow p-4 flex items-center justify-between">
          <div>
            <div className="text-sm text-gray-500">Installation Impossible</div>
            <div className="text-2xl font-bold">{statusCounts['installation_impossible'] || 0}</div>
          </div>
          <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
            <Ban className="text-red-600" size={20} />
          </div>
        </div>
        {/* Optimisation */}
        <div className="bg-white rounded-lg shadow p-4 flex items-center justify-between">
          <div>
            <div className="text-sm text-gray-500">Optimisation</div>
            <div className="text-2xl font-bold">{statusCounts['optimisation'] || 0}</div>
          </div>
          <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
            <Settings className="text-purple-600" size={20} />
          </div>
        </div>
      </div>

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
  )
}
