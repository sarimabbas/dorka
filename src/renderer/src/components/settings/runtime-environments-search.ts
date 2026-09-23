import type { SettingsSearchEntry } from './settings-search'
import { translate } from '@/i18n/i18n'
import { translateSearchKeyword } from './settings-search-keywords'
import { createLocalizedCatalog } from '@/i18n/localized-catalog'

export const getRuntimeEnvironmentsSearchEntry = createLocalizedCatalog(
  (): SettingsSearchEntry => ({
    title: translate(
      'auto.components.settings.runtime.environments.search.3517fb2ec0',
      'Remote Dorka Servers'
    ),
    description: translate(
      'auto.components.settings.runtime.environments.search.4575341c77',
      'Pair this app directly with a saved Dorka server or adjust the default runtime.'
    ),
    keywords: [
      ...translateSearchKeyword(
        'auto.components.settings.runtime.environments.search.d198440ce3',
        'runtime'
      ),
      ...translateSearchKeyword(
        'auto.components.settings.runtime.environments.search.ebd5369acf',
        'environment'
      ),
      ...translateSearchKeyword(
        'auto.components.settings.runtime.environments.search.09568ccc65',
        'server'
      ),
      ...translateSearchKeyword(
        'auto.components.settings.runtime.environments.search.d760866285',
        'client'
      ),
      ...translateSearchKeyword(
        'auto.components.settings.runtime.environments.search.5cd7dca3b8',
        'remote'
      ),
      ...translateSearchKeyword(
        'auto.components.settings.runtime.environments.search.104f4d7dbd',
        'pairing'
      ),
      ...translateSearchKeyword(
        'auto.components.settings.runtime.environments.search.2bd988d041',
        'pairing code'
      )
    ]
  })
)

export const getWebRuntimeEnvironmentsSearchEntry = createLocalizedCatalog(
  (): SettingsSearchEntry => ({
    title: translate(
      'auto.components.settings.runtime.environments.search.3517fb2ec0',
      'Remote Dorka Servers'
    ),
    description: translate(
      'auto.components.settings.runtime.environments.search.baec27aa8f',
      'Connect this browser directly to a paired Dorka server.'
    ),
    keywords: [
      ...translateSearchKeyword(
        'auto.components.settings.runtime.environments.search.d198440ce3',
        'runtime'
      ),
      ...translateSearchKeyword(
        'auto.components.settings.runtime.environments.search.ebd5369acf',
        'environment'
      ),
      ...translateSearchKeyword(
        'auto.components.settings.runtime.environments.search.09568ccc65',
        'server'
      ),
      ...translateSearchKeyword(
        'auto.components.settings.runtime.environments.search.d760866285',
        'client'
      ),
      ...translateSearchKeyword(
        'auto.components.settings.runtime.environments.search.5cd7dca3b8',
        'remote'
      ),
      ...translateSearchKeyword(
        'auto.components.settings.runtime.environments.search.2bd988d041',
        'pairing code'
      )
    ]
  })
)
