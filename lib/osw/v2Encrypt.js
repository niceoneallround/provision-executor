/*jslint node: true, vars: true */

/*

Returns a promise containing the encrypted items after calling a v2 protocol encrypt
service. In the following format

{ '@graph': [
  { id: 'passed in id', result: the PN obfuscated Value  }
]}

Performs the following
  - creates message
  - invokes services
  - passes back result

The V2 Protocol request is of the following format

//
// assume a @context
//

The ENCRYPT REQUEST sent to the External Obfuscation Service - created from past in values
{  // The compact jsonld context
  '@context': 'JSON LD context',
  'id': ‘ a request id’,
  'type': EncryptRequest,
  'encryption_metadata'[ <encrypt metadata>]
  // Array of items to encrypt, each item has the following fields
  // id - id for the field, in future will be opaque. This is passed back in the response
  // type - the encrypt metadata that should be used - indicates what encryption to use and the key to use
  // v - the value to encrypt
  // n - optional - if passed in the service should use as the randominess to add
  // aad - optional - if passed in the service should uses as the additional authenticaiton data
  //
  'items':
  [
    { ‘id’ : ‘an id', ‘type’: ‘http://.../md-1’, ‘v’ : base64(bytes[]) , n: base64(bytes[], aad: base64(bytes[]},
    { ‘id’ : ‘an id',   ‘type’: ‘http://..../md-1’, ‘v’ : base64(bytes[], n: base64(bytes[], aad: base64(bytes[]) }
  ]
}


//
// Assume an @context to make json-ld
//

ENCRYPT RESPONSE from the External Obfuscation Service
{
  'id': ‘ a response id’,
  'type': 'EncryptResponse',
  'responding_to': the request that was responding to
  // Array of items, there is one item corresponding to each item passed in on ecnrypt request
  // id - the passed in id
  // type - the passed in type
  // v - the encrypted value
  // n - optional - if used the one passed in or created a new one this should be returned here
  // aad - optional - if used the one passed in or created a new one this should be returned here
  //
  'items':
  [
    { ‘id’ : ‘an id', ‘type’: ‘md @id’, ‘v’ : base64(bytes[]) , n: base64(bytes[], aad: base64(bytes[]},
    { ‘id’ : ‘an id',   ‘type’: ‘md @id’, ‘v’ : base64(bytes[], n: base64(bytes[], aad: base64(bytes[]) }
  ]
}

*/

const assert = require('assert');
const loggingMD = {
        ServiceType: 'connector-utils/pstepi-executor/osw',
        FileName: 'v2Encrypt.js', };
const JSONLDPromises = require('jsonld-utils/lib/jldUtils').promises;
const JSONLDUtils = require('jsonld-utils/lib/jldUtils');
const JSONLDUtilsNp = require('jsonld-utils/lib/jldUtils').npUtils;
const encryptJSONLDContext = require('./model').model.encrypt.v2.jsonldContext;
const PNDataModel = require('data-models/lib/PNDataModel');
const PN_P = PNDataModel.PROPERTY;
const PN_T = PNDataModel.TYPE;
const PNOVUtils = require('data-models/lib/PNObfuscatedValue').utils;
const requestWrapperPromises = require('node-utils/requestWrapper/lib/requestWrapper').promises;
const util = require('util');
const v2EncryptMetadata = require('./v2EncryptMetadata');
const _ = require('lodash');

let utils = {};

//
// serviceCtx
// items an array of OItems
// props.os - the obfuscation service pn resource
// props.cekmd - content encrypt key metadata
// props.pai - privacy action instance
//
// returns an array of {id: the one passed in, result: { PN Obfuscated Value}}
//  Note the PN Obfuscated value @value is already encoded correctly, and @type is set to passed in pai @id
//
utils.execute = function execute(serviceCtx, items, props) {
  'use strict';
  assert(serviceCtx, 'execute - serviceCtx param missing');
  assert(items, 'execute - items param missing');
  assert(props, 'execute - props param missing');
  assert(props.msgId, util.format('execute - props.msgId param missing:%j', props));
  assert(props.pai, util.format('execute - props.pai param missing:%j', props));
  assert(props.os, util.format('execute - props.os param missing:%j', props));
  assert(props.cekmd, util.format('execute - props.cekmd param missing:%j', props));

  serviceCtx.logger.logJSON('info', { serviceType: serviceCtx.name, action: 'v2Encrypt-Start',
                                      msgId: props.msgId, }, loggingMD);

  let promiseEncryptResult = model.promiseCompactEncryptRequest(serviceCtx, items, props)
    .then(function (compactRequest) {

      serviceCtx.logger.logJSON('info', { serviceType: serviceCtx.name, action: 'v2Encrypt-Created-Encrypt-Request',
                                          msgId: props.msgId,
                                          data: compactRequest, }, loggingMD);

      //
      // As a convenience if the raw_encrypt_key_md is a JSON or JSONWebKey type
      //
      v2EncryptMetadata.addUnpackedContentEncryptKey(compactRequest.encryption_metadata);

      // Compact may have converted the encryption metadata from an array to an object
      // convert so always an array for external services
      if (!Array.isArray(compactRequest.encryption_metadata)) {
        compactRequest.encryption_metadata = [compactRequest.encryption_metadata];
      }

      serviceCtx.logger.logJSON('info', { serviceType: serviceCtx.name, action: 'v2Encrypt-Created-Encrypt-Request-Post-Expand-Raw',
                                          msgId: props.msgId,
                                          data: compactRequest, }, loggingMD);

      //
      // Invoke the obfuscation service to encrypt the items
      //
      let postProps = {};
      postProps.url = JSONLDUtilsNp.getV(props.os, PN_P.obfuscateEndpoint);
      postProps.json = compactRequest;

      serviceCtx.logger.logProgress(util.format('POST EncryptRequest to Obfuscation Service:%s', postProps.url));

      return requestWrapperPromises.postJSON(postProps);
    });

  // process the result from the obfuscation service
  return promiseEncryptResult
    .then(
      function (response) {

        serviceCtx.logger.logJSON('info', { serviceType: serviceCtx.name, action: 'v2Encrypt-Response-From-Encryption-Service',
                                            msgId: props.msgId,
                                            data: response.body, }, loggingMD);

        // create the response items
        let body = JSON.parse(response.body);
        let items = body.items;
        let encryptedItems = [];
        for (let i = 0; i < items.length; i++) {
          // note assumes the values have all been base encoded already - so does nothing.
          encryptedItems.push({
            id: items[i].id,
            result: PNOVUtils.createOVFromOItem({ type: props.pai['@id'], v: items[i].v, n: items[i].n, aad: items[i].aad, }), // create Obfuscated Value
          });
        }

        serviceCtx.logger.logJSON('info', { serviceType: serviceCtx.name, action: 'v2Encrypt-End',
                                            msgId: props.msgId,
                                            data: encryptedItems, }, loggingMD);

        return { '@graph': encryptedItems, };
      },

    function (err) {
      // error calling encrypt
      serviceCtx.logger.logJSON('error', { serviceType: serviceCtx.name, action: 'v2Encrypt-Error-Calling-Encryption-Service',
                                          msgId: props.msgId,
                                          err: err, }, loggingMD);
      throw err;
    });
};

//---------------------
// Utils
//----------------------

let model = {};

//
// create encrypt items that are sent to the service
//
// The information is represented as follows
//
// value - a string in the jsonld graph, is converted into a base64(byte[])
// nonce - a byte[] is converted into a base64(byte[])
// aad - a string such as @id, is converted into a base64(byte[])
//
//
//   The jsonld compact format of external items is the following, this returns the expanded version
//
// { ‘id’ : ‘an id', ‘type’: ‘http://.../md-1’, ‘v’ : base64(bytes[]) , n: base64(bytes[], aad: base64(bytes[]},
//
model.createItems = function createItems(items, encryptMetadata) {
  'use strict';

  let result = [];
  for (let i = 0; i < items.length; i++) {

    assert(_.isString(items[i].v), util.format('createEncryptItems can only handle string values:%j', items[i]));
    assert(_.isNil(items[i].n), util.format('createEncryptItems cannot yet handle nonce:%j', items[i]));
    assert(_.isNil(items[i].aad), util.format('createEncryptItems cannot yet handle aad:%j', items[i]));

    let ei = { '@id': items[i].id, '@type': encryptMetadata['@id'], };

    // convert to base64, note kind of assumes input is a string need to look at other types
    ei[PN_P.v] = Buffer.from(items[i].v).toString('base64');

    result.push(ei);
  }

  return result;
};

model.promiseCompactEncryptRequest = function promiseCompactEncryptRequest(serviceCtx, items, props) {
  'use strict';
  assert(serviceCtx, 'promiseCompactEncryptRequest serviceCtx param missing');
  assert(items, 'promiseCompactEncryptRequest items param missing');
  assert(props, 'promiseCompactEncryptRequest props param missing');

  let eRequest = JSONLDUtils.createBlankNode({ '@type': PN_T.EncryptRequest, });

  //
  // Create the external encryptMetadata that needs to be sent to the external service
  // these are blank nodes created just for this call
  //
  eRequest[PN_P.encryptionMetadata] = v2EncryptMetadata.create(props);

  //
  // Create the external item information from the passed in items and set
  // type to the newley created encrypt metadata. Reuse the id so can link back
  //
  eRequest[PN_P.items2] = model.createItems(items, eRequest[PN_P.encryptionMetadata]);

  //
  // Compact the request as easier for parties to deal with
  //
  return JSONLDPromises.compact(eRequest, encryptJSONLDContext)
    .then(function (result) {
      return result; // if ok just return
    },

    function (err) {
      // Error processing the compact dump the necessary information
      serviceCtx.logger.logJSON('error', { serviceType: serviceCtx.name,
                  action: 'v2Decrypt-ERROR-COMPACTING-V2Encrypt-Request',
                  msgId: props.msgId,
                  data: { data2Compact: eRequest,  // note break out all the data so can see it
                          contextUsed: encryptJSONLDContext, },
                  error: err, }, loggingMD);
      throw err;
    });
};

module.exports = {
  execute: utils.execute,
  model: model, // expose so can test
};
