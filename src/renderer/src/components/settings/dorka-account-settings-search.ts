import { createLocalizedCatalog } from '@/i18n/localized-catalog'
import { translate } from '@/i18n/i18n'
import { translateSearchKeyword } from './settings-search-keywords'

export const getDorkaAccountSettingsSearchEntries = createLocalizedCatalog(() => [
  {
    title: translate('auto.components.settings.dorkaAccount.account', 'Dorka account'),
    description: translate(
      'auto.components.settings.dorkaAccount.searchDescription',
      'Sign in or out of the account used by Artifacts and Dorka Relay.'
    ),
    keywords: [
      ...translateSearchKeyword('auto.components.settings.dorkaAccount.keywordAccount', 'account'),
      ...translateSearchKeyword('auto.components.settings.dorkaAccount.keywordLogin', 'login'),
      ...translateSearchKeyword('auto.components.settings.dorkaAccount.keywordLogout', 'logout'),
      ...translateSearchKeyword('auto.components.settings.dorkaAccount.keywordSignIn', 'sign in'),
      ...translateSearchKeyword('auto.components.settings.dorkaAccount.keywordSignOut', 'sign out'),
      ...translateSearchKeyword('auto.components.settings.dorkaAccount.keywordRelay', 'relay'),
      ...translateSearchKeyword('auto.components.settings.dorkaAccount.keywordCloud', 'cloud')
    ]
  }
])
