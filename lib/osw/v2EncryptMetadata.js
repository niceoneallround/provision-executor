/*jslint node: true, vars: true */

let model = {};
const assert = require('assert');
const JSONLDUtils = require('jsonld-utils/lib/jldUtils');
const PNDataModel = require('data-models/lib/PNDataModel');
const PN_P = PNDataModel.PROPERTY;
const PN_T = PNDataModel.TYPE;
const util = require('util');

// create encrypt metadata that is passed to the external service

/* The compact form
  { // the header
    ‘id’: “blank node id”,
    ‘type: http://pn.schema.webshield.io/type#EncryptMetadata’,
    ‘content_obfuscation_algorithm’:
    'obfuscation_provider':
    'content_encrypt_key_md_jwt': the JWT holding the content encrypt key that is decoded in the content_encrypt_key_md
    'content_encrypt_key_md': { // a compact version of content encrypt key md
      'id':
      'type': EncryptKeyMetadata, Metadata,
      'raw_encrypt_key_md_type': jsonwebkey, json, or jwt
      'raw_encrypt_key_md': depends on type, acts as follows
        'jwt': base64 encoded value
        'json or jsonwebkey': the object // performed after the jsonld compact has occured

    }
  },
  */
model.create = function create(props) {
  'use strict';
  assert(props, 'execute - props param missing');
  assert(props.cekmd, util.format('execute - props.cekmd param missing:%j', props));
  assert(props.pai, util.format('execute - props.pai param missing:%j', props));

  let md = {};
  md = JSONLDUtils.createBlankNode({ '@type': PN_T.EncryptMetadata, });
  md[PN_P.contentObfuscationAlgorithm] = props.pai[PN_P.contentObfuscationAlgorithm];
  md[PN_P.obfuscationProvider] = props.pai[PN_P.obfuscationProvider];
  md[PN_P.contentEncryptKeyMDJWT] = 'add code to set JWT';

  // create an expanded version that is used as convenience
  let decodedCEKMD = {
    '@id': props.cekmd['@id'],
    '@type': props.cekmd['@type'],
  };

  decodedCEKMD[PN_P.rawEncryptKeyMDType] = props.cekmd[PN_P.rawEncryptKeyMDType];
  decodedCEKMD[PN_P.rawEncryptKeyMD] = props.cekmd[PN_P.rawEncryptKeyMD];
  md[PN_P.contentEncryptKeyMD] = decodedCEKMD;

  return md;

};

//
// compactEMD - the jsonld compact representation of the encrypt metadata
//
// As a convenience if the raw_encrypt_key_md is a JSON or JSONWebKey type then
// expand it for the caller, need to do here to ensure compact does not remove
// any non URL props or types
//
model.addUnpackedContentEncryptKey = function addUnpackedContentEncryptKey(compactEMD) {
  'use strict';
  assert(compactEMD, 'addUnpackedContentEncryptKey compactEMD param is missing');

  let cemkd = compactEMD.content_encrypt_key_md;
  switch (cemkd.raw_encrypt_key_md_type.toLowerCase()) {

    case 'jsonwebkey':
    case 'json': {
      // docode the base64 string into a JSON object
      let v = cemkd.raw_encrypt_key_md;
      let js = Buffer.from(v, 'base64').toString();
      let jo = JSON.parse(js);
      cemkd.raw_encrypt_key_md = jo;
      break;
    }

    default: {
      // just pass thru the raw encrypt key metadata base64 as is do not convert to a json
      // object
      break;
    }
  }
};

module.exports = {
  create: model.create,
  addUnpackedContentEncryptKey: model.addUnpackedContentEncryptKey,
};
