/*jslint node: true */

/**
  Apply multiple independent privacy step instances that have no order dependency to
  the same input graph, and merge the output graphs into a single result graph.

  The input graph does NOT need to be for the same entity, it can be a mix of
  subjects. The final merge of output graphs will merge subject data for the same
  subject into a single node.

  The output is a single cloned @graph containing only the nodes and properties
  that ARE included in the types and properties processed by the privacy step instances
  and privacy step instances.

  Today the most common example of this is when sending a set of syndicated
  entities down a deobfuscation privacy pipe. The syndicated entities may have
  been obfuscated by different Privacy Algorithms and hence when de-obfuscating
  more then one priavcy step instance needs to be applied to the syndicated
  entities to get the result.

*/

const assert = require('assert');
const JSONLDUtils = require('jsonld-utils/lib/jldUtils').npUtils;
const PNDataModel = require('data-models/lib/PNDataModel');
const PN_P = PNDataModel.PROPERTY;
const PromiseMergePrivacyGraphs = require('./promiseMergePrivacyGraphs').promise;
const promiseExecuteOneDeobfuscatePSI = require('./promiseExecuteOneDeobfuscatePSI').execute;

/**
   @param serviceCtx object
   @param pa the md of the privacy agent the action is happening in
   @param provision the provision containing the privacy algorithm parts that need to be executed here
   @param inputGraph the @graph to apply the pa to, if not a @graph it will make one
   @param msgId a log message id
   @param msgAction a log messsage message
   @param props.osId the is of any local obfuscation service that should be used
   @return if ok returns a structure as described below, otherwise throws an error
        { data: the @graph
          os: an array of the the obfuscation services used, passed back as may want to cache and re-use
        }
*/
function execute(serviceCtx, privacyAgent, provision, inputGraph, privacyPipeId, msgId, msgAction, props) {
  'use strict';
  assert(serviceCtx, 'promiseDeobfuscate - serviceCtx param missing');
  assert(privacyAgent, 'promiseDeobfuscate - privacyAgent param missing');
  assert(provision, 'promiseDeobfuscate - provision param missing');
  assert(inputGraph, 'promiseDeobfuscate - inputGraph param missing');
  assert(privacyPipeId, 'promiseDeobfuscate - privacyPipeId param missing');
  assert(msgId, 'promiseDeobfuscate - msgId param missing');
  assert(msgAction, 'promiseDeobfuscate - msgAction param missing');
  assert(props, 'promiseDeobfuscate - msgAction param missing');

  const loggingMD = {
          ServiceType: serviceCtx.name,
          FileName: 'connector-utils/pstepi-executor/promiseDeobfuscate', };

  let provisionedMD = JSONLDUtils.getArray(provision, PN_P.provisionedMetadata);
  serviceCtx.logger.logJSON('info', { serviceType: serviceCtx.name,
                                action: msgAction + '-Applying-Provision',
                                msgId: msgId,
                                privacyAgent: privacyAgent['@id'],
                                privacyPipeId: privacyPipeId,
                                provision: provision['@id'],
                                metadata: provisionedMD, }, loggingMD);

  // for testing execute in a sequence
  /*let result = { data: { '@graph': [], }, os: [] };
  return promiseExecuteOneDeobfuscatePSI(
                serviceCtx, privacyAgent,
                provision['@id'],  provisionedMD[0],
                inputGraph, msgId, msgAction, {})
  .then(function (r1) {
    console.log('\n\n****R1', r1);
    result.data['@graph'] = result.data['@graph'].concat(r1.data['@graph']);
    result.os.push(r1.os);
    return promiseExecuteOneDeobfuscatePSI(
                  serviceCtx, privacyAgent,
                  provision['@id'],  provisionedMD[1],
                  inputGraph, msgId, msgAction, {})
    .then(function (r2) {
      console.log('\n\n****R2', r2);
      result.data['@graph'] = result.data['@graph'].concat(r2.data['@graph']);
      result.os.push(r2.os);
      return result;
    });
  });*/

  let promises = [];
  for (let i = 0; i < provisionedMD.length; i++) {
    promises.push(
      promiseExecuteOneDeobfuscatePSI(
                    serviceCtx, privacyAgent,
                    provision['@id'],  provisionedMD[i],
                    inputGraph, msgId, msgAction, {})
    );
  }

  return Promise.all(promises)
  .then(
    function (results) {
      serviceCtx.logger.logJSON('info', { serviceType: serviceCtx.name,
                                    action: msgAction + '-Applying-Provision-Executed-All-Provisioned-Metadata-OK',
                                    msgId: msgId,
                                    privacyAgent: privacyAgent['@id'],
                                    privacyPipeId: privacyPipeId,
                                    provision: provision['@id'],
                                    resultsCount: results.length,
                                  }, loggingMD);

      let ret = { data: { '@graph': [], }, os: [] };
      for (let i = 0; i < results.length; i++) {
        ret.data['@graph'] = ret.data['@graph'].concat(results[i].data['@graph']);
        ret.os.push(results[i].os);
      }

      //
      // Now lets merges the graph, note this relies on them still being marked
      // as privacyt graphs for now
      //
      return PromiseMergePrivacyGraphs(ret.data)
        .then(
          function (mergedGraph) {
            serviceCtx.logger.logJSON('info', { serviceType: serviceCtx.name,
                                        action: msgAction + '-Applying-Provision-Merged-Data-Graphs-Output-From-Executing-Provisions-PROVISION-COMPLETED',
                                        msgId: msgId,
                                        privacyAgent: privacyAgent['@id'],
                                        privacyPipeId: privacyPipeId,
                                        provision: provision['@id'],
                                      }, loggingMD);
            ret.data = mergedGraph;
            return ret;
          },

          function (err) {
            serviceCtx.logger.logJSON('error', { serviceType: serviceCtx.name,
                                          action: msgAction + '-Applying-Provision-ERROR-MERGING-FINAL-DATA-GRAPHS',
                                          msgId: msgId,
                                          privacyAgent: privacyAgent['@id'],
                                          privacyPipeId: privacyPipeId,
                                          provision: provision['@id'],
                                          data: ret.data,
                                          error: err, }, loggingMD);
            throw err;

          }).
          catch(function (err) {
            serviceCtx.logger.logJSON('error', { serviceType: serviceCtx.name,
                                          action: msgAction + '-Applying-Provision-CATCH-ERROR-MERGING-FINAL-DATA-GRAPHS',
                                          msgId: msgId,
                                          privacyAgent: privacyAgent['@id'],
                                          privacyPipeId: privacyPipeId,
                                          provision: provision['@id'],
                                          data: ret.data,
                                          error: err, }, loggingMD);
            throw err;

          });
    },

    function (err) {
      serviceCtx.logger.logJSON('error', { serviceType: serviceCtx.name,
                                    action: msgAction + '-Applying-Provision-ERROR',
                                    msgId: msgId,
                                    privacyAgent: privacyAgent['@id'],
                                    privacyPipeId: privacyPipeId,
                                    provision: provision['@id'],
                                    error: err, }, loggingMD);
      throw err;

    })
    .catch(function (err) {
      serviceCtx.logger.logJSON('error', { serviceType: serviceCtx.name,
                                    action: msgAction + '-Applying-Provision-CATCH-ERROR',
                                    msgId: msgId,
                                    privacyAgent: privacyAgent['@id'],
                                    privacyPipeId: privacyPipeId,
                                    provision: provision['@id'],
                                    error: err, }, loggingMD);
      throw err;

    });
}

module.exports = {
  execute: execute,
};
