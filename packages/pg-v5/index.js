'use strict'

const {flatten} = require('lodash')

exports.topics = [
  {name: 'pg', description: 'manage postgresql databases'},
]

exports.commands = flatten([
  require('./commands/repoint'),
  require('./commands/wait'),
])

exports.host = require('./lib/host')
exports.fetcher = require('./lib/fetcher')
