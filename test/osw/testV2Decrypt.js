/*jslint node: true, vars: true */
const assert = require('assert');
const nock = require('nock');
const HttpStatus = require('http-status');
const v2Decrypt = require('../../lib/osw/v2Decrypt');
const EKMDCanons = require('metadata/lib/encryptKeyMetadata').canons;
const OSCanons = require('metadata/lib/obfuscationService').canons;
const PNOVUtils = require('data-models/lib/PNObfuscatedValue').utils;
const PSICanons = require('metadata/lib/PrivacyStepInstance').canons;
const PNDataModel = require('data-models/lib/PNDataModel');
const PN_P = PNDataModel.PROPERTY;
const should = require('should');
const testUtils = require('node-utils/testing-utils/lib/utils');
const localTestCanons = require('../utils').canons;
const util = require('util');

describe('v2Decrypt - tests', function () {
  'use strict';

  let dummyServiceCtx;
  let pstepI = PSICanons.createObfuscatePrivacyStepI({ hostname: 'hostname', domainName: 'domainName', });

  let props = {};
  props.msgId = 'msgId1';
  props.os = OSCanons.createTestObfuscationService({ hostname: 'hostname', domainName: 'domainName', });
  props.pai = pstepI[PN_P.privacyActionInstance][0]; // set to canon privacy action instance
  props.cekmd = EKMDCanons.createTestKey({ hostname: 'hostname', domainName: 'domainName', });

  //console.log(props.pai);

  let items = [];

  // the  values need to be base 64 encoded strings
  items.push(PNOVUtils.createOItem('id1', 'type1', Buffer.from('cipher-value').toString('base64'), { n: 'nonce1', }));
  items.push(PNOVUtils.createOItem('id2', 'type2', Buffer.from('cipher-value').toString('base64'), { n: 'nonce2', }));

  before(function (done) {
    let props = {};
    props.name = 'test1';
    testUtils.createDummyServiceCtx(props, function (ctx) {
      dummyServiceCtx = ctx;
      dummyServiceCtx.config = testUtils.getTestServiceConfig(
          { port: '2325',
            DOMAIN_NAME: 'test.webshield.io', });
      done();
    });
  });

  describe('1 validate create compact request', function () {

    it('1.1 should return a promise that contains the compacted request', function () {
      return v2Decrypt.utils.promiseCompactDecryptRequest(dummyServiceCtx, items, props)
        .then(function (result) {
          //console.log('*******', result);
          result.should.have.property('@context');
          result.should.have.property('id');
          result.should.have.property('type', 'DecryptRequest');
          result.should.have.property('encryption_metadata');
          result.should.have.property('items');

          result.encryption_metadata.should.have.property('id');
          result.encryption_metadata.should.have.property('type', 'EncryptMetadata');
          result.encryption_metadata.should.have.property('obfuscation_provider');
          result.encryption_metadata.should.have.property('content_obfuscation_algorithm', 'A256GCM');
          result.encryption_metadata.should.have.property('content_encrypt_key_md');
          result.encryption_metadata.should.have.property('content_encrypt_key_md_jwt');
          result.encryption_metadata.should.not.have.property('kms');

          let cekmd = result.encryption_metadata.content_encrypt_key_md;
          cekmd.should.have.property('id');
          cekmd.should.have.property('type');
          cekmd.should.have.property('raw_encrypt_key_md_type', 'jsonwebkey');
          cekmd.should.have.property('raw_encrypt_key_md');

          //console.log('*******', result.items);

          for (let i = 0; i < result.items.length; i++) {
            console.log(items[i]);
            result.items[i].should.have.property('id');
            result.items[i].should.have.property('type');
            result.items[i].should.have.property('v');
            result.items[i].should.have.property('n');
          }
        });
    }); //it 1.1
  }); // describe 1

  describe('2 execute v2Decrypt - nock out call to OS', function () {

    it('2.1 should create the request, invoke the OS, and return the results', function () {
      //
      // Nock out the call to the obfuscation service that is in the canon
      //
      nock('http://test.webshield.io')
            .log(console.log)
            .defaultReplyHeaders({ 'Content-Type': 'application/json', })
            .post('/obfuscation_service/v2/decrypt')
            .reply(HttpStatus.OK, function (uri, requestBody) {
              this.req.headers.should.have.property('content-type', 'application/json');
              uri.should.equal('/obfuscation_service/v2/decrypt');
              assert(requestBody, util.format('no request request body:%j', requestBody));

              console.log('****', requestBody);
              requestBody.should.have.property('type', 'DecryptRequest');

              // check expaned key information
              requestBody.encryption_metadata.length.should.be.equal(1);

              let cekmd = requestBody.encryption_metadata[0].content_encrypt_key_md;
              cekmd.should.have.property('id');
              cekmd.should.have.property('type');
              cekmd.should.have.property('raw_encrypt_key_md_type', 'jsonwebkey');
              cekmd.should.have.property('raw_encrypt_key_md');
              cekmd.raw_encrypt_key_md.should.have.property('kty');
              cekmd.raw_encrypt_key_md.should.have.property('alg');
              cekmd.raw_encrypt_key_md.should.have.property('k');

              return localTestCanons.decryptResponse(requestBody.items);
            });

      let promiseResult = v2Decrypt.execute(dummyServiceCtx, items, props);
      return promiseResult.then(function (result) {
        result.should.have.property('@graph');
        let items = result['@graph'];
        items.length.should.equal(2);
        items[0].should.have.property('id', 'id1');
        items[0].should.have.property('result');
        items[0].should.have.property('result', 'clear-text-cipher-value');
        items[1].should.have.property('id', 'id2');
        items[1].should.have.property('result', 'clear-text-cipher-value');
      });
    }); //it 2.1
  }); // describe 2*/

}); // describe
