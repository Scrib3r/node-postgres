'use strict'
//Parse method copied from https://github.com/brianc/node-postgres
//Copyright (c) 2010-2014 Brian Carlson (brian.m.carlson@gmail.com)
//MIT License

const { URL } = require('url')
//
/**
 * parses a connection string
 * @param str - a connection string to Postgres
 */
function parse(str) {
  //unix socket
  if (str.charAt(0) === '/') {
    const config = str.split(' ')
    return { host: config[0], database: config[1] }
  }

  // Check for empty host in URL

  const config = {}
  let result
  let dummyHost = false
  if (/ |%[^a-f0-9]|%[a-f0-9][^a-f0-9]/i.test(str)) {
    // Ensure spaces are encoded as %20
    str = encodeURI(str).replace(/%25(\d\d)/g, '%$1')
  }

  let host = str
  host = host.slice(host.indexOf('://') + 3).split(/[?/]/)[0]
  host = decodeURIComponent(host.slice(host.indexOf('@') + 1))

  const multihosts = host.split(',')

  try {
    result = new URL(str.replace(host, multihosts[0]), 'postgres://base')
  } catch (e) {
    // The URL is invalid so try again with a dummy host
    result = new URL(str.replace('@/', '@___DUMMY___/'), 'postgres://base')
    dummyHost = true
  }

  // We'd like to use Object.fromEntries() here but Node.js 10 does not support it
  for (const entry of result.searchParams.entries()) {
    config[entry[0]] = entry[1]
  }

  config.user = config.user || decodeURIComponent(result.username)
  config.password = config.password || decodeURIComponent(result.password)

  if (result.protocol === 'socket:') {
    config.host = decodeURI(result.pathname)
    config.database = result.searchParams.get('db')
    config.client_encoding = result.searchParams.get('encoding')
    return config
  }

  if (multihosts.length > 1) {
    const hosts = []
    const ports = []
    for (const hostname of multihosts) {
      const [host, port] = hostname.split(':')
      hosts.push(host)
      ports.push(port)
    }
    config.host = hosts.join(',')
    config.port = ports.join(',')
  }

  const hostname = dummyHost ? '' : result.hostname
  if (!config.host) {
    // Only set the host if there is no equivalent query param.
    config.host = decodeURIComponent(hostname)
  } else if (hostname && /^%2f/i.test(hostname)) {
    // Only prepend the hostname to the pathname if it is not a URL encoded Unix socket host.
    result.pathname = hostname + result.pathname
  }
  if (!config.port) {
    // Only set the port if there is no equivalent query param.
    config.port = result.port
  }

  const pathname = result.pathname.slice(1) || null
  config.database = pathname ? decodeURI(pathname) : null

  if (config.ssl === 'true' || config.ssl === '1') {
    config.ssl = true
  }

  if (config.ssl === '0') {
    config.ssl = false
  }

  if (config.sslcert || config.sslkey || config.sslrootcert || config.sslmode) {
    config.ssl = {}
  }

  // Only try to load fs if we expect to read from the disk
  const fs = config.sslcert || config.sslkey || config.sslrootcert ? require('fs') : null

  if (config.sslcert) {
    config.ssl.cert = fs.readFileSync(config.sslcert).toString()
  }

  if (config.sslkey) {
    config.ssl.key = fs.readFileSync(config.sslkey).toString()
  }

  if (config.sslrootcert) {
    config.ssl.ca = fs.readFileSync(config.sslrootcert).toString()
  }

  switch (config.sslmode) {
    case 'disable': {
      config.ssl = false
      break
    }
    case 'prefer':
    case 'require':
    case 'verify-ca':
    case 'verify-full': {
      break
    }
    case 'no-verify': {
      config.ssl.rejectUnauthorized = false
      break
    }
  }

  return config
}

module.exports = parse

parse.parse = parse
