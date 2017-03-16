/*jslint node: true, vars: true */

const assert = require('assert');
const JSONLDPromises = require('jsonld-utils/lib/jldUtils').promises;
const PNDataModel = require('data-models/lib/PNDataModel');
const PN_T = PNDataModel.TYPE;

/**
 Utility routine to merge Privacy Graphsoutput from the execution of privacy step instances.
 May be able to generalize so in jsonld package but for now put here

 Across the graphs a single entity may have multiple nodes all with the same @id
 this needs to be merged into one.

 @param an object with an @graph that contains an array of objects of the from { @graph: [] }
 @return an object with a single @graph:[] contain the merged data.

*/
function promise(graph) {
  'use strict';
  assert(graph, 'promiseGraphMerge graphs param is missing');

  const EMBED = true;

  return new Promise(function (resolve, reject) {
    let graphs = graph['@graph'];
    let allPrivacyNodes = [];

    for (let i = 0; i < graphs.length; i++) {
      allPrivacyNodes = allPrivacyNodes.concat(graphs[i]['@graph']);
    }

    let doc = { '@graph': allPrivacyNodes, };

    console.log(doc);

    console.log('***Privacy Graphs to Merge:%s', JSON.stringify(doc, null, 2));

    return JSONLDPromises.frame(doc, [PN_T.PrivacyGraph], EMBED)
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
