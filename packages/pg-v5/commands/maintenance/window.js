'use strict'

const cli = require('heroku-cli-util')

async function run(context, heroku) {
  const fetcher = require('../../lib/fetcher')(heroku)
  const host = require('../../lib/host')
  const util = require('../../lib/util')
  const { app, args } = context
  const db = await fetcher.addon(app, args.database)

  if (util.starterPlan(db)) throw new Error('pg:maintenance is only available for production databases')

  if (!args.window.match(/^[A-Za-z]{2,10} \d\d?:[03]0$/)) throw new Error('Window must be "Day HH:MM" where MM is 00 or 30')

  let newPluginMessage = `You can also change the maintenance window with ${cli.color.cmd('data:maintenances:window:update')}.`
  newPluginMessage += `\nFollow https://devcenter.heroku.com/articles/data-maintenance-cli-commands`
  newPluginMessage += `\nto install the ${cli.color.bold.cyan('Data Maintenance CLI plugin')}.`

  cli.warn(newPluginMessage)

  await cli.action(`Setting maintenance window for ${cli.color.addon(db.name)} to ${cli.color.cyan(args.window)}`, async function () {
    let response = await heroku.put(`/client/v11/databases/${db.id}/maintenance_window`, {
      body: { description: args.window },
      host: host(db)
    })
    cli.action.done(response.message || 'done')
  }())
}

module.exports = {
  topic: 'pg',
  command: 'maintenance:window',
  description: 'set weekly maintenance window',
  help: `All times are in UTC.

Example:

    heroku pg:maintenance:window postgres-slippery-100 "Sunday 06:00"`,
  needsApp: true,
  needsAuth: true,
  args: [{ name: 'database' }, { name: 'window' }],
  run: cli.command({ preauth: true }, run)
}
