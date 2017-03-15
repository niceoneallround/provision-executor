/*jslint node: true, vars: true */
const v2EncryptMetadata = require('../../lib/osw/v2EncryptMetadata');
const EKMDCanons = require('metadata/lib/encryptKeyMetadata').canons;
const encryptJSONLDContext = require('../../lib/osw/model').model.encrypt.v2.jsonldContext;
const JSONLDUtils = require('jsonld-utils/lib/jldUtils').npUtils;
const JSONLDPromises = require('jsonld-utils/lib/jldUtils').promises;
const PSICanons = require('metadata/lib/PrivacyStepInstance').canons;
const PNDataModel = require('data-models/lib/PNDataModel');
const PN_P = PNDataModel.PROPERTY;
const PN_T = PNDataModel.TYPE;
const should = require('should');
const util = require('util');

describe('v2EncryptMetadata - tests', function () {
  'use strict';

  let pstepI = PSICanons.createObfuscatePrivacyStepI({ hostname: 'hostname', domainName: 'domainName', });

  let props = {};
  props.msgId = 'msgId1';
  props.pai = pstepI[PN_P.privacyActionInstance][0]; // set to canon privacy action instance
  props.cekmd = EKMDCanons.createTestKey({ hostname: 'hostname', domainName: 'domainName', });

  //console.log(props.pai);

  describe('1 validate create compact request', function () {

    it('1.1 should return have valid fields', function () {

      let md = v2EncryptMetadata.create(props);
      md.should.have.property('@id');
      md.should.have.property('@type');
      JSONLDUtils.isType(md, PN_T.EncryptMetadata).should.be.equal(true, util.format('not a PN_T.EncryptMetadata:%j', md));
      md.should.have.property(PN_P.obfuscationProvider, props.pai[PN_P.obfuscationProvider]);
      md.should.have.property(PN_P.contentObfuscationAlgorithm, 'A256GCM');
      md.should.have.property(PN_P.contentEncryptKeyMD);
      md.should.have.property(PN_P.contentEncryptKeyMDJWT);
      md.should.not.have.property(PN_P.kms);
    }); //it 1.1

    it('1.2 encrypt metadata should compact correctly', function () {

      let md = v2EncryptMetadata.create(props);
      return JSONLDPromises.compact(md, encryptJSONLDContext)
        .then(function (compacted) {
          compacted.should.have.property('id');
          compacted.should.have.property('type', 'EncryptMetadata');
          compacted.should.have.property('obfuscation_provider');
          compacted.should.have.property('content_obfuscation_algorithm', 'A256GCM');
          compacted.should.have.property('content_encrypt_key_md');
          compacted.should.have.property('content_encrypt_key_md_jwt');
          compacted.should.not.have.property('kms');

        });
    }); //it 1.2
  }); // describe 1

  describe('2 validate that unpacked content encrytion key looks correct', function () {

    it('2.2 should add an unpacked content encryption key to a compacted encrypt metadata', function () {

      let md = v2EncryptMetadata.create(props);
      return JSONLDPromises.compact(md, encryptJSONLDContext)
        .then(function (compactEMD) {
          v2EncryptMetadata.addUnpackedContentEncryptKey(compactEMD);

          // note the test key is of this format - not generic
          let cekmd = compactEMD.content_encrypt_key_md;
          cekmd.should.have.property('raw_encrypt_key_md');
          cekmd.raw_encrypt_key_md.should.have.property('alg', 'AES_256');
          cekmd.raw_encrypt_key_md.should.have.property('k');
          cekmd.raw_encrypt_key_md.should.have.property('kty', 'oct');
        });
    }); //it 2.1
  }); // describe 2

}); // describe
