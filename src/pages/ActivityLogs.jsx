import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'
import { History, Calendar, Filter, Download, RefreshCw } from 'lucide-react'

export default function ActivityLogs() {
  const { t } = useTranslation()
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [filters, setFilters] = useState({
    user_id: '',
    date_from: '',
    date_to: ''
  })
  const [users, setUsers] = useState([])
  const [sessionStatus, setSessionStatus] = useState({})

  useEffect(() => {
    loadLogs()
    loadUsers()
  }, [])

  const loadLogs = async () => {
    try {
      setLoading(true)
      setErrorMessage('') // Clear previous error messages
      let query = supabase
        .from('activity_logs')
        .select('*')
        .in('action', ['LOGIN', 'LOGOUT'])
        .order('created_at', { ascending: false })
        .limit(200)

      // Apply filters
      if (filters.user_id) {
        query = query.eq('user_id', filters.user_id)
      }
      if (filters.date_from) {
        query = query.gte('created_at', filters.date_from)
      }
      if (filters.date_to) {
        query = query.lte('created_at', filters.date_to)
      }

      const { data, error } = await query

      if (error) throw error
      const safeData = data || []
      setLogs(safeData)

      // Build latest session status per user (most recent LOGIN/LOGOUT per user)
      // Since logs are sorted DESC, first occurrence per user_id is the most recent
      const sessions = {}
      safeData.forEach(log => {
        if (!log?.user_id) return
        if (!['LOGIN', 'LOGOUT'].includes(log.action)) return
        // Only set if not already set (first = most recent due to DESC sort)
        if (!sessions[log.user_id]) {
          sessions[log.user_id] = {
            status: log.action === 'LOGIN' ? 'online' : 'offline',
            action: log.action,
            timestamp: log.created_at,
            userName: log.user_name || log.user_email || 'Système'
          }
        }
      })
      setSessionStatus(sessions)
      
      console.log('Session status calculated:', sessions)
      console.log('Total logs loaded:', safeData.length)
    } catch (error) {
      console.error('Error loading logs:', error)
      setErrorMessage('Une erreur s\'est produite lors du chargement des journaux.')
    } finally {
      setLoading(false)
    }
  }

  const loadUsers = async () => {
    const { data } = await supabase
      .from('users')
      .select('id, full_name, email')
      .order('full_name')
    
    if (data) setUsers(data)
  }

  const handleFilterChange = (e) => {
    const { name, value } = e.target
    setFilters(prev => ({ ...prev, [name]: value }))
  }

  const applyFilters = () => {
    loadLogs()
  }

  const resetFilters = () => {
    setFilters({
      user_id: '',
      date_from: '',
      date_to: ''
    })
    setTimeout(() => loadLogs(), 100)
  }

  const exportLogs = () => {
    const csv = [
      ['Date', 'Utilisateur', 'Action', 'Détails'].join(','),
      ...logs.map(log => [
        new Date(log.created_at).toLocaleString('fr-FR'),
        log.user_name || log.user_email || 'Système',
        getActionLabel(log.action),
        (log.description || '-').replace(/,/g, ';')
      ].join(','))
    ].join('\n')

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `activity_logs_${new Date().toISOString().split('T')[0]}.csv`
    a.click()
  }

  const getActionIcon = (action) => {
    switch (action) {
      case 'CREATE': return '✅'
      case 'UPDATE': return '✏️'
      case 'DELETE': return '🗑️'
      case 'LOGIN': return '🔐'
      case 'LOGOUT': return '🚪'
      case 'VIEW': return '👁️'
      default: return '📝'
    }
  }

  const getActionLabel = (action) => {
    switch (action) {
      case 'CREATE': return 'Création'
      case 'UPDATE': return 'Modification'
      case 'DELETE': return 'Suppression'
      case 'LOGIN': return 'Connexion'
      case 'LOGOUT': return 'Déconnexion'
      case 'VIEW': return 'Consultation'
      default: return action
    }
  }

  const getActionColor = (action) => {
    switch (action) {
      case 'CREATE': return 'bg-green-100 text-green-800'
      case 'UPDATE': return 'bg-blue-100 text-blue-800'
      case 'DELETE': return 'bg-red-100 text-red-800'
      case 'LOGIN': return 'bg-purple-100 text-purple-800'
      case 'LOGOUT': return 'bg-gray-100 text-gray-800'
      case 'VIEW': return 'bg-yellow-100 text-yellow-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getSessionBadge = (status) => {
    switch (status) {
      case 'online':
        return 'bg-green-100 text-green-800'
      case 'offline':
        return 'bg-gray-100 text-gray-800'
      default:
        return 'bg-yellow-100 text-yellow-800'
    }
  }

  const getSessionLabel = (status) => {
    switch (status) {
      case 'online':
        return 'En ligne'
      case 'offline':
        return 'Déconnecté'
      default:
        return 'Inconnu'
    }
  }

  const sessionSummary = Object.values(sessionStatus)
  const onlineCount = sessionSummary.filter(s => s.status === 'online').length
  const offlineCount = sessionSummary.filter(s => s.status === 'offline').length

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <History className="w-8 h-8 text-primary" />
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Suivi des connexions</h1>
                <p className="text-gray-500">Dernières connexions et déconnexions des utilisateurs</p>
              </div>
          </div>
          
          <div className="flex gap-2">
            <button
              onClick={loadLogs}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              <RefreshCw className="w-4 h-4" />
              Actualiser
            </button>
            <button
              onClick={exportLogs}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark"
            >
              <Download className="w-4 h-4" />
              Exporter CSV
            </button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-md p-4 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="w-5 h-5 text-gray-500" />
          <div>
            <h2 className="text-lg font-semibold">Filtrer les connexions</h2>
            <p className="text-sm text-gray-500">Seules les connexions/déconnexions sont conservées</p>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Utilisateur</label>
            <select
              name="user_id"
              value={filters.user_id}
              onChange={handleFilterChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary"
            >
              <option value="">Tous</option>
              {users.map(user => (
                <option key={user.id} value={user.id}>{user.full_name || user.email}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date début</label>
            <input
              type="date"
              name="date_from"
              value={filters.date_from}
              onChange={handleFilterChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date fin</label>
            <input
              type="date"
              name="date_to"
              value={filters.date_to}
              onChange={handleFilterChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary"
            />
          </div>
        </div>

        <div className="flex gap-2 mt-4">
          <button
            onClick={applyFilters}
            className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark"
          >
            Appliquer
          </button>
          <button
            onClick={resetFilters}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
          >
            Réinitialiser
          </button>
        </div>
      </div>

      {/* Session status */}
      <div className="bg-white rounded-lg shadow-md p-4 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold">Statut des connexions</h2>
            <p className="text-sm text-gray-500">Suivi des dernières connexions/déconnexions</p>
          </div>
          <div className="flex gap-3 text-sm">
            <span className="px-3 py-1 rounded-full bg-green-50 text-green-700">
              {onlineCount} connecté(s)
            </span>
            <span className="px-3 py-1 rounded-full bg-gray-50 text-gray-700">
              {offlineCount} déconnecté(s)
            </span>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {users.length === 0 ? (
            <p className="text-sm text-gray-500">Chargement des utilisateurs...</p>
          ) : (
            users.map(user => {
              const session = sessionStatus[user.id]
              return (
                <div key={user.id} className="border border-gray-200 rounded-lg p-4 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-gray-900">{user.full_name || user.email}</span>
                    <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getSessionBadge(session?.status)}`}>
                      {getSessionLabel(session?.status)}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500">
                    {session?.timestamp
                      ? `${getActionLabel(session.action)} · ${new Date(session.timestamp).toLocaleString('fr-FR')}`
                      : 'Aucune activité récente'}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* Logs Table */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center p-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center p-12 text-gray-500">
            <History className="w-16 h-16 mx-auto mb-4 opacity-50" />
            <p>Aucune activité trouvée</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('admin.fullName')}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Détails</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-gray-400" />
                        {new Date(log.created_at).toLocaleString('fr-FR')}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {log.user_name || log.user_email || 'Système'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getActionColor(log.action)}`}>
                        <span className="mr-1">{getActionIcon(log.action)}</span>
                        {getActionLabel(log.action)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {log.description || 'Connexion utilisateur'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="mt-6 text-center text-sm text-gray-500">
        Total: {logs.length} activité(s)
      </div>

      {/* Error Message */}
      {errorMessage && (
        <div className="bg-red-100 text-red-800 p-4 rounded-lg mb-4">
          {errorMessage}
        </div>
      )}
    </div>
  )
}


