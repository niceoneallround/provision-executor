/*jslint node: true, vars: true */

const assert = require('assert');
const JWTUtils = require('jwt-utils/lib/jwtUtils').jwtUtils;
const ProvisionCanons = require('metadata/lib/provision').canons;
const util = require('util');

/*
  Create a canon V2 provision JWT containing a de-obfuscate privacy step instance
*/
function create(config, props) {
  'use strict';
  assert(config, 'create - no crypto param passed');
  assert(props, 'create - no props param passed');
  assert(props.privacyPipeId, util.format('create - props.privacyPipeId missing:%j', props));

  let props1 = { domainName: config.DOMAIN_NAME, hostname: config.getHostname(), privacyPipeId: props.privacyPipeId, };

  return ProvisionCanons.createDebofuscateIngestPASubjectsProvision(props1);
}

/*
  Create a canon V2 provision JWT containing a de-obfuscate privacy step instance
*/
function createJWT(config, props) {
  'use strict';
  assert(config, 'create - no crypto param passed');
  assert(props, 'create - no props param passed');
  assert(props.privacyPipeId, util.format('create - props.privacyPipeId missing:%j', props));

  let provision = create(config, props);

  return JWTUtils.signProvision(provision, config.crypto.jwt,
                            { subject: provision['@id'],
                              privacyPipe: props.privacyPipeId, });
}

module.exports = {
  create: create,
  createJWT: createJWT,
};
