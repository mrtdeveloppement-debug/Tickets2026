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
import { formatTicketWilaya, isTicketInNouakchott } from '../utils/location'

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend)

export default function InstallationDashboard() {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(true)
  const [serviceDelayData, setServiceDelayData] = useState({})
  const [lateByDays, setLateByDays] = useState([])
  const [sawiByRegion, setSawiByRegion] = useState([])
  const [lateSawiByRegion, setLateSawiByRegion] = useState([])
  const [lateSawiNkcByZone, setLateSawiNkcByZone] = useState([])
  const [lateByStatus, setLateByStatus] = useState([])
  const [installationTickets, setInstallationTickets] = useState([])
  const [timeRange, setTimeRange] = useState('all')
  const [statusCounts, setStatusCounts] = useState({})
  const [selectedStatus, setSelectedStatus] = useState('')
  const [installSearch, setInstallSearch] = useState('')
  const [installSearchInput, setInstallSearchInput] = useState('')
  const ticketsRef = useRef(null)
  const navigate = useNavigate()
  const [installStatusOverrideById, setInstallStatusOverrideById] = useState({})
  const [diagnostic, setDiagnostic] = useState({ role: null, totalCount: null, installCount: null, histCount: null, error: null })
  const normalizeKey = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_')
  // Correction : toujours afficher 0 si aucun ticket pour ce statut
  const getCount = (k) => (statusCounts[k] !== undefined ? statusCounts[k] : 0)
  const [hasAccess, setHasAccess] = useState(true)

  useEffect(() => {
    checkAccess()
  }, [])

  const checkAccess = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: userData } = await supabase
          .from('users')
          .select('can_access_installation')
          .eq('id', user.id)
          .single()
        
        if (userData && userData.can_access_installation === false) {
          setHasAccess(false)
          alert('Vous n\'avez pas accès à la page Installation.')
          navigate('/reclamation')
          return
        }
      }
    } catch (error) {
      console.error('Error checking access:', error)
    }
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
    const over = installStatusOverrideById[t.id]
    if (over) return over
    const raw = t.installation_status
    const has = raw && String(raw).trim() !== ''
    if (has) return String(raw)
    return mapAllowedToInstallStatus(t.status || '')
  }

  const filterInstallationTickets = (tickets) => {
    return tickets.filter(t => {
      // Inclure si category est explicitement 'installation'
      if (t.category === 'installation') return true;
      
      // Inclure si installation_status est défini et non vide
      if (t.installation_status && String(t.installation_status).trim() !== '') return true;
      
      // Exclure les tickets de réclamation (complaint_type n'est pas null)
      if (t.complaint_type !== null && t.complaint_type !== undefined) return false;
      
      return false;
    })
  }

  const isTicketOverdue = (ticket) => {
    if (!ticket.created_at) return false;
    
    // Statuts concernés par le retard
    const overdueStatuses = ['materiel', 'equipe_installation', 'optimisation', 'manque_de_materiel', 'extension'];
    const ticketStatus = normalizeKey(getInstallationStatus(ticket));
    const isRelevantStatus = overdueStatuses.includes(ticketStatus);
    
    // Vérifier que le ticket a >= 48h
    const createdDate = new Date(ticket.created_at);
    const now = new Date();
    const hoursElapsed = (now - createdDate) / (1000 * 60 * 60);
    const isOverdue = hoursElapsed >= 48;
    
    // Debug log
    if (isRelevantStatus && isOverdue) {
      console.log(`Ticket ${ticket.ticket_number}: Status=${ticketStatus}, Hours=${hoursElapsed.toFixed(2)}, Overdue=${isOverdue}`);
    }
    
    return isRelevantStatus && isOverdue;
  }

  const selectStatus = (status) => {
    setSelectedStatus(prev => (prev === status ? '' : status))
    if (status === 'en_retard') {
      navigate(`/tickets?category=installation&overdue=48`)
    } else {
      navigate(`/tickets?category=installation&install_status=${encodeURIComponent(status)}`)
    }
    if (ticketsRef.current) ticketsRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  const selectOverdue = () => {
    setSelectedStatus('en_retard')
    navigate(`/tickets?category=installation&overdue=48`)
    if (ticketsRef.current) ticketsRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  useEffect(() => {
    if (!hasAccess) return
    const loadData = async () => {
      try {
        console.log('Début du chargement des données...');

        let query = supabase
          .from('tickets')
          .select('*, wilayas(name_fr), regions(name_fr)')
          .order('created_at', { ascending: false });

        if (timeRange !== 'all') {
          const currentDate = new Date();
          const from = new Date(currentDate);
          if (timeRange === 'day') from.setDate(currentDate.getDate() - 1);
          else if (timeRange === 'month') from.setMonth(currentDate.getMonth() - 1);
          else if (timeRange === 'year') from.setFullYear(currentDate.getFullYear() - 1);
          const fromIso = from.toISOString();
          query = query.gte('created_at', fromIso);
        }

        const { data, error } = await query;
        if (error) {
          console.error('Erreur lors de la requête Supabase:', error);
          return;
        }

        console.log('Données brutes récupérées depuis Supabase:', data);

        const loaded = data || [];
        console.log('Nombre de tickets chargés:', loaded.length);

        const allInstallation = filterInstallationTickets(loaded);

        console.log('Tickets filtrés pour installation:', allInstallation);

        const normalized = allInstallation.map(t => {
          const inst = getInstallationStatus(t);
          return { ...t, installation_status: inst };
        });

        console.log('Tickets normalisés:', normalized);

        setInstallationTickets(normalized);

        const counts = {};
        const statusBreakdown = {};
        
        normalized.forEach(t => {
          const statusKey = normalizeKey(getInstallationStatus(t));
          if (!statusKey || statusKey === 'undefined' || statusKey === 'null') return;
          counts[statusKey] = (counts[statusKey] || 0) + 1;
          if (!statusBreakdown[statusKey]) {
            statusBreakdown[statusKey] = [];
          }
          statusBreakdown[statusKey].push(t.ticket_number);
        });
        // Remove statuses with zero count
        Object.keys(counts).forEach(key => {
          if (!counts[key]) delete counts[key];
        });

        // Compter les tickets en retard (>= 48h)
        const overdueTickets = normalized.filter(t => isTicketOverdue(t));
        counts['overdue48'] = overdueTickets.length;

        // Ensure the total count matches the displayed tickets
        setStatusCounts({ ...counts, total: installationTickets.length });

        console.log('Total tickets installation:', normalized.length);
        console.log('Statuts comptés avec tickets en retard:', counts);
        console.log('Détails par statut:', statusBreakdown);
        console.log('Tickets en retard trouvés:', overdueTickets.length);
        console.log('Numéros de tickets en retard:', overdueTickets.map(t => ({
          number: t.ticket_number,
          status: getInstallationStatus(t),
          created: t.created_at,
          hoursElapsed: (new Date() - new Date(t.created_at)) / (1000 * 60 * 60)
        })));

        setStatusCounts(counts);

        console.log('Chargement des données terminé.');

      } catch (e) {
        console.error('Erreur lors du chargement des données:', e);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [timeRange])

  useEffect(() => {
    const runDiagnosis = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        let role = null
        if (user?.id) {
          const { data: u } = await supabase
            .from('users')
            .select('role')
            .eq('id', user.id)
            .limit(1)
            .maybeSingle()
          role = u?.role || null
        }
        const { count: totalCount } = await supabase
          .from('tickets')
          .select('id', { count: 'exact', head: true })
        const { count: installCount } = await supabase
          .from('tickets')
          .select('id', { count: 'exact', head: true })
          .or('installation_status.not.is.null,complaint_type.is.null')
        const { count: histCount } = await supabase
          .from('ticket_history')
          .select('ticket_id', { count: 'exact', head: true })
          .eq('action', 'installation_status_change')
        setDiagnostic({ role, totalCount: totalCount ?? 0, installCount: installCount ?? 0, histCount: histCount ?? 0, error: null })
      } catch (e) {
        setDiagnostic(prev => ({ ...prev, error: String(e?.message || 'Erreur inconnue') }))
      }
    }
    runDiagnosis()
  }, [])

  const sawiByRegionSorted = [...sawiByRegion].sort((a, b) => b[1] - a[1])
  const lateSawiByRegionSorted = [...lateSawiByRegion].sort((a, b) => b[1] - a[1])
  // Define lateSawiNkcByZoneSorted with a default value to prevent errors
  const lateSawiNkcByZoneSorted = lateSawiNkcByZone ? [...lateSawiNkcByZone].sort((a, b) => b[1] - a[1]) : [];

  useEffect(() => {
    console.log('Données des tickets d\'installation:', installationTickets);
    console.log('Comptes des statuts:', statusCounts);
  }, [installationTickets, statusCounts]);

  useEffect(() => {
    if (!hasAccess) return
    const loadGraphData = async () => {
      try {
        let query = supabase
          .from('tickets')
          .select('*, wilayas(name_fr), regions(name_fr)')
          .order('created_at', { ascending: false });

        if (timeRange !== 'all') {
          const currentDate = new Date();
          const from = new Date(currentDate);
          if (timeRange === 'day') from.setDate(currentDate.getDate() - 1);
          else if (timeRange === 'month') from.setMonth(currentDate.getMonth() - 1);
          else if (timeRange === 'year') from.setFullYear(currentDate.getFullYear() - 1);
          const fromIso = from.toISOString();
          query = query.gte('created_at', fromIso);
        }

        const { data } = await query;
        const allTickets = data || [];

        // Utiliser la même logique de filtrage que pour les icônes
        const installationTicketsForGraphs = filterInstallationTickets(allTickets);

        // Graph 1: Service et Retard (installation uniquement - statuts autorisés)
        const allowedInstallStatuses = ['materiel', 'equipe_installation', 'extension', 'optimisation', 'manque_de_materiel', 'injoignable'];
        const serviceDelayMap = {};
        installationTicketsForGraphs.forEach(t => {
          const ticketStatus = normalizeKey(getInstallationStatus(t));
          if (allowedInstallStatuses.includes(ticketStatus)) {
            const service = t.subscription_type || 'Autres';
            if (!serviceDelayMap[service]) {
              serviceDelayMap[service] = { total: 0, late: 0 };
            }
            serviceDelayMap[service].total++;
            if (isTicketOverdue(t)) {
              serviceDelayMap[service].late++;
            }
          }
        });
        setServiceDelayData(serviceDelayMap);

        // Graph 2: Tickets par jours (installation uniquement - tickets avec statuts autorisés)
        const lateTicketsMap = {};
        const allTicketsList = [];
        installationTicketsForGraphs.forEach(t => {
          const ticketStatus = normalizeKey(getInstallationStatus(t));
          if (allowedInstallStatuses.includes(ticketStatus) && t.created_at) {
            const createdDate = new Date(t.created_at);
            const now = new Date();
            const daysLate = Math.floor((now - createdDate) / (1000 * 60 * 60 * 24));
            lateTicketsMap[daysLate] = (lateTicketsMap[daysLate] || 0) + 1;
            allTicketsList.push({ ticket_number: t.ticket_number, status: getInstallationStatus(t), daysLate });
          }
        });
        const sortedByDays = Object.entries(lateTicketsMap)
          .map(([days, count]) => [Number(days), count])
          .sort((a, b) => b[0] - a[0]); // Sort descending (right to left: highest days first)
        setLateByDays(sortedByDays);

        // Graph 3: SAWI par Région (installation uniquement - statuts autorisés)
        const sawiRegionMap = {};
        installationTicketsForGraphs.filter(t => {
          const ticketStatus = normalizeKey(getInstallationStatus(t));
          return t.subscription_type === 'SAWI' && allowedInstallStatuses.includes(ticketStatus);
        }).forEach(t => {
          const region = formatTicketWilaya(t);
          sawiRegionMap[region] = (sawiRegionMap[region] || 0) + 1;
        });
        setSawiByRegion(Object.entries(sawiRegionMap));

        // Graph 4: SAWI en Retard par Région (installation uniquement - statuts autorisés)
        const lateSawiRegionMap = {};
        installationTicketsForGraphs.filter(t => {
          const ticketStatus = normalizeKey(getInstallationStatus(t));
          return t.subscription_type === 'SAWI' && isTicketOverdue(t) && allowedInstallStatuses.includes(ticketStatus);
        }).forEach(t => {
          const region = formatTicketWilaya(t);
          lateSawiRegionMap[region] = (lateSawiRegionMap[region] || 0) + 1;
        });
        setLateSawiByRegion(Object.entries(lateSawiRegionMap));

        // Graph 5: SAWI NKC en Retard par Zone
        const lateSawiNkcZoneMap = {};
        installationTicketsForGraphs.filter(t => {
          const ticketStatus = normalizeKey(getInstallationStatus(t));
          return t.subscription_type === 'SAWI'
            && isTicketOverdue(t)
            && allowedInstallStatuses.includes(ticketStatus)
            && isTicketInNouakchott(t);
        }).forEach(t => {
          let zone = t.regions?.name_fr || 'Non spécifié';
          lateSawiNkcZoneMap[zone] = (lateSawiNkcZoneMap[zone] || 0) + 1;
        });
        console.log('lateSawiNkcByZone data:', lateSawiNkcZoneMap);
        setLateSawiNkcByZone(Object.entries(lateSawiNkcZoneMap));

        // Graph 6: Tickets en Retard par Statut
        const lateByStatusMap = {};
        installationTicketsForGraphs.forEach(t => {
          if (isTicketOverdue(t)) {
            const status = getInstallationStatus(t);
            // Formater le statut pour l'affichage
            const statusLabel = status || 'Non spécifié';
            lateByStatusMap[statusLabel] = (lateByStatusMap[statusLabel] || 0) + 1;
          }
        });
        // Trier par nombre décroissant
        const sortedLateByStatus = Object.entries(lateByStatusMap)
          .sort((a, b) => b[1] - a[1]);
        setLateByStatus(sortedLateByStatus);

      } catch (error) {
        console.error('Erreur lors du chargement des données des graphes:', error);
      }
    };
    loadGraphData();
  }, [timeRange]);

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
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setInstallSearch(installSearchInput)
                  navigate(`/tickets?category=installation&q=${encodeURIComponent(installSearchInput)}`)
                }
              }}
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
            onClick={() => { setInstallSearch(installSearchInput); navigate(`/tickets?category=installation&q=${encodeURIComponent(installSearchInput)}`) }}
            className="px-4 py-2 rounded-full bg-primary text-white hover:bg-primary-dark"
          >
            Rechercher
          </button>
        </div>
      </div>

      {/* Statuts Installation - 7 icônes + En retard ≥48h */}
      {installationTickets.length > 0 && (
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
            <button className={`p-3 bg-red-600 rounded-lg flex items-center justify-center ${selectedStatus==='en_retard'?'ring-2 ring-red-400':''}`}>
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
      )}

      
  
        {/* Graphs Row 1 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Graph 1: Situation par Service et Retard */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Graph 1: Situation par Service et Retard</h3>
        {Object.keys(serviceDelayData).length > 0 ? (
          <div style={{ height: '350px' }}>
            {(() => {
              const sds = serviceDelayData || {}
              const totalTickets = Object.values(sds).reduce((acc, d) => acc + (d?.total || 0), 0)
              const totalLate = Object.values(sds).reduce((acc, d) => acc + (d?.late || 0), 0)
              const sawiTotal = sds['SAWI']?.total || 0
              const sawiLate = sds['SAWI']?.late || 0
              const ftthTotal = sds['FTTH']?.total || 0
              const ftthLate = sds['FTTH']?.late || 0
              const blrTotal = sds['BLR']?.total || 0
              const blrLate = sds['BLR']?.late || 0
              // Correct the syntax error in the labels array
              const labels = [
                'Total tickets',
                'Total En Retard',
               
                'FTTH',
                'En Retard',
                'BLR',
                'En Retard', // Ensure a trailing comma is present
              ]
              const dataPoints = [
                totalTickets,
                totalLate,
                sawiTotal,
                sawiLate,
                ftthTotal,
                ftthLate,
                blrTotal,
                blrLate
              ]
              const colors = [
                '#2563eb',
                '#ef4444',
                '#2563eb',
                '#ef4444',
                '#2563eb',
                '#ef4444',
                '#2563eb',
                '#ef4444'
              ]
              return (
                <Bar
                  data={{
                    labels,
                    datasets: [{
                      label: 'Nombre',
                      data: dataPoints,
                      backgroundColor: colors
                    }]
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: { y: { beginAtZero: true, ticks: { stepSize: 1, precision: 0 } } }
                  }}
                />
              )
            })()}
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

        {/* Graph 5: SAWI NKC en Retard par Zone */}
        <div className="grid grid-cols-1 gap-6">
          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Graph 5: SAWI NKC en Retard par Zone</h3>
            {lateSawiNkcByZoneSorted.length > 0 ? (
              <div style={{ height: '350px' }}>
                <Bar
                  data={{
                    labels: lateSawiNkcByZoneSorted.map(([zone]) => zone),
                    datasets: [{
                      label: 'Tickets SAWI NKC en Retard',
                      data: lateSawiNkcByZoneSorted.map(([, count]) => count),
                      backgroundColor: '#ef4444'
                    }]
                  }}
                  options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }}
                />
              </div>
            ) : (
              <p className="text-gray-500 text-sm">Aucun ticket SAWI NKC en retard</p>
            )}
          </div>
        </div>

        {/* Graph 6: Tickets en Retard par Statut */}
        <div className="grid grid-cols-1 gap-6">
          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Graph 6: Tickets en Retard par Statut</h3>
            {lateByStatus.length > 0 ? (
              <div style={{ height: '350px' }}>
                <Bar
                  data={{
                    labels: lateByStatus.map(([status]) => status),
                    datasets: [{
                      label: 'Nombre de Tickets en Retard',
                      data: lateByStatus.map(([, count]) => count),
                      backgroundColor: '#ef4444'
                    }]
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: { position: 'bottom' },
                      tooltip: {
                        callbacks: {
                          label: function(context) {
                            return `${context.dataset.label}: ${context.parsed.y}`;
                          }
                        }
                      }
                    },
                    scales: {
                      y: {
                        beginAtZero: true,
                        ticks: {
                          stepSize: 1,
                          precision: 0
                        }
                      }
                    }
                  }}
                />
              </div>
            ) : (
              <p className="text-gray-500 text-sm">Aucun ticket en retard</p>
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
                      formatTicketWilaya(t).toLowerCase().includes(s) ||
                      (t.regions?.name_fr || '').toLowerCase().includes(s) ||
                      (t.subscription_type || '').toLowerCase().includes(s)
                    ))
                  : base
                const limited = selectedStatus ? filtered : filtered.slice(0, 10)
                return (
                  <>
                    {limited.map(t => (
                      <tr key={t.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 text-sm font-medium text-primary">{t.ticket_number}</td>
                        <td className="px-6 py-4 text-sm text-gray-900">{t.subscriber_number}</td>
                        <td className="px-6 py-4 text-sm text-gray-900">{t.phone}</td>
                        <td className="px-6 py-4 text-sm text-gray-500">{formatTicketWilaya(t)}</td>
                        <td className="px-6 py-4 text-sm text-gray-500">{t.regions?.name_fr || '-'}</td>
                        <td className="px-6 py-4 text-sm text-gray-500">{t.subscription_type}</td>
                        <td className="px-6 py-4 text-sm text-gray-500">{getInstallationStatus(t) || '-'}</td>
                      </tr>
                    ))}
                    {installationTickets.length === 0 ? (
                      <tr>
                        <td className="px-6 py-4 text-center text-sm text-gray-500" colSpan="7">Aucun ticket d&apos;installation</td>
                      </tr>
                    ) : limited.length > 0 ? (
                      <tr className="bg-gray-100 font-bold">
                        <td className="px-6 py-4 text-sm" colSpan="6">Total</td>
                        <td className="px-6 py-4 text-sm">{limited.length}</td>
                      </tr>
                    ) : null}
                  </>
                )
              })()}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
