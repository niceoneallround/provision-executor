/*jslint node: true, vars: true */

const assert = require('assert');
const JSONLDPromises = require('jsonld-utils/lib/jldUtils').promises;
const PNDataModel = require('data-models/lib/PNDataModel');
const PN_T = PNDataModel.TYPE;
const util = require('util');

/**
 Utility routine to merge Privacy Graphsoutput from the execution of privacy step instances.
 May be able to generalize so in jsonld package but for now put here

 Across the graphs a single entity may have multiple nodes all with the same @id
 this needs to be merged into one.

 @param an object with an { '@graph' : [] }
 @return an object with a single @graph:[] contain the merged data.

*/
function promise(graph) {
  'use strict';
  assert(graph, 'promiseGraphMerge graphs param is missing');
  assert(graph['@graph'], util.format('promiseGraphMerge graph has no @graph is missing:%j', graph));

  const EMBED = true;

  return new Promise(function (resolve, reject) {

    //console.log('***Privacy Graphs to Merge:%s', JSON.stringify(graph, null, 2));

    return JSONLDPromises.frame(graph, [PN_T.PrivacyGraph], EMBED)
    .then(
      function (result) {
        return resolve(result);
      },

      function (err) {
        return reject(err);
      }
    ).
    catch(function (err) {
      throw err;
    });
  });

}

module.exports = {
  promise: promise,
};
