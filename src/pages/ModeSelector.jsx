import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

export default function ModeSelector() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">{t('mode.title') || 'Choisissez une interface'}</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <button
          onClick={() => navigate('/reclamation')}
          className="bg-primary text-white px-6 py-8 rounded-xl shadow hover:bg-primary-dark transition-colors"
        >
          <div className="text-left">
            <div className="text-xl font-bold">{t('mode.reclamation') || 'Réclamation'}</div>
            <div className="text-sm opacity-90 mt-2">{t('mode.reclamationDesc') || 'Gestion des réclamations'}</div>
          </div>
        </button>

        <button
          onClick={() => navigate('/installation')}
          className="bg-blue-600 text-white px-6 py-8 rounded-xl shadow hover:bg-blue-700 transition-colors"
        >
          <div className="text-left">
            <div className="text-xl font-bold">{t('mode.installation') || 'Installation'}</div>
            <div className="text-sm opacity-90 mt-2">{t('mode.installationDesc') || 'Gestion des installations'}</div>
          </div>
        </button>
      </div>
    </div>
  )
}
