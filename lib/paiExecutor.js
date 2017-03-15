/*jslint node: true, vars: true */

const assert = require('assert');
const JSONLDUtils = require('jsonld-utils/lib/jldUtils').npUtils;
const eitemUtils = require('./eitemUtils');
const PNDataModel = require('data-models/lib/PNDataModel');
const PN_P = PNDataModel.PROPERTY;
const PN_T = PNDataModel.TYPE;
const v2Encrypt = require('./osw/v2Encrypt');
const v2Decrypt = require('./osw/v2Decrypt');
const loggingMD = {
        ServiceType: 'connector-utils/pstepi-executor/paiExecutor',
        FileName: 'paiExecutor.js', };
const util = require('util');

let promises = {};
let callbacks = {};

/*

If an obfuscate operation then returns an array of privacy graphs, one for each source graph passed in
see step executor for explaination

*/

// props.graph - can be either a { @graph: []}, or a single object {}
promises.execute = function promiseExecute(serviceCtx, props) {
  'use strict';
  return new Promise(function (resolve, reject) {
    callbacks.execute(serviceCtx, props, function (err, result) {
      if (err) {
        reject(err);
      } else {
        resolve(result);
      }
    });
  });
};

callbacks.execute = function execute(serviceCtx, props, callback) {
  'use strict';
  assert(serviceCtx, 'pactioni-execute: serviceCtx param is missing');
  assert(props, 'pactioni-execute: props param is missing');
  assert(props.graph, 'pactioni-execute: props.graph missing');
  assert(props.pai, 'pactioni-execute: props.pai privacy action instance missing');
  assert(props.msgId, 'pactioni-execute: props.msgId missing');

  let rCtx = {};

  //
  // Uses the privacy action instance JSON schema to process the graph looking
  // for subjects and properties that needed to be obfuscated and creating the
  // items that can be sent to the obfuscation service
  //

  serviceCtx.logger.logJSON('info', { serviceType: serviceCtx.name, action: 'PAI-Executor-Privacy-Action-Instance-START',
                                      msgId: props.msgId,
                                      pai: props.pai['@id'],
                                      paiAction: props.pai[PN_P.action],
                                      pai2Deobfuscate: props.pai[PN_P.privacyActionInstance2Deobfuscate],
                                      metadata: props.pai, }, loggingMD);

  let data;
  if (props.graph['@graph']) {
    data = props.graph['@graph'];
  } else {
    data = [data];
  }

  serviceCtx.logger.logJSON('info', { serviceType: serviceCtx.name, action: 'PAI-Executor-Using-Data',
                                      msgId: props.msgId,
                                      pai: props.pai['@id'],
                                      paiAction: props.pai[PN_P.action],
                                      pai2Deobfuscate: props.pai[PN_P.privacyActionInstance2Deobfuscate],
                                      data: data, }, loggingMD);

  // get the schema to procss, note the schema is stored as a string otherwise
  // jsonld process of the node would remove items as not json-ld compliant.
  let schemaS = JSONLDUtils.getO(props.pai, PN_P.schema);
  let schema;

  if (typeof schemaS === 'string') {
    try {
      schema = JSON.parse(schemaS);
    } catch (err) {
      serviceCtx.logger.logJSON('error', { serviceType: serviceCtx.name, action: 'PAI-Executor-ERROR-Parsing-Schema-From-String',
                                          msgId: props.msgId,
                                          pai: props.pai['@id'],
                                          paiAction: props.pai[PN_P.action],
                                          pai2Deobfuscate: props.pai[PN_P.privacyActionInstance2Deobfuscate],
                                          schema: schemaS,
                                          errror: err, }, loggingMD);
      throw err;
    }
  } else {
    schema = schemaS;
  }

  //
  // Create the set of eitems that need to be passed to the obfuscation service
  //
  let promiseItems = eitemUtils.promises.mapData2EncryptItems(serviceCtx, data, schema, props.pai, props);

  // call the obfuscation service to either encrypt or decrypt the items
  let promiseResultFromOS = promiseItems
    .then(function (makeItemsResult) {

      rCtx.makeItemsResult = makeItemsResult;

      switch (props.pai[PN_P.action]) {

        case PN_T.Obfuscate: {
          //
          // call the obfuscation service -
          // for now hardcoded to call v2 and pass none of required params only so ca get up and runnung
          //
          return v2Encrypt.execute(serviceCtx, rCtx.makeItemsResult.eitems, props);
        }

        case PN_T.Deobfuscate: {
          //
          // call the obfuscation service -
          // for now hardcoded to call v2 and pass none of required params only so ca get up and runnung
          //
          return v2Decrypt.execute(serviceCtx, rCtx.makeItemsResult.eitems, props);
        }

        default: {
          assert(false, util.format('unknown pai action type:%j', props.pai));
        }
      }
    });

  let promiseGraphs = promiseResultFromOS
    .then(function (encryptedOitems) {
      //
      // reconstruct the JSONLD graphs based on the results from the obfuscation service
      // these may or maynot be privacy graphs
      //
      return eitemUtils.promises.createNodesBasedOnEitemMap(
                serviceCtx, encryptedOitems['@graph'],
                rCtx.makeItemsResult.eitemsMap, data, props.pai, props);
    });

  // return the graphs
  promiseGraphs
    .then(function (graphs) {

      serviceCtx.logger.logJSON('info', { serviceType: serviceCtx.name, action: 'PAI-Executor-Privacy-Action-Instance-COMPLETE-OK',
                                          msgId: props.msgId,
                                          pai: props.pai['@id'],
                                          paiAction: props.pai[PN_P.action],
                                          pai2Deobfuscate: props.pai[PN_P.privacyActionInstance2Deobfuscate],
                                          privacyGraphCount: graphs.privacyGraphs.length, }, loggingMD);

      return callback(null, { '@graph': graphs.privacyGraphs }); // note this may or may not be a pg

    })
    .catch(function (err) {

      serviceCtx.logger.logJSON('error', { serviceType: serviceCtx.name, action: 'PAI-Executor-ERROR',
                                          msgId: props.msgId,
                                          pai: props.pai['@id'],
                                          paiAction: props.pai[PN_P.action],
                                          pai2Deobfuscate: props.pai[PN_P.privacyActionInstance2Deobfuscate],
                                          error: err, }, loggingMD);

      throw err;

    });
};

module.exports = {
  callbacks: callbacks,
  promises: promises,
};
