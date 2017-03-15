/*jslint node: true */

/*


 Applies the privacy algorithm metadata inside the provision to the passed
 in graph returning the output graph.

 It will also
  - fetch the obfuscation service metadata - for now uses the local
    OS defined in the privacy agent, in future could use one specified in the
    privacy algorithm.
  - fetch the encrypt key metadata - this is the one in the privacy action instance
  - Note does NOT Fetch the KMS as for now not needed as only using a test key and embedded
    in the PAI, in future will need to go to KMS to get

*/

const assert = require('assert');
const JSONLDUtils = require('jsonld-utils/lib/jldUtils').npUtils;
const PNDataModel = require('data-models/lib/PNDataModel');
const PN_P = PNDataModel.PROPERTY;
const promiseEKMD = require('connector-utils/md-utils/lib/promiseEKMD').execute;
const promiseOS = require('connector-utils/md-utils/lib/promiseOS').execute;
const PSIExecutorFactory = require('./psiExecutor');
const util = require('util');

/**
   @param serviceCtx object
   @param pa the md of the privacy agent the action is happening in
   @param provision the provision containing the privacy algorithm parts that need to be executed here
   @param inputGraph the @graph to apply the pa to, if not a @graph it will make one
   @param msgId a log message id
   @param msgAction a log messsage message
   @param props.osId the is of any local obfuscation service that should be used
   @return if ok resolves with the @graph otherwise reject with the error
*/
function execute(serviceCtx, privacyAgent, provision, inputGraph, msgId, msgAction, props) {
  'use strict';
  assert(serviceCtx, 'promiseDeobfuscate - serviceCtx param missing');
  assert(privacyAgent, 'promiseDeobfuscate - privacyAgent param missing');
  assert(provision, 'promiseDeobfuscate - provision param missing');
  assert(inputGraph, 'promiseDeobfuscate - inputGraph param missing');
  assert(msgId, 'promiseDeobfuscate - msgId param missing');
  assert(msgAction, 'promiseDeobfuscate - msgAction param missing');
  assert(props, 'promiseDeobfuscate - msgAction param missing');

  const loggingMD = {
          ServiceType: serviceCtx.name,
          FileName: 'connector-utils/pstepi-executor/promiseDeobfuscate', };

  serviceCtx.logger.logJSON('info', { serviceType: serviceCtx.name,
                                action: msgAction + '-Applying-Provision',
                                msgId: msgId,
                                privacyAgent: privacyAgent['@id'],
                                provision: provision['@id'], }, loggingMD);

  let privacyStepI = provision[PN_P.provisionedMetadata];
  serviceCtx.logger.logJSON('info', { serviceType: serviceCtx.name,
                                action: msgAction + '-Applying-Provision-Privacy-Step',
                                msgId: msgId,
                                privacyAgent: privacyAgent['@id'],
                                provision: provision['@id'],
                                metadata: privacyStepI, }, loggingMD);

  // determine the obfuscation service ID, this is just the default from the PA metadata
  let osId = JSONLDUtils.getId(privacyAgent, PN_P.obfuscationService);

  //----
  // determine the privacy step instance to apply, note currently only support one privacy action in a step
  //-----
  assert((privacyStepI[PN_P.privacyActionInstance].length === 1),
          util.format('provision privacy step should have 1 and only 1 privacy action instance:%j', privacyStepI));
  let pai = privacyStepI[PN_P.privacyActionInstance][0];

  //---
  // determine the encrypt key to use, note only handle content encrypt key not a key encrypt key
  //----
  assert(!pai[PN_P.keyEncryptKeyMD],
          util.format('need to add code to support key encrypt key md:%j', pai));

  assert(pai[PN_P.contentEncryptKeyMD],
                  util.format('FIXME - pai does not have a content key encrypt md:%j', pai));

  let cEKMDId = JSONLDUtils.getId(pai, PN_P.contentEncryptKeyMD);

  serviceCtx.logger.logJSON('info', { serviceType: serviceCtx.name,
                                action: msgAction + '-Applying-Provision-OSId-and-EKMDId',
                                msgId: msgId,
                                privacyAgent: privacyAgent['@id'],
                                provision: provision['@id'],
                                privacyStepI: privacyStepI['@id'],
                                privacyActionI: pai['@id'],
                                OSId: osId,
                                contentEKMDId: cEKMDId, }, loggingMD);

  let requestCtx = {};

  //
  // Fetch the OS
  //
  return promiseOS(serviceCtx, osId, msgId, msgAction)
    .then(function (OSmd) {
      requestCtx.OSmd = OSmd.OS;
      return;
    })
    .then(function () {
      //
      // Fetch the Encrypt Key
      //
      return promiseEKMD(serviceCtx, cEKMDId, msgId, msgAction)
        .then(function (ekmd) {
          requestCtx.contentEncryptKeyMD = ekmd.EKMD;
          return;
        });
    })
    .then(function () {
      //
      // Apply provision to the input graph
      //
      let psiExecutor = PSIExecutorFactory.create();

      // make sure passing a graph
      let data2Process;
      if (inputGraph['@graph']) {
        data2Process = inputGraph;
      } else {
        data2Process = { '@graph': inputGraph, };
      }

      return psiExecutor.execute(serviceCtx,
                    { msgId: msgId, psi: privacyStepI,
                      graph: data2Process,
                      os: requestCtx.OSmd, cekmd: requestCtx.contentEncryptKeyMD, })
        .then(function (resultGraph) {

          serviceCtx.logger.logProgress(
            util.format('%s - Applying-Provision: %s COMPLETED EXECUTING PROVISIONED PRIVACY STEP:%s',
                        msgAction, msgId, privacyStepI['@id']));

          serviceCtx.logger.logJSON('info', { serviceType: serviceCtx.name,
                                              action: msgAction + '-Applying-Provision-COMPLETED-OK',
                                              msgId: msgId,
                                              data: resultGraph, }, loggingMD);

          return resultGraph;
        });
    })
    .catch(function (reason) {
      serviceCtx.logger.logJSON('error', { serviceType: serviceCtx.name,
                                      action:  msgAction + 'Applying-Provision-UNEXPECTED-ERROR',
                                      msgId: msgId,
                                      error: reason, }, loggingMD);
      throw reason;
    });

}

module.exports = {
  execute: execute,
};
