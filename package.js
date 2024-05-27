/* global Package */
Package.describe({
  name: 'socialize:messaging',
  summary: 'A social messaging package',
  version: '2.0.0',
  git: 'https://github.com/copleykj/socialize-messaging.git'
})

Package.onUse(function _(api) {
  api.versionsFrom(['2.8.1', '3.0-rc.2'])

  api.use([
    'check',
    'aldeed:simple-schema@1.13.1',
    'socialize:user-presence@2.0.0',
    'socialize:linkable-model@2.0.0',
    'reywood:publish-composite@1.8.9'
  ])

  api.mainModule('server.js', 'server')
  api.mainModule('common.js', 'client')
})
