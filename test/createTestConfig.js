/*jslint node: true, vars: true */

//
// Utilities to help testing
//
const configFactory = require('connector-utils/config/lib/configFactory');
const localTestConstants = require('./constants').CONSTANTS;
const fs = require('fs');

function create(overrides) {
  'use strict';

  let file = '../files/default-config.yaml'; // default in image

  let configFile = readfile(file);
  let serviceName = 'testing';
  let c = configFactory.createFromYAML(configFile, serviceName);

  c.HOSTNAME = 'localhost';

  // fixup the API GATEWAY
  c.api_gateway.url = localTestConstants.API_GATEWAY_URL;
  c.API_GATEWAY_URL = localTestConstants.API_GATEWAY_URL;

  if (overrides) {
    if (overrides.LISTEN_PORT) {
      c.LISTEN_PORT = overrides.LISTEN_PORT;
    }
  }

  return c;
}

// convenice routine for reading file
function readfile(path) {
  'use strict';
  return fs.readFileSync(__dirname + '/' + path).toString();
}

module.exports = {
  create: create,
};
