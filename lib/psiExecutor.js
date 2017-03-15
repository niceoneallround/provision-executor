/*jslint node: true, vars: true */

/*

The Privacy Step executor applies any contained Privacy Actions to the passed in
@graph of data. In this process it may invoke KMS and Obfuscation Services.

The key is designed to be shared across all Privacy Agents, this covers the
 - Ingest Privacy Agent
 - Reference Source Privacy Agent
 - Query Privacy Agent

Inputs:
 - serviceCtx that
 - graph to obfuscate
 - Privacy Step Instance to apply

 Output:
  - Cloned graph containing obfuscated data.

Assumptions
 - only one privacy step supported for now
 - the privacy step has only one action - so no need to merge results
 - the input graph is JSONLD expanded.

EXECUTION
 1. invoke privacy action instance to get an output graph
 2. As no merging just return the output graph
*/

const assert = require('assert');
const PNDataModel = require('data-models/lib/PNDataModel');
const PN_P = PNDataModel.PROPERTY;
const util = require('util');

const loggingMD = {
        ServiceType: 'connector-utils/pstepi-executor',
        FileName: 'psiExecutor.js', };

class PSIExecutor {

  constructor(props) {
    if ((props) && (props.paiExecutor)) {
      this.paiExecutor = props.paiExecutor;
    } else {
      this.paiExecutor = require('./paiExecutor').promises;
    }
  }

  // returns a promise that executes the privacy step
  execute(serviceCtx, props) {
    assert(serviceCtx, 'serviceCtx param missing');
    assert(props, 'pstepi-execute: props param missing');
    assert(props.msgId, 'pstepi-execute: props.msgId missing');
    assert(props.psi, util.format('pstepi-execute: props.psi param is missing:%j', props));
    assert(props.graph, util.format('pstepi-execute: props.graph param is missing:%j', props));
    assert(props.os, util.format('pstepi-execute - props.os param missing:%j', props)); // if no obfuscation service
    assert(props.cekmd, util.format('pstepi-execute - props.cekmd param missing:%j', props)); // if no encrypt key

    assert((props.psi[PN_P.privacyActionInstance].length === 1),
            util.format('pstepi-execute: Can only provision a single privacy action:%j', props.psi));

    serviceCtx.logger.logJSON('info', { serviceType: serviceCtx.name, action: 'PSI-Executor-Privacy-Step-Instance-Start',
                                          msgId: props.msgId,
                                          psi: props.psi['@id'],
                                          metadata: props.psi, }, loggingMD);

    // add the privacy action instance to the props and pass on down
    props.pai = props.psi[PN_P.privacyActionInstance][0];

    // call execute pai promise
    return this.paiExecutor.execute(serviceCtx, props)
      .then(
        function (result) {
          // just return the result
          serviceCtx.logger.logJSON('info', { serviceType: serviceCtx.name, action: 'PSI-Executor-Privacy-Step-Instance-COMPLETE-OK',
                                                msgId: props.msgId,
                                                psi: props.psi['@id'],
                                                privacyGraphCount: result['@graph'].length, }, loggingMD);

          return result;
        },

        function (err) {
          serviceCtx.logger.logJSON('error', { serviceType: serviceCtx.name, action: 'PSI-Executor-Privacy-Step-Instance-ERROR',
                                                msgId: props.msgId,
                                                psi: props.psi['@id'],
                                                error: err, }, loggingMD);
          throw err;
        })
      .catch(function (err) {
        serviceCtx.logger.logJSON('error', { serviceType: serviceCtx.name, action: 'PSI-Executor-Privacy-Step-Instance-Catch-ERROR',
                                              msgId: props.msgId,
                                              psi: props.psi['@id'],
                                              error: err, }, loggingMD);
        throw err;
      });
  }

}

module.exports = {
  create: function create(props) { 'use strict'; return new PSIExecutor(props); },
};
