import { useState, useEffect, useCallback, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Search, Filter, Eye, History, Download } from 'lucide-react'
import { formatTicketWilaya } from '../utils/location'

export default function TicketList() {
  const { t, i18n } = useTranslation()
  const searchInputRef = useRef(null)
  const selectionRef = useRef({ start: 0, end: 0 })
  const [tickets, setTickets] = useState([])
  const [filteredTickets, setFilteredTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [category, setCategory] = useState('reclamation')
  const [overdueFilter, setOverdueFilter] = useState(null)
  const [installStatusByTicket, setInstallStatusByTicket] = useState({})
  const location = useLocation()

  useEffect(() => {
    loadTickets()
  }, [category])

  const filterTickets = useCallback(() => {
    let filtered = tickets
    const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_')

    if (category === 'installation') {
      filtered = filtered.filter(t => {
        // Inclure si category est explicitement 'installation'
        if (t.category === 'installation') return true;
        
        // Inclure si installation_status est défini et non vide
        if (t.installation_status && String(t.installation_status).trim() !== '') return true;
        
        // Exclure les tickets de réclamation (complaint_type n'est pas null)
        if (t.complaint_type !== null && t.complaint_type !== undefined) return false;
        
        return false;
      })
    } else if (category === 'reclamation') {
      filtered = filtered.filter(t => (
        t.category === 'reclamation' ||
        (t.category == null && String(t.complaint_type || '').trim() !== '')
      ))
    }

    if (searchTerm) {
      const q = String(searchTerm).toLowerCase()
      filtered = filtered.filter(ticket => {
        const tn = String(ticket.ticket_number || '').toLowerCase()
        const cn = String(ticket.client_name || '').toLowerCase()
        const sn = String(ticket.subscriber_number || '').toLowerCase()
        const ph = String(ticket.phone || '')
        const wilaya = formatTicketWilaya(ticket).toLowerCase()
        const region =
          String(ticket.regions?.name_fr || ticket.regions?.name_en || ticket.regions?.name_ar || '')
            .toLowerCase()
        return tn.includes(q) || cn.includes(q) || sn.includes(q) || ph.includes(q) || wilaya.includes(q) || region.includes(q)
      })
    }

    if (statusFilter !== 'all') {
      filtered = filtered.filter(ticket => (
        category === 'installation'
          ? norm(getInstallationStatus(ticket)) === norm(statusFilter)
          : ticket.status === statusFilter
      ))
    }

    if (category === 'installation' && overdueFilter === '24') {
      filtered = filtered.filter(ticket => {
        const createdDate = new Date(ticket.created_at)
        const hours = Math.floor((new Date() - createdDate) / (1000 * 60 * 60))
        const inst = norm(getInstallationStatus(ticket))
        const overdueSet = new Set(['materiel','equipe_installation','optimisation','extension','manque_de_materiel'])
        return hours >= 24 && overdueSet.has(inst)
      })
    }

    console.log('Filtrage TicketList:', {
      category,
      searchTerm,
      statusFilter,
      overdueFilter,
      totalTickets: tickets.length,
      filteredCount: filtered.length
    });

    setFilteredTickets(filtered)
  }, [tickets, searchTerm, statusFilter, category, overdueFilter, installStatusByTicket])

  useEffect(() => {
    filterTickets()
  }, [filterTickets])

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const status = params.get('status')
    const q = params.get('q')
    const cat = params.get('category')
    const installStatus = params.get('install_status')
    const overdue = params.get('overdue')
    if (status) setStatusFilter(status)
    if (q) setSearchTerm(q)
      if (cat === 'installation' || cat === 'reclamation' || cat === 'all') {
        setCategory(cat || 'reclamation')
      } else if (cat) {
        setCategory(cat)
      }
    if (installStatus && cat === 'installation') setStatusFilter(installStatus)
    if (overdue && cat === 'installation') setOverdueFilter(overdue)
  }, [location.search])

  const loadTickets = async () => {
    try {
      let query = supabase
        .from('tickets')
        .select('*, wilayas(name_fr, name_ar, name_en), regions(name_fr, name_ar, name_en)')
        .order('created_at', { ascending: false })
      // Charger toutes les lignes et filtrer côté client pour éviter les incompatibilités PostgREST
      const { data, error } = await query

      if (error) throw error
      const all = data || []
      setTickets(all)
      if (all.length > 0) {
        const ids = all.map(t => t.id)
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
        }
        setInstallStatusByTicket(map)
      } else {
        setInstallStatusByTicket({})
      }
    } catch (error) {
      console.error('Error loading tickets:', error)
    } finally {
      setLoading(false)
    }
  }

  const INSTALLATION_STATUSES = ['matériel','équipe_installation','installé','annulé','injoignable','installation_impossible','optimisation','extension','manque_de_materiel']

  const mapInstallToAllowedStatus = (installStatus) => {
    switch (String(installStatus)) {
      case 'matériel':
        return 'assigné'
      case 'équipe_installation':
        return 'en_cours'
      case 'installé':
      case 'annulé':
      case 'installation_impossible':
        return 'fermé'
      case 'optimisation':
        return 'en_cours'
      case 'extension':
        return 'en_cours'
      case 'manque_de_materiel':
        return 'en_cours'
      case 'injoignable':
        return 'injoignable'
      default:
        return 'assigné'
    }
  }

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
    const fromHist = installStatusByTicket[ticket.id]
    if (fromHist) return fromHist
    const raw = ticket.installation_status
    const has = raw && String(raw).trim() !== ''
    if (has) return String(raw)
    return 'matériel'
  }

  const updateTicketStatus = async (ticketId, newStatus) => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const actorName = user?.user_metadata?.full_name || user?.email || 'Utilisateur'
      const { error } = await supabase
        .from('tickets')
        .update({ 
          status: newStatus,
          updated_at: new Date().toISOString(),
          ...(newStatus === 'fermé' && { closed_at: new Date().toISOString() })
        })
        .eq('id', ticketId)

      if (error) {
        const msg = String(error.message || '')
        if (msg.includes('tickets_status_check')) {
          const { error: fbErr } = await supabase
            .from('tickets')
            .update({ 
              status: 'en_cours',
              updated_at: new Date().toISOString()
            })
            .eq('id', ticketId)
          if (fbErr) throw fbErr
          await supabase.from('ticket_history').insert({
            ticket_id: ticketId,
            action: 'status_change',
            to_status: newStatus,
            changed_by: user?.id || null,
            changed_by_name: actorName,
            created_at: new Date().toISOString()
          })
          loadTickets()
          return
        }
        throw error
      }

      // Add to history
      await supabase.from('ticket_history').insert({
        ticket_id: ticketId,
        action: 'status_change',
        to_status: newStatus,
        changed_by: user?.id || null,
        changed_by_name: actorName,
        created_at: new Date().toISOString()
      })

      // Reload tickets
      loadTickets()
    } catch (error) {
      console.error('Error updating ticket:', error)
      alert(error?.message || t('common.error'))
    }
  }

  const updateInstallationStatus = async (ticketId, newStatus) => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const actorName = user?.user_metadata?.full_name || user?.email || 'Utilisateur'
      let error
      try {
        const res = await supabase
          .from('tickets')
          .update({ 
            installation_status: newStatus,
            status: mapInstallToAllowedStatus(newStatus),
            updated_at: new Date().toISOString()
          })
          .eq('id', ticketId)
        error = res.error
      } catch (e) {
        error = e
      }

      if (error) {
        const msg = String(error.message || '')
        if (msg.includes('installation_status') || msg.includes('schema cache') || msg.includes('tickets_status_check')) {
          const { error: fbErr } = await supabase
            .from('tickets')
            .update({ 
              status: 'en_cours',
              updated_at: new Date().toISOString()
            })
            .eq('id', ticketId)
          if (fbErr) throw fbErr
        } else {
          throw error
        }
      }

      await supabase.from('ticket_history').insert({
        ticket_id: ticketId,
        action: 'installation_status_change',
        to_status: newStatus,
        changed_by: user?.id || null,
        changed_by_name: actorName,
        created_at: new Date().toISOString()
      })

      loadTickets()
    } catch (error) {
      console.error('Error updating installation status:', error)
      alert(error?.message || t('common.error'))
    }
  }

  const statuses = category === 'installation'
    ? ['matériel', 'équipe_installation', 'installé', 'annulé', 'injoignable', 'installation_impossible', 'optimisation', 'extension', 'manque_de_materiel']
    : ['nouveau', 'assigné', 'paiement', 'en_cours', 'optimisation', 'injoignable', 'en_retard', 'fermé']

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

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-800">{category === 'installation' ? 'Installations' : 'Réclamations'}</h1>
        <Link
          to={category === 'installation' ? '/tickets/new?category=installation' : '/tickets/new?category=reclamation'}
          className="bg-primary hover:bg-primary-dark text-white px-6 py-2 rounded-lg transition-colors"
        >
          + {t('ticket.new')}
        </Link>
      </div>

      {/* Actions Row */}
      <div className="flex justify-end gap-2">
        <button
          onClick={() => {
              const rows = filteredTickets.map(t => ({
              ticket_number: t.ticket_number,
              subscriber_number: t.subscriber_number,
              phone: t.phone,
                wilaya: formatTicketWilaya(t),
              region: (() => {
                const lang = i18n.language || 'fr'
                const key = lang.startsWith('ar') ? 'name_ar' : lang.startsWith('en') ? 'name_en' : 'name_fr'
                return t.regions?.[key] || ''
              })(),
              subscription_type: t.subscription_type,
              status: t.status,
              created_at: t.created_at
            }))

            // En-têtes avec accents corrects en FR et BOM pour Excel
            const isFr = (i18n.language || 'fr').startsWith('fr')
            const headers = isFr
              ? ['N° Ticket', "N° d'abonné", 'Téléphone', 'Région', 'Zone', "Type d'abonnement", 'Statut', 'Créé le']
              : [
                  t('ticket.number'),
                  t('ticket.subscriberNumber'),
                  t('ticket.phone'),
                  'Region',
                  'Zone',
                  t('ticket.subscriptionType'),
                  t('ticket.status'),
                  t('ticket.createdAt')
                ]

            const csvBody = [
              headers.join(','),
              ...rows.map(r => [
                r.ticket_number,
                r.subscriber_number,
                r.phone,
                r.wilaya,
                r.region,
                r.subscription_type,
                t(`status.${r.status}`),
                new Date(r.created_at).toLocaleString(i18n.language || 'fr-FR')
              ].map(val => `${String(val ?? '').replace(/,/g, ';')}`).join(','))
            ].join('\n')

            // Préfixer avec BOM pour corriger l’encodage des caractères
            const BOM = '\ufeff'
            const blob = new Blob([BOM + csvBody], { type: 'text/csv;charset=utf-8;' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `tickets_export_${new Date().toISOString().slice(0,10)}.csv`
            a.click()
            URL.revokeObjectURL(url)
          }}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
        >
          <Download size={18} />
          {/* Renommage : libellé sans préfixe common */}
          Exporte
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
            <input
              ref={searchInputRef}
              type="text"
              placeholder={t('ticket.search')}
              value={searchTerm}
              onChange={(e) => {
                const v = e.target.value
                try {
                  // Save selection so we can restore after re-render
                  selectionRef.current.start = e.target.selectionStart || 0
                  selectionRef.current.end = e.target.selectionEnd || 0
                } catch (err) {
                  selectionRef.current.start = selectionRef.current.end = 0
                }
                setSearchTerm(v)
                // restore focus and selection after state update to avoid losing focus between renders
                setTimeout(() => {
                  const el = searchInputRef.current
                  if (!el) return
                  try {
                    el.focus()
                    el.setSelectionRange(selectionRef.current.start, selectionRef.current.end)
                  } catch (err) {
                    // Selection APIs may fail on certain input types; safe to ignore
                  }
                }, 0)
              }}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>

          {/* Status Filter */}
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
            >
              <option value="all">{t('ticket.all')}</option>
              {statuses.map(status => (
                <option key={status} value={status}>{t(`status.${status}`)}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Tickets Table */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('ticket.number')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('ticket.subscriberNumber')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('ticket.phone')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Région
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Zone
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('ticket.subscriptionType')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {category === 'installation' ? 'Statut installation' : t('ticket.status')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('ticket.actions')}
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredTickets && filteredTickets.length > 0 ? (
                <>
                  {filteredTickets.map((ticket) => {
                    if (!ticket) return null;
                    return (
                      <tr key={ticket.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-primary">
                          {ticket.ticket_number || '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <Link to={`/tickets/${ticket.id}`} className="text-primary hover:text-primary-dark">
                            {ticket.subscriber_number || '-'}
                          </Link>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {ticket.phone || '-'}
                          {ticket.client_name && (
                            <div className="text-xs text-gray-500">{ticket.client_name}</div>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {formatTicketWilaya(ticket) || '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {ticket.regions?.name_fr || '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {ticket.subscription_type || '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {category === 'installation' ? (
                            <select
                              value={getInstallationStatus(ticket) || 'matériel'}
                              onChange={(e) => updateInstallationStatus(ticket.id, e.target.value)}
                              className="px-2 py-1 text-xs font-semibold rounded-full border-0 cursor-pointer bg-gray-100 text-gray-800"
                            >
                              {INSTALLATION_STATUSES.map(status => (
                                <option key={status} value={status}>{status}</option>
                              ))}
                            </select>
                          ) : (
                            <select
                              value={ticket.status || 'nouveau'}
                              onChange={(e) => updateTicketStatus(ticket.id, e.target.value)}
                              className={`px-2 py-1 text-xs font-semibold rounded-full border-0 cursor-pointer ${
                                ticket.status === 'fermé' ? 'bg-gray-100 text-gray-800' :
                                ticket.status === 'en_retard' ? 'bg-red-100 text-red-800' :
                                ticket.status === 'en_cours' ? 'bg-blue-100 text-blue-800' :
                                'bg-green-100 text-green-800'
                              }`}
                            >
                              {statuses.map(status => (
                                <option key={status} value={status}>{t(`status.${status}`)}</option>
                              ))}
                            </select>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          <div className="flex space-x-2">
                            <button
                              onClick={() => window.location.href = `/tickets/${ticket.id}`}
                              className="text-primary hover:text-primary-dark"
                              title={t('common.view')}
                            >
                              <Eye size={18} />
                            </button>
                            <button
                              onClick={() => window.location.href = `/tickets/${ticket.id}#history`}
                              className="text-gray-600 hover:text-primary"
                              title={t('common.history') || 'Historique'}
                            >
                              <History size={18} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                  <tr className="bg-gray-100 font-bold">
                    <td className="px-6 py-4 text-sm" colSpan="7">Total</td>
                    <td className="px-6 py-4 text-sm">{filteredTickets.length}</td>
                  </tr>
                </>
              ) : (
                <tr>
                  <td colSpan="8" className="px-6 py-4 text-center text-sm text-gray-500">
                    Aucun résultat
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
