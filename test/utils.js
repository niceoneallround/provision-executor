/*

Contains model information used only by the wrapper to simplify calling
external services

*/

let canons = {};

// creates a canon response from passed in items
canons.encryptResponse = function encryptResponse(inputItems) {
  'use strict';

  let canonRsp = {
    id: '_:1',
    type: 'EncryptResponse',
    responding_to: 'response-id',
    items: [], };

  for (let j = 0; j < inputItems.length; j++) {
    canonRsp.items.push({
      id: inputItems[j].id,
      type: inputItems[j].type,
      v: Buffer.from('cipher-' + j).toString('base64'),
    });
  }

  return canonRsp;

};

// creates a canon response from passed in items
canons.decryptResponse = function decryptResponse(inputItems) {
  'use strict';

  let canonRsp = {
    id: '_:1',
    type: 'DecryptResponse',
    responding_to: 'response-id',
    items: [], };

  for (let j = 0; j < inputItems.length; j++) {
    let stringV =  Buffer.from(inputItems[j].v, 'base64').toString(); // convert input value to string
    canonRsp.items.push({
      id: inputItems[j].id,
      type: inputItems[j].type,
      v: Buffer.from('clear-text-' + stringV).toString('base64'),
    });
  }

  return canonRsp;

};

module.exports = {
  canons: canons,
};
