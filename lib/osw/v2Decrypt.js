/*jslint node: true, vars: true */

/*

Returns a promise containing the decrypted items after calling a v2 protocol deecrypt
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

The DECRYPT REQUEST sent to the External Obfuscation Service - created from past in values
{  // The compact jsonld context
  '@context': 'JSON LD context',
  'id': ‘ a request id’,
  'type': DecryptRequest,
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

DECRYPT RESPONSE from the External Obfuscation Service
{
  'id': ‘ a response id’,
  'type': 'DecryptResponse',
  'responding_to': the request that was responding to
  // Array of items, there is one item corresponding to each item passed in on ecnrypt request
  // id - the passed in id
  // type - the passed in type
  // v - the decrypted value
  //
  //
  'items':
  [
    { ‘id’ : ‘an id', ‘type’: ‘md @id’, ‘v’ : base64(bytes[]) },
    { ‘id’ : ‘an id',   ‘type’: ‘md @id’, ‘v’ : base64(bytes[], ) }
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

  serviceCtx.logger.logJSON('info', { serviceType: serviceCtx.name, action: 'v2Decrypt-Start',
                                      msgId: props.msgId, }, loggingMD);

  let promiseDecryptResult = utils.promiseCompactDecryptRequest(serviceCtx, items, props)
    .then(function (compactRequest) {

      serviceCtx.logger.logJSON('info', { serviceType: serviceCtx.name, action: 'v2Decrypt-Created-Decrypt-Request',
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

      serviceCtx.logger.logJSON('info', { serviceType: serviceCtx.name, action: 'v2Decrypt-Created-Encrypt-Request-Post-Expand-Raw',
                                          msgId: props.msgId,
                                          data: compactRequest, }, loggingMD);

      //
      // Invoke the obfuscation service to encrypt the items
      //
      let postProps = {};
      postProps.url = JSONLDUtilsNp.getV(props.os, PN_P.deobfuscateEndpoint);
      postProps.json = compactRequest;

      serviceCtx.logger.logProgress(util.format('POST DecryptRequest to Obfuscation Service:%s', postProps.url));

      return requestWrapperPromises.postJSON(postProps);
    });

  // process the result from the obfuscation service
  return promiseDecryptResult
    .then(
      function (response) {

        serviceCtx.logger.logJSON('info', { serviceType: serviceCtx.name, action: 'v2Decrypt-Response-From-Encryption-Service',
                                            msgId: props.msgId,
                                            data: response.body, }, loggingMD);

        // create the response items
        let body = JSON.parse(response.body);
        let items = body.items;
        let eItems = [];
        for (let i = 0; i < items.length; i++) {
          // the result is decrypted value that for now is assumed to be a string that is repesented as a base64(byte[])
          // so need to convert back into a string. Note can look at the Schema to determine the actual type
          eItems.push({
            id: items[i].id,
            result: Buffer.from(items[i].v, 'base64').toString(),
          });
        }

        serviceCtx.logger.logJSON('info', { serviceType: serviceCtx.name, action: 'v2Decrypt-End',
                                            msgId: props.msgId,
                                            data: eItems, }, loggingMD);

        return { '@graph': eItems, };
      },

    function (err) {
      // error calling encrypt
      serviceCtx.logger.logJSON('error', { serviceType: serviceCtx.name, action: 'v2Decrypt-Error-Calling-Encryption-Service',
                                          msgId: props.msgId,
                                          err: err, }, loggingMD);
      throw err;
    });
};

//---------------------
// Utils
//----------------------

//
// create eitems that are sent to the service
//
// The information is represented as follows
//
// value - base64(byte[])
// nonce - base64(byte[])
// aad - base64(byte[])
//
//
//   The jsonld compact format of external items is the following, this returns the expanded version
//
// { ‘id’ : ‘an id', ‘type’: ‘http://.../md-1’, ‘v’ : base64(bytes[]) , n: base64(bytes[], aad: base64(bytes[]},
//
utils.createItems = function createItems(items, encryptMetadata) {
  'use strict';

  let result = [];
  for (let i = 0; i < items.length; i++) {

    assert(items[i].v, util.format('createItems does not have a value?:%j', items[i]));

    let ei = { '@id': items[i].id, '@type': encryptMetadata['@id'], };

    // The encrypted value is already in base64 format so just add
    ei[PN_P.v] = items[i].v;

    // if a nonce add it, note it is already is in base64 format
    if (!_.isNil(items[i].n)) {
      ei[PN_P.n] = items[i].n;
    }

    // if an aad add it, note it is already is in base64 format
    if (!_.isNil(items[i].aad)) {
      ei[PN_P.aad] = items[i].aad;
    }

    result.push(ei);
  }

  return result;
};

utils.promiseCompactDecryptRequest = function promiseCompactDecryptRequest(serviceCtx, items, props) {
  'use strict';
  assert(serviceCtx, 'promiseCompactDecryptRequest serviceCtx param missing');
  assert(items, 'promiseCompactDecryptRequest items param missing');
  assert(props, 'promiseCompactDecryptRequest props param missing');

  let eRequest = JSONLDUtils.createBlankNode({ '@type': PN_T.DecryptRequest, });

  //
  // Create the external encryptMetadata that needs to be sent to the external service
  // these are blank nodes created just for this call
  //
  eRequest[PN_P.encryptionMetadata] = v2EncryptMetadata.create(props);

  //
  // Create the external item information from the passed in items and set
  // type to the newley created encrypt metadata. Reuse the id so can link back
  //
  eRequest[PN_P.items2] = utils.createItems(items, eRequest[PN_P.encryptionMetadata]);

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
                  action: 'v2Decrypt-ERROR-COMPACTING-V2Decrypt-Request',
                  msgId: props.msgId,
                  data: { data2Compact: eRequest,  // note break out all the data so can see it
                          contextUsed: encryptJSONLDContext, },
                  error: err, }, loggingMD);
      throw err;
    });
};

module.exports = {
  execute: utils.execute,
  utils: utils, // expose so can test
};
